/**
 * School Year Lock Service — the Lock → Validate → Confirm Rollover workflow.
 *
 * State machine (one document per school year, see models/SchoolYearState.js):
 *
 *   open → locked → rollover_ready → rollover_in_progress → rolled_over
 *             ^            |                      |
 *             |            |                      └→ rollover_failed → (retry) rollover_ready
 *             └── unlock ──┘
 *
 * Invariants enforced here:
 *   - Locking never triggers a rollover; they are separate operations.
 *   - A locked year rejects every ordinary mutation path via
 *     assertSchoolYearWritable() (backend enforcement, not just UI hiding).
 *   - Unlocking never triggers a rollover, never deletes records, and marks
 *     previous validation runs stale (they are retained as history).
 *   - Rollover execution requires: locked + non-stale validation with no
 *     blocking errors + every warning authorized with a justification.
 *   - Concurrent executions and retries cannot duplicate rollover results
 *     (atomic state transitions + applied-batch checks).
 *   - A completed rollover cannot be reversed by ordinary unlock; recovery is
 *     a separate, admin-restricted, audited procedure.
 *
 * Every transition is recorded in the AuditLog.
 */

const mongoose = require('mongoose');
const SchoolYearState = require('../models/SchoolYearState');
const RolloverValidationRun = require('../models/RolloverValidationRun');
const RolloverBatch = require('../models/RolloverBatch');
const AuditLog = require('../models/AuditLog');
const ValidationChecks = require('./preRolloverValidationService');

const STATUSES = {
  OPEN: 'open',
  LOCKED: 'locked',
  ROLLOVER_READY: 'rollover_ready',
  ROLLOVER_IN_PROGRESS: 'rollover_in_progress',
  ROLLOVER_FAILED: 'rollover_failed',
  ROLLED_OVER: 'rolled_over',
};

const MUTABLE_STATUSES = [STATUSES.OPEN];
const VALID_SCHOOL_YEAR = /^\d{4}-\d{4}$/;
const SEMESTERS = ['1st', '2nd', 'Summer'];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function httpError(statusCode, message, reasonCode) {
  return Object.assign(new Error(message), { statusCode, reasonCode });
}

function normalizeRole(role) {
  const text = String(role || '').toLowerCase();
  return (['admin', 'registrar'].includes(text) ? text : 'registrar');
}

async function writeAudit({
  action,
  resourceType,
  resourceId,
  resourceName,
  description,
  actorId,
  actorRole,
  severity = 'MEDIUM',
  status = 'SUCCESS',
  oldValue = undefined,
  newValue = undefined,
}) {
  return AuditLog.create([{
    action,
    resourceType,
    resourceId: String(resourceId),
    resourceName,
    description: String(description).slice(0, 500),
    performedBy: actorId,
    performedByRole: normalizeRole(actorRole),
    status,
    severity,
    ...(oldValue !== undefined ? { oldValue } : {}),
    ...(newValue !== undefined ? { newValue } : {}),
  }]);
}

function stateForUI(state) {
  if (!state) {
    return {
      schoolYear: null,
      status: STATUSES.OPEN,
      canLock: true,
      canUnlock: false,
      canValidate: false,
      canProceedToRollover: false,
      canRetry: false,
      needsRecovery: false,
      validation: null,
    };
  }
  const validation = state.validationSummary || null;
  return {
    schoolYear: state.schoolYear,
    status: state.status,
    lockedAt: state.lockedAt,
    lockedBy: state.lockedBy,
    lockReason: state.lockReason,
    unlockedAt: state.unlockedAt,
    unlockReason: state.unlockReason,
    validatedAt: state.validatedAt,
    activeValidationRunId: state.activeValidationRunId,
    validationSummary: validation,
    rolloverBatchId: state.rolloverBatchId,
    rolloverToSchoolYear: state.rolloverToSchoolYear,
    rolloverSemester: state.rolloverSemester,
    rolloverCounts: state.rolloverCounts,
    rolloverError: state.rolloverError,
    rolloverStartedAt: state.rolloverStartedAt,
    rolloverFailedAt: state.rolloverFailedAt,
    canLock: state.status === STATUSES.OPEN,
    canUnlock: state.status === STATUSES.LOCKED || state.status === STATUSES.ROLLOVER_READY || state.status === STATUSES.ROLLOVER_FAILED,
    canValidate: state.status === STATUSES.LOCKED || state.status === STATUSES.ROLLOVER_READY,
    canProceedToRollover: state.status === STATUSES.ROLLOVER_READY,
    canRetry: state.status === STATUSES.ROLLOVER_FAILED,
    needsRecovery: state.status === STATUSES.ROLLOVER_FAILED,
    validation,
  };
}

