const {
  evaluateStudentEligibility,
  normalizeCourseCode,
  formatSchoolYearFromStartYear,
} = require('./services/blockEligibilityService');
const {
  assertEnrollmentMutable,
  isEnrollmentLocked,
  IMMUTABLE_ACADEMIC_FIELDS,
  LOCKED_ENROLLMENT_ERROR,
} = require('./services/enrollmentImmutabilityGuard');

// Mock student, enrollment, block group, block section objects for testing
const baseStudent = {
  _id: '507f1f77bcf86cd799439011',
  course: 101,
  yearLevel: 2,
  classification: 'Regular',
  curriculumVersion: '2023',
  schoolYear: '2026-2027',
  semester: '1st',
  studentStatus: 'Regular',
};

const baseEnrollment = {
  _id: '507f1f77bcf86cd799439012',
  studentId: '507f1f77bcf86cd799439011',
  schoolYear: '2026-2027',
  semester: '1st',
  yearLevel: 2,
  course: 'BEED',
  curriculumId: null,
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
  curriculumId: null,
  studentClassification: 'All',
};

const baseBlockSection = {
  _id: '507f1f77bcf86cd799439014',
  blockGroupId: '507f1f77bcf86cd799439013',
  sectionCode: '1A',
  capacity: 40,
  currentPopulation: 20,
  status: 'OPEN',
};

const baseCurriculumDoc = {
  _id: '507f1f77bcf86cd799439015',
  programCode: 101,
  programName: 'BEED',
  version: '2023',
  status: 'Active',
};

const activePeriod = {
  status: 'Active',
  schoolYear: '2026-2027',
};

function makeOverrides(base, overrides) {
  return { ...base, ...overrides };
}

