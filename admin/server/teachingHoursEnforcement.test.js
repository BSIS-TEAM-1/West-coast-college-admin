/**
 * Teaching hours enforcement acceptance tests.
 *
 * Covers the complete lecture/contact-hour rule:
 *  - units are academic credits and never multiplied by schedule entries
 *  - weekly contact hours are summed across every meeting
 *  - the backend blocks an excess-hours change unless an authorized override
 *    with a justification is recorded in the audit trail
 */

const mongoose = require('mongoose');
const StudentController = require('./controllers/studentController');
const Subject = require('./models/Subject');
const CurriculumSubject = require('./models/CurriculumSubject');
const Admin = require('./models/Admin');
const TeachingHoursOverride = require('./models/TeachingHoursOverride');
const {
  calculateWeeklyContactHours,
  getExpectedContactHours,
  validateTeachingHours,
  shouldTriggerWarning
} = require('./services/teachingHoursValidationService');
const { hasAnyRole } = require('./authorization');

const lectureSubject = { units: 3, lecturePeriods: 3, labPeriods: 0 };
const twoThreeHourDays = 'M 1:00 PM - 4:00 PM @ Room 1 / W 1:00 PM - 4:00 PM @ Room 1';

const createResponse = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

const createEnrollment = (overrides = {}) => ({
  _id: new mongoose.Types.ObjectId(),
  subjects: [
    {
      subjectId: overrides.subjectId,
      code: 'ENG101',
      title: 'English 101',
      units: 3,
      instructor: 'TBA',
      schedule: 'TBA',
      room: 'TBA'
    }
  ],
  markModified: jest.fn(),
  save: jest.fn().mockResolvedValue(undefined)
});

describe('Academic units vs. weekly contact hours', () => {
  test('case 1: a 3-unit lecture scheduled for exactly 3 hours passes', () => {
    const result = validateTeachingHours({
      schedule: 'M 1:00 PM - 4:00 PM',
      subject: lectureSubject
    });

    expect(result.expectedHours).toBe(3);
    expect(result.scheduledHours).toBe(3);
    expect(result.discrepancy).toBe(0);
    expect(result.isValid).toBe(true);
    expect(shouldTriggerWarning(result)).toBe(false);
  });

  test('case 2: a 3-unit lecture scheduled for 6 hours triggers a discrepancy warning', () => {
    const result = validateTeachingHours({
      schedule: twoThreeHourDays,
      subject: lectureSubject
    });

    expect(result.expectedHours).toBe(3);
    expect(result.scheduledHours).toBe(6);
    expect(result.discrepancy).toBe(3);
    expect(result.isValid).toBe(false);
    expect(shouldTriggerWarning(result)).toBe(true);
    expect(result.message).toContain('exceed');
  });

  test('case 3: two 3-hour meetings total 6 contact hours but keep 3 academic units', () => {
    const subject = { ...lectureSubject };
    const result = validateTeachingHours({ schedule: twoThreeHourDays, subject });

    expect(result.scheduledHours).toBe(6);
    expect(subject.units).toBe(3);
    expect(getExpectedContactHours(subject)).toBe(3);
    // Units are a separate scalar; the schedule never rewrites them.
    expect(getExpectedContactHours(subject)).not.toBe(result.scheduledHours);
  });

  test('case 4: multiple day entries do not duplicate the subject or its units', () => {
    const subject = { ...lectureSubject };
    const before = { ...subject };

    validateTeachingHours({ schedule: twoThreeHourDays, subject });
    validateTeachingHours({ schedule: 'M 1:00 PM - 4:00 PM / W 1:00 PM - 4:00 PM / F 1:00 PM - 4:00 PM', subject });

    expect(subject).toEqual(before);
    expect(getExpectedContactHours(subject)).toBe(3);
    expect(calculateWeeklyContactHours(twoThreeHourDays)).toBe(6);
  });

  test('case 5: editing or deleting a meeting recalculates weekly contact hours', () => {
    expect(calculateWeeklyContactHours(twoThreeHourDays)).toBe(6);
    expect(calculateWeeklyContactHours('M 1:00 PM - 4:00 PM')).toBe(3);
    expect(calculateWeeklyContactHours('TBA')).toBe(0);
    expect(calculateWeeklyContactHours('')).toBe(0);
  });

  test('case 8: lecture, laboratory, and combined subjects use their configured expectations', () => {
    expect(getExpectedContactHours({ units: 3, lecturePeriods: 3, labPeriods: 0 })).toBe(3);
    expect(getExpectedContactHours({ units: 1, lecturePeriods: 0, labPeriods: 3 })).toBe(3);
    expect(getExpectedContactHours({ units: 3, lecturePeriods: 2, labPeriods: 3 })).toBe(5);

    // Unknown lecture/lab configuration falls back to academic units.
    expect(getExpectedContactHours({ units: 3 })).toBe(3);
  });

  test('case 9: separate sections are calculated independently', () => {
    const sectionA = validateTeachingHours({
      schedule: 'M 1:00 PM - 4:00 PM',
      subject: { units: 3, lecturePeriods: 3, labPeriods: 0 }
    });
    const sectionB = validateTeachingHours({
      schedule: twoThreeHourDays,
      subject: { units: 3, lecturePeriods: 3, labPeriods: 0 }
    });

    expect(sectionA.isValid).toBe(true);
    expect(sectionA.expectedHours).toBe(3);
    expect(sectionA.scheduledHours).toBe(3);

    expect(sectionB.isValid).toBe(false);
    expect(sectionB.expectedHours).toBe(3);
    expect(sectionB.scheduledHours).toBe(6);
  });
});

