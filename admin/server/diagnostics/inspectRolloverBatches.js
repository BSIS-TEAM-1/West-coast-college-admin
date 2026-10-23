/** READ-ONLY: check existing rollover batches and archive snapshots. Writes nothing. */
require('dotenv').config({ path: '../.env' });
const mongoose = require('mongoose');

(async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    const db = mongoose.connection.db;
    const batches = await db.collection('rolloverbatches').find({}).sort({ createdAt: 1 }).toArray();
    console.log('Rollover batches:', batches.length);
    for (const b of batches) {
      console.log(`  ${b.batchId} | status=${b.status} | from=${b.fromSchoolYear} to=${b.toSchoolYear} | started=${b.startedAt && new Date(b.startedAt).toISOString()} | counts=${JSON.stringify(b.counts || {})}`);
    }
    const snaps = await db.collection('archivesnapshots').find({}).toArray();
    console.log('\nArchive snapshots:', snaps.length);
    for (const s of snaps) console.log(`  ${s.type} | ${s.title} | generated ${s.generatedAt && new Date(s.generatedAt).toISOString()}`);
  } catch (err) {
    console.error('FAILED:', err.message);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect().catch(() => {});
  }
})();
