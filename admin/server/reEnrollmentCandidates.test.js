/**
 * Unit tests for the registrar re-enrollment candidate feed.
 *
 * The feed is deliberately latest-attempt-only: a failure that was later
 * passed is not a retake, and a failure in the target term does not make the
 * student irregular for that same term.
 */

jest.mock('./models/Student', () => ({
  find: jest.fn(),
}));

jest.mock('./models/Enrollment', () => ({
  find: jest.fn(),
}));

jest.mock('./services/subjectEnrollmentService', () => ({
  isLaterTerm: (aYear, aSemester, bYear, bSemester) => {
    const order = { '1st': 0, '2nd': 1, Summer: 2 };
    const aStart = Number(String(aYear || '').split('-')[0]);
    const bStart = Number(String(bYear || '').split('-')[0]);
    if (!Number.isFinite(aStart) || !Number.isFinite(bStart)) return false;
    if (aStart !== bStart) return aStart > bStart;
    return (order[aSemester] ?? -1) > (order[bSemester] ?? -1);
  },
  isRetakeableAttempt: (entry) => {
    if (!entry) return false;
    const status = String(entry.status || '').toLowerCase();
    if (status === 'dropped' || status === 'removed') return true;
    const mark = String(entry.gradeMark || '').toUpperCase();
    if (mark === 'FA' || mark === 'DRP') return true;
    return typeof entry.grade === 'number' && entry.grade > 3.0;
  },
}));

jest.mock('./services/curriculumProgressService', () => ({}));

jest.mock('./services/reEnrollmentVerificationService', () => ({
  getActiveTerm: jest.fn(async () => ({ schoolYear: '2026-2027', semester: '1st' })),
  getRolloverReadiness: jest.fn(() => ({ ready: true, message: '', reasonCode: null })),
  getVerificationsForStudents: jest.fn(async () => new Map()),
  serializeVerification: jest.fn((record, email) => ({
    status: record?.status || 'none',
    maskedEmail: email || '',
    maskedPhone: '',
    sentVia: [],
    sentAt: null,
    codeExpiresAt: null,
    verifiedAt: null,
    verificationExpiresAt: null,
  })),
}));

const Student = require('./models/Student');
const Enrollment = require('./models/Enrollment');
const verificationService = require('./services/reEnrollmentVerificationService');
const EnrollmentManagementController = require('./controllers/enrollmentManagementController');

function chain(value) {
  const result = {};
  for (const method of ['select', 'sort', 'lean']) {
    result[method] = jest.fn(() => result);
  }
  result.then = (onFulfilled, onRejected) => Promise.resolve(value).then(onFulfilled, onRejected);
  result.catch = (onRejected) => Promise.resolve(value).catch(onRejected);
  return result;
}

function mockRes() {
  const res = {
    statusCode: 200,
    body: null,
    status: jest.fn(function status(code) {
      res.statusCode = code;
      return res;
    }),
    json: jest.fn(function json(payload) {
      res.body = payload;
      return res;
    }),
  };
  return res;
}

function student(overrides = {}) {
  return {
    _id: '64b000000000000000000001',
    studentNumber: '2026-101-0001',
    firstName: 'Ana',
    lastName: 'Cruz',
    course: 101,
    yearLevel: 1,
    schoolYear: '2026-2027',
    semester: '1st',
    lifecycleStatus: 'Enrolled',
    isActive: true,
    ...overrides,
  };
}

function enrollment(overrides = {}) {
  return {
    _id: '64b000000000000000000031',
    studentId: '64b000000000000000000001',
    schoolYear: '2026-2027',
    semester: '1st',
    status: 'Enrolled',
    subjects: [],
    ...overrides,
  };
}

function callFeed(query) {
  const res = mockRes();
  return EnrollmentManagementController.getReEnrollmentCandidates({ query }, res).then(() => res);
}

