/**
 * Clear passwords for test students
 * Run: node server/scripts/clearTestStudentPasswords.js
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

async function clearTestStudentPasswords() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('Connected to MongoDB');

    // Find students with the test student numbers
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

    console.log('Clearing passwords for test students...');
    
    let clearedCount = 0;
    for (const studentNumber of testStudentNumbers) {
      const result = await Student.updateOne(
        { studentNumber },
        { $unset: { password: '' } }
      );
      
      if (result.modifiedCount > 0) {
        clearedCount++;
        console.log(`✓ Cleared password for ${studentNumber}`);
      } else {
        console.log(`- No password found for ${studentNumber} or student not found`);
      }
    }

    console.log(`\nCleared passwords for ${clearedCount} test students`);
    console.log('You can now regenerate them using the Student Passwords UI');

  } catch (error) {
    console.error('Error clearing passwords:', error);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('\nDisconnected from MongoDB');
  }
}

clearTestStudentPasswords()
  .then(() => {
    console.log('Script completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Script failed:', error);
    process.exit(1);
  });
