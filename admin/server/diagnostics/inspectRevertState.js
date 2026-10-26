/** READ-ONLY: verify the state after a rollover revert — latest batch detail, student term distribution, academic term setting. Writes nothing. */
require('dotenv').config({ path: '../.env' });
const mongoose = require('mongoose');

(async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    const db = mongoose.connection.db;

    // Latest rolls (all batches, newest first)
    const batches = await db.collection('rolloverbatches').find({}).sort({ executedAt: -1, createdAt: -1 }).limit(5).toArray();
    console.log(`Rollover batches (latest 5 of ${batches.length} total):`);
    for (const b of batches) {
      console.log(`  ${b.batchId}`);
      console.log(`    status=${b.status} | mode=${b.mode || '(legacy: year)'} | semester=${b.semester} | from=${b.fromSchoolYear} to=${b.toSchoolYear}`);
      console.log(`    executed=${b.executedAt && new Date(b.executedAt).toISOString()} | reverted=${b.revertedAt && new Date(b.revertedAt).toISOString()}`);
      console.log(`    counts=${JSON.stringify(b.counts || {})}`);
      console.log(`    studentChanges=${Array.isArray(b.studentChanges) ? b.studentChanges.length : 'n/a'} | createdGroups=${(b.createdBlockGroupIds || []).length} createdSections=${(b.createdBlockSectionIds || []).length}`);
      if (b.previousAcademicTerm) console.log(`    previousAcademicTerm=${JSON.stringify(b.previousAcademicTerm)}`);
    }

    // Any applied batch still outstanding?
    const applied = await db.collection('rolloverbatches').countDocuments({ status: 'applied' });
    console.log(`\nApplied (unreverted) batches: ${applied}`);

    // Student term distribution
    const students = await db.collection('students').find({ isActive: { $ne: false } }).toArray();
    const byTerm = {};
    for (const s of students) {
      const key = `${s.schoolYear || '?'} ${s.semester || '?'} Y${s.yearLevel ?? '?'} ${s.lifecycleStatus || '?'}`;
      byTerm[key] = (byTerm[key] || 0) + 1;
    }
    console.log(`Active students: ${students.length}`);
    for (const [key, n] of Object.entries(byTerm).sort()) console.log(`  ${n}x ${key}`);

    // Academic term setting
    const term = await db.collection('systemsettings').findOne({ key: 'academicTerm' });
    console.log(`\nacademicTerm setting: ${term ? JSON.stringify(term.value) : '(missing)'}`);

    // Current enrollments per term
    const enrolls = await db.collection('enrollments').find({ isCurrent: true }).toArray();
    const byEnrollTerm = {};
    for (const e of enrolls) {
      const key = `${e.schoolYear} ${e.semester} Y${e.yearLevel} ${e.status}`;
      byEnrollTerm[key] = (byEnrollTerm[key] || 0) + 1;
    }
    console.log(`\nCurrent enrollments: ${enrolls.length}`);
    for (const [key, n] of Object.entries(byEnrollTerm).sort()) console.log(`  ${n}x ${key}`);
  } catch (err) {
    console.error('FAILED:', err.message);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect().catch(() => {});
  }
})();
