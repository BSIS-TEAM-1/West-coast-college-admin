const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const StudentController = require('../controllers/studentController');
const SubjectController = require('../controllers/subjectController');
const BlockSubjectAssignmentController = require('../controllers/blockSubjectAssignmentController');
const securityMiddleware = require('../securityMiddleware');
const { requireAnyRole } = require('../authorization');
const { apiCache, cacheMiddleware } = require('../services/apiCache');

// Rate limiter for registrar routes
const registrarLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.'
});

router.use(registrarLimiter);
router.use(requireAnyRole('admin', 'registrar'));

function invalidateCacheOnSuccess(...prefixes) {
  return (req, res, next) => {
    res.on('finish', () => {
      if (res.statusCode < 200 || res.statusCode >= 300) return;
      prefixes.forEach((prefix) => apiCache.invalidatePrefix(prefix));
    });
    next();
  };
}

const studentCachePrefixes = ['/registrar/students', '/api/registrar/students'];
const subjectCachePrefixes = ['/registrar/subjects', '/api/registrar/subjects'];
const subjectAssignmentCachePrefixes = ['/registrar/block-subject-assignments', '/api/registrar/block-subject-assignments'];
const courseLoadCachePrefixes = [
  '/registrar/professor-course-loads',
  '/api/registrar/professor-course-loads',
  '/registrar/sections/',
  '/api/registrar/sections/'
];

// Student Routes
router.get('/professors', cacheMiddleware({ ttlMs: 60 * 1000 }), StudentController.getProfessorAccounts);
router.get('/professor-course-loads', cacheMiddleware({ ttlMs: 20 * 1000 }), StudentController.getProfessorCourseLoads);
router.get('/sections/:sectionId/subject-assignments', securityMiddleware.inputValidationMiddleware(securityMiddleware.schemas.student.sectionAssignments), cacheMiddleware({ ttlMs: 20 * 1000 }), StudentController.getSectionSubjectAssignments);
router.get('/students', securityMiddleware.inputValidationMiddleware(securityMiddleware.schemas.student.query), cacheMiddleware({ ttlMs: 15 * 1000 }), StudentController.getStudents);
router.post('/students', securityMiddleware.inputValidationMiddleware(securityMiddleware.schemas.student.create), invalidateCacheOnSuccess(...studentCachePrefixes), StudentController.createStudent);
router.get('/students/next-number', securityMiddleware.inputValidationMiddleware(securityMiddleware.schemas.student.nextStudentNumber), cacheMiddleware({ ttlMs: 10 * 1000 }), StudentController.getNextStudentNumber);
router.get('/students/:id', securityMiddleware.inputValidationMiddleware(securityMiddleware.schemas.student.idParam), cacheMiddleware({ ttlMs: 15 * 1000 }), StudentController.getStudentById);
router.get('/students/number/:studentNumber', securityMiddleware.inputValidationMiddleware(securityMiddleware.schemas.student.studentNumberParam), StudentController.getStudentByNumber);
router.put('/students/:id', securityMiddleware.inputValidationMiddleware({ ...securityMiddleware.schemas.student.idParam, ...securityMiddleware.schemas.student.update }), invalidateCacheOnSuccess(...studentCachePrefixes), StudentController.updateStudent);
router.delete('/students/:id', securityMiddleware.inputValidationMiddleware(securityMiddleware.schemas.student.idParam), invalidateCacheOnSuccess(...studentCachePrefixes), StudentController.deleteStudent);
router.get('/students/:id/cor', securityMiddleware.inputValidationMiddleware(securityMiddleware.schemas.student.idParam), StudentController.generateCorPdf);

// Enrollment Routes
router.post('/students/:id/enroll', securityMiddleware.inputValidationMiddleware(securityMiddleware.schemas.student.enroll), invalidateCacheOnSuccess(...studentCachePrefixes, ...courseLoadCachePrefixes), StudentController.enrollStudent);
router.get('/students/:id/current-enrollment', securityMiddleware.inputValidationMiddleware(securityMiddleware.schemas.student.currentEnrollment), cacheMiddleware({ ttlMs: 15 * 1000 }), StudentController.getCurrentEnrollment);
router.get('/students/:id/enrollments', securityMiddleware.inputValidationMiddleware(securityMiddleware.schemas.student.idParam), cacheMiddleware({ ttlMs: 15 * 1000 }), StudentController.getEnrollmentHistory);
router.post('/sections/:sectionId/subject-assignment', securityMiddleware.inputValidationMiddleware(securityMiddleware.schemas.student.assignSubjectInstructor), invalidateCacheOnSuccess(...courseLoadCachePrefixes), StudentController.assignSubjectInstructorToSection);
router.put('/sections/:sectionId/subject-assignment', securityMiddleware.inputValidationMiddleware(securityMiddleware.schemas.student.assignSubjectInstructor), invalidateCacheOnSuccess(...courseLoadCachePrefixes), StudentController.assignSubjectInstructorToSection);
router.delete('/sections/:sectionId/subject-assignment/:subjectId', securityMiddleware.inputValidationMiddleware(securityMiddleware.schemas.student.sectionAssignmentTarget), invalidateCacheOnSuccess(...courseLoadCachePrefixes), StudentController.clearSubjectInstructorForSection);
router.get('/block-subject-assignments', securityMiddleware.inputValidationMiddleware(securityMiddleware.schemas.blockSubjectAssignment.query), cacheMiddleware({ ttlMs: 20 * 1000 }), BlockSubjectAssignmentController.getAssignments);
router.post('/block-subject-assignments', securityMiddleware.inputValidationMiddleware(securityMiddleware.schemas.blockSubjectAssignment.create), invalidateCacheOnSuccess(...subjectAssignmentCachePrefixes, ...courseLoadCachePrefixes), BlockSubjectAssignmentController.assignSubjects);
router.delete('/block-subject-assignments/:id', securityMiddleware.inputValidationMiddleware(securityMiddleware.schemas.blockSubjectAssignment.idParam), invalidateCacheOnSuccess(...subjectAssignmentCachePrefixes, ...courseLoadCachePrefixes), BlockSubjectAssignmentController.deleteAssignment);

// Subject Routes
router.get('/subjects', securityMiddleware.inputValidationMiddleware(securityMiddleware.schemas.subject.query), cacheMiddleware({ ttlMs: 60 * 1000 }), SubjectController.getSubjects);
router.post('/subjects', securityMiddleware.inputValidationMiddleware(securityMiddleware.schemas.subject.create), invalidateCacheOnSuccess(...subjectCachePrefixes, ...courseLoadCachePrefixes), SubjectController.createSubject);
router.put('/subjects/:id', securityMiddleware.inputValidationMiddleware({ ...securityMiddleware.schemas.subject.idParam, ...securityMiddleware.schemas.subject.update }), invalidateCacheOnSuccess(...subjectCachePrefixes, ...courseLoadCachePrefixes), SubjectController.updateSubject);
router.delete('/subjects/:id', securityMiddleware.inputValidationMiddleware(securityMiddleware.schemas.subject.idParam), invalidateCacheOnSuccess(...subjectCachePrefixes, ...courseLoadCachePrefixes), SubjectController.deleteSubject);

module.exports = router;
