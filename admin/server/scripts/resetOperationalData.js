/**
 * resetOperationalData.js
 *
 * Resets the database for a clean school year while preserving the things a
 * registrar still needs:
 *
 *   KEEPS : admin/staff logins, reference data (regions, cities, barangays,
 *           schools), curriculum configuration (curriculums, curriculum
 *           subjects, subjects, transmutation tables) and system settings.
 *
 *   WIPES : all student/user operational data (students, applicants,
 *           enrollments, blocks, grades, evaluations, documents, audits,
 *           archives, tokens, counters, backups of the old data).
 *
 *   SETS  : the active academic term to SY 2026-2027 / 1st semester and
 *           rebuilds AcademicPeriod for that school year.
 *
 * Safety:
 *   - Runs as a dry-run unless `--apply` is passed.
 *   - On --apply, every document that is about to be deleted is written to a
 *     local JSON file first (outside the repo).
 *
 * Usage:
 *   node scripts/resetOperationalData.js            # dry run
 *   node scripts/resetOperationalData.js --apply    # execute
 */
const path = require('path');
const fs = require('fs');
const os = require('os');
const dotenv = require('dotenv');
const mongoose = require('mongoose');

for (const file of ['.env', '.env.credential-details', '.env.credentail-details']) {
  const fullPath = path.join(__dirname, '..', '..', file);
  if (fs.existsSync(fullPath)) {
    dotenv.config({ path: fullPath, override: file !== '.env' });
  }
}

const APPLY = process.argv.includes('--apply');
const SCHOOL_YEAR = '2026-2027';
const SEMESTER = '1st';

// Deliberately explicit: anything not listed here is left untouched.
const WIPE_COLLECTIONS = [
  'students',
  'applicants',
  'enrollments',
  'studentblockassignments',
  'blockgroups',
  'blocksections',
  'blocksubjectassignments',
  'blockactionlogs',
  'gradeauditlogs',
  'gradechangerequests',
  'evaluationcompletions',
  'evaluationresponses',
  'evaluationperiods',
  'evaluationidentityreveallogs',
  'announcements',
  'documents',
  'documentfolders',
  'documentversions',
  'archivesnapshots',
  'rolloverbatches',
  'auditlogs',
  'authtokens',
  'backupverificationreports',
  'backups',
  'securityscans',
  'blockedips',
  'counters',
];

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function backupDirectory() {
  const base = process.env.WCC_RESET_BACKUP_DIR
    || path.join(os.tmpdir(), 'opencode', 'wcc-reset-backups');
  return path.join(base, `reset-${timestamp()}`);
}

async function main() {
  if (!process.env.MONGODB_URI) {
    throw new Error('MONGODB_URI is not set');
  }

  await mongoose.connect(process.env.MONGODB_URI);
  const db = mongoose.connection.db;

  console.log(`Mode: ${APPLY ? 'APPLY (destructive)' : 'DRY RUN'}`);
  console.log(`Target: ${mongoose.connection.name}`);

  const existing = new Set((await db.listCollections().toArray()).map((c) => c.name));
  const toWipe = WIPE_COLLECTIONS.filter((name) => existing.has(name));

  const counts = {};
  for (const name of toWipe) {
    counts[name] = await db.collection(name).countDocuments();
  }

  console.log('\nCollections to wipe:');
  for (const name of toWipe) {
    console.log(`  - ${name.padEnd(32)} ${counts[name]}`);
  }
  console.log(`\nTotal documents: ${Object.values(counts).reduce((a, b) => a + b, 0)}`);
  console.log('\nPreserved: admins, regions/cities/barangays/provinces, schools,');
  console.log('           subjects, curriculums, curriculumsubjects, transmutationtables,');
  console.log('           systemsettings (academicTerm will be updated).');

  if (!APPLY) {
    console.log('\nDry run complete. Re-run with --apply to delete the data above.');
    return;
  }

  const dir = backupDirectory();
  fs.mkdirSync(dir, { recursive: true });
  console.log(`\nBacking up wiped collections to ${dir}`);

  for (const name of toWipe) {
    const docs = await db.collection(name).find({}).toArray();
    fs.writeFileSync(path.join(dir, `${name}.json`), JSON.stringify(docs, null, 2));
  }
  fs.writeFileSync(
    path.join(dir, 'manifest.json'),
    JSON.stringify({ createdAt: new Date().toISOString(), schoolYear: SCHOOL_YEAR, counts }, null, 2)
  );
  console.log('Backup complete.');

  console.log('\nDeleting operational data...');
  for (const name of toWipe) {
    const result = await db.collection(name).deleteMany({});
    console.log(`  - ${name.padEnd(32)} deleted ${result.deletedCount}`);
  }

  console.log('\nUpdating active academic term...');
  await db.collection('systemsettings').updateOne(
    { key: 'academicTerm' },
    {
      $set: {
        value: { schoolYear: SCHOOL_YEAR, semester: SEMESTER },
        updatedAt: new Date(),
      },
      $setOnInsert: { createdAt: new Date(), __v: 0 },
    },
    { upsert: true }
  );

  const firstAdmin = await db.collection('admins').findOne({}, { projection: { _id: 1 } });
  const createdBy = firstAdmin ? firstAdmin._id : undefined;

  console.log('Rebuilding academic periods...');
  await db.collection('academicperiods').deleteMany({});
  await db.collection('academicperiods').insertMany([
    {
      schoolYear: SCHOOL_YEAR,
      term: '1st',
      termType: 'Semester',
      startDate: new Date('2026-08-03T00:00:00.000Z'),
      endDate: new Date('2026-12-18T00:00:00.000Z'),
      status: 'Active',
      archivedAt: null,
      archivedBy: null,
      createdBy,
      createdAt: new Date(),
      updatedAt: new Date(),
      __v: 0,
    },
    {
      schoolYear: SCHOOL_YEAR,
      term: '2nd',
      termType: 'Semester',
      startDate: new Date('2027-01-11T00:00:00.000Z'),
      endDate: new Date('2027-05-28T00:00:00.000Z'),
      status: 'Upcoming',
      archivedAt: null,
      archivedBy: null,
      createdBy,
      createdAt: new Date(),
      updatedAt: new Date(),
      __v: 0,
    },
  ]);

  console.log(`\nDone. Active academic term is now ${SCHOOL_YEAR} ${SEMESTER}.`);
  console.log(`Backup retained at: ${dir}`);
}

main()
  .catch((error) => {
    console.error('\nReset failed:', error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect().catch(() => {});
  });
