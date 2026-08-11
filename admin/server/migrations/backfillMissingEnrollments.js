/**
 * Migration: Backfill missing Enrollment records.
 *
 * Finds students with lifecycleStatus="Enrolled" who lack an Enrollment
 * record for their current academic period and creates one.
 *
 * Usage:
 *   node migrations/backfillMissingEnrollments.js           → DRY RUN (no writes)
 *   node migrations/backfillMissingEnrollments.js --apply    → APPLY (writes)
 *
 * The migration is:
 *   - idempotent (safe to rerun)
 *   - duplicate-resistant (checks before creating)
 *   - read-only during dry-run
 *   - explicit during apply
 *   - never mutates locked/historical records
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });
const mongoose = require('mongoose');
const Student = require('../models/Student');
const Enrollment = require('../models/Enrollment');
const Curriculum = require('../models/Curriculum');
const { getEnrollmentCourseCode, normalizeCourseCode } = require('../lib/programMapping');

const IS_APPLY = process.argv.includes('--apply');

async function run() {
  const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI;
  if (!mongoUri) {
    console.error('ERROR: MONGODB_URI not set in environment');
    process.exit(1);
  }

  await mongoose.connect(mongoUri);
  console.log(`Connected to MongoDB`);
  console.log(`Mode: ${IS_APPLY ? 'APPLY (writes enabled)' : 'DRY RUN (read-only)'}\n`);

  const enrolledStudents = await Student.find({
    lifecycleStatus: 'Enrolled',
  }).select('_id studentNumber course yearLevel semester schoolYear curriculumVersion firstName lastName').lean();

  // ─── Report counters ───
  const report = {
    inspected: enrolledStudents.length,
    eligibleForBackfill: 0,
    enrollmentsAlreadyPresent: 0,
    wouldCreate: 0,
    created: 0,
    skipped: 0,
    noValidCurriculum: 0,
    ambiguousCurriculum: 0,
    invalidOrMissingCourse: 0,
    missingSchoolYear: 0,
    missingSemester: 0,
    errors: 0,
    warnings: 0,
    details: [],
  };

  for (const student of enrolledStudents) {
    const tag = `[${student.studentNumber || student._id}]`;

    // ─── Validate schoolYear ───
    const schoolYear = student.schoolYear;
    if (!schoolYear || !/^\d{4}-\d{4}$/.test(schoolYear)) {
      report.missingSchoolYear++;
      report.details.push(`${tag} SKIP: invalid/missing schoolYear "${schoolYear}"`);
      continue;
    }

    // ─── Validate semester ───
    const semester = student.semester || '1st';
    if (!['1st', '2nd', 'Summer'].includes(semester)) {
      report.missingSemester++;
      report.details.push(`${tag} SKIP: invalid semester "${semester}"`);
      continue;
    }

    // ─── Validate course/program ───
    const programCode = normalizeCourseCode(student.course);
    if (!programCode) {
      report.invalidOrMissingCourse++;
      report.details.push(`${tag} SKIP: invalid/missing course "${student.course}"`);
      continue;
    }

    const enrollmentCourse = getEnrollmentCourseCode(programCode);
    if (!enrollmentCourse) {
      report.invalidOrMissingCourse++;
      report.details.push(`${tag} SKIP: cannot map program ${programCode} to Enrollment course enum`);
      continue;
    }

    // ─── Check for existing enrollment ───
    const existing = await Enrollment.findOne({
      studentId: student._id,
      schoolYear,
      semester,
    }).lean();

    if (existing) {
      report.enrollmentsAlreadyPresent++;
      if (existing.lockedAt) {
        report.details.push(`${tag} EXISTS (locked/historical — will not modify)`);
      }
      continue;
    }

    // ─── Resolve curriculum ───
    let curriculumId = null;
    let curriculumSource = null;

    // Try Student.curriculumVersion first
    if (student.curriculumVersion && String(student.curriculumVersion).trim()) {
      const matched = await Curriculum.findOne({
        programCode: Number(programCode),
        version: String(student.curriculumVersion).trim(),
      }).select('_id').lean();
      if (matched) {
        curriculumId = matched._id;
        curriculumSource = `version="${student.curriculumVersion}"`;
      }
    }

    // Fall back to Active curriculum
    if (!curriculumId) {
      const active = await Curriculum.findOne({
        programCode: Number(programCode),
        status: 'Active',
      }).select('_id').lean();
      if (active) {
        curriculumId = active._id;
        curriculumSource = 'active';
      }
    }

    if (!curriculumId) {
      report.noValidCurriculum++;
      report.details.push(`${tag} SKIP: no curriculum found for program ${programCode} (version="${student.curriculumVersion || 'none'}", no Active curriculum)`);
      continue;
    }

    // ─── Check for ambiguous curriculum (multiple Active) ───
    const activeCount = await Curriculum.countDocuments({
      programCode: Number(programCode),
      status: 'Active',
    });
    if (activeCount > 1) {
      report.ambiguousCurriculum++;
      report.warnings++;
      report.details.push(`${tag} WARNING: ${activeCount} Active curricula found for program ${programCode} — using ${curriculumSource}`);
    }

    // ─── Eligible for backfill ───
    report.eligibleForBackfill++;
    report.wouldCreate++;

    if (IS_APPLY) {
      try {
        await Enrollment.create({
          studentId: student._id,
          studentNumber: student.studentNumber || '',
          schoolYear,
          semester,
          yearLevel: Number(student.yearLevel) || 1,
          course: enrollmentCourse,
          curriculumId,
          status: 'Enrolled',
          isCurrent: true,
          subjects: [],
        });
        report.created++;
        report.details.push(`${tag} CREATED enrollment (${schoolYear} ${semester}, curriculum=${curriculumSource})`);
      } catch (err) {
        report.errors++;
        report.details.push(`${tag} ERROR: ${err.message}`);
      }
    } else {
      report.details.push(`${tag} WOULD CREATE enrollment (${schoolYear} ${semester}, curriculum=${curriculumSource})`);
    }
  }

  // ─── Print report ───
  console.log('═══════════════════════════════════════════════════');
  console.log('                 MIGRATION REPORT');
  console.log('═══════════════════════════════════════════════════');
  console.log(`Students inspected:              ${report.inspected}`);
  console.log(`Students eligible for backfill:  ${report.eligibleForBackfill}`);
  console.log(`Enrollments already present:     ${report.enrollmentsAlreadyPresent}`);
  console.log(`Enrollments that would be created: ${report.wouldCreate}`);
  console.log(`Enrollments actually created:    ${report.created}`);
  console.log(`Students with no valid curriculum: ${report.noValidCurriculum}`);
  console.log(`Students with ambiguous curriculum: ${report.ambiguousCurriculum}`);
  console.log(`Students with invalid/missing course: ${report.invalidOrMissingCourse}`);
  console.log(`Students with missing school year: ${report.missingSchoolYear}`);
  console.log(`Students with missing semester:  ${report.missingSemester}`);
  console.log(`Errors:                          ${report.errors}`);
  console.log(`Warnings:                        ${report.warnings}`);
  console.log('═══════════════════════════════════════════════════');
  console.log('');
  console.log('DETAILS:');
  report.details.forEach((d) => console.log(`  ${d}`));
  console.log('');

  if (!IS_APPLY && report.wouldCreate > 0) {
    console.log(`DRY RUN: ${report.wouldCreate} enrollment(s) would be created.`);
    console.log('To apply, run: node migrations/backfillMissingEnrollments.js --apply');
  } else if (IS_APPLY) {
    console.log(`APPLY complete: ${report.created} enrollment(s) created.`);
    console.log('To verify idempotency, run: node migrations/backfillMissingEnrollments.js');
  } else {
    console.log('No enrollments need to be created. Data is consistent.');
  }

  await mongoose.disconnect();
}

run().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
