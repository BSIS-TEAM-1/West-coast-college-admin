/**
 * Regression tests for the Academic Year Rollover service.
 *
 * Covers the safety-critical rollover scenarios:
 *   - a transactional promote/retain rollover succeeds and writes the
 *     expected records (student, enrollment, block assignment, manifest);
 *   - stale decisions (student withdrawn / already rolled over) are detected
 *     at execution time and the whole batch is aborted;
 *   - duplicate target-term enrollments are rejected;
 *   - a database failure mid-way leaves no audit/manifest/terms writes;
 *   - duplicate and out-of-order revert requests are rejected;
 *   - revert blocks when a student changed after the rollover or when the
 *     new enrollment carries grades or payments (documented safety rules);
 *   - a clean revert restores the pre-rollover state without touching the
 *     student's grade fields (latestGrade etc.), which the rollover never
 *     modified and which may carry a later authorized correction.
 *
 * Models and mongoose sessions are mocked, following the project's existing
 * jest conventions (see enrollmentService.test.js). No real student data is
 * used and nothing destroys existing records.
 */

// ─── Mock all models ───
const mockChain = (resolveValue) => {
  const chain = {
    session: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    sort: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    populate: jest.fn().mockReturnThis(),
    lean: jest.fn(async () => resolveValue),
  };
  const thenable = Promise.resolve(resolveValue);
  chain.then = thenable.then.bind(thenable);
  chain.catch = thenable.catch.bind(thenable);
  chain.finally = thenable.finally.bind(thenable);
  return chain;
};

const MockObjectId = class {
  constructor(value) { this.valueOf = () => value; }
  static isValid() { return true; }
  toString() { return String(this.valueOf()); }
};

jest.mock('mongoose', () => {
  return {
    Types: { ObjectId: MockObjectId },
    startSession: jest.fn(),
  };
});

jest.mock('./models/Student', () => ({ find: jest.fn(), findOne: jest.fn() }));
jest.mock('./models/Enrollment', () => ({}));
jest.mock('./models/BlockGroup', () => ({ find: jest.fn(), create: jest.fn() }));
jest.mock('./models/BlockSection', () => ({ find: jest.fn(), create: jest.fn(), bulkWrite: jest.fn() }));
jest.mock('./models/StudentBlockAssignment', () => ({ find: jest.fn(), bulkWrite: jest.fn() }));
jest.mock('./models/ArchiveSnapshot', () => ({ create: jest.fn(), findOne: jest.fn() }));
jest.mock('./models/RolloverBatch', () => ({ findOne: jest.fn(), find: jest.fn(), create: jest.fn() }));
jest.mock('./models/AuditLog', () => ({ create: jest.fn() }));
jest.mock('./models/SystemSetting', () => ({ findOne: jest.fn(), findOneAndUpdate: jest.fn() }));
jest.mock('./models/Curriculum', () => ({ find: jest.fn() }));
jest.mock('./services/AcademicArchiveService', () => ({
  createSnapshotsForRollover: jest.fn(() => []),
}));
jest.mock('./services/curriculumProgressService', () => ({
  getGraduationGate: jest.fn(async () => new Map()),
}));

const mongoose = require('mongoose');
const Student = require('./models/Student');
const Enrollment = require('./models/Enrollment');
const BlockGroup = require('./models/BlockGroup');
const BlockSection = require('./models/BlockSection');
const StudentBlockAssignment = require('./models/StudentBlockAssignment');
const ArchiveSnapshot = require('./models/ArchiveSnapshot');
const RolloverBatch = require('./models/RolloverBatch');
const AuditLog = require('./models/AuditLog');
const SystemSetting = require('./models/SystemSetting');
const Curriculum = require('./models/Curriculum');
const AcademicArchiveService = require('./services/AcademicArchiveService');

const RolloverService = require('./services/academicYearRolloverService');

const FROM_SY = '2025-2026';
const TO_SY = '2026-2027';

const makeSession = () => ({
  withTransaction: jest.fn(async (fn) => fn()),
  endSession: jest.fn(),
});

const expectBulkWriteOk = (model) => {
  model.bulkWrite = jest.fn(async (ops) => ({ matchedCount: ops.length, modifiedCount: ops.length }));
};

const makeStudent = (props) => ({
  _id: props._id || props.studentId,
  studentNumber: props.studentNumber || `2025-101-${props._id}`,
  firstName: 'Test',
  lastName: `Student-${props._id}`,
  course: 101,
  yearLevel: props.yearLevel ?? 1,
  semester: '1st',
  schoolYear: props.schoolYear ?? FROM_SY,
  section: props.section ?? 'C',
  lifecycleStatus: props.lifecycleStatus ?? 'Enrolled',
  enrollmentStatus: props.enrollmentStatus ?? 'Enrolled',
  studentStatus: 'Regular',
  isActive: props.isActive ?? true,
  latestGrade: props.latestGrade === null ? null : (props.latestGrade ?? 1.5),
  gradeProfessor: props.gradeProfessor ?? 'prof1',
  gradeDate: props.gradeDate ?? new Date('2026-03-01'),
  updatedBy: props.updatedBy ?? 'user1',
  toObject() { return JSON.parse(JSON.stringify(this)); },
});

const makeCurrentEnrollment = (studentId, extra = {}) => ({
  _id: extra._id ?? `enr_${studentId}`,
  studentId,
  studentNumber: extra.studentNumber ?? '2025-101-001',
  schoolYear: extra.schoolYear ?? FROM_SY,
  semester: extra.semester ?? '1st',
  yearLevel: extra.yearLevel ?? 1,
  course: 'BEED',
  curriculumId: extra.curriculumId ?? 'curr1',
  status: extra.status ?? 'Enrolled',
  isCurrent: extra.isCurrent ?? true,
  lockedAt: extra.lockedAt ?? null,
  lockedBy: extra.lockedBy ?? null,
  rolloverBatchId: extra.rolloverBatchId ?? null,
  updatedBy: extra.updatedBy ?? null,
  subjects: extra.subjects ?? [],
  assessment: extra.assessment ?? { paymentHistory: [] },
  gradeSubmission: extra.gradeSubmission,
  toObject() { return JSON.parse(JSON.stringify(this)); },
});

