/**
 * Enrollment Management Controller — registrar-facing subject-level actions.
 *
 * These endpoints sit alongside the existing term-level enrollment flow. They
 * never rewrite a historical attempt: adding, dropping and retaking all leave
 * the records they touch intact and write an audit entry instead.
 *
 *   GET  /curriculum-suggestions          subjects the curriculum expects
 *   POST /enrollments/:id/subjects/validate   dry-run validation
 *   POST /enrollments/:id/subjects        add subjects (with override support)
 *   POST /enrollments/:id/subjects/:subjectId/drop   official drop
 *   POST /students/:id/retake             retake in a later term
 *   GET  /students/:id/academic-progress  curriculum-based evaluation
 */

const mongoose = require('mongoose');
const Student = require('../models/Student');
const Enrollment = require('../models/Enrollment');
const subjectEnrollmentService = require('../services/subjectEnrollmentService');
const curriculumProgressService = require('../services/curriculumProgressService');
const reEnrollmentVerificationService = require('../services/reEnrollmentVerificationService');
const { SEMESTERS } = require('../lib/curriculumYears');

const SCHOOL_YEAR_PATTERN = /^\d{4}-\d{4}$/;

function fail(res, error) {
  const status = error?.statusCode || 500;
  if (status >= 500) console.error(error);
  return res.status(status).json({
    success: false,
    message: error?.message || 'Request failed',
    reasonCode: error?.reasonCode || undefined,
    details: error?.details || undefined,
  });
}

function requireValidObjectId(value) {
  return mongoose.Types.ObjectId.isValid(String(value || ''));
}

function isTerminalAttempt(entry) {
  if (!entry) return false;
  if (typeof entry.grade === 'number') return true;
  if (String(entry.gradeMark || '').trim()) return true;
  const status = String(entry.status || '').trim().toLowerCase();
  return status === 'completed' || status === 'dropped' || status === 'removed';
}

function numericGrade(value) {
  if (value == null || value === '') return null;
  const grade = Number(value);
  return Number.isFinite(grade) ? grade : null;
}

/**
 * The list's grade view summarises the student's most recent term. It is
 * deliberately read-only: re-enrollment never edits a historical grade.
 */
function buildGradeSummary(history) {
  let latest = null;
  for (const enrollment of history || []) {
    if (!enrollment?.schoolYear || !enrollment?.semester) continue;
    if (!latest) {
      latest = enrollment;
      continue;
    }
    const isNewerTerm = subjectEnrollmentService.isLaterTerm(
      enrollment.schoolYear,
      enrollment.semester,
      latest.schoolYear,
      latest.semester
    );
    const sameTerm = String(enrollment.schoolYear || '').trim() === String(latest.schoolYear || '').trim()
      && String(enrollment.semester || '').trim() === String(latest.semester || '').trim();
    if (isNewerTerm || (sameTerm && String(enrollment.updatedAt || '') > String(latest.updatedAt || ''))) {
      latest = enrollment;
    }
  }

  if (!latest) {
    return {
      term: null,
      enrollmentStatus: null,
      subjects: [],
      gwa: null,
      gradedCount: 0,
      subjectCount: 0,
    };
  }

  const subjects = (latest.subjects || []).map((entry) => ({
    subjectId: String(entry.subjectId || ''),
    code: entry.code || '',
    title: entry.title || '',
    units: entry.units ?? null,
    grade: numericGrade(entry.grade),
    gradeMark: entry.gradeMark || null,
    status: entry.status || null,
  }));

  let weightedTotal = 0;
  let gradedUnits = 0;
  let gradedCount = 0;
  for (const subject of subjects) {
    if (subject.grade == null) continue;
    const units = Number(subject.units);
    const weight = Number.isFinite(units) && units > 0 ? units : 1;
    weightedTotal += subject.grade * weight;
    gradedUnits += weight;
    gradedCount += 1;
  }

  return {
    term: {
      schoolYear: latest.schoolYear,
      semester: latest.semester,
    },
    enrollmentStatus: latest.status || null,
    subjects,
    gwa: gradedUnits > 0 ? Math.round((weightedTotal / gradedUnits) * 100) / 100 : null,
    gradedCount,
    subjectCount: subjects.length,
  };
}