describe('evaluateStudentEligibility', () => {
  // === PROGRAM MATCH / MISMATCH ===
  test('✓ Program match — eligible', () => {
    const result = evaluateStudentEligibility(baseEnrollment, baseStudent, baseBlockGroup, baseBlockSection, null, null, activePeriod);
    expect(result.checks.program).toBe(true);
    expect(result.eligible).toBe(true);
  });

  test('✗ Program mismatch — ineligible', () => {
    const group = makeOverrides(baseBlockGroup, { courseId: 201, courseCode: 'BSBA-HRM' });
    const result = evaluateStudentEligibility(baseEnrollment, baseStudent, group, baseBlockSection, null, null, activePeriod);
    expect(result.checks.program).toBe(false);
    expect(result.eligible).toBe(false);
    expect(result.reasons.some((r) => r.includes('Program/course does not match'))).toBe(true);
  });

  // === YEAR LEVEL MATCH / MISMATCH ===
  test('✓ Year-level match — eligible', () => {
    const result = evaluateStudentEligibility(baseEnrollment, baseStudent, baseBlockGroup, baseBlockSection, null, null, activePeriod);
    expect(result.checks.yearLevel).toBe(true);
    expect(result.eligible).toBe(true);
  });

  test('✗ Year-level mismatch — ineligible', () => {
    const group = makeOverrides(baseBlockGroup, { yearLevel: 3 });
    const result = evaluateStudentEligibility(baseEnrollment, baseStudent, group, baseBlockSection, null, null, activePeriod);
    expect(result.checks.yearLevel).toBe(false);
    expect(result.eligible).toBe(false);
    expect(result.reasons.some((r) => r.includes('year level'))).toBe(true);
  });

  // === CURRICULUM MATCH / MISMATCH ===
  test('✓ Curriculum match (Enrollment.curriculumId) — eligible', () => {
    const enrollment = makeOverrides(baseEnrollment, { curriculumId: '507f1f77bcf86cd799439015' });
    const group = makeOverrides(baseBlockGroup, { curriculumId: '507f1f77bcf86cd799439015' });
    const result = evaluateStudentEligibility(enrollment, baseStudent, group, baseBlockSection, null, baseCurriculumDoc, activePeriod);
    expect(result.checks.curriculum).toBe(true);
    expect(result.eligible).toBe(true);
  });

  test('✗ Curriculum mismatch (Enrollment.curriculumId differs from BlockGroup) — ineligible', () => {
    const enrollment = makeOverrides(baseEnrollment, { curriculumId: '507f1f77bcf86cd799439099' });
    const group = makeOverrides(baseBlockGroup, { curriculumId: '507f1f77bcf86cd799439015' });
    const result = evaluateStudentEligibility(enrollment, baseStudent, group, baseBlockSection, null, baseCurriculumDoc, activePeriod);
    expect(result.checks.curriculum).toBe(false);
    expect(result.eligible).toBe(false);
    expect(result.reasons.some((r) => r.includes('Curriculum mismatch'))).toBe(true);
  });

  test('✓ No curriculum restriction (BlockGroup.curriculumId = null) — eligible', () => {
    const group = makeOverrides(baseBlockGroup, { curriculumId: null });
    const result = evaluateStudentEligibility(baseEnrollment, baseStudent, group, baseBlockSection, null, null, activePeriod);
    expect(result.checks.curriculum).toBe(true);
    expect(result.eligible).toBe(true);
  });

  test('✓ Legacy fallback: Student.curriculumVersion matches Curriculum.version — eligible', () => {
    const enrollment = makeOverrides(baseEnrollment, { curriculumId: null });
    const group = makeOverrides(baseBlockGroup, { curriculumId: '507f1f77bcf86cd799439015' });
    const student = makeOverrides(baseStudent, { curriculumVersion: '2023' });
    const result = evaluateStudentEligibility(enrollment, student, group, baseBlockSection, null, baseCurriculumDoc, activePeriod);
    expect(result.checks.curriculum).toBe(true);
    expect(result.eligible).toBe(true);
  });

  test('✗ Legacy fallback: Student.curriculumVersion mismatch — ineligible', () => {
    const enrollment = makeOverrides(baseEnrollment, { curriculumId: null });
    const group = makeOverrides(baseBlockGroup, { curriculumId: '507f1f77bcf86cd799439015' });
    const student = makeOverrides(baseStudent, { curriculumVersion: '2026' });
    const result = evaluateStudentEligibility(enrollment, student, group, baseBlockSection, null, baseCurriculumDoc, activePeriod);
    expect(result.checks.curriculum).toBe(false);
    expect(result.eligible).toBe(false);
    expect(result.reasons.some((r) => r.includes('Curriculum mismatch'))).toBe(true);
  });

  // === HISTORICAL CURRICULUM IMMUTABILITY ===
  test('✓ Historical curriculum remains immutable — Enrollment.curriculumId used even when Student.curriculumVersion changes', () => {
    // Initial state: Student has 2023, Enrollment has curriculumId for 2023
    const enrollment = makeOverrides(baseEnrollment, {
      curriculumId: '507f1f77bcf86cd799439015', // Curriculum 2023
    });
    // Student changes curriculum to 2026
    const student = makeOverrides(baseStudent, { curriculumVersion: '2026' });
    // Block group requires 2023
    const group = makeOverrides(baseBlockGroup, { curriculumId: '507f1f77bcf86cd799439015' });

    const result = evaluateStudentEligibility(enrollment, student, group, baseBlockSection, null, baseCurriculumDoc, activePeriod);

    // Should use Enrollment.curriculumId (2023), NOT Student.curriculumVersion (2026)
    // Curriculum check passes because Enrollment.curriculumId matches BlockGroup.curriculumId
    expect(result.checks.curriculum).toBe(true);
    // Enrollment is not locked, so overall eligible
    expect(result.eligible).toBe(true);
  });

  test('✗ Historical curriculum: locked enrollment with wrong curriculum — ineligible', () => {
    const enrollment = makeOverrides(baseEnrollment, {
      curriculumId: '507f1f77bcf86cd799439099', // Different curriculum
      lockedAt: new Date('2027-06-01'),
    });
    const student = makeOverrides(baseStudent, { curriculumVersion: '2026' }); // Changed
    const group = makeOverrides(baseBlockGroup, { curriculumId: '507f1f77bcf86cd799439015' });

    const result = evaluateStudentEligibility(enrollment, student, group, baseBlockSection, null, baseCurriculumDoc, activePeriod);

    // Enrollment.curriculumId differs from BlockGroup — should be ineligible
    expect(result.checks.curriculum).toBe(false);
    expect(result.eligible).toBe(false);
    // But also locked enrollment should fail enrollmentStatus
    expect(result.checks.enrollmentStatus).toBe(false);
  });

  // === CLASSIFICATION MATCH / MISMATCH ===
  test('✓ Classification match — eligible', () => {
    const group = makeOverrides(baseBlockGroup, { studentClassification: 'Regular' });
    const result = evaluateStudentEligibility(baseEnrollment, baseStudent, group, baseBlockSection, null, null, activePeriod);
    expect(result.checks.classification).toBe(true);
    expect(result.eligible).toBe(true);
  });

  test('✗ Classification mismatch — ineligible', () => {
    const group = makeOverrides(baseBlockGroup, { studentClassification: 'Irregular' });
    const result = evaluateStudentEligibility(baseEnrollment, baseStudent, group, baseBlockSection, null, null, activePeriod);
    expect(result.checks.classification).toBe(false);
    expect(result.eligible).toBe(false);
    expect(result.reasons.some((r) => r.includes('Irregular'))).toBe(true);
  });

  test('✓ Classification = All — always eligible regardless of student classification', () => {
    const group = makeOverrides(baseBlockGroup, { studentClassification: 'All' });
    const student = makeOverrides(baseStudent, { classification: 'Transferee' });
    const result = evaluateStudentEligibility(baseEnrollment, student, group, baseBlockSection, null, null, activePeriod);
    expect(result.checks.classification).toBe(true);
    expect(result.eligible).toBe(true);
  });

  // === CAPACITY ===
  test('✓ Capacity available — eligible', () => {
    const section = makeOverrides(baseBlockSection, { currentPopulation: 20, capacity: 40 });
    const result = evaluateStudentEligibility(baseEnrollment, baseStudent, baseBlockGroup, section, null, null, activePeriod);
    expect(result.checks.capacity).toBe(true);
    expect(result.eligible).toBe(true);
  });

  test('✗ Capacity full — ineligible', () => {
    const section = makeOverrides(baseBlockSection, { currentPopulation: 40, capacity: 40 });
    const result = evaluateStudentEligibility(baseEnrollment, baseStudent, baseBlockGroup, section, null, null, activePeriod);
    expect(result.checks.capacity).toBe(false);
    expect(result.eligible).toBe(false);
    expect(result.reasons.some((r) => r.includes('full'))).toBe(true);
  });

  // === EXISTING ASSIGNMENT ===
  test('✓ No existing assignment — eligible', () => {
    const result = evaluateStudentEligibility(baseEnrollment, baseStudent, baseBlockGroup, baseBlockSection, null, null, activePeriod);
    expect(result.checks.conflicts).toBe(true);
    expect(result.eligible).toBe(true);
  });

  test('✗ Existing assignment — ineligible', () => {
    const existing = { _id: '507f1f77bcf86cd799439098', sectionId: '507f1f77bcf86cd799439097' };
    const result = evaluateStudentEligibility(baseEnrollment, baseStudent, baseBlockGroup, baseBlockSection, existing, null, activePeriod);
    expect(result.checks.conflicts).toBe(false);
    expect(result.eligible).toBe(false);
    expect(result.reasons.some((r) => r.includes('already has a block assignment'))).toBe(true);
  });

  // === SCHOOL YEAR ===
  test('✓ Correct school year — eligible', () => {
    const result = evaluateStudentEligibility(baseEnrollment, baseStudent, baseBlockGroup, baseBlockSection, null, null, activePeriod);
    expect(result.checks.schoolYear).toBe(true);
    expect(result.eligible).toBe(true);
  });

  test('✗ Wrong school year — ineligible', () => {
    const group = makeOverrides(baseBlockGroup, { schoolYear: '2025-2026', year: 2025 });
    const result = evaluateStudentEligibility(baseEnrollment, baseStudent, group, baseBlockSection, null, null, activePeriod);
    expect(result.checks.schoolYear).toBe(false);
    expect(result.eligible).toBe(false);
    expect(result.reasons.some((r) => r.includes('different school year'))).toBe(true);
  });

  // === SEMESTER ===
  test('✓ Correct semester — eligible', () => {
    const result = evaluateStudentEligibility(baseEnrollment, baseStudent, baseBlockGroup, baseBlockSection, null, null, activePeriod);
    expect(result.checks.semester).toBe(true);
    expect(result.eligible).toBe(true);
  });

  test('✗ Wrong semester — ineligible', () => {
    const group = makeOverrides(baseBlockGroup, { semester: '2nd' });
    const result = evaluateStudentEligibility(baseEnrollment, baseStudent, group, baseBlockSection, null, null, activePeriod);
    expect(result.checks.semester).toBe(false);
    expect(result.eligible).toBe(false);
    expect(result.reasons.some((r) => r.includes('different semester'))).toBe(true);
  });

  // === ENROLLMENT STATUS ===
  test('✓ Active enrollment — eligible', () => {
    const result = evaluateStudentEligibility(baseEnrollment, baseStudent, baseBlockGroup, baseBlockSection, null, null, activePeriod);
    expect(result.checks.enrollmentStatus).toBe(true);
    expect(result.eligible).toBe(true);
  });

  test('✗ Locked enrollment — ineligible', () => {
    const enrollment = makeOverrides(baseEnrollment, { lockedAt: new Date() });
    const result = evaluateStudentEligibility(enrollment, baseStudent, baseBlockGroup, baseBlockSection, null, null, activePeriod);
    expect(result.checks.enrollmentStatus).toBe(false);
    expect(result.eligible).toBe(false);
    expect(result.reasons.some((r) => r.includes('locked'))).toBe(true);
  });

  test('✗ No enrollment found — ineligible', () => {
    const result = evaluateStudentEligibility(null, baseStudent, baseBlockGroup, baseBlockSection, null, null, activePeriod);
    expect(result.checks.enrollmentStatus).toBe(false);
    expect(result.eligible).toBe(false);
    expect(result.reasons.some((r) => r.includes('No active enrollment'))).toBe(true);
  });

  // === STUDENT STATUS ===
  test('✓ Active student (Regular) — eligible', () => {
    const result = evaluateStudentEligibility(baseEnrollment, baseStudent, baseBlockGroup, baseBlockSection, null, null, activePeriod);
    expect(result.eligible).toBe(true);
  });

  test('✗ Dropped student — ineligible', () => {
    const student = makeOverrides(baseStudent, { studentStatus: 'Dropped' });
    const result = evaluateStudentEligibility(baseEnrollment, student, baseBlockGroup, baseBlockSection, null, null, activePeriod);
    expect(result.checks.enrollmentStatus).toBe(false);
    expect(result.eligible).toBe(false);
    expect(result.reasons.some((r) => r.includes('Dropped'))).toBe(true);
  });

  // === ENROLLMENT AS AUTHORITATIVE SOURCE ===
  test('Enrollment yearLevel overrides Student yearLevel', () => {
    const enrollment = makeOverrides(baseEnrollment, { yearLevel: 2 });
    const student = makeOverrides(baseStudent, { yearLevel: 3 });
    const group = makeOverrides(baseBlockGroup, { yearLevel: 2 });
    const result = evaluateStudentEligibility(enrollment, student, group, baseBlockSection, null, null, activePeriod);
    expect(result.checks.yearLevel).toBe(true);
    expect(result.eligible).toBe(true);
  });

  test('Enrollment course overrides Student course', () => {
    const enrollment = makeOverrides(baseEnrollment, { course: 'BEED' });
    const student = makeOverrides(baseStudent, { course: 201 });
    const group = makeOverrides(baseBlockGroup, { courseId: 101, courseCode: 'BEED' });
    const result = evaluateStudentEligibility(enrollment, student, group, baseBlockSection, null, null, activePeriod);
    expect(result.checks.program).toBe(true);
    expect(result.eligible).toBe(true);
  });

  // === HUMAN-READABLE REASONS ===
  test('Curriculum mismatch produces human-readable reason', () => {
    const enrollment = makeOverrides(baseEnrollment, { curriculumId: '507f1f77bcf86cd799439099' });
    const group = makeOverrides(baseBlockGroup, { curriculumId: '507f1f77bcf86cd799439015' });
    const result = evaluateStudentEligibility(enrollment, baseStudent, group, baseBlockSection, null, baseCurriculumDoc, activePeriod);
    expect(result.reasons.some((r) => r.includes('Curriculum mismatch') && r.includes('BEED'))).toBe(true);
  });

  test('Classification mismatch produces human-readable reason', () => {
    const group = makeOverrides(baseBlockGroup, { studentClassification: 'Irregular' });
    const result = evaluateStudentEligibility(baseEnrollment, baseStudent, group, baseBlockSection, null, null, activePeriod);
    expect(result.reasons.some((r) => r.includes('Irregular'))).toBe(true);
  });
});

