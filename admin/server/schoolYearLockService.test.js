/**
 * Tests for the School Year Lock → Validate → Confirm Rollover state machine
 * (server/services/schoolYearLockService.js).
 *
 * Covers the workflow's safety rules:
 *   - an authorized registrar can lock an open school year; a non-open year
 *     cannot be locked again;
 *   - locking never triggers a rollover (separate operations);
 *   - unlocking requires a reason, never triggers a rollover, marks previous
 *     validation runs stale, and cannot reverse a completed rollover;
 *   - rollover execution requires locked + passed + non-stale validation,
 *     every warning authorized, and the exact validated target context;
 *   - concurrent executions and retries cannot duplicate results;
 *   - failures land in the recovery-required state; retries reconcile an
 *     already-applied batch instead of re-running it;
 *   - every transition is audited; ordinary unlock can never reverse a
 *     completed rollover.
 *
 * Models are mocked (no real data). The mocked findOne/findById calls must
 * return .lean()-chainable results because the service reads them that way.
 */

jest.mock('./models/SchoolYearState', () => ({
  findOne: jest.fn(),
  findOneAndUpdate: jest.fn(),
  updateMany: jest.fn(),
}));
jest.mock('./models/RolloverValidationRun', () => ({
  create: jest.fn(),
  findById: jest.fn(),
  find: jest.fn(),
  updateMany: jest.fn(),
  updateOne: jest.fn(),
}));
jest.mock('./models/RolloverBatch', () => ({
  findOne: jest.fn(),
}));
jest.mock('./models/AuditLog', () => ({
  create: jest.fn(),
}));
jest.mock('./services/preRolloverValidationService', () => ({
  runChecks: jest.fn(),
  assertExecutionTimeGates: jest.fn(),
}));

const SchoolYearState = require('./models/SchoolYearState');
const RolloverValidationRun = require('./models/RolloverValidationRun');
const RolloverBatch = require('./models/RolloverBatch');
const AuditLog = require('./models/AuditLog');
const ValidationChecks = require('./services/preRolloverValidationService');

const LockService = require('./services/schoolYearLockService');

const SY = '2025-2026';
const TO_SY = '2026-2027';

const auditEntries = () => AuditLog.create.mock.calls.flat(2);

/** A mocked query whose .lean() (and any .select()/.sort() before it) resolves value. */
const dbResult = (value) => ({
  lean: async () => value,
  select: () => dbResult(value),
  sort: () => dbResult(value),
});

const makeState = (status, extra = {}) => ({
  schoolYear: SY,
  status,
  lockedAt: status === 'open' ? null : new Date('2026-01-15'),
  lockReason: status === 'open' ? null : 'Preparing rollover',
  activeValidationRunId: extra.activeValidationRunId ?? null,
  validationSummary: extra.validationSummary ?? null,
  rolloverToSchoolYear: extra.rolloverToSchoolYear ?? null,
  rolloverSemester: extra.rolloverSemester ?? null,
  rolloverBatchId: extra.rolloverBatchId ?? null,
  rolloverError: extra.rolloverError ?? null,
});

const makeRun = (extra = {}) => ({
  _id: 'run_1',
  schoolYear: SY,
  toSchoolYear: TO_SY,
  semester: '1st',
  status: 'warnings',
  staleAt: null,
  runAt: new Date('2026-02-01'),
  summary: { blockingErrors: 0, warnings: 1, passedChecks: 6 },
  results: [
    { key: 'missing_grades', title: 'Students without a recorded grade', status: 'warning', count: 2, message: '2 records', actionable: 'Review them', details: [] },
  ],
  ...extra,
});

const cleanRun = () => makeRun({
  status: 'passed',
  summary: { blockingErrors: 0, warnings: 0, passedChecks: 7 },
  results: [],
});

beforeEach(() => {
  jest.resetAllMocks();
  // Defaults; individual tests override what they need.
  AuditLog.create.mockResolvedValue([{}]);
  SchoolYearState.updateMany.mockResolvedValue({ modifiedCount: 0 });
  RolloverValidationRun.updateMany.mockResolvedValue({ modifiedCount: 0 });
  RolloverValidationRun.updateOne.mockResolvedValue({});
  // Default transition outcome: the state machine reports rolled_over.
  SchoolYearState.findOneAndUpdate.mockResolvedValue(makeState('rolled_over'));
});