async function loadEnrollmentWithStudent(enrollmentId, res) {
  if (!requireValidObjectId(enrollmentId)) {
    res.status(400).json({ success: false, message: 'Invalid enrollment id' });
    return null;
  }
  const enrollment = await Enrollment.findById(enrollmentId);
  if (!enrollment) {
    res.status(404).json({ success: false, message: 'Enrollment not found' });
    return null;
  }
  const student = await Student.findById(enrollment.studentId)
    .select('studentNumber course curriculumVersion yearLevel schoolYear semester lifecycleStatus studentStatus isActive')
    .lean();
  if (!student) {
    res.status(404).json({ success: false, message: 'Student record not found' });
    return null;
  }
  return { enrollment, student };
}

class EnrollmentManagementController {
  /**
   * GET /api/registrar/curriculum-suggestions
   * The subjects the student's curriculum expects for a year level + semester.
   * For irregular students, also includes subjects from all curriculum semesters.
   */
  static async getSuggestedSubjects(req, res) {
    try {
      const programCode = Number(req.query.programCode);
      const yearLevel = Number(req.query.yearLevel);
      const semester = String(req.query.semester || '').trim();
      const curriculumVersion = String(req.query.curriculumVersion || '').trim() || null;
      const studentId = String(req.query.studentId || '').trim() || null;
      const isIrregular = String(req.query.isIrregular || 'false').toLowerCase() === 'true';

      if (!Number.isFinite(programCode) || !Number.isFinite(yearLevel)) {
        return res.status(400).json({
          success: false,
          message: 'programCode and yearLevel are required',
        });
      }
      if (!SEMESTERS.includes(semester)) {
        return res.status(400).json({
          success: false,
          message: `semester must be one of ${SEMESTERS.join(', ')}`,
        });
      }

      const result = await subjectEnrollmentService.resolveSuggestedSubjects({
        programCode,
        yearLevel,
        semester,
        curriculumVersion,
        studentId,
        isIrregular,
      });

      res.json({ success: true, data: result });
    } catch (error) {
      fail(res, error);
    }
  }