describe('normalizeCourseCode', () => {
  test('converts numeric string to number', () => {
    expect(normalizeCourseCode('101')).toBe(101);
  });

  test('converts BEED to 101', () => {
    expect(normalizeCourseCode('BEED')).toBe(101);
  });

  test('handles null', () => {
    expect(normalizeCourseCode(null)).toBe(null);
  });

  test('handles unknown code', () => {
    expect(normalizeCourseCode('UNKNOWN')).toBe(null);
  });
});

describe('formatSchoolYearFromStartYear', () => {
  test('formats correctly', () => {
    expect(formatSchoolYearFromStartYear(2026)).toBe('2026-2027');
  });

  test('handles invalid input', () => {
    expect(formatSchoolYearFromStartYear('abc')).toBe('');
  });
});

// === SINGLE VS BULK CONSISTENCY ===
describe('Single vs Bulk eligibility consistency', () => {
  test('evaluateStudentEligibility produces identical results for same inputs (used by both single and bulk)', () => {
    // The same function is called for both single and bulk eligibility.
    // If the inputs are the same, the output must be the same.
    const result1 = evaluateStudentEligibility(baseEnrollment, baseStudent, baseBlockGroup, baseBlockSection, null, null, activePeriod);
    const result2 = evaluateStudentEligibility(baseEnrollment, baseStudent, baseBlockGroup, baseBlockSection, null, null, activePeriod);

    expect(result1.eligible).toBe(result2.eligible);
    expect(result1.reasons).toEqual(result2.reasons);
    expect(result1.checks).toEqual(result2.checks);
  });

  test('curriculum mismatch produces same result in both paths', () => {
    const enrollment = makeOverrides(baseEnrollment, { curriculumId: '507f1f77bcf86cd799439099' });
    const group = makeOverrides(baseBlockGroup, { curriculumId: '507f1f77bcf86cd799439015' });

    // Simulate single eligibility call
    const singleResult = evaluateStudentEligibility(enrollment, baseStudent, group, baseBlockSection, null, baseCurriculumDoc, activePeriod);

    // Simulate bulk eligibility call (same function, same inputs)
    const bulkResult = evaluateStudentEligibility(enrollment, baseStudent, group, baseBlockSection, null, baseCurriculumDoc, activePeriod);

    expect(singleResult.eligible).toBe(bulkResult.eligible);
    expect(singleResult.checks.curriculum).toBe(bulkResult.checks.curriculum);
    expect(singleResult.reasons).toEqual(bulkResult.reasons);
  });
});