async function getSchoolYearState(schoolYear) {
  const text = String(schoolYear || '').trim();
  if (!VALID_SCHOOL_YEAR.test(text)) {
    throw httpError(400, `School year "${schoolYear}" is not in YYYY-YYYY format.`);
  }
  const state = await SchoolYearState.findOne({ schoolYear: text }).lean();
  return state || null;
}

/** Formatted state object for API consumers (a missing doc means "open"). */
async function getSchoolYearStatus(schoolYear) {
  const state = await getSchoolYearState(schoolYear);
  return stateForUI(state);
}

// ---------------------------------------------------------------------------
// Lock / Unlock
// ---------------------------------------------------------------------------

/**
 * Lock an OPEN school year. Locking never triggers a rollover.
 */
async function lockSchoolYear({ schoolYear, actorId, actorRole, reason, session = null }) {
  const text = String(schoolYear || '').trim();
  if (!VALID_SCHOOL_YEAR.test(text)) {
    throw httpError(400, `School year "${schoolYear}" is not in YYYY-YYYY format.`);
  }
  if (!actorId) {
    throw httpError(400, 'An authenticated actor is required to lock a school year.');
  }

  // Atomic transition: only an OPEN year can be locked (race-safe).
  const filter = { schoolYear: text, status: { $in: ['', null, STATUSES.OPEN] } };
  const update = {
    $set: {
      status: STATUSES.LOCKED,
      lockedBy: actorId,
      lockedAt: new Date(),
      lockReason: reason ? String(reason).trim() : null,
      unlockedBy: null,
      unlockedAt: null,
      unlockReason: null,
    },
    $setOnInsert: { schoolYear: text },
  };

  const state = session
    ? await SchoolYearState.findOneAndUpdate(filter, update, { new: true, upsert: true, session })
    : await SchoolYearState.findOneAndUpdate(filter, update, { new: true, upsert: true });

  if (!state) {
    const existing = await getSchoolYearState(text);
    throw httpError(409, `SY ${text} cannot be locked because its current status is "${existing?.status || 'open'}".`, 'INVALID_STATE');
  }

  await writeAudit({
    action: 'ARCHIVE',
    resourceType: 'SYSTEM',
    resourceId: text,
    resourceName: `School Year ${text}`,
    description: `School year locked for rollover preparation. Ordinary modifications are restricted.${reason ? ' Reason: ' + String(reason).trim() : ''}`,
    actorId,
    actorRole,
    severity: 'HIGH',
    oldValue: { status: STATUSES.OPEN },
    newValue: { status: STATUSES.LOCKED },
  });

  return stateForUI(state);
}

/**
 * Unlock a locked school year whose rollover has not started (or an admin
 * opening a failed year for authorized corrections).
 *
 * Unlocking:
 *   - never triggers a rollover,
 *   - never deletes grades, enrollments, validation results, or audit history,
 *   - marks previous validation runs stale, because the year's data can change
 *     again while it is open (a new validation run is required before rollover).
 */
