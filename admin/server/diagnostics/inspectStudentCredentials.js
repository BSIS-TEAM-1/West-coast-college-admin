/** READ-ONLY: student credential state (password set? isActive? names for default pw). Writes nothing. */
require('dotenv').config({ path: '../.env' });
const mongoose = require('mongoose');
const Student = require('../models/Student');

(async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    const students = await Student.find({}).select('studentNumber firstName middleName lastName course yearLevel schoolYear lifecycleStatus isActive password lastLogin').lean();

    let withPassword = 0, active = 0, missingNamePart = 0, everLoggedIn = 0;
    const samples = [];
    for (const s of students) {
      const hasPw = Boolean(s.password && String(s.password).length > 0);
      if (hasPw) withPassword += 1;
      if (s.isActive) active += 1;
      if (s.lastLogin) everLoggedIn += 1;
      if (!s.firstName || !s.lastName) missingNamePart += 1;
      if (samples.length < 5) {
        const pwPreview = (() => {
          // mirror generateDefaultPassword formula (no bcrypt decode)
          const i = (x) => (x ? x.charAt(0).toLowerCase() : '');
          return `${i(s.firstName)}${i(s.middleName)}${i(s.lastName)}${String(s.studentNumber).slice(-4)}`;
        })();
        samples.push(`  ${s.studentNumber} | ${s.firstName || 'NO-FIRST'} ${s.middleName || 'NO-MID'} ${s.lastName || 'NO-LAST'} | y${s.yearLevel} c${s.course} | active=${s.isActive} | pw=${hasPw ? 'SET' : 'none'} (default would be "${pwPreview}") | lastLogin=${s.lastLogin || 'never'} | lifecycle=${s.lifecycleStatus}`);
      }
    }
    console.log(`students: ${students.length} | password set: ${withPassword} | active: ${active} | missing name: ${missingNamePart} | ever logged in: ${everLoggedIn}`);
    console.log('\nSamples:');
    for (const line of samples) console.log(line);
  } catch (err) {
    console.error('FAILED:', err.message);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect().catch(() => {});
  }
})();
