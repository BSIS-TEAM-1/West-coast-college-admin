/**
 * Migration: Add Passwords to Existing Students
 * 
 * This script generates default passwords for all existing students
 * who don't have passwords set.
 * 
 * Password format: {firstInitial}{middleInitial}{lastInitial}{last4Digits}
 * Example: Lorenze Nino F. Prepotente, UID: 2024-101-28391 → lnfp28391
 * 
 * Run: node migrations/addStudentPasswords.js
 */

const mongoose = require('mongoose');
const Student = require('../models/Student');
const StudentPasswordService = require('../services/studentPasswordService');
const path = require('path');
const fs = require('fs');

// Load environment variables from multiple possible locations
const envFileCandidates = [
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

async function migrateStudentPasswords() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('Connected to MongoDB');

    // Find all students without passwords
    const studentsWithoutPasswords = await Student.find({
      $or: [
        { password: { $exists: false } },
        { password: null },
        { password: '' }
      ]
    });

    console.log(`Found ${studentsWithoutPasswords.length} students without passwords`);

    if (studentsWithoutPasswords.length === 0) {
      console.log('No students need password migration. All students already have passwords.');
      return;
    }

    let successCount = 0;
    let failureCount = 0;
    const results = [];

    for (const student of studentsWithoutPasswords) {
      try {
        // Generate default password
        const defaultPassword = StudentPasswordService.generateDefaultPassword(student);
        
        // Set the password (will be hashed by the pre-save hook)
        student.password = defaultPassword;
        
        await student.save();
        
        successCount++;
        results.push({
          studentNumber: student.studentNumber,
          name: `${student.firstName} ${student.lastName}`,
          password: defaultPassword,
          status: 'success'
        });
        
        console.log(`✓ Generated password for ${student.studentNumber}: ${defaultPassword}`);
      } catch (error) {
        failureCount++;
        results.push({
          studentNumber: student.studentNumber,
          name: `${student.firstName} ${student.lastName}`,
          error: error.message,
          status: 'failed'
        });
        console.error(`✗ Failed to generate password for ${student.studentNumber}:`, error.message);
      }
    }

    console.log('\n=== Migration Summary ===');
    console.log(`Total students processed: ${studentsWithoutPasswords.length}`);
    console.log(`Successful: ${successCount}`);
    console.log(`Failed: ${failureCount}`);

    if (successCount > 0) {
      console.log('\n=== Generated Passwords ===');
      results
        .filter(r => r.status === 'success')
        .forEach(r => {
          console.log(`${r.studentNumber} | ${r.name} | Password: ${r.password}`);
        });
    }

    if (failureCount > 0) {
      console.log('\n=== Failed Migrations ===');
      results
        .filter(r => r.status === 'failed')
        .forEach(r => {
          console.log(`${r.studentNumber} | ${r.name} | Error: ${r.error}`);
        });
    }

    // Save results to a file for reference
    const fs = require('fs');
    const resultsPath = './migrations/password-migration-results.json';
    fs.writeFileSync(resultsPath, JSON.stringify(results, null, 2));
    console.log(`\nMigration results saved to: ${resultsPath}`);

  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('\nDisconnected from MongoDB');
  }
}

// Run the migration
migrateStudentPasswords()
  .then(() => {
    console.log('Migration completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Migration failed:', error);
    process.exit(1);
  });