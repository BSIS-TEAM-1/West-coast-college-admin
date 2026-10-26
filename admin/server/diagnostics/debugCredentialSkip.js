/** READ-ONLY: debug why the credential validity check skips students. Writes nothing. */
require('dotenv').config({ path: '../.env' });
const mongoose = require('mongoose');
const Student = require('../models/Student');
const StudentPasswordService = require('../services/studentPasswordService');

(async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    const students = await Student.find({ schoolYear: '2021-2022' })
      .select('studentNumber firstName middleName lastName isActive password')
      .limit(5);
    for (const s of students) {
      const pw = StudentPasswordService.generateDefaultPassword(s);
      const snOk = /^\d{12}$/.test(String(s.studentNumber || ''));
      console.log(`${s.studentNumber} | sn12=${snOk} | isActive=${s.isActive} | pw="${pw}" | len=${pw.length} | stored=${Boolean(s.password)}`);
      // What does the schema validator say?
      try {
        s.password = pw;
        await s.validate();
        console.log('  validate(): ok');
      } catch (e) {
        console.log('  validate() FAILED:', e.message);
      }
    }
  } catch (err) {
    console.error('FAILED:', err.message);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect().catch(() => {});
  }
})();
