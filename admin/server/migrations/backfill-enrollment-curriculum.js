/**
 * Migration Script: Backfill Enrollment.curriculumId
 *
 * Purpose:
 *   Populate Enrollment.curriculumId for existing enrollment records that don't have one.
 *   Uses Student.curriculumVersion to find a matching Curriculum document by version + program.
 *
 * Safety:
 *   - Only updates enrollments where curriculumId is null or missing
 *   - Does NOT modify locked enrollments (lockedAt is set) unless --include-locked flag is provided
 *   - Does NOT guess — if no matching Curriculum is found, leaves curriculumId as null
 *   - Dry-run by default; use --apply to actually write changes
 *   - Prints a detailed report of what would be / was changed
 *
 * Usage:
 *   node server/migrations/backfill-enrollment-curriculum.js              # Dry run
 *   node server/migrations/backfill-enrollment-curriculum.js --report      # Report only (summary stats)
 *   node server/migrations/backfill-enrollment-curriculum.js --apply       # Apply changes
 *   node server/migrations/backfill-enrollment-curriculum.js --apply --include-locked  # Include locked enrollments
 */

const mongoose = require('mongoose');
require('dotenv').config();

const Student = require('../models/Student');
const Enrollment = require('../models/Enrollment');
const Curriculum = require('../models/Curriculum');

const MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI || 'mongodb://localhost:27017/wcc';

