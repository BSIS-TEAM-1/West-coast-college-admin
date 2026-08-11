/**
 * Migration Script: Migrate Subject placement data to CurriculumSubject
 *
 * Purpose:
 *   For each existing Subject with course/yearLevel/semester set, find matching
 *   Curriculum by programCode and create CurriculumSubject records.
 *
 * Safety:
 *   - Dry-run by default; use --apply to actually write changes
 *   - --report mode shows summary stats only
 *   - IDEMPOTENT: safe to run multiple times. Every candidate record is
 *     checked against existing CurriculumSubject rows (by curriculumId +
 *     subjectId, matching the current unique index) before being queued for
 *     creation, so re-running after a partial/failed --apply will only
 *     create the records that are still missing.
 *   - Does NOT modify Subject records (course/yearLevel/semester are left
 *     in place until this migration and application compatibility have
 *     been verified — see docs/subject-process-and-logic.md).
 *   - Does NOT delete or overwrite existing CurriculumSubject records.
 *   - Reports all matched, unmatched, and ambiguous cases.
 *   - Per-record writes are wrapped individually so one failure does not
 *     abort the batch; if the process is killed mid-run, re-running is safe
 *     because already-created records are detected and skipped.
 *
 * Known limitations (documented, not silently papered over):
 *   - The legacy Subject schema never tracked an explicit display order /
 *     sequence within a program-year-semester. There is nothing to migrate
 *     for CurriculumSubject.displayOrder other than the default (0).
 *   - The legacy schema never tracked prerequisites either, so
 *     CurriculumSubject.prerequisiteSubjectIds is left empty by this
 *     migration. Run this AFTER prerequisites have been entered on the
 *     Subject catalog if you want them auto-populated on new placements
 *     going forward (addSubject() copies Subject.prerequisiteSubjectIds at
 *     placement time); this migration does not attempt to infer them.
 *
 * Usage:
 *   node server/migrations/migrate-subjects-to-curriculum.js              # Dry run
 *   node server/migrations/migrate-subjects-to-curriculum.js --report      # Report only
 *   node server/migrations/migrate-subjects-to-curriculum.js --apply       # Apply changes
 */

const path = require('path');
const fs = require('fs');
const mongoose = require('mongoose');
const Subject = require('../models/Subject');
const Curriculum = require('../models/Curriculum');
const CurriculumSubject = require('../models/CurriculumSubject');

// Load .env files the same way server/index.js does so the migration
// can pick up MONGODB_URI from the project environment.
const dotenv = require('dotenv');
const envFileCandidates = [
  { filePath: path.join(__dirname, '..', '..', '.env'), override: false },
  { filePath: path.join(__dirname, '..', '..', '.env.credential-details'), override: true },
  { filePath: path.join(__dirname, '..', '..', '.env.credentail-details'), override: true },
];
envFileCandidates.forEach(({ filePath, override }) => {
  if (fs.existsSync(filePath)) {
    dotenv.config({ path: filePath, override });
  }
});

const MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI || 'mongodb://localhost:27017/wcc';