async function unlockSchoolYear({ schoolYear, actorId, actorRole, reason }) {
  const text = String(schoolYear || '').trim();
  if (!VALID_SCHOOL_YEAR.test(text)) {
    throw httpError(400, `School year "${schoolYear}" is not in YYYY-YYYY format.`);
  }
  const trimmedReason = String(reason || '').trim();
  if (trimmedReason.length < 5) {
    throw httpError(400, 'A reason of at least 5 characters is required to unlock a school year.');
  }
  if (!actorId) {
    throw httpError(400, 'An authenticated actor is required to unlock a school year.');
  }

  const state = await getSchoolYearState(text);
  const currentStatus = state?.status || STATUSES.OPEN;
  if (currentStatus === STATUSES.ROLLOVER_IN_PROGRESS) {
    throw httpError(409, `SY ${text} has a rollover in progress. Ordinary unlocking is not allowed while it executes.`, 'ROLL_OVER_IN_PROGRESS');
  }
  if (currentStatus === STATUSES.ROLLED_OVER) {
    throw httpError(
      409,
      `SY ${text} has already been rolled over. Unlocking cannot reverse a completed rollover; use the audited recovery procedure (admin) if a genuine error needs correction.`,
      'ROLL_OVER_COMPLETE'
    );
  }
  if (currentStatus !== STATUSES.LOCKED && currentStatus !== STATUSES.ROLLOVER_READY && currentStatus !== STATUSES.ROLLOVER_FAILED) {
    throw httpError(409, `SY ${text} is already open and cannot be unlocked.`, 'INVALID_STATE');
  }
  if (currentStatus === STATUSES.ROLLOVER_FAILED && normalizeRole(actorRole) !== 'admin') {
    throw httpError(403, 'Recovering a failed rollover year requires an administrator. Contact an admin to unlock SY ' + text + '.', 'FORBIDDEN');
  }

  const wasReady = currentStatus === STATUSES.ROLLOVER_READY || currentStatus === STATUSES.ROLLOVER_FAILED;

  // Atomic transition bar a concurrent rollover start.
  const updated = await SchoolYearState.findOneAndUpdate(
    { schoolYear: text, status: currentStatus },
    {
      $set: {
        status: STATUSES.OPEN,
        unlockedBy: actorId,
        unlockedAt: new Date(),
        unlockReason: trimmedReason,
        activeValidationRunId: null,
        validationSummary: null,
      },
    },
    { new: true }
  );
  if (!updated) {
    const existing = await getSchoolYearState(text);
    throw httpError(409, `SY ${text} changed state concurrently ("${existing?.status}"). Retry the unlock.`, 'CONCURRENT');
  }

  // Retain all previous validation runs, but mark them stale: the year is
  // mutable again, so any results computed for it no longer guarantee safety.
  if (wasReady) {
    const staleUpdate = await RolloverValidationRun.updateMany(
      { schoolYear: text, status: { $in: ['passed', 'warnings'] } },
      { $set: { status: 'stale', staleAt: new Date(), staleReason: 'School year unlocked and modified before rollover.' } }
    );
    await writeAudit({
      action: 'UPDATE',
      resourceType: 'SYSTEM',
      resourceId: text,
      resourceName: `School Year ${text}`,
      description: staledDescription(staleUpdate?.modifiedCount ?? 0),
      actorId,
      actorRole,
      severity: 'MEDIUM',
    });
  }

  await writeAudit({
    action: 'UPDATE',
    resourceType: 'SYSTEM',
    resourceId: text,
    resourceName: `School Year ${text}`,
    description: `School year unlocked. Reason: ${trimmedReason}`,
    actorId,
    actorRole,
    severity: 'HIGH',
    oldValue: { status: currentStatus },
    newValue: { status: STATUSES.OPEN },
  });

  return stateForUI(updated);
}

function staledDescription(count) {
  return count > 0
    ? `${count} previous validation run(s) were marked stale because the school year was unlocked.`
    : 'Unlock invalidated validation results for this school year.';
}

// ---------------------------------------------------------------------------
// Pre-rollover validation
// ---------------------------------------------------------------------------

/** Allowed rollover contexts (YYYY-YYYY → YYYY-YYYY + opening semester). */
function normalizeRolloverContext({ fromSchoolYear, toSchoolYear, semester }) {
  const from = String(fromSchoolYear || '').trim();
  const to = String(toSchoolYear || '').trim();
  if (!VALID_SCHOOL_YEAR.test(from)) {
    throw httpError(400, `School year "${fromSchoolYear}" is not in YYYY-YYYY format.`);
  }
  if (!VALID_SCHOOL_YEAR.test(to)) {
    throw httpError(400, `School year "${toSchoolYear}" is not in YYYY-YYYY format.`);
  }
  if (!SEMESTERS.includes(semester)) {
    throw httpError(400, `Opening semester "${semester}" is invalid. Use 1st, 2nd, or Summer.`);
  }
  return { fromSchoolYear: from, toSchoolYear: to, semester };
}

/**
 * Run the full pre-rollover validation for a locked school year.
 *
 * Creates a retained RolloverValidationRun. If there are no blocking errors
 * the year moves to 'rollover_ready'; otherwise it stays locked with the
 * blocking errors stored on the state for the registrar to fix.
 */
