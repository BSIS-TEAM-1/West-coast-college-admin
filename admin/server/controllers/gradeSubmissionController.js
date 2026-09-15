const mongoose = require('mongoose');
const Enrollment = require('../models/Enrollment');
const GradeAuditLog = require('../models/GradeAuditLog');
const GradeChangeRequest = require('../models/GradeChangeRequest');
const TransmutationTable = require('../models/TransmutationTable');
const StudentBlockAssignment = require('../models/StudentBlockAssignment');
const BlockSection = require('../models/BlockSection');
const Student = require('../models/Student');

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

    // Fetch enrollments that have at least one non-draft subject
    const skip = (Math.max(1, Number(page)) - 1) * Number(limit);
    const enrollments = await Enrollment.find(filter)
      .sort({ 'gradeSubmission.submittedAt': -1, updatedAt: -1 })
      .skip(skip)
      .limit(Math.min(200, Number(limit)))
      .populate('studentId', 'studentNumber firstName lastName suffix course yearLevel')
      .lean();

    // Split each enrollment into per-professor submission rows.
    // Each row = one professor's subjects within one enrollment, with its own
    // submission status derived from the per-subject submissionStatus values.
    const rows = [];
    for (const enrollment of enrollments) {
      const activeSubjects = (enrollment.subjects || []).filter(
        s => s.status !== 'Dropped' && s.status !== 'Removed'
      );
      if (activeSubjects.length === 0) continue;

      // Group subjects by instructor
      const byInstructor = new Map();
      for (const subject of activeSubjects) {
        const instructor = subject.instructor || 'Unassigned';
        if (!byInstructor.has(instructor)) byInstructor.set(instructor, []);
        byInstructor.get(instructor).push(subject);
      }

      for (const [instructor, subjects] of byInstructor.entries()) {
        const statuses = subjects.map(s => s.submissionStatus || 'Draft');
        // Derive this professor's submission status from their subjects only
        let profStatus = 'Draft';
        if (statuses.includes('Returned')) profStatus = 'Returned';
        else if (statuses.includes('Submitted')) profStatus = 'Submitted';
        else if (statuses.every(s => s === 'Verified')) profStatus = 'Verified';
        else if (statuses.every(s => s === 'Published')) profStatus = 'Published';
        else {
          const nonDraft = statuses.filter(s => s !== 'Draft');
          if (nonDraft.length > 0) profStatus = nonDraft[0];
        }

        // Filter by requested status
        if (status && profStatus !== status) continue;

        const graded = subjects.filter(s => s.grade !== null && s.grade !== undefined || s.gradeMark).length;
        const subjectCodes = subjects.map(s => s.code).join(', ');
        const submittedSubject = subjects.find(s => s.dateModified);
        const submittedAt = submittedSubject?.dateModified || enrollment.gradeSubmission?.submittedAt || null;

        rows.push({
          _id: `${enrollment._id}_${instructor}`,
          enrollmentId: enrollment._id,
          instructor,
          studentId: enrollment.studentId,
          studentNumber: enrollment.studentNumber,
          schoolYear: enrollment.schoolYear,
          semester: enrollment.semester,
          yearLevel: enrollment.yearLevel,
          course: enrollment.course,
          subjects,
          subjectCodes,
          gradedCount: graded,
          totalCount: subjects.length,
          professorSubmissionStatus: profStatus,
          submittedAt,
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
 * POST /professor/grade-submissions/:enrollmentId/submit
 * Professor submits grades for an enrollment. All subjects must have a grade (or be dropped).
 * Ownership is verified by the inline route handler in index.js (getProfessorRouteAccess).
 */
async function submitGrades(req, res) {
  try {
    const enrollment = await Enrollment.findById(req.params.enrollmentId);
    if (!enrollment) return res.status(404).json({ error: 'Enrollment not found.' });
    if (enrollment.lockedAt) return res.status(400).json({ error: 'Enrollment is locked.' });

    // Per-subject submission: only submit subjects owned by THIS professor.
    // Other professors' subjects remain in their own submission status.
    const professorSubjectIds = req.professorSubjectIds || null
    const subjectsToSubmit = professorSubjectIds
      ? enrollment.subjects.filter(s =>
          professorSubjectIds.includes(String(s.subjectId))
          && s.status !== 'Dropped'
          && s.status !== 'Removed'
        )
      : enrollment.subjects.filter(s => s.status !== 'Dropped' && s.status !== 'Removed')

    if (subjectsToSubmit.length === 0) {
      return res.status(400).json({ error: 'No assignable subjects found for your account in this enrollment.' })
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
      subjectId: null,
      subjectCode: 'ALL',
      action: 'submission',
      changedBy: req.adminId,
      changedByRole: req.accountType,
      schoolYear: enrollment.schoolYear,
      semester: enrollment.semester,
      newRemarks: 'Grades submitted for review'
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
 * POST /registrar/grade-submissions/:enrollmentId/verify
 * Registrar verifies a submitted grade sheet (administrative/procedural verification).
 * Transition: Submitted → Verified
 */
async function verifyGrades(req, res) {
  try {
    const enrollment = await Enrollment.findById(req.params.enrollmentId);
    if (!enrollment) return res.status(404).json({ error: 'Enrollment not found.' });
    if (enrollment.lockedAt) return res.status(400).json({ error: 'Enrollment is already locked.' });

    // Verify all subjects with submissionStatus='Submitted'
    // If instructor is provided, only verify that professor's subjects.
    const instructorFilter = req.body?.instructor || null;
    const subjectsToVerify = enrollment.subjects.filter(s =>
      (s.submissionStatus || 'Draft') === 'Submitted'
      && s.status !== 'Dropped'
      && s.status !== 'Removed'
      && (!instructorFilter || (s.instructor || '') === instructorFilter)
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

    // Publish all subjects with submissionStatus='Verified'
    // If instructor is provided, only publish that professor's subjects.
    const instructorFilter = req.body?.instructor || null;
    const subjectsToPublish = enrollment.subjects.filter(s =>
      (s.submissionStatus || 'Draft') === 'Verified'
      && s.status !== 'Dropped'
      && s.status !== 'Removed'
      && (!instructorFilter || (s.instructor || '') === instructorFilter)
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

    return res.json({ success: true, message: 'Grades published. Students can now view their grades.', data: enrollment });
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
    const subjectsToReturn = enrollment.subjects.filter(s =>
      ((s.submissionStatus || 'Draft') === 'Submitted'
       || (s.submissionStatus || 'Draft') === 'Verified')
      && s.status !== 'Dropped'
      && s.status !== 'Removed'
      && (!instructorFilter || (s.instructor || '') === instructorFilter)
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
 * Revert a Returned/Rejected submission back to Draft (admin/registrar only).
 */
async function revertToDraft(req, res) {
  try {
    const enrollment = await Enrollment.findById(req.params.enrollmentId);
    if (!enrollment) return res.status(404).json({ error: 'Enrollment not found.' });
    if (enrollment.lockedAt) return res.status(400).json({ error: 'Enrollment is locked.' });

    const oldStatus = enrollment.gradeSubmission?.status || 'Draft';
    if (oldStatus === 'Published' || oldStatus === 'Verified') {
      return res.status(400).json({ error: `Cannot revert ${oldStatus} grades to draft.` });
    }

    enrollment.gradeSubmission = {
      status: 'Draft',
      submittedAt: null,
      submittedBy: null,
      verifiedAt: null,
      verifiedBy: null,
      publishedAt: null,
      publishedBy: null,
      reviewedAt: null,
      reviewedBy: null,
      reviewRemarks: ''
    };
    enrollment.updatedBy = req.adminId;
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
      oldRemarks: oldStatus,
      newRemarks: 'Reverted to Draft'
    });

    return res.json({ success: true, message: 'Grade submission reverted to draft.', data: enrollment });
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

    const newGrade = Number(requestedGrade);
    if (!Number.isFinite(newGrade) || newGrade < 1.0 || newGrade > 5.0) {
      return res.status(400).json({ error: 'Requested grade must be a number from 1.0 to 5.0.' });
    }

    const enrollment = await Enrollment.findById(enrollmentId);
    if (!enrollment) return res.status(404).json({ error: 'Enrollment not found.' });

    if (enrollment.gradeSubmission?.status !== 'Published') {
      return res.status(400).json({
        error: `Grade change requests can only be made for published grades. Current status: ${enrollment.gradeSubmission?.status || 'Draft'}.`
      });
    }

    // Find the subject entry
    const subjectEntry = enrollment.subjects.find(
      s => String(s.subjectId) === String(subjectId) && s.status !== 'Dropped' && s.status !== 'Removed'
    );
    if (!subjectEntry) {
      return res.status(404).json({ error: 'Subject not found in this enrollment.' });
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
      newRemarks: `Grade change requested: ${currentGrade?.toFixed(2)} → ${newGrade.toFixed(2)}`
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
        newRemarks: reviewRemarksText || `Grade change approved: ${oldGrade?.toFixed(2)} → ${request.requestedGrade.toFixed(2)}`
      });

      return res.json({ success: true, message: 'Grade change approved and applied.', data: request });
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
  submitGrades,
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