describe('executeRollover', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    const session = makeSession();
    mongoose.startSession.mockResolvedValue(session);

    Student.find = jest.fn();
    Student.bulkWrite = jest.fn(async (ops) => ({ matchedCount: ops.length, modifiedCount: ops.length }));
    Enrollment.find = jest.fn();
    Enrollment.updateMany = jest.fn(async () => ({ modifiedCount: 0 }));
    expectBulkWriteOk(Enrollment);
    Enrollment.insertMany = jest.fn(async (docs) => docs);
    Enrollment.deleteMany = jest.fn();
    BlockGroup.find.mockImplementation(() => mockChain([]));
    BlockGroup.create = jest.fn(async (docs) => docs.map((d, i) => ({
      _id: `bg_${i}_${d.yearLevel}`,
      name: d.name,
      courseId: d.courseId,
      policies: d.policies,
    })));
    BlockSection.find = jest.fn();
    BlockSection.create = jest.fn(async (docs) => docs.map((d, i) => ({
      _id: `sec_${i}_${d.sectionCode}`,
      sectionCode: d.sectionCode,
      capacity: d.capacity,
      currentPopulation: 0,
    })));
    expectBulkWriteOk(BlockSection);
    StudentBlockAssignment.find = jest.fn();
    expectBulkWriteOk(StudentBlockAssignment);
    ArchiveSnapshot.create.mockImplementation(async (docs) => docs.map((d) => ({ _id: `snap_${d.type}_${JSON.stringify(d).length}` })));
    RolloverBatch.findOne.mockImplementation((filter) => {
      if (filter && filter.status === 'applied') {
        const chain = mockChain({ batchId: 'latest' });
        return chain;
      }
      return mockChain([]);
    });
    RolloverBatch.create = jest.fn(async (docs) => docs.map((d) => ({ ...d })));
    AuditLog.create.mockImplementation(async (docs) => docs.map((d) => ({ ...d, _id: 'audit1' })));
    // Default active term: end of the year (2nd semester) — the state in
    // which a YEAR rollover is valid. Semester-rollover tests override this
    // with an active 1st-semester term.
    SystemSetting.findOne.mockImplementation(() => mockChain({ key: 'academicTerm', value: { schoolYear: FROM_SY, semester: '2nd' } }));
    SystemSetting.findOneAndUpdate = jest.fn(async () => ({}));
    Curriculum.find.mockImplementation(() => mockChain([]));
  });

  const arrangeHappyPath = ({ studentOverrides = {}, enrollmentOverrides = {} } = {}) => {
    const student = makeStudent({ _id: 'stu1', studentNumber: '2025-101-001', yearLevel: 1, ...studentOverrides });
    Student.find.mockImplementationOnce(() => mockChain([student]));
    const currentEnrollment = makeCurrentEnrollment('stu1', { studentNumber: '2025-101-001', ...enrollmentOverrides });
    Enrollment.find.mockReturnValueOnce(mockChain([currentEnrollment]));
    StudentBlockAssignment.find.mockReturnValueOnce(mockChain([]));
    // The second BlockGroup.find call is the target-year group query.
    BlockGroup.find.mockImplementationOnce(() => mockChain([]));
    BlockSection.find = jest.fn(() => mockChain([]));
    return { student, currentEnrollment };
  };

  test('a normal student rollover succeeds and writes the expected records', async () => {
    arrangeHappyPath();

    const results = await RolloverService.executeRollover({
      fromSchoolYear: FROM_SY,
      toSchoolYear: TO_SY,
      semester: '1st',
      decisions: [{ studentId: 'stu1', action: 'promote' }],
      adminId: 'user1',
      adminRole: 'registrar',
    });

    expect(results.promoted).toHaveLength(1);
    expect(results.promoted[0].toYearLevel).toBe(2);
    expect(results.failures).toHaveLength(0);

    // Closing enrollment is completed + locked, and points at the batch.
    const closingOp = Enrollment.bulkWrite.mock.calls[0][0][0];
    expect(closingOp.updateOne.filter).toEqual({ _id: 'enr_stu1', lockedAt: null });
    expect(closingOp.updateOne.update.$set.status).toBe('Completed');
    expect(closingOp.updateOne.update.$set.isCurrent).toBe(false);
    expect(closingOp.updateOne.update.$set.lockedAt).toBeTruthy();
    expect(closingOp.updateOne.update.$set.rolloverBatchId).toBe(results.rolloverBatchId);

    // New enrollment for the target year.
    expect(Enrollment.insertMany).toHaveBeenCalledTimes(1);
    const newEnrollment = Enrollment.insertMany.mock.calls[0][0][0];
    expect(newEnrollment.studentId).toBe('stu1');
    expect(newEnrollment.schoolYear).toBe(TO_SY);
    expect(newEnrollment.semester).toBe('1st');
    expect(newEnrollment.yearLevel).toBe(2);
    expect(newEnrollment.status).toBe('Enrolled');
    expect(newEnrollment.isCurrent).toBe(true);
    expect(newEnrollment.subjects).toEqual([]);
    expect(newEnrollment.previousEnrollmentId).toBe('enr_stu1');
    expect(newEnrollment.rolloverBatchId).toBe(results.rolloverBatchId);

    // The student record is advanced WITHOUT touching grade data.
    const studentOps = Student.bulkWrite.mock.calls[0][0];
    expect(studentOps).toHaveLength(1);
    expect(studentOps[0].updateOne.filter).toEqual({ _id: 'stu1' });
    expect(studentOps[0].updateOne.update.$set.yearLevel).toBe(2);
    expect(studentOps[0].updateOne.update.$set.schoolYear).toBe(TO_SY);
    expect(studentOps[0].updateOne.update.$set).not.toHaveProperty('latestGrade');

    // Block assignment for the target year + section population increment.
    const assignmentOps = StudentBlockAssignment.bulkWrite.mock.calls[0][0];
    expect(assignmentOps[0].updateOne.update.$set.year).toBe(TO_SY);
    expect(assignmentOps[0].updateOne.update.$set.status).toBe('ASSIGNED');
    const sectionOps = BlockSection.bulkWrite.mock.calls[0][0];
    expect(sectionOps[0].updateOne.update.$inc).toEqual({ currentPopulation: 1 });

    // Manifest + audit + term advance.
    expect(RolloverBatch.create).toHaveBeenCalledTimes(1);
    const manifest = RolloverBatch.create.mock.calls[0][0][0];
    expect(manifest.status).toBe('applied');
    expect(manifest.studentChanges).toHaveLength(1);
    expect(manifest.studentChanges[0].studentBefore.yearLevel).toBe(1);
    expect(manifest.studentChanges[0].studentAfter.yearLevel).toBe(2);
    expect(AuditLog.create).toHaveBeenCalled();
    const auditDoc = AuditLog.create.mock.calls[0][0][0];
    expect(auditDoc.action).toBe('ARCHIVE');
    const termUpdate = SystemSetting.findOneAndUpdate.mock.calls[0][1];
    expect(termUpdate.$set.value).toEqual({ schoolYear: TO_SY, semester: '1st' });
  });

  test('rollover-created block groups inherit the closing cohort’s curriculumId (never "no curriculum")', async () => {
    // Closing year already has a BEED block (Year 2 — the level the promoted
    // Y1 student lands in) carrying the program's curriculum.
    BlockGroup.find.mockImplementationOnce(() => mockChain([
      { _id: 'bg_closing_y2', name: '101-2-A', courseId: 101, yearLevel: 2, curriculumId: 'curr_2026-2029', courseCode: 'BEED', policies: {} },
    ]));
    BlockGroup.find.mockImplementationOnce(() => mockChain([])); // no target-year groups yet
    BlockSection.find.mockImplementation(() => mockChain([]));
    arrangeHappyPath();

    const results = await RolloverService.executeRollover({
      fromSchoolYear: FROM_SY,
      toSchoolYear: TO_SY,
      semester: '1st',
      decisions: [{ studentId: 'stu1', action: 'promote' }],
      adminId: 'user1',
      adminRole: 'registrar',
    });

    expect(results.promoted).toHaveLength(1);
    const createdGroupDocs = BlockGroup.create.mock.calls.map((call) => call[0][0]);
    expect(createdGroupDocs).toHaveLength(1);
    expect(createdGroupDocs[0].curriculumId).toBe('curr_2026-2029');
  });


  test('an ineligible student (withdrawn after planning) aborts the whole rollover', async () => {
    arrangeHappyPath({ studentOverrides: { lifecycleStatus: 'Inactive', isActive: false } });

    await expect(
      RolloverService.executeRollover({
        fromSchoolYear: FROM_SY,
        toSchoolYear: TO_SY,
        semester: '1st',
        decisions: [{ studentId: 'stu1', action: 'promote' }],
        adminId: 'user1',
        adminRole: 'registrar',
      })
    ).rejects.toMatchObject({
      statusCode: 409,
      failures: [{ reasonCode: 'STALE_ROLLOVER_STATE' }],
    });

    // No partial writes: no enrollments, no manifest, no audit, no term change.
    expect(Enrollment.insertMany).not.toHaveBeenCalled();
    expect(Student.bulkWrite).not.toHaveBeenCalled();
    expect(RolloverBatch.create).not.toHaveBeenCalled();
    expect(AuditLog.create).not.toHaveBeenCalled();
    expect(SystemSetting.findOneAndUpdate).not.toHaveBeenCalled();
  });

  test('a student already rolled over (stale school year) aborts the batch', async () => {
    arrangeHappyPath({ studentOverrides: { schoolYear: TO_SY } });

    await expect(
      RolloverService.executeRollover({
        fromSchoolYear: FROM_SY,
        toSchoolYear: TO_SY,
        semester: '1st',
        decisions: [{ studentId: 'stu1', action: 'promote' }],
        adminId: 'user1',
        adminRole: 'registrar',
      })
    ).rejects.toMatchObject({ statusCode: 409, failures: [{ reasonCode: 'STALE_ROLLOVER_STATE' }] });

    expect(Enrollment.insertMany).not.toHaveBeenCalled();
    expect(SystemSetting.findOneAndUpdate).not.toHaveBeenCalled();
  });

  test('a student with an existing target-term enrollment aborts (no duplicate enrollments)', async () => {
    arrangeHappyPath({
      enrollmentOverrides: { _id: 'enr_future', schoolYear: TO_SY, status: 'Pending' },
      studentOverrides: { latestGrade: 1.0 },
    });

    // The from-year enrollment must also exist for the closing step.
    Enrollment.find.mockReset();
    Enrollment.find.mockReturnValueOnce(mockChain([
      makeCurrentEnrollment('stu1', { studentNumber: '2025-101-001' }),
      makeCurrentEnrollment('stu1', { studentNumber: '2025-101-001', _id: 'enr_future', schoolYear: TO_SY, status: 'Pending' }),
    ]));

    await expect(
      RolloverService.executeRollover({
        fromSchoolYear: FROM_SY,
        toSchoolYear: TO_SY,
        semester: '1st',
        decisions: [{ studentId: 'stu1', action: 'promote' }],
        adminId: 'user1',
        adminRole: 'registrar',
      })
    ).rejects.toMatchObject({ statusCode: 409, failures: [{ reasonCode: 'TARGET_ENROLLMENT_EXISTS' }] });

    expect(Enrollment.insertMany).not.toHaveBeenCalled();
    expect(RolloverBatch.create).not.toHaveBeenCalled();
  });

  test('a semester rollover promotes the SEMESTER without changing the year level', async () => {
    arrangeHappyPath();
    // Mid-year: the active term is still the 1st semester of the closing year.
    SystemSetting.findOne.mockImplementation(() => mockChain({ key: 'academicTerm', value: { schoolYear: FROM_SY, semester: '1st' } }));

    const results = await RolloverService.executeRollover({
      fromSchoolYear: FROM_SY,
      toSchoolYear: FROM_SY,
      semester: '2nd',
      decisions: [{ studentId: 'stu1', action: 'promote' }],
      adminId: 'user1',
      adminRole: 'registrar',
    });

    expect(results.mode).toBe('semester');
    expect(results.promoted).toHaveLength(1);
    // The cohort advances to the opening semester, NOT to a new year level.
    expect(results.promoted[0].toYearLevel).toBe(1);
    expect(results.failures).toHaveLength(0);

    // Closing enrollment (the completed 1st semester) is locked as Completed.
    const closingOp = Enrollment.bulkWrite.mock.calls[0][0][0];
    expect(closingOp.updateOne.filter).toEqual({ _id: 'enr_stu1', lockedAt: null });
    expect(closingOp.updateOne.update.$set.status).toBe('Completed');

    // New enrollment for the SAME school year, opening semester, same year level.
    expect(Enrollment.insertMany).toHaveBeenCalledTimes(1);
    const newEnrollment = Enrollment.insertMany.mock.calls[0][0][0];
    expect(newEnrollment.studentId).toBe('stu1');
    expect(newEnrollment.schoolYear).toBe(FROM_SY);
    expect(newEnrollment.semester).toBe('2nd');
    expect(newEnrollment.yearLevel).toBe(1);
    expect(newEnrollment.status).toBe('Enrolled');
    expect(newEnrollment.isCurrent).toBe(true);

    // The student record advances the term, not the year level.
    const studentOps = Student.bulkWrite.mock.calls[0][0];
    expect(studentOps[0].updateOne.filter).toEqual({ _id: 'stu1' });
    expect(studentOps[0].updateOne.update.$set.yearLevel).toBe(1);
    expect(studentOps[0].updateOne.update.$set.schoolYear).toBe(FROM_SY);
    expect(studentOps[0].updateOne.update.$set.semester).toBe('2nd');

    // Block assignment is written for the new term in the same school year.
    const assignmentOps = StudentBlockAssignment.bulkWrite.mock.calls[0][0];
    expect(assignmentOps[0].updateOne.update.$set.semester).toBe('2nd');
    expect(assignmentOps[0].updateOne.update.$set.year).toBe(FROM_SY);
    expect(assignmentOps[0].updateOne.update.$set.schoolYear).toBe(FROM_SY);

    // Manifest records the semester mode and the term-only change.
    expect(RolloverBatch.create).toHaveBeenCalledTimes(1);
    const manifest = RolloverBatch.create.mock.calls[0][0][0];
    expect(manifest.mode).toBe('semester');
    expect(manifest.semester).toBe('2nd');
    expect(manifest.studentChanges).toHaveLength(1);
    expect(manifest.studentChanges[0].studentBefore.yearLevel).toBe(1);
    expect(manifest.studentChanges[0].studentAfter.yearLevel).toBe(1);
    expect(manifest.studentChanges[0].studentBefore.semester).toBe('1st');
    expect(manifest.studentChanges[0].studentAfter.semester).toBe('2nd');

    // The global academic term advances within the same school year.
    const termUpdate = SystemSetting.findOneAndUpdate.mock.calls[0][1];
    expect(termUpdate.$set.value).toEqual({ schoolYear: FROM_SY, semester: '2nd' });
  });

  test('a semester rollover retain leaves the student completely untouched', async () => {
    arrangeHappyPath();
    // Mid-year: the active term is still the 1st semester of the closing year.
    SystemSetting.findOne.mockImplementation(() => mockChain({ key: 'academicTerm', value: { schoolYear: FROM_SY, semester: '1st' } }));

    const results = await RolloverService.executeRollover({
      fromSchoolYear: FROM_SY,
      toSchoolYear: FROM_SY,
      semester: '2nd',
      decisions: [{ studentId: 'stu1', action: 'retain' }],
      adminId: 'user1',
      adminRole: 'registrar',
    });

    expect(results.mode).toBe('semester');
    expect(results.retained).toHaveLength(1);
    expect(results.retained[0].toYearLevel).toBe(1);
    expect(results.promoted).toHaveLength(0);
    expect(results.failures).toHaveLength(0);

    // Retained-in-term students are not written, closed, or created for.
    expect(Student.bulkWrite).not.toHaveBeenCalled();
    expect(Enrollment.bulkWrite).not.toHaveBeenCalled(); // oldEnrollmentOps is empty
    expect(Enrollment.insertMany).not.toHaveBeenCalled();
    expect(StudentBlockAssignment.bulkWrite).not.toHaveBeenCalled();
    expect(BlockSection.bulkWrite).not.toHaveBeenCalled();

    // The manifest still exists (counts) but has nothing to revert.
    expect(RolloverBatch.create).toHaveBeenCalledTimes(1);
    const manifest = RolloverBatch.create.mock.calls[0][0][0];
    expect(manifest.mode).toBe('semester');
    expect(manifest.studentChanges).toHaveLength(0);
  });

  test('a year rollover is rejected while the active term is still the 1st semester', async () => {
    arrangeHappyPath();
    // Active term says we are mid-year — a year close must be refused.
    SystemSetting.findOne.mockImplementation(() => mockChain({ key: 'academicTerm', value: { schoolYear: FROM_SY, semester: '1st' } }));

    await expect(
      RolloverService.executeRollover({
        fromSchoolYear: FROM_SY,
        toSchoolYear: TO_SY,
        semester: '1st',
        decisions: [{ studentId: 'stu1', action: 'promote' }],
        adminId: 'user1',
        adminRole: 'registrar',
      })
    ).rejects.toMatchObject({
      statusCode: 400,
      message: expect.stringMatching(/still the 1st semester .* cannot be closed/),
    });

    // Nothing was written.
    expect(Student.bulkWrite).not.toHaveBeenCalled();
    expect(Enrollment.insertMany).not.toHaveBeenCalled();
    expect(RolloverBatch.create).not.toHaveBeenCalled();
    expect(SystemSetting.findOneAndUpdate).not.toHaveBeenCalled();
  });

  test('a semester rollover is rejected once the year is past the 1st semester', async () => {
    arrangeHappyPath();
    // Active term says the year is past its 1st semester — only a year close
    // is valid now.
    SystemSetting.findOne.mockImplementation(() => mockChain({ key: 'academicTerm', value: { schoolYear: FROM_SY, semester: '2nd' } }));

    await expect(
      RolloverService.executeRollover({
        fromSchoolYear: FROM_SY,
        toSchoolYear: FROM_SY,
        semester: '2nd',
        decisions: [{ studentId: 'stu1', action: 'promote' }],
        adminId: 'user1',
        adminRole: 'registrar',
      })
    ).rejects.toMatchObject({
      statusCode: 400,
      message: expect.stringMatching(/past the 1st semester.*Close the school year/),
    });



    expect(Student.bulkWrite).not.toHaveBeenCalled();
    expect(Enrollment.insertMany).not.toHaveBeenCalled();
    expect(RolloverBatch.create).not.toHaveBeenCalled();
    expect(SystemSetting.findOneAndUpdate).not.toHaveBeenCalled();
  });

  test('a database failure aborts without manifest, audit or term writes', async () => {
    arrangeHappyPath();
    Enrollment.insertMany.mockRejectedValueOnce(new Error('ECONNRESET'));

    await expect(
      RolloverService.executeRollover({
        fromSchoolYear: FROM_SY,
        toSchoolYear: TO_SY,
        semester: '1st',
        decisions: [{ studentId: 'stu1', action: 'promote' }],
        adminId: 'user1',
        adminRole: 'registrar',
      })
    ).rejects.toThrow('ECONNRESET');

    expect(RolloverBatch.create).not.toHaveBeenCalled();
    expect(AuditLog.create).not.toHaveBeenCalled();
    expect(SystemSetting.findOneAndUpdate).not.toHaveBeenCalled();
    expect(ArchiveSnapshot.create).not.toHaveBeenCalled();
  });
});

