const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });
const mongoose = require('mongoose');

(async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB.');

    const Curriculum = require('../models/Curriculum');
    const Student = require('../models/Student');
    const BlockGroup = require('../models/BlockGroup');

    const fromVersion = '2026-2029';
    const toVersion = '2021-2024';

    // 1. Update the active curricula
    const activeCurricula = await Curriculum.find({ status: 'Active' });
    console.log(`Found ${activeCurricula.length} active curricula.`);

    for (const cur of activeCurricula) {
      console.log(`Updating curriculum ${cur._id} (${cur.programCode} ${cur.programName}): ${cur.version} -> ${toVersion}`);
      cur.version = toVersion;
      if (cur.name && cur.name.includes(fromVersion)) {
        cur.name = cur.name.replace(fromVersion, toVersion);
      }
      await cur.save({ validateBeforeSave: false });
    }

    // 2. Update students with curriculumVersion
    const studentRes = await Student.updateMany(
      { curriculumVersion: fromVersion },
      { $set: { curriculumVersion: toVersion } }
    );
    console.log(`Updated ${studentRes.modifiedCount} student(s) with curriculumVersion ${toVersion}.`);

    // 3. Verify
    const updated = await Curriculum.find({ status: 'Active' }).lean();
    console.log('\nActive Curricula now:');
    for (const c of updated) {
      console.log(` - ${c.programName} (${c.programCode}): version="${c.version}", name="${c.name || 'default'}"`);
    }

    console.log('\nMigration completed successfully.');
    process.exit(0);
  } catch (err) {
    console.error('Migration failed:', err);
    process.exit(1);
  }
})();
