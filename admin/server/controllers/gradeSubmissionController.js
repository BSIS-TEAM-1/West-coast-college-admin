const mongoose = require('mongoose');
const Enrollment = require('../models/Enrollment');
const GradeAuditLog = require('../models/GradeAuditLog');
const GradeChangeRequest = require('../models/GradeChangeRequest');
const TransmutationTable = require('../models/TransmutationTable');
const StudentBlockAssignment = require('../models/StudentBlockAssignment');
const BlockSection = require('../models/BlockSection');
const BlockSubjectAssignment = require('../models/BlockSubjectAssignment');
const Student = require('../models/Student');
const StudentNotification = require('../models/StudentNotification');
const SystemSetting = require('../models/SystemSetting');
const gradingScaleService = require('../services/gradingScaleService');
const studentLifecycleService = require('../services/studentLifecycleService');
const { assertSchoolYearWritable } = require('../services/schoolYearLockService');

async function evaluateLifecycleAfterGradeChange({ enrollment, actorId, accountType, source }) {
  if (!enrollment?.studentId) return null;
  try {
    // Every finalized grade write (publication and approved correction) goes
    // through the one centralized evaluator. Drafts, submissions, and
    // verifications never reach it.
    return await studentLifecycleService.evaluateStudentAcademicStanding({
      studentId: enrollment.studentId,
      actorId,
      accountType: accountType || 'registrar',
      source
    });
  } catch (error) {
    // The grade write already succeeded. Surface the failure without
    // pretending the publication itself failed; the evaluator is idempotent
    // and can be retried safely on the next publication or audit review.
    console.error('[student-lifecycle] Post-publication evaluation failed:', error);
    return { changed: false, error: error.message || 'Lifecycle evaluation failed' };
  }
}

/**
 * Build the per-transition notification payload for grade verification /
 * publication and deliver it to the student's in-app notification inbox.
 *
 * Delivery is idempotent: `eventKey` is scoped to the enrollment, the changed
 * subjects, and the exact submission cycle (verifiedAt/publishedAt), so a
 * retry after a transient failure can never duplicate a notification.
 * Notification failures are non-fatal — the grade write has already succeeded.
 */
async function notifyStudentGradeTransition({
  enrollment,
  subjects,
  action, // 'verified' | 'published'
  remarks = ''
}) {
  if (!enrollment?.studentId) return;
  try {
    const subjectLabels = (subjects || [])
      .map((s) => String(s.code || '').trim().toUpperCase())
      .filter(Boolean);
    if (subjectLabels.length === 0) return;

    const codes = subjectLabels.join(', ');
    const term = `${enrollment.semester || ''} Semester ${enrollment.schoolYear || ''}`.replace('Semester Summer', 'Summer').trim();
    const now = new Date();
    const actionEventKey = action === 'published' ? 'grade-published' : 'grade-verified';

    const isPublished = action === 'published';
    const title = isPublished ? 'Grades Published' : 'Grades Verified';
    const message = isPublished
      ? `Your grades for ${codes} (${term}) have been published by the Registrar and are now official. You can view them in the Grades section.${remarks ? ` Remarks: ${remarks}` : ''}`
      : `Your grades for ${codes} (${term}) have been verified by the Registrar. Publication will follow once processing is complete.${remarks ? ` Remarks: ${remarks}` : ''}`;

    // Per-subject grade snapshot so the notification reflects the official values
    const subjectDetails = (subjects || []).map((s) => ({
      subjectId: s.subjectId ? String(s.subjectId) : null,
      subjectCode: String(s.code || '').trim().toUpperCase(),
      subjectTitle: String(s.title || s.code || '').trim(),
      instructor: String(s.instructor || '').trim(),
      submissionStatus: isPublished ? 'Published' : 'Verified'
    }));

    // The transition timestamp scopes the eventKey to the exact submission
    // cycle, so re-verification after a registrar return produces a fresh
    // notification while retries of the same transition cannot duplicate it.
    const cycleStamp = isPublished
      ? (enrollment.gradeSubmission?.publishedAt ? new Date(enrollment.gradeSubmission.publishedAt).toISOString() : now.toISOString())
      : (enrollment.gradeSubmission?.verifiedAt ? new Date(enrollment.gradeSubmission.verifiedAt).toISOString() : now.toISOString());
    const eventKey = `${actionEventKey}:${enrollment._id}:${cycleStamp}`;

    await StudentNotification.updateOne(
      {
        studentId: enrollment.studentId,
        eventKey
      },
      {
        $setOnInsert: {
          studentId: enrollment.studentId,
          studentNumber: String(enrollment.studentNumber || ''),
          type: 'ACADEMIC',
          title,
          message,
          eventKey,
          isRead: false,
          readAt: null,
          data: {
            action,
            subjectCodes: subjectLabels,
            subjects: subjectDetails,
            schoolYear: enrollment.schoolYear || '',
            semester: enrollment.semester || '',
            remarks: remarks || '',
            verifiedAt: enrollment.gradeSubmission?.verifiedAt || null,
            publishedAt: enrollment.gradeSubmission?.publishedAt || null
          }
        }
      },
      { upsert: true }
    );
  } catch (err) {
    console.error('Failed to dispatch grade transition notification:', err?.message || err);
  }
}

/**
 * GET /registrar/grade-submissions
 * List enrollments with grade submission status. Filter by status, schoolYear, semester.
 */
async function listSubmissions(req, res) {
  try {
    const { status, schoolYear, semester, course, yearLevel, page = 1, limit = 50 } = req.query;
    const filter = {};
    if (schoolYear) filter.schoolYear = schoolYear;
    if (semester) filter.semester = semester;
    if (course) filter.course = course;
    if (yearLevel) filter.yearLevel = Number(yearLevel);
    if (status) {
      filter.$or = [
        { 'subjects.submissionStatus': status },
        { 'gradeSubmission.status': status }
      ];
    }

    // Fetch enrollments
    const skip = (Math.max(1, Number(page)) - 1) * Number(limit);
    const enrollments = await Enrollment.find(filter)
      .sort({ 'gradeSubmission.submittedAt': -1, updatedAt: -1 })
      .skip(skip)
      .limit(Math.min(200, Number(limit)))
      .populate('studentId', 'studentNumber firstName lastName suffix course yearLevel')
      .lean();

    // Split each enrollment into per-subject submission rows so each subject
    // accurately displays its own status and is independently reviewable.
    const rows = [];
    for (const enrollment of enrollments) {
      const activeSubjects = (enrollment.subjects || []).filter(
        s => s.status !== 'Dropped' && s.status !== 'Removed'
      );
      if (activeSubjects.length === 0) continue;

      for (const subject of activeSubjects) {
        const subStatus = subject.submissionStatus || 'Draft';

        if (status && subStatus !== status) continue;
        if (!status && subStatus === 'Draft') continue;

        const instructor = subject.instructor || 'Unassigned';
        const isGraded = (subject.grade !== null && subject.grade !== undefined) || !!subject.gradeMark;

        rows.push({
          _id: `${enrollment._id}_${instructor}_${subject.subjectId || subject.code}`,
          enrollmentId: enrollment._id,
          instructor,
          studentId: enrollment.studentId,
          studentNumber: enrollment.studentNumber,
          schoolYear: enrollment.schoolYear,
          semester: enrollment.semester,
          yearLevel: enrollment.yearLevel,
          course: enrollment.course,
          subjectId: subject.subjectId,
          subjectCode: subject.code,
          subjects: [subject],
          subjectCodes: subject.code,
          gradedCount: isGraded ? 1 : 0,
          totalCount: 1,
          professorSubmissionStatus: subStatus,
          submittedAt: subject.dateModified || enrollment.gradeSubmission?.submittedAt || null,
          gradeSubmission: enrollment.gradeSubmission
        });
      }
    }

    return res.json({
      success: true,
      data: rows,
      pagination: { page: Number(page), limit: Number(limit), total: rows.length, pages: Math.ceil(rows.length / Number(limit)) }
    });
  } catch (error) {
    console.error('Error listing grade submissions:', error);
    return res.status(500).json({ error: 'Failed to list grade submissions.' });
  }
}

/**
 * GET /registrar/grade-submissions/:enrollmentId
 * Get a single enrollment with full grade submission details.
 */
async function getSubmission(req, res) {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.enrollmentId)) {
      return res.status(400).json({ error: 'Invalid enrollment ID.' });
    }
    const enrollment = await Enrollment.findById(req.params.enrollmentId)
      .populate('studentId', 'studentNumber firstName lastName suffix course yearLevel email')
      .lean();
    if (!enrollment) return res.status(404).json({ error: 'Enrollment not found.' });
    return res.json({ success: true, data: enrollment });
  } catch (error) {
    console.error('Error getting grade submission:', error);
    return res.status(500).json({ error: 'Failed to get grade submission.' });
  }
}

/**
 * GET /registrar/grade-submissions/class
 * Get all grade submissions for a class (by schoolYear, semester, course, yearLevel).
 */