async function runPreRolloverValidation({ schoolYear, toSchoolYear, semester, actorId, actorRole }) {
  const context = normalizeRolloverContext({ fromSchoolYear: schoolYear, toSchoolYear, semester });
  if (!actorId) {
    throw httpError(400, 'An authenticated actor is required to run pre-rollover validation.');
  }

  const state = await getSchoolYearState(context.fromSchoolYear);
  const currentStatus = state?.status || STATUSES.OPEN;
  if (currentStatus !== STATUSES.LOCKED && currentStatus !== STATUSES.ROLLOVER_READY) {
    if (currentStatus === STATUSES.OPEN) {
      throw httpError(409, `SY ${context.fromSchoolYear} must be locked before validation can run. Lock it first.`, 'INVALID_STATE');
    }
    if (currentStatus === STATUSES.ROLLOVER_IN_PROGRESS) {
      throw httpError(409, `A rollover is already in progress for SY ${context.fromSchoolYear}.`, 'ROLL_OVER_IN_PROGRESS');
    }
    throw httpError(409, `SY ${context.fromSchoolYear} has status "${currentStatus}"; validation requires a locked year.`, 'INVALID_STATE');
  }

  const { results, summary, status } = await ValidationChecks.runChecks({
    fromSchoolYear: context.fromSchoolYear,
    toSchoolYear: context.toSchoolYear,
    semester: context.semester,
  });

  const run = (await RolloverValidationRun.create([{
    schoolYear: context.fromSchoolYear,
    toSchoolYear: context.toSchoolYear,
    semester: context.semester,
    runBy: actorId,
    status,
    results,
    summary,
  }]))[0];

  const nextStatus = summary.blockingErrors === 0 ? STATUSES.ROLLOVER_READY : STATUSES.LOCKED;

  // Atomic update on the expected current status; a concurrent unlock changes
  // the filter match and prevents a stale ready-state from being written.
  const updated = await SchoolYearState.findOneAndUpdate(
    { schoolYear: context.fromSchoolYear, status: currentStatus },
    {
      $set: {
        status: nextStatus,
        activeValidationRunId: run._id,
        validatedAt: run.runAt,
        validationSummary: { ...summary, runStatus: status, toSchoolYear: context.toSchoolYear, semester: context.semester },
      },
    },
    { new: true }
  );

  await writeAudit({
    action: 'VERIFY',
    resourceType: 'SYSTEM',
    resourceId: String(run._id),
    resourceName: `Pre-rollover validation SY ${context.fromSchoolYear} → SY ${context.toSchoolYear} (${context.semester})`,
    description: `Validation ${status}: ${summary.blockingErrors} blocking, ${summary.warnings} warning(s), ${summary.passedChecks} passed.`,
    actorId,
    actorRole,
    severity: summary.blockingErrors > 0 ? 'HIGH' : 'MEDIUM',
    status: status === 'failed' ? 'FAILED' : 'SUCCESS',
    newValue: { summary, target: context },
  });

  return {
    run: {
      _id: String(run._id),
      schoolYear: context.fromSchoolYear,
      toSchoolYear: context.toSchoolYear,
      semester: context.semester,
      status,
      results,
      summary,
    },
    state: updated ? stateForUI(updated) : null,
  };
}

/** Fetch retained validation runs for the audit trail / history view. */
async function listValidationRuns(schoolYear, { limit = 20 } = {}) {
  const text = String(schoolYear || '').trim();
  if (!VALID_SCHOOL_YEAR.test(text)) {
    throw httpError(400, `School year "${schoolYear}" is not in YYYY-YYYY format.`);
  }
  return RolloverValidationRun.find({ schoolYear: text })
    .sort({ runAt: -1 })
    .limit(Math.min(Math.max(Number(limit) || 20, 1), 100))
    .lean();
}

// ---------------------------------------------------------------------------
// Rollover execution safeguards
// ---------------------------------------------------------------------------

/**
 * Prepare and execute the rollover behind the full safeguard chain.
 *
 *   1. State must be 'rollover_ready' (locked + passed validation).
 *   2. The active validation run must exist, be non-stale and match the
 *      requested target context exactly.
 *   3. Every warning must be authorized with a recorded justification.
 *   4. Cheap race-sensitive conditions are re-checked on the server
 *      (term alignment, target duplicates, applied duplicate batch).
 *   5. Atomic rollover_ready → rollover_in_progress transition — a second
 *      concurrent request loses the race and is rejected.
 *   6. The rollover itself runs inside its existing single-database
 *      transaction (see academicYearRolloverService.executeRollover).
 *   7. Success → 'rolled_over' with counts; any failure → 'rollover_failed'
 *      with the error preserved for recovery.
 *
 * @param {Function} execute  the executor, called with the original params
 */
