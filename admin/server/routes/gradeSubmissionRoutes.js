const express = require('express');
const router = express.Router();
const gradeSubmissionController = require('../controllers/gradeSubmissionController');
const { requireAnyRole } = require('../authorization');

// Grade change requests (registrar review) — must be before /:enrollmentId to avoid conflict
router.get('/change-requests/list', gradeSubmissionController.listGradeChangeRequests);
router.get('/change-requests/:requestId', gradeSubmissionController.getGradeChangeRequest);
router.post('/change-requests/:requestId/review', gradeSubmissionController.reviewGradeChangeRequest);

// Subjects needing attention — must be before /:enrollmentId to avoid conflict
router.get('/attention', gradeSubmissionController.getSubjectsNeedingAttention);

// Registrar/admin routes — list, review, verify, publish, return
router.get('/', gradeSubmissionController.listSubmissions);
router.get('/:enrollmentId', gradeSubmissionController.getSubmission);
router.get('/:enrollmentId/audit', gradeSubmissionController.getAuditTrail);
router.post('/:enrollmentId/verify', gradeSubmissionController.verifyGrades);
router.post('/:enrollmentId/publish', gradeSubmissionController.publishGrades);
router.post('/:enrollmentId/return', gradeSubmissionController.returnGrades);
router.post('/:enrollmentId/revert-to-draft', gradeSubmissionController.revertToDraft);

module.exports = router;
