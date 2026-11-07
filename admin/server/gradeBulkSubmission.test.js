const {
  bulkSubmitGrades,
  getAllCoursesSummary,
  bulkSubmitAllCourses
} = require('./controllers/gradeSubmissionController');
const Enrollment = require('./models/Enrollment');
const GradeAuditLog = require('./models/GradeAuditLog');
const Student = require('./models/Student');
const StudentBlockAssignment = require('./models/StudentBlockAssignment');
const BlockSection = require('./models/BlockSection');
const SystemSetting = require('./models/SystemSetting');
const mongoose = require('mongoose');

jest.mock('./models/Enrollment');
jest.mock('./models/GradeAuditLog');
jest.mock('./models/Student');
jest.mock('./models/StudentBlockAssignment');
jest.mock('./models/BlockSection');
jest.mock('./models/SystemSetting');
jest.mock('./services/schoolYearLockService', () => ({
  assertSchoolYearWritable: jest.fn().mockResolvedValue(undefined)
}));

describe('bulkSubmitGrades', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Enrollment.computeAggregateSubmissionStatus = jest.fn().mockReturnValue('Submitted');
    GradeAuditLog.insertMany = jest.fn().mockResolvedValue([]);
  });

  test('rejects request if enrollmentIds array is empty or missing', async () => {
    const req = { body: { enrollmentIds: [], subjectId: new mongoose.Types.ObjectId().toString() } };
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };

    await bulkSubmitGrades(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: 'enrollmentIds array is required.' }));
  });

  test('rejects request if subjectId is missing', async () => {
    const req = { body: { enrollmentIds: [new mongoose.Types.ObjectId().toString()] } };
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };

    await bulkSubmitGrades(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: 'subjectId is required.' }));
  });

  test('successfully submits graded students in bulk and logs audit trail', async () => {
    const enrollmentId = new mongoose.Types.ObjectId();
    const subjectId = new mongoose.Types.ObjectId();
    const adminId = new mongoose.Types.ObjectId();

    const mockEnrollment = {
      _id: enrollmentId,
      studentId: new mongoose.Types.ObjectId(),
      studentNumber: '2026-0001',
      schoolYear: '2026-2027',
      semester: '1st',
      subjects: [
        {
          subjectId: subjectId,
          code: 'CS101',
          instructor: 'Prof. Smith',
          grade: 1.25,
          status: 'Enrolled',
          submissionStatus: 'Draft'
        }
      ],
      save: jest.fn().mockResolvedValue(true),
      markModified: jest.fn()
    };

    Enrollment.find = jest.fn().mockResolvedValue([mockEnrollment]);

    const req = {
      adminId,
      accountType: 'professor',
      instructorMatchesProfessor: (inst) => inst === 'Prof. Smith',
      body: {
        enrollmentIds: [enrollmentId.toString()],
        subjectId: subjectId.toString()
      }
    };

    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };

    await bulkSubmitGrades(req, res);

    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: true,
      data: expect.objectContaining({
        succeeded: 1,
        failed: 0,
        submittedEnrollmentIds: [enrollmentId.toString()]
      })
    }));

    expect(mockEnrollment.subjects[0].submissionStatus).toBe('Submitted');
    expect(mockEnrollment.save).toHaveBeenCalled();
    expect(GradeAuditLog.insertMany).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          enrollmentId,
          action: 'submission',
          changedBy: adminId
        })
      ])
    );
  });

  test('fails student if subject has neither numerical grade nor gradeMark', async () => {
    const enrollmentId = new mongoose.Types.ObjectId();
    const subjectId = new mongoose.Types.ObjectId();

    const mockEnrollment = {
      _id: enrollmentId,
      studentNumber: '2026-0002',
      schoolYear: '2026-2027',
      semester: '1st',
      subjects: [
        {
          subjectId: subjectId,
          code: 'CS101',
          instructor: 'Prof. Smith',
          grade: null,
          gradeMark: null,
          status: 'Enrolled',
          submissionStatus: 'Draft'
        }
      ],
      save: jest.fn().mockResolvedValue(true),
      markModified: jest.fn()
    };

    Enrollment.find = jest.fn().mockResolvedValue([mockEnrollment]);

    const req = {
      adminId: new mongoose.Types.ObjectId(),
      accountType: 'professor',
      instructorMatchesProfessor: () => true,
      body: {
        enrollmentIds: [enrollmentId.toString()],
        subjectId: subjectId.toString()
      }
    };

    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };

    await bulkSubmitGrades(req, res);

    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: true,
      data: expect.objectContaining({
        succeeded: 0,
        failed: 1,
        errors: expect.arrayContaining([expect.stringContaining('no grade or mark')])
      })
    }));
  });
});