async function getClassSubmissions(req, res) {
  try {
    const { schoolYear, semester, course, yearLevel, status, instructor, subjectId, subjectCode } = req.query;
    if (!schoolYear || !semester || !course || !yearLevel) {
      return res.status(400).json({ error: 'Missing required filters: schoolYear, semester, course, yearLevel' });
    }

    const filter = {
      schoolYear,
      semester,
      course,
      yearLevel: Number(yearLevel)
    };

    const enrollments = await Enrollment.find(filter)
      .populate('studentId', 'studentNumber firstName lastName suffix course yearLevel section')
      .lean();

    const rows = [];
    for (const enrollment of enrollments) {
      const activeSubjects = (enrollment.subjects || []).filter(
        s => s.status !== 'Dropped' && s.status !== 'Removed'
      );
      if (activeSubjects.length === 0) continue;

      const studentSection = enrollment.studentId?.section || '';

      for (const subject of activeSubjects) {
        if (instructor && (subject.instructor || 'Unassigned') !== instructor) continue;
        if (subjectId && String(subject.subjectId) !== String(subjectId)) continue;
        if (subjectCode && subject.code !== subjectCode) continue;

        const subStatus = subject.submissionStatus || 'Draft';

        if (status && subStatus !== status) continue;

        const isGraded = (subject.grade !== null && subject.grade !== undefined) || !!subject.gradeMark;

        const sectionCode = subject.sectionCode || enrollment.sectionCode || studentSection;

        rows.push({
          _id: `${enrollment._id}_${subject.instructor || 'Unassigned'}_${subject.subjectId || subject.code}`,
          enrollmentId: enrollment._id,
          instructor: subject.instructor || 'Unassigned',
          subjectId: subject.subjectId,
          subjectCode: subject.code,
          studentId: enrollment.studentId,
          studentNumber: enrollment.studentId?.studentNumber || enrollment.studentNumber,
          schoolYear: enrollment.schoolYear,
          semester: enrollment.semester,
          yearLevel: enrollment.yearLevel,
          course: enrollment.course,
          subjects: [{ ...subject, sectionCode }],
          subjectCodes: subject.code,
          gradedCount: isGraded ? 1 : 0,
          totalCount: 1,
          professorSubmissionStatus: subStatus,
          submittedAt: subject.dateModified || enrollment.gradeSubmission?.submittedAt || null,
          gradeSubmission: enrollment.gradeSubmission
        });
      }
    }

    return res.json({ success: true, data: rows });
  } catch (error) {
    console.error('Error getting class grade submissions:', error);
    return res.status(500).json({ error: 'Failed to get class grade submissions.' });
  }
}

/**
 * POST /professor/grade-submissions/:enrollmentId/submit
 * Professor submits grades for an enrollment. All subjects must have a grade (or be dropped).
 * Ownership is verified by the inline route handler in index.js (getProfessorRouteAccess).
 */
async function submitGrades(req, res) {
  try {
    const enrollment = await Enrollment.findById(req.params.enrollmentId);
    if (!enrollment) return res.status(404).json({ error: 'Enrollment not found.' });
    if (enrollment.lockedAt) return res.status(400).json({ error: 'Enrollment is locked.' });
    await assertSchoolYearWritable(enrollment.schoolYear, 'grade submission');

    // Per-subject submission: only submit subjects targeted by THIS submission.
    // If targetSubjectId or req.body.subjectId is specified, submit ONLY that subject.
    const targetSubjectId = req.targetSubjectId || req.body?.subjectId || req.query?.subjectId || null;
    let subjectsToSubmit;
    if (targetSubjectId) {
      subjectsToSubmit = enrollment.subjects.filter(s =>
        String(s.subjectId) === String(targetSubjectId)
        && s.status !== 'Dropped'
        && s.status !== 'Removed'
      );
    } else if (req.professorSubjectIds && Array.isArray(req.professorSubjectIds)) {
      subjectsToSubmit = enrollment.subjects.filter(s =>
        req.professorSubjectIds.includes(String(s.subjectId))
        && s.status !== 'Dropped'
        && s.status !== 'Removed'
      );
    } else {
      subjectsToSubmit = enrollment.subjects.filter(s => s.status !== 'Dropped' && s.status !== 'Removed');
    }

    if (subjectsToSubmit.length === 0) {
      return res.status(400).json({ error: 'No assignable subjects found for this submission.' });
    }

    // Check if any of the professor's subjects are already submitted/verified/published
    const alreadyLocked = subjectsToSubmit.filter(s =>
      (s.submissionStatus || 'Draft') === 'Submitted'
      || (s.submissionStatus || 'Draft') === 'Verified'
      || (s.submissionStatus || 'Draft') === 'Published'
    )
    if (alreadyLocked.length > 0) {
      const lockedStatus = alreadyLocked[0].submissionStatus
      if (lockedStatus === 'Submitted') {
        return res.status(400).json({ error: 'Your grades for this subject have already been submitted for review.' })
      }
      if (lockedStatus === 'Verified') {
        return res.status(400).json({ error: 'Your grades for this subject are already verified. Cannot resubmit.' })
      }
      if (lockedStatus === 'Published') {
        return res.status(400).json({ error: 'Your grades for this subject are already published. Use a grade change request to make corrections.' })
      }
    }

    // Block submission for subjects with no grade AND no gradeMark.
    // A subject must have either a numerical grade (1.0–5.0) or a
    // non-numerical mark (INC, DRP, W, FA, NG) before it can be submitted.
    const ungraded = subjectsToSubmit.filter(
      s => (s.grade === null || s.grade === undefined) && !s.gradeMark
    );
    if (ungraded.length > 0) {
      const codes = ungraded.map(s => s.code).join(', ')
      return res.status(400).json({
        error: `${ungraded.length} subject(s) still need a grade or grade mark: ${codes}. Enter a numerical grade (1.0–5.0) or select a mark (INC, DRP, W, FA, NG) before submitting.`
      });
    }

    // Set per-subject submissionStatus to 'Submitted' for this professor's subjects
    subjectsToSubmit.forEach(subject => {
      subject.submissionStatus = 'Submitted'
      subject.dateModified = new Date()
    })

    // Sanitize any corrupted submissionStatus values on OTHER subjects so
    // enrollment.save() doesn't fail on pre-existing bad data.
    const validStatuses = ['Draft', 'Submitted', 'Verified', 'Published', 'Returned']
    enrollment.subjects.forEach(subject => {
      if (!validStatuses.includes(subject.submissionStatus)) {
        subject.submissionStatus = 'Draft'
      }
    })

    // Compute aggregate enrollment-level status from all subjects
    const aggregateStatus = Enrollment.computeAggregateSubmissionStatus(enrollment.subjects)

    // Update enrollment-level gradeSubmission (aggregate)
    const existingSubmission = enrollment.gradeSubmission || {}
    enrollment.gradeSubmission = {
      status: aggregateStatus,
      submittedAt: aggregateStatus === 'Submitted' ? new Date() : existingSubmission.submittedAt || null,
      submittedBy: aggregateStatus === 'Submitted' ? req.adminId : existingSubmission.submittedBy || null,
      verifiedAt: existingSubmission.verifiedAt || null,
      verifiedBy: existingSubmission.verifiedBy || null,
      publishedAt: existingSubmission.publishedAt || null,
      publishedBy: existingSubmission.publishedBy || null,
      reviewedAt: existingSubmission.reviewedAt || null,
      reviewedBy: existingSubmission.reviewedBy || null,
      reviewRemarks: existingSubmission.reviewRemarks || ''
    };
    enrollment.updatedBy = req.adminId;
    enrollment.markModified('subjects');
    await enrollment.save();

    // Audit log
    await GradeAuditLog.create({
      enrollmentId: enrollment._id,
      studentId: enrollment.studentId,
      studentNumber: enrollment.studentNumber,
      subjectId: subjectsToSubmit.length === 1 ? subjectsToSubmit[0].subjectId : null,
      subjectCode: subjectsToSubmit.length === 1 ? subjectsToSubmit[0].code : 'ALL',
      action: 'submission',
      changedBy: req.adminId,
      changedByRole: req.accountType,
      schoolYear: enrollment.schoolYear,
      semester: enrollment.semester,
      newRemarks: subjectsToSubmit.length === 1
        ? `Grades submitted for ${subjectsToSubmit[0].code}`
        : 'Grades submitted for review'
    });

    return res.json({
      success: true,
      message: 'Grades submitted for review.',
      data: enrollment
    });
  } catch (error) {
    console.error('Error submitting grades:', error);
    const message = error?.name === 'ValidationError'
      ? `Validation failed: ${Object.values(error.errors || {}).map(e => e.message).join('; ')}`
      : error?.code === 11000
        ? 'Duplicate key error.'
        : 'Failed to submit grades.';
    return res.status(500).json({ error: message, detail: error?.message });
  }
}

/**
 * Professor bulk submits grades for multiple enrollments in a subject.
 * Validates grades, ownership, and locks for each student, saving in batch.
 */