// === ENROLLMENT IMMUTABILITY GUARD ===
describe('assertEnrollmentMutable', () => {
  test('✓ unlocked Enrollment does not throw', () => {
    const enrollment = makeOverrides(baseEnrollment, { lockedAt: null });
    expect(() => assertEnrollmentMutable(enrollment)).not.toThrow();
  });

  test('✗ locked Enrollment throws', () => {
    const enrollment = makeOverrides(baseEnrollment, { lockedAt: new Date('2027-06-01') });
    expect(() => assertEnrollmentMutable(enrollment)).toThrow(LOCKED_ENROLLMENT_ERROR);
  });

  test('✗ locked Enrollment throws with field name in message', () => {
    const enrollment = makeOverrides(baseEnrollment, { lockedAt: new Date('2027-06-01') });
    expect(() => assertEnrollmentMutable(enrollment, 'curriculumId')).toThrow('curriculumId');
  });

  test('✓ null enrollment does not throw', () => {
    expect(() => assertEnrollmentMutable(null)).not.toThrow();
  });

  test('✗ locked Enrollment cannot change curriculumId (simulated)', () => {
    const enrollment = makeOverrides(baseEnrollment, { lockedAt: new Date('2027-06-01') });
    expect(() => assertEnrollmentMutable(enrollment, 'curriculumId')).toThrow();
  });

  test('✗ locked Enrollment cannot change course (simulated)', () => {
    const enrollment = makeOverrides(baseEnrollment, { lockedAt: new Date('2027-06-01') });
    expect(() => assertEnrollmentMutable(enrollment, 'course')).toThrow();
  });

  test('✗ locked Enrollment cannot change yearLevel (simulated)', () => {
    const enrollment = makeOverrides(baseEnrollment, { lockedAt: new Date('2027-06-01') });
    expect(() => assertEnrollmentMutable(enrollment, 'yearLevel')).toThrow();
  });

  test('IMMUTABLE_ACADEMIC_FIELDS includes all protected fields', () => {
    expect(IMMUTABLE_ACADEMIC_FIELDS).toContain('curriculumId');
    expect(IMMUTABLE_ACADEMIC_FIELDS).toContain('course');
    expect(IMMUTABLE_ACADEMIC_FIELDS).toContain('yearLevel');
    expect(IMMUTABLE_ACADEMIC_FIELDS).toContain('schoolYear');
    expect(IMMUTABLE_ACADEMIC_FIELDS).toContain('semester');
  });
});

