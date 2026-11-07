const {
  verifyGrades,
  publishGrades
} = require('./controllers/gradeSubmissionController');
const Enrollment = require('./models/Enrollment');
const GradeAuditLog = require('./models/GradeAuditLog');
const StudentNotification = require('./models/StudentNotification');
const studentLifecycleService = require('./services/studentLifecycleService');
const mongoose = require('mongoose');

jest.mock('./models/Enrollment');
jest.mock('./models/GradeAuditLog');
jest.mock('./models/StudentNotification');
jest.mock('./services/studentLifecycleService', () => ({
  evaluateStudentAcademicStanding: jest.fn().mockResolvedValue({ changed: false })
}));
jest.mock('./services/schoolYearLockService', () => ({
  assertSchoolYearWritable: jest.fn().mockResolvedValue(undefined)
}));

describe('grade verification / publication student notifications', () => {
  const enrollmentId = new mongoose.Types.ObjectId();
  const studentId = new mongoose.Types.ObjectId();
  const adminId = new mongoose.Types.ObjectId();
  const verifiedAt = new Date('2026-10-30T08:00:00.000Z');
  const publishedAt = new Date('2026-10-31T08:00:00.000Z');

  const buildEnrollment = (subjectStatus) => ({
    _id: enrollmentId,
    studentId,
    studentNumber: '2026-0001',
    schoolYear: '2026-2027',
    semester: '1st',
    subjects: [
      {
        subjectId: new mongoose.Types.ObjectId(),
        code: 'IT101',
        title: 'Programming 1',
        instructor: 'Prof. Maria Santos',
        grade: 1.25,
        gradeMark: '1.25',
        status: 'Enrolled',
        submissionStatus: subjectStatus
      },
      {
        subjectId: new mongoose.Types.ObjectId(),
        code: 'ENG101',
        title: 'English Communication',
        instructor: 'Prof. Luis Cruz',
        grade: 1.75,
        status: 'Enrolled',
        submissionStatus: subjectStatus
      }
    ],
    gradeSubmission: subjectStatus === 'Verified'
      ? { status: 'Verified', verifiedAt }
      : { status: 'Verified', verifiedAt, publishedAt },
    save: jest.fn().mockResolvedValue(true),
    markModified: jest.fn(),
    lockedAt: null
  });

  const buildRes = () => ({
    status: jest.fn().mockReturnThis(),
    json: jest.fn()
  });

  beforeEach(() => {
    jest.clearAllMocks();
    Enrollment.computeAggregateSubmissionStatus = jest.fn().mockReturnValue('OK');
    GradeAuditLog.create = jest.fn().mockResolvedValue({});
    GradeAuditLog.insertMany = jest.fn().mockResolvedValue([]);
    StudentNotification.updateOne = jest.fn().mockResolvedValue({});
    Enrollment.findById = jest.fn();
  });

  test('verifyGrades notifies the student with the verified subject codes', async () => {
    const mockEnrollment = buildEnrollment('Submitted');

    Enrollment.findById.mockResolvedValue(mockEnrollment);

    const req = {
      params: { enrollmentId: enrollmentId.toString() },
      adminId,
      accountType: 'registrar',
      body: {}
    };
    const res = buildRes();

    await verifyGrades(req, res);

    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    expect(mockEnrollment.save).toHaveBeenCalled();

    expect(StudentNotification.updateOne).toHaveBeenCalledTimes(1);
    const [filter, update] = StudentNotification.updateOne.mock.calls[0];
    const expectedVerifiedKey = `grade-verified:${enrollmentId}:${mockEnrollment.gradeSubmission.verifiedAt.toISOString()}`;
    expect(filter.studentId).toBe(studentId);
    expect(filter.eventKey).toBe(expectedVerifiedKey);
    expect(update.$setOnInsert.eventKey).toBe(expectedVerifiedKey);
    expect(update.$setOnInsert).toEqual(expect.objectContaining({
      type: 'ACADEMIC',
      title: 'Grades Verified',
      studentNumber: '2026-0001'
    }));
    expect(update.$setOnInsert.message).toContain('IT101, ENG101');
    expect(update.$setOnInsert.data).toEqual(expect.objectContaining({
      action: 'verified',
      subjectCodes: ['IT101', 'ENG101'],
      verifiedAt: mockEnrollment.gradeSubmission.verifiedAt
    }));
  });

  test('publishGrades notifies the student that grades are published', async () => {
    const mockEnrollment = buildEnrollment('Verified');

    Enrollment.findById.mockResolvedValue(mockEnrollment);

    const req = {
      params: { enrollmentId: enrollmentId.toString() },
      adminId,
      accountType: 'registrar',
      body: {}
    };
    const res = buildRes();

    await publishGrades(req, res);

    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: true,
      message: 'Grades published. Students can now view their grades.'
    }));
    expect(mockEnrollment.subjects.every((s) => s.submissionStatus === 'Published')).toBe(true);

    expect(StudentNotification.updateOne).toHaveBeenCalledTimes(1);
    const [filter, update] = StudentNotification.updateOne.mock.calls[0];
    const expectedPublishedKey = `grade-published:${enrollmentId}:${mockEnrollment.gradeSubmission.publishedAt.toISOString()}`;
    expect(filter.eventKey).toBe(expectedPublishedKey);
    expect(update.$setOnInsert).toEqual(expect.objectContaining({
      type: 'ACADEMIC',
      title: 'Grades Published'
    }));
    expect(update.$setOnInsert.message).toContain('have been published by the Registrar and are now official');
    expect(update.$setOnInsert.data).toEqual(expect.objectContaining({
      action: 'published',
      subjectCodes: ['IT101', 'ENG101'],
      publishedAt: mockEnrollment.gradeSubmission.publishedAt
    }));
  });

  test('notification failure is non-fatal for the grade transition', async () => {
    const mockEnrollment = buildEnrollment('Verified');
    Enrollment.findById.mockResolvedValue(mockEnrollment);
    StudentNotification.updateOne = jest.fn().mockRejectedValue(new Error('db hiccup'));

    const req = {
      params: { enrollmentId: enrollmentId.toString() },
      adminId,
      accountType: 'registrar',
      body: {}
    };
    const res = buildRes();

    await publishGrades(req, res);

    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    expect(mockEnrollment.save).toHaveBeenCalled();
  });

  test('skips notification when there is nothing to transition', async () => {
    const mockEnrollment = buildEnrollment('Published');
    Enrollment.findById.mockResolvedValue(mockEnrollment);

    const req = {
      params: { enrollmentId: enrollmentId.toString() },
      adminId,
      accountType: 'registrar',
      body: {}
    };
    const res = buildRes();

    await verifyGrades(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(StudentNotification.updateOne).not.toHaveBeenCalled();
  });
});
