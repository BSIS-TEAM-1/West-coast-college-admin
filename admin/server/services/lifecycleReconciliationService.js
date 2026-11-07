/**
 * Historical dismissal reconciliation.
 *
 * The original failure counter counted every historical failing grade and
 * mis-normalized the passing grade, so some students were dismissed with fewer
 * than the three distinct unresolved failed subjects the policy requires. This
 * service finds those system-generated academic-deficiency dismissals, re-runs
 * the corrected centralized evaluator over each student's complete grade
 * history, and restores the students who no longer meet the threshold.
 *
 * Guarantees:
 *   - Dry run by default: `dryRun: false` is the only way to write anything.
 *   - Only a CURRENT system-generated academic-deficiency dismissal is a
 *     candidate. Manual dismissals, voluntary withdrawals, graduated students,
 *     and students readmitted since the dismissal are never touched.
 *   - Every restoration goes through evaluateStudentAcademicStanding, so the
 *     threshold, retake rules, roster restoration, history event, audit log,
 *     and notification behavior are exactly the production behavior.
 *   - Idempotent: a restored student is no longer `Dropped`, so a second run
 *     reports them as inspected-and-unchanged instead of restoring again.
 *   - Nothing is deleted or rewritten. The dismissal event stays in history.
 */

const mongoose = require('mongoose');
const Student = require('../models/Student');
const AuditLog = require('../models/AuditLog');
const lifecycle = require('./studentLifecycleService');

const CANDIDATE_FIELDS = [
  'studentNumber',
  'firstName',
  'lastName',
  'lifecycleStatus',
  'lifecycleStatusReason',
  'lifecycleStatusEventId',
  'lifecycleStatusHistory',
  'academicStanding',
  'schoolYear',
  'semester'
].join(' ');

/**
 * Reconcile every system-generated academic-deficiency dismissal.
 *
 * @param {Object} [options]
 * @param {boolean} [options.dryRun=true] - report only unless explicitly false
 * @param {string|Object} [options.actorId] - admin/registrar performing the run
 * @param {string} [options.accountType='admin']
 * @param {Date} [options.effectiveDate]
 * @param {number} [options.limit=0] - optional cap on candidates (0 = all)
 * @returns {Promise<Object>} report with one row per inspected student
 */
async function reconcileAcademicDismissals({
  dryRun = true,
  actorId = null,
  accountType = 'admin',
  effectiveDate = new Date(),
  limit = 0
} = {}) {
  const execute = dryRun === false;
  const policy = await lifecycle.loadDismissalPolicy();

  const query = Student.find({
    lifecycleStatus: lifecycle.DROPPED,
    lifecycleStatusReason: lifecycle.REASON_ACADEMIC_DEFICIENCY
  }).select(CANDIDATE_FIELDS).sort({ studentNumber: 1 });
  const candidates = limit > 0 ? await query.limit(limit).lean() : await query.lean();

  const report = {
    dryRun: !execute,
    generatedAt: new Date().toISOString(),
    policy: {
      failureThreshold: policy.failureThreshold,
      allowAutomaticRecovery: policy.allowAutomaticRecovery
    },
    inspected: Array.isArray(candidates) ? candidates.length : 0,
    eligibleForRestoration: 0,
    restored: 0,
    notRestored: 0,
    unchanged: 0,
    errors: [],
    rows: []
  };

  for (const candidate of Array.isArray(candidates) ? candidates : []) {
    const studentLabel = lifecycleRowLabel(candidate);

    let preview;
    try {
      preview = await lifecycle.previewStudentAcademicStanding({ studentId: candidate._id });
    } catch (error) {
      report.errors.push({ studentNumber: studentLabel, stage: 'preview', error: error.message });
      continue;
    }

    if (preview.reason === 'student_not_found') {
      report.errors.push({ studentNumber: studentLabel, stage: 'preview', error: 'student_not_found' });
      continue;
    }

    const row = {
      studentId: preview.studentId,
      studentNumber: preview.studentNumber || studentLabel,
      studentName: preview.studentName,
      dismissalEffectiveDate: preview.dismissalEffectiveDate,
      dismissalEventId: preview.dismissalEventId,
      lifecycleStatus: preview.lifecycleStatus,
      currentAcademicStanding: preview.currentAcademicStanding,
      academicStanding: preview.academicStanding,
      unresolvedFailureCount: preview.unresolvedFailureCount,
      threshold: preview.threshold,
      unresolvedFailedSubjects: preview.failures.map((failure) => failure.code).filter(Boolean),
      automaticDismissal: preview.automaticDismissal,
      plannedAction: preview.plannedAction,
      reason: preview.reason
    };

    if (preview.plannedAction !== 'restore') {
      report.unchanged += 1;
      // A candidate that is no longer `Dropped` was already restored (or
      // independently changed) between the query and the evaluation.
      row.outcome = preview.lifecycleStatus === lifecycle.DROPPED
        ? 'keeps_dismissal'
        : 'no_longer_dismissed';
      report.rows.push(row);
      continue;
    }

    report.eligibleForRestoration += 1;

    if (!execute) {
      row.outcome = 'would_restore';
      report.rows.push(row);
      continue;
    }

    try {
      const result = await lifecycle.evaluateStudentAcademicStanding({
        studentId: candidate._id,
        actorId,
        accountType,
        source: 'lifecycle_reconciliation',
        effectiveDate
      });

      if (result.changed && result.restored) {
        report.restored += 1;
        row.outcome = 'restored';
        row.restoredLifecycleStatus = result.lifecycleStatus;
        row.restoredAcademicStanding = result.academicStanding;
        row.rosterRestored = Boolean(result.rosterRestored);
        row.auditLogged = Boolean(result.auditLogged);
        row.historyEventId = result.eventId;
      } else {
        report.notRestored += 1;
        row.outcome = 'not_restored';
        row.reason = result.reason || 'evaluation_made_no_change';
      }
    } catch (error) {
      report.notRestored += 1;
      row.outcome = 'error';
      row.error = error.message;
      report.errors.push({ studentNumber: row.studentNumber, stage: 'restore', error: error.message });
    }

    report.rows.push(row);
  }

  if (execute) {
    report.auditLogged = await writeRunAudit({ report, actorId, accountType });
  }

  return report;
}

