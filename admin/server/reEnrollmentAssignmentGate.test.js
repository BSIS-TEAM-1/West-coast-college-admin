/**
 * The assignment path is the last line of defence for re-enrollment. Even if
 * the UI is bypassed, a later-term assignment must have a live email
 * verification and the target school year must be ready.
 */

jest.mock('./models/BlockSection', () => ({ findById: jest.fn() }));
jest.mock('./models/BlockGroup', () => ({ findById: jest.fn() }));
jest.mock('./models/Student', () => ({ findById: jest.fn() }));
jest.mock('./services/schoolYearLockService', () => ({ assertSchoolYearWritable: jest.fn() }));
jest.mock('./services/blockEligibilityService', () => ({
  findActiveEnrollment: jest.fn(),
  hasPriorEnrollmentHistory: jest.fn(),
  evaluateStudentEligibility: jest.fn(),
}));
jest.mock('./services/reEnrollmentVerificationService', () => ({
  getActiveTerm: jest.fn(),
  getRolloverReadiness: jest.fn(),
  findVerifiedEnrollment: jest.fn(),
  consumeVerification: jest.fn(),
}));

const BlockSection = require('./models/BlockSection');
const BlockGroup = require('./models/BlockGroup');
const Student = require('./models/Student');
const schoolYearLockService = require('./services/schoolYearLockService');
const blockEligibilityService = require('./services/blockEligibilityService');
const verificationService = require('./services/reEnrollmentVerificationService');
const blockController = require('./controllers/blockController');

function chain(value) {
  const result = {};
  for (const method of ['select', 'session']) {
    result[method] = jest.fn(() => result);
  }
  result.then = (onFulfilled, onRejected) => Promise.resolve(value).then(onFulfilled, onRejected);
  result.catch = (onRejected) => Promise.resolve(value).catch(onRejected);
  return result;
}

function mockAssignmentGraph() {
  const section = {
    _id: 'section-1',
    status: 'OPEN',
    blockGroupId: 'group-1',
    sectionCode: '101-1-A',
    capacity: 40,
    currentPopulation: 10,
  };
  const group = {
    _id: 'group-1',
    schoolYear: '2027-2028',
    semester: '1st',
    year: '2027-2028',
    courseId: 101,
    yearLevel: 2,
    name: '101-2-A',
  };
  const student = {
    _id: 'student-1',
    studentNumber: '2026-101-0001',
    course: 101,
    yearLevel: 1,
    schoolYear: '2026-2027',
    semester: '2nd',
    studentStatus: 'Regular',
    classification: 'Regular',
  };
  section.toObject = () => section;
  group.toObject = () => group;
  student.toObject = () => student;

  BlockSection.findById.mockReturnValue(chain(section));
  BlockGroup.findById.mockReturnValue(chain(group));
  Student.findById.mockReturnValue(chain(student));
}

function assignmentInput() {
  return {
    studentId: 'student-1',
    sectionId: 'section-1',
    year: '2027-2028',
    actorId: 'registrar-1',
    session: {},
    enforceReEnrollmentVerification: true,
  };
}

