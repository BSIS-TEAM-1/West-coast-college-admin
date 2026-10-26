/**
 * DATA MIGRATION (test-data only): give every student their own login credentials
 * in THE SYSTEM's official format (StudentPasswordService.generateDefaultPassword).
 *
 * Format: firstInitial + middleInitial + lastInitial (lowercase, no filler) +
 *         last 5 digits of the studentNumber — e.g. "lnfp28391".
 * This is the same format the app's student-creation flow and the
 * addStudentPasswords migration use, so the credentials match the system.
 *
 * Every student gets hashed (bcrypt, via the model's pre-save hook). A CSV of
 * credentials is written locally for testing (plaintext is never stored on the
 * server side — it is a deterministic derivation of studentNumber + name).
 *
 * Run: node diagnostics/ensureStudentCredentials.js
 */
require('dotenv').config({ path: '../.env' });
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const Student = require('../models/Student');
const StudentPasswordService = require('../services/studentPasswordService');

const TARGET_SCHOOL_YEAR = '2021-2022';
const CSV_PATH = path.join(__dirname, '..', 'backups', `student-login-credentials_SY${TARGET_SCHOOL_YEAR}.csv`);

(async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('connected');

    const students = await Student.find({ schoolYear: TARGET_SCHOOL_YEAR })
      .select('studentNumber firstName middleName lastName course yearLevel schoolYear lifecycleStatus isActive password lastLogin')
      .sort({ studentNumber: 1 });

    console.log(`students in scope: ${students.length}`);

    let hashed = 0, unchanged = 0, skipped = 0;
    const csvRows = [['studentNumber', 'studentName', 'course', 'yearLevel', 'password (system format)', 'status']];

    for (const student of students) {
      const password = StudentPasswordService.generateDefaultPassword(student);
      if (!/^\d{12}$/.test(String(student.studentNumber || '')) || !student.isActive) {
        skipped += 1;
        csvRows.push([student.studentNumber, `${student.firstName} ${student.middleName} ${student.lastName}`.replace(/\s+/g, ' ').trim(), String(student.course), String(student.yearLevel), password, 'SKIPPED (invalid studentNumber or not active)']);
        continue;
      }

      if (await student.comparePassword(password)) {
        unchanged += 1;
        csvRows.push([student.studentNumber, `${student.firstName} ${student.middleName} ${student.lastName}`.replace(/\s+/g, ' ').trim(), String(student.course), String(student.yearLevel), password, 'already in system format (kept)']);
        continue;
      }

      // The pre-save hook bcrypt-hashes the password on save.
      student.password = password;
      await student.save();
      hashed += 1;
      csvRows.push([student.studentNumber, `${student.firstName} ${student.middleName} ${student.lastName}`.replace(/\s+/g, ' ').trim(), String(student.course), String(student.yearLevel), password, 'bcrypt hashed (system format)']);
    }

    fs.mkdirSync(path.dirname(CSV_PATH), { recursive: true });
    fs.writeFileSync(CSV_PATH, csvRows.map((r) => r.map((c) => (String(c).includes(',') ? `"${c}"` : c)).join(',')).join('\n'));

    console.log(`\ncredentials: hashed=${hashed} | already correct=${unchanged} | skipped=${skipped}`);
    console.log(`credential list -> ${CSV_PATH}`);
    console.log('\nDone. Each student now logs in with studentNumber + their own system-format password.');
  } catch (err) {
    console.error('FAILED:', err.message);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect().catch(() => {});
  }
})();
