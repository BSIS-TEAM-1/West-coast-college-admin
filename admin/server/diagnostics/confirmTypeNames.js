/** READ-ONLY: confirm BSON type names returned by aggregation $type for latestGrade. */
require('dotenv').config({ path: '../.env' });
const mongoose = require('mongoose');
const Student = require('../models/Student');

(async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    const types = await Student.aggregate([
      { $project: { t: { $type: '$latestGrade' } } },
      { $group: { _id: '$t', count: { $sum: 1 } } },
    ]);
    console.log('aggregation $type distribution of latestGrade:', JSON.stringify(types));
  } catch (err) {
    console.error('FAILED:', err.message);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect().catch(() => {});
  }
})();