describe('performAssignment re-enrollment gate', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    schoolYearLockService.assertSchoolYearWritable.mockResolvedValue(undefined);
    verificationService.getActiveTerm.mockResolvedValue({ schoolYear: '2027-2028', semester: '1st' });
    verificationService.getRolloverReadiness.mockReturnValue({ ready: true, message: '', reasonCode: null });
    verificationService.findVerifiedEnrollment.mockResolvedValue(null);
    verificationService.consumeVerification.mockResolvedValue(undefined);
    mockAssignmentGraph();
  });

  test('rejects a later-term assignment without a verified email', async () => {
    const result = await blockController.performAssignment(assignmentInput());

    expect(result).toMatchObject({
      ok: false,
      httpStatus: 428,
      checks: { reEnrollmentVerified: false },
    });
    expect(verificationService.findVerifiedEnrollment).toHaveBeenCalledWith(expect.objectContaining({
      studentId: 'student-1',
      schoolYear: '2027-2028',
      semester: '1st',
    }));
    expect(verificationService.consumeVerification).not.toHaveBeenCalled();
  });

  test('rejects the assignment while the target school year is not rolled over', async () => {
    verificationService.getRolloverReadiness.mockReturnValue({
      ready: false,
      message: 'Complete the 2026-2027 rollover first.',
      reasonCode: 'ROLLOVER_REQUIRED',
    });

    const result = await blockController.performAssignment(assignmentInput());

    expect(result).toMatchObject({
      ok: false,
      httpStatus: 409,
      checks: { rolloverReady: false },
    });
    expect(verificationService.findVerifiedEnrollment).not.toHaveBeenCalled();
  });

  test('consumes a live verification before the assignment proceeds', async () => {
    verificationService.findVerifiedEnrollment.mockResolvedValue({ _id: 'verification-1' });
    blockEligibilityService.findActiveEnrollment.mockResolvedValue({
      _id: 'enrollment-1',
      schoolYear: '2027-2028',
      semester: '1st',
      status: 'Enrolled',
      subjects: [],
    });
    blockEligibilityService.evaluateStudentEligibility.mockReturnValue({
      eligible: false,
      reasons: ['Test stop after the verification gate.'],
      checks: {},
    });

    const result = await blockController.performAssignment(assignmentInput());

    expect(verificationService.consumeVerification).toHaveBeenCalledWith({
      id: 'verification-1',
      session: {},
    });
    expect(result.ok).toBe(false);
    expect(result.httpStatus).toBe(400);
  });

  test('does not require email verification from the program-shift path', async () => {
    blockEligibilityService.findActiveEnrollment.mockResolvedValue({
      _id: 'enrollment-1',
      schoolYear: '2027-2028',
      semester: '1st',
      status: 'Enrolled',
      subjects: [],
    });
    blockEligibilityService.evaluateStudentEligibility.mockReturnValue({
      eligible: false,
      reasons: ['Test stop.'],
      checks: {},
    });

    await blockController.performAssignment({
      ...assignmentInput(),
      enforceReEnrollmentVerification: false,
    });

    expect(verificationService.findVerifiedEnrollment).not.toHaveBeenCalled();
  });

  test('does not require re-enrollment verification when assigning within the same school year (by semester)', async () => {
    const section = {
      _id: 'section-2nd',
      status: 'OPEN',
      blockGroupId: 'group-2nd',
      sectionCode: '101-1-A',
      capacity: 40,
      currentPopulation: 10,
    };
    const group = {
      _id: 'group-2nd',
      schoolYear: '2026-2027',
      semester: '2nd',
      year: '2026-2027',
      courseId: 101,
      yearLevel: 1,
      name: '101-1-A',
    };
    const student = {
      _id: 'student-1',
      studentNumber: '2026-101-0001',
      course: 101,
      yearLevel: 1,
      schoolYear: '2026-2027',
      semester: '1st', // Same school year, earlier semester
      studentStatus: 'Regular',
      classification: 'Regular',
    };
    section.toObject = () => section;
    group.toObject = () => group;
    student.toObject = () => student;

    BlockSection.findById.mockReturnValue(chain(section));
    BlockGroup.findById.mockReturnValue(chain(group));
    Student.findById.mockReturnValue(chain(student));

    blockEligibilityService.findActiveEnrollment.mockResolvedValue({
      _id: 'enrollment-2nd',
      schoolYear: '2026-2027',
      semester: '2nd',
      status: 'Enrolled',
      subjects: [],
    });
    blockEligibilityService.evaluateStudentEligibility.mockReturnValue({
      eligible: false,
      reasons: ['Stop after gate check.'],
      checks: {},
    });

    await blockController.performAssignment({
      studentId: 'student-1',
      sectionId: 'section-2nd',
      year: '2026-2027',
      actorId: 'registrar-1',
      session: {},
      enforceReEnrollmentVerification: true,
      forceReEnrollmentVerification: false,
    });

    expect(verificationService.findVerifiedEnrollment).not.toHaveBeenCalled();
  });

  test('BUG-01: immediately rejects a Dropped student before checking or consuming verification', async () => {
    const droppedStudent = {
      _id: 'student-1',
      studentNumber: '2026-101-0001',
      course: 101,
      yearLevel: 1,
      schoolYear: '2026-2027',
      semester: '2nd',
      lifecycleStatus: 'Dropped',
      studentStatus: 'Regular',
      classification: 'Regular',
    };
    droppedStudent.toObject = () => droppedStudent;
    Student.findById.mockReturnValue(chain(droppedStudent));

    const result = await blockController.performAssignment(assignmentInput());

    expect(result.ok).toBe(false);
    expect(result.httpStatus).toBe(403);
    expect(result.error).toContain('Dropped students require authorized readmission before block assignment.');
    expect(verificationService.findVerifiedEnrollment).not.toHaveBeenCalled();
    expect(verificationService.consumeVerification).not.toHaveBeenCalled();
  });

  test('BUG-02: requires verification server-side when a returning student has no active enrollment for the target term even without forceReEnrollmentVerification', async () => {
    const section = {
      _id: 'section-2nd',
      status: 'OPEN',
      blockGroupId: 'group-2nd',
      sectionCode: '101-1-A',
      capacity: 40,
      currentPopulation: 10,
      toObject() { return this; },
    };
    const group = {
      _id: 'group-2nd',
      schoolYear: '2026-2027',
      semester: '2nd',
      year: '2026-2027',
      courseId: 101,
      yearLevel: 1,
      name: '101-1-A',
      toObject() { return this; },
    };
    const student = {
      _id: 'student-1',
      studentNumber: '2026-101-0001',
      course: 101,
      yearLevel: 1,
      schoolYear: '2026-2027',
      semester: '1st',
      lifecycleStatus: 'Enrolled',
      studentStatus: 'Regular',
      classification: 'Regular',
      toObject() { return this; },
    };

    BlockSection.findById.mockReturnValue(chain(section));
    BlockGroup.findById.mockReturnValue(chain(group));
    Student.findById.mockReturnValue(chain(student));
    // No active enrollment for 2026-2027 2nd semester -> server detects re-enrollment!
    blockEligibilityService.findActiveEnrollment.mockResolvedValue(null);
    verificationService.findVerifiedEnrollment.mockResolvedValue(null);

    const result = await blockController.performAssignment({
      studentId: 'student-1',
      sectionId: 'section-2nd',
      year: '2026-2027',
      actorId: 'registrar-1',
      session: {},
      enforceReEnrollmentVerification: true,
      forceReEnrollmentVerification: false,
    });

    expect(result.ok).toBe(false);
    expect(result.httpStatus).toBe(428);
    expect(result.checks?.reEnrollmentVerified).toBe(false);
    expect(verificationService.findVerifiedEnrollment).toHaveBeenCalled();
  });

  test('BUG-08: aborts assignment with 409 when verification is concurrently consumed by another request', async () => {
    verificationService.findVerifiedEnrollment.mockResolvedValue({ _id: 'verification-1' });
    verificationService.consumeVerification.mockResolvedValue(false);
    blockEligibilityService.findActiveEnrollment.mockResolvedValue(null);

    const result = await blockController.performAssignment(assignmentInput());

    expect(result.ok).toBe(false);
    expect(result.httpStatus).toBe(409);
    expect(result.checks?.reEnrollmentVerified).toBe(false);
  });

  test('does NOT require re-enrollment verification for a newly admitted student with no previous enrollment history', async () => {
    const section = {
      _id: 'section-1st',
      status: 'OPEN',
      blockGroupId: 'group-1st',
      sectionCode: '101-1-A',
      capacity: 40,
      currentPopulation: 10,
      toObject() { return this; },
    };
    const group = {
      _id: 'group-1st',
      schoolYear: '2026-2027',
      semester: '1st',
      year: '2026-2027',
      courseId: 101,
      yearLevel: 1,
      name: '101-1-A',
      toObject() { return this; },
    };
    const newStudent = {
      _id: 'student-new',
      studentNumber: '202610155906',
      course: 101,
      yearLevel: 1,
      schoolYear: '2026-2027',
      semester: '1st',
      lifecycleStatus: 'Pending',
      enrollmentStatus: 'Not Enrolled',
      studentStatus: 'Regular',
      classification: 'Regular',
      lifecycleStatusHistory: [],
      toObject() { return this; },
    };

    BlockSection.findById.mockReturnValue(chain(section));
    BlockGroup.findById.mockReturnValue(chain(group));
    Student.findById.mockReturnValue(chain(newStudent));
    blockEligibilityService.findActiveEnrollment.mockResolvedValue(null);
    blockEligibilityService.hasPriorEnrollmentHistory.mockResolvedValue(false);
    blockEligibilityService.evaluateStudentEligibility.mockReturnValue({
      eligible: false,
      reasons: ['Stop after re-enrollment gate check.'],
      checks: {},
    });

    const spyCreateEnrollment = jest
      .spyOn(blockController, 'createEnrollmentForBlockAssignment')
      .mockResolvedValueOnce({
        _id: 'enrollment-new-1',
        schoolYear: '2026-2027',
        semester: '1st',
        status: 'Pending',
        subjects: [],
      });

    const result = await blockController.performAssignment({
      studentId: 'student-new',
      sectionId: 'section-1st',
      semester: '1st',
      year: '2026-2027',
      actorId: 'registrar-1',
      session: {},
      enforceReEnrollmentVerification: true,
      forceReEnrollmentVerification: false,
    });

    expect(verificationService.findVerifiedEnrollment).not.toHaveBeenCalled();
    expect(spyCreateEnrollment).toHaveBeenCalledTimes(1);
    expect(result.httpStatus).not.toBe(428);
    spyCreateEnrollment.mockRestore();
  });

  test('requires re-enrollment verification for a readmitted student or student with prior enrollment history', async () => {
    const section = {
      _id: 'section-1st',
      status: 'OPEN',
      blockGroupId: 'group-1st',
      sectionCode: '101-1-A',
      capacity: 40,
      currentPopulation: 10,
      toObject() { return this; },
    };
    const group = {
      _id: 'group-1st',
      schoolYear: '2026-2027',
      semester: '1st',
      year: '2026-2027',
      courseId: 101,
      yearLevel: 1,
      name: '101-1-A',
      toObject() { return this; },
    };
    const readmittedStudent = {
      _id: 'student-readmitted',
      studentNumber: '202510100009',
      course: 101,
      yearLevel: 1,
      schoolYear: '2026-2027',
      semester: '1st',
      lifecycleStatus: 'Pending',
      lifecycleStatusReason: 'AUTHORIZED_READMISSION',
      enrollmentStatus: 'Not Enrolled',
      studentStatus: 'Regular',
      classification: 'Regular',
      lifecycleStatusHistory: [
        {
          status: 'Dropped',
          reason: 'ACADEMIC_DEFICIENCY',
          changedAt: new Date('2026-10-01T00:00:00Z'),
        },
        {
          status: 'Pending',
          reason: 'AUTHORIZED_READMISSION',
          decision: 'READMITTED',
          changedAt: new Date('2026-10-15T00:00:00Z'),
        },
      ],
      toObject() { return this; },
    };

    BlockSection.findById.mockReturnValue(chain(section));
    BlockGroup.findById.mockReturnValue(chain(group));
    Student.findById.mockReturnValue(chain(readmittedStudent));
    blockEligibilityService.findActiveEnrollment.mockResolvedValue(null);
    blockEligibilityService.hasPriorEnrollmentHistory.mockResolvedValue(true);
    verificationService.findVerifiedEnrollment.mockResolvedValue(null);

    const result = await blockController.performAssignment({
      studentId: 'student-readmitted',
      sectionId: 'section-1st',
      semester: '1st',
      year: '2026-2027',
      actorId: 'registrar-1',
      session: {},
      enforceReEnrollmentVerification: true,
      forceReEnrollmentVerification: false,
    });

    expect(result.ok).toBe(false);
    expect(result.httpStatus).toBe(428);
    expect(result.checks?.reEnrollmentVerified).toBe(false);
    expect(verificationService.findVerifiedEnrollment).toHaveBeenCalled();
  });
});