describe('lockSchoolYear', () => {
  test('an open school year is locked and the lock is audited (no rollover triggered)', async () => {
    SchoolYearState.findOne.mockReturnValue(dbResult(null));
    SchoolYearState.findOneAndUpdate.mockResolvedValue(makeState('locked'));

    const state = await LockService.lockSchoolYear({
      schoolYear: SY,
      actorId: 'registrar1',
      actorRole: 'registrar',
      reason: 'Closed 2nd semester',
    });

    expect(state.status).toBe('locked');
    // The transition atomically matches only an OPEN year.
    const filter = SchoolYearState.findOneAndUpdate.mock.calls[0][0];
    expect(filter).toEqual({
      schoolYear: SY,
      status: { $in: ['', null, 'open'] },
    });
    const update = SchoolYearState.findOneAndUpdate.mock.calls[0][1];
    expect(update.$set.status).toBe('locked');
    expect(update.$set.lockedBy).toBe('registrar1');
    // A lock must never start a rollover — no rollover fields are written.
    expect(update.$set.rolloverBatchId).toBeUndefined();
    expect(update.$set.rolloverStartedAt).toBeUndefined();
    expect(update.$unset).toBeUndefined();

    const audit = auditEntries();
    expect(audit.length).toBe(1);
    expect(audit[0].description).toMatch(/locked/i);
    expect(audit[0].description).toContain('Closed 2nd semester');
    expect(audit[0].performedBy).toBe('registrar1');
    expect(audit[0].performedByRole).toBe('registrar');
  });

  test('locking an already locked (or otherwise non-open) year is rejected', async () => {
    SchoolYearState.findOne.mockReturnValue(dbResult(makeState('locked')));
    SchoolYearState.findOneAndUpdate.mockResolvedValue(null);

    await expect(
      LockService.lockSchoolYear({ schoolYear: SY, actorId: 'r1', actorRole: 'registrar' })
    ).rejects.toMatchObject({ statusCode: 409, reasonCode: 'INVALID_STATE' });
    expect(auditEntries().length).toBe(0);
  });

  test('an invalid school year format and an unauthenticated actor are rejected', async () => {
    await expect(
      LockService.lockSchoolYear({ schoolYear: '2025/2026', actorId: 'r1', actorRole: 'registrar' })
    ).rejects.toMatchObject({ statusCode: 400 });

    await expect(
      LockService.lockSchoolYear({ schoolYear: SY, actorId: null, actorRole: 'registrar' })
    ).rejects.toMatchObject({ statusCode: 400 });
  });
});

describe('unlockSchoolYear', () => {
  test('unlocking requires a reason and returns the year to open, audited', async () => {
    SchoolYearState.findOne.mockReturnValue(dbResult(makeState('locked')));

    await expect(
      LockService.unlockSchoolYear({ schoolYear: SY, actorId: 'r1', actorRole: 'registrar', reason: 'x' })
    ).rejects.toMatchObject({ statusCode: 400 });

    SchoolYearState.findOneAndUpdate.mockResolvedValue(makeState('open'));
    const state = await LockService.unlockSchoolYear({
      schoolYear: SY,
      actorId: 'r1',
      actorRole: 'registrar',
      reason: 'Correcting a trailing grade',
    });
    expect(state.status).toBe('open');

    const descriptions = auditEntries().map((entry) => entry.description);
    expect(descriptions.some((text) => text.includes('Correcting a trailing grade'))).toBe(true);
  });

  test('unlocking never triggers a rollover and marks previous validation runs stale', async () => {
    // Ready state with a backing validation run → stale marking is required.
    SchoolYearState.findOne.mockReturnValue(dbResult(makeState('rollover_ready', { activeValidationRunId: 'run_1' })));
    SchoolYearState.findOneAndUpdate.mockResolvedValue(makeState('open'));

    await LockService.unlockSchoolYear({
      schoolYear: SY,
      actorId: 'r1',
      actorRole: 'registrar',
      reason: 'Fix records',
    });

    expect(RolloverValidationRun.updateMany).toHaveBeenCalledWith(
      { schoolYear: SY, status: { $in: ['passed', 'warnings'] } },
      expect.objectContaining({
        $set: expect.objectContaining({ status: 'stale' }),
      })
    );
  });

  test('unlocking a rolled-over year is refused (completed rollovers are not casually reversed)', async () => {
    SchoolYearState.findOne.mockReturnValue(dbResult(makeState('rolled_over', { rolloverBatchId: 'batch_1' })));

    await expect(
      LockService.unlockSchoolYear({ schoolYear: SY, actorId: 'r1', actorRole: 'registrar', reason: 'Fix records' })
    ).rejects.toMatchObject({ statusCode: 409, reasonCode: 'ROLL_OVER_COMPLETE' });
  });

  test('unlocking a year with a rollover in progress is refused', async () => {
    SchoolYearState.findOne.mockReturnValue(dbResult(makeState('rollover_in_progress')));

    await expect(
      LockService.unlockSchoolYear({ schoolYear: SY, actorId: 'r1', actorRole: 'registrar', reason: 'Fix records' })
    ).rejects.toMatchObject({ statusCode: 409, reasonCode: 'ROLL_OVER_IN_PROGRESS' });
  });

  test('a failed-rollover year can only be unlocked by an administrator', async () => {
    SchoolYearState.findOne.mockReturnValue(dbResult(makeState('rollover_failed')));

    await expect(
      LockService.unlockSchoolYear({ schoolYear: SY, actorId: 'r1', actorRole: 'registrar', reason: 'Fix records' })
    ).rejects.toMatchObject({ statusCode: 403, reasonCode: 'FORBIDDEN' });

    SchoolYearState.findOneAndUpdate.mockResolvedValue(makeState('open'));
    const state = await LockService.unlockSchoolYear({
      schoolYear: SY,
      actorId: 'a1',
      actorRole: 'admin',
      reason: 'Authorized corrections after failure',
    });
    expect(state.status).toBe('open');
  });
});