async function bulkSubmitGrades(req, res) {
  try {
    const { enrollmentIds, subjectId, semester, schoolYear } = req.body || {};
    if (!Array.isArray(enrollmentIds) || enrollmentIds.length === 0) {
      return res.status(400).json({ error: 'enrollmentIds array is required.' });
    }
    if (!subjectId) {
      return res.status(400).json({ error: 'subjectId is required.' });
    }

    const instructorMatches = req.instructorMatchesProfessor || (() => true);

    const validEnrollmentIds = enrollmentIds
      .filter((id) => mongoose.Types.ObjectId.isValid(id))
      .map((id) => new mongoose.Types.ObjectId(id));

    if (validEnrollmentIds.length === 0) {
      return res.status(400).json({ error: 'No valid enrollment IDs provided.' });
    }

    const enrollments = await Enrollment.find({
      _id: { $in: validEnrollmentIds },
      status: { $nin: ['Dropped', 'Cancelled'] }
    });

    if (enrollments.length === 0) {
      return res.status(404).json({ error: 'No matching enrollments found.' });
    }

    let succeeded = 0;
    let failed = 0;
    const errors = [];
    const submittedEnrollmentIds = [];
    const auditLogs = [];

    for (const enrollment of enrollments) {
      try {
        if (enrollment.lockedAt) {
          failed++;
          errors.push(`Enrollment for ${enrollment.studentNumber || enrollment._id} is locked.`);
          continue;
        }

        await assertSchoolYearWritable(enrollment.schoolYear, 'grade submission');

        const subjectsToSubmit = (Array.isArray(enrollment.subjects) ? enrollment.subjects : []).filter((s) =>
          String(s.subjectId) === String(subjectId) &&
          s.status !== 'Dropped' &&
          s.status !== 'Removed' &&
          instructorMatches(s.instructor)
        );

        if (subjectsToSubmit.length === 0) {
          failed++;
          errors.push(`No eligible subject found for student ${enrollment.studentNumber || enrollment._id}.`);
          continue;
        }

        const unsubmittedSubjects = subjectsToSubmit.filter((s) =>
          !['Submitted', 'Verified', 'Published'].includes(s.submissionStatus || 'Draft')
        );

        if (unsubmittedSubjects.length === 0) {
          // Already submitted or published
          succeeded++;
          submittedEnrollmentIds.push(String(enrollment._id));
          continue;
        }

        const ungraded = unsubmittedSubjects.filter(
          (s) => (s.grade === null || s.grade === undefined) && !s.gradeMark
        );
        if (ungraded.length > 0) {
          failed++;
          errors.push(`Student ${enrollment.studentNumber || enrollment._id} has no grade or mark.`);
          continue;
        }

        unsubmittedSubjects.forEach((s) => {
          s.submissionStatus = 'Submitted';
          s.dateModified = new Date();
        });

        const validStatuses = ['Draft', 'Submitted', 'Verified', 'Published', 'Returned'];
        enrollment.subjects.forEach((subject) => {
          if (!validStatuses.includes(subject.submissionStatus)) {
            subject.submissionStatus = 'Draft';
          }
        });

        const aggregateStatus = Enrollment.computeAggregateSubmissionStatus(enrollment.subjects);
        const existingSubmission = enrollment.gradeSubmission || {};
        enrollment.gradeSubmission = {
          status: aggregateStatus,
          submittedAt: aggregateStatus === 'Submitted' ? new Date() : existingSubmission.submittedAt || null,
          submittedBy: aggregateStatus === 'Submitted' ? req.adminId : existingSubmission.submittedBy || null,
          verifiedAt: existingSubmission.verifiedAt || null,
          verifiedBy: existingSubmission.verifiedBy || null,
          publishedAt: existingSubmission.publishedAt || null,
          publishedBy: existingSubmission.publishedBy || null,
          reviewedAt: existingSubmission.reviewedAt || null,
          reviewedBy: existingSubmission.reviewedBy || null,
          reviewRemarks: existingSubmission.reviewRemarks || ''
        };
        enrollment.updatedBy = req.adminId;
        enrollment.markModified('subjects');
        await enrollment.save();

        auditLogs.push({
          enrollmentId: enrollment._id,
          studentId: enrollment.studentId,
          studentNumber: enrollment.studentNumber,
          subjectId: unsubmittedSubjects.length === 1 ? unsubmittedSubjects[0].subjectId : null,
          subjectCode: unsubmittedSubjects.length === 1 ? unsubmittedSubjects[0].code : 'ALL',
          action: 'submission',
          changedBy: req.adminId,
          changedByRole: req.accountType || 'professor',
          schoolYear: enrollment.schoolYear,
          semester: enrollment.semester,
          newRemarks: `Bulk submission for ${unsubmittedSubjects[0].code || 'subject'}`
        });

        succeeded++;
        submittedEnrollmentIds.push(String(enrollment._id));
      } catch (err) {
        failed++;
        errors.push(`Student ${enrollment.studentNumber || enrollment._id}: ${err.message}`);
      }
    }

    if (auditLogs.length > 0) {
      await GradeAuditLog.insertMany(auditLogs).catch((err) =>
        console.error('Failed to write bulk submission audit logs:', err)
      );
    }

    return res.json({
      success: true,
      message: `Bulk submission completed: ${succeeded} succeeded, ${failed} failed.`,
      data: {
        succeeded,
        failed,
        submittedEnrollmentIds,
        errors
      }
    });
  } catch (error) {
    console.error('Error in bulkSubmitGrades:', error);
    return res.status(500).json({ error: error.message || 'Failed to bulk submit grades.' });
  }
}

/**
 * GET /api/professor/grade-submissions/all-courses-summary
 * Returns a summary of all courses/subjects assigned to the professor,
 * including student rosters and grade completion stats for pre-submission preview.
 */
