/**
 * Tests for the classified pre-rollover validation checks
 * (server/services/preRolloverValidationService.js).
 *
 * Every result must be bucketed as blocking / warning / passed, blocking
 * errors must prevent rollover, and the checks must NOT assume every student
 * completed every subject — failing students are legitimately retained by the
 * established progression rules. Models are mocked (no real data); the
 * service reads models through .select()/.sort()/.lean() chains, so the mocks
 * provide them.
 */

jest.mock('./models/Student', () => ({ find: jest.fn() }));
jest.mock('./models/Enrollment', () => ({ countDocuments: jest.fn() }));
jest.mock('./models/BlockGroup', () => ({ find: jest.fn() }));
jest.mock('./models/StudentBlockAssignment', () => ({ find: jest.fn() }));
jest.mock('./models/RolloverBatch', () => ({ findOne: jest.fn() }));
jest.mock('./models/Backup', () => ({ findOne: jest.fn() }));
jest.mock('./models/SystemSetting', () => ({ findOne: jest.fn() }));

const Student = require('./models/Student');
const Enrollment = require('./models/Enrollment');
const BlockGroup = require('./models/BlockGroup');
const StudentBlockAssignment = require('./models/StudentBlockAssignment');
const RolloverBatch = require('./models/RolloverBatch');
const Backup = require('./models/Backup');
const SystemSetting = require('./models/SystemSetting');

const Service = require('./services/preRolloverValidationService');

const SY = '2025-2026';
const TO_SY = '2026-2027';
const BASE = { fromSchoolYear: SY, toSchoolYear: TO_SY, semester: '1st' };

/** A mocked query whose .lean() (and any .select()/.sort() before it) resolves value. */
const dbResult = (value) => ({
  lean: async () => value,
  select: () => dbResult(value),
  sort: () => dbResult(value),
});

const bucketOf = (results, key) => {
  const found = results.find((item) => item.key === key);
  return found ? found.status : 'absent';
};

let submissionCounts;

beforeEach(() => {
  jest.resetAllMocks();
  submissionCounts = { submitted: 0, returned: 0, targetConflicts: 0 };
  // Clean dataset by default.
  submissionCounts = { submitted: 0, returned: 0, targetConflicts: 0 };
  Enrollment.countDocuments.mockImplementation((query) => {
    if (query['subjects.submissionStatus'] === 'Submitted') return Promise.resolve(submissionCounts.submitted);
    if (query['subjects.submissionStatus'] === 'Returned') return Promise.resolve(submissionCounts.returned);
    if (query.isCurrent) return Promise.resolve(submissionCounts.targetConflicts);
    return Promise.resolve(0);
  });
  Student.find.mockReturnValue(dbResult([]));
  StudentBlockAssignment.find.mockReturnValue(dbResult([]));
  BlockGroup.find.mockReturnValue(dbResult([]));
  RolloverBatch.findOne.mockReturnValue(dbResult(null));
  Backup.findOne.mockReturnValue(dbResult(null));
  SystemSetting.findOne.mockReturnValue(dbResult(null));
});

const student = (id, extra = {}) => ({
  _id: `student_${id}`,
  studentNumber: `2025-000${id}`,
  course: 'BSIT',
  yearLevel: 1,
  section: `A-1`,
  lifecycleStatus: 'Enrolled',
  latestGrade: 92,
  ...extra,
});

describe('target school year validity (blocking)', () => {
  test('a malformed target year is a blocking error', async () => {
    const run = await Service.runChecks({ ...BASE, toSchoolYear: '2026/2027' });
    expect(bucketOf(run.results, 'target_validity')).toBe('blocking');
    expect(run.status).toBe('failed');
    expect(run.summary.blockingErrors).toBeGreaterThan(0);
  });

  test('a non-consecutive target year is a blocking error', async () => {
    const run = await Service.runChecks({ ...BASE, toSchoolYear: '2027-2028' });
    expect(bucketOf(run.results, 'target_validity')).toBe('blocking');
  });

  test('a semester rollover cannot open the 1st semester of the same year', async () => {
    const run = await Service.runChecks({ fromSchoolYear: SY, toSchoolYear: SY, semester: '1st' });
    expect(bucketOf(run.results, 'target_validity')).toBe('blocking');
  });

  test('an invalid opening semester is caught by the validity check', async () => {
    const run = await Service.runChecks({ ...BASE, semester: 'First' });
    expect(bucketOf(run.results, 'target_validity')).toBe('blocking');
  });

  test('the immediate next school year is a valid target', async () => {
    const run = await Service.runChecks(BASE);
    expect(bucketOf(run.results, 'target_validity')).toBe('passed');
  });

  test('a semester rollover to 2nd is a valid target', async () => {
    const run = await Service.runChecks({ fromSchoolYear: SY, toSchoolYear: SY, semester: '2nd' });
    expect(bucketOf(run.results, 'target_validity')).toBe('passed');
  });
});

