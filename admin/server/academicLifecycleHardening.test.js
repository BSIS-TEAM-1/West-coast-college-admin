/**
 * Comprehensive unit & regression test suite for BUG-01 through BUG-10 and
 * the 5 student lifecycle workflows (Promoted, Retained, Dropped, Readmitted,
 * Shifted) in the WCC-Admin Academic Lifecycle and Enrollment system.
 */

const {
  evaluateStudentEligibility,
} = require('./services/blockEligibilityService');
const {
  getLifecycleRestriction,
  isSupersededByDismissal,
} = require('./services/lifecycleRestrictions');
const reEnrollmentVerificationService = require('./services/reEnrollmentVerificationService');

describe('Academic Lifecycle & Enrollment Hardening (BUG-01 to BUG-10 + Regressions)', () => {
  const baseStudent = {
    _id: '507f1f77bcf86cd799439011',
    studentNumber: '2026-101-0001',
    course: 101,
    yearLevel: 2,
    schoolYear: '2026-2027',
    semester: '1st',
    lifecycleStatus: 'Enrolled',
    studentStatus: 'Regular',
    classification: 'Regular',
  };

  const baseEnrollment = {
    _id: '507f1f77bcf86cd799439012',
    studentId: '507f1f77bcf86cd799439011',
    schoolYear: '2026-2027',
    semester: '1st',
    yearLevel: 2,
    course: 'BEED',
    status: 'Enrolled',
    lockedAt: null,
  };

  const baseBlockGroup = {
    _id: '507f1f77bcf86cd799439013',
    name: 'BEED-2-1A',
    courseId: 101,
    courseCode: 'BEED',
    yearLevel: 2,
    semester: '1st',
    schoolYear: '2026-2027',
    year: 2026,
    section: 'A',
  };

  const baseBlockSection = {
    _id: '507f1f77bcf86cd799439014',
    blockGroupId: '507f1f77bcf86cd799439013',
    sectionCode: '101-2-A',
    capacity: 40,
    currentPopulation: 20,
    status: 'OPEN',
  };

  describe('BUG-01 & BUG-07: Restricted Lifecycle Enforcement', () => {
    test.each([
      ['Dropped', 'Dropped students require authorized readmission before block assignment.'],
      ['Leave of Absence', 'Students on Leave of Absence require authorized reactivation before block assignment.'],
      ['Inactive', 'Inactive students require authorized reactivation before block assignment.'],
      ['Graduated', 'Graduated students cannot be enrolled or assigned to a block.'],
    ])('evaluateStudentEligibility rejects lifecycleStatus=%s with explicit reason', (status, expectedMessage) => {
      const student = { ...baseStudent, lifecycleStatus: status };
      const result = evaluateStudentEligibility(baseEnrollment, student, baseBlockGroup, baseBlockSection);
      expect(result.eligible).toBe(false);
      expect(result.checks.lifecycle).toBe(false);
      expect(result.reasons).toContain(expectedMessage);
    });

    test('getLifecycleRestriction returns null for eligible lifecycles (Pending, Enrolled, Irregular)', () => {
      expect(getLifecycleRestriction('Pending')).toBeNull();
      expect(getLifecycleRestriction('Enrolled')).toBeNull();
      expect(getLifecycleRestriction('Irregular')).toBeNull();
    });
  });

  describe('BUG-04: Dismissal-Superseded Enrollment Detection for Readmitted Students', () => {
    test('marks an enrollment created before a dismissal event as superseded after readmission', () => {
      const enrollmentCreated = new Date('2026-08-01T00:00:00Z');
      const dismissalDate = new Date('2026-10-15T00:00:00Z');
      const readmissionDate = new Date('2026-11-01T00:00:00Z');

      const readmittedStudent = {
        ...baseStudent,
        lifecycleStatus: 'Pending',
        lifecycleStatusReason: 'AUTHORIZED_READMISSION',
        lifecycleStatusHistory: [
          {
            status: 'Dropped',
            reason: 'ACADEMIC_DEFICIENCY',
            effectiveDate: dismissalDate,
            changedAt: dismissalDate,
          },
          {
            status: 'Pending',
            reason: 'AUTHORIZED_READMISSION',
            effectiveDate: readmissionDate,
            changedAt: readmissionDate,
          },
        ],
      };

      const oldTermEnrollment = {
        ...baseEnrollment,
        createdAt: enrollmentCreated,
        updatedAt: enrollmentCreated,
        status: 'Enrolled',
      };

      expect(isSupersededByDismissal(oldTermEnrollment, readmittedStudent)).toBe(true);
    });

    test('does not mark an enrollment created after readmission as superseded', () => {
      const dismissalDate = new Date('2026-10-15T00:00:00Z');
      const newEnrollmentDate = new Date('2026-11-05T00:00:00Z');

      const readmittedStudent = {
        ...baseStudent,
        lifecycleStatus: 'Enrolled',
        lifecycleStatusHistory: [
          {
            status: 'Dropped',
            reason: 'ACADEMIC_DEFICIENCY',
            effectiveDate: dismissalDate,
            changedAt: dismissalDate,
          },
        ],
      };

      const postReadmissionEnrollment = {
        ...baseEnrollment,
        createdAt: newEnrollmentDate,
        updatedAt: newEnrollmentDate,
        status: 'Enrolled',
      };

      expect(isSupersededByDismissal(postReadmissionEnrollment, readmittedStudent)).toBe(false);
    });
  });

  describe('BUG-05 & BUG-10: Verification Context & Registrar Binding Validation', () => {
    const validVerification = {
      _id: 'ver-1',
      studentId: baseStudent._id,
      schoolYear: '2026-2027',
      semester: '2nd',
      course: 101,
      yearLevel: 2,
      requestedBy: 'registrar-1',
      verifiedBy: 'registrar-1',
      verifiedAt: new Date(Date.now() - 60_000),
      verificationExpiresAt: new Date(Date.now() + 25 * 60_000),
      consumedAt: null,
      invalidatedAt: null,
    };

    test('BUG-05: rejects verification when student shifted programs after verification', () => {
      const shiftedStudent = { ...baseStudent, course: 102 };
      const check = reEnrollmentVerificationService.validateVerificationContext({
        verification: validVerification,
        student: shiftedStudent,
        schoolYear: '2026-2027',
        semester: '2nd',
        actorId: 'registrar-1',
      });
      expect(check.ok).toBe(false);
      expect(check.reasonCode).toBe('VERIFICATION_PROGRAM_MISMATCH');
      expect(check.httpStatus).toBe(409);
    });

    test('BUG-05: rejects verification when student yearLevel changed after verification', () => {
      const promotedStudent = { ...baseStudent, yearLevel: 3 };
      const check = reEnrollmentVerificationService.validateVerificationContext({
        verification: validVerification,
        student: promotedStudent,
        schoolYear: '2026-2027',
        semester: '2nd',
        actorId: 'registrar-1',
      });
      expect(check.ok).toBe(false);
      expect(check.reasonCode).toBe('VERIFICATION_YEAR_LEVEL_MISMATCH');
      expect(check.httpStatus).toBe(409);
    });

    test('BUG-05: rejects verification that was invalidated by a lifecycle or program change', () => {
      const invalidated = {
        ...validVerification,
        invalidatedAt: new Date(),
        invalidationReason: 'PROGRAM_SHIFT',
      };
      const check = reEnrollmentVerificationService.validateVerificationContext({
        verification: invalidated,
        student: baseStudent,
        schoolYear: '2026-2027',
        semester: '2nd',
        actorId: 'registrar-1',
      });
      expect(check.ok).toBe(false);
      expect(check.reasonCode).toBe('VERIFICATION_INVALIDATED');
    });

    test('BUG-10: rejects verification when a different registrar attempts to consume it without handoff', () => {
      const check = reEnrollmentVerificationService.validateVerificationContext({
        verification: validVerification,
        student: baseStudent,
        schoolYear: '2026-2027',
        semester: '2nd',
        actorId: 'registrar-2',
        allowRegistrarHandoff: false,
      });
      expect(check.ok).toBe(false);
      expect(check.reasonCode).toBe('REGISTRAR_MISMATCH');
      expect(check.httpStatus).toBe(403);
    });

    test('BUG-10: allows another registrar when allowRegistrarHandoff is explicitly true', () => {
      const check = reEnrollmentVerificationService.validateVerificationContext({
        verification: validVerification,
        student: baseStudent,
        schoolYear: '2026-2027',
        semester: '2nd',
        actorId: 'registrar-2',
        allowRegistrarHandoff: true,
      });
      expect(check.ok).toBe(true);
    });
  });

  describe('Regression Suite: 5 Core Student Lifecycle Categories', () => {
    test('1. Promoted student: eligible for next year-level block in new term', () => {
      const promotedStudent = {
        ...baseStudent,
        yearLevel: 3,
        schoolYear: '2027-2028',
        semester: '1st',
        lifecycleStatus: 'Enrolled',
      };
      const year3Group = { ...baseBlockGroup, yearLevel: 3, schoolYear: '2027-2028' };
      const result = evaluateStudentEligibility(null, promotedStudent, year3Group, baseBlockSection);
      expect(result.eligible).toBe(true);
      expect(result.checks.program).toBe(true);
      expect(result.checks.yearLevel).toBe(true);
      expect(result.checks.lifecycle).toBe(true);
    });

    test('2. Retained student: remains eligible for re-enrollment at the same year level', () => {
      const retainedStudent = {
        ...baseStudent,
        yearLevel: 2,
        lifecycleStatus: 'Irregular',
        studentStatus: 'Irregular',
        classification: 'Irregular',
      };
      const sameYearGroup = { ...baseBlockGroup, yearLevel: 2 };
      const result = evaluateStudentEligibility(null, retainedStudent, sameYearGroup, baseBlockSection);
      expect(result.eligible).toBe(true);
      expect(result.checks.yearLevel).toBe(true);
      expect(result.checks.lifecycle).toBe(true);
    });

    test('3. Dropped student: blocked from block assignment until authorized readmission', () => {
      const droppedStudent = {
        ...baseStudent,
        lifecycleStatus: 'Dropped',
      };
      const result = evaluateStudentEligibility(null, droppedStudent, baseBlockGroup, baseBlockSection);
      expect(result.eligible).toBe(false);
      expect(result.checks.lifecycle).toBe(false);
      expect(result.reasons).toContain('Dropped students require authorized readmission before block assignment.');
    });

    test('4. Readmitted student: restored to Pending/Irregular and eligible for matching block', () => {
      const readmittedStudent = {
        ...baseStudent,
        lifecycleStatus: 'Irregular',
        lifecycleStatusReason: 'AUTHORIZED_READMISSION',
        studentStatus: 'Irregular',
      };
      const result = evaluateStudentEligibility(null, readmittedStudent, baseBlockGroup, baseBlockSection);
      expect(result.eligible).toBe(true);
      expect(result.checks.lifecycle).toBe(true);
    });

    test('5. Shifted student: eligible for new program block and rejected from old program block', () => {
      const shiftedStudent = {
        ...baseStudent,
        course: 102,
        yearLevel: 1,
        lifecycleStatus: 'Irregular',
      };
      const shiftedEnrollment = {
        ...baseEnrollment,
        course: 102,
        yearLevel: 1,
      };
      const oldProgramGroup = { ...baseBlockGroup, courseId: 101, courseCode: 'BEED', yearLevel: 1 };
      const newProgramGroup = { ...baseBlockGroup, courseId: 102, courseCode: 'BSED-ENG', yearLevel: 1 };

      const oldBlockCheck = evaluateStudentEligibility(shiftedEnrollment, shiftedStudent, oldProgramGroup, baseBlockSection);
      expect(oldBlockCheck.eligible).toBe(false);
      expect(oldBlockCheck.checks.program).toBe(false);

      const newBlockCheck = evaluateStudentEligibility(shiftedEnrollment, shiftedStudent, newProgramGroup, baseBlockSection);
      expect(newBlockCheck.eligible).toBe(true);
      expect(newBlockCheck.checks.program).toBe(true);
      expect(newBlockCheck.checks.yearLevel).toBe(true);
    });
  });
});
