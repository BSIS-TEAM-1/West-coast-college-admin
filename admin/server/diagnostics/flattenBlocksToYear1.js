/**
 * DATA MIGRATION (test-data only): flatten every school-year 2026-2027 block to
 * year level 1 so a fresh rollover can be tested from a clean "all 1st year" state.
 *
 * Strategy (rename-in-place, nothing deleted):
 *   Course/Year step keeps its students, block membership, and section ids.
 *   BlockGroup  {course}-2-A y2 -> {course}-1-B y1   (similarly 3-A -> 1-C, 4-A -> 1-D)
 *   BlockSection sectionCode renamed to match.
 *   Students    yearLevel -> 1, section string renamed to the new block name.
 *   Enrollments yearLevel -> 1, subjects[].sectionCode renamed where it matched.
 *
 * The old name year digit is replaced by 1 and the letter shifts A->B/C/D.
 * Safe because each (course, oldYear) had exactly one section "A".
 *
 * Run: node diagnostics/flattenBlocksToYear1.js
 */
require('dotenv').config({ path: '../.env' });
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');

const TARGET_SCHOOL_YEAR = '2026-2027';
const SEMESTER = '1st';
const BACKUP_DIR = path.join(__dirname, '..', 'backups', `pre-flatten-to-year1_${TARGET_SCHOOL_YEAR}`);

