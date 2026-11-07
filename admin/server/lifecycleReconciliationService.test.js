/**
 * Reconciliation tests.
 *
 * These drive the REAL preview (dry-run) path against fixtures, so the report an
 * operator sees before executing is produced by the same counting policy as the
 * evaluator. The restore step is spied on so the test can prove which students
 * would be written and which never will be.
 */

let objectIdSequence = 0;

class MockObjectId {
  constructor(value) {
    this.value = value || `00000000000000000000${++objectIdSequence}`.slice(-24);
  }

  toString() {
    return this.value;
  }

  valueOf() {
    return this.value;
  }

  static isValid() {
    return true;
  }
}

jest.mock('mongoose', () => ({ Types: { ObjectId: MockObjectId } }));
jest.mock('./models/Student', () => ({
  find: jest.fn(),
  findById: jest.fn(),
  findOneAndUpdate: jest.fn(),
  findByIdAndUpdate: jest.fn(),
  updateOne: jest.fn(async () => ({ modifiedCount: 1 }))
}));
jest.mock('./models/Enrollment', () => ({ find: jest.fn() }));
jest.mock('./models/AuditLog', () => ({ create: jest.fn(async () => ({})) }));
jest.mock('./models/StudentNotification', () => ({ updateOne: jest.fn(async () => ({})) }));
jest.mock('./models/StudentBlockAssignment', () => ({
  find: jest.fn(),
  updateMany: jest.fn(async () => ({ modifiedCount: 0 })),
  aggregate: jest.fn(async () => [])
}));
jest.mock('./models/SectionWaitlist', () => ({
  find: jest.fn(),
  updateMany: jest.fn(async () => ({ modifiedCount: 0 }))
}));
jest.mock('./models/BlockSection', () => ({ findByIdAndUpdate: jest.fn(async () => ({})) }));
jest.mock('./models/SystemSetting', () => ({ findOne: jest.fn() }));
jest.mock('./services/gradingScaleService', () => ({
  loadGradeScale: jest.fn(async () => ({ passingGrade: 3 }))
}));

const Student = require('./models/Student');
const Enrollment = require('./models/Enrollment');
const AuditLog = require('./models/AuditLog');
const SystemSetting = require('./models/SystemSetting');
const lifecycle = require('./services/studentLifecycleService');
const {
  reconcileAcademicDismissals,
  formatReconciliationReport
} = require('./services/lifecycleReconciliationService');

const chain = (value) => ({
  select: jest.fn().mockReturnThis(),
  sort: jest.fn().mockReturnThis(),
  limit: jest.fn().mockReturnThis(),
  lean: jest.fn(async () => value)
});

function failingEntry(code, subjectId = new MockObjectId()) {
  return {
    _id: new MockObjectId(),
    subjectId,
    code,
    title: code,
    grade: 5,
    gradeMark: null,
    status: 'Completed',
    submissionStatus: 'Published'
  };
}

function passingEntry(code, subjectId = new MockObjectId()) {
  return { ...failingEntry(code, subjectId), _id: new MockObjectId(), grade: 1.75 };
}

function term(subjects, overrides = {}) {
  return {
    _id: new MockObjectId(),
    schoolYear: '2025-2026',
    semester: '1st',
    status: 'Enrolled',
    gradeSubmission: { status: 'Published' },
    subjects,
    ...overrides
  };
}

function dismissedStudent(overrides = {}) {
  const dismissalEventId = new MockObjectId();
  return {
    _id: new MockObjectId(),
    studentNumber: '2025-0101',
    firstName: 'Ada',
    lastName: 'Lovelace',
    schoolYear: '2025-2026',
    semester: '2nd',
    lifecycleStatus: 'Dropped',
    lifecycleStatusReason: 'ACADEMIC_DEFICIENCY',
    lifecycleStatusEventId: dismissalEventId,
    lifecycleStatusHistory: [
      { eventId: new MockObjectId(), status: 'Enrolled', reason: 'ENROLLMENT', decision: 'ENROLLED' },
      {
        eventId: dismissalEventId,
        status: 'Dropped',
        reason: 'ACADEMIC_DEFICIENCY',
        decision: 'AUTOMATIC_DISMISSAL',
        effectiveDate: new Date('2026-01-10')
      }
    ],
    academicStanding: 'DISMISSED',
    academicStandingUpdatedAt: new Date('2026-01-10'),
    isActive: true,
    ...overrides
  };
}

/** Three historical failures with the given number of passed retakes. */
function threeFailuresWithRetakes(passedCount) {
  const subjects = ['PROG1', 'MATH101', 'ENG101'].map((code) => ({ code, id: new MockObjectId() }));
  const firstTerm = term(subjects.map((subject) => failingEntry(subject.code, subject.id)));
  if (passedCount === 0) return [firstTerm];

  return [
    firstTerm,
    term(
      subjects.slice(0, passedCount).map((subject) => passingEntry(subject.code, subject.id)),
      { schoolYear: '2026-2027', semester: '1st' }
    )
  ];
}

let candidates = [];
let studentsById = new Map();
let enrollments = [];

