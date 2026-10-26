/** READ-ONLY: verify stored student credentials — every student has a bcrypt hash and comparePassword matches the derived default. Writes nothing. */
require('dotenv').config({ path: '../.env' });
const mongoose = require('mongoose');
const Student = require('../models/Student');
const StudentPasswordService = require('../services/studentPasswordService');

const TARGET_SCHOOL_YEAR = '2021-2022';

function defaultPasswordFor(student) {
  return StudentPasswordService.generateDefaultPassword(student);
}

(async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);

    const students = await Student.find({ schoolYear: TARGET_SCHOOL_YEAR })
      .select('studentNumber firstName middleName lastName course yearLevel isActive password lastLogin')
      .sort({ studentNumber: 1 });

    let missingHash = 0, mismatch = 0, active = 0;
    const failures = [];
    for (const s of students) {
      const hasHash = Boolean(s.password && String(s.password).length > 0);
      if (!hasHash) { missingHash += 1; failures.push(`${s.studentNumber}: no stored password`); continue; }
      if (s.isActive) active += 1;
      // Login equivalence: comparePassword against the same default the login
      // fallback would have derived.
      const ok = await s.comparePassword(defaultPasswordFor(s));
      if (!ok) { mismatch += 1; failures.push(`${s.studentNumber}: stored hash does NOT match default password`); }
    }

    console.log(`students: ${students.length} | active: ${active} | hash missing: ${missingHash} | hash-vs-default mismatch: ${mismatch}`);
    if (failures.length) for (const f of failures.slice(0, 10)) console.log('  ' + f);
    console.log(missingHash === 0 && mismatch === 0 ? 'ALL STUDENT CREDENTIALS WORK ✔' : 'ISSUES FOUND');
  } catch (err) {
    console.error('FAILED:', err.message);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect().catch(() => {});
  }
})();