describe('Backend enforcement and audit trail', () => {
  const sectionId = new mongoose.Types.ObjectId().toString();
  const subjectId = new mongoose.Types.ObjectId().toString();
  const adminId = new mongoose.Types.ObjectId().toString();
  const professorDoc = {
    _id: new mongoose.Types.ObjectId(),
    username: 'alovelace',
    displayName: 'Prof. Ada Lovelace'
  };

  let enrollment;
  let context;

  const mockContext = () => {
    enrollment = createEnrollment({ subjectId });
    context = {
      section: {
        _id: new mongoose.Types.ObjectId(sectionId),
        sectionCode: 'BSIT-1A'
      },
      blockGroup: {
        _id: new mongoose.Types.ObjectId(),
        name: 'BSIT 1-A',
        curriculumId: new mongoose.Types.ObjectId()
      },
      resolvedSemester: '1st',
      resolvedSchoolYear: '2026-2027',
      studentObjectIds: [new mongoose.Types.ObjectId()],
      enrollments: [enrollment]
    };

    jest.spyOn(StudentController, 'getSectionEnrollmentContext').mockResolvedValue(context);
    jest.spyOn(Subject, 'findById').mockReturnValue({
      select: jest.fn().mockResolvedValue({
        _id: new mongoose.Types.ObjectId(subjectId),
        code: 'ENG101',
        title: 'English 101',
        toObject: () => ({ _id: subjectId, code: 'ENG101', title: 'English 101', ...lectureSubject })
      })
    });
    jest.spyOn(CurriculumSubject, 'findOne').mockReturnValue({
      select: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue({
          units: 3,
          lecturePeriods: 3,
          labPeriods: 0
        })
      })
    });
    jest.spyOn(Admin, 'findById').mockReturnValue({
      select: jest.fn().mockResolvedValue({ _id: new mongoose.Types.ObjectId(adminId), username: 'registrar', displayName: 'Registrar' })
    });
    jest.spyOn(Admin, 'findOne').mockReturnValue({
      select: jest.fn().mockResolvedValue(professorDoc)
    });
    jest.spyOn(TeachingHoursOverride, 'create').mockResolvedValue({ _id: new mongoose.Types.ObjectId() });
    jest.spyOn(console, 'log').mockImplementation(() => {});
  };

  const buildRequest = (overrides = {}) => ({
    params: { sectionId, subjectId },
    body: {
      subjectId,
      instructor: 'Prof. Ada Lovelace',
      schedule: twoThreeHourDays,
      room: 'Room 1',
      semester: '1st',
      schoolYear: '2026-2027',
      ...overrides
    },
    adminId,
    accountType: 'registrar'
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('case 2/9: excess schedule is rejected with subject, professor, section, expected and actual hours', async () => {
    mockContext();
    const req = buildRequest();
    const res = createResponse();

    await StudentController.assignSubjectInstructorToSection(req, res);

    expect(res.status).toHaveBeenCalledWith(409);
    const payload = res.json.mock.calls[0][0];
    expect(payload.warning).toBe('teaching_hours_exceeded');
    expect(payload.data).toMatchObject({
      subjectCode: 'ENG101',
      professorName: 'Prof. Ada Lovelace',
      sectionCode: 'BSIT-1A',
      units: 3,
      expectedContactHours: 3,
      assignedContactHours: 6,
      discrepancy: 3
    });
    expect(TeachingHoursOverride.create).not.toHaveBeenCalled();
    expect(enrollment.save).not.toHaveBeenCalled();
    expect(enrollment.subjects[0].schedule).toBe('TBA');
  });

  test('case 6: authorized override records a real professor, authorizer, justification, and hour snapshot', async () => {
    mockContext();
    const req = buildRequest({
      overrideJustification: 'Approved by the Dean for a split lecture pilot section.'
    });
    const res = createResponse();

    await StudentController.assignSubjectInstructorToSection(req, res);

    expect(TeachingHoursOverride.create).toHaveBeenCalledTimes(1);
    const audit = TeachingHoursOverride.create.mock.calls[0][0];
    expect(String(audit.professorId)).toBe(String(professorDoc._id));
    expect(audit.professorName).toBe('Prof. Ada Lovelace');
    expect(String(audit.authorizedBy)).toBe(adminId);
    expect(audit.authorizedByName).toBe('Registrar');
    expect(audit.units).toBe(3);
    expect(audit.expectedContactHours).toBe(3);
    expect(audit.assignedContactHours).toBe(6);
    expect(audit.discrepancy).toBe(3);
    expect(audit.justification).toBe('Approved by the Dean for a split lecture pilot section.');

    // The schedule is applied to the existing subject entry, not a new one.
    expect(enrollment.subjects).toHaveLength(1);
    expect(enrollment.subjects[0].units).toBe(3);
    expect(enrollment.subjects[0].schedule).toBe(twoThreeHourDays);
    expect(enrollment.subjects[0].instructor).toBe('Prof. Ada Lovelace');
    expect(enrollment.save).toHaveBeenCalledTimes(1);

    const success = res.json.mock.calls[0][0];
    expect(success.success).toBe(true);
    expect(success.data.matchedSubjectEntries).toBe(1);
  });

  test('case 7: an unauthorized role cannot bypass validation with a direct override request', async () => {
    mockContext();
    const req = buildRequest({
      overrideJustification: 'Trying to bypass the validation without authorization.'
    });
    req.accountType = 'professor';
    const res = createResponse();

    await StudentController.assignSubjectInstructorToSection(req, res);

    expect(hasAnyRole(req, ['admin', 'registrar'])).toBe(false);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(TeachingHoursOverride.create).not.toHaveBeenCalled();
    expect(enrollment.save).not.toHaveBeenCalled();
    expect(enrollment.subjects[0].schedule).toBe('TBA');
  });

  test('a valid 3-hour schedule is applied without an override audit entry', async () => {
    mockContext();
    const req = buildRequest({ schedule: 'M 1:00 PM - 4:00 PM' });
    const res = createResponse();

    await StudentController.assignSubjectInstructorToSection(req, res);

    expect(TeachingHoursOverride.create).not.toHaveBeenCalled();
    expect(enrollment.subjects[0].units).toBe(3);
    expect(enrollment.subjects[0].schedule).toBe('M 1:00 PM - 4:00 PM');
    expect(res.json.mock.calls[0][0].success).toBe(true);
  });

  test('rejects an override when the professor account cannot be resolved (no random audit ids)', async () => {
    mockContext();
    Admin.findOne.mockReturnValue({ select: jest.fn().mockResolvedValue(null) });
    const req = buildRequest({
      overrideJustification: 'Approved by the Dean for a split lecture pilot section.'
    });
    const res = createResponse();

    await StudentController.assignSubjectInstructorToSection(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(TeachingHoursOverride.create).not.toHaveBeenCalled();
    expect(enrollment.save).not.toHaveBeenCalled();
  });
});