describe('active term alignment (blocking)', () => {
  test('closing the whole year while the 1st semester is still active is blocking', async () => {
    SystemSetting.findOne.mockReturnValue(dbResult({ key: 'academicTerm', value: { schoolYear: SY, semester: '1st' } }));
    const run = await Service.runChecks(BASE);
    expect(bucketOf(run.results, 'term_alignment')).toBe('blocking');
    expect(run.results.find((item) => item.key === 'term_alignment').details[0]).toMatch(/1st semester|Close the semester/i);
  });

  test('advancing to another semester when the year is past the 1st is blocking', async () => {
    SystemSetting.findOne.mockReturnValue(dbResult({ key: 'academicTerm', value: { schoolYear: SY, semester: '2nd' } }));
    const run = await Service.runChecks({ fromSchoolYear: SY, toSchoolYear: SY, semester: 'Summer' });
    expect(bucketOf(run.results, 'term_alignment')).toBe('blocking');
  });

  test('a semester rollover from an active 1st semester to the 2nd aligns', async () => {
    SystemSetting.findOne.mockReturnValue(dbResult({ key: 'academicTerm', value: { schoolYear: SY, semester: '1st' } }));
    const run = await Service.runChecks({ fromSchoolYear: SY, toSchoolYear: SY, semester: '2nd' });
    expect(bucketOf(run.results, 'term_alignment')).toBe('passed');
  });

  test('a retrospective closure of an older year is flagged as a note, not an error', async () => {
    SystemSetting.findOne.mockReturnValue(dbResult({ key: 'academicTerm', value: { schoolYear: '2024-2025', semester: '1st' } }));
    const run = await Service.runChecks(BASE);
    expect(bucketOf(run.results, 'term_alignment')).toBe('passed');
    expect(run.results.find((item) => item.key === 'term_alignment').message).toMatch(/retrospectively|retrospective|correction/i);
  });

  test('no active term configured still passes alignment', async () => {
    const run = await Service.runChecks(BASE);
    expect(bucketOf(run.results, 'term_alignment')).toBe('passed');
  });
});

describe('grade submission workflow (blocking)', () => {
  test('submitted-but-unapproved grades block the rollover', async () => {
    submissionCounts.submitted = 3;
    const run = await Service.runChecks(BASE);
    const gradeCheck = run.results.find((item) => item.key === 'grade_workflow_open');
    expect(gradeCheck.status).toBe('blocking');
    expect(gradeCheck.count).toBe(3);
    expect(run.status).toBe('failed');
  });

  test('returned grades that professors have not resolved block the rollover', async () => {
    submissionCounts.returned = 2;
    const run = await Service.runChecks(BASE);
    expect(bucketOf(run.results, 'grade_workflow_open')).toBe('blocking');
  });

  test('a clean grade workflow passes', async () => {
    const run = await Service.runChecks(BASE);
    expect(bucketOf(run.results, 'grade_workflow_open')).toBe('passed');
  });
});