async function getAllCoursesSummary(req, res) {
  try {
    const access = req.professorAccess;
    if (!access) {
      return res.status(403).json({ error: 'Professor access not found.' });
    }

    let activeSchoolYear = '2026-2027';
    let activeSemester = '1st';
    try {
      const termSetting = await SystemSetting.findOne({ key: 'academicTerm' }).lean();
      if (termSetting?.value?.schoolYear) activeSchoolYear = termSetting.value.schoolYear;
      if (termSetting?.value?.semester) activeSemester = termSetting.value.semester;
    } catch {
      // ignore
    }

    const semester = req.query.semester || activeSemester;
    const schoolYear = req.query.schoolYear || activeSchoolYear;

    const enrollmentFilter = {
      status: { $nin: ['Dropped', 'Cancelled'] },
      subjects: {
        $elemMatch: {
          instructor: { $in: access.exactIdentifierPatterns },
          status: { $nin: ['Dropped', 'Removed'] }
        }
      }
    };

    if (req.query.termFilter !== 'all') {
      if (semester) enrollmentFilter.semester = semester;
      if (schoolYear) enrollmentFilter.schoolYear = schoolYear;
    }

    const enrollments = await Enrollment.find(enrollmentFilter)
      .select('studentId studentNumber course schoolYear semester yearLevel subjects')
      .lean();

    if (enrollments.length === 0) {
      return res.json({
        success: true,
        data: {
          courses: [],
          stats: {
            totalCourses: 0,
            totalEnrolled: 0,
            totalGraded: 0,
            totalPending: 0,
            totalSubmitted: 0,
            totalReadyToSubmit: 0,
            passedCount: 0,
            failedCount: 0
          }
        }
      });
    }

    const studentIds = Array.from(new Set(enrollments.map((e) => e.studentId).filter(Boolean)));
    const studentObjectIds = studentIds
      .filter((id) => mongoose.Types.ObjectId.isValid(id))
      .map((id) => new mongoose.Types.ObjectId(id));

    const students = studentObjectIds.length > 0
      ? await Student.find({ _id: { $in: studentObjectIds } })
          .select('_id firstName middleName lastName suffix studentNumber course')
          .lean()
      : [];

    const studentMap = new Map(students.map((s) => [String(s._id), s]));

    // Fetch block assignments to know the section codes
    const assignments = await StudentBlockAssignment.find({
      studentId: { $in: studentIds.map(String) },
      status: 'ASSIGNED'
    }).select('studentId sectionId semester year').lean();

    const assignmentsByStudent = new Map();
    assignments.forEach((a) => {
      const sid = String(a.studentId);
      const list = assignmentsByStudent.get(sid) || [];
      list.push(a);
      assignmentsByStudent.set(sid, list);
    });

    const sectionIds = Array.from(
      new Set(assignments.map((a) => a.sectionId).filter((id) => mongoose.Types.ObjectId.isValid(id)))
    );
    const subSecCodes = new Set();
    enrollments.forEach((e) => {
      (e.subjects || []).forEach((s) => {
        const c = String(s?.sectionCode || '').trim();
        if (c && !c.toLowerCase().includes('unassigned') && !c.toLowerCase().includes('unknown')) {
          subSecCodes.add(c);
        }
      });
    });

    const sectionQuery = [];
    if (sectionIds.length > 0) sectionQuery.push({ _id: { $in: sectionIds.map((id) => new mongoose.Types.ObjectId(id)) } });
    if (subSecCodes.size > 0) sectionQuery.push({ sectionCode: { $in: Array.from(subSecCodes) } });

    let sections = [];
    if (sectionQuery.length > 0 && typeof BlockSection?.find === 'function' && (mongoose.connection?.readyState === 1 || BlockSection.find._isMockFunction)) {
      try {
        const q = sectionQuery.length === 1 ? sectionQuery[0] : { $or: sectionQuery };
        const queryRes = BlockSection.find(q);
        if (queryRes && typeof queryRes.select === 'function') {
          sections = (await queryRes.select('_id sectionCode').lean()) || [];
        }
      } catch (_secErr) {
        sections = [];
      }
    }

    const sectionMap = new Map((sections || []).map((s) => [String(s._id), s.sectionCode]));
    const sectionMapByCode = new Map((sections || []).map((s) => [String(s.sectionCode || '').trim().toLowerCase(), s]));

    let bsaDocs = [];
    if (typeof BlockSubjectAssignment?.find === 'function' && (mongoose.connection?.readyState === 1 || BlockSubjectAssignment.find._isMockFunction)) {
      try {
        const bsaQuery = BlockSubjectAssignment.find({});
        if (bsaQuery && typeof bsaQuery.select === 'function') {
          bsaDocs = (await bsaQuery.select('blockSectionId subjectId semester academicYear').lean()) || [];
        }
      } catch (_bsaErr) {
        bsaDocs = [];
      }
    }

    const bsaMap = new Map();
    (bsaDocs || []).forEach((b) => {
      const sem = String(b.semester || '').toLowerCase().replace(/\s+/g, '');
      const normSem = sem.includes('1') ? '1st' : (sem.includes('2') ? '2nd' : 'Summer');
      const sy = String(b.academicYear || '').trim();
      const key = `${String(b.subjectId)}|${normSem}|${sy}`;
      if (!bsaMap.has(key)) {
        bsaMap.set(key, String(b.blockSectionId));
      }
    });

    // Group subjects by unique class: courseCode + subjectId + sectionCode
    const courseGroups = new Map();

    let globalEnrolled = 0;
    let globalGraded = 0;
    let globalPending = 0;
    let globalSubmitted = 0;
    let globalReadyToSubmit = 0;
    let globalPassed = 0;
    let globalFailed = 0;

    for (const enrollment of enrollments) {
      const studentInfo = studentMap.get(String(enrollment.studentId));
      const studentAssignments = assignmentsByStudent.get(String(enrollment.studentId)) || [];
      const matchingAssignment = studentAssignments.find((a) =>
        (!a.semester || a.semester === enrollment.semester) &&
        (!a.year || String(a.year).includes(enrollment.schoolYear.split('-')[0]))
      ) || studentAssignments[0];

      const defaultSectionId = matchingAssignment ? String(matchingAssignment.sectionId) : '';
      const defaultSectionCode = (matchingAssignment && sectionMap.get(defaultSectionId)) || 'Unassigned';

      const profSubjects = (Array.isArray(enrollment.subjects) ? enrollment.subjects : []).filter((s) =>
        s.status !== 'Dropped' &&
        s.status !== 'Removed' &&
        access.instructorMatchesProfessor(s.instructor)
      );

      for (const subj of profSubjects) {
        let effSectionId = '';
        let effSectionCode = '';

        const subSec = String(subj.sectionCode || '').trim();
        if (subSec && !subSec.toLowerCase().includes('unassigned') && !subSec.toLowerCase().includes('unknown')) {
          const matched = sectionMapByCode.get(subSec.toLowerCase());
          if (matched) {
            effSectionId = String(matched._id);
            effSectionCode = matched.sectionCode;
          } else {
            effSectionCode = subSec;
          }
        }

        if (!effSectionId && defaultSectionId && defaultSectionCode && !defaultSectionCode.toLowerCase().includes('unassigned')) {
          const sem = String(enrollment.semester || '').toLowerCase().replace(/\s+/g, '');
          const normSem = sem.includes('1') ? '1st' : (sem.includes('2') ? '2nd' : 'Summer');
          const bsaSecId = bsaMap.get(`${String(subj.subjectId)}|${normSem}|${String(enrollment.schoolYear || '').trim()}`);
          if (!bsaSecId || bsaSecId === defaultSectionId) {
            effSectionId = defaultSectionId;
            effSectionCode = defaultSectionCode;
          } else {
            const bsaSec = sectionMap.get(bsaSecId);
            if (bsaSec) {
              effSectionId = bsaSecId;
              effSectionCode = bsaSec;
            } else {
              effSectionId = defaultSectionId;
              effSectionCode = defaultSectionCode;
            }
          }
        }

        if (!effSectionId) {
          const sem = String(enrollment.semester || '').toLowerCase().replace(/\s+/g, '');
          const normSem = sem.includes('1') ? '1st' : (sem.includes('2') ? '2nd' : 'Summer');
          const bsaSecId = bsaMap.get(`${String(subj.subjectId)}|${normSem}|${String(enrollment.schoolYear || '').trim()}`);
          if (bsaSecId) {
            effSectionId = bsaSecId;
            effSectionCode = sectionMap.get(bsaSecId) || 'Unassigned';
          }
        }

        if (!effSectionCode) effSectionCode = 'Unassigned';

        const groupKey = `${enrollment.course}|${subj.code}|${subj.subjectId}|${effSectionCode}|${enrollment.semester}|${enrollment.schoolYear}`;

        if (!courseGroups.has(groupKey)) {
          courseGroups.set(groupKey, {
            key: groupKey,
            courseCode: enrollment.course,
            sectionId: effSectionId,
            sectionCode: effSectionCode,
            blockCode: `${enrollment.course} ${effSectionCode}`.trim(),
            subjectId: String(subj.subjectId),
            subjectCode: subj.code,
            subjectTitle: subj.title,
            semester: enrollment.semester,
            schoolYear: enrollment.schoolYear,
            yearLevel: enrollment.yearLevel,
            totalEnrolled: 0,
            totalGraded: 0,
            totalPending: 0,
            totalSubmitted: 0,
            totalReadyToSubmit: 0,
            passedCount: 0,
            failedCount: 0,
            students: []
          });
        }

        const group = courseGroups.get(groupKey);
        group.totalEnrolled++;
        globalEnrolled++;

        const hasNumericalGrade = subj.grade !== null && subj.grade !== undefined && String(subj.grade).trim() !== '';
        const hasMark = Boolean(subj.gradeMark);
        const isGraded = hasNumericalGrade || hasMark;
        const isSubmitted = ['Submitted', 'Verified', 'Published'].includes(subj.submissionStatus || 'Draft');
        const isSubmittable = !isSubmitted && isGraded;

        if (isGraded) {
          group.totalGraded++;
          globalGraded++;

          if (hasNumericalGrade) {
            const num = Number(subj.grade);
            if (num <= 3.0) {
              group.passedCount++;
              globalPassed++;
            } else {
              group.failedCount++;
              globalFailed++;
            }
          } else if (subj.gradeMark === 'FA') {
            group.failedCount++;
            globalFailed++;
          }
        } else {
          group.totalPending++;
          globalPending++;
        }

        if (isSubmitted) {
          group.totalSubmitted++;
          globalSubmitted++;
        }

        if (isSubmittable) {
          group.totalReadyToSubmit++;
          globalReadyToSubmit++;
        }

        const studentName = studentInfo
          ? [studentInfo.lastName, studentInfo.firstName, studentInfo.middleName, studentInfo.suffix]
              .filter(Boolean)
              .join(', ')
          : enrollment.studentNumber;

        group.students.push({
          studentId: String(enrollment.studentId),
          enrollmentId: String(enrollment._id),
          studentNumber: enrollment.studentNumber,
          name: studentName,
          grade: subj.grade,
          gradeMark: subj.gradeMark,
          remarks: subj.remarks || '',
          submissionStatus: subj.submissionStatus || 'Draft',
          isGraded,
          isSubmitted,
          isSubmittable
        });
      }
    }

    const coursesList = Array.from(courseGroups.values());

    return res.json({
      success: true,
      data: {
        courses: coursesList,
        stats: {
          totalCourses: coursesList.length,
          totalEnrolled: globalEnrolled,
          totalGraded: globalGraded,
          totalPending: globalPending,
          totalSubmitted: globalSubmitted,
          totalReadyToSubmit: globalReadyToSubmit,
          passedCount: globalPassed,
          failedCount: globalFailed
        }
      }
    });
  } catch (error) {
    console.error('Error in getAllCoursesSummary:', error);
    return res.status(500).json({ error: error.message || 'Failed to fetch all courses summary.' });
  }
}

/**
 * POST /api/professor/grade-submissions/bulk-submit-all-courses
 * Submits all eligible graded students across all assigned courses for this professor.
 */
