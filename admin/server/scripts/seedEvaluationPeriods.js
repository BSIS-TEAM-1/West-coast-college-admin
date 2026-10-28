/**
 * seedEvaluationPeriods.js
 *
 * Ensures the per-semester evaluation periods exist for SY 2026-2027:
 *   - 1st Semester: active/open now
 *   - 2nd Semester: scheduled/upcoming
 *
 * Usage:
 *   node scripts/seedEvaluationPeriods.js            # preview
 *   node scripts/seedEvaluationPeriods.js --apply    # replace periods (refuses if responses exist)
 *   node scripts/seedEvaluationPeriods.js --apply --force
 */
const path = require('path');
const fs = require('fs');
const dotenv = require('dotenv');
const mongoose = require('mongoose');
const EvaluationPeriod = require('../models/EvaluationPeriod');
const EvaluationResponse = require('../models/EvaluationResponse');

for (const file of ['.env', '.env.credential-details', '.env.credentail-details']) {
  const fullPath = path.join(__dirname, '..', '..', file);
  if (fs.existsSync(fullPath)) {
    dotenv.config({ path: fullPath, override: file !== '.env' });
  }
}

const APPLY = process.argv.includes('--apply');
const FORCE = process.argv.includes('--force');
const SCHOOL_YEAR = '2026-2027';

const localDateStr = (date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

const now = new Date();
const activeStartDate = localDateStr(new Date(now.getTime() - 24 * 60 * 60 * 1000));
const activeEndDate = localDateStr(new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000));
const activeStart = new Date(`${activeStartDate}T08:00:00`);
const activeEnd = new Date(`${activeEndDate}T23:59:00`);

const PERIODS = [
  {
    title: `1st Semester ${SCHOOL_YEAR} Professor Evaluation`,
    semester: '1st',
    schoolYear: SCHOOL_YEAR,
    startDate: activeStartDate,
    startTime: '08:00',
    startAt: activeStart,
    deadlineDate: activeEndDate,
    closingTime: '23:59',
    endAt: activeEnd,
    status: 'open',
    manualState: 'started',
    applicablePrograms: ['All Programs'],
    applicableSubjects: 'All Evaluated Subjects',
    applicableProfessors: 'All Assigned Faculty',
    description: 'Official 1st semester faculty teaching effectiveness evaluation period.',
  },
  {
    title: `2nd Semester ${SCHOOL_YEAR} Professor Evaluation`,
    semester: '2nd',
    schoolYear: SCHOOL_YEAR,
    startDate: '2027-01-04',
    startTime: '08:00',
    startAt: new Date('2027-01-04T08:00:00'),
    deadlineDate: '2027-01-31',
    closingTime: '23:59',
    endAt: new Date('2027-01-31T23:59:00'),
    status: 'scheduled',
    manualState: 'auto',
    applicablePrograms: ['All Programs'],
    applicableSubjects: 'All Evaluated Subjects',
    applicableProfessors: 'All Assigned Faculty',
    description: 'Official 2nd semester faculty teaching effectiveness evaluation period.',
  },
];

async function main() {
  if (!process.env.MONGODB_URI) {
    throw new Error('MONGODB_URI is not set');
  }

  await mongoose.connect(process.env.MONGODB_URI);

  console.log(`Mode: ${APPLY ? 'APPLY' : 'DRY RUN'}`);
  console.log(`School year: ${SCHOOL_YEAR}`);

  for (const period of PERIODS) {
    const summary = `  - ${period.semester} Semester: ${period.startDate} ${period.startTime} → ${period.deadlineDate} ${period.closingTime} [${period.status}]`;
    console.log(summary);
  }

  if (APPLY) {
    const responseCount = await EvaluationResponse.countDocuments({ schoolYear: SCHOOL_YEAR });
    if (responseCount > 0 && !FORCE) {
      throw new Error(
        `${responseCount} evaluation response(s) already exist for ${SCHOOL_YEAR}. ` +
        'Replacing periods would orphan them. Re-run with --force only after backing up.'
      );
    }

    // Keep exactly the two configured per-semester periods for this school year.
    const removed = await EvaluationPeriod.deleteMany({ schoolYear: SCHOOL_YEAR });
    await EvaluationPeriod.insertMany(PERIODS);
    console.log(`\nRemoved ${removed.deletedCount} existing ${SCHOOL_YEAR} period(s) and inserted 2.`);
    const total = await EvaluationPeriod.countDocuments({ schoolYear: SCHOOL_YEAR });
    console.log(`Done. ${SCHOOL_YEAR} evaluation periods in database: ${total}`);
  } else {
    const responseCount = await EvaluationResponse.countDocuments({ schoolYear: SCHOOL_YEAR });
    console.log(`\nExisting responses for ${SCHOOL_YEAR}: ${responseCount}`);
    console.log('Dry run complete. Re-run with --apply to replace the periods.');
  }
}

main()
  .catch((error) => {
    console.error('\nSeed failed:', error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect().catch(() => {});
  });