describe('getReEnrollmentCandidates', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('returns candidates and reports an earlier failure as a retake', async () => {
    Student.find.mockReturnValue(chain([
      student(),
      student({
        _id: '64b000000000000000000002',
        studentNumber: '2026-101-0002',
        firstName: 'Ben',
        lastName: 'Santos',
      }),
    ]));
    Enrollment.find.mockReturnValue(chain([
      enrollment({
        subjects: [
          { subjectId: 'subject-eng', code: 'ENG101', title: 'Rizal', units: 3, grade: 5.0, gradeMark: 'FA', status: 'Completed' },
        ],
      }),
      enrollment({
        _id: '64b000000000000000000032',
        studentId: '64b000000000000000000002',
        schoolYear: '2026-2027',
        semester: '2nd',
        status: 'Enrolled',
        subjects: [],
      }),
    ]));

    const res = await callFeed({ schoolYear: '2026-2027', semester: '2nd' });

    expect(res.statusCode).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].studentNumber).toBe('2026-101-0001');
    expect(res.body.data[0].reEnrollment.needsRetake).toBe(true);
    expect(res.body.data[0].reEnrollment.retakeSubjects).toEqual([
      expect.objectContaining({ code: 'ENG101', outcome: 'Failed' }),
    ]);
    expect(res.body.data[0].reEnrollment.gradeSummary).toEqual(expect.objectContaining({
      gwa: 5,
      gradedCount: 1,
      subjectCount: 1,
      term: { schoolYear: '2026-2027', semester: '1st' },
    }));
    expect(res.body.data[0].reEnrollment.gradeSummary.subjects[0]).toEqual(expect.objectContaining({
      code: 'ENG101',
      grade: 5,
    }));
    expect(res.body.data[0].reEnrollment.verification.status).toBe('none');
    expect(res.body.meta).toEqual(expect.objectContaining({
      rolloverReady: true,
      activeTerm: { schoolYear: '2026-2027', semester: '1st' },
    }));
  });

  test('returns candidates with rollover metadata when enrollment is not ready', async () => {
    verificationService.getRolloverReadiness.mockReturnValueOnce({
      ready: false,
      message: 'Complete the 2026-2027 rollover first.',
      reasonCode: 'ROLLOVER_REQUIRED',
    });
    Student.find.mockReturnValue(chain([student({ semester: '2nd' })]));
    Enrollment.find.mockReturnValue(chain([
      enrollment({
        semester: '2nd',
        subjects: [
          { subjectId: 'subject-eng', code: 'ENG101', title: 'Rizal', units: 3, grade: 1.5, gradeMark: null, status: 'Completed' },
        ],
      }),
    ]));

    const res = await callFeed({ schoolYear: '2027-2028', semester: '1st' });

    expect(res.statusCode).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.meta).toEqual(expect.objectContaining({
      rolloverReady: false,
      rolloverMessage: 'Complete the 2026-2027 rollover first.',
    }));
    expect(res.body.data[0].reEnrollment.rolloverReady).toBe(false);
  });

  test('does not flag a failure in the target term itself', async () => {
    Student.find.mockReturnValue(chain([student()]));
    Enrollment.find.mockReturnValue(chain([
      enrollment({
        // The whole term was dropped, so the student is still a candidate,
        // but the subject attempt belongs to the target term and must not be
        // treated as a prior failure.
        status: 'Dropped',
        subjects: [
          { subjectId: 'subject-eng', code: 'ENG101', title: 'Rizal', units: 3, grade: null, gradeMark: 'DRP', status: 'Dropped' },
        ],
      }),
    ]));

    const res = await callFeed({ schoolYear: '2026-2027', semester: '1st' });

    expect(res.statusCode).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].reEnrollment.needsRetake).toBe(false);
  });

  test('clears a failure when a later retake passed', async () => {
    Student.find.mockReturnValue(chain([
      student({ semester: '2nd' }),
    ]));
    Enrollment.find.mockReturnValue(chain([
      enrollment({
        subjects: [
          { subjectId: 'subject-eng', code: 'ENG101', title: 'Rizal', units: 3, grade: 5.0, gradeMark: 'FA', status: 'Completed' },
        ],
      }),
      enrollment({
        _id: '64b000000000000000000032',
        semester: '2nd',
        subjects: [
          { subjectId: 'subject-eng', code: 'ENG101', title: 'Rizal', units: 3, grade: 2.0, gradeMark: null, status: 'Completed' },
        ],
      }),
    ]));

    const res = await callFeed({ schoolYear: '2027-2028', semester: '1st' });

    expect(res.statusCode).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].reEnrollment.needsRetake).toBe(false);
  });
});