describe('getAllCoursesSummary', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('returns summary of all courses with stats and student rosters', async () => {
    const studentId = new mongoose.Types.ObjectId();
    const subjectId = new mongoose.Types.ObjectId();

    SystemSetting.findOne = jest.fn().mockReturnValue({
      lean: jest.fn().mockResolvedValue({ value: { semester: '1st', schoolYear: '2026-2027' } })
    });

    Enrollment.find = jest.fn().mockReturnValue({
      select: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue([
          {
            _id: new mongoose.Types.ObjectId(),
            studentId,
            studentNumber: '2026-0001',
            course: 'BSIT',
            schoolYear: '2026-2027',
            semester: '1st',
            yearLevel: 1,
            subjects: [
              {
                subjectId,
                code: 'IT101',
                title: 'Introduction to Computing',
                instructor: 'Prof. Ada',
                grade: 1.5,
                gradeMark: null,
                status: 'Enrolled',
                submissionStatus: 'Draft'
              }
            ]
          }
        ])
      })
    });

    Student.find = jest.fn().mockReturnValue({
      select: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue([
          {
            _id: studentId,
            firstName: 'John',
            lastName: 'Doe',
            studentNumber: '2026-0001',
            course: 'BSIT'
          }
        ])
      })
    });

    StudentBlockAssignment.find = jest.fn().mockReturnValue({
      select: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue([])
      })
    });

    const req = {
      professorAccess: {
        exactIdentifierPatterns: [/^Prof\. Ada$/i],
        instructorMatchesProfessor: (inst) => inst === 'Prof. Ada'
      },
      query: { semester: '1st', schoolYear: '2026-2027' }
    };

    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };

    await getAllCoursesSummary(req, res);

    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: true,
      data: expect.objectContaining({
        courses: expect.arrayContaining([
          expect.objectContaining({
            courseCode: 'BSIT',
            subjectCode: 'IT101',
            totalEnrolled: 1,
            totalGraded: 1,
            totalReadyToSubmit: 1
          })
        ]),
        stats: expect.objectContaining({
          totalCourses: 1,
          totalEnrolled: 1,
          totalGraded: 1,
          totalReadyToSubmit: 1
        })
      })
    }));
  });
});

describe('bulkSubmitAllCourses', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Enrollment.computeAggregateSubmissionStatus = jest.fn().mockReturnValue('Submitted');
    GradeAuditLog.insertMany = jest.fn().mockResolvedValue([]);
  });

  test('successfully submits graded subjects across all courses for the professor', async () => {
    const enrollment1 = {
      _id: new mongoose.Types.ObjectId(),
      studentId: new mongoose.Types.ObjectId(),
      studentNumber: '2026-0010',
      course: 'BSIT',
      schoolYear: '2026-2027',
      semester: '1st',
      subjects: [
        {
          subjectId: new mongoose.Types.ObjectId(),
          code: 'IT101',
          instructor: 'Prof. Ada',
          grade: 1.75,
          status: 'Enrolled',
          submissionStatus: 'Draft'
        }
      ],
      save: jest.fn().mockResolvedValue(true),
      markModified: jest.fn()
    };

    const enrollment2 = {
      _id: new mongoose.Types.ObjectId(),
      studentId: new mongoose.Types.ObjectId(),
      studentNumber: '2026-0020',
      course: 'BSCS',
      schoolYear: '2026-2027',
      semester: '1st',
      subjects: [
        {
          subjectId: new mongoose.Types.ObjectId(),
          code: 'CS201',
          instructor: 'Prof. Ada',
          grade: 2.0,
          status: 'Enrolled',
          submissionStatus: 'Draft'
        }
      ],
      save: jest.fn().mockResolvedValue(true),
      markModified: jest.fn()
    };

    SystemSetting.findOne = jest.fn().mockReturnValue({
      lean: jest.fn().mockResolvedValue({ value: { semester: '1st', schoolYear: '2026-2027' } })
    });

    Enrollment.find = jest.fn().mockResolvedValue([enrollment1, enrollment2]);

    const req = {
      adminId: new mongoose.Types.ObjectId(),
      accountType: 'professor',
      professorAccess: {
        exactIdentifierPatterns: [/^Prof\. Ada$/i],
        instructorMatchesProfessor: (inst) => inst === 'Prof. Ada'
      },
      body: { semester: '1st', schoolYear: '2026-2027' }
    };

    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };

    await bulkSubmitAllCourses(req, res);

    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: true,
      data: expect.objectContaining({
        succeeded: 2,
        failed: 0,
        totalCoursesAffected: 2
      })
    }));

    expect(enrollment1.subjects[0].submissionStatus).toBe('Submitted');
    expect(enrollment2.subjects[0].submissionStatus).toBe('Submitted');
    expect(GradeAuditLog.insertMany).toHaveBeenCalled();
  });
});
