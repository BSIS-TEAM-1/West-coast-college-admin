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
});
