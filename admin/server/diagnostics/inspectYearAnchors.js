/** READ-ONLY: find every place the school year "2026-2027" (or related year fields) is anchored. Writes nothing. */
require('dotenv').config({ path: '../.env' });
const mongoose = require('mongoose');

(async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    const db = mongoose.connection.db;

    // Which collections exist, and how many docs hold a "2026-2027" year.
    const collections = await db.listCollections().toArray();
    const YEAR_PATTERN = /2026-2027|2026.?\/.?2027|2026/;
    console.log('=== Collections containing year-like fields ===');
    for (const { name } of collections) {
      let docs;
      try {
        docs = await db.collection(name).find({}).limit(400).toArray();
      } catch { continue; }
      const hits = [];
      let scanned = docs.length;
      for (const d of docs) {
        const json = JSON.stringify(d);
        const m = json.match(/"(?:[^"]*(?:year|Year)":"[^"]*2026[^"]*")/g);
        if (m) hits.push(...m);
        if (json.includes('2026') && !m && json.length < 4000) hits.push(...json.match(/"[^"]*"[^\s,}]*2026[^\s,}]*/g) || []);
      }
      const total = await db.collection(name).countDocuments();
      if (hits.length > 0) {
        const uniq = Array.from(new Set(hits)).slice(0, 6);
        console.log(`\n${name} (total ${total}, sampled ${scanned}):`);
        for (const h of uniq) console.log('   ' + h.slice(0, 90));
      }
    }
    console.log('\n--- done ---');
  } catch (err) {
    console.error('FAILED:', err.message);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect().catch(() => {});
  }
})();