async function bulkSubmitAllCourses(req, res) {
  try {
    const access = req.professorAccess;
    if (!access) {
      return res.status(403).json({ error: 'Professor access not found.' });
    }

    const { semester, schoolYear } = req.body || {};

    let activeSchoolYear = '2026-2027';
    let activeSemester = '1st';
    try {
      const termSetting = await SystemSetting.findOne({ key: 'academicTerm' }).lean();
      if (termSetting?.value?.schoolYear) activeSchoolYear = termSetting.value.schoolYear;
      if (termSetting?.value?.semester) activeSemester = termSetting.value.semester;
    } catch {
      // ignore
    }

    const targetSemester = semester || activeSemester;
    const targetSchoolYear = schoolYear || activeSchoolYear;

    await assertSchoolYearWritable(targetSchoolYear, 'all courses grade submission');

    const enrollmentFilter = {
      status: { $nin: ['Dropped', 'Cancelled'] },
      schoolYear: targetSchoolYear,
      subjects: {
        $elemMatch: {
          instructor: { $in: access.exactIdentifierPatterns },
          status: { $nin: ['Dropped', 'Removed'] }
        }
      }
    };
    if (targetSemester) enrollmentFilter.semester = targetSemester;

    const enrollments = await Enrollment.find(enrollmentFilter);

    if (enrollments.length === 0) {
      return res.status(404).json({ error: 'No enrollments found for the specified term.' });
    }

    let succeededStudents = 0;
    let failedStudents = 0;
    const affectedCourses = new Set();
    const errors = [];
    const auditLogs = [];

    for (const enrollment of enrollments) {
      try {
        if (enrollment.lockedAt) {
          continue;
        }

        const eligibleSubjects = (Array.isArray(enrollment.subjects) ? enrollment.subjects : []).filter((s) =>
          s.status !== 'Dropped' &&
          s.status !== 'Removed' &&
          access.instructorMatchesProfessor(s.instructor) &&
          !['Submitted', 'Verified', 'Published'].includes(s.submissionStatus || 'Draft') &&
          ((s.grade !== null && s.grade !== undefined) || s.gradeMark)
        );

        if (eligibleSubjects.length === 0) {
          continue;
        }

        eligibleSubjects.forEach((s) => {
          s.submissionStatus = 'Submitted';
          s.dateModified = new Date();
          affectedCourses.add(`${enrollment.course}-${s.code}`);
        });

        const validStatuses = ['Draft', 'Submitted', 'Verified', 'Published', 'Returned'];
        enrollment.subjects.forEach((subject) => {
          if (!validStatuses.includes(subject.submissionStatus)) {
            subject.submissionStatus = 'Draft';
          }
        });

        const aggregateStatus = Enrollment.computeAggregateSubmissionStatus(enrollment.subjects);
        const existingSubmission = enrollment.gradeSubmission || {};
        enrollment.gradeSubmission = {
          status: aggregateStatus,
          submittedAt: aggregateStatus === 'Submitted' ? new Date() : existingSubmission.submittedAt || null,
          submittedBy: aggregateStatus === 'Submitted' ? req.adminId : existingSubmission.submittedBy || null,
          verifiedAt: existingSubmission.verifiedAt || null,
          verifiedBy: existingSubmission.verifiedBy || null,
          publishedAt: existingSubmission.publishedAt || null,
          publishedBy: existingSubmission.publishedBy || null,
          reviewedAt: existingSubmission.reviewedAt || null,
          reviewedBy: existingSubmission.reviewedBy || null,
          reviewRemarks: existingSubmission.reviewRemarks || ''
        };
        enrollment.updatedBy = req.adminId;
        enrollment.markModified('subjects');
        await enrollment.save();

        eligibleSubjects.forEach((s) => {
          auditLogs.push({
            enrollmentId: enrollment._id,
            studentId: enrollment.studentId,
            studentNumber: enrollment.studentNumber,
            subjectId: s.subjectId,
            subjectCode: s.code,
            action: 'submission',
            changedBy: req.adminId,
            changedByRole: req.accountType || 'professor',
            schoolYear: enrollment.schoolYear,
            semester: enrollment.semester,
            newRemarks: `Bulk submission all courses for ${s.code}`
          });
          succeededStudents++;
        });
      } catch (err) {
        failedStudents++;
        errors.push(`Enrollment ${enrollment.studentNumber || enrollment._id}: ${err.message}`);
      }
    }

    if (auditLogs.length > 0) {
      await GradeAuditLog.insertMany(auditLogs).catch((err) =>
        console.error('Failed to write audit logs for submit all courses:', err)
      );
    }

    return res.json({
      success: true,
      message: `Successfully submitted grades across all courses: ${succeededStudents} student grades submitted across ${affectedCourses.size} courses.`,
      data: {
        succeeded: succeededStudents,
        failed: failedStudents,
        totalCoursesAffected: affectedCourses.size,
        errors
      }
    });
  } catch (error) {
    console.error('Error in bulkSubmitAllCourses:', error);
    return res.status(500).json({ error: error.message || 'Failed to submit all course grades.' });
  }
}

/**
 * POST /registrar/grade-submissions/:enrollmentId/verify
 * Registrar verifies a submitted grade sheet (administrative/procedural verification).
 * Transition: Submitted → Verified
 */
async function verifyGrades(req, res) {
  try {
    const enrollment = await Enrollment.findById(req.params.enrollmentId);
    if (!enrollment) return res.status(404).json({ error: 'Enrollment not found.' });
    if (enrollment.lockedAt) return res.status(400).json({ error: 'Enrollment is already locked.' });
    await assertSchoolYearWritable(enrollment.schoolYear, 'grade verification');

    // Verify all subjects with submissionStatus='Submitted'
    // If instructor is provided, only verify that professor's subjects.
    // If subjectId is provided, only verify that specific subject.
    const instructorFilter = req.body?.instructor || null;
    const subjectIdFilter = req.body?.subjectId || null;
    const subjectsToVerify = enrollment.subjects.filter(s =>
      (s.submissionStatus || 'Draft') === 'Submitted'
      && s.status !== 'Dropped'
      && s.status !== 'Removed'
      && (!instructorFilter || (s.instructor || '') === instructorFilter)
      && (!subjectIdFilter || String(s.subjectId) === String(subjectIdFilter))
    );
    if (subjectsToVerify.length === 0) {
      return res.status(400).json({
        error: 'No submitted subjects found to verify. Only submitted grades can be verified.'
      });
    }

    subjectsToVerify.forEach(subject => {
      subject.submissionStatus = 'Verified'
      subject.dateModified = new Date()
    })

    // Compute aggregate
    const aggregateStatus = Enrollment.computeAggregateSubmissionStatus(enrollment.subjects)
    enrollment.gradeSubmission = {
      ...enrollment.gradeSubmission,
      status: aggregateStatus,
      verifiedAt: new Date(),
      verifiedBy: req.adminId,
      reviewedAt: new Date(),
      reviewedBy: req.adminId,
      reviewRemarks: (req.body?.remarks || '').trim()
    };
    enrollment.updatedBy = req.adminId;
    enrollment.markModified('subjects');
    await enrollment.save();

    // Audit log
    await GradeAuditLog.create({
      enrollmentId: enrollment._id,
      studentId: enrollment.studentId,
      studentNumber: enrollment.studentNumber,
      subjectId: null,
      subjectCode: 'ALL',
      action: 'verification',
      changedBy: req.adminId,
      changedByRole: req.accountType,
      schoolYear: enrollment.schoolYear,
      semester: enrollment.semester,
      newRemarks: req.body?.remarks || 'Grades verified by registrar'
    });

    // Notify the student that their grades have been verified
    void notifyStudentGradeTransition({
      enrollment,
      subjects: subjectsToVerify,
      action: 'verified',
      remarks: (req.body?.remarks || '').trim()
    });

    return res.json({ success: true, message: 'Grades verified.', data: enrollment });
  } catch (error) {
    console.error('Error verifying grades:', error);
    return res.status(500).json({ error: 'Failed to verify grades.' });
  }
}

/**
 * POST /registrar/grade-submissions/:enrollmentId/publish
 * Registrar publishes verified grades. Grades become official and visible to students.
 * Transition: Verified → Published
 */
