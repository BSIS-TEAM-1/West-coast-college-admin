/** READ-ONLY: locate the collection holding the block groups' curriculumId refs and inspect it. Writes nothing. */
require('dotenv').config({ path: '../.env' });
const mongoose = require('mongoose');

(async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    const db = mongoose.connection.db;

    const collections = await db.listCollections().toArray();
    console.log('Collections:', collections.map((c) => c.name).join(', '));

    const refs = ['6a78746754fb040586edb03c', '6a78746854fb040586edb043', '6a78746854fb040586edb049', '6a78746854fb040586edb04f'];
    const { ObjectId } = require('mongodb');

    for (const col of collections.map((c) => c.name)) {
      const hits = await db.collection(col).find({ _id: { $in: refs.map((r) => new ObjectId(r)) } }).toArray();
      if (hits.length > 0) {
        console.log(`\n=== ${col} holds ${hits.length} of the referenced ids ===`);
        for (const doc of hits) {
          console.log(JSON.stringify({ _id: doc._id, name: doc.name, code: doc.code, programCode: doc.programCode, programName: doc.programName, version: doc.version, status: doc.status, effectiveSchoolYear: doc.effectiveSchoolYear, totalUnits: doc.totalUnits, subjectCount: (doc.subjects || []).length }, null, 1));
        }
      }
    }
  } catch (err) {
    console.error('FAILED:', err.message);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect().catch(() => {});
  }
})();
