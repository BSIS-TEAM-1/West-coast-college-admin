/**
 * DATA MIGRATION (test-data only): give every SY 2026-2027 1st-year enrollment its
 * curriculum subjects and put ONE live professor account on every subject entry.
 *
 * Steps:
 *   1. Backup the enrollments collection to local JSON.
 *   2. autoAssignCurriculumSubjects() — the same service the app itself uses —
 *      fills each enrollment's missing subject rows from its curriculum's
 *      year-1 / 1st-semester placements (existing graded rows are preserved).
 *   3. Every subject entry gets instructor = "Rence" (the live professor's
 *      displayName, which is exactly how the app matches instructor -> professor
 *      account when computing course loads and grade submissions).
 *
 * Run: node diagnostics/assignProfessorToSubjects.js
 */
require('dotenv').config({ path: '../.env' });
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const Enrollment = require('../models/Enrollment');
const Subject = require('../models/Subject');
const Admin = require('../models/Admin');
const { autoAssignCurriculumSubjects } = require('../services/subjectEnrollmentService');

const TARGET_SCHOOL_YEAR = '2026-2027';
const BACKUP_DIR = path.join(__dirname, '..', 'backups', `pre-professor-assignments_${TARGET_SCHOOL_YEAR}`);

(async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('connected');

    // ---- Live professor account: exactly one active professor is expected ----
    const professors = await Admin.find({ accountType: 'professor', status: 'active' })
      .select('_id username displayName')
      .lean();
    if (professors.length !== 1) {
      throw new Error(`Expected exactly 1 active professor account, found ${professors.length}`);
    }
    const professor = professors[0];
    const instructorName = String(professor.displayName || '').trim() || String(professor.username || '').trim();
    if (!instructorName) throw new Error('The professor account has neither displayName nor username');
    console.log(`Assigning professor: username=${professor.username} instructorName="${instructorName}"`);

    // ---- Backup enrollments (post-flatten state) ----
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
    const enrollments = await Enrollment.find({ schoolYear: TARGET_SCHOOL_YEAR }).lean();
    fs.writeFileSync(
      path.join(BACKUP_DIR, 'enrollments.json'),
      JSON.stringify(enrollments, (_k, v) => (v && v._bsontype === 'ObjectId' ? v.toString() : v), 2),
    );
    console.log(`backed up enrollments: ${enrollments.length} docs -> ${BACKUP_DIR}`);

    // ---- Step 1: fill missing curriculum subjects ----
    let filled = 0, alreadyComplete = 0, missingCurriculum = 0;
    for (const enrollment of enrollments) {
      if (!enrollment.curriculumId) { missingCurriculum += 1; continue; }
      const result = await autoAssignCurriculumSubjects({
        enrollmentId: enrollment._id,
        curriculumId: enrollment.curriculumId,
        actorId: null,
      });
      if (result.added && result.added.length > 0) filled += 1;
      else alreadyComplete += 1;
    }
    console.log(`subject fill: filled=${filled} alreadyComplete=${alreadyComplete} noCurriculum=${missingCurriculum}`);

    // ---- Step 2: put the professor on EVERY non-finalized subject row ----
    const fresh = await Enrollment.find({ schoolYear: TARGET_SCHOOL_YEAR }).lean();
    let rowsTouched = 0, rowsAlreadyAssigned = 0, rowsGradedSkipped = 0;
    for (const e of fresh) {
      const changed = [];
      for (let i = 0; i < (e.subjects || []).length; i++) {
        const entry = e.subjects[i];
        if (!entry || !entry.subjectId) continue;
        if (entry.instructor === instructorName) { rowsAlreadyAssigned += 1; continue; }
        // Historical integrity: rows the professor already graded (Published/etc.)
        // keep their instructor. Anything open (Enrolled/Draft/TBA) gets him.
        const finalStatuses = ['Published', 'Rejected', 'Dropped'];
        if (finalStatuses.includes(entry.submissionStatus) || entry.status === 'Dropped') {
          rowsGradedSkipped += 1;
          continue;
        }
        changed.push({ i, instructor: entry.instructor || null });
      }
      if (changed.length === 0) continue;
      // Direct $set per entry via native update (avoids schema lifecycle hooks touching other rows)
      const coll = mongoose.connection.db.collection('enrollments');
      const set = { updatedAt: new Date() };
      for (const { i } of changed) set[`subjects.${i}.instructor`] = instructorName;
      await coll.updateOne({ _id: e._id }, { $set: set });
    }

    // Count what we actually set by re-reading
    const after = await Enrollment.find({ schoolYear: TARGET_SCHOOL_YEAR }).lean();
    let totalRows = 0, rowsWithProfessor = 0;
    for (const e of after) {
      for (const entry of e.subjects || []) {
        if (!entry || !entry.subjectId) continue;
        totalRows += 1;
        if (entry.instructor === instructorName) rowsWithProfessor += 1;
      }
    }
    console.log(`\nassignment result: ${totalRows} subject rows total | instructor="${instructorName}" on ${rowsWithProfessor}`);
    console.log('(already-assigned rows: ' + rowsAlreadyAssigned + ' | skipped previously-graded rows: ' + rowsGradedSkipped + ')');
    if (rowsWithProfessor !== totalRows) {
      const remainder = [];
      for (const e of after) {
        for (const entry of e.subjects || []) {
          if (entry && entry.subjectId && entry.instructor !== instructorName) {
            remainder.push(`${e.studentNumber} ${entry.code} instructor="${entry.instructor}" status=${entry.status}/${entry.submissionStatus}`);
          }
        }
      }
      console.log('ROWS NOT assigned:');
      for (const line of remainder.slice(0, 20)) console.log('  ' + line);
    }
    console.log('\nDone. Run diagnostics/inspectProfessorsAndSubjects.js to verify.');
  } catch (err) {
    console.error('FAILED:', err.message);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect().catch(() => {});
  }
})();