function lifecycleRowLabel(candidate) {
  const number = String(candidate?.studentNumber || '').trim();
  if (number) return number;
  const id = String(candidate?._id || '').trim();
  return id || 'unknown';
}

/**
 * One audit entry per executed run, so the reconciliation itself is traceable
 * in the same trail as the status changes it caused. Skipped (and reported as
 * such) when the operator did not supply a valid actor id.
 */
async function writeRunAudit({ report, actorId, accountType }) {
  if (!actorId || !mongoose.Types.ObjectId.isValid(String(actorId))) return false;

  const description = [
    `Lifecycle reconciliation: inspected ${report.inspected} system-generated academic-deficiency dismissal(s);`,
    `${report.eligibleForRestoration} were below the dismissal threshold;`,
    `restored ${report.restored}, not restored ${report.notRestored}, unchanged ${report.unchanged}.`
  ].join(' ').replace(/\s+/g, ' ').slice(0, 500);

  try {
    await AuditLog.create({
      action: 'RESTORE',
      resourceType: 'SYSTEM',
      resourceId: 'student-lifecycle-reconciliation',
      resourceName: 'Student lifecycle reconciliation',
      description,
      performedBy: actorId,
      performedByRole: String(accountType || 'admin').toLowerCase() === 'registrar' ? 'registrar' : 'admin',
      oldValue: {
        inspected: report.inspected,
        eligibleForRestoration: report.eligibleForRestoration
      },
      newValue: {
        restored: report.restored,
        notRestored: report.notRestored,
        unchanged: report.unchanged,
        errors: report.errors.length,
        policy: report.policy,
        studentNumbers: report.rows
          .filter((row) => row.outcome === 'restored')
          .map((row) => row.studentNumber)
      },
      status: report.errors.length > 0 ? 'PARTIAL' : 'SUCCESS',
      severity: 'CRITICAL'
    });
    return true;
  } catch (error) {
    report.errors.push({ stage: 'run_audit', error: error.message });
    return false;
  }
}

/** Human-readable report used by the CLI script and by operators auditing a run. */
function formatReconciliationReport(report) {
  const lines = [];
  const mode = report.dryRun ? 'DRY RUN (no writes)' : 'APPLY (writes enabled)';
  lines.push(`Student lifecycle reconciliation — ${mode}`);
  lines.push(`Generated: ${report.generatedAt}`);
  lines.push(`Policy: dismissal threshold ${report.policy.failureThreshold} unresolved failed subject(s), automatic recovery ${report.policy.allowAutomaticRecovery ? 'enabled' : 'disabled'}`);
  lines.push('');
  lines.push(`Inspected: ${report.inspected}  Eligible for restoration: ${report.eligibleForRestoration}  Restored: ${report.restored}  Not restored: ${report.notRestored}  Unchanged: ${report.unchanged}`);

  if (report.rows.length > 0) {
    lines.push('');
    for (const row of report.rows) {
      const subjects = row.unresolvedFailedSubjects.length > 0
        ? row.unresolvedFailedSubjects.join(', ')
        : 'none';
      lines.push(
        `- ${row.studentNumber} ${row.studentName ? `(${row.studentName})` : ''}`.trimEnd()
        + ` — ${row.outcome}: ${row.unresolvedFailureCount} unresolved failed subject(s) (threshold ${row.threshold})`
        + ` [${subjects}] standing ${row.currentAcademicStanding} → ${row.plannedAction}`
        + `; dismissal ${formatDate(row.dismissalEffectiveDate)}; ${row.reason}`
      );
    }
  }

  if (report.errors.length > 0) {
    lines.push('');
    lines.push(`Errors (${report.errors.length}):`);
    for (const error of report.errors) {
      lines.push(`- ${error.studentNumber ? `${error.studentNumber}: ` : ''}${error.stage} — ${error.error}`);
    }
  }

  if (report.dryRun && report.eligibleForRestoration > 0) {
    lines.push('');
    lines.push('Re-run with --execute (and an --actor id) to apply these restorations.');
  }

  return lines.join('\n');
}

function formatDate(value) {
  if (!value) return 'unknown';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return 'unknown';
  return date.toISOString().slice(0, 10);
}

module.exports = {
  reconcileAcademicDismissals,
  formatReconciliationReport
};