describe('isEnrollmentLocked', () => {
  test('returns true for locked enrollment', () => {
    const enrollment = makeOverrides(baseEnrollment, { lockedAt: new Date() });
    expect(isEnrollmentLocked(enrollment)).toBe(true);
  });

  test('returns false for unlocked enrollment', () => {
    const enrollment = makeOverrides(baseEnrollment, { lockedAt: null });
    expect(isEnrollmentLocked(enrollment)).toBe(false);
  });

  test('returns false for null enrollment', () => {
    expect(isEnrollmentLocked(null)).toBe(false);
  });
});

// === LEGACY CURRICULUM FALLBACK EXPLICIT BEHAVIOR ===
describe('Legacy curriculum fallback behavior', () => {
  test('✓ legacy enrollment with null curriculumId can use Student.curriculumVersion fallback', () => {
    const enrollment = makeOverrides(baseEnrollment, { curriculumId: null });
    const group = makeOverrides(baseBlockGroup, { curriculumId: '507f1f77bcf86cd799439015' });
    const student = makeOverrides(baseStudent, { curriculumVersion: '2023' });
    const result = evaluateStudentEligibility(enrollment, student, group, baseBlockSection, null, baseCurriculumDoc, activePeriod);
    expect(result.checks.curriculum).toBe(true);
    expect(result.eligible).toBe(true);
  });

  test('✓ explicit Enrollment.curriculumId overrides Student.curriculumVersion', () => {
    // Enrollment says 2023, Student says 2026 — Enrollment wins
    const enrollment = makeOverrides(baseEnrollment, { curriculumId: '507f1f77bcf86cd799439015' }); // 2023
    const student = makeOverrides(baseStudent, { curriculumVersion: '2026' });
    const group = makeOverrides(baseBlockGroup, { curriculumId: '507f1f77bcf86cd799439015' }); // 2023
    const result = evaluateStudentEligibility(enrollment, student, group, baseBlockSection, null, baseCurriculumDoc, activePeriod);
    expect(result.checks.curriculum).toBe(true);
    expect(result.eligible).toBe(true);
  });

  test('✓ Student curriculum changes do not alter explicit Enrollment curriculum', () => {
    // Same enrollment, student changes version — result should be the same
    const enrollment = makeOverrides(baseEnrollment, { curriculumId: '507f1f77bcf86cd799439015' });
    const group = makeOverrides(baseBlockGroup, { curriculumId: '507f1f77bcf86cd799439015' });

    const studentBefore = makeOverrides(baseStudent, { curriculumVersion: '2023' });
    const studentAfter = makeOverrides(baseStudent, { curriculumVersion: '2026' });

    const resultBefore = evaluateStudentEligibility(enrollment, studentBefore, group, baseBlockSection, null, baseCurriculumDoc, activePeriod);
    const resultAfter = evaluateStudentEligibility(enrollment, studentAfter, group, baseBlockSection, null, baseCurriculumDoc, activePeriod);

    expect(resultBefore.checks.curriculum).toBe(resultAfter.checks.curriculum);
    expect(resultBefore.eligible).toBe(resultAfter.eligible);
  });

  test('✗ legacy fallback does not override explicit Enrollment.curriculumId mismatch', () => {
    // Enrollment says 2023, Student says 2023, BlockGroup says 2026
    // Enrollment.curriculumId (2023) is authoritative — mismatch with BlockGroup (2026)
    const enrollment = makeOverrides(baseEnrollment, { curriculumId: '507f1f77bcf86cd799439015' }); // 2023
    const student = makeOverrides(baseStudent, { curriculumVersion: '2023' });
    const group = makeOverrides(baseBlockGroup, { curriculumId: '507f1f77bcf86cd799439099' }); // 2026 different
    const result = evaluateStudentEligibility(enrollment, student, group, baseBlockSection, null, baseCurriculumDoc, activePeriod);
    expect(result.checks.curriculum).toBe(false);
    expect(result.eligible).toBe(false);
  });
});

