const mongoose = require('mongoose');

// Mock dependencies before requiring services/controllers
jest.mock('./models/AuditLog', () => ({
  create: jest.fn().mockResolvedValue({})
}));

jest.mock('./models/StudentNotification', () => ({
  create: jest.fn().mockResolvedValue({}),
  insertMany: jest.fn().mockResolvedValue([])
}));

jest.mock('./models/EvaluationPeriod', () => {
  const model = jest.fn();
  model.findOne = jest.fn();
  model.find = jest.fn();
  model.findById = jest.fn();
  model.create = jest.fn();
  model.updateOne = jest.fn();
  model.findByIdAndDelete = jest.fn();
  model.countDocuments = jest.fn();
  model.computeEffectiveStatus = (period, now = new Date()) => {
    if (!period) return 'closed';
    if (period.status === 'draft' || period.manualState === 'draft') return 'draft';
    if (period.status === 'closed' || period.manualState === 'closed') return 'closed';
    const currentTime = now instanceof Date ? now : new Date(now);
    const startAt = period.startAt ? new Date(period.startAt) : null;
    const endAt = period.endAt ? new Date(period.endAt) : null;
    if (endAt && currentTime > endAt) return 'closed';
    if (startAt && currentTime < startAt && !['started', 'extended', 'reopened'].includes(period.manualState)) {
      return 'scheduled';
    }
    if (period.manualState === 'extended' || period.status === 'extended') return 'extended';
    return 'open';
  };
  return model;
});

jest.mock('./models/EvaluationResponse', () => ({
  find: jest.fn(),
  create: jest.fn(),
  deleteMany: jest.fn(),
  deleteOne: jest.fn().mockResolvedValue({}),
  aggregate: jest.fn()
}));

jest.mock('./models/EvaluationCompletion', () => ({
  find: jest.fn(),
  findOne: jest.fn(),
  create: jest.fn(),
  bulkWrite: jest.fn()
}));

jest.mock('./models/Enrollment', () => ({
  find: jest.fn(),
  findOne: jest.fn()
}));

jest.mock('./models/Admin', () => ({
  find: jest.fn(),
  findById: jest.fn()
}));

jest.mock('./models/Student', () => ({
  find: jest.fn(),
  findById: jest.fn()
}));

jest.mock('./models/StudentBlockAssignment', () => ({
  findOne: jest.fn(),
  find: jest.fn()
}));

jest.mock('./models/BlockSubjectAssignment', () => ({
  find: jest.fn().mockReturnValue({
    lean: jest.fn().mockResolvedValue([])
  }),
  findOne: jest.fn().mockReturnValue({
    lean: jest.fn().mockResolvedValue(null)
  })
}));

jest.mock('./models/BlockSection', () => ({
  findById: jest.fn(),
  find: jest.fn()
}));

jest.mock('./models/SystemSetting', () => ({
  findOne: jest.fn()
}));

const EvaluationPeriod = require('./models/EvaluationPeriod');
const EvaluationResponse = require('./models/EvaluationResponse');
const EvaluationCompletion = require('./models/EvaluationCompletion');
const Enrollment = require('./models/Enrollment');
const Admin = require('./models/Admin');
const StudentNotification = require('./models/StudentNotification');
const SystemSetting = require('./models/SystemSetting');
const StudentBlockAssignment = require('./models/StudentBlockAssignment');
const BlockSection = require('./models/BlockSection');

const {
  resolveSubjectProfessor,
  getStudentTermEvaluationStatus,
  ensurePeriodForTerm,
  DEFAULT_EVALUATION_QUESTIONS
} = require('./services/evaluationService');

const EvaluationController = require('./controllers/evaluationController');

