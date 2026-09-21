/**
 * Migration: Backfill missing Curriculum display names.
 *
 * Some curriculum records were saved with an empty/missing `name` (and no
 * `code`), which renders as "undefined <version>" in block/curriculum
 * selectors. New records default their name at creation and
 * updateCurriculum no longer accepts a blank name, so this is a one-time
 * repair for legacy rows.
 *
 * Sets: name = "<programName> Curriculum <version>"
 * Never touches: code, version, status, subjects, or any other field.
 * Idempotent: only matches records with missing/blank names.
 *
 * Usage:
 *   node migrations/backfillCurriculumNames.js           → DRY RUN (no writes)
 *   node migrations/backfillCurriculumNames.js --apply    → APPLY (writes)
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });
const mongoose = require('mongoose');
const Curriculum = require('../models/Curriculum');

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

  const nameless = await Curriculum.find({
    $or: [{ name: { $exists: false } }, { name: '' }, { name: null }],
  })
    .select('_id programCode programName version status name')
    .lean();

  const report = { inspected: nameless.length, repaired: 0, skipped: 0, errors: 0, details: [] };

  for (const curriculum of nameless) {
    const tag = `[${curriculum._id}]`;
    const programName = String(curriculum.programName || '').trim();
    const version = String(curriculum.version || '').trim();

    if (!programName || !version) {
      report.skipped++;
      report.details.push(
        `${tag} SKIP: cannot derive a name (programName="${programName || 'missing'}", version="${version || 'missing'}")`
      );
      continue;
    }

    const name = `${programName} Curriculum ${version}`;
    if (!IS_APPLY) {
      report.details.push(`${tag} WOULD SET name="${name}" (status=${curriculum.status || 'unknown'})`);
      continue;
    }

    try {
      await Curriculum.updateOne(
        { _id: curriculum._id, $or: [{ name: { $exists: false } }, { name: '' }, { name: null }] },
        { $set: { name } }
      );
      report.repaired++;
      report.details.push(`${tag} REPAIRED name="${name}"`);
    } catch (err) {
      report.errors++;
      report.details.push(`${tag} ERROR: ${err.message}`);
    }
  }

  console.log('═══════════════════════════════════════════════════');
  console.log('                 MIGRATION REPORT');
  console.log('═══════════════════════════════════════════════════');
  console.log(`Records with missing names:  ${report.inspected}`);
  console.log(`Records repaired:            ${report.repaired}`);
  console.log(`Records skipped:             ${report.skipped}`);
  console.log(`Errors:                      ${report.errors}`);
  console.log('═══════════════════════════════════════════════════');
  console.log('');
  console.log('DETAILS:');
  report.details.forEach((d) => console.log(`  ${d}`));
  console.log('');

  if (!IS_APPLY && report.inspected > report.skipped) {
    console.log('DRY RUN: rerun with --apply to write the repaired names.');
  } else if (IS_APPLY) {
    console.log('APPLY complete. Verify with: node migrations/backfillCurriculumNames.js');
  } else {
    console.log('No nameless curriculum records found.');
  }

  await mongoose.disconnect();
}

run().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
