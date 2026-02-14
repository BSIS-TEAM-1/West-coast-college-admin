const express = require('express');
const router = express.Router();
const StudentController = require('../controllers/studentController');

// Student Routes
router.get('/students', StudentController.getStudents);
router.post('/students', StudentController.createStudent);
router.get('/students/:id', StudentController.getStudentById);
router.get('/students/number/:studentNumber', StudentController.getStudentByNumber);
router.put('/students/:id', StudentController.updateStudent);
router.get('/students/:id/cor', StudentController.generateCorPdf);

// Enrollment Routes
router.post('/students/:id/enroll', StudentController.enrollStudent);
router.get('/students/:id/current-enrollment', StudentController.getCurrentEnrollment);
router.get('/students/:id/enrollments', StudentController.getEnrollmentHistory);

module.exports = router;