describe('students without grades (warning — never blocking)', () => {
  test('students with no recorded grade produce a warning, not a blocking error', async () => {
    Student.find.mockReturnValue(dbResult([student(1, { latestGrade: undefined }), student(2)]));
    const run = await Service.runChecks(BASE);
    const missingCheck = run.results.find((item) => item.key === 'missing_grades');
    expect(missingCheck.status).toBe('warning');
    expect(missingCheck.count).toBe(1);
    expect(run.summary.blockingErrors).toBe(0);
    expect(run.status).toBe('warnings');
  });

  test('failing students (low grades) do NOT block — retention is legitimate', async () => {
    Student.find.mockReturnValue(dbResult([student(1, { latestGrade: 62 }), student(2, { latestGrade: 55 })]));
    const run = await Service.runChecks(BASE);
    expect(bucketOf(run.results, 'missing_grades')).toBe('passed');
    expect(run.summary.blockingErrors).toBe(0);
  });

  test('every active student graded passes cleanly', async () => {
    Student.find.mockReturnValue(dbResult([student(1), student(2)]));
    const run = await Service.runChecks(BASE);
    expect(bucketOf(run.results, 'missing_grades')).toBe('passed');
  });
});

describe('duplicate prevention (blocking)', () => {
  test('existing active enrollments in the target term block the rollover', async () => {
    submissionCounts.targetConflicts = 4;
    const run = await Service.runChecks(BASE);
    expect(bucketOf(run.results, 'duplicate_target_enrollment')).toBe('blocking');
    expect(run.status).toBe('failed');
  });

  test('an already-applied rollover batch for the same source→target blocks a rerun', async () => {
    RolloverBatch.findOne.mockReturnValue(dbResult({ batchId: 'batch_1', fromSchoolYear: SY, toSchoolYear: TO_SY, semester: '1st', status: 'applied' }));
    const run = await Service.runChecks(BASE);
    expect(bucketOf(run.results, 'duplicate_rollover')).toBe('blocking');
    expect(run.results.find((item) => item.key === 'duplicate_rollover').message).toContain('batch_1');
  });

  test('a clean target term with no applied batch passes both duplicate checks', async () => {
    const run = await Service.runChecks(BASE);
    expect(bucketOf(run.results, 'duplicate_target_enrollment')).toBe('passed');
    expect(bucketOf(run.results, 'duplicate_rollover')).toBe('passed');
  });
});

describe('block assignment / curriculum integrity (warning)', () => {
  test('students without a block assignment produce a warning', async () => {
    Student.find.mockReturnValue(dbResult([student(1), student(2)]));
    StudentBlockAssignment.find.mockReturnValue(dbResult([{ studentId: 'student_1' }]));
    const run = await Service.runChecks(BASE);
    const blockCheck = run.results.find((item) => item.key === 'block_integrity');
    expect(blockCheck.status).toBe('warning');
    expect(run.summary.blockingErrors).toBe(0);
  });

  test('block groups without a linked curriculum produce a warning', async () => {
    BlockGroup.find.mockReturnValue(dbResult([{ name: 'BSIT 1-A', curriculumId: null }]));
    const run = await Service.runChecks(BASE);
    expect(bucketOf(run.results, 'block_integrity')).toBe('warning');
  });

  test('fully assigned cohort with linked curricula passes', async () => {
    Student.find.mockReturnValue(dbResult([student(1), student(2)]));
    StudentBlockAssignment.find.mockReturnValue(dbResult([{ studentId: 'student_1' }, { studentId: 'student_2' }]));
    BlockGroup.find.mockReturnValue(dbResult([{ name: 'BSIT 1-A', curriculumId: 'cur_1' }]));
    const run = await Service.runChecks(BASE);
    expect(bucketOf(run.results, 'block_integrity')).toBe('passed');
  });
});

describe('backup / recovery safeguard', () => {
  test('no recent backup produces a warning with an actionable message', async () => {
    const run = await Service.runChecks(BASE);
    const backupCheck = run.results.find((item) => item.key === 'backup_safety');
    expect(backupCheck.status).toBe('warning');
    expect(backupCheck.actionable).toMatch(/backup/i);
  });

  test('a completed backup within 7 days passes', async () => {
    Backup.findOne.mockReturnValue(dbResult({ fileName: 'backup.zip', verificationStatus: 'verified', createdAt: new Date() }));
    const run = await Service.runChecks(BASE);
    expect(bucketOf(run.results, 'backup_safety')).toBe('passed');
  });

  test('an unverified (but completed) backup passes with a review hint', async () => {
    Backup.findOne.mockReturnValue(dbResult({ fileName: 'backup.zip', verificationStatus: 'pending', createdAt: new Date() }));
    const run = await Service.runChecks(BASE);
    const backupCheck = run.results.find((item) => item.key === 'backup_safety');
    expect(backupCheck.status).toBe('passed');
    expect(backupCheck.details.length).toBeGreaterThan(0);
  });
});

