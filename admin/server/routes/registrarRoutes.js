const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const StudentController = require('../controllers/studentController');
const SubjectController = require('../controllers/subjectController');
const securityMiddleware = require('../securityMiddleware');
const { requireAnyRole } = require('../authorization');

// Rate limiter for registrar routes
const registrarLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.'
});

router.use(registrarLimiter);
router.use(requireAnyRole('admin', 'registrar'));

// Student Routes
router.get('/professors', StudentController.getProfessorAccounts);
router.get('/professor-course-loads', StudentController.getProfessorCourseLoads);
router.get('/sections/:sectionId/subject-assignments', securityMiddleware.inputValidationMiddleware(securityMiddleware.schemas.student.sectionAssignments), StudentController.getSectionSubjectAssignments);
router.get('/students', securityMiddleware.inputValidationMiddleware(securityMiddleware.schemas.student.query), StudentController.getStudents);
router.post('/students', securityMiddleware.inputValidationMiddleware(securityMiddleware.schemas.student.create), StudentController.createStudent);
router.get('/students/next-number', securityMiddleware.inputValidationMiddleware(securityMiddleware.schemas.student.nextStudentNumber), StudentController.getNextStudentNumber);
router.get('/students/:id', securityMiddleware.inputValidationMiddleware(securityMiddleware.schemas.student.idParam), StudentController.getStudentById);
router.get('/students/number/:studentNumber', securityMiddleware.inputValidationMiddleware(securityMiddleware.schemas.student.studentNumberParam), StudentController.getStudentByNumber);
router.put('/students/:id', securityMiddleware.inputValidationMiddleware({ ...securityMiddleware.schemas.student.idParam, ...securityMiddleware.schemas.student.update }), StudentController.updateStudent);
router.delete('/students/:id', securityMiddleware.inputValidationMiddleware(securityMiddleware.schemas.student.idParam), StudentController.deleteStudent);
router.get('/students/:id/cor', securityMiddleware.inputValidationMiddleware(securityMiddleware.schemas.student.idParam), StudentController.generateCorPdf);

// Enrollment Routes
router.post('/students/:id/enroll', securityMiddleware.inputValidationMiddleware(securityMiddleware.schemas.student.enroll), StudentController.enrollStudent);
router.get('/students/:id/current-enrollment', securityMiddleware.inputValidationMiddleware(securityMiddleware.schemas.student.currentEnrollment), StudentController.getCurrentEnrollment);
router.get('/students/:id/enrollments', securityMiddleware.inputValidationMiddleware(securityMiddleware.schemas.student.idParam), StudentController.getEnrollmentHistory);
router.post('/sections/:sectionId/subject-assignment', securityMiddleware.inputValidationMiddleware(securityMiddleware.schemas.student.assignSubjectInstructor), StudentController.assignSubjectInstructorToSection);
router.put('/sections/:sectionId/subject-assignment', securityMiddleware.inputValidationMiddleware(securityMiddleware.schemas.student.assignSubjectInstructor), StudentController.assignSubjectInstructorToSection);
router.delete('/sections/:sectionId/subject-assignment/:subjectId', securityMiddleware.inputValidationMiddleware(securityMiddleware.schemas.student.sectionAssignmentTarget), StudentController.clearSubjectInstructorForSection);

// Subject Routes
router.get('/subjects', securityMiddleware.inputValidationMiddleware(securityMiddleware.schemas.subject.query), SubjectController.getSubjects);
router.post('/subjects', securityMiddleware.inputValidationMiddleware(securityMiddleware.schemas.subject.create), SubjectController.createSubject);
router.put('/subjects/:id', securityMiddleware.inputValidationMiddleware({ ...securityMiddleware.schemas.subject.idParam, ...securityMiddleware.schemas.subject.update }), SubjectController.updateSubject);
router.delete('/subjects/:id', securityMiddleware.inputValidationMiddleware(securityMiddleware.schemas.subject.idParam), SubjectController.deleteSubject);

module.exports = router;
