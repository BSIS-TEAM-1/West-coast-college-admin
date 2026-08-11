/**
 * Migration Script: Backfill new academic fields on Subject
 *
 * Purpose:
 *   Ensure every existing Subject document has values for the new fields
 *   introduced by the Subject/CurriculumSubject refactor:
 *     - subjectType (default: 'General Education')
 *     - lecturePeriods (default: 0)
 *     - labPeriods (default: 0)
 *     - status (derived from isActive)
 *     - prerequisiteSubjectIds (default: [])
 *
 * Safety:
 *   - Dry-run by default; use --apply to actually write changes
 *   - IDEMPOTENT: only sets fields that are currently missing/undefined, so
 *     running this multiple times (including after a partial/interrupted
 *     run) is safe — already-backfilled documents are left untouched.
 *   - Uses bulkWrite with per-document $set operations (not a blanket
 *     update), so it never overwrites a value an admin has already set.
 *   - Does NOT touch legacy course/yearLevel/semester fields.
 *   - Does NOT delete any data.
 *
 * Usage:
 *   node server/migrations/backfill-subject-academic-fields.js          # Dry run
 *   node server/migrations/backfill-subject-academic-fields.js --apply  # Apply changes
 */

const mongoose = require('mongoose');
const Subject = require('../models/Subject');

const MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI || 'mongodb://localhost:27017/wcc';

async function run() {
  const args = process.argv.slice(2);
  const shouldApply = args.includes('--apply');

  console.log('=== Subject Academic Fields Backfill ===');
  console.log(`Mode: ${shouldApply ? 'APPLY' : 'DRY RUN'}`);
  console.log(`MongoDB URI: ${MONGO_URI}`);
  console.log('');

  await mongoose.connect(MONGO_URI);
  console.log('Connected to MongoDB.\n');

  const subjects = await Subject.find({}).lean();
  console.log(`Found ${subjects.length} Subject documents.\n`);

  let toUpdate = 0;
  const bulkOps = [];

  for (const subject of subjects) {
    const set = {};

    if (subject.subjectType === undefined || subject.subjectType === null) {
      set.subjectType = 'General Education';
    }
    if (subject.lecturePeriods === undefined || subject.lecturePeriods === null) {
      set.lecturePeriods = 0;
    }
    if (subject.labPeriods === undefined || subject.labPeriods === null) {
      set.labPeriods = 0;
    }
    if (subject.status === undefined || subject.status === null) {
      set.status = subject.isActive === false ? 'Inactive' : 'Active';
    }
    if (subject.prerequisiteSubjectIds === undefined || subject.prerequisiteSubjectIds === null) {
      set.prerequisiteSubjectIds = [];
    }

    if (Object.keys(set).length > 0) {
      toUpdate++;
      bulkOps.push({
        updateOne: {
          filter: { _id: subject._id },
          update: { $set: set },
        },
      });
    }
  }

  console.log(`Subjects needing backfill: ${toUpdate}`);
  console.log(`Subjects already up to date (skipped): ${subjects.length - toUpdate}`);

  if (!shouldApply) {
    console.log('\nDry run — no changes applied. Use --apply to write changes.');
    await mongoose.disconnect();
    return;
  }

  let modified = 0;
  let errors = 0;
  if (bulkOps.length > 0) {
    try {
      const result = await Subject.bulkWrite(bulkOps, { ordered: false });
      modified = result.modifiedCount;
    } catch (err) {
      // With ordered: false, bulkWrite still applies all non-conflicting
      // ops and throws a BulkWriteError summarizing failures — surface the
      // partial result instead of losing all progress.
      modified = err.result?.modifiedCount ?? 0;
      errors = (err.writeErrors || []).length || bulkOps.length - modified;
      console.error(`Some backfill operations failed: ${err.message}`);
    }
  }

  console.log('');
  console.log('=== Apply Summary ===');
  console.log(`Subjects inspected: ${subjects.length}`);
  console.log(`Subjects updated: ${modified}`);
  console.log(`Records skipped (already up to date): ${subjects.length - toUpdate}`);
  console.log(`Errors: ${errors}`);

  await mongoose.disconnect();
  console.log('\nDone.');
}

run().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
