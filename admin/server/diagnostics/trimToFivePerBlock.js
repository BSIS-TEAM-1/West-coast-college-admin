/**
 * DATA MIGRATION (test-data only): trim each course block back to FIVE students.
 *
 * Current state (after the collapse-to-one-block): every kept section
 * (101-1-A, 102-1-A, 103-1-A, 201-1-A) holds 20 students (its own 5 plus the
 * 15 folded in from the deleted B/C/D sections).
 *
 * This script keeps ONLY the original five members of each block — the
 * students whose `section` pointed at the kept block in the backup snapshot
 * taken BEFORE the consolidation (no guessing) — and removes the other 15 per
 * course entirely, together with all their dependent records:
 *   enrollments (SY 2021-2022), student block assignments, documents,
 *   section waitlists, grade audit/change records tied to the removed student.
 *
 * Result: 4 blocks x 5 students = 20 students, 20 enrollments, 20 assignments.
 *
 * Run: node diagnostics/trimToFivePerBlock.js
 */
require('dotenv').config({ path: '../.env' });
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');

const TARGET_SCHOOL_YEAR = '2021-2022';
const COURSES = [101, 102, 103, 201];
const BACKUP_DIR = path.join(__dirname, '..', 'backups', `pre-trim-to-five_${TARGET_SCHOOL_YEAR}`);
const PRE_CONSOLIDATION_DIR = path.join(__dirname, '..', 'backups', 'pre-one-block-per-course_2021-2022');

(async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    const db = mongoose.connection.db;
    console.log(`trimming each block to 5 original members (SY ${TARGET_SCHOOL_YEAR})`);

    // ---- Load the pre-consolidation students backup to find the originals ----
    const backupRaw = JSON.parse(fs.readFileSync(path.join(PRE_CONSOLIDATION_DIR, 'students.json'), 'utf8'));
    const keptStudentsByCourse = new Map();
    for (const course of COURSES) {
      const keptGroupName = `${course}-1-A`;
      const originals = backupRaw.filter(
        (s) => Number(s.course) === course && s.section === keptGroupName,
      );
      keptStudentsByCourse.set(course, originals.map((s) => String(s.studentNumber)));
      console.log(`  ${keptGroupName}: ${originals.length} original member(s) -> ${originals.map((s) => s.studentNumber).join(', ')}`);
      if (originals.length !== 5) {
        throw new Error(`Expected exactly 5 original members for ${keptGroupName}, found ${originals.length}`);
      }
    }
    const keepNumbers = new Set([...keptStudentsByCourse.values()].flat());

    const students = await db.collection('students').find({ schoolYear: TARGET_SCHOOL_YEAR }).toArray();
    const kept = students.filter((s) => keepNumbers.has(String(s.studentNumber)));
    const removed = students.filter((s) => !keepNumbers.has(String(s.studentNumber)));
    console.log(`\nstudents: ${students.length} total | keep ${kept.length} | remove ${removed.length}`);

    const removedIds = removed.map((s) => s._id);
    const removedIdStrings = removedIds.map(String);

    // ---- Backup: full removal dataset ----
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
    const backupJobs = [
      ['students', removed],
      ['enrollments', await db.collection('enrollments').find({ schoolYear: TARGET_SCHOOL_YEAR, studentId: { $in: removedIds } }).toArray()],
      ['studentblockassignments', await db.collection('studentblockassignments').find({ $or: [{ studentId: { $in: removedIds } }, { studentId: { $type: 'string', $in: removedIdStrings } }] }).toArray()],
      ['documents', await db.collection('documents').find({ studentId: { $in: removedIdStrings } }).toArray()],
      ['sectionwaitlists', await db.collection('sectionwaitlists').find({ studentId: { $in: removedIdStrings } }).toArray()],
      ['gradeauditlogs', await db.collection('gradeauditlogs').find({ studentId: { $in: removedIdStrings } }).toArray()],
      ['gradechangerequests', await db.collection('gradechangerequests').find({ studentId: { $in: removedIdStrings } }).toArray()],
      ['blockactionlogs', await db.collection('blockactionlogs').find({ studentId: { $in: removedIdStrings } }).toArray()],
    ];
    for (const [name, docs] of backupJobs) {
      fs.writeFileSync(
        path.join(BACKUP_DIR, `${name}.json`),
        JSON.stringify(docs, (_k, v) => (v && v._bsontype === 'ObjectId' ? v.toString() : v), 2),
      );
      console.log(`backed up ${name}: ${docs.length} docs -> ${BACKUP_DIR}`);
    }

    // ---- Apply in one transaction ----
    const session = db.client.startSession();
    session.startTransaction();
    try {
      const del = async (name, filter) => {
        const r = await db.collection(name).deleteMany(filter, { session });
        if (r.deletedCount) console.log(`  deleted from ${name}: ${r.deletedCount}`);
        return r.deletedCount;
      };
      await del('studentblockassignments', { $or: [{ studentId: { $in: removedIds } }, { studentId: { $type: 'string', $in: removedIdStrings } }] });
      await del('sectionwaitlists', { studentId: { $in: removedIdStrings } });
      await del('gradeauditlogs', { studentId: { $in: removedIdStrings } });
      await del('gradechangerequests', { studentId: { $in: removedIdStrings } });
      await del('blockactionlogs', { studentId: { $in: removedIdStrings } });
      await del('documents', { studentId: { $in: removedIdStrings } });
      await del('enrollments', { schoolYear: TARGET_SCHOOL_YEAR, studentId: { $in: removedIds } });
      const delStudents = await db.collection('students').deleteMany({ _id: { $in: removedIds } }, { session });
      console.log(`  deleted from students: ${delStudents.deletedCount}`);

      // Verify kept students still have assignments + enrollment, then realign populations
      for (const course of COURSES) {
        const keptGroup = await db.collection('blockgroups').findOne({ name: `${course}-1-A` });
        const keptSection = await db.collection('blocksections').findOne({ blockGroupId: keptGroup._id });
        const assignmentCount = await db.collection('studentblockassignments').countDocuments(
          { sectionId: keptSection._id }, { session },
        );
        if (assignmentCount !== 5) throw new Error(`${keptSection.sectionCode} has ${assignmentCount} assignments, expected 5`);
        await db.collection('blocksections').updateOne(
          { _id: keptSection._id },
          { $set: { currentPopulation: assignmentCount } },
          { session },
        );
        console.log(`  ${keptSection.sectionCode}: 5 assignments, population set to 5`);
      }

      await session.commitTransaction();
      console.log('\ntransaction committed ✔');
    } catch (txErr) {
      await session.abortTransaction();
      throw txErr;
    } finally {
      session.endSession();
    }

    const finalCount = await db.collection('students').countDocuments({});
    console.log(`\nstudents in database: ${finalCount} (4 blocks x 5 members)`);
  } catch (err) {
    console.error('FAILED:', err.message);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect().catch(() => {});
  }
})();