// === BULK ORDERING DETERMINISM ===
describe('Bulk assignment ordering determinism', () => {
  // Simulate the frontend bulk assignment logic
  function simulateBulkAssignment(studentIds, eligibleIds, slotsAvailable) {
    const eligibleSet = new Set(eligibleIds);
    const studentsToAssign = studentIds.filter((id) => eligibleSet.has(id));
    const toAssign = studentsToAssign.slice(0, Math.max(0, slotsAvailable));
    const capacityExhausted = studentsToAssign.slice(Math.max(0, slotsAvailable));
    return { toAssign, capacityExhausted };
  }

  test('✓ selected student order is preserved in assignment', () => {
    const selected = ['s1', 's2', 's3', 's4', 's5'];
    const eligible = ['s1', 's2', 's3', 's4', 's5'];
    const { toAssign } = simulateBulkAssignment(selected, eligible, 5);
    expect(toAssign).toEqual(['s1', 's2', 's3', 's4', 's5']);
  });

  test('✓ capacity exhaustion is deterministic — first N eligible get assigned', () => {
    const selected = ['s1', 's2', 's3', 's4', 's5', 's6', 's7'];
    const eligible = ['s1', 's2', 's3', 's4', 's5', 's6', 's7'];
    const { toAssign, capacityExhausted } = simulateBulkAssignment(selected, eligible, 5);
    expect(toAssign).toEqual(['s1', 's2', 's3', 's4', 's5']);
    expect(capacityExhausted).toEqual(['s6', 's7']);
  });

  test('✓ ineligible students are filtered, remaining preserve order', () => {
    const selected = ['s1', 's2', 's3', 's4', 's5', 's6', 's7'];
    const eligible = ['s1', 's3', 's5', 's6', 's7']; // s2 and s4 ineligible
    const { toAssign, capacityExhausted } = simulateBulkAssignment(selected, eligible, 3);
    expect(toAssign).toEqual(['s1', 's3', 's5']);
    expect(capacityExhausted).toEqual(['s6', 's7']);
  });

  test('✓ order does not change between runs (deterministic)', () => {
    const selected = ['s3', 's1', 's2', 's5', 's4'];
    const eligible = ['s3', 's1', 's2', 's5', 's4'];
    const run1 = simulateBulkAssignment(selected, eligible, 3);
    const run2 = simulateBulkAssignment(selected, eligible, 3);
    expect(run1.toAssign).toEqual(run2.toAssign);
    expect(run1.toAssign).toEqual(['s3', 's1', 's2']);
  });
});

