/**
 * DATA MIGRATION (test-data only): shift the working school year 5 years back —
 * "2026-2027" -> "2021-2022" — so the rollover test can walk the 1st-year cohort
 * through year levels until they graduate (y1 2021-2022 ... y4 2024-2025 -> graduate).
 *
 * Shifted (live data):
 *   students.schoolYear, enrollments.schoolYear,
 *   blockgroups.schoolYear + year, studentblockassignments.schoolYear + year,
 *   blocksubjectassignments.academicYear, applicants.schoolYear,
 *   academicperiods.schoolYear (+ term start/end dates rolled back 5 years),
 *   systemsettings[academicTerm].value.schoolYear
 *
 * NOT touched (immutable history): rolloverbatches, archivesnapshots,
 *   audit/grade/block-action logs, createdAt/updatedAt timestamps, student numbers.
 *
 * Run: node diagnostics/shiftSchoolYearBack5.js
 */
require('dotenv').config({ path: '../.env' });
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');

const FROM_YEAR = '2026-2027';
const TO_YEAR = '2021-2022';
const YEAR_SHIFT_MS = 5 * 365.25 * 24 * 3600 * 1000; // ~5 years
const BACKUP_DIR = path.join(__dirname, '..', 'backups', `pre-year-shift_${FROM_YEAR}`);

(async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    const db = mongoose.connection.db;
    console.log(`shifting ${FROM_YEAR} -> ${TO_YEAR} (5 years back)`);

    // ---- Backup every collection we are about to touch ----
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
    const jobs = [
      ['students', { schoolYear: FROM_YEAR }],
      ['enrollments', { schoolYear: FROM_YEAR }],
      ['blockgroups', { $or: [{ schoolYear: FROM_YEAR }, { year: FROM_YEAR }] }],
      ['studentblockassignments', { $or: [{ schoolYear: FROM_YEAR }, { year: FROM_YEAR }] }],
      ['blocksubjectassignments', { academicYear: FROM_YEAR }],
      ['applicants', { schoolYear: FROM_YEAR }],
      ['academicperiods', { schoolYear: FROM_YEAR }],
      ['systemsettings', { key: 'academicTerm' }],
    ];
    for (const [name, filter] of jobs) {
      const docs = await db.collection(name).find(filter).toArray();
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
      const r = {};
      r.students = await db.collection('students').updateMany(
        { schoolYear: FROM_YEAR }, { $set: { schoolYear: TO_YEAR } }, { session });
      r.enrollments = await db.collection('enrollments').updateMany(
        { schoolYear: FROM_YEAR }, { $set: { schoolYear: TO_YEAR } }, { session });
      r.blockgroups = await db.collection('blockgroups').updateMany(
        { $or: [{ schoolYear: FROM_YEAR }, { year: FROM_YEAR }] },
        { $set: { schoolYear: TO_YEAR, year: TO_YEAR } }, { session });
      r.studentblockassignments = await db.collection('studentblockassignments').updateMany(
        { $or: [{ schoolYear: FROM_YEAR }, { year: FROM_YEAR }] },
        { $set: { schoolYear: TO_YEAR, year: TO_YEAR } }, { session });
      r.blocksubjectassignments = await db.collection('blocksubjectassignments').updateMany(
        { academicYear: FROM_YEAR }, { $set: { academicYear: TO_YEAR } }, { session });
      r.applicants = await db.collection('applicants').updateMany(
        { schoolYear: FROM_YEAR }, { $set: { schoolYear: TO_YEAR } }, { session });
      r.academicperiods = await db.collection('academicperiods').updateMany(
        { schoolYear: FROM_YEAR },
        [{ $set: {
          schoolYear: TO_YEAR,
          startDate: { $dateToString: { date: { $dateSubtract: { startDate: '$startDate', unit: 'millisecond', amount: YEAR_SHIFT_MS } }, format: '%Y-%m-%dT%H:%M:%S.%LZ' } },
          endDate: { $dateToString: { date: { $dateSubtract: { startDate: '$endDate', unit: 'millisecond', amount: YEAR_SHIFT_MS } }, format: '%Y-%m-%dT%H:%M:%S.%LZ' } },
        } }],
        { session });
      r.systemsettings = await db.collection('systemsettings').updateOne(
        { key: 'academicTerm' },
        { $set: { 'value.schoolYear': TO_YEAR } }, { session });

      for (const [k, res] of Object.entries(r)) {
        console.log(`  ${k}: matched=${res.matchedCount ?? res.n} modified=${res.modifiedCount ?? res.nModified ?? res.n}`);
      }
      await session.commitTransaction();
      console.log('\ntransaction committed ✔');
    } catch (txErr) {
      await session.abortTransaction();
      throw txErr;
    } finally {
      session.endSession();
    }

    // ---- Quick post-check: no live doc still references the old year ----
    let leftovers = 0;
    for (const name of ['students', 'enrollments', 'blockgroups', 'studentblockassignments', 'blocksubjectassignments', 'applicants']) {
      const count = await db.collection(name).countDocuments({
        $or: [
          { schoolYear: FROM_YEAR }, { year: FROM_YEAR }, { academicYear: FROM_YEAR },
        ],
      });
      if (count) { console.log(`LEFTOVER in ${name}: ${count} docs still at ${FROM_YEAR}`); leftovers += count; }
    }
    const ap = await db.collection('academicperiods').countDocuments({ schoolYear: FROM_YEAR });
    if (ap) { console.log(`LEFTOVER in academicperiods: ${ap}`); leftovers += ap; }
    const ss = await db.collection('systemsettings').findOne({ key: 'academicTerm' });
    if (ss.value.schoolYear !== TO_YEAR) { console.log(`LEFTOVER systemsettings still ${ss.value.schoolYear}`); leftovers += 1; }

    console.log(leftovers === 0 ? `\nALL SHIFTED to ${TO_YEAR} ✔` : `\n${leftovers} leftover doc(s)`);
  } catch (err) {
    console.error('FAILED:', err.message);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect().catch(() => {});
  }
})();
