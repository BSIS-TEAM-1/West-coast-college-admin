const mongoose = require('mongoose');
const Enrollment = require('../models/Enrollment');
const GradeAuditLog = require('../models/GradeAuditLog');
const TransmutationTable = require('../models/TransmutationTable');

/**
 * GET /registrar/grade-submissions
 * List enrollments with grade submission status. Filter by status, schoolYear, semester.
 */
async function listSubmissions(req, res) {
  try {
    const { status, schoolYear, semester, course, yearLevel, page = 1, limit = 50 } = req.query;
    const filter = {};
    if (status) filter['gradeSubmission.status'] = status;
    if (schoolYear) filter.schoolYear = schoolYear;
    if (semester) filter.semester = semester;
    if (course) filter.course = course;
    if (yearLevel) filter.yearLevel = Number(yearLevel);

    const skip = (Math.max(1, Number(page)) - 1) * Number(limit);
    const enrollments = await Enrollment.find(filter)
      .sort({ 'gradeSubmission.submittedAt': -1, updatedAt: -1 })
      .skip(skip)
      .limit(Math.min(200, Number(limit)))
      .populate('studentId', 'studentNumber firstName lastName suffix course yearLevel')
      .lean();

    const total = await Enrollment.countDocuments(filter);

    return res.json({
      success: true,
      data: enrollments,
      pagination: { page: Number(page), limit: Number(limit), total, pages: Math.ceil(total / Number(limit)) }
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
 */
async function submitGrades(req, res) {
  try {
    const enrollment = await Enrollment.findById(req.params.enrollmentId);
    if (!enrollment) return res.status(404).json({ error: 'Enrollment not found.' });
    if (enrollment.lockedAt) return res.status(400).json({ error: 'Enrollment is locked.' });

    if (enrollment.gradeSubmission?.status === 'Approved') {
      return res.status(400).json({ error: 'Grades have already been approved.' });
    }
    if (enrollment.gradeSubmission?.status === 'Submitted') {
      return res.status(400).json({ error: 'Grades have already been submitted for review.' });
    }

    // Validate: all non-dropped subjects must have a grade
    const ungraded = enrollment.subjects.filter(
      s => s.status !== 'Dropped' && s.status !== 'Removed' && (s.grade === null || s.grade === undefined)
    );
    if (ungraded.length > 0) {
      return res.status(400).json({
        error: `${ungraded.length} subject(s) still need grades before submission.`,
        data: ungraded.map(s => ({ code: s.code, title: s.title }))
      });
    }

    enrollment.gradeSubmission = {
      status: 'Submitted',
      submittedAt: new Date(),
      submittedBy: req.adminId,
      reviewedAt: null,
      reviewedBy: null,
      reviewRemarks: ''
    };
    enrollment.updatedBy = req.adminId;
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

    return res.json({ success: true, message: 'Grades submitted for review.', data: enrollment });
  } catch (error) {
    console.error('Error submitting grades:', error);
    return res.status(500).json({ error: 'Failed to submit grades.' });
  }
}

/**
 * POST /registrar/grade-submissions/:enrollmentId/approve
 * Registrar/Dean approves submitted grades. Grades become final.
 */
async function approveGrades(req, res) {
  try {
    const enrollment = await Enrollment.findById(req.params.enrollmentId);
    if (!enrollment) return res.status(404).json({ error: 'Enrollment not found.' });
    if (enrollment.lockedAt) return res.status(400).json({ error: 'Enrollment is already locked.' });

    if (enrollment.gradeSubmission?.status !== 'Submitted') {
      return res.status(400).json({
        error: `Cannot approve grades with status: ${enrollment.gradeSubmission?.status || 'Draft'}.`
      });
    }

    enrollment.gradeSubmission.status = 'Approved';
    enrollment.gradeSubmission.reviewedAt = new Date();
    enrollment.gradeSubmission.reviewedBy = req.adminId;
    enrollment.gradeSubmission.reviewRemarks = (req.body?.remarks || '').trim();
    enrollment.updatedBy = req.adminId;
    await enrollment.save();

    // Audit log
    await GradeAuditLog.create({
      enrollmentId: enrollment._id,
      studentId: enrollment.studentId,
      studentNumber: enrollment.studentNumber,
      subjectId: null,
      subjectCode: 'ALL',
      action: 'approval',
      changedBy: req.adminId,
      changedByRole: req.accountType,
      schoolYear: enrollment.schoolYear,
      semester: enrollment.semester,
      newRemarks: req.body?.remarks || 'Grades approved'
    });

    return res.json({ success: true, message: 'Grades approved.', data: enrollment });
  } catch (error) {
    console.error('Error approving grades:', error);
    return res.status(500).json({ error: 'Failed to approve grades.' });
  }
}

/**
 * POST /registrar/grade-submissions/:enrollmentId/reject
 * Registrar/Dean rejects submitted grades, sending them back to draft.
 */
async function rejectGrades(req, res) {
  try {
    const enrollment = await Enrollment.findById(req.params.enrollmentId);
    if (!enrollment) return res.status(404).json({ error: 'Enrollment not found.' });

    if (enrollment.gradeSubmission?.status !== 'Submitted') {
      return res.status(400).json({
        error: `Cannot reject grades with status: ${enrollment.gradeSubmission?.status || 'Draft'}.`
      });
    }

    enrollment.gradeSubmission.status = 'Rejected';
    enrollment.gradeSubmission.reviewedAt = new Date();
    enrollment.gradeSubmission.reviewedBy = req.adminId;
    enrollment.gradeSubmission.reviewRemarks = (req.body?.remarks || '').trim();
    enrollment.updatedBy = req.adminId;
    await enrollment.save();

    // Audit log
    await GradeAuditLog.create({
      enrollmentId: enrollment._id,
      studentId: enrollment.studentId,
      studentNumber: enrollment.studentNumber,
      subjectId: null,
      subjectCode: 'ALL',
      action: 'rejection',
      changedBy: req.adminId,
      changedByRole: req.accountType,
      schoolYear: enrollment.schoolYear,
      semester: enrollment.semester,
      newRemarks: req.body?.remarks || 'Grades rejected'
    });

    return res.json({ success: true, message: 'Grades rejected and sent back to professor.', data: enrollment });
  } catch (error) {
    console.error('Error rejecting grades:', error);
    return res.status(500).json({ error: 'Failed to reject grades.' });
  }
}

/**
 * POST /registrar/grade-submissions/:enrollmentId/revert-to-draft
 * Allow professor to re-edit after rejection (or registrar to revert approved back to draft).
 */
async function revertToDraft(req, res) {
  try {
    const enrollment = await Enrollment.findById(req.params.enrollmentId);
    if (!enrollment) return res.status(404).json({ error: 'Enrollment not found.' });
    if (enrollment.lockedAt) return res.status(400).json({ error: 'Enrollment is locked.' });

    const oldStatus = enrollment.gradeSubmission?.status || 'Draft';
    enrollment.gradeSubmission = {
      status: 'Draft',
      submittedAt: null,
      submittedBy: null,
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

/**
 * GET /registrar/grade-submissions/:enrollmentId/audit
 * Get the audit trail for a specific enrollment's grades.
 */
async function getAuditTrail(req, res) {
  try {
    const logs = await GradeAuditLog.find({ enrollmentId: req.params.enrollmentId })
      .sort({ createdAt: -1 })
      .lean();
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

module.exports = {
  listSubmissions,
  getSubmission,
  submitGrades,
  approveGrades,
  rejectGrades,
  revertToDraft,
  getAuditTrail,
  getStudentGradeAudit
};