async function executeWithSafeguards(rolloverParams, execute) {
  const context = normalizeRolloverContext({
    fromSchoolYear: rolloverParams.fromSchoolYear,
    toSchoolYear: rolloverParams.toSchoolYear,
    semester: rolloverParams.semester,
  });
  const actorId = rolloverParams.adminId;
  if (!actorId) {
    throw httpError(400, 'An authenticated actor is required to execute a rollover.');
  }

  const state = await getSchoolYearState(context.fromSchoolYear);
  const currentStatus = state?.status || STATUSES.OPEN;
  if (currentStatus === STATUSES.OPEN) {
    throw httpError(
      409,
      `SY ${context.fromSchoolYear} is open. Lock the school year and run pre-rollover validation before executing the rollover.`,
      'INVALID_STATE'
    );
  }
  if (currentStatus === STATUSES.ROLLOVER_IN_PROGRESS) {
    throw httpError(409, `A rollover is already in progress for SY ${context.fromSchoolYear}.`, 'ROLL_OVER_IN_PROGRESS');
  }
  if (currentStatus === STATUSES.ROLLED_OVER) {
    throw httpError(
      409,
      `SY ${context.fromSchoolYear} has already been rolled over (batch ${state.rolloverBatchId || 'n/a'}). A completed rollover cannot run again; use the recovery procedure if a genuine error needs correction.`,
      'ROLL_OVER_COMPLETE'
    );
  }
  if (currentStatus === STATUSES.ROLLOVER_FAILED) {
    throw httpError(
      409,
      `The last rollover for SY ${context.fromSchoolYear} failed (${state.rolloverError?.message || 'see failure details'}). Retry it through the recovery action to verify no partial data was written.`,
      'RECOVERY_REQUIRED'
    );
  }
  if (currentStatus !== STATUSES.ROLLOVER_READY) {
    throw httpError(
      409,
      `SY ${context.fromSchoolYear} is locked but has not passed pre-rollover validation${state?.validationSummary ? ` (last run at ${state.validatedAt ? new Date(state.validatedAt).toLocaleString() : 'unknown time'}, ${state.validationSummary.blockingErrors || 0} blocking error(s))` : ''}. Run validation first.`,
      'VALIDATION_REQUIRED'
    );
  }

  // 2. The active, non-stale validation run must match the requested context.
  const run = state.activeValidationRunId
    ? await RolloverValidationRun.findById(state.activeValidationRunId).lean()
    : null;
  if (!run) {
    throw httpError(409, 'No active validation run backs this rollover. Run pre-rollover validation again.', 'VALIDATION_REQUIRED');
  }
  if (run.status === 'stale' || run.staleAt) {
    throw httpError(409, 'The validation results backing this rollover are stale (the year was modified). Lock it again and run validation.', 'VALIDATION_STALE');
  }
  if (!sameText(run.schoolYear, context.fromSchoolYear) || !sameText(run.toSchoolYear, context.toSchoolYear) || !sameText(run.semester, context.semester)) {
    throw httpError(
      409,
      'The validated rollover target does not match the requested rollover. Re-run validation for the requested combination.',
      'VALIDATION_TARGET_MISMATCH'
    );
  }
  if ((run.summary?.blockingErrors ?? 1) > 0) {
    throw httpError(409, 'The active validation run still reports blocking errors.', 'BLOCKING_ERRORS');
  }

  // 3. Every warning must be authorized with a justification.
  const warningChecks = run.results.filter((result) => result.status === 'warning');
  if (warningChecks.length > 0) {
    const acknowledgements = Array.isArray(rolloverParams.acknowledgedWarnings) ? rolloverParams.acknowledgedWarnings : [];
    const ackByKey = new Map(acknowledgements.map((ack) => [String(ack?.key || ''), String(ack?.justification || '').trim()]));
    const missing = warningChecks.filter((warning) => (ackByKey.get(warning.key) || '').length < 10);
    if (missing.length > 0) {
      throw httpError(
        409,
        `The following warning(s) must be acknowledged with a written justification before rollover: ${missing.map((w) => w.title).join('; ')}.`,
        'WARNINGS_UNACKNOWLEDGED',
      );
    }
    await writeAudit({
      action: 'APPROVE',
      resourceType: 'SYSTEM',
      resourceId: String(run._id),
      resourceName: `Pre-rollover validation SY ${context.fromSchoolYear} → SY ${context.toSchoolYear}`,
      description: `Authorized rollover warnings: ${missing.length ? '' : warningChecks.map((w) => `${w.title}(${(ackByKey.get(w.key) || '').slice(0, 80)})`).join('; ')}`,
      actorId,
      actorRole: rolloverParams.adminRole,
      severity: 'HIGH',
    });
  }

  // 4. Re-check race-sensitive conditions immediately before execution.
  await ValidationChecks.assertExecutionTimeGates({
    fromSchoolYear: context.fromSchoolYear,
    toSchoolYear: context.toSchoolYear,
    semester: context.semester,
  });

  // 5. Atomic transition — a concurrent competitor loses the filter match.
  const started = await SchoolYearState.findOneAndUpdate(
    {
      schoolYear: context.fromSchoolYear,
      status: STATUSES.ROLLOVER_READY,
      activeValidationRunId: state.activeValidationRunId,
    },
    {
      $set: {
        status: STATUSES.ROLLOVER_IN_PROGRESS,
        rolloverToSchoolYear: context.toSchoolYear,
        rolloverSemester: context.semester,
        rolloverStartedBy: actorId,
        rolloverStartedAt: new Date(),
      },
    },
    { new: true }
  );
  if (!started) {
    throw httpError(409, 'The rollover state changed concurrently. Refresh and retry.', 'CONCURRENT');
  }

  await writeAudit({
    action: 'APPROVE',
    resourceType: 'SYSTEM',
    resourceId: context.fromSchoolYear,
    resourceName: `School Year ${context.fromSchoolYear}`,
    description: `Rollover confirmed and started: SY ${context.fromSchoolYear} → SY ${context.toSchoolYear} (${context.semester}). Validation run ${String(run._id)} with ${run.summary?.warnings ?? 0} authorized warning(s).`,
    actorId,
    actorRole: rolloverParams.adminRole,
    severity: 'CRITICAL',
  });

  // 6. Execute.
  try {
    const result = await execute();
    if (!result || !result.rolloverBatchId) {
      throw new Error('Rollover executor returned no batch id.');
    }
    // Mark the validation run as used, then complete the state machine.
    await RolloverValidationRun.updateOne(
      { _id: run._id },
      { $set: { rolloverBatchId: result.rolloverBatchId } }
    );
    await completeRollover({
      schoolYear: context.fromSchoolYear,
      batchId: result.rolloverBatchId,
      counts: result.counts || null,
      actorId,
      actorRole: rolloverParams.adminRole,
    });
    return result;
  } catch (executionError) {
    // 7. Any failure → failed/recovery state with the error preserved.
    await failRollover({
      schoolYear: context.fromSchoolYear,
      actorId,
      actorRole: rolloverParams.adminRole,
      error: executionError?.message || String(executionError),
      stage: 'execution',
    });
    throw executionError;
  }
}