beforeEach(() => {
  jest.restoreAllMocks();
  jest.clearAllMocks();
  candidates = [];
  studentsById = new Map();
  enrollments = [];

  Student.find.mockImplementation(() => chain(candidates));
  Student.findById.mockImplementation(async (id) => studentsById.get(String(id)) || null);
  Student.findOneAndUpdate.mockResolvedValue(null);
  Student.updateOne.mockResolvedValue({ modifiedCount: 1 });
  Enrollment.find.mockImplementation(() => chain(enrollments));
  AuditLog.create.mockResolvedValue({});
  SystemSetting.findOne.mockReturnValue(chain(null));
});

function registerCandidate(doc) {
  candidates.push(doc);
  studentsById.set(String(doc._id), doc);
  return doc;
}

describe('reconcileAcademicDismissals – dry run', () => {
  test('reports a misclassified dismissal as would_restore and writes nothing', async () => {
    registerCandidate(dismissedStudent());
    enrollments = threeFailuresWithRetakes(1);

    const report = await reconcileAcademicDismissals();

    expect(report.dryRun).toBe(true);
    expect(report.inspected).toBe(1);
    expect(report.eligibleForRestoration).toBe(1);
    expect(report.restored).toBe(0);
    expect(report.rows[0]).toMatchObject({
      studentNumber: '2025-0101',
      outcome: 'would_restore',
      unresolvedFailureCount: 2,
      threshold: 3,
      currentAcademicStanding: 'DISMISSED'
    });
    expect(report.rows[0].unresolvedFailedSubjects.sort()).toEqual(['ENG101', 'MATH101']);

    // Nothing was written: no lifecycle update, no roster change, no audit.
    expect(Student.findOneAndUpdate).not.toHaveBeenCalled();
    expect(AuditLog.create).not.toHaveBeenCalled();
  });

  test('keeps a student who still meets the dismissal threshold', async () => {
    registerCandidate(dismissedStudent());
    enrollments = threeFailuresWithRetakes(0);

    const report = await reconcileAcademicDismissals();

    expect(report.eligibleForRestoration).toBe(0);
    expect(report.unchanged).toBe(1);
    expect(report.rows[0]).toMatchObject({
      outcome: 'keeps_dismissal',
      unresolvedFailureCount: 3,
      reason: 'dismissal_threshold_still_met'
    });
    expect(Student.findOneAndUpdate).not.toHaveBeenCalled();
  });

  test('never proposes restoring a dismissal that is not system-generated', async () => {
    const manualEventId = new MockObjectId();
    registerCandidate(dismissedStudent({
      lifecycleStatusEventId: manualEventId,
      lifecycleStatusHistory: [{
        eventId: manualEventId,
        status: 'Dropped',
        reason: 'MANUAL_DISMISSAL',
        decision: 'MANUAL_DISMISSAL',
        effectiveDate: new Date('2026-01-10')
      }]
    }));
    enrollments = threeFailuresWithRetakes(2);

    const report = await reconcileAcademicDismissals();

    expect(report.eligibleForRestoration).toBe(0);
    expect(report.rows[0]).toMatchObject({
      outcome: 'keeps_dismissal',
      automaticDismissal: false,
      reason: 'dismissal_not_system_generated'
    });
  });

  test('honours an operational policy that disables automatic recovery', async () => {
    SystemSetting.findOne.mockReturnValue(chain({
      key: 'academicDismissalPolicy',
      value: { allowAutomaticRecovery: false }
    }));
    registerCandidate(dismissedStudent());
    enrollments = threeFailuresWithRetakes(1);

    const report = await reconcileAcademicDismissals();

    expect(report.eligibleForRestoration).toBe(0);
    expect(report.rows[0].reason).toBe('automatic_recovery_disabled_by_policy');
    expect(report.policy.allowAutomaticRecovery).toBe(false);
  });

  test('formats a human-readable dry-run report', async () => {
    registerCandidate(dismissedStudent());
    enrollments = threeFailuresWithRetakes(1);

    const report = await reconcileAcademicDismissals();
    const text = formatReconciliationReport(report);

    expect(text).toContain('DRY RUN (no writes)');
    expect(text).toContain('2025-0101');
    expect(text).toContain('would_restore');
    expect(text).toContain('2 unresolved failed subject(s) (threshold 3)');
    expect(text).toContain('--execute');
  });
});