(async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('connected');

    const db = mongoose.connection.db;
    const blockGroups = db.collection('blockgroups');
    const blockSections = db.collection('blocksections');
    const students = db.collection('students');
    const enrollments = db.collection('enrollments');

    // ---- Snapshot of everything this migration may touch (plain JSON backup) ----
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
    const backupSpec = [
      ['blockgroups', blockGroups, {}],
      ['blocksections', blockSections, {}],
      ['students', students, { schoolYear: TARGET_SCHOOL_YEAR }],
      ['enrollments', enrollments, { schoolYear: TARGET_SCHOOL_YEAR }],
    ];
    for (const [name, coll, filter] of backupSpec) {
      const docs = await coll.find(filter).toArray();
      // _id as ObjectId doesn't survive JSON.stringify usefully; keep it as hex.
      const serialized = JSON.stringify(docs, (_k, v) => (v && v._bsontype === 'ObjectId' ? v.toString() : v), 2);
      fs.writeFileSync(path.join(BACKUP_DIR, `${name}.json`), serialized);
      console.log(`backed up ${name}: ${docs.length} docs -> ${BACKUP_DIR}`);
    }

    // ---- Build the rename plan from the existing block groups ----
    const groups = await blockGroups.find({
      $or: [{ schoolYear: TARGET_SCHOOL_YEAR }, { year: TARGET_SCHOOL_YEAR }],
    }).toArray();

    const stepByCourse = {};
    const plan = [];
    for (const g of groups) {
      const nameMatch = String(g.name).match(/^(\d+)-(\d)-([A-Z])$/);
      if (!nameMatch) {
        console.log(`SKIP (unrecognized name): ${g.name}`);
        continue;
      }
      const [, course, oldYear, oldLetter] = nameMatch;
      const oldName = g.name;
      const newYearLevel = 1;
      const OLD_YEAR_TO_LETTER = { 1: 'A', 2: 'B', 3: 'C', 4: 'D' };
      const newLetter = OLD_YEAR_TO_LETTER[Number(oldYear)];
      const newName = `${course}-1-${newLetter}`;
      stepByCourse[course] = null; // mark course as seen
      plan.push({
        groupId: g._id,
        oldName,
        newName,
        oldYearLevel: Number(oldYear),
        newYearLevel,
        oldLetter,
        newLetter,
      });
    }
    console.log(`\nplan (${plan.length} groups to flatten):`);
    for (const p of plan) console.log(`  ${p.oldName} (y${p.oldYearLevel}) -> ${p.newName} (y${p.newYearLevel})`);

    const sectionRenames = plan.map((p) => ({
      groupName: p.oldName,
      section: p.newName,
      sectionCode: p.newName,
    }));

    // Nothing to do?
    const groupsAlreadyFlat = plan.every((p) => p.oldYearLevel === 1);
    if (groupsAlreadyFlat) {
      console.log('\nAll groups are already year 1. Nothing to change.');
      await mongoose.disconnect();
      return;
    }

    // ---- Apply inside one transaction ----
    const session = db.client.startSession();
    session.startTransaction();
    try {
      // 1. BlockGroups: rename + yearLevel=1
      for (const p of plan) {
        if (p.oldYearLevel === 1) continue; // keep the existing A sections as they are
        await blockGroups.updateOne(
          { _id: p.groupId },
          { $set: { name: p.newName, yearLevel: p.newYearLevel, section: p.newLetter } },
          { session },
        );
      }

      // 2. BlockSections: rename sectionCode on every section of a renamed group
      const groupIds = plan.filter((p) => p.oldYearLevel !== 1).map((p) => p.groupId);
      const sections = await blockSections.find({ blockGroupId: { $in: groupIds } }, { session }).toArray();
      for (const s of sections) {
        const p = plan.find((x) => String(x.groupId) === String(s.blockGroupId));
        const oldCode = String(s.sectionCode);
        const oldCodeMatch = oldCode.match(/^(\d+)-(\d)-([A-Z])$/);
        const newCode = oldCodeMatch ? `${oldCodeMatch[1]}-1-${p.newLetter}` : p.newName;
        await blockSections.updateOne(
          { _id: s._id },
          { $set: { sectionCode: newCode } },
          { session },
        );
        console.log(`  section ${oldCode} -> ${newCode}`);
      }

      // 3. Students of the closing year: everyone becomes year 1, and the
      //    section label follows its block's rename (old "c-2-A" -> "c-1-B" etc.)
      for (const p of plan) {
        if (p.oldYearLevel === 1) continue;
        await students.updateMany(
          { schoolYear: TARGET_SCHOOL_YEAR, course: Number(p.oldName.split('-')[0]), yearLevel: p.oldYearLevel, section: p.oldName },
          { $set: { yearLevel: 1, section: p.newName } },
          { session },
        );
      }
      const anyY2Plus = await students.countDocuments({ schoolYear: TARGET_SCHOOL_YEAR, yearLevel: { $gte: 2 } }, { session });
      if (anyY2Plus > 0) {
        // Students whose section label didn't match the block name still need the year reset.
        await students.updateMany(
          { schoolYear: TARGET_SCHOOL_YEAR, yearLevel: { $gte: 2 } },
          { $set: { yearLevel: 1 } },
          { session },
        );
        console.log(`  year reset for ${anyY2Plus} students with unmatched section labels`);
      }

      // 4. Enrollments: yearLevel -> 1, and subjects[].sectionCode renamed
      const enrFilter = { schoolYear: TARGET_SCHOOL_YEAR, yearLevel: { $gte: 2 } };
      const enrDocs = await enrollments.find(enrFilter, { session }).toArray();
      for (const e of enrDocs) {
        const pushSet = { yearLevel: 1 };
        if (Array.isArray(e.subjects)) {
          e.subjects.forEach((entry, i) => {
            if (entry && entry.sectionCode) {
              const m = String(entry.sectionCode).match(/^(\d+)-(\d)-([A-Z])$/);
              const p = plan.find((x) => x.oldName === String(entry.sectionCode));
              const p2 = m ? plan.find((x) => x.oldName === `${m[1]}-${m[2]}-A`) : null;
              const target = p || p2;
              if (target) pushSet[`subjects.${i}.sectionCode`] = target.newName;
            }
          });
        }
        await enrollments.updateOne({ _id: e._id }, { $set: pushSet }, { session });
      }
      console.log(`enrollments updated: ${enrDocs.length}`);

      await session.commitTransaction();
      console.log('\ntransaction committed ✔');
    } catch (txErr) {
      await session.abortTransaction();
      throw txErr;
    } finally {
      session.endSession();
    }

    console.log('\nDone. Rerun diagnostics/inspectYearLevelsForRollover.js to verify.');
  } catch (err) {
    console.error('FAILED (nothing executed past the failure point):', err.message);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect().catch(() => {});
  }
})();