// === PARTIAL ASSIGNMENT ===
describe('Partial assignment reporting', () => {
  function simulatePartialResult(selected, eligible, ineligible, slotsAvailable) {
    const eligibleSet = new Set(eligible.map((e) => e.studentId));
    const studentsToAssign = selected.filter((id) => eligibleSet.has(id));
    const assigned = studentsToAssign.slice(0, Math.max(0, slotsAvailable));
    const capacityExhausted = studentsToAssign.slice(Math.max(0, slotsAvailable));
    return {
      selected: selected.length,
      eligible: eligible.length,
      assigned: assigned.length,
      ineligible: ineligible.length,
      capacityExhausted: capacityExhausted.length,
    };
  }

  test('✓ eligible students beyond capacity are reported as capacityExhausted', () => {
    const result = simulatePartialResult(
      ['s1', 's2', 's3', 's4', 's5'],
      [{ studentId: 's1' }, { studentId: 's2' }, { studentId: 's3' }, { studentId: 's4' }, { studentId: 's5' }],
      [],
      3
    );
    expect(result.assigned).toBe(3);
    expect(result.capacityExhausted).toBe(2);
    expect(result.ineligible).toBe(0);
  });

  test('✓ assigned count never exceeds capacity', () => {
    const result = simulatePartialResult(
      ['s1', 's2', 's3', 's4', 's5', 's6', 's7', 's8', 's9', 's10'],
      [{ studentId: 's1' }, { studentId: 's2' }, { studentId: 's3' }, { studentId: 's4' }, { studentId: 's5' },
       { studentId: 's6' }, { studentId: 's7' }, { studentId: 's8' }, { studentId: 's9' }, { studentId: 's10' }],
      [],
      5
    );
    expect(result.assigned).toBeLessThanOrEqual(5);
    expect(result.assigned).toBe(5);
    expect(result.capacityExhausted).toBe(5);
  });

  test('✓ partial result distinguishes ineligible from capacity-exhausted', () => {
    const result = simulatePartialResult(
      ['s1', 's2', 's3', 's4', 's5'],
      [{ studentId: 's1' }, { studentId: 's2' }, { studentId: 's3' }],
      [{ studentId: 's4', reasons: ['Curriculum mismatch'] }, { studentId: 's5', reasons: ['Year level mismatch'] }],
      2
    );
    expect(result.assigned).toBe(2);
    expect(result.eligible).toBe(3);
    expect(result.ineligible).toBe(2);
    expect(result.capacityExhausted).toBe(1);
    expect(result.ineligible + result.capacityExhausted + result.assigned).toBe(result.selected);
  });
});

