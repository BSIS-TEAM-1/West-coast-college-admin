/** READ-ONLY: inspect the `curriculums` collection (version/status/effective SY) + block group refs. Writes nothing. */
require('dotenv').config({ path: '../.env' });
const mongoose = require('mongoose');

(async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    const db = mongoose.connection.db;

    console.log('=== CURRICULUMS ===');
    const curricula = await db.collection('curriculums').find({}).toArray();
    for (const c of curricula) {
      console.log(`  ${c._id} | program=${c.programCode} ${c.programName || ''} | version="${c.version}" | effSY=${c.effectiveSchoolYear || '—'} | status=${c.status} | name="${c.name || ''}" | code="${c.code || ''}" | supersededBy=${c.supersededByVersion || '—'} | subjects=${(c.subjects || []).length}`);
      void c.totalUnits;
    }

    console.log('\n=== CURRICULUM SUBJECTS (per curriculumId) ===');
    const csubs = await db.collection('curriculumsubjects').find({}).toArray();
    const byCur = {};
    for (const cs of csubs) {
      const key = String(cs.curriculumId);
      byCur[key] = (byCur[key] || 0) + 1;
    }
    for (const [id, n] of Object.entries(byCur)) console.log(`  ${id}: ${n} subject placements`);
  } catch (err) {
    console.error('FAILED:', err.message);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect().catch(() => {});
  }
})();
