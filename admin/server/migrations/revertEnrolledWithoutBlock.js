/**
 * Migration: Revert invalid ENROLLED states without a block assignment.
 *
 * Data-integrity rule (see services/enrollmentGuard.js):
 *   A student must NOT be officially ENROLLED unless a valid block assignment
 *   exists for the same school year, semester, course/program, and year level.
 *
 * Finds students where lifecycleStatus="Enrolled" but no valid matching
 * StudentBlockAssignment exists, and moves them back to the non-final
 * "Pending" state (the existing equivalent of BLOCK_PENDING).
 *
 * This migration:
 *   - NEVER creates block assignments (no fake assignments).
 *   - NEVER touches students that already have a valid assignment.
 *   - NEVER mutates locked/historical enrollment records.
 *   - Writes one AuditLog entry per reverted student (audit trail with reasons).
 *   - Is idempotent (safe to rerun; reverted students no longer match).
 *
 * Usage:
 *   node migrations/revertEnrolledWithoutBlock.js           → DRY RUN (no writes)
 *   node migrations/revertEnrolledWithoutBlock.js --apply    → APPLY (writes)
 *
 * After applying, assign blocks to the reverted students via the normal
 * block-assignment flow, which finalizes them back to ENROLLED atomically.
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });
const mongoose = require('mongoose');
const Student = require('../models/Student');
const AuditLog = require('../models/AuditLog');
const enrollmentGuard = require('../services/enrollmentGuard');

const IS_APPLY = process.argv.includes('--apply');

async function run() {
  const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI;
  if (!mongoUri) {
    console.error('ERROR: MONGODB_URI not set in environment');
    process.exit(1);
  }

  await mongoose.connect(mongoUri);
  console.log('Connected to MongoDB');
  console.log(`Mode: ${IS_APPLY ? 'APPLY (writes enabled)' : 'DRY RUN (read-only)'}\n`);

  const enrolledStudents = await Student.find({ lifecycleStatus: 'Enrolled' })
    .select('_id studentNumber course yearLevel semester schoolYear firstName lastName')
    .lean();

  const report = {
    inspected: enrolledStudents.length,
    consistent: 0,
    inconsistent: 0,
    reverted: 0,
    errors: 0,
    details: [],
  };

  for (const student of enrolledStudents) {
    const tag = `[${student.studentNumber || student._id}]`;
    const name = `${student.lastName || ''}, ${student.firstName || ''}`.trim();

    let match;
    try {
      match = await enrollmentGuard.findValidBlockAssignment(student);
    } catch (err) {
      report.errors++;
      report.details.push(`${tag} ERROR during block check: ${err.message}`);
      continue;
    }

    if (match.assignment) {
      report.consistent++;
      continue;
    }

    const reason = match.reasons[0] || 'No valid block assignment';
    report.inconsistent++;

    if (!IS_APPLY) {
      report.details.push(`${tag} ${name} WOULD REVERT Enrolled → Pending (${reason})`);
      continue;
    }

    try {
      await Student.updateOne(
        { _id: student._id, lifecycleStatus: 'Enrolled' },
        { $set: { lifecycleStatus: 'Pending', lastUpdated: new Date() } }
      );
      await AuditLog.create({
        action: 'UPDATE',
        resourceType: 'STUDENT',
        resourceId: String(student._id),
        resourceName: `${student.studentNumber || student._id} — ${name || 'Unknown'}`,
        description:
          `Enrollment consistency remediation: lifecycle reverted Enrolled → Pending. ` +
          `Reason: ${reason}. No block assignment was created; assign a block to finalize enrollment.`,
        performedBy: 'system-script',
        performedByRole: 'registrar',
        oldValue: { lifecycleStatus: 'Enrolled' },
        newValue: { lifecycleStatus: 'Pending' },
        status: 'SUCCESS',
        severity: 'HIGH',
      });
      report.reverted++;
      report.details.push(`${tag} ${name} REVERTED Enrolled → Pending (${reason})`);
    } catch (err) {
      report.errors++;
      report.details.push(`${tag} ERROR: ${err.message}`);
    }
  }

  console.log('═══════════════════════════════════════════════════');
  console.log('                 MIGRATION REPORT');
  console.log('═══════════════════════════════════════════════════');
  console.log(`Students inspected (Enrolled):     ${report.inspected}`);
  console.log(`Consistent (valid assignment):     ${report.consistent}`);
  console.log(`Inconsistent (no valid block):     ${report.inconsistent}`);
  console.log(`Students reverted to Pending:      ${report.reverted}`);
  console.log(`Errors:                            ${report.errors}`);
  console.log('═══════════════════════════════════════════════════');
  console.log('');
  console.log('DETAILS:');
  report.details.forEach((d) => console.log(`  ${d}`));
  console.log('');

  if (!IS_APPLY && report.inconsistent > 0) {
    console.log(`DRY RUN: ${report.inconsistent} student(s) would be reverted to Pending.`);
    console.log('To apply, run: node migrations/revertEnrolledWithoutBlock.js --apply');
  } else if (IS_APPLY) {
    console.log(`APPLY complete: ${report.reverted} student(s) reverted to Pending with audit entries.`);
  } else {
    console.log('No inconsistent ENROLLED records found.');
  }

  await mongoose.disconnect();
}

run().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
