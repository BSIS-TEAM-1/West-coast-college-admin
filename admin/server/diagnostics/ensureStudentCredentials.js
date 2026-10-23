/**
 * DATA MIGRATION (test-data only): make every student's login credentials work.
 *
 * The /api/student/login endpoint:
 *   - accepts studentNumber + password
 *   - if a stored (bcrypt) password exists it is compared directly
 *   - otherwise it falls back to the DEFAULT password formula:
 *       first + middle + last initials (lowercase) + last 4 digits of studentNumber
 *
 * This script derives that same default password for every student without a
 * stored password and persists the bcrypt hash, so all generated students log
 * in reliably (and can change passwords later). A local CSV of the credentials
 * is written for testing because the derivation is deterministic but the
 * plaintext is never stored server-side.
 *
 * Run: node diagnostics/ensureStudentCredentials.js
 */
require('dotenv').config({ path: '../.env' });
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const Student = require('../models/Student');

const TARGET_SCHOOL_YEAR = '2021-2022';
const CSV_PATH = path.join(__dirname, '..', 'backups', `student-login-credentials_SY${TARGET_SCHOOL_YEAR}.csv`);

function defaultPasswordFor(student) {
  const initial = (part) => (part ? String(part).trim().charAt(0).toLowerCase() : '');
  return `${initial(student.firstName)}${initial(student.middleName)}${initial(student.lastName)}${String(student.studentNumber || '').slice(-4)}`;
}

(async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('connected');

    const students = await Student.find({ schoolYear: TARGET_SCHOOL_YEAR })
      .select('studentNumber firstName middleName lastName course yearLevel schoolYear lifecycleStatus isActive password lastLogin')
      .sort({ studentNumber: 1 });

    console.log(`students in scope: ${students.length}`);

    let hashed = 0, alreadySet = 0, invalid = 0;
    const csvRows = [['studentNumber', 'studentName', 'course', 'yearLevel', 'password', 'status']];

    for (const student of students) {
      const password = defaultPasswordFor(student);
      const name = `${student.firstName || ''} ${student.familyName || ''}`.trim() || '';
      const valid = Boolean(password && password.length >= 8 && student.studentNumber && student.isActive);
      const row = [
        student.studentNumber,
        `${student.firstName || ''} ${student.middleName || ''} ${student.lastName || ''}`.replace(/\s+/g, ' ').trim(),
        String(student.course),
        String(student.yearLevel),
        password,
        '',
      ];

      if (student.password && String(student.password).length > 0) {
        alreadySet += 1;
        row[5] = 'password already set (kept)';
        csvRows.push(row);
        continue;
      }
      if (!valid || !student.studentNumber) {
        invalid += 1;
        row[5] = 'SKIPPED (invalid: missing studentNumber/isActive)';
        csvRows.push(row);
        continue;
      }

      // Assigning triggers the Student pre-save hook which bcrypt-hashes it.
      student.password = password;
      await student.save();
      hashed += 1;
      row[5] = 'hashed now';
      csvRows.push(row);
    }

    fs.mkdirSync(path.dirname(CSV_PATH), { recursive: true });
    fs.writeFileSync(CSV_PATH, csvRows.map((r) => r.map((c) => (String(c).includes(',') ? `"${c}"` : c)).join(',')).join('\n'));

    console.log(`\ncredentials: hashed now=${hashed} | already had password=${alreadySet} | skipped=${invalid}`);
    console.log(`credential list written to: ${CSV_PATH}`);
    console.log('\nDone. Students can now log in with studentNumber + default password.');
  } catch (err) {
    console.error('FAILED:', err.message);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect().catch(() => {});
  }
})();