  /**
   * GET /api/registrar/re-enrollment/candidates?schoolYear=YYYY-YYYY&semester=1st
   *
   * One query for students and one for their enrollment history. A candidate
   * has no live enrollment for the target term yet and is either at the target
   * term or earlier. `retakeSubjects` contains only the latest attempt per
   * subject, so a failure that was later passed is not reported.
   */
  static async getReEnrollmentCandidates(req, res) {
    try {
      const schoolYear = String(req.query.schoolYear || '').trim();
      const semester = String(req.query.semester || '').trim();

      if (!SCHOOL_YEAR_PATTERN.test(schoolYear)) {
        return res.status(400).json({ success: false, message: 'schoolYear must be in YYYY-YYYY format' });
      }
      if (!SEMESTERS.includes(semester)) {
        return res.status(400).json({ success: false, message: `semester must be one of ${SEMESTERS.join(', ')}` });
      }

      const activeTerm = await reEnrollmentVerificationService.getActiveTerm();
      const readiness = reEnrollmentVerificationService.getRolloverReadiness({
        schoolYear,
        semester,
        activeTerm,
      });
      const meta = {
        targetTerm: { schoolYear, semester },
        activeTerm,
        rolloverReady: readiness.ready,
        rolloverMessage: readiness.message,
        rolloverReasonCode: readiness.reasonCode,
      };

      const eligibleSemesters = SEMESTERS.filter(
        (candidate) => !subjectEnrollmentService.isLaterTerm(schoolYear, candidate, schoolYear, semester)
      );

      const students = await Student.find({
        lifecycleStatus: { $ne: 'Graduated' },
        isActive: { $ne: false },
        $or: [
          { schoolYear: { $lt: schoolYear } },
          { schoolYear, semester: { $in: eligibleSemesters } },
          { schoolYear: { $in: ['', null] } },
          { schoolYear: { $exists: false } },
        ],
      })
        .select('studentNumber firstName middleName lastName suffix course curriculumVersion yearLevel section semester schoolYear studentStatus classification lifecycleStatus email contactNumber isActive')
        .sort({ studentNumber: 1 })
        .lean();

      if (!students.length) {
        return res.json({ success: true, data: [], meta });
      }

      const studentIds = students.map((student) => student._id);
      const verificationRecords = await reEnrollmentVerificationService.getVerificationsForStudents({
        studentIds,
        schoolYear,
        semester,
      });
      const enrollments = await Enrollment.find({
        studentId: { $in: studentIds },
        schoolYear: { $lte: schoolYear },
      })
        .select('studentId schoolYear semester status updatedAt subjects.subjectId subjects.code subjects.title subjects.units subjects.grade subjects.gradeMark subjects.status')
        .lean();

      const enrollmentsByStudent = new Map();
      for (const enrollment of enrollments) {
        const studentId = String(enrollment.studentId || '');
        if (!studentId) continue;
        const list = enrollmentsByStudent.get(studentId) || [];
        list.push(enrollment);
        enrollmentsByStudent.set(studentId, list);
      }

      const candidates = [];
      for (const student of students) {
        const history = enrollmentsByStudent.get(String(student._id)) || [];

        const alreadyEnrolled = history.some(
          (enrollment) => String(enrollment.schoolYear || '').trim() === schoolYear
            && String(enrollment.semester || '').trim() === semester
            && ['Enrolled', 'Pending', 'Completed', 'Retained', 'Graduated'].includes(enrollment.status)
        );
        if (alreadyEnrolled) continue;

        // Keep only the most recent attempt per subject, strictly before the
        // target term. Same-term attempts are intentionally ignored: a student
        // who just failed or dropped a subject remains Enrolled this term.
        const latestBySubject = new Map();
        for (const enrollment of history) {
          if (!subjectEnrollmentService.isLaterTerm(
            schoolYear,
            semester,
            enrollment.schoolYear,
            enrollment.semester
          )) continue;

          for (const entry of enrollment.subjects || []) {
            const subjectId = String(entry.subjectId || '').trim();
            if (!subjectId || !isTerminalAttempt(entry)) continue;
            const current = latestBySubject.get(subjectId);
            const isNewer = !current
              || subjectEnrollmentService.isLaterTerm(
                enrollment.schoolYear,
                enrollment.semester,
                current.enrollment.schoolYear,
                current.enrollment.semester
              )
              || (
                String(enrollment.schoolYear || '').trim() === String(current.enrollment.schoolYear || '').trim()
                && String(enrollment.semester || '').trim() === String(current.enrollment.semester || '').trim()
                && String(enrollment.updatedAt || '') > String(current.enrollment.updatedAt || '')
              );
            if (isNewer) {
              latestBySubject.set(subjectId, { enrollment, entry });
            }
          }
        }

        const retakeSubjects = [];
        for (const { enrollment, entry } of latestBySubject.values()) {
          if (!subjectEnrollmentService.isRetakeableAttempt(entry)) continue;
          const status = String(entry.status || '').trim();
          const mark = String(entry.gradeMark || '').trim().toUpperCase();
          const outcome = status === 'Dropped' || status === 'Removed' || mark === 'DRP'
            ? 'Dropped'
            : 'Failed';
          retakeSubjects.push({
            subjectId: String(entry.subjectId || ''),
            code: entry.code || '',
            title: entry.title || '',
            units: entry.units ?? null,
            schoolYear: enrollment.schoolYear,
            semester: enrollment.semester,
            status,
            grade: entry.grade ?? null,
            gradeMark: entry.gradeMark || null,
            outcome,
          });
        }

        candidates.push({
          ...student,
          reEnrollment: {
            targetSchoolYear: schoolYear,
            targetSemester: semester,
            needsRetake: retakeSubjects.length > 0,
            retakeSubjects,
            gradeSummary: buildGradeSummary(history),
            verification: reEnrollmentVerificationService.serializeVerification(
              verificationRecords.get(String(student._id)),
              student.email,
              student.contactNumber
            ),
            rolloverReady: readiness.ready,
            rolloverMessage: readiness.message,
          },
        });
      }

      res.json({ success: true, data: candidates, meta });
    } catch (error) {
      fail(res, error);
    }
  }

  /**
   * POST /api/registrar/re-enrollment/send-code
   * Send a six-digit verification challenge to the student's available email
   * and mobile channels. The code is never returned by this endpoint.
   */
  static async sendReEnrollmentCode(req, res) {
    try {
      const studentId = String(req.body?.studentId || '').trim();
      const schoolYear = String(req.body?.schoolYear || '').trim();
      const semester = String(req.body?.semester || '').trim();

      if (!requireValidObjectId(studentId)) {
        return res.status(400).json({ success: false, message: 'Invalid student id' });
      }
      if (!SCHOOL_YEAR_PATTERN.test(schoolYear)) {
        return res.status(400).json({ success: false, message: 'schoolYear must be in YYYY-YYYY format' });
      }
      if (!SEMESTERS.includes(semester)) {
        return res.status(400).json({
          success: false,
          message: `semester must be one of ${SEMESTERS.join(', ')}`,
        });
      }

      const student = await Student.findById(studentId)
        .select('studentNumber firstName middleName lastName suffix email contactNumber schoolYear semester')
        .lean();
      if (!student) {
        return res.status(404).json({ success: false, message: 'Student not found' });
      }

      const result = await reEnrollmentVerificationService.sendCode({
        student,
        schoolYear,
        semester,
        actorId: req.registrarId || req.adminId || null,
        returnCode: false, // Don't return code to registrar
      });

      return res.json({
        success: true,
        data: {
          maskedEmail: result.maskedEmail,
          maskedPhone: result.maskedPhone,
          expiresAt: result.expiresAt,
          verification: result.verification,
        },
      });
    } catch (error) {
      return fail(res, error);
    }
  }