function sameText(left, right) {
  return String(left ?? '').trim() === String(right ?? '').trim();
}

/** rollover_in_progress → rolled_over (only called after verified success). */
async function completeRollover({ schoolYear, batchId, counts = null, actorId, actorRole }) {
  const updated = await SchoolYearState.findOneAndUpdate(
    { schoolYear: String(schoolYear).trim(), status: STATUSES.ROLLOVER_IN_PROGRESS },
    {
      $set: {
        status: STATUSES.ROLLED_OVER,
        rolloverBatchId: batchId,
        rolloverCounts: counts,
      },
    },
    { new: true }
  );
  if (!updated) {
    throw httpError(409, `SY ${schoolYear} is not in a rollover-in-progress state; the rollover outcome could not be recorded.`, 'INVALID_STATE');
  }
  await writeAudit({
    action: 'ARCHIVE',
    resourceType: 'SYSTEM',
    resourceId: String(batchId),
    resourceName: `School Year ${String(schoolYear).trim()} rollover completion`,
    description: `Rollover completed and verified. Batch ${batchId}. Source year is now permanently rolled over. Counts: ${JSON.stringify(counts || {})}`,
    actorId,
    actorRole,
    severity: 'CRITICAL',
  });
  return stateForUI(updated);
}

/** rollover_in_progress → rollover_failed (recovery required; error preserved). */
async function failRollover({ schoolYear, actorId, actorRole, error, stage }) {
  const updated = await SchoolYearState.findOneAndUpdate(
    { schoolYear: String(schoolYear).trim(), status: STATUSES.ROLLOVER_IN_PROGRESS },
    {
      $set: {
        status: STATUSES.ROLLOVER_FAILED,
        rolloverError: { message: String(error || 'unknown error'), stage: stage || 'unknown' },
        rolloverFailedAt: new Date(),
      },
    },
    { new: true }
  );
  await writeAudit({
    action: 'ARCHIVE',
    resourceType: 'SYSTEM',
    resourceId: String(schoolYear).trim(),
    resourceName: `School Year ${String(schoolYear).trim()} rollover failure`,
    description: `Rollover failed at stage "${stage || 'unknown'}": ${String(error || 'unknown error')}. Year set to recovery-required; logs preserved.`,
    actorId,
    actorRole,
    severity: 'CRITICAL',
    status: 'FAILED',
  });
  return updated ? stateForUI(updated) : null;
}