describe('revertRollover', () => {
  const CHANGE = {
    studentId: 'stu1',
    studentNumber: '2025-101-001',
    action: 'promote',
    studentBefore: {
      yearLevel: 1,
      schoolYear: FROM_SY,
      semester: '1st',
      section: 'C',
      lifecycleStatus: 'Enrolled',
      enrollmentStatus: 'Enrolled',
      isActive: true,
      latestGrade: 1.5,
      gradeProfessor: 'prof1',
      gradeDate: '2026-03-01',
      updatedBy: 'user1',
    },
    studentAfter: {
      yearLevel: 2,
      schoolYear: TO_SY,
      semester: '1st',
      section: '101-2-A',
      lifecycleStatus: 'Enrolled',
      enrollmentStatus: 'Enrolled',
      isActive: true,
    },
    previousEnrollment: {
      _id: 'enr_stu1',
      status: 'Enrolled',
      isCurrent: true,
      lockedAt: null,
      lockedBy: null,
      rolloverBatchId: null,
      updatedBy: 'user1',
    },
    otherCurrentEnrollmentIds: [],
    newEnrollmentId: 'enr_new',
    newYearLevel: 2,
    newSectionId: 'sec_new',
    newSectionCode: '101-2-A',
    previousBlockAssignment: {
      _id: 'asg_prev',
      enrollmentId: 'enr_stu1',
      sectionId: 'sec_prev',
      semester: '1st',
      year: FROM_SY,
      schoolYear: FROM_SY,
      status: 'ASSIGNED',
      assignedAt: '2025-08-01',
      waitlistPriority: null,
    },
    newBlockAssignmentId: 'asg_new',
  };

  const makeBatch = (overrides = {}) => {
    const batch = {
      batchId: 'rollover_1',
      fromSchoolYear: FROM_SY,
      toSchoolYear: TO_SY,
      semester: '1st',
      status: 'applied',
      previousAcademicTerm: { schoolYear: FROM_SY, semester: '1st' },
      createdBlockGroupIds: [],
      createdBlockSectionIds: [],
      studentChanges: [JSON.parse(JSON.stringify(CHANGE))],
      counts: { total: 1, promoted: 1, retained: 0, graduated: 0, skipped: 0 },
      snapshotIds: [],
      save: jest.fn(async () => batch),
      ...overrides,
    };
    return batch;
  };

  const cleanNewEnrollment = () => makeCurrentEnrollment('stu1', {
    _id: 'enr_new',
    schoolYear: TO_SY,
    yearLevel: 2,
    status: 'Enrolled',
    rolloverBatchId: 'rollover_1',
  });

  // Closing enrollment as it exists AFTER the rollover: locked, retired.
  const cleanPreviousEnrollment = () => makeCurrentEnrollment('stu1', {
    _id: 'enr_stu1',
    status: 'Completed',
    isCurrent: false,
    rolloverBatchId: 'rollover_1',
    lockedAt: new Date('2026-04-01'),
  });

  const arrangeRevert = ({ batch, student, newEnrollment, previousEnrollment = cleanPreviousEnrollment(), term, newAssignmentTerm = { semester: '1st', year: TO_SY } } = {}) => {
    const s = makeSession();
    mongoose.startSession.mockResolvedValue(s);
    RolloverBatch.findOne.mockImplementation((filter) => {
      if (filter && filter.status === 'applied') return mockChain({ batchId: batch.batchId });
      return mockChain(batch);
    });
    SystemSetting.findOne.mockImplementation(() => mockChain({
      key: 'academicTerm',
      value: term || { schoolYear: TO_SY, semester: '1st' },
    }));
    Student.find = jest.fn(() => mockChain(student ? [student] : []));
    Enrollment.find = jest.fn((filter) => {
      if (JSON.stringify(filter._id).includes('enr_new')) return mockChain(newEnrollment ? [newEnrollment] : []);
      return mockChain(previousEnrollment ? [previousEnrollment] : []);
    });
    const newAssignment = {
      _id: 'asg_new',
      sectionId: 'sec_new',
      semester: newAssignmentTerm.semester,
      year: newAssignmentTerm.year,
      status: 'ASSIGNED',
    };
    const prevAssignment = {
      _id: 'asg_prev',
      sectionId: 'sec_prev',
      semester: '1st',
      year: FROM_SY,
      status: 'ASSIGNED',
    };
    StudentBlockAssignment.find = jest.fn((filter) => {
      const key = JSON.stringify(filter._id);
      if (key.includes('asg_new')) return mockChain([newAssignment]);
      if (key.includes('asg_prev')) return mockChain([prevAssignment]);
      return mockChain([]);
    });

    Enrollment.deleteMany = jest.fn(() => mockChain({ deletedCount: 1 }));
    expectBulkWriteOk(Enrollment);
    Enrollment.updateMany = jest.fn(async () => ({ modifiedCount: 0 }));
    Student.bulkWrite = jest.fn();
    expectBulkWriteOk(StudentBlockAssignment);
    expectBulkWriteOk(BlockSection);
    BlockSection.find = jest.fn(() => mockChain([]));
    SystemSetting.findOneAndUpdate = jest.fn(async () => ({}));
    AuditLog.create.mockImplementation(async (docs) => docs.map((d) => ({ ...d, _id: 'audit_rev' })));
    ArchiveSnapshot.create.mockImplementation(async (docs) => docs.map((d) => ({ ...d, _id: 'snap_rev' })));
    return s;
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('a duplicate revert request is rejected (already reverted)', async () => {
    RolloverBatch.findOne.mockImplementation((filter) => mockChain(makeBatch({ status: 'reverted', revertedAt: new Date() })));

    await expect(
      RolloverService.revertRollover({ batchId: 'rollover_1', adminId: 'user1', adminRole: 'registrar' })
    ).rejects.toMatchObject({ statusCode: 409 });

    expect(mongoose.startSession).not.toHaveBeenCalled();
    expect(SystemSetting.findOneAndUpdate).not.toHaveBeenCalled();
  });

  test('only the most recent applied batch can be reverted', async () => {
    RolloverBatch.findOne.mockImplementation((filter) => {
      if (filter && filter.status === 'applied') return mockChain({ batchId: 'rollover_newer' });
      return mockChain(makeBatch());
    });

    await expect(
      RolloverService.revertRollover({ batchId: 'rollover_1', adminId: 'user1', adminRole: 'registrar' })
    ).rejects.toThrow('Only the most recent applied rollover can be reverted');

    expect(mongoose.startSession).not.toHaveBeenCalled();
  });

  test('revert is blocked when the active term changed', async () => {
    const batch = makeBatch();
    arrangeRevert({ batch, term: { schoolYear: '2027-2028', semester: '1st' } });

    await expect(
      RolloverService.revertRollover({ batchId: 'rollover_1', adminId: 'user1', adminRole: 'registrar' })
    ).rejects.toThrow('active academic term');

    expect(Enrollment.deleteMany).not.toHaveBeenCalled();
    expect(SystemSetting.findOneAndUpdate).not.toHaveBeenCalled();
  });

  test('revert is blocked when a student changed after the rollover (e.g. later withdrawal)', async () => {
    const batch = makeBatch();
    // Student re-enrolled back in the closing year / held status: no longer matches post-rollover state.
    const student = makeStudent({ _id: 'stu1', studentNumber: '2025-101-001', lifecycleStatus: 'Inactive', schoolYear: TO_SY, yearLevel: 2, section: '101-2-A' });
    arrangeRevert({ batch, student, newEnrollment: cleanNewEnrollment() });

    await expect(
      RolloverService.revertRollover({ batchId: 'rollover_1', adminId: 'user1', adminRole: 'registrar' })
    ).rejects.toThrow(/changed after the rollover \(lifecycleStatus\)/);

    expect(Enrollment.deleteMany).not.toHaveBeenCalled();
    expect(Student.bulkWrite).not.toHaveBeenCalled();
    expect(SystemSetting.findOneAndUpdate).not.toHaveBeenCalled();
  });

  test('revert is blocked when the new enrollment carries professor-recorded grades', async () => {
    const batch = makeBatch();
    const student = makeStudent({ _id: 'stu1', studentNumber: '2025-101-001', schoolYear: TO_SY, yearLevel: 2, section: '101-2-A' });
    const gradedEnrollment = makeCurrentEnrollment('stu1', {
      _id: 'enr_new',
      schoolYear: TO_SY,
      yearLevel: 2,
      status: 'Enrolled',
      rolloverBatchId: 'rollover_1',
      subjects: [{ grade: 1.75, status: 'Enrolled', submissionStatus: 'Draft' }],
    });
    arrangeRevert({ batch, student, newEnrollment: gradedEnrollment });

    await expect(
      RolloverService.revertRollover({ batchId: 'rollover_1', adminId: 'user1', adminRole: 'registrar' })
    ).rejects.toThrow(/grade record/);

    expect(Enrollment.deleteMany).not.toHaveBeenCalled();
    expect(SystemSetting.findOneAndUpdate).not.toHaveBeenCalled();
  });

  test('revert is blocked when the new enrollment has recorded payments', async () => {
    const batch = makeBatch();
    const student = makeStudent({ _id: 'stu1', studentNumber: '2025-101-001', schoolYear: TO_SY, yearLevel: 2, section: '101-2-A' });
    const paidEnrollment = makeCurrentEnrollment('stu1', {
      _id: 'enr_new',
      schoolYear: TO_SY,
      yearLevel: 2,
      status: 'Enrolled',
      rolloverBatchId: 'rollover_1',
      assessment: { paymentHistory: [{ amount: 5000, orNumber: 'OR-1' }] },
    });
    arrangeRevert({ batch, student, newEnrollment: paidEnrollment });

    await expect(
      RolloverService.revertRollover({ batchId: 'rollover_1', adminId: 'user1', adminRole: 'registrar' })
    ).rejects.toThrow(/recorded payment/);

    expect(Enrollment.deleteMany).not.toHaveBeenCalled();
  });

  test('a clean revert restores the pre-rollover state and preserves grade fields', async () => {
    const batch = makeBatch();
    const student = makeStudent({
      _id: 'stu1',
      studentNumber: '2025-101-001',
      schoolYear: TO_SY,
      yearLevel: 2,
      section: '101-2-A',
      latestGrade: 2.25,
      gradeProfessor: 'prof2',
      gradeDate: new Date('2026-09-15'),
    });
    arrangeRevert({ batch, student, newEnrollment: cleanNewEnrollment() });
    BlockSection.find.mockReturnValueOnce(mockChain([{ _id: 'sec_new', currentPopulation: 1 }]));

    const summary = await RolloverService.revertRollover({
      batchId: 'rollover_1',
      adminId: 'user1',
      adminRole: 'registrar',
    });

    expect(summary.revertedAt).toBeTruthy();
    expect(summary.restoredStudents).toBe(1);

    // The new enrollment is deleted (and only while unlocked).
    expect(Enrollment.deleteMany).toHaveBeenCalledWith(
      { _id: { $in: ['enr_new'] }, lockedAt: null }
    );

    // The closing enrollment is unlocked and restored to its pre-rollover status.
    const enrollmentOps = Enrollment.bulkWrite.mock.calls[0][0];
    expect(enrollmentOps[0].updateOne.filter._id).toBe('enr_stu1');
    expect(enrollmentOps[0].updateOne.update.$set.status).toBe('Enrolled');
    expect(enrollmentOps[0].updateOne.update.$set.lockedAt).toBeNull();

    // The student is restored to the pre-rollover state WITHOUT overwriting
    // grade fields (they may hold a later authorized correction).
    const studentOps = Student.bulkWrite.mock.calls[0][0];
    expect(studentOps[0].updateOne.update.$set.yearLevel).toBe(1);
    expect(studentOps[0].updateOne.update.$set.schoolYear).toBe(FROM_SY);
    expect(studentOps[0].updateOne.update.$set.section).toBe('C');
    expect(studentOps[0].updateOne.update.$set).not.toHaveProperty('latestGrade');
    expect(studentOps[0].updateOne.update.$set).not.toHaveProperty('gradeProfessor');
    expect(studentOps[0].updateOne.update.$set).not.toHaveProperty('gradeDate');

    // Assignments: the new one is removed, the previous one restored.
    const assignmentOps = StudentBlockAssignment.bulkWrite.mock.calls[0][0];
    expect(assignmentOps.some((op) => op.deleteOne && String(op.deleteOne.filter._id) === 'asg_new')).toBe(true);
    const restoredAssignment = assignmentOps.find((op) => op.updateOne && op.updateOne.filter._id === 'asg_prev');
    expect(restoredAssignment.updateOne.update.$set.sectionId).toBe('sec_prev');

    // Section population is decremented safely (never below zero).
    const sectionOps = BlockSection.bulkWrite.mock.calls[0][0];
    expect(sectionOps[0].updateOne.update.$set.currentPopulation).toBe(0);

    // The academic term is restored.
    expect(SystemSetting.findOneAndUpdate).toHaveBeenCalledWith(
      { key: 'academicTerm' },
      { $set: { value: { schoolYear: FROM_SY, semester: '1st' } } },
      expect.objectContaining({ upsert: true })
    );

    // The batch is marked reverted and audited.
    expect(batch.status).toBe('reverted');
    expect(batch.revertedBy).toBe('user1');
    expect(batch.save).toHaveBeenCalled();
    const auditDoc = AuditLog.create.mock.calls[0][0][0];
    expect(auditDoc.action).toBe('RESTORE');
    expect(ArchiveSnapshot.create).toHaveBeenCalled();
    const revertSnapshot = ArchiveSnapshot.create.mock.calls[0][0][0];
    expect(revertSnapshot.type).toBe('ROLLOVER_REVERT');
  });

  test('revert is blocked when a rollover-created section gained outside students', async () => {
    const batch = makeBatch({ createdBlockSectionIds: ['sec_new'] });
    const student = makeStudent({ _id: 'stu1', studentNumber: '2025-101-001', schoolYear: TO_SY, yearLevel: 2, section: '101-2-A' });
    arrangeRevert({ batch, student, newEnrollment: cleanNewEnrollment() });
    // Keep the preflight assignment lookups intact, but the section census
    // finds an assignment that does not belong to this rollover.
    StudentBlockAssignment.find = jest.fn((filter) => {
      if (filter.sectionId) return mockChain([{ _id: 'asg_outsider', sectionId: 'sec_new' }]);
      const key = JSON.stringify(filter._id);
      if (key.includes('asg_new')) return mockChain([{ _id: 'asg_new', sectionId: 'sec_new', semester: '1st', year: TO_SY, status: 'ASSIGNED' }]);
      if (key.includes('asg_prev')) return mockChain([{ _id: 'asg_prev', sectionId: 'sec_prev', semester: '1st', year: FROM_SY, status: 'ASSIGNED' }]);
      return mockChain([]);
    });

    await expect(
      RolloverService.revertRollover({ batchId: 'rollover_1', adminId: 'user1', adminRole: 'registrar' })
    ).rejects.toThrow(/outside the rollover/);

    expect(Enrollment.deleteMany).not.toHaveBeenCalled();
  });

  test('a clean revert restores a semester-rollover batch (same school year)', async () => {
    // A semester batch: same from/to school year; only the semester advanced.
    const semesterChange = JSON.parse(JSON.stringify(CHANGE));
    semesterChange.studentAfter = {
      yearLevel: 1,
      schoolYear: FROM_SY,
      semester: '2nd',
      section: '101-1-A',
      lifecycleStatus: 'Enrolled',
      enrollmentStatus: 'Enrolled',
      isActive: true,
    };
    semesterChange.newYearLevel = 1;
    semesterChange.newSectionCode = '101-1-A';

    const batch = makeBatch({
      fromSchoolYear: FROM_SY,
      toSchoolYear: FROM_SY,
      semester: '2nd',
      previousAcademicTerm: { schoolYear: FROM_SY, semester: '1st' },
      studentChanges: [semesterChange],
      counts: { total: 1, promoted: 1, retained: 0, graduated: 0, skipped: 0 },
    });

    const student = makeStudent({
      _id: 'stu1',
      studentNumber: '2025-101-001',
      schoolYear: FROM_SY,
      yearLevel: 1,
      section: '101-1-A',
    });
    student.semester = '2nd'; // makeStudent defaults to '1st'
    const newEnrollment = makeCurrentEnrollment('stu1', {
      _id: 'enr_new',
      schoolYear: FROM_SY,
      semester: '2nd',
      yearLevel: 1,
      status: 'Enrolled',
      rolloverBatchId: 'rollover_1',
    });
    const previousEnrollment = makeCurrentEnrollment('stu1', {
      _id: 'enr_stu1',
      semester: '1st',
      status: 'Completed',
      isCurrent: false,
      rolloverBatchId: 'rollover_1',
      lockedAt: new Date('2026-04-01'),
    });
    arrangeRevert({
      batch,
      student,
      newEnrollment,
      previousEnrollment,
      term: { schoolYear: FROM_SY, semester: '2nd' },
      newAssignmentTerm: { semester: '2nd', year: FROM_SY },
    });

    const summary = await RolloverService.revertRollover({
      batchId: 'rollover_1',
      adminId: 'user1',
      adminRole: 'registrar',
    });

    expect(summary.revertedAt).toBeTruthy();
    expect(summary.restoredStudents).toBe(1);

    // The 2nd-semester enrollment created by the rollover is deleted.
    expect(Enrollment.deleteMany).toHaveBeenCalledWith(
      { _id: { $in: ['enr_new'] }, lockedAt: null }
    );

    // The 1st-semester closing enrollment is unlocked and restored.
    const enrollmentOps = Enrollment.bulkWrite.mock.calls[0][0];
    expect(enrollmentOps[0].updateOne.filter._id).toBe('enr_stu1');
    expect(enrollmentOps[0].updateOne.update.$set.status).toBe('Enrolled');
    expect(enrollmentOps[0].updateOne.update.$set.lockedAt).toBeNull();

    // The student is restored to the pre-rollover semester (same year level).
    const studentOps = Student.bulkWrite.mock.calls[0][0];
    expect(studentOps[0].updateOne.update.$set.yearLevel).toBe(1);
    expect(studentOps[0].updateOne.update.$set.schoolYear).toBe(FROM_SY);
    expect(studentOps[0].updateOne.update.$set.section).toBe('C');

    // Academic term is restored to the pre-rollover semester.
    expect(SystemSetting.findOneAndUpdate).toHaveBeenCalledWith(
      { key: 'academicTerm' },
      { $set: { value: { schoolYear: FROM_SY, semester: '1st' } } },
      expect.objectContaining({ upsert: true })
    );

    expect(batch.status).toBe('reverted');
  });
});

describe('preview guard rails', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Student.find = jest.fn(() => mockChain([]));
    StudentBlockAssignment.find = jest.fn(() => mockChain([]));
  });

  test('invalid school years are rejected', async () => {
    await expect(
      RolloverService.previewRollover({ fromSchoolYear: '2025', toSchoolYear: TO_SY, semester: '1st' })
    ).rejects.toThrow(/YYYY-YYYY/);
    await expect(
      RolloverService.previewRollover({ fromSchoolYear: FROM_SY, toSchoolYear: 'bogus', semester: '1st' })
    ).rejects.toThrow(/YYYY-YYYY/);
  });

  test('execute rejects a same-school-year rollover that does not advance the semester', async () => {
    await expect(
      RolloverService.executeRollover({
        fromSchoolYear: FROM_SY,
        toSchoolYear: FROM_SY,
        semester: '1st',
        decisions: [{ studentId: 'stu1', action: 'promote' }],
        adminId: 'user1',
      })
    ).rejects.toMatchObject({
      statusCode: 400,
      message: expect.stringMatching(/opening semester must be 2nd or Summer/),
    });
    expect(mongoose.startSession).not.toHaveBeenCalled();
  });

  test('a semester rollover preview recommends a semester promotion (not graduation) for final-year students', async () => {
    const finalYear = makeStudent({ _id: 'stu4', studentNumber: '2025-101-004', yearLevel: 4, latestGrade: 1.25 });
    Student.find = jest.fn(() => mockChain([finalYear]));

    const preview = await RolloverService.previewRollover({
      fromSchoolYear: FROM_SY,
      toSchoolYear: FROM_SY,
      semester: '2nd',
    });

    expect(preview.mode).toBe('semester');
    expect(preview.evaluations).toHaveLength(1);
    expect(preview.evaluations[0].recommendedAction).toBe('promote');
    expect(preview.evaluations[0].reason).toMatch(/Final year in progress/);
  });

  test('a year rollover preview still recommends graduation for final-year students', async () => {
    const finalYear = makeStudent({ _id: 'stu4', studentNumber: '2025-101-004', yearLevel: 4, latestGrade: 1.25 });
    Student.find = jest.fn(() => mockChain([finalYear]));

    const preview = await RolloverService.previewRollover({
      fromSchoolYear: FROM_SY,
      toSchoolYear: TO_SY,
      semester: '1st',
    });

    expect(preview.mode).toBe('year');
    expect(preview.evaluations[0].recommendedAction).toBe('graduate');
  });
});