  /**
   * POST /api/registrar/re-enrollment/verify-code
   * The student reads the emailed or texted code to the registrar. A successful check
   * opens a short enrollment window for that student and target term.
   */
  static async verifyReEnrollmentCode(req, res) {
    try {
      const studentId = String(req.body?.studentId || '').trim();
      const schoolYear = String(req.body?.schoolYear || '').trim();
      const semester = String(req.body?.semester || '').trim();
      const code = String(req.body?.code || '').trim();

      if (!requireValidObjectId(studentId)) {
        return res.status(400).json({ success: false, message: 'Invalid student id' });
      }
      if (!SCHOOL_YEAR_PATTERN.test(schoolYear)) {
        return res.status(400).json({ success: false, message: 'schoolYear must be in YYYY-YYYY format' });
      }
      if (!SEMESTERS.includes(semester)) {
        return res.status(400).json({
          success: false,
          message: `semester must be one of ${SEMESTERS.join(', ')}`,
        });
      }

      const student = await Student.findById(studentId).select('email contactNumber').lean();
      if (!student) {
        return res.status(404).json({ success: false, message: 'Student not found' });
      }

      const result = await reEnrollmentVerificationService.verifyCode({
        studentId,
        schoolYear,
        semester,
        code,
        studentEmail: student.email,
        studentPhone: student.contactNumber,
      });

      return res.json({
        success: true,
        data: {
          maskedEmail: result.verification.maskedEmail,
          verification: result.verification,
          verificationExpiresAt: result.verification.verificationExpiresAt,
        },
      });
    } catch (error) {
      return fail(res, error);
    }
  }

  /**
   * POST /api/registrar/enrollments/:enrollmentId/subjects/validate
   * Dry run — lets the UI report every reason before anything is written.
   */
  static async validateEnrollmentSubjects(req, res) {
    try {
      const loaded = await loadEnrollmentWithStudent(req.params.enrollmentId, res);
      if (!loaded) return;

      const subjectIds = Array.isArray(req.body?.subjectIds) ? req.body.subjectIds : [];
      if (subjectIds.length === 0) {
        return res.status(400).json({ success: false, message: 'subjectIds array is required' });
      }

      const validation = await subjectEnrollmentService.validateSubjectSelection({
        student: loaded.student,
        enrollment: loaded.enrollment,
        subjectIds,
      });

      res.json({
        success: true,
        data: {
          enrollmentId: String(loaded.enrollment._id),
          schoolYear: loaded.enrollment.schoolYear,
          semester: loaded.enrollment.semester,
          locked: Boolean(loaded.enrollment.lockedAt),
          results: validation.results,
          okIds: validation.okIds,
          failedIds: validation.failedIds,
        },
      });
    } catch (error) {
      fail(res, error);
    }
  }

  /**
   * POST /api/registrar/enrollments/:enrollmentId/subjects
   */
  static async addEnrollmentSubjects(req, res) {
    try {
      const loaded = await loadEnrollmentWithStudent(req.params.enrollmentId, res);
      if (!loaded) return;

      const subjectIds = Array.isArray(req.body?.subjectIds) ? req.body.subjectIds : [];
      if (subjectIds.length === 0) {
        return res.status(400).json({ success: false, message: 'subjectIds array is required' });
      }
      const overrideReason = String(req.body?.overrideReason || '').trim();

      const outcome = await subjectEnrollmentService.addSubjectsToEnrollment({
        enrollment: loaded.enrollment,
        student: loaded.student,
        subjectIds,
        actorId: req.adminId,
        overrideReason,
        accountType: req.accountType,
      });

      if (outcome.added.length === 0) {
        return res.status(409).json({
          success: false,
          message: 'No subjects could be added',
          reasonCode: outcome.failed[0]?.reasonCode,
          details: outcome.failed,
        });
      }

      res.status(201).json({
        success: true,
        data: {
          enrollmentId: String(loaded.enrollment._id),
          added: outcome.added,
          failed: outcome.failed,
          usedOverride: outcome.requiresOverride,
        },
        message: `${outcome.added.length} subject(s) added`
          + (outcome.failed.length > 0 ? `, ${outcome.failed.length} rejected` : ''),
      });
    } catch (error) {
      fail(res, error);
    }
  }