async function run() {
  const args = process.argv.slice(2);
  const shouldApply = args.includes('--apply');
  const includeLocked = args.includes('--include-locked');
  const reportOnly = args.includes('--report');

  console.log('=== Enrollment.curriculumId Backfill Migration ===');
  console.log(`Mode: ${reportOnly ? 'REPORT' : shouldApply ? 'APPLY' : 'DRY RUN'}`);
  console.log(`Include locked enrollments: ${includeLocked ? 'YES' : 'NO'}`);
  console.log(`MongoDB URI: ${MONGO_URI}`);
  console.log('');

  await mongoose.connect(MONGO_URI);
  console.log('Connected to MongoDB.\n');

  // Build a lookup map of Curriculum documents by (programCode, version)
  const allCurricula = await Curriculum.find({}).select('programCode version status programName').lean();
  console.log(`Found ${allCurricula.length} Curriculum documents.`);

  // Map: "programCode|version" → curriculumId
  const curriculumLookup = {};
  for (const c of allCurricula) {
    const key = `${c.programCode}|${String(c.version).trim()}`;
    curriculumLookup[key] = c._id;
  }

  // Also build a map by version only (fallback when program is ambiguous)
  const curriculumByVersionOnly = {};
  for (const c of allCurricula) {
    const ver = String(c.version).trim();
    if (!curriculumByVersionOnly[ver]) {
      curriculumByVersionOnly[ver] = [];
    }
    curriculumByVersionOnly[ver].push(c);
  }

  // Count total enrollments and already-populated for report mode
  const totalEnrollments = await Enrollment.countDocuments({});
  const alreadyPopulated = await Enrollment.countDocuments({ curriculumId: { $ne: null } });

  // Find all enrollments without curriculumId
  const query = { curriculumId: null };
  if (!includeLocked) {
    query.lockedAt = null;
  }

  const enrollmentsWithoutCurriculum = await Enrollment.find(query)
    .select('_id studentId schoolYear semester course yearLevel status lockedAt')
    .lean();

  // Count locked unmatched for report
  const lockedUnmatched = await Enrollment.countDocuments({ curriculumId: null, lockedAt: { $ne: null } });

  console.log(`Total enrollments: ${totalEnrollments}`);
  console.log(`Already populated: ${alreadyPopulated}`);
  console.log(`Without curriculumId: ${enrollmentsWithoutCurriculum.length}`);
  console.log(`Locked unmatched: ${lockedUnmatched}`);
  console.log('');

  if (enrollmentsWithoutCurriculum.length === 0) {
    console.log('Nothing to migrate. All enrollments already have curriculumId or none match the criteria.');
    await mongoose.disconnect();
    return;
  }

  // Collect all studentIds to fetch their curriculumVersion
  const studentIds = [...new Set(enrollmentsWithoutCurriculum.map((e) => String(e.studentId)))];
  const students = await Student.find({ _id: { $in: studentIds } })
    .select('_id curriculumVersion course')
    .lean();

  const studentById = {};
  for (const s of students) {
    studentById[String(s._id)] = s;
  }

  let matched = 0;
  let unmatched = 0;
  let skipped = 0;
  const updates = [];
  const unmatchedDetails = [];

  for (const enrollment of enrollmentsWithoutCurriculum) {
    const student = studentById[String(enrollment.studentId)];

    if (!student) {
      unmatched++;
      unmatchedDetails.push({
        enrollmentId: String(enrollment._id),
        schoolYear: enrollment.schoolYear,
        reason: 'Student not found',
      });
      continue;
    }

    const studentVersion = String(student.curriculumVersion || '').trim();

    if (!studentVersion) {
      unmatched++;
      unmatchedDetails.push({
        enrollmentId: String(enrollment._id),
        schoolYear: enrollment.schoolYear,
        studentId: String(student._id),
        reason: 'Student has no curriculumVersion',
      });
      continue;
    }

    // Try to match by program + version
    // Enrollment.course is a string like 'BSIS', need to map to programCode
    // Curriculum.programCode is a number like 101
    // Student.course is a number like 101
    const programCode = student.course;
    const key = `${programCode}|${studentVersion}`;
    let curriculumId = curriculumLookup[key];

    // Fallback: if only one curriculum matches this version, use it
    if (!curriculumId) {
      const byVersion = curriculumByVersionOnly[studentVersion];
      if (byVersion && byVersion.length === 1) {
        curriculumId = byVersion[0]._id;
      }
    }

    if (curriculumId) {
      matched++;
      updates.push({
        enrollmentId: enrollment._id,
        curriculumId,
        schoolYear: enrollment.schoolYear,
        studentVersion,
        programCode,
      });
    } else {
      unmatched++;
      unmatchedDetails.push({
        enrollmentId: String(enrollment._id),
        schoolYear: enrollment.schoolYear,
        studentId: String(student._id),
        studentVersion,
        programCode,
        reason: 'No matching Curriculum document found',
      });
    }
  }

  // Report
  console.log('=== Migration Report ===');
  console.log(`Total enrollments: ${totalEnrollments}`);
  console.log(`Already populated: ${alreadyPopulated}`);
  console.log(`Without curriculumId (matching criteria): ${enrollmentsWithoutCurriculum.length}`);
  console.log(`Successfully matched: ${matched}`);
  console.log(`Unmatched: ${unmatched}`);
  console.log(`Locked unmatched: ${lockedUnmatched}`);
  console.log(`Legacy fallback required (no match, will rely on Student.curriculumVersion): ${unmatched}`);
  console.log('');

  if (unmatchedDetails.length > 0) {
    console.log('--- Unmatched Details (first 20) ---');
    for (const d of unmatchedDetails.slice(0, 20)) {
      console.log(`  Enrollment ${d.enrollmentId} (${d.schoolYear}): ${d.reason}${d.studentVersion ? ` [version=${d.studentVersion}, program=${d.programCode || 'N/A'}]` : ''}`);
    }
    if (unmatchedDetails.length > 20) {
      console.log(`  ... and ${unmatchedDetails.length - 20} more.`);
    }
    console.log('');
  }

  if (reportOnly) {
    console.log('Report mode — no changes applied. Use --apply to write changes.');
  } else if (shouldApply && updates.length > 0) {
    console.log(`Applying ${updates.length} updates...`);

    let applied = 0;
    let errors = 0;

    for (const update of updates) {
      try {
        await Enrollment.updateOne(
          { _id: update.enrollmentId },
          { $set: { curriculumId: update.curriculumId } }
        );
        applied++;
      } catch (updateError) {
        console.error(`  Error updating enrollment ${update.enrollmentId}:`, updateError.message);
        errors++;
      }
    }

    console.log(`Applied: ${applied}`);
    console.log(`Errors: ${errors}`);
  } else if (!shouldApply && updates.length > 0) {
    console.log('Dry run — no changes applied. Use --apply to write changes.');
  }

  console.log('\nMigration complete.');
  await mongoose.disconnect();
}

run().catch((error) => {
  console.error('Migration failed:', error);
  process.exit(1);
});