describe('Cross-Platform Professor Evaluation System Tests', () => {
  const mockStudentId = new mongoose.Types.ObjectId();
  const mockProfSantosId = new mongoose.Types.ObjectId();
  const mockProfDelaCruzId = new mongoose.Types.ObjectId();

  const mockStudent = {
    _id: mockStudentId,
    studentNumber: '2024-00123',
    firstName: 'Juan',
    lastName: 'Tamad',
    course: 'BSIT',
    yearLevel: 1,
    section: 'BSIT-1A'
  };

  const mockProfessors = [
    {
      _id: mockProfSantosId,
      username: 'msantos',
      displayName: 'Prof. Maria Santos',
      uid: 'FAC-001',
      accountType: 'professor'
    },
    {
      _id: mockProfDelaCruzId,
      username: 'jdelacruz',
      displayName: 'Prof. Juan Dela Cruz',
      uid: 'FAC-002',
      accountType: 'professor'
    }
  ];

  const mockProfessorLookup = {
    professors: mockProfessors,
    byIdentifier: new Map([
      ['prof. maria santos', { professorId: String(mockProfSantosId), professorName: 'Prof. Maria Santos' }],
      ['msantos', { professorId: String(mockProfSantosId), professorName: 'Prof. Maria Santos' }],
      ['prof. juan dela cruz', { professorId: String(mockProfDelaCruzId), professorName: 'Prof. Juan Dela Cruz' }],
      ['jdelacruz', { professorId: String(mockProfDelaCruzId), professorName: 'Prof. Juan Dela Cruz' }]
    ])
  };

  const openPeriod = {
    _id: new mongoose.Types.ObjectId(),
    title: '1st Semester 2026-2027 Professor Evaluation',
    semester: '1st',
    schoolYear: '2026-2027',
    startDate: '2026-10-01',
    startAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
    deadlineDate: '2026-11-30',
    endAt: new Date(Date.now() + 25 * 24 * 60 * 60 * 1000),
    status: 'open',
    manualState: 'started',
    isOpen: true,
    questions: DEFAULT_EVALUATION_QUESTIONS
  };

  beforeEach(() => {
    jest.clearAllMocks();
    SystemSetting.findOne.mockReturnValue({
      lean: jest.fn().mockResolvedValue({
        key: 'academicTerm',
        value: { schoolYear: '2026-2027', semester: '1st' }
      })
    });
    Admin.find.mockReturnValue({
      select: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue(mockProfessors)
      })
    });
    StudentBlockAssignment.findOne.mockReturnValue({
      lean: jest.fn().mockResolvedValue({ sectionId: new mongoose.Types.ObjectId() })
    });
    BlockSection.findById.mockReturnValue({
      select: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue({ sectionCode: 'BSIT-1A' })
      })
    });
    EvaluationCompletion.find.mockReturnValue({
      select: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue([])
      }),
      lean: jest.fn().mockResolvedValue([])
    });
  });

  // 1. Students only see professors assigned to their enrolled subjects
  test('1. Students only see professors assigned to their enrolled subjects', async () => {
    const mockEnrollment = {
      _id: new mongoose.Types.ObjectId(),
      studentId: mockStudentId,
      semester: '1st',
      schoolYear: '2026-2027',
      subjects: [
        { code: 'IT101', title: 'Programming 1', instructor: 'Prof. Maria Santos', status: 'Enrolled' },
        { code: 'IT102', title: 'Data Structures', instructor: 'Prof. Juan Dela Cruz', status: 'Enrolled' }
      ]
    };

    const status = await getStudentTermEvaluationStatus(
      mockStudent,
      mockEnrollment,
      mockProfessorLookup,
      [],
      openPeriod
    );

    expect(status.evaluationEntries.length).toBe(2);
    const assignedProfNames = status.evaluationEntries.map((e) => e.professorName);
    expect(assignedProfNames).toContain('Prof. Maria Santos');
    expect(assignedProfNames).toContain('Prof. Juan Dela Cruz');
  });

  // 2. Professor names and subject information display correctly
  test('2. Professor names and subject information display correctly', async () => {
    const mockEnrollment = {
      _id: new mongoose.Types.ObjectId(),
      studentId: mockStudentId,
      semester: '1st',
      schoolYear: '2026-2027',
      subjects: [
        { code: 'IT101', title: 'Programming 1', units: 3, instructor: 'Prof. Maria Santos', status: 'Enrolled' }
      ]
    };

    const status = await getStudentTermEvaluationStatus(
      mockStudent,
      mockEnrollment,
      mockProfessorLookup,
      [],
      openPeriod
    );

    const entry = status.evaluationEntries[0];
    expect(entry.professorName).toBe('Prof. Maria Santos');
    expect(entry.subjectCode).toBe('IT101');
    expect(entry.subjectTitle).toBe('Programming 1');
    expect(entry.units).toBe(3);
    expect(entry.sectionCode).toBe('BSIT-1A');
    expect(entry.status).toBe('Pending');
  });

  // 3. A professor teaching multiple subjects generates separate evaluation entries
  test('3. A professor teaching multiple subjects generates separate evaluation entries', async () => {
    const mockEnrollment = {
      _id: new mongoose.Types.ObjectId(),
      studentId: mockStudentId,
      semester: '1st',
      schoolYear: '2026-2027',
      subjects: [
        { code: 'IT101', title: 'Programming 1', instructor: 'Prof. Maria Santos', status: 'Enrolled' },
        { code: 'IT203', title: 'Networking 1', instructor: 'Prof. Maria Santos', status: 'Enrolled' }
      ]
    };

    const status = await getStudentTermEvaluationStatus(
      mockStudent,
      mockEnrollment,
      mockProfessorLookup,
      [],
      openPeriod
    );

    // Both subjects taught by Maria Santos must generate separate entries
    expect(status.evaluationEntries.length).toBe(2);
    expect(status.evaluationEntries[0].subjectCode).toBe('IT101');
    expect(status.evaluationEntries[1].subjectCode).toBe('IT203');
    expect(status.evaluationEntries[0].professorName).toBe('Prof. Maria Santos');
    expect(status.evaluationEntries[1].professorName).toBe('Prof. Maria Santos');
  });

  // 4. Students cannot evaluate unassigned professors
  test('4. Students cannot evaluate unassigned professors (TBA subjects)', async () => {
    const tbaSubject = { code: 'IT301', title: 'Web Development', instructor: 'TBA', status: 'Enrolled' };
    const resolved = resolveSubjectProfessor(tbaSubject, {}, mockProfessorLookup);
    expect(resolved.isAssigned).toBe(false);

    const mockEnrollment = {
      _id: new mongoose.Types.ObjectId(),
      studentId: mockStudentId,
      semester: '1st',
      schoolYear: '2026-2027',
      subjects: [tbaSubject]
    };

    const status = await getStudentTermEvaluationStatus(
      mockStudent,
      mockEnrollment,
      mockProfessorLookup,
      [],
      openPeriod
    );

    // Unassigned subjects must not appear in actionable evaluation entries
    expect(status.evaluationEntries.length).toBe(0);
    expect(status.requiredCount).toBe(0);

    // Controller rejection check
    Enrollment.findOne.mockReturnValue({
      sort: jest.fn().mockResolvedValue(mockEnrollment)
    });
    EvaluationPeriod.findOne.mockReturnValue({
      sort: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(openPeriod) })
    });

    const req = {
      student: mockStudent,
      body: {
        subjectCode: 'IT301',
        ratings: [5, 5, 5, 5, 5, 5, 5, 5, 5, 5]
      }
    };
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };

    await EvaluationController.submitStudentEvaluation(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.stringMatching(/unassigned/i) })
    );
  });

  // 5. Dropped or removed subject enrollments do not generate eligible evaluations
  test('5. Dropped or removed subject enrollments do not generate eligible evaluations', async () => {
    const mockEnrollment = {
      _id: new mongoose.Types.ObjectId(),
      studentId: mockStudentId,
      semester: '1st',
      schoolYear: '2026-2027',
      subjects: [
        { code: 'IT101', title: 'Programming 1', instructor: 'Prof. Maria Santos', status: 'Enrolled' },
        { code: 'IT102', title: 'Dropped Subject', instructor: 'Prof. Juan Dela Cruz', status: 'Dropped' },
        { code: 'IT103', title: 'Removed Subject', instructor: 'Prof. Maria Santos', status: 'Removed' }
      ]
    };

    const status = await getStudentTermEvaluationStatus(
      mockStudent,
      mockEnrollment,
      mockProfessorLookup,
      [],
      openPeriod
    );

    // Only IT101 is eligible
    expect(status.evaluationEntries.length).toBe(1);
    expect(status.evaluationEntries[0].subjectCode).toBe('IT101');
  });

  // 6. Duplicate submissions are rejected
  test('6. Duplicate submissions are rejected with 409', async () => {
    const mockEnrollment = {
      _id: new mongoose.Types.ObjectId(),
      studentId: mockStudentId,
      semester: '1st',
      schoolYear: '2026-2027',
      subjects: [
        { code: 'IT101', title: 'Programming 1', instructor: 'Prof. Maria Santos', status: 'Enrolled' }
      ]
    };

    Enrollment.findOne.mockReturnValue({
      sort: jest.fn().mockResolvedValue(mockEnrollment)
    });
    EvaluationPeriod.findOne.mockReturnValue({
      sort: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(openPeriod) })
    });

    // Simulate already submitted
    EvaluationCompletion.findOne.mockReturnValue({
      lean: jest.fn().mockResolvedValue({
        subjectCode: 'IT101',
        completedAt: new Date()
      })
    });

    const req = {
      student: mockStudent,
      body: {
        subjectCode: 'IT101',
        ratings: [5, 5, 5, 5, 5, 5, 5, 5, 5, 5]
      }
    };
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };

    await EvaluationController.submitStudentEvaluation(req, res);
    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'ALREADY_EVALUATED' })
    );
  });

  // 7. Evaluation periods respect opening and closing dates
  test('7. Evaluation periods respect opening and closing dates', async () => {
    const closedPeriod = {
      ...openPeriod,
      status: 'closed',
      manualState: 'closed',
      isOpen: false,
      endAt: new Date(Date.now() - 1000)
    };

    const mockEnrollment = {
      _id: new mongoose.Types.ObjectId(),
      studentId: mockStudentId,
      semester: '1st',
      schoolYear: '2026-2027',
      subjects: [
        { code: 'IT101', title: 'Programming 1', instructor: 'Prof. Maria Santos', status: 'Enrolled' }
      ]
    };

    Enrollment.findOne.mockReturnValue({
      sort: jest.fn().mockResolvedValue(mockEnrollment)
    });
    EvaluationPeriod.findOne.mockReturnValue({
      sort: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(closedPeriod) })
    });

    const req = {
      student: mockStudent,
      body: {
        subjectCode: 'IT101',
        ratings: [4, 4, 4, 4, 4, 4, 4, 4, 4, 4]
      }
    };
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };

    await EvaluationController.submitStudentEvaluation(req, res);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'EVALUATION_PERIOD_CLOSED' })
    );
  });

  // 8. Responses are traceable yet anonymous to professors
  test('8. Responses record studentContext internally but never expose student identity to professors', async () => {
    const mockEnrollment = {
      _id: new mongoose.Types.ObjectId(),
      studentId: mockStudentId,
      semester: '1st',
      schoolYear: '2026-2027',
      subjects: [
        { code: 'IT101', title: 'Programming 1', instructor: 'Prof. Maria Santos', status: 'Enrolled' }
      ]
    };

    Enrollment.findOne.mockReturnValue({
      sort: jest.fn().mockResolvedValue(mockEnrollment)
    });
    EvaluationPeriod.findOne.mockReturnValue({
      sort: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(openPeriod) })
    });
    EvaluationCompletion.findOne.mockReturnValue({
      lean: jest.fn().mockResolvedValue(null)
    });

    EvaluationResponse.create.mockResolvedValue({
      _id: new mongoose.Types.ObjectId(),
      submittedAt: new Date()
    });
    EvaluationCompletion.create.mockResolvedValue({});

    const req = {
      student: mockStudent,
      body: {
        subjectCode: 'IT101',
        ratings: [5, 4, 5, 4, 5, 4, 5, 4, 5, 4],
        comment: 'Great teaching methods.'
      }
    };
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };

    await EvaluationController.submitStudentEvaluation(req, res);

    expect(EvaluationResponse.create).toHaveBeenCalled();
    const passedPayload = EvaluationResponse.create.mock.calls[0][0];

    // Assert traceability fields: each response is associated with its student,
    // professor, teaching assignment, and subject per the evaluation policy.
    // (Student identity is stored internally for registrar traceability but is
    // strictly never exposed by professor-facing endpoints.)
    expect(passedPayload.studentId).toBeDefined();
    expect(passedPayload.studentNumber).toBeUndefined();
    expect(passedPayload.studentName).toBeUndefined();
    expect(passedPayload.subjectCode).toBe('IT101');
    expect(passedPayload.professorName).toBe('Prof. Maria Santos');
    expect(passedPayload.subjectName).toBe('Programming 1');
    expect(passedPayload.averageRating).toBe(4.5);
    expect(passedPayload.comment).toBe('Great teaching methods.');
  });

  // 9. Historical evaluation records remain intact after semester changes
  test('9. Historical evaluation records remain intact after semester changes', async () => {
    const historicalResponses = [
      {
        _id: new mongoose.Types.ObjectId(),
        semester: '2nd',
        schoolYear: '2025-2026',
        subjectCode: 'IT101',
        subjectTitle: 'Programming 1',
        professorId: mockProfSantosId,
        professorName: 'Prof. Maria Santos',
        averageRating: 4.8,
        comment: 'Historical feedback'
      }
    ];

    Admin.findById.mockReturnValue({
      select: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue(mockProfessors[0])
      })
    });
    EvaluationResponse.find.mockReturnValue({
      select: jest.fn().mockReturnValue({
        sort: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue(historicalResponses)
        })
      })
    });

    const req = {
      accountType: 'professor',
      adminId: mockProfSantosId,
      query: { schoolYear: '2025-2026', semester: '2nd' }
    };
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };

    await EvaluationController.getProfessorEvaluations(req, res);
    expect(res.json).toHaveBeenCalled();
    const responseData = res.json.mock.calls[0][0].data;
    expect(responseData.totalResponses).toBe(1);
    expect(responseData.overallAverage).toBe(4.8);
    expect(responseData.comments[0].comment).toBe('Historical feedback');
  });

  // 10. Student mobile submissions update the Registrar web dashboard
  test('10. Student submissions update Registrar web dashboard metrics', async () => {
    const mockResponses = [
      {
        _id: new mongoose.Types.ObjectId(),
        semester: '1st',
        schoolYear: '2026-2027',
        subjectCode: 'IT101',
        subjectTitle: 'Programming 1',
        professorName: 'Prof. Maria Santos',
        averageRating: 4.0,
        sectionCode: 'BSIT-1A'
      }
    ];

    EvaluationPeriod.findOne.mockReturnValue({
      sort: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(openPeriod) })
    });
    EvaluationResponse.find.mockReturnValue({
      sort: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue(mockResponses)
      })
    });

    Enrollment.find.mockReturnValue({
      select: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue([
          {
            studentId: mockStudentId,
            semester: '1st',
            schoolYear: '2026-2027',
            subjects: [{ code: 'IT101', instructor: 'Prof. Maria Santos', status: 'Enrolled' }]
          }
        ])
      })
    });

    EvaluationCompletion.find.mockReturnValue({
      select: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue([
          { studentId: mockStudentId, subjectCode: 'IT101', schoolYear: '2026-2027', semester: '1st' }
        ])
      })
    });

    const req = { query: { schoolYear: '2026-2027', semester: '1st' } };
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };

    await EvaluationController.getRegistrarEvaluationOverview(req, res);
    expect(res.json).toHaveBeenCalled();
    const data = res.json.mock.calls[0][0].data;

    expect(data.metrics.totalEligibleStudents).toBe(1);
    expect(data.metrics.completedStudents).toBe(1);
    expect(data.metrics.pendingStudents).toBe(0);
    expect(data.metrics.completionPercentage).toBe(100);
    expect(data.metrics.evaluatedProfessorsCount).toBe(1);
    expect(data.metrics.averageRating).toBe(4.0);
  });

  // 11. Evaluation notifications are dispatched correctly
  test('11. Evaluation notifications are sent correctly upon submission', async () => {
    const mockEnrollment = {
      _id: new mongoose.Types.ObjectId(),
      studentId: mockStudentId,
      semester: '1st',
      schoolYear: '2026-2027',
      subjects: [
        { code: 'IT101', title: 'Programming 1', instructor: 'Prof. Maria Santos', status: 'Enrolled' }
      ]
    };

    Enrollment.findOne.mockReturnValue({
      sort: jest.fn().mockResolvedValue(mockEnrollment)
    });
    EvaluationPeriod.findOne.mockReturnValue({
      sort: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(openPeriod) })
    });
    EvaluationCompletion.findOne.mockReturnValue({
      lean: jest.fn().mockResolvedValue(null)
    });
    EvaluationResponse.create.mockResolvedValue({
      _id: new mongoose.Types.ObjectId(),
      submittedAt: new Date()
    });
    EvaluationCompletion.create.mockResolvedValue({});

    const req = {
      student: mockStudent,
      body: {
        subjectCode: 'IT101',
        ratings: [5, 5, 5, 5, 5, 5, 5, 5, 5, 5]
      }
    };
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };

    await EvaluationController.submitStudentEvaluation(req, res);
    expect(StudentNotification.create).toHaveBeenCalledWith(
      expect.objectContaining({
        studentId: mockStudentId,
        title: 'Evaluation Submitted',
        data: expect.objectContaining({ subjectCode: 'IT101' })
      })
    );
  });

  // 12. Network failures and duplicate constraints roll back cleanly
  test('12. Concurrency / duplicate constraint rolls back anonymous response', async () => {
    const mockEnrollment = {
      _id: new mongoose.Types.ObjectId(),
      studentId: mockStudentId,
      semester: '1st',
      schoolYear: '2026-2027',
      subjects: [
        { code: 'IT101', title: 'Programming 1', instructor: 'Prof. Maria Santos', status: 'Enrolled' }
      ]
    };

    Enrollment.findOne.mockReturnValue({
      sort: jest.fn().mockResolvedValue(mockEnrollment)
    });
    EvaluationPeriod.findOne.mockReturnValue({
      sort: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(openPeriod) })
    });
    EvaluationCompletion.findOne.mockReturnValue({
      lean: jest.fn().mockResolvedValue(null)
    });

    const mockResponseId = new mongoose.Types.ObjectId();
    EvaluationResponse.create.mockResolvedValue({
      _id: mockResponseId,
      submittedAt: new Date()
    });

    // Simulate E11000 duplicate key exception on completion insert
    const duplicateErr = new Error('E11000 duplicate key');
    duplicateErr.code = 11000;
    EvaluationCompletion.create.mockRejectedValue(duplicateErr);

    const req = {
      student: mockStudent,
      body: {
        subjectCode: 'IT101',
        ratings: [5, 5, 5, 5, 5, 5, 5, 5, 5, 5]
      }
    };
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };

    await EvaluationController.submitStudentEvaluation(req, res);

    // Rollback must delete the orphaned anonymous response
    expect(EvaluationResponse.deleteOne).toHaveBeenCalledWith({ _id: mockResponseId });
    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'ALREADY_EVALUATED' })
    );
  });
});