  /**
   * POST /api/registrar/enrollments/:enrollmentId/subjects/:subjectId/drop
   * Marks the entry Dropped. The record is preserved, never deleted.
   */
  static async dropEnrollmentSubject(req, res) {
    try {
      const loaded = await loadEnrollmentWithStudent(req.params.enrollmentId, res);
      if (!loaded) return;

      const reason = String(req.body?.reason || '').trim();
      const overrideReason = String(req.body?.overrideReason || '').trim();

      const outcome = await subjectEnrollmentService.dropSubjectFromEnrollment({
        enrollment: loaded.enrollment,
        subjectId: req.params.subjectId,
        actorId: req.adminId,
        reason,
        overrideReason,
        accountType: req.accountType,
      });

      res.json({
        success: true,
        data: {
          enrollmentId: String(loaded.enrollment._id),
          subject: outcome.entry,
        },
        message: `${outcome.entry.code} dropped — the original record is preserved`,
      });
    } catch (error) {
      fail(res, error);
    }
  }

  /**
   * POST /api/registrar/students/:id/retake
   */
  static async retakeSubject(req, res) {
    try {
      const { id } = req.params;
      if (!requireValidObjectId(id)) {
        return res.status(400).json({ success: false, message: 'Invalid student id' });
      }

      const student = await Student.findById(id)
        .select('studentNumber course curriculumVersion yearLevel schoolYear semester lifecycleStatus studentStatus isActive firstName middleName lastName')
        .lean();
      if (!student) {
        return res.status(404).json({ success: false, message: 'Student not found' });
      }

      const { subjectId, schoolYear, semester } = req.body || {};
      
      if (!subjectId || !schoolYear || !semester) {
        return res.status(400).json({
          success: false,
          message: 'subjectId, schoolYear, and semester are required',
        });
      }
      
      // Handle if subjectId is an object (extract _id if present)
      let normalizedSubjectId = subjectId;
      if (typeof subjectId === 'object' && subjectId !== null) {
        normalizedSubjectId = subjectId._id || subjectId.subjectId;
      }
      
      if (!normalizedSubjectId) {
        return res.status(400).json({
          success: false,
          message: 'subjectId is required and must be a valid identifier',
        });
      }
      
      normalizedSubjectId = String(normalizedSubjectId);
      
      if (!SCHOOL_YEAR_PATTERN.test(String(schoolYear))) {
        return res.status(400).json({ success: false, message: 'schoolYear must be in YYYY-YYYY format' });
      }
      if (!SEMESTERS.includes(semester)) {
        return res.status(400).json({ success: false, message: `semester must be one of ${SEMESTERS.join(', ')}` });
      }

      const outcome = await subjectEnrollmentService.retakeSubject({
        student,
        subjectId: normalizedSubjectId,
        schoolYear,
        semester,
        actorId: req.adminId,
        overrideReason: String(req.body?.overrideReason || '').trim(),
        accountType: req.accountType,
      });

      res.status(201).json({
        success: true,
        data: {
          enrollmentId: String(outcome.enrollment._id),
          schoolYear: outcome.enrollment.schoolYear,
          semester: outcome.enrollment.semester,
          subject: outcome.entry,
          original: {
            schoolYear: outcome.original.enrollment.schoolYear,
            semester: outcome.original.enrollment.semester,
            status: outcome.original.entry.status,
            grade: outcome.original.entry.grade ?? null,
          },
          yearLevel: student.yearLevel,
        },
        message: `Retake recorded for ${schoolYear} ${semester}`,
      });
    } catch (error) {
      fail(res, error);
    }
  }

  /**
   * GET /api/registrar/students/:id/academic-progress
   */
  static async getAcademicProgress(req, res) {
    try {
      const { id } = req.params;
      if (!requireValidObjectId(id)) {
        return res.status(400).json({ success: false, message: 'Invalid student id' });
      }

      const progress = await curriculumProgressService.getStudentProgress(id);
      res.json({ success: true, data: progress });
    } catch (error) {
      fail(res, error);
    }
  }
}

module.exports = EnrollmentManagementController;
