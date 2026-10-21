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
   */
  static async getSuggestedSubjects(req, res) {
    try {
      const programCode = Number(req.query.programCode);
      const yearLevel = Number(req.query.yearLevel);
      const semester = String(req.query.semester || '').trim();
      const curriculumVersion = String(req.query.curriculumVersion || '').trim() || null;

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
      });

      res.json({ success: true, data: result });
    } catch (error) {
      fail(res, error);
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
      if (!SCHOOL_YEAR_PATTERN.test(String(schoolYear))) {
        return res.status(400).json({ success: false, message: 'schoolYear must be in YYYY-YYYY format' });
      }
      if (!SEMESTERS.includes(semester)) {
        return res.status(400).json({ success: false, message: `semester must be one of ${SEMESTERS.join(', ')}` });
      }

      const outcome = await subjectEnrollmentService.retakeSubject({
        student,
        subjectId,
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
