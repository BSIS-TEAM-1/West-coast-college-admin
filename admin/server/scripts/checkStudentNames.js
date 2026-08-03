/**
 * Check student name data to debug password generation
 * Run: node server/scripts/checkStudentNames.js
 */

const mongoose = require('mongoose');
const Student = require('../models/Student');
const path = require('path');
const fs = require('fs');

// Load environment variables from multiple possible locations
const envFileCandidates = [
  { filePath: path.join(__dirname, '..', '..', '.env'), override: false },
  { filePath: path.join(__dirname, '..', '..', '.env.credential-details'), override: true },
  { filePath: path.join(__dirname, '..', '..', '.env.credentail-details'), override: true },
  { filePath: path.join(__dirname, '..', '.env'), override: false },
  { filePath: path.join(__dirname, '..', '.env.credential-details'), override: true },
  { filePath: path.join(__dirname, '..', '.env.credentail-details'), override: true }
];

const dotenv = require('dotenv');
envFileCandidates.forEach(({ filePath, override }) => {
  if (fs.existsSync(filePath)) {
    dotenv.config({ path: filePath, override });
  }
});

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  console.error('ERROR: MONGODB_URI environment variable is not set.');
  console.error('Please ensure your .env file contains MONGODB_URI');
  process.exit(1);
}

async function checkStudentNames() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('Connected to MongoDB');

    // Find the test students
    const testStudentNumbers = [
      '2024-BEED-84690',
      '2024-BEED-28391', 
      '2025-BSED-ENGLISH-59006',
      '2024-BSED-ENGLISH-20375',
      '2026-103-51827',
      '2026-102-20298',
      '2026-102-92847',
      '2026-201-92455',
      '2026-201-45474',
      '2026-103-44340'
    ];

    console.log('Checking student name data...\n');
    
    for (const studentNumber of testStudentNumbers) {
      const student = await Student.findOne({ studentNumber });
      
      if (student) {
        console.log(`Student: ${studentNumber}`);
        console.log(`  First Name: "${student.firstName}"`);
        console.log(`  Middle Name: "${student.middleName}"`);
        console.log(`  Last Name: "${student.lastName}"`);
        console.log(`  Expected Initials: ${student.firstName?.charAt(0)?.toLowerCase() || ''}${student.middleName?.charAt(0)?.toLowerCase() || ''}${student.lastName?.charAt(0)?.toLowerCase() || ''}`);
        console.log('');
      } else {
        console.log(`Student not found: ${studentNumber}\n`);
      }
    }

  } catch (error) {
    console.error('Error checking student names:', error);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
  }
}

checkStudentNames()
  .then(() => {
    console.log('Script completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Script failed:', error);
    process.exit(1);
  });