/**
 * Retry a FAILED rollover. Safe because the original execution runs in a
 * single transaction: nothing was applied, so the pre-failure validation
 * results are still valid. An applied batch for the same context proves the
 * rollover actually completed and the state is reconciled instead.
 */
async function retryRollover({ schoolYear, actorId, actorRole, toSchoolYear, semester }) {
  const context = normalizeRolloverContext({ fromSchoolYear: schoolYear, toSchoolYear, semester });
  if (!actorId) {
    throw httpError(400, 'An authenticated actor is required to retry a rollover.');
  }
  const state = await getSchoolYearState(context.fromSchoolYear);
  if (!state || state.status !== STATUSES.ROLLOVER_FAILED) {
    throw httpError(409, `SY ${context.fromSchoolYear} is not in the rollover-failed state.`, 'INVALID_STATE');
  }

  const appliedBatch = await RolloverBatch.findOne({
    fromSchoolYear: context.fromSchoolYear,
    toSchoolYear: context.toSchoolYear,
    semester: context.semester,
    status: 'applied',
  })
    .select('batchId executedAt')
    .lean();
  if (appliedBatch) {
    // The operation actually completed (e.g. the process died after commit
    // but before the state write). Reconcile instead of re-running.
    await completeRollover({
      schoolYear: context.fromSchoolYear,
      batchId: appliedBatch.batchId,
      counts: null,
      actorId,
      actorRole,
    });
    throw httpError(
      409,
      `Rollover batch ${appliedBatch.batchId} was already applied for SY ${context.fromSchoolYear}. The year has been reconciled to "rolled over"; no retry was executed.`,
      'ROLL_OVER_DUPLICATE'
    );
  }

  const updated = await SchoolYearState.findOneAndUpdate(
    { schoolYear: context.fromSchoolYear, status: STATUSES.ROLLOVER_FAILED },
    {
      $set: {
        status: STATUSES.ROLLOVER_READY,
        rolloverError: null,
        rolloverFailedAt: null,
      },
    },
    { new: true }
  );
  if (!updated) {
    throw httpError(409, 'The rollover state changed concurrently. Refresh and retry.', 'CONCURRENT');
  }

  await writeAudit({
    action: 'UPDATE',
    resourceType: 'SYSTEM',
    resourceId: context.fromSchoolYear,
    resourceName: `School Year ${context.fromSchoolYear}`,
    description: `Failed rollover retried after recovery check: no applied batch exists for SY ${context.fromSchoolYear} → SY ${context.toSchoolYear} (${context.semester}), so no duplicates are possible.`,
    actorId,
    actorRole,
    severity: 'HIGH',
  });
  return stateForUI(updated);
}

/**
 * Admin reconciliation of a stale 'rollover_in_progress' state (e.g. the
 * server died mid-execution). Verifies what actually was applied:
 *   - an applied batch exists → the rollover completed → mark rolled over
 *   - no applied batch       → the transaction rolled back → mark failed
 */
async function reconcileInProgressRollover({ schoolYear, actorId, actorRole }) {
  const text = String(schoolYear || '').trim();
  if (!VALID_SCHOOL_YEAR.test(text)) {
    throw httpError(400, `School year "${schoolYear}" is not in YYYY-YYYY format.`);
  }
  if (normalizeRole(actorRole) !== 'admin') {
    throw httpError(403, 'Reconciliation of a rollover that is stuck "in progress" requires an administrator.', 'FORBIDDEN');
  }
  const state = await getSchoolYearState(text);
  if (!state || state.status !== STATUSES.ROLLOVER_IN_PROGRESS) {
    throw httpError(409, `SY ${text} is not in the rollover-in-progress state.`, 'INVALID_STATE');
  }

  const appliedBatch = await RolloverBatch.findOne({
    fromSchoolYear: text,
    toSchoolYear: state.rolloverToSchoolYear,
    semester: state.rolloverSemester,
    status: 'applied',
  })
    .select('batchId')
    .lean();

  if (appliedBatch) {
    await completeRollover({
      schoolYear: text,
      batchId: appliedBatch.batchId,
      counts: null,
      actorId,
      actorRole,
    });
  } else {
    await failRollover({
      schoolYear: text,
      actorId,
      actorRole,
      error: 'Reconciled by administrator: no applied batch was found, so the transaction rolled back.',
      stage: 'recovery-reconciliation',
    });
  }
  return getSchoolYearStatus(text);
}