async function publishGrades(req, res) {
  try {
    const enrollment = await Enrollment.findById(req.params.enrollmentId);
    if (!enrollment) return res.status(404).json({ error: 'Enrollment not found.' });
    if (enrollment.lockedAt) return res.status(400).json({ error: 'Enrollment is already locked.' });
    await assertSchoolYearWritable(enrollment.schoolYear, 'grade publication');

    // Publish all subjects with submissionStatus='Verified'
    // If instructor is provided, only publish that professor's subjects.
    // If subjectId is provided, only publish that specific subject.
    const instructorFilter = req.body?.instructor || null;
    const subjectIdFilter = req.body?.subjectId || null;
    const subjectsToPublish = enrollment.subjects.filter(s =>
      (s.submissionStatus || 'Draft') === 'Verified'
      && s.status !== 'Dropped'
      && s.status !== 'Removed'
      && (!instructorFilter || (s.instructor || '') === instructorFilter)
      && (!subjectIdFilter || String(s.subjectId) === String(subjectIdFilter))
    );
    if (subjectsToPublish.length === 0) {
      return res.status(400).json({
        error: 'No verified subjects found to publish. Only verified grades can be published.'
      });
    }

    subjectsToPublish.forEach(subject => {
      subject.submissionStatus = 'Published'
      subject.dateModified = new Date()
    })

    // Compute aggregate
    const aggregateStatus = Enrollment.computeAggregateSubmissionStatus(enrollment.subjects)
    enrollment.gradeSubmission = {
      ...enrollment.gradeSubmission,
      status: aggregateStatus,
      publishedAt: new Date(),
      publishedBy: req.adminId,
      reviewedAt: new Date(),
      reviewedBy: req.adminId,
      reviewRemarks: (req.body?.remarks || '').trim()
    };
    enrollment.updatedBy = req.adminId;
    enrollment.markModified('subjects');
    await enrollment.save();

    // Audit log
    await GradeAuditLog.create({
      enrollmentId: enrollment._id,
      studentId: enrollment.studentId,
      studentNumber: enrollment.studentNumber,
      subjectId: null,
      subjectCode: 'ALL',
      action: 'publication',
      changedBy: req.adminId,
      changedByRole: req.accountType,
      schoolYear: enrollment.schoolYear,
      semester: enrollment.semester,
      newRemarks: req.body?.remarks || 'Grades published — now visible to students'
    });

    const lifecycle = await evaluateLifecycleAfterGradeChange({
      enrollment,
      actorId: req.adminId,
      accountType: req.accountType,
      source: 'grade_publication'
    });

    // Notify the student that their grades are officially published and viewable
    void notifyStudentGradeTransition({
      enrollment,
      subjects: subjectsToPublish,
      action: 'published',
      remarks: (req.body?.remarks || '').trim()
    });

    return res.json({
      success: true,
      message: 'Grades published. Students can now view their grades.',
      data: enrollment,
      lifecycle
    });
  } catch (error) {
    console.error('Error publishing grades:', error);
    return res.status(500).json({ error: 'Failed to publish grades.' });
  }
}

/**
 * POST /registrar/grade-submissions/:enrollmentId/return
 * Registrar returns a submitted or verified grade sheet back to the professor.
 * Requires a reason. Professor can correct and resubmit.
 * Transition: Submitted → Returned, or Verified → Returned
 */
async function returnGrades(req, res) {
  try {
    const enrollment = await Enrollment.findById(req.params.enrollmentId);
    if (!enrollment) return res.status(404).json({ error: 'Enrollment not found.' });
    if (enrollment.lockedAt) return res.status(400).json({ error: 'Enrollment is already locked.' });
    await assertSchoolYearWritable(enrollment.schoolYear, 'grade return');

    const currentStatus = enrollment.gradeSubmission?.status || 'Draft';
    // When returning per-professor, the aggregate status may not be Submitted/Verified
    // (e.g. one professor submitted, another is still Draft). Allow the return as long
    // as there are matching subjects to return (checked below).
    const instructorFilter = req.body?.instructor || null;
    if (!instructorFilter && currentStatus !== 'Submitted' && currentStatus !== 'Verified') {
      return res.status(400).json({
        error: `Cannot return grades with status: ${currentStatus}. Only submitted or verified grades can be returned.`
      });
    }

    const reason = (req.body?.remarks || req.body?.reason || '').trim();
    if (!reason) {
      return res.status(400).json({ error: 'A reason is required when returning grades.' });
    }

    // Return all subjects with submissionStatus='Submitted' or 'Verified'
    // If instructor is provided, only return that professor's subjects.
    // If subjectId is provided, only return that specific subject.
    const subjectIdFilter = req.body?.subjectId || null;
    const subjectsToReturn = enrollment.subjects.filter(s =>
      ((s.submissionStatus || 'Draft') === 'Submitted'
       || (s.submissionStatus || 'Draft') === 'Verified')
      && s.status !== 'Dropped'
      && s.status !== 'Removed'
      && (!instructorFilter || (s.instructor || '') === instructorFilter)
      && (!subjectIdFilter || String(s.subjectId) === String(subjectIdFilter))
    );
    if (subjectsToReturn.length === 0) {
      return res.status(400).json({
        error: 'No submitted or verified subjects found to return.'
      });
    }

    subjectsToReturn.forEach(subject => {
      subject.submissionStatus = 'Returned'
      subject.dateModified = new Date()
    })

    // Compute aggregate
    const aggregateStatus = Enrollment.computeAggregateSubmissionStatus(enrollment.subjects)
    enrollment.gradeSubmission = {
      ...enrollment.gradeSubmission,
      status: aggregateStatus,
      reviewedAt: new Date(),
      reviewedBy: req.adminId,
      reviewRemarks: reason
    };
    enrollment.updatedBy = req.adminId;
    enrollment.markModified('subjects');
    await enrollment.save();

    // Audit log
    await GradeAuditLog.create({
      enrollmentId: enrollment._id,
      studentId: enrollment.studentId,
      studentNumber: enrollment.studentNumber,
      subjectId: null,
      subjectCode: 'ALL',
      action: 'return',
      changedBy: req.adminId,
      changedByRole: req.accountType,
      schoolYear: enrollment.schoolYear,
      semester: enrollment.semester,
      reason,
      newRemarks: reason
    });

    return res.json({ success: true, message: 'Grades returned to professor for correction.', data: enrollment });
  } catch (error) {
    console.error('Error returning grades:', error);
    return res.status(500).json({ error: 'Failed to return grades.' });
  }
}

/**
 * POST /registrar/grade-submissions/:enrollmentId/revert-to-draft
 * Reopen returned grades as a draft so the responsible professor can correct
 * and resubmit them. When an instructor is supplied, only that professor's
 * returned subjects are reopened.
 */
async function revertToDraft(req, res) {
  try {
    const enrollment = await Enrollment.findById(req.params.enrollmentId);
    if (!enrollment) return res.status(404).json({ error: 'Enrollment not found.' });
    if (enrollment.lockedAt) return res.status(400).json({ error: 'Enrollment is locked.' });
    await assertSchoolYearWritable(enrollment.schoolYear, 'grade reopen');

    const instructorFilter = req.body?.instructor || null;
    const subjectIdFilter = req.body?.subjectId || null;
    const subjectsToReopen = enrollment.subjects.filter(subject =>
      (subject.submissionStatus || 'Draft') === 'Returned'
      && subject.status !== 'Dropped'
      && subject.status !== 'Removed'
      && (!instructorFilter || (subject.instructor || '') === instructorFilter)
      && (!subjectIdFilter || String(subject.subjectId) === String(subjectIdFilter))
    );

    if (subjectsToReopen.length === 0) {
      return res.status(400).json({ error: 'No returned subjects found to reopen.' });
    }

    subjectsToReopen.forEach(subject => {
      subject.submissionStatus = 'Draft';
      subject.dateModified = new Date();
    });

    const existingSubmission = enrollment.gradeSubmission || {};
    enrollment.gradeSubmission = {
      ...existingSubmission,
      status: Enrollment.computeAggregateSubmissionStatus(enrollment.subjects),
      reviewedAt: new Date(),
      reviewedBy: req.adminId,
      reviewRemarks: 'Returned grades reopened as a draft for correction.'
    };
    enrollment.updatedBy = req.adminId;
    enrollment.markModified('subjects');
    await enrollment.save();

    await GradeAuditLog.create({
      enrollmentId: enrollment._id,
      studentId: enrollment.studentId,
      studentNumber: enrollment.studentNumber,
      subjectId: null,
      subjectCode: 'ALL',
      action: 'revert',
      changedBy: req.adminId,
      changedByRole: req.accountType,
      schoolYear: enrollment.schoolYear,
      semester: enrollment.semester,
      oldRemarks: 'Returned',
      newRemarks: `Reopened ${subjectsToReopen.length} returned subject(s) as Draft`
    });

    return res.json({ success: true, message: 'Returned grades reopened as a draft.', data: enrollment });
  } catch (error) {
    console.error('Error reverting to draft:', error);
    return res.status(500).json({ error: 'Failed to revert to draft.' });
  }
}

// ─── Grade Change Requests ───

/**
 * POST /api/professor/grade-change-requests
 * Professor creates a grade change request for a published grade.
 * Ownership is verified by the inline route handler in index.js.
 */