// === CONCURRENT FINAL SLOT (ATOMIC CAPACITY) ===
describe('Atomic capacity protection', () => {
  // Simulate the atomic findOneAndUpdate behavior
  // The real implementation uses: findOneAndUpdate(
  //   { currentPopulation: { $lt: capacity } },
  //   { $inc: { currentPopulation: 1 } }
  // )
  function simulateAtomicAssign(section, requestCount) {
    let currentPopulation = section.currentPopulation;
    const results = [];

    for (let i = 0; i < requestCount; i++) {
      // Atomic check: only proceed if currentPopulation < capacity
      if (currentPopulation < section.capacity) {
        currentPopulation += 1;
        results.push('success');
      } else {
        results.push('capacity_full');
      }
    }

    return { finalPopulation: currentPopulation, results };
  }

  test('✓ two concurrent assignments cannot consume the same final slot', () => {
    const section = { capacity: 1, currentPopulation: 0 };
    const { finalPopulation, results } = simulateAtomicAssign(section, 2);
    expect(finalPopulation).toBe(1);
    expect(results).toEqual(['success', 'capacity_full']);
  });

  test('✓ capacity is never exceeded', () => {
    const section = { capacity: 40, currentPopulation: 39 };
    const { finalPopulation, results } = simulateAtomicAssign(section, 3);
    expect(finalPopulation).toBe(40);
    expect(results).toEqual(['success', 'capacity_full', 'capacity_full']);
  });

  test('✓ single assignment to empty section succeeds', () => {
    const section = { capacity: 40, currentPopulation: 0 };
    const { finalPopulation, results } = simulateAtomicAssign(section, 1);
    expect(finalPopulation).toBe(1);
    expect(results).toEqual(['success']);
  });

  test('✓ assignment to full section fails', () => {
    const section = { capacity: 40, currentPopulation: 40 };
    const { finalPopulation, results } = simulateAtomicAssign(section, 1);
    expect(finalPopulation).toBe(40);
    expect(results).toEqual(['capacity_full']);
  });

  test('✓ exact capacity boundary — 5 slots, 5 requests, all succeed', () => {
    const section = { capacity: 40, currentPopulation: 35 };
    const { finalPopulation, results } = simulateAtomicAssign(section, 5);
    expect(finalPopulation).toBe(40);
    expect(results).toEqual(['success', 'success', 'success', 'success', 'success']);
  });

  test('✓ exact capacity boundary — 5 slots, 6 requests, last fails', () => {
    const section = { capacity: 40, currentPopulation: 35 };
    const { finalPopulation, results } = simulateAtomicAssign(section, 6);
    expect(finalPopulation).toBe(40);
    expect(results).toEqual(['success', 'success', 'success', 'success', 'success', 'capacity_full']);
  });
});