describe('runPreRolloverValidation', () => {
  test('validation requires a locked year', async () => {
    SchoolYearState.findOne.mockReturnValue(dbResult(null)); // open

    await expect(
      LockService.runPreRolloverValidation({
        schoolYear: SY,
        toSchoolYear: TO_SY,
        semester: '1st',
        actorId: 'r1',
        actorRole: 'registrar',
      })
    ).rejects.toMatchObject({ statusCode: 409, reasonCode: 'INVALID_STATE' });
  });

  test('blocking errors keep the year locked and the run is retained', async () => {
    SchoolYearState.findOne.mockReturnValue(dbResult(makeState('locked')));
    ValidationChecks.runChecks.mockResolvedValue({
      status: 'failed',
      summary: { blockingErrors: 2, warnings: 0, passedChecks: 5 },
      results: [
        { key: 'grade_workflow_open', title: 'Grade submissions awaiting approval', status: 'blocking', count: 1, message: 'x', actionable: 'Approve them', details: [] },
      ],
    });
    RolloverValidationRun.create.mockResolvedValue([makeRun({ status: 'failed' })]);
    SchoolYearState.findOneAndUpdate.mockResolvedValue(makeState('locked'));

    const outcome = await LockService.runPreRolloverValidation({
      schoolYear: SY,
      toSchoolYear: TO_SY,
      semester: '1st',
      actorId: 'r1',
      actorRole: 'registrar',
    });

    expect(outcome.run.status).toBe('failed');
    // The run is persisted as history (create was called, not delete/update).
    expect(RolloverValidationRun.create).toHaveBeenCalledTimes(1);
    // The state stays locked (NOT ready) when blocking errors exist.
    const lastUpdate = SchoolYearState.findOneAndUpdate.mock.calls.at(-1)[1];
    expect(lastUpdate.$set.status).toBe('locked');
  });

  test('a validation without blocking errors moves the year to rollover_ready', async () => {
    SchoolYearState.findOne.mockReturnValue(dbResult(makeState('locked')));
    ValidationChecks.runChecks.mockResolvedValue(makeRun());
    RolloverValidationRun.create.mockResolvedValue([makeRun()]);
    SchoolYearState.findOneAndUpdate.mockResolvedValue(makeState('rollover_ready', { activeValidationRunId: 'run_1' }));

    const outcome = await LockService.runPreRolloverValidation({
      schoolYear: SY,
      toSchoolYear: TO_SY,
      semester: '1st',
      actorId: 'r1',
      actorRole: 'registrar',
    });

    expect(outcome.run.status).toBe('warnings');
    expect(outcome.state.status).toBe('rollover_ready');
    expect(outcome.state.canProceedToRollover).toBe(true);
  });

  test('invalid targets / semesters are rejected before any check runs', async () => {
    await expect(
      LockService.runPreRolloverValidation({ schoolYear: SY, toSchoolYear: '2026/2027', semester: '1st', actorId: 'r1', actorRole: 'registrar' })
    ).rejects.toMatchObject({ statusCode: 400 });
    await expect(
      LockService.runPreRolloverValidation({ schoolYear: SY, toSchoolYear: TO_SY, semester: 'Xst', actorId: 'r1', actorRole: 'registrar' })
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(ValidationChecks.runChecks).not.toHaveBeenCalled();
  });
});

describe('executeWithSafeguards', () => {
  const params = { fromSchoolYear: SY, toSchoolYear: TO_SY, semester: '1st', adminId: 'r1', adminRole: 'registrar' };
  const executor = () => jest.fn(async () => ({ rolloverBatchId: 'batch_9', counts: { promoted: 3 } }));

  beforeEach(() => {
    ValidationChecks.assertExecutionTimeGates.mockResolvedValue(undefined);
  });

  test('rollover cannot execute while the source year is unlocked (open)', async () => {
    SchoolYearState.findOne.mockReturnValue(dbResult(null));

    await expect(LockService.executeWithSafeguards(params, executor())).rejects.toMatchObject({
      statusCode: 409,
      reasonCode: 'INVALID_STATE',
    });
    expect(ValidationChecks.assertExecutionTimeGates).not.toHaveBeenCalled();
  });

  test('a locked year without validated readiness is rejected', async () => {
    SchoolYearState.findOne.mockReturnValue(dbResult(makeState('locked')));

    await expect(LockService.executeWithSafeguards(params, executor())).rejects.toMatchObject({
      statusCode: 409,
      reasonCode: 'VALIDATION_REQUIRED',
    });
  });

  test('rollover cannot execute for a failed year — recovery is required first', async () => {
    SchoolYearState.findOne.mockReturnValue(dbResult(makeState('rollover_failed', { rolloverError: { message: 'boom' } })));

    await expect(LockService.executeWithSafeguards(params, executor())).rejects.toMatchObject({
      statusCode: 409,
      reasonCode: 'RECOVERY_REQUIRED',
    });
  });

  test('already rolled-over years cannot run the rollover again', async () => {
    SchoolYearState.findOne.mockReturnValue(dbResult(makeState('rolled_over', { rolloverBatchId: 'batch_5' })));

    await expect(LockService.executeWithSafeguards(params, executor())).rejects.toMatchObject({
      statusCode: 409,
      reasonCode: 'ROLL_OVER_COMPLETE',
    });
  });

  test('rollover requires a non-stale backing validation run', async () => {
    SchoolYearState.findOne.mockReturnValue(dbResult(makeState('rollover_ready', { activeValidationRunId: 'run_1' })));
    RolloverValidationRun.findById.mockReturnValue(dbResult(makeRun({ staleAt: new Date() })));

    await expect(LockService.executeWithSafeguards(params, executor())).rejects.toMatchObject({
      statusCode: 409,
      reasonCode: 'VALIDATION_STALE',
    });
  });

  test('the validated target context must match the requested rollover', async () => {
    SchoolYearState.findOne.mockReturnValue(dbResult(makeState('rollover_ready', { activeValidationRunId: 'run_1' })));
    RolloverValidationRun.findById.mockReturnValue(dbResult(makeRun({ toSchoolYear: '2099-2100' })));

    await expect(LockService.executeWithSafeguards(params, executor())).rejects.toMatchObject({
      statusCode: 409,
      reasonCode: 'VALIDATION_TARGET_MISMATCH',
    });
  });

  test('every warning must be acknowledged with a justification before execution', async () => {
    SchoolYearState.findOne.mockReturnValue(dbResult(makeState('rollover_ready', { activeValidationRunId: 'run_1' })));
    RolloverValidationRun.findById.mockReturnValue(dbResult(makeRun()));

    await expect(LockService.executeWithSafeguards(params, executor())).rejects.toMatchObject({
      statusCode: 409,
      reasonCode: 'WARNINGS_UNACKNOWLEDGED',
    });
    // No execution, no state change.
    expect(SchoolYearState.findOneAndUpdate).not.toHaveBeenCalled();

    // With the acknowledgement recorded the rollover runs and completes.
    RolloverValidationRun.findById.mockReturnValue(dbResult(makeRun()));
    SchoolYearState.findOneAndUpdate
      .mockResolvedValueOnce(makeState('rollover_in_progress'))
      .mockResolvedValueOnce(makeState('rolled_over', { rolloverBatchId: 'batch_9' }));

    const result = await LockService.executeWithSafeguards(
      {
        ...params,
        acknowledgedWarnings: [
          { key: 'missing_grades', justification: 'Two withdrawn students were authorized to skip the year by policy.' },
        ],
      },
      executor()
    );
    expect(result.rolloverBatchId).toBe('batch_9');
    expect(RolloverValidationRun.updateOne).toHaveBeenCalledWith({ _id: 'run_1' }, expect.anything());
    // The completion transition goes through rollover_in_progress → rolled_over.
    const transitions = SchoolYearState.findOneAndUpdate.mock.calls;
    expect(transitions.some(([, update]) => update.$set.status === 'rollover_in_progress')).toBe(true);
    expect(transitions.some(([, update]) => update.$set.status === 'rolled_over')).toBe(true);
  });

  test('server-side rechecks run immediately before execution', async () => {
    SchoolYearState.findOne.mockReturnValue(dbResult(makeState('rollover_ready', { activeValidationRunId: 'run_1' })));
    RolloverValidationRun.findById.mockReturnValue(dbResult(cleanRun()));
    ValidationChecks.assertExecutionTimeGates.mockRejectedValue(
      Object.assign(new Error('No longer valid'), { statusCode: 409, reasonCode: 'ROLL_OVER_DUPLICATE' })
    );

    await expect(LockService.executeWithSafeguards(params, executor())).rejects.toMatchObject({
      statusCode: 409,
      reasonCode: 'ROLL_OVER_DUPLICATE',
    });
    expect(SchoolYearState.findOneAndUpdate).not.toHaveBeenCalled();
  });

  test('executor failure marks the year rollover_failed with the error preserved', async () => {
    SchoolYearState.findOne.mockReturnValue(dbResult(makeState('rollover_ready', { activeValidationRunId: 'run_1' })));
    RolloverValidationRun.findById.mockReturnValue(dbResult(cleanRun()));
    SchoolYearState.findOneAndUpdate
      .mockResolvedValueOnce(makeState('rollover_in_progress'))
      .mockResolvedValueOnce(makeState('rollover_failed', { rolloverError: { message: 'duplicate enrollment detected', stage: 'execution' } }));

    await expect(
      LockService.executeWithSafeguards(params, jest.fn(async () => { throw new Error('duplicate enrollment detected'); }))
    ).rejects.toThrow('duplicate enrollment detected');

    const failCall = SchoolYearState.findOneAndUpdate.mock.calls.find(
      ([filter]) => filter.status === 'rollover_in_progress'
    );
    expect(failCall).toBeTruthy();
    expect(failCall[1].$set.status).toBe('rollover_failed');
    expect(failCall[1].$set.rolloverError.message).toBe('duplicate enrollment detected');
    // The failure is audited as FAILED.
    expect(auditEntries().some((entry) => entry.status === 'FAILED')).toBe(true);
  });

  test('a concurrent second execution loses the atomic transition and is rejected', async () => {
    SchoolYearState.findOne.mockReturnValue(dbResult(makeState('rollover_ready', { activeValidationRunId: 'run_1' })));
    RolloverValidationRun.findById.mockReturnValue(dbResult(cleanRun()));
    // First caller wins the ready→in-progress transition; the second loses.
    SchoolYearState.findOneAndUpdate
      .mockImplementationOnce(async () => makeState('rollover_in_progress'))
      .mockImplementationOnce(async () => null);

    const results = await Promise.allSettled([
      LockService.executeWithSafeguards(params, executor()),
      LockService.executeWithSafeguards(params, executor()),
    ]);
    expect(results).toHaveLength(2);
    expect(results.some((result) => result.status === 'fulfilled')).toBe(true);
    expect(results.some((result) => result.status === 'rejected' && result.reason?.statusCode === 409 && result.reason?.reasonCode === 'CONCURRENT')).toBe(true);
    // Only one execution actually started.
    const startTransitions = SchoolYearState.findOneAndUpdate.mock.calls.filter(([filter]) => filter.status === 'rollover_ready');
    expect(startTransitions).toHaveLength(2);
  });
});

describe('retryRollover (recovery)', () => {
  test('a failed rollover can be retried only when no batch was applied (idempotency)', async () => {
    SchoolYearState.findOne.mockReturnValue(dbResult(makeState('rollover_failed', { rolloverToSchoolYear: TO_SY, rolloverSemester: '1st' })));
    RolloverBatch.findOne.mockReturnValue(dbResult(null));
    SchoolYearState.findOneAndUpdate.mockResolvedValue(makeState('rollover_ready'));

    const state = await LockService.retryRollover({
      schoolYear: SY,
      actorId: 'r1',
      actorRole: 'registrar',
      toSchoolYear: TO_SY,
      semester: '1st',
    });
    expect(state.status).toBe('rollover_ready');
    expect(state.rolloverError).toBeNull();
  });

  test('a retry reconciles to rolled_over when the batch was actually applied (no duplicates)', async () => {
    SchoolYearState.findOne.mockReturnValue(dbResult(makeState('rollover_failed', { rolloverToSchoolYear: TO_SY, rolloverSemester: '1st' })));
    RolloverBatch.findOne.mockReturnValue(dbResult({ batchId: 'batch_7' }));

    await expect(
      LockService.retryRollover({ schoolYear: SY, actorId: 'r1', actorRole: 'registrar', toSchoolYear: TO_SY, semester: '1st' })
    ).rejects.toMatchObject({ statusCode: 409, reasonCode: 'ROLL_OVER_DUPLICATE' });

    // Reconciled to rolled_over instead of re-running the rollover.
    const reconcileCall = SchoolYearState.findOneAndUpdate.mock.calls.find(
      ([filter]) => filter.status === 'rollover_in_progress'
    );
    expect(reconcileCall).toBeTruthy();
    expect(reconcileCall[1].$set.status).toBe('rolled_over');
    expect(reconcileCall[1].$set.rolloverBatchId).toBe('batch_7');
  });

  test('a non-failed year cannot be retried through the recovery path', async () => {
    SchoolYearState.findOne.mockReturnValue(dbResult(makeState('rollover_ready')));

    await expect(
      LockService.retryRollover({ schoolYear: SY, actorId: 'r1', actorRole: 'registrar', toSchoolYear: TO_SY, semester: '1st' })
    ).rejects.toMatchObject({ statusCode: 409, reasonCode: 'INVALID_STATE' });
  });
});

describe('assertSchoolYearWritable (backend mutation enforcement)', () => {
  test('an open year is writable', async () => {
    SchoolYearState.findOne.mockReturnValue(dbResult(null));
    await expect(LockService.assertSchoolYearWritable(SY, 'student edit')).resolves.toBeUndefined();
  });

  test('a locked year rejects mutations with a correction hint', async () => {
    SchoolYearState.findOne.mockReturnValue(dbResult(makeState('locked')));

    await expect(LockService.assertSchoolYearWritable(SY, 'student edit')).rejects.toMatchObject({
      statusCode: 409,
      reasonCode: 'SCHOOL_YEAR_LOCKED',
    });
  });

  test('a rollover-ready year rejects mutations', async () => {
    SchoolYearState.findOne.mockReturnValue(dbResult(makeState('rollover_ready')));

    await expect(LockService.assertSchoolYearWritable(SY)).rejects.toMatchObject({ statusCode: 409 });
  });

  test('a rolled-over year rejects mutations with a recovery hint', async () => {
    SchoolYearState.findOne.mockReturnValue(dbResult(makeState('rolled_over', { rolloverBatchId: 'batch_5' })));

    await expect(LockService.assertSchoolYearWritable(SY, 'grade edit')).rejects.toMatchObject({
      statusCode: 409,
      reasonCode: 'SCHOOL_YEAR_ROLLED_OVER',
    });
  });

  test('in-progress rollovers reject mutations', async () => {
    SchoolYearState.findOne.mockReturnValue(dbResult(makeState('rollover_in_progress')));

    await expect(LockService.assertSchoolYearWritable(SY)).rejects.toMatchObject({
      statusCode: 409,
      reasonCode: 'ROLL_OVER_IN_PROGRESS',
    });
  });

  test('unvalidated school years remain writable (outside the lock system)', async () => {
    await expect(LockService.assertSchoolYearWritable('weird')).resolves.toBeUndefined();
    expect(SchoolYearState.findOne).not.toHaveBeenCalled();
  });
});

describe('reconcileInProgressRollover (admin recovery)', () => {
  test('non-admins cannot reconcile a stuck rollover', async () => {
    await expect(
      LockService.reconcileInProgressRollover({ schoolYear: SY, actorId: 'r1', actorRole: 'registrar' })
    ).rejects.toMatchObject({ statusCode: 403, reasonCode: 'FORBIDDEN' });
  });

  test('an admin reconciles: applied batch → completed; none → recovery-required', async () => {
    SchoolYearState.findOne
      .mockReturnValueOnce(dbResult(makeState('rollover_in_progress', { rolloverToSchoolYear: TO_SY, rolloverSemester: '1st' })))
      .mockReturnValueOnce(dbResult(makeState('rolled_over')));
    RolloverBatch.findOne.mockReturnValue(dbResult({ batchId: 'batch_7' }));
    // completeRollover uses findOneAndUpdate; default mock returns a rolled_over state.

    const state = await LockService.reconcileInProgressRollover({ schoolYear: SY, actorId: 'a1', actorRole: 'admin' });
    expect(state.status).toBe('rolled_over');

    SchoolYearState.findOne
      .mockReturnValueOnce(dbResult(makeState('rollover_in_progress', { rolloverToSchoolYear: TO_SY, rolloverSemester: '1st' })))
      .mockReturnValueOnce(dbResult(makeState('rollover_failed', { rolloverError: { message: 'Reconciled by administrator: no applied batch was found, so the transaction rolled back.', stage: 'recovery-reconciliation' } })));
    RolloverBatch.findOne.mockReturnValue(dbResult(null));

    const failed = await LockService.reconcileInProgressRollover({ schoolYear: SY, actorId: 'a1', actorRole: 'admin' });
    expect(failed.status).toBe('rollover_failed');
    expect(failed.needsRecovery).toBe(true);
  });
});

describe('recoverViaRevert (audited emergency recovery)', () => {
  test('only administrators can reverse a completed rollover, with a full justification', async () => {
    RolloverBatch.findOne.mockReturnValue(dbResult({ batchId: 'batch_7', fromSchoolYear: SY, toSchoolYear: TO_SY }));

    await expect(
      LockService.recoverViaRevert({
        batchId: 'batch_7',
        adminId: 'r1',
        adminRole: 'registrar',
        reason: 'A very long justification of at least twenty characters.',
        revertExecutor: jest.fn(),
      })
    ).rejects.toMatchObject({ statusCode: 403, reasonCode: 'FORBIDDEN' });

    await expect(
      LockService.recoverViaRevert({
        batchId: 'batch_7',
        adminId: 'a1',
        adminRole: 'admin',
        reason: 'too short',
        revertExecutor: jest.fn(),
      })
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  test('an unknown batch id is rejected', async () => {
    RolloverBatch.findOne.mockReturnValue(dbResult(null));

    await expect(
      LockService.recoverViaRevert({
        batchId: 'batch_404',
        adminId: 'a1',
        adminRole: 'admin',
        reason: 'A very long justification of at least twenty characters.',
        revertExecutor: jest.fn(),
      })
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  test('an admin recovery runs the executor, resets the source year to open, and audits every action', async () => {
    RolloverBatch.findOne.mockReturnValue(dbResult({ batchId: 'batch_7', fromSchoolYear: SY, toSchoolYear: TO_SY }));
    const revertExecutor = jest.fn(async () => ({ restoredStudents: 5, deletedEnrollments: 5 }));

    const result = await LockService.recoverViaRevert({
      batchId: 'batch_7',
      adminId: 'a1',
      adminRole: 'admin',
      reason: 'The rollover was executed against the wrong source year.',
      revertExecutor,
    });

    expect(result.restoredStudents).toBe(5);
    expect(revertExecutor).toHaveBeenCalledTimes(1);
    // The source year is open again and its validations stale.
    expect(SchoolYearState.updateMany).toHaveBeenCalledWith(
      { schoolYear: SY },
      expect.objectContaining({ $set: expect.objectContaining({ status: 'open' }) })
    );
    expect(RolloverValidationRun.updateMany).toHaveBeenCalledWith(
      { schoolYear: SY, status: { $in: ['passed', 'warnings'] } },
      expect.objectContaining({ $set: expect.objectContaining({ status: 'stale' }) })
    );

    const audit = auditEntries();
    expect(audit.some((entry) => entry.action === 'RESTORE' && entry.description.includes('wrong source year'))).toBe(true);
  });
});