describe('reconcileAcademicDismissals – execute', () => {
  const ACTOR = new MockObjectId();

  test('restores only the eligible students through the centralized evaluator', async () => {
    registerCandidate(dismissedStudent());
    const stillFailing = registerCandidate(dismissedStudent({
      _id: new MockObjectId(),
      studentNumber: '2025-0102'
    }));

    // The first student is below the threshold; the second is not. The preview
    // re-reads each student, so route enrollments by student.
    const eligibleId = candidates[0]._id;
    Enrollment.find.mockImplementation((filter) => {
      if (String(filter.studentId) === String(eligibleId)) {
        return chain(threeFailuresWithRetakes(1));
      }
      return chain(threeFailuresWithRetakes(0));
    });

    const evaluateSpy = jest
      .spyOn(lifecycle, 'evaluateStudentAcademicStanding')
      .mockResolvedValue({
        changed: true,
        restored: true,
        lifecycleStatus: 'Enrolled',
        academicStanding: 'ACADEMIC_PROBATION',
        rosterRestored: true,
        auditLogged: true,
        eventId: 'restoration-event'
      });

    const report = await reconcileAcademicDismissals({
      dryRun: false,
      actorId: ACTOR,
      effectiveDate: new Date('2026-03-01')
    });

    expect(report.dryRun).toBe(false);
    expect(report.inspected).toBe(2);
    expect(report.eligibleForRestoration).toBe(1);
    expect(report.restored).toBe(1);
    expect(evaluateSpy).toHaveBeenCalledTimes(1);
    expect(evaluateSpy).toHaveBeenCalledWith(expect.objectContaining({
      studentId: eligibleId,
      actorId: ACTOR,
      accountType: 'admin',
      source: 'lifecycle_reconciliation',
      effectiveDate: new Date('2026-03-01')
    }));
    expect(report.rows.find((row) => row.studentNumber === '2025-0101')).toMatchObject({
      outcome: 'restored',
      restoredLifecycleStatus: 'Enrolled'
    });
    expect(report.rows.find((row) => row.studentNumber === '2025-0102')).toMatchObject({
      outcome: 'keeps_dismissal'
    });
    // The ineligible student is never handed to the evaluator.
    expect(evaluateSpy).not.toHaveBeenCalledWith(expect.objectContaining({
      studentId: stillFailing._id
    }));

    // One run-summary audit entry, on top of the per-student audit logs.
    expect(AuditLog.create).toHaveBeenCalledWith(expect.objectContaining({
      action: 'RESTORE',
      resourceType: 'SYSTEM',
      resourceId: 'student-lifecycle-reconciliation',
      status: 'SUCCESS',
      severity: 'CRITICAL'
    }));
    expect(report.auditLogged).toBe(true);
  });

  test('a second run does not restore the same student twice', async () => {
    const doc = registerCandidate(dismissedStudent());
    enrollments = threeFailuresWithRetakes(1);

    const evaluateSpy = jest
      .spyOn(lifecycle, 'evaluateStudentAcademicStanding')
      .mockImplementation(async () => {
        // Model the real write: the student is no longer Dropped afterwards.
        studentsById.set(String(doc._id), {
          ...doc,
          lifecycleStatus: 'Enrolled',
          lifecycleStatusReason: 'ACADEMIC_DEFICIENCY_RESTORED',
          academicStanding: 'ACADEMIC_PROBATION',
          academicStandingUpdatedAt: new Date('2026-03-01')
        });
        return {
          changed: true,
          restored: true,
          lifecycleStatus: 'Enrolled',
          academicStanding: 'ACADEMIC_PROBATION',
          rosterRestored: true,
          auditLogged: true,
          eventId: 'restoration-event'
        };
      });

    const first = await reconcileAcademicDismissals({ dryRun: false, actorId: ACTOR, effectiveDate: new Date('2026-03-01') });
    const second = await reconcileAcademicDismissals({ dryRun: false, actorId: ACTOR, effectiveDate: new Date('2026-03-02') });

    expect(first.restored).toBe(1);
    expect(second.restored).toBe(0);
    expect(second.eligibleForRestoration).toBe(0);
    expect(evaluateSpy).toHaveBeenCalledTimes(1);
    // The restored student is reported, not silently dropped from the run.
    expect(second.rows[0]).toMatchObject({
      studentNumber: '2025-0101',
      lifecycleStatus: 'Enrolled'
    });
  });

  test('reports a student whose dismissal state changed concurrently instead of restoring', async () => {
    registerCandidate(dismissedStudent());
    enrollments = threeFailuresWithRetakes(1);

    jest.spyOn(lifecycle, 'evaluateStudentAcademicStanding').mockResolvedValue({
      changed: false,
      restored: false,
      reason: 'dismissal_state_changed_concurrently'
    });

    const report = await reconcileAcademicDismissals({ dryRun: false, actorId: ACTOR });

    expect(report.restored).toBe(0);
    expect(report.notRestored).toBe(1);
    expect(report.rows[0]).toMatchObject({
      outcome: 'not_restored',
      reason: 'dismissal_state_changed_concurrently'
    });
  });

  test('records no run audit when the operator did not supply an actor', async () => {
    registerCandidate(dismissedStudent());
    enrollments = threeFailuresWithRetakes(1);
    jest.spyOn(lifecycle, 'evaluateStudentAcademicStanding').mockResolvedValue({
      changed: true,
      restored: true,
      lifecycleStatus: 'Enrolled',
      academicStanding: 'ACADEMIC_PROBATION'
    });

    const report = await reconcileAcademicDismissals({ dryRun: false });

    expect(report.restored).toBe(1);
    expect(report.auditLogged).toBe(false);
    expect(AuditLog.create).not.toHaveBeenCalled();
  });
});
