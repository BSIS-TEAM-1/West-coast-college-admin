/**
 * One-off maintenance script: finds students whose studentNumber does not
 * match the current 12-digit format (YYYY + course code + sequence) and
 * regenerates a correct number for them, using their own existing
 * course/schoolYear fields.
 *
 * Usage:
 *   node scripts/fixMalformedStudentNumbers.js            (dry run - lists only)
 *   node scripts/fixMalformedStudentNumbers.js --apply    (actually fixes them)
 */
require('dotenv').config();
const mongoose = require('mongoose');
const Student = require('../models/Student');
const StudentNumberService = require('../services/studentNumberService');

const APPLY = process.argv.includes('--apply');

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('Missing MONGODB_URI in .env');
    process.exit(1);
  }

  await mongoose.connect(uri);
  console.log(`Connected to MongoDB. Mode: ${APPLY ? 'APPLY (will write changes)' : 'DRY RUN (no changes)'}\n`);

  const students = await Student.find({}).select('firstName lastName studentNumber course schoolYear');
  const malformed = students.filter((s) => !/^\d{12}$/.test(String(s.studentNumber || '')));

  if (malformed.length === 0) {
    console.log('No malformed student numbers found.');
  } else {
    console.log(`Found ${malformed.length} student(s) with a malformed studentNumber:\n`);
    for (const s of malformed) {
      console.log(`- ${s.firstName} ${s.lastName} | studentNumber="${s.studentNumber}" | course=${s.course} | schoolYear=${s.schoolYear}`);
    }

    if (APPLY) {
      console.log('\nApplying fixes...\n');
      for (const s of malformed) {
        try {
          const newNumber = await StudentNumberService.generateStudentNumber(s.course, s.schoolYear);
          await Student.updateOne({ _id: s._id }, { $set: { studentNumber: newNumber } });
          console.log(`Fixed ${s.firstName} ${s.lastName}: "${s.studentNumber}" -> "${newNumber}"`);
        } catch (error) {
          console.error(`Failed to fix ${s.firstName} ${s.lastName} (course=${s.course}, schoolYear=${s.schoolYear}):`, error.message);
        }
      }
    } else {
      console.log('\nDry run only - no changes made. Re-run with --apply to fix these records.');
    }
  }

  await mongoose.disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
