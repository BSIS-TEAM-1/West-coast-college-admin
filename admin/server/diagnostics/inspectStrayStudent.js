/** READ-ONLY: the stray student outside SY 2021-2022. Writes nothing. */
require('dotenv').config({ path: '../.env' });
const mongoose = require('mongoose');

(async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    const db = mongoose.connection.db;
    const docs = await db.collection('students').find({ schoolYear: { $ne: '2021-2022' } }).toArray();
    for (const s of docs) {
      console.log(JSON.stringify({
        sn: s.studentNumber,
        name: [s.firstName, s.middleName, s.lastName].filter(Boolean).join(' '),
        course: s.course,
        yearLevel: s.yearLevel,
        schoolYear: s.schoolYear,
        semester: s.semester,
        section: s.section,
        active: s.isActive,
        lifecycle: s.lifecycleStatus,
      }, null, 1));
    }
  } catch (err) {
    console.error('FAILED:', err.message);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect().catch(() => {});
  }
})();
