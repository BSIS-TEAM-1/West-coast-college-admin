/** READ-ONLY: list curricula + block groups + sample student curriculum versions to diagnose the block "no curriculum" bug. Writes nothing. */
require('dotenv').config({ path: '../.env' });
const mongoose = require('mongoose');

(async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    const db = mongoose.connection.db;

    console.log('=== CURRICULA ===');
    const curricula = await db.collection('curricula').find({}).toArray();
    for (const c of curricula) {
      console.log(`  ${c._id} | program=${c.programCode} ${c.programName || ''} | version="${c.version}" | effectiveSY=${c.effectiveSchoolYear || '—'} | status=${c.status} | name="${c.name || ''}" | code="${c.code || ''}"`);
    }

    console.log('\n=== BLOCK GROUPS ===');
    const groups = await db.collection('blockgroups').find({}).toArray();
    for (const g of groups) {
      console.log(`  ${g._id} | name="${g.name || g.groupName || ''}" | course=${g.course ?? '?'} | semester=${g.semester} | year=${g.year ?? '?'} | curriculumId=${g.curriculumId || 'NULL'} | deleted=${g.deletedAt ? 'yes' : 'no'}`);
    }

    console.log('\n=== STUDENT curriculumVersion distribution (active) ===');
    const students = await db.collection('students').find({ isActive: { $ne: false } }).toArray();
    const byVersion = {};
    for (const s of students) {
      const key = `course=${s.course} version="${s.curriculumVersion || '—'}"`;
      byVersion[key] = (byVersion[key] || 0) + 1;
    }
    for (const [key, n] of Object.entries(byVersion).sort()) console.log(`  ${n}x ${key}`);
    console.log(`Total active students: ${students.length}`);
  } catch (err) {
    console.error('FAILED:', err.message);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect().catch(() => {});
  }
})();
