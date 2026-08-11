const mongoose = require('mongoose');
require('dotenv').config({ path: '../.env' });
const BlockGroup = require('./models/BlockGroup');

async function check() {
  await mongoose.connect(process.env.MONGODB_URI);
  const groups = await BlockGroup.find({}).select('_id name curriculumId semester year').sort({ name: 1 }).lean();
  groups.forEach(g => {
    console.log(`${g.name} | sem=${g.semester} | year=${g.year} | curriculumId=${g.curriculumId || 'NONE'}`);
  });
  await mongoose.disconnect();
}
check().catch(err => { console.error(err); process.exit(1); });
