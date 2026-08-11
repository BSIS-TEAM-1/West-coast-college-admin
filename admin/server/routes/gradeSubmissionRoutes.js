const express = require('express');
const router = express.Router();
const gradeSubmissionController = require('../controllers/gradeSubmissionController');
const { requireAnyRole } = require('../authorization');

// Registrar/admin routes — list, review, approve, reject
router.get('/', gradeSubmissionController.listSubmissions);
router.get('/:enrollmentId', gradeSubmissionController.getSubmission);
router.get('/:enrollmentId/audit', gradeSubmissionController.getAuditTrail);
router.post('/:enrollmentId/approve', gradeSubmissionController.approveGrades);
router.post('/:enrollmentId/reject', gradeSubmissionController.rejectGrades);
router.post('/:enrollmentId/revert-to-draft', gradeSubmissionController.revertToDraft);

module.exports = router;