// ---------------------------------------------------------------------------
// Mutation enforcement
// ---------------------------------------------------------------------------

/**
 * Backend enforcement: assert that records belonging to a school year may be
 * created, edited, or deleted. Called by every year-scoped mutation path.
 *
 * Read-only access is never affected.
 */
async function assertSchoolYearWritable(schoolYear, contextLabel = null) {
  const text = String(schoolYear || '').trim();
  if (!VALID_SCHOOL_YEAR.test(text)) return; // unvalidated years are outside the lock system

  const state = await getSchoolYearState(text);
  const status = state?.status || STATUSES.OPEN;
  if (status === STATUSES.OPEN) return;

  if (status === STATUSES.ROLLED_OVER) {
    throw httpError(
      409,
      `SY ${text} has been rolled over and is immutable historical data. Corrections to its records require the audited rollover recovery procedure (admin).`,
      'SCHOOL_YEAR_ROLLED_OVER'
    );
  }
  if (status === STATUSES.ROLLOVER_IN_PROGRESS) {
    throw httpError(409, `SY ${text} has a rollover in progress; its records cannot be modified.`, 'ROLL_OVER_IN_PROGRESS');
  }
  throw httpError(
    409,
    `SY ${text} is${status === 'rollover_ready' ? '' : ' locked'} for rollover preparation. Records for this school year cannot be modified. If a correction is needed, unlock the year first (this requires re-running validation before rollover).${contextLabel ? ` (attempted: ${contextLabel})` : ''}`,
    'SCHOOL_YEAR_LOCKED'
  );
}

/**
 * Emergency recovery: reverse a completed rollover through the controlled,
 * admin-restricted, audited procedure. Never reachable from the ordinary
 * rollover interface.
 *
 * Calls the existing revert implementation (which independently verifies the
 * batch is the latest applied, the active term still matches, and no academic
 * history would be destroyed) and then reconciles the state machine:
 * the source year becomes "open" again and its validation results are stale.
 */
async function recoverViaRevert({ batchId, adminId, adminRole, reason, revertExecutor }) {
  const trimmedReason = String(reason || '').trim();
  if (normalizeRole(adminRole) !== 'admin') {
    throw httpError(403, 'Rollover recovery (reverting a completed rollover) requires an administrator.', 'FORBIDDEN');
  }
  if (trimmedReason.length < 20) {
    throw httpError(400, 'A written justification of at least 20 characters is required for rollover recovery.');
  }
  const batch = await RolloverBatch.findOne({ batchId: String(batchId || '').trim() }).lean();
  if (!batch) {
    throw httpError(404, 'Rollover batch not found.');
  }

  const result = await revertExecutor();

  await SchoolYearState.updateMany(
    { schoolYear: batch.fromSchoolYear },
    {
      $set: {
        status: STATUSES.OPEN,
        recoveredBy: adminId,
        recoveredAt: new Date(),
        recoveryReason: trimmedReason,
        rolloverBatchId: null,
        rolloverCounts: null,
        rolloverError: null,
        rolloverFailedAt: null,
        activeValidationRunId: null,
        validationSummary: null,
      },
    }
  );
  await RolloverValidationRun.updateMany(
    { schoolYear: batch.fromSchoolYear, status: { $in: ['passed', 'warnings'] } },
    { $set: { status: 'stale', staleAt: new Date(), staleReason: `Rollover recovery performed: ${trimmedReason}` } }
  );

  await writeAudit({
    action: 'RESTORE',
    resourceType: 'SYSTEM',
    resourceId: String(batchId),
    resourceName: `Rollover recovery ${batch.fromSchoolYear} → ${batch.toSchoolYear}`,
    description: `Audited rollover recovery executed by an administrator. Reason: ${trimmedReason}. Result: ${result.restoredStudents} student(s) restored, ${result.deletedEnrollments} enrollment(s) removed.`,
    actorId: adminId,
    actorRole: normalizeRole(adminRole),
    severity: 'CRITICAL',
  });

  return result;
}

module.exports = {
  STATUSES,
  getSchoolYearState,
  getSchoolYearStatus,
  lockSchoolYear,
  unlockSchoolYear,
  runPreRolloverValidation,
  listValidationRuns,
  executeWithSafeguards,
  completeRollover,
  failRollover,
  retryRollover,
  reconcileInProgressRollover,
  assertSchoolYearWritable,
  recoverViaRevert,
  normalizeRolloverContext,
};