describe('rollover history and detailed student export', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('listRolloverBatches returns newest first without loading the revert manifest', async () => {
    const batches = [{ batchId: 'batch-2' }, { batchId: 'batch-1' }];
    const chain = mockChain(batches);
    RolloverBatch.find.mockReturnValue(chain);

    const result = await RolloverService.listRolloverBatches({ limit: 250 });

    expect(result).toEqual(batches);
    expect(RolloverBatch.find).toHaveBeenCalledWith({});
    expect(chain.select.mock.calls[0][0]).not.toContain('studentChanges');
    expect(chain.sort).toHaveBeenCalledWith({ executedAt: -1 });
    expect(chain.limit).toHaveBeenCalledWith(250);
  });

  test('a rollover batch id is required for the detailed report', async () => {
    await expect(RolloverService.getRolloverStudentReport('')).rejects.toMatchObject({ statusCode: 400 });
  });

  test('a missing rollover batch is reported as not found', async () => {
    RolloverBatch.findOne.mockReturnValue({ lean: async () => null });

    await expect(RolloverService.getRolloverStudentReport('missing')).rejects.toMatchObject({ statusCode: 404 });
  });

  test('the detailed report merges the archived roster, decisions and live contact details', async () => {
    RolloverBatch.findOne.mockReturnValue({
      lean: async () => ({
        batchId: 'batch-1',
        fromSchoolYear: FROM_SY,
        toSchoolYear: TO_SY,
        semester: '1st',
        mode: 'year',
        status: 'applied',
        executedAt: new Date('2026-06-01T00:00:00.000Z'),
        counts: { total: 2, promoted: 1, retained: 0, graduated: 1, skipped: 0 },
        studentChanges: [
          {
            studentId: 's1',
            studentNumber: '2025-101-00001',
            action: 'promote',
            studentBefore: {
              yearLevel: 1,
              section: 'A',
              semester: '1st',
              lifecycleStatus: 'Enrolled',
              latestGrade: 1.5,
              gradeProfessor: 'prof1',
            },
            studentAfter: {
              yearLevel: 2,
              section: 'B',
              semester: '1st',
              schoolYear: TO_SY,
              lifecycleStatus: 'Enrolled',
            },
            newYearLevel: 2,
            newSectionCode: 'B',
          },
        ],
      }),
    });

    ArchiveSnapshot.findOne.mockImplementation((filter) => ({
      select: () => ({
        lean: async () => filter.type === 'STUDENT_ARCHIVE'
          ? {
              data: {
                students: [
                  {
                    _id: 's1',
                    studentNumber: '2025-101-00001',
                    firstName: 'Ana',
                    middleName: 'B',
                    lastName: 'Cruz',
                    course: 101,
                    yearLevel: 1,
                    section: 'A',
                    semester: '1st',
                    schoolYear: FROM_SY,
                    lifecycleStatus: 'Enrolled',
                    latestGrade: 1.5,
                    email: 'ana@example.com',
                  },
                  {
                    _id: 's2',
                    studentNumber: '2025-101-00002',
                    firstName: 'Ben',
                    middleName: '',
                    lastName: 'Santos',
                    course: 201,
                    yearLevel: 4,
                    section: 'C',
                    semester: '1st',
                    schoolYear: FROM_SY,
                    lifecycleStatus: 'Enrolled',
                    latestGrade: 1.25,
                  },
                ],
              },
            }
          : {
              data: {
                decisions: [
                  { studentId: 's1', action: 'promote' },
                  { studentId: 's2', action: 'graduate' },
                ],
              },
            },
      }),
    }));

    Student.find.mockReturnValue({
      select: () => ({
        lean: async () => [
          {
            _id: 's1',
            contactNumber: '0917-000-0001',
            address: 'Street 1',
            permanentAddress: 'Street 2',
            gender: 'Female',
            birthDate: new Date('2005-01-02T00:00:00.000Z'),
          },
          {
            _id: 's2',
            contactNumber: '0917-000-0002',
            address: 'Street 3',
            gender: 'Male',
            birthDate: new Date('2003-03-04T00:00:00.000Z'),
          },
        ],
      }),
    });

    const report = await RolloverService.getRolloverStudentReport('batch-1');

    expect(report.batchId).toBe('batch-1');
    expect(report.status).toBe('applied');
    expect(report.students).toHaveLength(2);

    expect(report.students[0]).toMatchObject({
      studentId: 's1',
      studentNumber: '2025-101-00001',
      name: 'Ana B Cruz',
      course: 101,
      yearLevel: 1,
      section: 'A',
      semester: '1st',
      schoolYear: FROM_SY,
      action: 'promote',
      newYearLevel: 2,
      newSection: 'B',
      newSemester: '1st',
      newSchoolYear: TO_SY,
      latestGrade: 1.5,
      lifecycleBefore: 'Enrolled',
      lifecycleAfter: 'Enrolled',
      email: 'ana@example.com',
      contactNumber: '0917-000-0001',
      address: 'Street 1',
      gender: 'Female',
    });

    // Graduates have no manifest change; the audit decision supplies the
    // action, while the archived roster supplies the student's identity.
    expect(report.students[1]).toMatchObject({
      studentId: 's2',
      name: 'Ben Santos',
      action: 'graduate',
      course: 201,
      yearLevel: 4,
      section: 'C',
      newYearLevel: null,
      newSection: '',
      newSemester: '',
      newSchoolYear: '',
      contactNumber: '0917-000-0002',
      address: 'Street 3',
      gender: 'Male',
    });
  });
});