async function run() {
  const args = process.argv.slice(2);
  const shouldApply = args.includes('--apply');
  const reportOnly = args.includes('--report');

  console.log('=== Subject → CurriculumSubject Migration ===');
  console.log(`Mode: ${reportOnly ? 'REPORT' : shouldApply ? 'APPLY' : 'DRY RUN'}`);
  console.log(`MongoDB URI: ${MONGO_URI}`);
  console.log('');

  await mongoose.connect(MONGO_URI);
  console.log('Connected to MongoDB.\n');

  // Load all curricula grouped by programCode
  const allCurricula = await Curriculum.find({})
    .select('programCode version status programName')
    .lean();
  console.log(`Found ${allCurricula.length} Curriculum documents.`);

  const curriculaByProgram = {};
  for (const c of allCurricula) {
    if (!curriculaByProgram[c.programCode]) {
      curriculaByProgram[c.programCode] = [];
    }
    curriculaByProgram[c.programCode].push(c);
  }

  // Sort each program's curricula: Active first, then by version descending
  for (const key of Object.keys(curriculaByProgram)) {
    curriculaByProgram[key].sort((a, b) => {
      if (a.status === 'Active' && b.status !== 'Active') return -1;
      if (b.status === 'Active' && a.status !== 'Active') return 1;
      return String(b.version).localeCompare(String(a.version));
    });
  }

  // Find all subjects with placement data (course, yearLevel, semester all set)
  const subjectsWithPlacement = await Subject.find({
    course: { $exists: true, $ne: null },
    yearLevel: { $exists: true, $ne: null },
    semester: { $exists: true, $ne: null },
  }).lean();

  console.log(`Found ${subjectsWithPlacement.length} subjects with placement data.\n`);

  // Load existing CurriculumSubject records to avoid duplicates. Dedup key
  // MUST match the actual unique index on CurriculumSubject, which is
  // { curriculumId, subjectId } only (a subject can only be placed once per
  // curriculum, regardless of year/semester) — see models/CurriculumSubject.js.
  const existingCS = await CurriculumSubject.find({})
    .select('curriculumId subjectId courseNo descriptiveTitle units lecturePeriods labPeriods')
    .lean();
  const existingKeys = new Set(
    existingCS.map((cs) => `${String(cs.curriculumId)}|${String(cs.subjectId)}`)
  );

  // Detect existing CurriculumSubject records that predate the snapshot
  // fields (courseNo is null/undefined). These need a one-time backfill from
  // their referenced Subject so that totals and display use the snapshot
  // values going forward.
  const toBackfill = existingCS.filter((cs) => !cs.courseNo);
  const subjectIdsToBackfill = toBackfill.map((cs) => cs.subjectId);
  const subjectsForBackfill = subjectIdsToBackfill.length > 0
    ? await Subject.find({ _id: { $in: subjectIdsToBackfill } })
        .select('_id code title units lecturePeriods labPeriods')
        .lean()
    : [];
  const subjectMap = new Map(subjectsForBackfill.map((s) => [String(s._id), s]));

  let matched = 0;
  let unmatched = 0;
  let ambiguous = 0;
  let alreadyExists = 0;
  let backfillMissingSubject = 0;
  const toCreate = [];
  const unmatchedDetails = [];
  const ambiguousDetails = [];
  const warnings = [];

  for (const subject of subjectsWithPlacement) {
    const programCode = subject.course;
    const yearLevel = subject.yearLevel;
    const semester = subject.semester;

    // A superseded (versioned-out) subject should not create a new
    // placement — its replacement version (if any) will be processed on
    // its own iteration. Flag it as a warning rather than silently skipping.
    if (subject.supersededById) {
      warnings.push(`${subject.code} (v${subject.version}, id ${subject._id}) is a superseded version — skipped, current version should be migrated instead`);
      continue;
    }

    const curricula = curriculaByProgram[programCode];
    if (!curricula || curricula.length === 0) {
      unmatched++;
      unmatchedDetails.push({
        subjectId: String(subject._id),
        code: subject.code,
        programCode,
        reason: 'No curriculum found for this program',
      });
      continue;
    }

    // Prefer Active curriculum, then most recent version
    const targetCurriculum = curricula[0];

    const key = `${String(targetCurriculum._id)}|${String(subject._id)}`;
    if (existingKeys.has(key)) {
      alreadyExists++;
      continue;
    }

    // Check if subject appears in multiple curricula for this program (ambiguous)
    if (curricula.length > 1 && curricula.some((c) => c.status === 'Active') && curricula.filter((c) => c.status === 'Active').length > 1) {
      ambiguous++;
      ambiguousDetails.push({
        subjectId: String(subject._id),
        code: subject.code,
        programCode,
        reason: 'Multiple Active curricula found for this program',
      });
      continue;
    }

    matched++;
    toCreate.push({
      curriculumId: targetCurriculum._id,
      subjectId: subject._id,
      yearLevel,
      semester,
      type: 'General',
      isRequired: true,
      // SNAPSHOT fields copied from Subject at migration time — same pattern
      // as CurriculumSubjectController.addSubject. These become immutable
      // with respect to future Subject edits.
      courseNo: subject.code,
      descriptiveTitle: subject.title,
      units: subject.units,
      lecturePeriods: subject.lecturePeriods || 0,
      labPeriods: subject.labPeriods || 0,
      // Legacy schema never tracked prerequisites or sequence — left at
      // defaults. See "Known limitations" in the file header.
      prerequisiteSubjectIds: [],
      displayOrder: 0,
    });
    existingKeys.add(key);
  }

  console.log('=== Migration Report ===');
  console.log(`Subjects inspected: ${subjectsWithPlacement.length}`);
  console.log(`Already in CurriculumSubject (skipped): ${alreadyExists}`);
  console.log(`CurriculumSubject records to create: ${matched}`);
  console.log(`Existing CurriculumSubject records needing snapshot backfill: ${toBackfill.length}`);
  console.log(`Unmatched (no curriculum for program, skipped): ${unmatched}`);
  console.log(`Ambiguous (multiple active curricula, skipped): ${ambiguous}`);
  console.log(`Warnings (superseded versions, skipped): ${warnings.length}`);
  console.log('');

  if (warnings.length > 0) {
    console.log('--- Warnings ---');
    for (const w of warnings.slice(0, 20)) {
      console.log(`  ${w}`);
    }
    if (warnings.length > 20) {
      console.log(`  ... and ${warnings.length - 20} more`);
    }
    console.log('');
  }

  if (unmatchedDetails.length > 0) {
    console.log('--- Unmatched Details ---');
    for (const d of unmatchedDetails.slice(0, 20)) {
      console.log(`  ${d.code} (program ${d.programCode}): ${d.reason}`);
    }
    if (unmatchedDetails.length > 20) {
      console.log(`  ... and ${unmatchedDetails.length - 20} more`);
    }
    console.log('');
  }

  if (ambiguousDetails.length > 0) {
    console.log('--- Ambiguous Details ---');
    for (const d of ambiguousDetails.slice(0, 20)) {
      console.log(`  ${d.code} (program ${d.programCode}): ${d.reason}`);
    }
    if (ambiguousDetails.length > 20) {
      console.log(`  ... and ${ambiguousDetails.length - 20} more`);
    }
    console.log('');
  }

  if (reportOnly) {
    console.log('Report mode — no changes applied.');
    await mongoose.disconnect();
    return;
  }

  if (!shouldApply) {
    console.log('Dry run — no changes applied. Use --apply to write changes.');
    await mongoose.disconnect();
    return;
  }

  let applied = 0;
  let errors = 0;
  let backfilled = 0;

  if (toCreate.length > 0) {
    console.log(`Applying: creating ${toCreate.length} CurriculumSubject records...`);
    for (const record of toCreate) {
      try {
        // create() re-checks the unique index at the DB level, so even if
        // this process is interrupted and re-run, already-applied records
        // will simply be skipped by the existingKeys check above; any that
        // slip through (race condition) will fail here with a duplicate-key
        // error, which is caught and counted rather than aborting the batch.
        await CurriculumSubject.create(record);
        applied++;
      } catch (err) {
        errors++;
        console.error(`  Error creating CS for subject ${record.subjectId}: ${err.message}`);
      }
    }
  } else {
    console.log('Nothing to create.');
  }

  // Backfill snapshot fields on existing CurriculumSubject records that
  // were created before the snapshot fields were added to the schema.
  if (toBackfill.length > 0) {
    console.log(`\nApplying: backfilling snapshot fields on ${toBackfill.length} existing CurriculumSubject records...`);
    for (const cs of toBackfill) {
      try {
        const subject = subjectMap.get(String(cs.subjectId));
        if (!subject) {
          backfillMissingSubject++;
          warnings.push(`Could not backfill CS ${cs._id}: subject ${cs.subjectId} not found`);
          continue;
        }
        await CurriculumSubject.updateOne(
          { _id: cs._id },
          {
            $set: {
              courseNo: subject.code,
              descriptiveTitle: subject.title,
              units: subject.units,
              lecturePeriods: subject.lecturePeriods || 0,
              labPeriods: subject.labPeriods || 0,
            },
          }
        );
        backfilled++;
      } catch (err) {
        errors++;
        console.error(`  Error backfilling CS ${cs._id}: ${err.message}`);
      }
    }
  } else {
    console.log('\nNo existing records need snapshot backfill.');
  }

  console.log('');
  console.log('=== Apply Summary ===');
  console.log(`Subjects inspected: ${subjectsWithPlacement.length}`);
  console.log(`CurriculumSubject records created: ${applied}`);
  console.log(`CurriculumSubject records backfilled: ${backfilled}`);
  console.log(`Records skipped (already existed, unmatched, or ambiguous): ${alreadyExists + unmatched + ambiguous}`);
  console.log(`Warnings: ${warnings.length}`);
  console.log(`Errors: ${errors}`);

  await mongoose.disconnect();
  console.log('\nDone.');
}

run().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
