/**
 * Reconcile students dismissed by the defective academic-deficiency counter.
 *
 * The fixed evaluator counts DISTINCT unresolved failed subjects (a passed
 * retake clears the subject). Students dismissed by the old implementation may
 * no longer meet the configured threshold; this script reports them first and
 * restores them only when asked to.
 *
 * Usage:
 *   node scripts/reconcileLifecycleDismissals.js                     → DRY RUN (read-only)
 *   node scripts/reconcileLifecycleDismissals.js --limit 25          → DRY RUN, first 25 students
 *   node scripts/reconcileLifecycleDismissals.js --execute --actor <adminObjectId>
 *
 * --execute requires --actor so every restoration is attributable in the audit
 * trail. Nothing is deleted: the original dismissal event stays in each
 * student's history, and a restoration event is appended after it.
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });

const mongoose = require('mongoose');
const {
  reconcileAcademicDismissals,
  formatReconciliationReport
} = require('../services/lifecycleReconciliationService');

const args = process.argv.slice(2);

function readFlagValue(flag) {
  const index = args.indexOf(flag);
  if (index === -1) return null;
  const value = args[index + 1];
  return value && !value.startsWith('--') ? value : null;
}

const EXECUTE = args.includes('--execute');
const ACTOR_ID = readFlagValue('--actor');
const LIMIT = Number(readFlagValue('--limit') || 0) || 0;

async function run() {
  if (EXECUTE && !ACTOR_ID) {
    console.error('ERROR: --execute requires --actor <adminObjectId> so the restorations are auditable.');
    process.exit(1);
  }
  if (EXECUTE && !mongoose.Types.ObjectId.isValid(ACTOR_ID)) {
    console.error(`ERROR: --actor "${ACTOR_ID}" is not a valid ObjectId.`);
    process.exit(1);
  }

  const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI;
  if (!mongoUri) {
    console.error('ERROR: MONGODB_URI is not set in the environment.');
    process.exit(1);
  }

  await mongoose.connect(mongoUri);
  console.log('Connected to MongoDB');

  try {
    const report = await reconcileAcademicDismissals({
      dryRun: !EXECUTE,
      actorId: ACTOR_ID,
      accountType: 'admin',
      limit: LIMIT
    });

    console.log(formatReconciliationReport(report));

    if (!report.dryRun) {
      console.log('');
      console.log(`Run audit recorded: ${report.auditLogged ? 'yes' : 'no'}`);
    }
    if (report.errors.length > 0) process.exitCode = 1;
  } finally {
    await mongoose.connection.close();
  }
}

run().catch(async (error) => {
  console.error('Reconciliation failed:', error);
  try {
    await mongoose.connection.close();
  } catch (_error) {
    // The connection may never have opened.
  }
  process.exit(1);
});