async function createGradeChangeRequest(req, res) {
  try {
    const { enrollmentId, studentId, subjectId, requestedGrade, reason, supportingInfo } = req.body;

    if (!enrollmentId || !studentId || !subjectId || requestedGrade === undefined || !reason) {
      return res.status(400).json({ error: 'enrollmentId, studentId, subjectId, requestedGrade, and reason are required.' });
    }

    const gradeScale = await gradingScaleService.loadGradeScale();
    const parsedGrade = gradingScaleService.parseGradeInput(requestedGrade, gradeScale);
    if (parsedGrade.error) {
      return res.status(400).json({ error: `Requested grade is invalid. ${parsedGrade.error}` });
    }
    const newGrade = parsedGrade.value;

    const enrollment = await Enrollment.findById(enrollmentId);
    if (!enrollment) return res.status(404).json({ error: 'Enrollment not found.' });

    // Find the subject entry
    const subjectEntry = enrollment.subjects.find(
      s => String(s.subjectId) === String(subjectId) && s.status !== 'Dropped' && s.status !== 'Removed'
    );
    if (!subjectEntry) {
      return res.status(404).json({ error: 'Subject not found in this enrollment.' });
    }

    const effectiveStatus = subjectEntry.submissionStatus || 'Draft';
    const allowedStatuses = ['Submitted', 'Verified', 'Published'];
    if (!allowedStatuses.includes(effectiveStatus)) {
      return res.status(400).json({
        error: `Grade change requests can only be made for submitted, verified, or published grades. Current status: ${effectiveStatus}.`
      });
    }

    const currentGrade = subjectEntry.grade ?? null;
    if (currentGrade === null) {
      return res.status(400).json({ error: 'No existing grade to change. Use the normal grade entry workflow.' });
    }

    // Check for existing pending request for the same enrollment+subject
    const existingPending = await GradeChangeRequest.findOne({
      enrollmentId: enrollment._id,
      subjectId: subjectEntry.subjectId,
      status: 'Pending'
    }).lean();
    if (existingPending) {
      return res.status(400).json({ error: 'A pending grade change request already exists for this subject.' });
    }

    const changeRequest = await GradeChangeRequest.create({
      enrollmentId: enrollment._id,
      studentId: enrollment.studentId,
      studentNumber: enrollment.studentNumber,
      subjectId: subjectEntry.subjectId,
      subjectCode: subjectEntry.code,
      sectionId: null,
      sectionCode: '',
      schoolYear: enrollment.schoolYear,
      semester: enrollment.semester,
      currentGrade,
      requestedGrade: newGrade,
      reason: reason.trim(),
      supportingInfo: (supportingInfo || '').trim(),
      status: 'Pending',
      requestedBy: req.adminId
    });

    // Audit log
    await GradeAuditLog.create({
      enrollmentId: enrollment._id,
      studentId: enrollment.studentId,
      studentNumber: enrollment.studentNumber,
      subjectId: subjectEntry.subjectId,
      subjectCode: subjectEntry.code,
      action: 'change_requested',
      changedBy: req.adminId,
      changedByRole: req.accountType,
      schoolYear: enrollment.schoolYear,
      semester: enrollment.semester,
      oldGrade: currentGrade,
      newGrade: newGrade,
      reason: reason.trim(),
      gradeChangeRequestId: changeRequest._id,
      newRemarks: `Grade change requested: ${gradingScaleService.formatGrade(currentGrade, gradeScale)} → ${gradingScaleService.formatGrade(newGrade, gradeScale)}`
    });

    return res.json({ success: true, message: 'Grade change request submitted for registrar review.', data: changeRequest });
  } catch (error) {
    console.error('Error creating grade change request:', error);
    return res.status(500).json({ error: 'Failed to create grade change request.' });
  }
}

/**
 * GET /registrar/grade-change-requests
 * List grade change requests (registrar/admin).
 */
async function listGradeChangeRequests(req, res) {
  try {
    const { status, page = 1, limit = 50 } = req.query;
    const filter = {};
    if (status) filter.status = status;

    const skip = (Math.max(1, Number(page)) - 1) * Number(limit);
    const requests = await GradeChangeRequest.find(filter)
      .sort({ requestedAt: -1 })
      .skip(skip)
      .limit(Math.min(200, Number(limit)))
      .populate('requestedBy', 'username displayName accountType')
      .populate('reviewedBy', 'username displayName accountType')
      .lean();

    const total = await GradeChangeRequest.countDocuments(filter);

    return res.json({
      success: true,
      data: requests,
      pagination: { page: Number(page), limit: Number(limit), total, pages: Math.ceil(total / Number(limit)) }
    });
  } catch (error) {
    console.error('Error listing grade change requests:', error);
    return res.status(500).json({ error: 'Failed to list grade change requests.' });
  }
}

/**
 * GET /registrar/grade-change-requests/:requestId
 * Get a single grade change request with details.
 */
async function getGradeChangeRequest(req, res) {
  try {
    const request = await GradeChangeRequest.findById(req.params.requestId)
      .populate('requestedBy', 'username displayName accountType')
      .populate('reviewedBy', 'username displayName accountType')
      .lean();
    if (!request) return res.status(404).json({ error: 'Grade change request not found.' });
    return res.json({ success: true, data: request });
  } catch (error) {
    console.error('Error getting grade change request:', error);
    return res.status(500).json({ error: 'Failed to get grade change request.' });
  }
}

/**
 * POST /registrar/grade-change-requests/:requestId/review
 * Registrar approves or rejects a grade change request.
 * On approve: the enrollment's subject grade is updated to the requested grade.
 */
async function reviewGradeChangeRequest(req, res) {
  try {
    const { action, remarks } = req.body;
    if (action !== 'approve' && action !== 'reject') {
      return res.status(400).json({ error: "Action must be 'approve' or 'reject'." });
    }

    const request = await GradeChangeRequest.findById(req.params.requestId);
    if (!request) return res.status(404).json({ error: 'Grade change request not found.' });
    if (request.status !== 'Pending') {
      return res.status(400).json({ error: `This request has already been ${request.status.toLowerCase()}.` });
    }

    const reviewRemarksText = (remarks || '').trim();
    if (action === 'reject' && !reviewRemarksText) {
      return res.status(400).json({ error: 'Remarks are required when rejecting a grade change request.' });
    }

    if (action === 'approve') {
      // Apply the grade change to the enrollment
      const enrollment = await Enrollment.findById(request.enrollmentId);
      if (!enrollment) return res.status(404).json({ error: 'Enrollment not found for this change request.' });
      if (enrollment.lockedAt) return res.status(400).json({ error: 'Enrollment is locked.' });

      const subjectEntry = enrollment.subjects.find(
        s => String(s.subjectId) === String(request.subjectId)
      );
      if (!subjectEntry) {
        return res.status(404).json({ error: 'Subject not found in enrollment.' });
      }

      const oldGrade = subjectEntry.grade ?? null;
      subjectEntry.grade = request.requestedGrade;
      subjectEntry.dateModified = new Date();
      enrollment.updatedBy = req.adminId;
      enrollment.markModified('subjects');
      await enrollment.save();

      // Update the change request
      request.status = 'Approved';
      request.reviewedBy = req.adminId;
      request.reviewedAt = new Date();
      request.reviewRemarks = reviewRemarksText;
      request.appliedAt = new Date();
      await request.save();

      // Audit log for the grade update
      await GradeAuditLog.create({
        enrollmentId: enrollment._id,
        studentId: enrollment.studentId,
        studentNumber: enrollment.studentNumber,
        subjectId: subjectEntry.subjectId,
        subjectCode: subjectEntry.code,
        action: 'change_approved',
        changedBy: req.adminId,
        changedByRole: req.accountType,
        schoolYear: enrollment.schoolYear,
        semester: enrollment.semester,
        oldGrade,
        newGrade: request.requestedGrade,
        reason: request.reason,
        gradeChangeRequestId: request._id,
        newRemarks: reviewRemarksText || `Grade change approved: ${gradingScaleService.formatGrade(oldGrade)} → ${gradingScaleService.formatGrade(request.requestedGrade)}`
      });

      const lifecycle = await evaluateLifecycleAfterGradeChange({
        enrollment,
        actorId: req.adminId,
        accountType: req.accountType,
        source: 'grade_change_approval'
      });

      return res.json({
        success: true,
        message: 'Grade change approved and applied.',
        data: request,
        lifecycle
      });
    } else {
      // Reject
      request.status = 'Rejected';
      request.reviewedBy = req.adminId;
      request.reviewedAt = new Date();
      request.reviewRemarks = reviewRemarksText;
      await request.save();

      // Audit log
      await GradeAuditLog.create({
        enrollmentId: request.enrollmentId,
        studentId: request.studentId,
        studentNumber: request.studentNumber,
        subjectId: request.subjectId,
        subjectCode: request.subjectCode,
        action: 'change_rejected',
        changedBy: req.adminId,
        changedByRole: req.accountType,
        schoolYear: request.schoolYear,
        semester: request.semester,
        oldGrade: request.currentGrade,
        newGrade: request.requestedGrade,
        reason: request.reason,
        gradeChangeRequestId: request._id,
        newRemarks: reviewRemarksText
      });

      return res.json({ success: true, message: 'Grade change request rejected.', data: request });
    }
  } catch (error) {
    console.error('Error reviewing grade change request:', error);
    return res.status(500).json({ error: 'Failed to review grade change request.' });
  }
}

/**
 * GET /registrar/grade-submissions/:enrollmentId/audit
 * Get the audit trail for a specific enrollment's grades.
 * Optional `?instructor=<name>` filters to only that professor's subject logs
 * (plus enrollment-level 'ALL' workflow actions).
 */
