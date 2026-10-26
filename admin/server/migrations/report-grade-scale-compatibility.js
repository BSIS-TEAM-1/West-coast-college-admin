/**
 * READ-ONLY: grade-scale compatibility report.
 *
 * The grading scale moved from quarter-point steps (1.00, 1.25 …) to a
 * configurable decimal scale (1.0, 1.1, 1.2 …). Existing records are NOT
 * rewritten: this script simply lists every distinct stored grade value so the
 * registrar can see which values sit on the configured scale and which are
 * legacy values that remain readable as-is.
 *
 * No documents are modified. Safe to run at any time.
 *
 * Usage: node server/migrations/report-grade-scale-compatibility.js [--json]
 */

const path = require('path');
const fs = require('fs');
const mongoose = require('mongoose');
const Enrollment = require('../models/Enrollment');
const Student = require('../models/Student');
const gradingScaleService = require('../services/gradingScaleService');

const dotenv = require('dotenv');
const envFileCandidates = [
  { filePath: path.join(__dirname, '..', '..', '.env'), override: false },
  { filePath: path.join(__dirname, '..', '..', '.env.credential-details'), override: true },
  { filePath: path.join(__dirname, '..', '..', '.env.credentail-details'), override: true }
];
envFileCandidates.forEach(({ filePath, override }) => {
  if (fs.existsSync(filePath)) {
    dotenv.config({ path: filePath, override });
  }
});

const MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI || 'mongodb://localhost:27017/wcc';

async function distinctGrades(model, fieldPath) {
  const rows = await model.aggregate([
    { $unwind: fieldPath },
    { $match: { [fieldPath.replace('$', '')]: { $type: 'number' } } },
    { $group: { _id: fieldPath.replace('$', ''), count: { $sum: 1 } } },
    { $sort: { _id: 1 } }
  ]);
  return rows.map((row) => ({ value: Number(row._id), count: row.count }));
}

async function run() {
  const jsonOutput = process.argv.includes('--json');

  await mongoose.connect(MONGO_URI);
  const scale = await gradingScaleService.loadGradeScale({ fresh: true });

  const enrollmentGrades = await distinctGrades(Enrollment, '$subjects.grade');
  const studentGrades = await Student.find({ latestGrade: { $type: 'number' } })
    .select('latestGrade')
    .lean();
  const studentCounts = new Map();
  for (const student of studentGrades) {
    const key = Number(student.latestGrade);
    studentCounts.set(key, (studentCounts.get(key) || 0) + 1);
  }

  const classify = (rows) =>
    rows.map((row) => ({
      ...row,
      display: gradingScaleService.formatGrade(row.value, scale),
      onScale: gradingScaleService.isOnScale(row.value, scale),
      passing: gradingScaleService.isPassingGrade(row.value, scale)
    }));

  const enrollmentReport = classify(enrollmentGrades);
  const studentReport = classify(
    [...studentCounts.entries()].map(([value, count]) => ({ value, count })).sort((a, b) => a.value - b.value)
  );

  const summarize = (rows) => ({
    totalRecords: rows.reduce((sum, row) => sum + row.count, 0),
    onScaleRecords: rows.filter((row) => row.onScale).reduce((sum, row) => sum + row.count, 0),
    legacyRecords: rows.filter((row) => !row.onScale).reduce((sum, row) => sum + row.count, 0),
    distinctValues: rows.length,
    legacyValues: rows.filter((row) => !row.onScale).map((row) => row.display)
  });

  const report = {
    scale,
    scaleDescription: gradingScaleService.describeScale(scale),
    enrollments: { summary: summarize(enrollmentReport), values: enrollmentReport },
    students: { summary: summarize(studentReport), values: studentReport },
    note: 'Read-only report. No grade values were changed; legacy values keep displaying with two decimals.'
  };

  if (jsonOutput) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log('=== Grade Scale Compatibility Report (read-only) ===');
    console.log(`Configured scale: ${gradingScaleService.describeScale(scale)}`);
    console.log(`Passing grade: ${gradingScaleService.formatGrade(scale.passingGrade, scale)}`);
    console.log('');

    for (const [label, section] of [['Enrollment subject grades', report.enrollments], ['Student latestGrade', report.students]]) {
      console.log(`--- ${label} ---`);
      console.log(`Records with a numeric grade: ${section.summary.totalRecords}`);
      console.log(`On the configured scale: ${section.summary.onScaleRecords}`);
      console.log(`Legacy / off-scale: ${section.summary.legacyRecords}`);
      if (section.summary.legacyValues.length > 0) {
        console.log(`Legacy values (kept as stored): ${section.summary.legacyValues.join(', ')}`);
      }
      for (const row of section.values) {
        console.log(`  ${row.display.padStart(6)}  ${row.onScale ? 'on-scale' : 'legacy  '}  ${String(row.count).padStart(6)} record(s)`);
      }
      console.log('');
    }

    console.log(report.note);
  }

  await mongoose.disconnect();
}

run().catch(async (error) => {
  console.error('Grade scale report failed:', error);
  try {
    await mongoose.disconnect();
  } catch {
    /* ignore */
  }
  process.exit(1);
});
