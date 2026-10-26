/**
 * One-time patch for the block "no curriculum" bug, driven by live data:
 *
 *   1. Rename curriculum versions to the school-year-range convention the
 *      school wants: "2026" → "2026-2029" (current Active curricula) and
 *      "2027" → "2027-2032" (the new BSBA curriculum).
 *
 *   2. Re-stamp students whose curriculumVersion was the bare year ("2026")
 *      so future exact-version matches keep working (range matching in
 *      resolveCurriculum covers it either way).
 *
 *   3. Fix block groups created WITHOUT a curriculumId (e.g. by the semester
 *      rollover before the inheritance fix): they are linked to the Active
 *      curriculum of their program, exactly what enrollmentService's Active
 *      fallback already assumes for their students.
 *
 * Idempotent: every update targets only documents that still need the change.
 * Safe to re-run. Enrollments keep curriculumId references untouched — only
 * the version STRING and NULL links change.
 */
require('dotenv').config({ path: '../.env' });
const mongoose = require('mongoose');
const Curriculum = require('../models/Curriculum');
const Student = require('../models/Student');
const BlockGroup = require('../models/BlockGroup');

const VERSION_RENAMES = [
  { from: '2026', to: '2026-2029' },
  { from: '2027', to: '2027-2032' },
];

(async () => {
  const dryRun = process.argv.includes('--dry-run');
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log(`Connected${dryRun ? ' (dry run — nothing will be written)' : ''}`);

    // --- 1. Rename curriculum versions ---
    for (const { from, to } of VERSION_RENAMES) {
      const targets = await Curriculum.find({ version: from });
      if (targets.length === 0) {
        console.log(`Curriculum version "${from}" → "${to}": nothing to rename`);
        continue;
      }
      for (const cur of targets) {
        console.log(`Curriculum ${cur._id} (${cur.programCode} ${cur.programName}, status=${cur.status}): "${from}" → "${to}"`);
        if (!dryRun) {
          cur.version = to;
          await cur.save({ validateBeforeSave: false });
        }
      }

      // --- 2. Students stamped with the bare year ---
      const studentCount = await Student.countDocuments({ curriculumVersion: from });
      console.log(`Students with curriculumVersion "${from}": ${studentCount}`);
      if (studentCount > 0 && !dryRun) {
        await Student.updateMany({ curriculumVersion: from }, { $set: { curriculumVersion: to } });
      }
    }

    // --- 3. Backfill block groups with a NULL curriculumId ---
    const groups = await BlockGroup.find({ $or: [{ curriculumId: null }, { curriculumId: { $exists: false } }] });
    if (groups.length === 0) {
      console.log('Block groups missing curriculumId: none');
    } else {
      const activeByProgram = new Map();
      for (const cur of await Curriculum.find({ status: 'Active' }).select('_id programCode')) {
        activeByProgram.set(Number(cur.programCode), cur._id);
      }
      for (const group of groups) {
        const programCode = Number(group.courseId);
        const target = activeByProgram.get(programCode) || null;
        console.log(`Block group ${group._id} ("${group.name}", program=${programCode}): null → ${target || '⚠ no Active curriculum for program — left as is'}`);
        if (target && !dryRun) {
          group.curriculumId = target;
          await group.save({ validateBeforeSave: false });
        }
      }
    }

    console.log('\nDone.');
    process.exitCode = 0;
  } catch (err) {
    console.error('FAILED:', err.message);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect().catch(() => {});
  }
})();
