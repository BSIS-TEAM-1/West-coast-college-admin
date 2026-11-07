/**
 * Migration: reopen school years that were closed by a SEMESTER rollover.
 *
 * A semester rollover (same school year, e.g. 2026-2027 1st → 2026-2027 2nd)
 * closes a term, not the school year. Older builds marked the source year
 * `rolled_over`, which made the newly opened semester immutable and blocked
 * professors from entering grades (SCHOOL_YEAR_ROLLED_OVER).
 *
 * This migration:
 *   - finds SchoolYearState documents left in `rolled_over` by a same-year
 *     (semester) rollover,
 *   - returns them to `open` so the new semester stays writable and the year
 *     can be locked again for the next rollover,
 *   - preserves the batch id/counts and writes an AuditLog entry per year.
 *
 * It never touches a genuine school-year rollover (different target year) and
 * never changes enrollment records. Idempotent: safe to rerun.
 *
 * Usage:
 *   node migrations/normalizeSemesterRolloverState.js           → DRY RUN
 *   node migrations/normalizeSemesterRolloverState.js --apply   → APPLY
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });
const mongoose = require('mongoose');
const SchoolYearState = require('../models/SchoolYearState');
const AuditLog = require('../models/AuditLog');

const IS_APPLY = process.argv.includes('--apply');

// AuditLog.performedBy is an ObjectId reference. Scripts have no Admin
// account, so use the deterministic "system" id and label the role.
const SYSTEM_ACTOR_ID = new mongoose.Types.ObjectId('000000000000000000000000');

function isSemesterRollover(state) {
  if (!state) return false;
  if (state.rolloverMode === 'semester') return true;
  return Boolean(
    state.rolloverToSchoolYear
    && String(state.rolloverToSchoolYear).trim() === String(state.schoolYear || '').trim()
  );
}

async function ensureCorrectionAudit(state) {
  const existing = await AuditLog.findOne({
    resourceType: 'SYSTEM',
    resourceId: String(state.schoolYear),
    description: /Semester rollover state corrected/,
  }).lean();
  if (existing) return false;

  await AuditLog.create({
    action: 'UPDATE',
    resourceType: 'SYSTEM',
    resourceId: String(state.schoolYear),
    resourceName: `School Year ${state.schoolYear}`,
    description:
      `Semester rollover state corrected: SY ${state.schoolYear} reopened for its newly opened semester. ` +
      `A semester rollover closes a term, not the school year. Batch ${state.rolloverBatchId || 'n/a'} retained.`,
    performedBy: SYSTEM_ACTOR_ID,
    performedByRole: 'registrar',
    oldValue: { status: 'rolled_over' },
    newValue: { status: 'open', rolloverMode: 'semester' },
    status: 'SUCCESS',
    severity: 'HIGH',
  });
  return true;
}

async function run() {
  const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI;
  if (!mongoUri) {
    console.error('ERROR: MONGODB_URI not set in environment');
    process.exit(1);
  }

  await mongoose.connect(mongoUri);
  console.log('Connected to MongoDB');
  console.log(`Mode: ${IS_APPLY ? 'APPLY (writes enabled)' : 'DRY RUN (read-only)'}\n`);

  const states = await SchoolYearState.find({ status: 'rolled_over' }).lean();
  const affected = states.filter(isSemesterRollover);

  for (const state of affected) {
    console.log(
      `${state.schoolYear}: rolled_over → open (semester rollover, batch ${state.rolloverBatchId || 'n/a'})`
    );
  }

  if (!IS_APPLY) {
    console.log(`\nDRY RUN: ${affected.length} school year(s) would be reopened.`);
    if (affected.length > 0) {
      console.log('To apply, run: node migrations/normalizeSemesterRolloverState.js --apply');
    }
    await mongoose.disconnect();
    return;
  }

  let updated = 0;
  for (const state of affected) {
    const result = await SchoolYearState.updateOne(
      { _id: state._id, status: 'rolled_over' },
      {
        $set: {
          status: 'open',
          rolloverMode: 'semester',
          lockedBy: null,
          lockedAt: null,
          lockReason: null,
          unlockedBy: null,
          unlockedAt: null,
          unlockReason: null,
          validatedAt: null,
          activeValidationRunId: null,
          validationSummary: null,
          rolloverStartedBy: null,
          rolloverStartedAt: null,
          rolloverError: null,
          rolloverFailedAt: null,
        },
      }
    );
    if (result.modifiedCount === 0) continue;
    updated += 1;
  }

  // Ensure an audit entry exists for every corrected semester-rollover year,
  // including years corrected by an earlier run whose audit write failed.
  const corrected = await SchoolYearState.find({
    status: 'open',
    rolloverMode: 'semester',
    rolloverBatchId: { $ne: null },
  }).lean();
  let audited = 0;
  for (const state of corrected) {
    if (await ensureCorrectionAudit(state)) audited += 1;
  }

  console.log(`\nAPPLY complete: ${updated} school year(s) reopened, ${audited} audit entr${audited === 1 ? 'y' : 'ies'} written.`);
  await mongoose.disconnect();
}

run().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
