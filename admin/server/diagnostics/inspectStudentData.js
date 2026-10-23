/**
 * READ-ONLY inspection of the students collection.
 * Identifies bulk-generated mock students (created in one batch with
 * patterned student numbers / names) versus individually-created records.
 * Writes nothing.
 */
require('dotenv').config({ path: '../.env' });
const mongoose = require('mongoose');
const Student = require('../models/Student');

(async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('connected');

    const total = await Student.countDocuments({});
    console.log('TOTAL students:', total);

    const bySchoolYear = await Student.aggregate([
      { $group: { _id: { schoolYear: '$schoolYear', semester: '$semester' }, count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]);
    console.log('\nBy schoolYear/semester:', JSON.stringify(bySchoolYear, null, 1));

    const byLifecycle = await Student.aggregate([
      { $group: { _id: '$lifecycleStatus', count: { $sum: 1 } } },
    ]);
    console.log('\nBy lifecycleStatus:', JSON.stringify(byLifecycle, null, 1));

    const bySection = await Student.aggregate([
      { $group: { _id: { schoolYear: '$schoolYear', course: '$course', yearLevel: '$yearLevel', section: '$section' }, count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]);
    console.log('\nBy course/yearLevel/section (top 30):');
    for (const row of bySection.slice(0, 30)) {
      console.log(' ', JSON.stringify(row._id), row.count);
    }

    // Creation-time clustering: mock generators create hundreds in one batch.
    const byCreationMinute = await Student.aggregate([
      { $group: { _id: { $dateToString: { format: '%Y-%m-%d %H:%M', date: '$createdAt' } }, count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 15 },
    ]);
    console.log('\nTop creation minutes (bulk-generation fingerprints):',
      JSON.stringify(byCreationMinute, null, 1));

    const numberPatterns = await Student.aggregate([
      { $addFields: {
        cleaned: { $toString: '$studentNumber' },
      } },
      { $addFields: {
        shape: { $regexFind: { input: { $toString: '$studentNumber' }, regex: /^[0-9]+-[A-Za-z-]*[0-9]*$/ } },
      } },
      { $group: { _id: { pattern: '$shape.match', schoolYear: '$schoolYear' }, count: { $sum: 1 }, sample: { $first: '$studentNumber' } } },
      { $sort: { count: -1 } },
      { $limit: 20 },
    ]);
    console.log('\nStudentNumber shape samples:',
      JSON.stringify(numberPatterns.map(r => ({ count: r.count, sample: r.sample, schoolYear: r._id.schoolYear })), null, 1));

    // Look for obviously generated names (Test/Scenario/Demo/numbered).
    const generatedNames = await Student.countDocuments({
      $or: [
        { firstName: /^(Test|Demo|Sample|Scenario|Student)\d*$/i },
        { lastName: /^(Test|Demo|Sample|Scenario|Student)\d*$/i },
        { firstName: /^Test/i },
        { lastName: /Test\d*$/i },
      ],
    });
    console.log('\nStudents with Test/Demo/Scenario-style names:', generatedNames);

    // Sample 30 docs: studentNumber, name, course/yearLevel/section, createdAt.
    const sample = await Student.find({})
      .select('studentNumber firstName lastName course yearLevel section schoolYear semester lifecycleStatus createdAt createdAt')
      .sort({ createdAt: -1 })
      .limit(30)
      .lean();
    console.log('\nMost-recent 30 students:');
    for (const s of sample) {
      console.log(`  ${s.studentNumber} | ${s.firstName} ${s.lastName} | c${s.course} y${s.yearLevel} ${s.section || '-'} | ${s.schoolYear} ${s.semester} | ${s.lifecycleStatus} | ${s.createdAt ? new Date(s.createdAt).toISOString() : 'no createdAt'}`);
    }

    const oldest = await Student.find({})
      .select('studentNumber firstName lastName course yearLevel section schoolYear semester lifecycleStatus createdAt')
      .sort({ createdAt: 1 })
      .limit(15)
      .lean();
    console.log('\nOldest 15 students:');
    for (const s of oldest) {
      console.log(`  ${s.studentNumber} | ${s.firstName} ${s.lastName} | c${s.course} y${s.yearLevel} ${s.section || '-'} | ${s.schoolYear} ${s.semester} | ${s.lifecycleStatus} | ${s.createdAt ? new Date(s.createdAt).toISOString() : 'no createdAt'}`);
    }
  } catch (err) {
    console.error('INSPECTION FAILED:', err.message);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect().catch(() => {});
  }
})();
