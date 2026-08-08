/**
 * Test Script: Course Validation
 * 
 * This script tests the enhanced course validation by attempting
 * to create students with various course scenarios.
 * 
 * Run: node scripts/testCourseValidation.js
 */

const mongoose = require('mongoose');
const Student = require('../models/Student');
const StudentController = require('../controllers/studentController');
const Admin = require('../models/Admin');
const path = require('path');
const fs = require('fs');

// Load environment variables
const envFileCandidates = [
  { filePath: path.join(__dirname, '..', '..', '.env'), override: false },
  { filePath: path.join(__dirname, '..', '..', '.env.credential-details'), override: true },
  { filePath: path.join(__dirname, '..', '..', '.env.credentail-details'), override: true }
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
  process.exit(1);
}

async function testCourseValidation() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('Connected to MongoDB\n');

    // Get a valid admin ID for testing
    const admin = await Admin.findOne({}).select('_id').lean();
    const adminId = admin ? admin._id : new mongoose.Types.ObjectId();

    const testCases = [
      {
        name: 'Valid course (101)',
        data: {
          firstName: 'Test',
          lastName: 'Student1',
          course: 101,
          yearLevel: 1,
          semester: '1st',
          schoolYear: '2024-2025',
          contactNumber: '1234567890',
          address: 'Test Address',
          createdBy: adminId
        },
        shouldSucceed: true
      },
      {
        name: 'Missing course',
        data: {
          firstName: 'Test',
          lastName: 'Student2',
          yearLevel: 1,
          semester: '1st',
          schoolYear: '2024-2025',
          contactNumber: '1234567890',
          address: 'Test Address',
          createdBy: adminId
        },
        shouldSucceed: false
      },
      {
        name: 'Invalid course number (999)',
        data: {
          firstName: 'Test',
          lastName: 'Student3',
          course: 999,
          yearLevel: 1,
          semester: '1st',
          schoolYear: '2024-2025',
          contactNumber: '1234567890',
          address: 'Test Address',
          createdBy: adminId
        },
        shouldSucceed: false
      },
      {
        name: 'String course (BEED) - should convert to 101',
        data: {
          firstName: 'Test',
          lastName: 'Student4',
          course: 'BEED',
          yearLevel: 1,
          semester: '1st',
          schoolYear: '2024-2025',
          contactNumber: '1234567890',
          address: 'Test Address',
          createdBy: adminId
        },
        shouldSucceed: true
      },
      {
        name: 'Invalid string course',
        data: {
          firstName: 'Test',
          lastName: 'Student5',
          course: 'INVALID',
          yearLevel: 1,
          semester: '1st',
          schoolYear: '2024-2025',
          contactNumber: '1234567890',
          address: 'Test Address',
          createdBy: adminId
        },
        shouldSucceed: false
      }
    ];

    console.log('=== Testing Course Validation ===\n');

    for (const testCase of testCases) {
      console.log(`Test: ${testCase.name}`);
      try {
        const student = await StudentController.createStudentRecord(testCase.data);
        
        if (testCase.shouldSucceed) {
          console.log(`✓ PASSED - Student created successfully`);
          console.log(`  Student Number: ${student.studentNumber}`);
          console.log(`  Course: ${student.course} (type: ${typeof student.course})`);
          
          // For string course test, verify conversion
          if (testCase.name.includes('String course')) {
            if (typeof student.course === 'number') {
              console.log(`  Course properly converted from string to number`);
            } else {
              console.log(`  WARNING: Course not converted (still ${typeof student.course})`);
            }
          }
          console.log();
          
          // Clean up test student
          await Student.findByIdAndDelete(student._id);
        } else {
          console.log(`✗ FAILED - Expected error but student was created`);
          console.log(`  Student Number: ${student.studentNumber}\n`);
          
          // Clean up test student
          await Student.findByIdAndDelete(student._id);
        }
      } catch (error) {
        if (!testCase.shouldSucceed) {
          console.log(`✓ PASSED - Correctly rejected with error: ${error.message}\n`);
        } else {
          console.log(`✗ FAILED - Expected success but got error: ${error.message}\n`);
        }
      }
    }

    console.log('=== Validation Test Complete ===');

  } catch (error) {
    console.error('Test failed:', error);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('\nDisconnected from MongoDB');
  }
}

// Run the test
testCourseValidation()
  .then(() => {
    console.log('Test completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Test failed:', error);
    process.exit(1);
  });