describe('overall classification', () => {
  test('a fully clean dataset classifies everything as passed', async () => {
    Student.find.mockReturnValue(dbResult([student(1), student(2)]));
    StudentBlockAssignment.find.mockReturnValue(dbResult([{ studentId: 'student_1' }, { studentId: 'student_2' }]));
    BlockGroup.find.mockReturnValue(dbResult([{ name: 'BSIT 1-A', curriculumId: 'cur_1' }]));
    Backup.findOne.mockReturnValue(dbResult({ fileName: 'backup.zip', verificationStatus: 'verified', createdAt: new Date() }));

    const run = await Service.runChecks(BASE);

    expect(run.status).toBe('passed');
    expect(run.summary).toEqual({ blockingErrors: 0, warnings: 0, passedChecks: run.results.length });
    expect(run.results.every((item) => item.status === 'passed')).toBe(true);
  });

  test('mixed failure: blocking + warning bucketing decides the run status', async () => {
    submissionCounts.submitted = 2; // blocking
    Student.find.mockReturnValue(dbResult([student(1, { latestGrade: undefined })])); // warning
    StudentBlockAssignment.find.mockReturnValue(dbResult([student(1)]));
    Student.find.mockReturnValue(dbResult([student(1)]));
    const run = await Service.runChecks(BASE);

    expect(run.summary.blockingErrors).toBeGreaterThanOrEqual(1);
    expect(run.summary.warnings).toBeGreaterThanOrEqual(1);
    expect(run.status).toBe('failed');
  });

  test('warnings alone still allow rollover in principle (status "warnings")', async () => {
    Student.find.mockReturnValue(dbResult([student(1, { latestGrade: undefined })])); // warning only
    const run = await Service.runChecks(BASE);
    expect(run.status).toBe('warnings');
    expect(run.summary.blockingErrors).toBe(0);
  });

  test('every non-passed result carries an actionable explanation for the registrar', async () => {
    submissionCounts.submitted = 2;
    Student.find.mockReturnValue(dbResult([student(1, { latestGrade: undefined })]));
    const run = await Service.runChecks(BASE);

    const failed = run.results.filter((item) => item.status !== 'passed');
    expect(failed.length).toBeGreaterThan(0);
    for (const item of failed) {
      expect(typeof item.key).toBe('string');
      expect(['blocking', 'warning']).toContain(item.status);
      expect(typeof item.title).toBe('string');
      expect(typeof item.message).toBe('string');
      expect(item.actionable).toBeTruthy();
    }
  });
});

describe('assertExecutionTimeGates (pre-execution race recheck)', () => {
  test('a stale check (1st semester still active, year closure attempted) throws 409', async () => {
    SystemSetting.findOne.mockReturnValue(dbResult({ key: 'academicTerm', value: { schoolYear: SY, semester: '1st' } }));
    await expect(Service.assertExecutionTimeGates(BASE)).rejects.toMatchObject({ statusCode: 409 });
  });

  test('target-term enrollments that appeared after validation throw ROLL_OVER_DUPLICATE 409', async () => {
    submissionCounts.targetConflicts = 2;
    await expect(Service.assertExecutionTimeGates(BASE)).rejects.toMatchObject({
      statusCode: 409,
      reasonCode: 'ROLL_OVER_DUPLICATE',
    });
  });

  test('an applied batch that appeared after validation throws ROLL_OVER_DUPLICATE 409', async () => {
    RolloverBatch.findOne.mockReturnValue(dbResult({ batchId: 'batch_9', status: 'applied' }));
    await expect(Service.assertExecutionTimeGates(BASE)).rejects.toMatchObject({
      statusCode: 409,
      reasonCode: 'ROLL_OVER_DUPLICATE',
    });
  });

  test('an invalid opening semester throws 400', async () => {
    await expect(Service.assertExecutionTimeGates({ ...BASE, semester: '3rd' })).rejects.toMatchObject({ statusCode: 400 });
  });

  test('a healthy context passes the recheck', async () => {
    await expect(Service.assertExecutionTimeGates(BASE)).resolves.toBeUndefined();
  });
});
