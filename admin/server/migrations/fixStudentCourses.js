/**
 * Migration: Fix Student Course Assignments
 * 
 * This script fixes student course assignments by:
 * 1. Converting String course values to Number enum values
 * 2. Assigning default courses to students without valid courses
 * 3. Ensuring all students have valid course assignments (101, 102, 103, or 201)
 * 
 * Course Mapping:
 * 101: Bachelor of Elementary Education (BEED)
 * 102: Bachelor of Secondary Education – Major in English
 * 103: Bachelor of Secondary Education – Major in Mathematics
 * 201: Bachelor of Science in Business Administration – Major in HRM
 * 
 * Run: node migrations/fixStudentCourses.js
 */

const mongoose = require('mongoose');
const Student = require('../models/Student');
const Enrollment = require('../models/Enrollment');
const path = require('path');
const fs = require('fs');

// Load environment variables from multiple possible locations
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
  console.error('Please ensure your .env file contains MONGODB_URI');
  process.exit(1);
}

// Course mapping for String to Number conversion
const COURSE_MAPPING = {
  'BEED': 101,
  'Bachelor of Elementary Education': 101,
  'BSED': 102, // Default to English if no major specified
  'BSED-ENGLISH': 102,
  'BSED-ENGL': 102,
  'ENGLISH': 102,
  'BSED-MATH': 103,
  'BSED-MATHEMATICS': 103,
  'MATH': 103,
  'MATHEMATICS': 103,
  'BSBA': 201,
  'BSBA-HRM': 201,
  'HRM': 201,
  'BUSINESS ADMINISTRATION': 201
};

const VALID_COURSES = [101, 102, 103, 201];
const DEFAULT_COURSE = 101; // BEED as safe default

const COURSE_LABELS = {
  101: 'BEED (Elementary Education)',
  102: 'BSED-English',
  103: 'BSED-Mathematics',
  201: 'BSBA-HRM'
};

/**
 * Convert String course to Number course
 */
function convertCourseToNumber(courseValue) {
  if (typeof courseValue === 'number' && VALID_COURSES.includes(courseValue)) {
    return courseValue; // Already valid
  }
  
  if (typeof courseValue === 'string') {
    const upperCourse = courseValue.toUpperCase().trim();
    return COURSE_MAPPING[upperCourse] || DEFAULT_COURSE;
  }
  
  return DEFAULT_COURSE;
}

/**
 * Determine appropriate course for a student
 */
async function determineCourseForStudent(student) {
  // If student already has valid course, keep it
  if (typeof student.course === 'number' && VALID_COURSES.includes(student.course)) {
    return student.course;
  }
  
  // Try to convert String course to Number
  if (student.course) {
    const converted = convertCourseToNumber(student.course);
    if (converted !== student.course) {
      return converted;
    }
  }
  
  // Try to get course from enrollment
  try {
    const enrollment = await Enrollment.findOne({
      studentId: student._id,
      isCurrent: true
    }).sort({ createdAt: -1 });
    
    if (enrollment && enrollment.course) {
      const converted = convertCourseToNumber(enrollment.course);
      if (VALID_COURSES.includes(converted)) {
        return converted;
      }
    }
  } catch (error) {
    console.error(`Error checking enrollment for ${student.studentNumber}:`, error.message);
  }
  
  // Default to BEED
  return DEFAULT_COURSE;
}

async function fixStudentCourses() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('Connected to MongoDB\n');

    // Create backup before migration
    console.log('Creating backup of current student data...');
    const allStudents = await Student.find({}).lean();
    const backupPath = path.join(__dirname, 'student-courses-backup.json');
    fs.writeFileSync(backupPath, JSON.stringify(allStudents, null, 2));
    console.log(`Backup saved to: ${backupPath}\n`);

    // Find students needing course fixes
    const studentsNeedingFix = await Student.find({
      $or: [
        { course: { $exists: false } },
        { course: null },
        { course: '' },
        { course: { $type: 'string' } },
        { course: { $nin: VALID_COURSES, $type: 'number' } }
      ]
    });

    console.log(`Found ${studentsNeedingFix.length} students requiring course fixes\n`);

    if (studentsNeedingFix.length === 0) {
      console.log('No students require course fixes. All students already have valid courses.');
      return;
    }

    let successCount = 0;
    let failureCount = 0;
    const results = [];

    for (const student of studentsNeedingFix) {
      try {
        const oldCourse = student.course;
        const newCourse = await determineCourseForStudent(student);
        
        student.course = newCourse;
        await student.save();
        
        successCount++;
        const changeType = oldCourse === newCourse ? 'No change needed' : 'Converted';
        
        results.push({
          studentNumber: student.studentNumber,
          name: `${student.firstName} ${student.lastName}`,
          oldCourse: oldCourse,
          newCourse: newCourse,
          courseLabel: COURSE_LABELS[newCourse],
          changeType,
          status: 'success'
        });
        
        console.log(`✓ ${student.studentNumber} | ${student.firstName} ${student.lastName}`);
        console.log(`  Old course: ${oldCourse || 'missing'}`);
        console.log(`  New course: ${newCourse} (${COURSE_LABELS[newCourse]})`);
        console.log(`  Action: ${changeType}\n`);
        
      } catch (error) {
        failureCount++;
        results.push({
          studentNumber: student.studentNumber,
          name: `${student.firstName} ${student.lastName}`,
          oldCourse: student.course,
          error: error.message,
          status: 'failed'
        });
        console.error(`✗ Failed to fix course for ${student.studentNumber}:`, error.message);
      }
    }

    console.log('\n=== Migration Summary ===');
    console.log(`Total students processed: ${studentsNeedingFix.length}`);
    console.log(`Successful: ${successCount}`);
    console.log(`Failed: ${failureCount}`);

    if (successCount > 0) {
      console.log('\n=== Successful Changes ===');
      results
        .filter(r => r.status === 'success' && r.changeType !== 'No change needed')
        .forEach(r => {
          console.log(`${r.studentNumber} | ${r.name}`);
          console.log(`  ${r.oldCourse || 'missing'} → ${r.newCourse} (${r.courseLabel})`);
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

    // Save migration results
    const resultsPath = path.join(__dirname, 'student-courses-migration-results.json');
    const migrationReport = {
      timestamp: new Date().toISOString(),
      totalProcessed: studentsNeedingFix.length,
      successful: successCount,
      failed: failureCount,
      backupFile: backupPath,
      changes: results
    };
    fs.writeFileSync(resultsPath, JSON.stringify(migrationReport, null, 2));
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
fixStudentCourses()
  .then(() => {
    console.log('Migration completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Migration failed:', error);
    process.exit(1);
  });