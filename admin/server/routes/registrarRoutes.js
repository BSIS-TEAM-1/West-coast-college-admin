const express = require('express');
const router = express.Router();
const StudentController = require('../controllers/studentController');
const SubjectController = require('../controllers/subjectController');

// Student Routes
router.get('/professors', StudentController.getProfessorAccounts);
router.get('/students', StudentController.getStudents);
router.post('/students', StudentController.createStudent);
router.get('/students/:id', StudentController.getStudentById);
router.get('/students/number/:studentNumber', StudentController.getStudentByNumber);
router.put('/students/:id', StudentController.updateStudent);
router.delete('/students/:id', StudentController.deleteStudent);
router.get('/students/:id/cor', StudentController.generateCorPdf);

// Enrollment Routes
router.post('/students/:id/enroll', StudentController.enrollStudent);
router.get('/students/:id/current-enrollment', StudentController.getCurrentEnrollment);
router.get('/students/:id/enrollments', StudentController.getEnrollmentHistory);
router.post('/sections/:sectionId/subject-assignment', StudentController.assignSubjectInstructorToSection);

// Subject Routes
router.get('/subjects', SubjectController.getSubjects);
router.post('/subjects', SubjectController.createSubject);
router.put('/subjects/:id', SubjectController.updateSubject);
router.delete('/subjects/:id', SubjectController.deleteSubject);

module.exports = router;