async function getAuditTrail(req, res) {
  try {
    const { instructor } = req.query;
    let logs = await GradeAuditLog.find({ enrollmentId: req.params.enrollmentId })
      .sort({ createdAt: -1 })
      .lean();

    if (instructor) {
      // Fetch the enrollment to find this professor's subject codes
      const enrollment = await Enrollment.findById(req.params.enrollmentId).lean().select('subjects');
      if (enrollment) {
        const profSubjectCodes = (enrollment.subjects || [])
          .filter(s => (s.instructor || '') === instructor && s.status !== 'Dropped' && s.status !== 'Removed')
          .map(s => s.code)
          .filter(Boolean);
        const profSubjectIds = (enrollment.subjects || [])
          .filter(s => (s.instructor || '') === instructor && s.status !== 'Dropped' && s.status !== 'Removed')
          .map(s => String(s.subjectId))
          .filter(Boolean);

        logs = logs.filter(log => {
          // Keep enrollment-level workflow actions (submission, verification, etc.)
          if (log.subjectCode === 'ALL' && (!log.subjectId || String(log.subjectId) === 'null')) return true;
          // Keep logs for this professor's subjects
          if (log.subjectCode && profSubjectCodes.includes(log.subjectCode)) return true;
          if (log.subjectId && profSubjectIds.includes(String(log.subjectId))) return true;
          return false;
        });
      }
    }

    return res.json({ success: true, data: logs });
  } catch (error) {
    console.error('Error getting audit trail:', error);
    return res.status(500).json({ error: 'Failed to get audit trail.' });
  }
}

/**
 * GET /registrar/students/:studentId/grade-audit
 * Get the full grade audit trail for a student (across all enrollments).
 */
async function getStudentGradeAudit(req, res) {
  try {
    const logs = await GradeAuditLog.find({ studentId: req.params.studentId })
      .sort({ createdAt: -1 })
      .lean();
    return res.json({ success: true, data: logs });
  } catch (error) {
    console.error('Error getting student grade audit:', error);
    return res.status(500).json({ error: 'Failed to get student grade audit.' });
  }
}

/**
 * GET /registrar/grade-submissions/attention
 * Returns subjects needing registrar attention for the current term:
 *   - Students enrolled in subjects but not assigned to a block section
 *   - Subjects with TBA or unmatched instructors
 *   - Submitted grade sheets with missing grades
 */
async function getSubjectsNeedingAttention(req, res) {
  try {
    const { schoolYear, semester } = req.query;

    // Use provided filters or fall back to all
    const enrollmentFilter = { status: { $ne: 'Dropped' } };
    if (schoolYear) enrollmentFilter.schoolYear = schoolYear;
    if (semester) enrollmentFilter.semester = semester;

    const enrollments = await Enrollment.find(enrollmentFilter)
      .select('studentId studentNumber course schoolYear semester yearLevel subjects gradeSubmission')
      .lean();

    // Collect all student IDs for block assignment lookup
    const studentIds = [...new Set(enrollments.map(e => String(e.studentId || '').trim()).filter(Boolean))];
    const studentObjectIds = studentIds.filter(id => mongoose.Types.ObjectId.isValid(id)).map(id => new mongoose.Types.ObjectId(id));

    // Get block assignments
    const assignments = await StudentBlockAssignment.find({
      studentId: { $in: studentIds },
      status: 'ASSIGNED'
    }).select('studentId sectionId semester year assignedAt').lean();

    const assignmentByStudent = new Map();
    assignments.forEach(a => {
      const sid = String(a.studentId || '').trim();
      if (!sid) return;
      const list = assignmentByStudent.get(sid) || [];
      list.push(a);
      assignmentByStudent.set(sid, list);
    });
    assignmentByStudent.forEach(list => list.sort((a, b) => new Date(b.assignedAt) - new Date(a.assignedAt)));

    // Get section codes
    const sectionIds = [...new Set(assignments.map(a => String(a.sectionId || '').trim()).filter(id => mongoose.Types.ObjectId.isValid(id)))];
    const sections = sectionIds.length > 0
      ? await BlockSection.find({ _id: { $in: sectionIds.map(id => new mongoose.Types.ObjectId(id)) } }).select('_id sectionCode').lean()
      : [];
    const sectionCodeById = new Map(sections.map(s => [String(s._id), String(s.sectionCode || 'Unknown')]));

    // Get student course info
    const students = studentObjectIds.length > 0
      ? await Student.find({ _id: { $in: studentObjectIds } }).select('_id course').lean()
      : [];
    const studentCourseById = new Map(students.map(s => [String(s._id), String(s.course || '')]));

    const parseYearStart = (sy) => {
      const m = String(sy || '').trim().match(/^(\d{4})-\d{4}$/);
      return m ? Number(m[1]) : null;
    };

    const findAssignment = (studentId, sem, sy) => {
      const list = assignmentByStudent.get(studentId) || [];
      if (list.length === 0) return null;
      const yearStart = parseYearStart(sy);
      return list.find(e => String(e.semester || '').trim() === String(sem || '').trim() && Number(e.year || 0) === Number(yearStart || 0)) || null;
    };

    const COURSE_LABELS = { '101': 'BEED', '102': 'BSED-ENGLISH', '103': 'BSED-MATH', '201': 'BSBA-HRM' };
    const courseLabel = (code) => COURSE_LABELS[String(code || '').trim()] || String(code || 'N/A');

    const attentionBuckets = new Map();
    const addToBucket = (key, data) => {
      const existing = attentionBuckets.get(key);
      if (existing) {
        existing.studentIds.add(data.studentId);
      } else {
        attentionBuckets.set(key, { ...data, studentIds: new Set([data.studentId]) });
      }
    };

    enrollments.forEach(enrollment => {
      const studentId = String(enrollment.studentId || '').trim();
      if (!studentId) return;

      const assignment = findAssignment(studentId, enrollment.semester, enrollment.schoolYear);
      const hasBlock = assignment && sectionCodeById.get(String(assignment.sectionId));

      (enrollment.subjects || []).forEach(subject => {
        const status = String(subject.status || '').toLowerCase();
        if (status === 'dropped' || status === 'removed') return;

        const instructor = String(subject.instructor || '').trim();
        const subjectCode = String(subject.code || 'N/A');
        const subjectTitle = String(subject.title || 'Untitled');
        const courseCode = studentCourseById.get(studentId) || String(enrollment.course || 'N/A');
        const gradeStatus = enrollment.gradeSubmission?.status || 'Draft';
        const hasGrade = subject.grade !== null && subject.grade !== undefined;
        const sectionLabel = hasBlock ? sectionCodeById.get(String(assignment.sectionId)) : 'No Block';

        // Issue: No block assignment
        if (!hasBlock) {
          const key = `noblock:${subjectCode}:${enrollment.schoolYear}:${enrollment.semester}`;
          addToBucket(key, {
            issueType: 'no-block',
            subjectCode,
            subjectTitle,
            instructor: instructor || 'TBA',
            sectionLabel,
            courseShortLabel: courseLabel(courseCode),
            schoolYear: enrollment.schoolYear,
            semester: enrollment.semester,
            gradeStatus,
            studentId
          });
        }

        // Issue: TBA or missing instructor
        if (!instructor || /^TBA$/i.test(instructor)) {
          const key = `tba:${subjectCode}:${enrollment.schoolYear}:${enrollment.semester}`;
          addToBucket(key, {
            issueType: 'tba',
            subjectCode,
            subjectTitle,
            instructor: 'TBA',
            sectionLabel,
            courseShortLabel: courseLabel(courseCode),
            schoolYear: enrollment.schoolYear,
            semester: enrollment.semester,
            gradeStatus,
            studentId
          });
        }

        // Issue: Submitted grade sheet with missing grades
        if (gradeStatus === 'Submitted' && !hasGrade) {
          const key = `missing-grade:${subjectCode}:${enrollment.schoolYear}:${enrollment.semester}`;
          addToBucket(key, {
            issueType: 'missing-grade',
            subjectCode,
            subjectTitle,
            instructor: instructor || 'TBA',
            sectionLabel,
            courseShortLabel: courseLabel(courseCode),
            schoolYear: enrollment.schoolYear,
            semester: enrollment.semester,
            gradeStatus,
            studentId
          });
        }
      });
    });

    const items = Array.from(attentionBuckets.values()).map(bucket => ({
      issueType: bucket.issueType,
      subjectCode: bucket.subjectCode,
      subjectTitle: bucket.subjectTitle,
      instructor: bucket.instructor,
      sectionLabel: bucket.sectionLabel,
      courseShortLabel: bucket.courseShortLabel,
      schoolYear: bucket.schoolYear,
      semester: bucket.semester,
      gradeStatus: bucket.gradeStatus,
      studentCount: bucket.studentIds.size
    })).sort((a, b) => {
      // Sort by issue type priority, then subject code
      const priority = { 'no-block': 0, 'tba': 1, 'missing-grade': 2 };
      const diff = (priority[a.issueType] ?? 3) - (priority[b.issueType] ?? 3);
      if (diff !== 0) return diff;
      return a.subjectCode.localeCompare(b.subjectCode);
    });

    return res.json({ success: true, data: items });
  } catch (error) {
    console.error('Error getting subjects needing attention:', error);
    return res.status(500).json({ error: 'Failed to get subjects needing attention.' });
  }
}

module.exports = {
  listSubmissions,
  getSubmission,
  getClassSubmissions,
  submitGrades,
  bulkSubmitGrades,
  getAllCoursesSummary,
  bulkSubmitAllCourses,
  verifyGrades,
  publishGrades,
  returnGrades,
  revertToDraft,
  createGradeChangeRequest,
  listGradeChangeRequests,
  getGradeChangeRequest,
  reviewGradeChangeRequest,
  getAuditTrail,
  getStudentGradeAudit,
  getSubjectsNeedingAttention
};
