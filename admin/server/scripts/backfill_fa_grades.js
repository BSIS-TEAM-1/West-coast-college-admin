/**
 * Backfill the numeric equivalent of FA (Failure due to Absences).
 *
 * CHED records FA as 5.0. New professor saves already write both the mark and
 * the numeric grade, but records created before that rule can still carry
 * `gradeMark: 'FA'` with a null numeric grade. Those rows are invisible to
 * GWA and transcript calculations, so this script normalises them to 5.0.
 *
 * Usage (from admin/server):
 *   node scripts/backfill_fa_grades.js            # dry run, prints the plan
 *   node scripts/backfill_fa_grades.js --apply    # write the changes
 *
 * Locked (rolled-over) enrollments are included: this is a one-off data
 * correction, not a normal grade edit.
 */

const path = require('path');
const fs = require('fs');
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

const mongoose = require('mongoose');
const Enrollment = require('../models/Enrollment');
const gradingScaleService = require('../services/gradingScaleService');

const APPLY = process.argv.includes('--apply');
const MONGODB_URI = process.env.MONGODB_URI;

function numericGrade(value) {
  if (value === null || value === undefined || String(value).trim() === '') return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function isFaMark(value) {
  return gradingScaleService.normalizeGradeMark(value) === 'FA';
}

async function main() {
  if (!MONGODB_URI) {
    throw new Error('MONGODB_URI is not set. Add it to admin/.env or the environment.');
  }

  await mongoose.connect(MONGODB_URI);
  console.log(`Connected to ${mongoose.connection.name}`);

  const enrollments = await Enrollment.find({ 'subjects.gradeMark': { $in: ['FA', 'fa', 'Fa', 'fA'] } })
    .select('studentNumber schoolYear semester lockedAt subjects')
    .lean();

  const candidates = [];
  for (const enrollment of enrollments) {
    for (const subject of enrollment.subjects || []) {
      if (!isFaMark(subject.gradeMark)) continue;
      if (numericGrade(subject.grade) === gradingScaleService.CHED_FAILING_GRADE) continue;
      candidates.push({
        enrollmentId: enrollment._id,
        studentNumber: enrollment.studentNumber,
        term: `${enrollment.schoolYear || '-'} ${enrollment.semester || '-'}`,
        locked: Boolean(enrollment.lockedAt),
        code: subject.code,
        title: subject.title,
        previousGrade: subject.grade,
      });
    }
  }

  console.log(`FA entries found: ${enrollments.reduce((count, enrollment) => (
    count + (enrollment.subjects || []).filter((subject) => isFaMark(subject.gradeMark)).length
  ), 0)}`);
  console.log(`FA entries needing 5.0: ${candidates.length}`);
  console.log(`  unlocked: ${candidates.filter((row) => !row.locked).length}`);
  console.log(`  locked:   ${candidates.filter((row) => row.locked).length}`);

  candidates.forEach((row) => {
    console.log(
      `  ${row.studentNumber} | ${row.term} | ${row.code} ${row.title || ''} | `
      + `grade ${row.previousGrade ?? 'null'} -> 5 | ${row.locked ? 'locked' : 'unlocked'}`
    );
  });

  if (!APPLY) {
    console.log('\nDry run only. Re-run with --apply to write these changes.');
    await mongoose.disconnect();
    return;
  }

  if (candidates.length === 0) {
    console.log('\nNothing to update.');
    await mongoose.disconnect();
    return;
  }

  const result = await Enrollment.updateMany(
    {
      subjects: {
        $elemMatch: {
          gradeMark: { $in: ['FA', 'fa', 'Fa', 'fA'] },
          grade: { $ne: gradingScaleService.CHED_FAILING_GRADE },
        },
      },
    },
    { $set: { 'subjects.$[entry].grade': gradingScaleService.CHED_FAILING_GRADE } },
    {
      arrayFilters: [
        {
          'entry.gradeMark': { $in: ['FA', 'fa', 'Fa', 'fA'] },
          'entry.grade': { $ne: gradingScaleService.CHED_FAILING_GRADE },
        },
      ],
      allowLocked: true,
    }
  );

  console.log(`\nUpdated ${result.modifiedCount} enrollment(s).`);
  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error(error.message);
  try {
    await mongoose.disconnect();
  } catch {
    // ignore disconnect errors
  }
  process.exit(1);
});