describe('school year rollover report with grades', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('one closing school year combines its rollovers and attaches subject grades', async () => {
    const batches = [
      {
        batchId: 'year-batch',
        fromSchoolYear: FROM_SY,
        toSchoolYear: TO_SY,
        semester: '1st',
        mode: 'year',
        status: 'applied',
        executedAt: new Date('2026-07-01T00:00:00.000Z'),
        counts: { total: 1, promoted: 0, retained: 0, graduated: 1, skipped: 0 },
      },
      {
        batchId: 'sem-batch',
        fromSchoolYear: FROM_SY,
        toSchoolYear: FROM_SY,
        semester: '2nd',
        mode: 'semester',
        status: 'applied',
        executedAt: new Date('2026-01-01T00:00:00.000Z'),
        counts: { total: 1, promoted: 1, retained: 0, graduated: 0, skipped: 0 },
      },
    ];

    RolloverBatch.find.mockReturnValue(mockChain(batches));
    RolloverBatch.findOne.mockImplementation(({ batchId }) => ({
      lean: async () => ({
        ...(batchId === 'year-batch' ? batches[0] : batches[1]),
        studentChanges: [
          {
            studentId: 's1',
            studentNumber: '2025-101-00001',
            action: batchId === 'year-batch' ? 'graduate' : 'promote',
            studentBefore: {
              yearLevel: 4,
              section: 'A',
              semester: batchId === 'year-batch' ? '2nd' : '1st',
              lifecycleStatus: 'Enrolled',
              latestGrade: 1.25,
            },
            studentAfter: { yearLevel: 4, section: 'A', semester: '1st', schoolYear: TO_SY },
            newYearLevel: 4,
            newSectionCode: 'A',
          },
        ],
      }),
    }));

    ArchiveSnapshot.findOne.mockImplementation((filter) => ({
      select: () => ({
        lean: async () => filter.type === 'STUDENT_ARCHIVE'
          ? {
              data: {
                students: [
                  {
                    _id: 's1',
                    studentNumber: '2025-101-00001',
                    firstName: 'Ana',
                    middleName: 'B',
                    lastName: 'Cruz',
                    course: 101,
                    yearLevel: 4,
                    section: 'A',
                    semester: '2nd',
                    schoolYear: FROM_SY,
                    lifecycleStatus: 'Enrolled',
                    latestGrade: 1.25,
                    email: 'ana@example.com',
                    gender: 'Female',
                  },
                ],
              },
            }
          : {
              data: {
                decisions: [
                  { studentId: 's1', action: filter.rolloverBatchId === 'year-batch' ? 'graduate' : 'promote' },
                ],
              },
            },
      }),
    }));

    Student.find.mockReturnValue({
      select: () => ({
        lean: async () => [
          {
            _id: 's1',
            contactNumber: '0917-000-0001',
            address: 'Street 1',
            permanentAddress: 'Street 2',
            scholarship: 'N/A',
            birthDate: new Date('2005-01-02T00:00:00.000Z'),
          },
        ],
      }),
    });

    Enrollment.find.mockReturnValue({
      select: () => ({
        lean: async () => [
          {
            studentId: 's1',
            semester: '2nd',
            yearLevel: 4,
            status: 'Graduated',
            subjects: [
              { code: 'MATH401', title: 'Math 4', units: 3, grade: 1.25, status: 'Passed', instructor: 'Prof A' },
            ],
          },
          {
            studentId: 's1',
            semester: '1st',
            yearLevel: 4,
            status: 'Completed',
            subjects: [
              { code: 'ENG401', title: 'English 4', units: 3, grade: 1.5, status: 'Passed', instructor: 'Prof B' },
            ],
          },
        ],
      }),
    });

    const report = await RolloverService.getSchoolYearRolloverReport(FROM_SY);

    expect(report.schoolYear).toBe(FROM_SY);
    expect(report.batches).toHaveLength(2);
    expect(report.students).toHaveLength(1);

    // The newest rollover for the same student wins the identity/action row.
    expect(report.students[0]).toMatchObject({
      studentId: 's1',
      name: 'Ana B Cruz',
      action: 'graduate',
      batchId: 'year-batch',
      rolloverStatus: 'applied',
    });

    // Grades span both semesters of the closing school year.
    expect(report.students[0].grades).toEqual([
      expect.objectContaining({ subjectCode: 'ENG401', grade: 1.5, semester: '1st', instructor: 'Prof B' }),
      expect.objectContaining({ subjectCode: 'MATH401', grade: 1.25, semester: '2nd', instructor: 'Prof A' }),
    ]);
  });

  test('a school year without rollovers is rejected', async () => {
    RolloverBatch.find.mockReturnValue(mockChain([]));

    await expect(RolloverService.getSchoolYearRolloverReport(FROM_SY)).rejects.toMatchObject({
      statusCode: 404,
    });
  });

  test('an invalid school year is rejected', async () => {
    await expect(RolloverService.getSchoolYearRolloverReport('2026')).rejects.toMatchObject({
      statusCode: 400,
    });
  });
});
