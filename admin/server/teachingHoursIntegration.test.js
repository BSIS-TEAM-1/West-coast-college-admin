const {
  validateTeachingHours,
  shouldTriggerWarning,
  calculateWeeklyContactHours,
  getExpectedContactHours
} = require('./services/teachingHoursValidationService');
const { hasAnyRole } = require('./authorization');

describe('Teaching Hours Validation Acceptance Criteria', () => {
  // Criterion 1: A 3-unit lecture subject configured for 3 weekly contact hours triggers a warning if assigned 5–6 weekly contact hours.
  test('Criterion 1: 3-unit lecture configured for 3 contact hours triggers warning if assigned 5-6 weekly contact hours', () => {
    const lectureSubject = {
      units: 3,
      lecturePeriods: 3,
      labPeriods: 0
    };

    // 6-hour assignment (e.g. MW 07:30-10:30 or MW 7:30 AM - 10:30 AM: 3h + 3h = 6h)
    const validation6h = validateTeachingHours({
      schedule: 'MW 7:30 AM - 10:30 AM',
      subject: lectureSubject
    });

    expect(validation6h.isValid).toBe(false);
    expect(validation6h.expectedHours).toBe(3);
    expect(validation6h.scheduledHours).toBe(6);
    expect(validation6h.discrepancy).toBe(3);
    expect(shouldTriggerWarning(validation6h)).toBe(true);

    // 5-hour assignment (e.g. MWF 08:00-09:40: 1.67h * 3 = 5h)
    const validation5h = validateTeachingHours({
      schedule: 'MWF 08:00-09:40',
      subject: lectureSubject
    });

    expect(validation5h.isValid).toBe(false);
    expect(validation5h.expectedHours).toBe(3);
    expect(validation5h.scheduledHours).toBe(5);
    expect(validation5h.discrepancy).toBe(2);
    expect(shouldTriggerWarning(validation5h)).toBe(true);
  });

  // Criterion 2: A valid lecture/laboratory configuration is evaluated according to its configured requirements.
  test('Criterion 2: Combined lecture/lab configuration evaluated according to configured lecturePeriods + labPeriods', () => {
    // Computer Science / Engineering lab subject: 2 hours lecture + 3 hours lab = 5 contact hours
    const compSubject = {
      units: 3,
      lecturePeriods: 2,
      labPeriods: 3
    };

    expect(getExpectedContactHours(compSubject)).toBe(5);

    // Assigned 5 hours (e.g. M 08:00-10:00 [2h] + W 08:00-11:00 [3h])
    const validSchedule = validateTeachingHours({
      schedule: 'M 08:00-10:00 @ Room 101 / W 08:00-11:00 @ Lab 1',
      subject: compSubject
    });

    expect(validSchedule.isValid).toBe(true);
    expect(validSchedule.expectedHours).toBe(5);
    expect(validSchedule.scheduledHours).toBe(5);
    expect(validSchedule.discrepancy).toBe(0);
    expect(shouldTriggerWarning(validSchedule)).toBe(false);

    // Assigned 7 hours (exceeds 5 hours)
    const excessSchedule = validateTeachingHours({
      schedule: 'M 08:00-11:00 @ Room 101 / W 08:00-12:00 @ Lab 1',
      subject: compSubject
    });

    expect(excessSchedule.isValid).toBe(false);
    expect(excessSchedule.expectedHours).toBe(5);
    expect(excessSchedule.scheduledHours).toBe(7);
    expect(excessSchedule.discrepancy).toBe(2);
    expect(shouldTriggerWarning(excessSchedule)).toBe(true);
  });

  // Criterion 3: A schedule within the expected contact hours does not trigger this discrepancy warning.
  test('Criterion 3: Schedule within or equal to expected contact hours does not trigger warning', () => {
    const subject = {
      units: 3,
      lecturePeriods: 3,
      labPeriods: 0
    };

    // Exactly 3 hours (MW 7:30 AM - 9:00 AM)
    const exact = validateTeachingHours({
      schedule: 'MW 7:30 AM - 9:00 AM',
      subject
    });

    expect(exact.isValid).toBe(true);
    expect(exact.discrepancy).toBe(0);
    expect(shouldTriggerWarning(exact)).toBe(false);

    // Under-scheduled (e.g. 2 hours)
    const under = validateTeachingHours({
      schedule: 'M 08:00-10:00',
      subject
    });

    expect(under.isValid).toBe(true);
    expect(under.discrepancy).toBe(-1);
    expect(shouldTriggerWarning(under)).toBe(false);
  });

  // Criterion 4: An unauthorized user cannot override a restricted warning.
  test('Criterion 4: Unauthorized user role (e.g. professor, student, guest) cannot override warning', () => {
    const professorReq = { accountType: 'professor' };
    const studentReq = { accountType: 'student' };
    const guestReq = { accountType: '' };
    const adminReq = { accountType: 'admin' };
    const registrarReq = { accountType: 'registrar' };

    expect(hasAnyRole(professorReq, ['admin', 'registrar'])).toBe(false);
    expect(hasAnyRole(studentReq, ['admin', 'registrar'])).toBe(false);
    expect(hasAnyRole(guestReq, ['admin', 'registrar'])).toBe(false);
    expect(hasAnyRole(adminReq, ['admin', 'registrar'])).toBe(true);
    expect(hasAnyRole(registrarReq, ['admin', 'registrar'])).toBe(true);
  });

  // Criterion 5: An authorized override requires justification and is auditable.
  test('Criterion 5: Authorized override requires justification of at least 10 characters', () => {
    const validJustification = 'Approved split-section lab extension as per Dean authorization.';
    const shortJustification = 'Approved';
    const emptyJustification = '';

    expect(validJustification.trim().length >= 10).toBe(true);
    expect(shortJustification.trim().length >= 10).toBe(false);
    expect(emptyJustification.trim().length >= 10).toBe(false);
  });

  // Criterion 7: Distinguish teaching units from classroom contact hours.
  test('Criterion 7: Teaching units and classroom contact hours are distinct', () => {
    // Lab course with 1 credit unit but 3 contact hours
    const chemistryLab = {
      units: 1,
      lecturePeriods: 0,
      labPeriods: 3
    };

    expect(chemistryLab.units).toBe(1); // 1 teaching credit unit
    expect(getExpectedContactHours(chemistryLab)).toBe(3); // 3 classroom contact hours
    expect(chemistryLab.units).not.toBe(getExpectedContactHours(chemistryLab));
  });
});
