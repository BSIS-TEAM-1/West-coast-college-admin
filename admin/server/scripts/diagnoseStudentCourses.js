/**
 * Diagnostic Script: Student Course Assignment Analysis
 * 
 * This script analyzes the current state of student course assignments
 * to identify issues before migration.
 * 
 * Run: node scripts/diagnoseStudentCourses.js
 */

const mongoose = require('mongoose');
const Student = require('../models/Student');
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

async function diagnoseStudentCourses() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('Connected to MongoDB\n');

    // Total student count
    const totalStudents = await Student.countDocuments();
    console.log(`=== Total Students: ${totalStudents} ===\n`);

    // Students without course field
    const noCourseStudents = await Student.countDocuments({ 
      $or: [
        { course: { $exists: false } },
        { course: null },
        { course: '' }
      ]
    });
    console.log(`Students without course field: ${noCourseStudents}`);

    // Students with String course values (legacy data)
    const stringCourseStudents = await Student.find({
      course: { $type: 'string' }
    }).select('studentNumber firstName lastName course').limit(10).lean();
    console.log(`Students with String course values: ${stringCourseStudents.length}`);
    if (stringCourseStudents.length > 0) {
      console.log('Sample String course values:');
      stringCourseStudents.forEach(s => {
        console.log(`  ${s.studentNumber} | ${s.firstName} ${s.lastName} | course: "${s.course}"`);
      });
    }

    // Students with invalid course numbers (outside enum)
    const validCourses = [101, 102, 103, 201];
    const invalidCourseStudents = await Student.find({
      course: { 
        $exists: true,
        $nin: validCourses,
        $type: 'number'
      }
    }).select('studentNumber firstName lastName course').limit(10).lean();
    console.log(`Students with invalid course numbers: ${invalidCourseStudents.length}`);
    if (invalidCourseStudents.length > 0) {
      console.log('Sample invalid course values:');
      invalidCourseStudents.forEach(s => {
        console.log(`  ${s.studentNumber} | ${s.firstName} ${s.lastName} | course: ${s.course}`);
      });
    }

    // Count by course (valid courses only)
    const courseCounts = await Student.aggregate([
      {
        $match: {
          course: { $in: validCourses }
        }
      },
      {
        $group: {
          _id: '$course',
          count: { $sum: 1 }
        }
      },
      {
        $sort: { _id: 1 }
      }
    ]);

    console.log('\n=== Student Count by Valid Course ===');
    const courseLabels = {
      101: 'BEED (Elementary Education)',
      102: 'BSED-English',
      103: 'BSED-Mathematics', 
      201: 'BSBA-HRM'
    };
    
    courseCounts.forEach(item => {
      const label = courseLabels[item._id] || 'Unknown';
      console.log(`  ${item._id} (${label}): ${item.count} students`);
    });

    // Sample students with various course states
    console.log('\n=== Sample Students Analysis ===');
    
    // Students with valid courses
    const validSample = await Student.find({
      course: { $in: validCourses }
    }).select('studentNumber firstName lastName course').limit(3).lean();
    console.log('Students with valid courses:');
    validSample.forEach(s => {
      const label = courseLabels[s.course] || 'Unknown';
      console.log(`  ${s.studentNumber} | ${s.firstName} ${s.lastName} | course: ${s.course} (${label})`);
    });

    // Summary
    console.log('\n=== Diagnostic Summary ===');
    console.log(`Total students: ${totalStudents}`);
    console.log(`Students without course: ${noCourseStudents}`);
    console.log(`Students with String course: ${stringCourseStudents.length}`);
    console.log(`Students with invalid course numbers: ${invalidCourseStudents.length}`);
    
    const studentsNeedingFix = noCourseStudents + stringCourseStudents.length + invalidCourseStudents.length;
    console.log(`Students requiring course fix: ${studentsNeedingFix}`);
    console.log(`Students with valid courses: ${totalStudents - studentsNeedingFix}`);

    // Save diagnostic results
    const results = {
      timestamp: new Date().toISOString(),
      totalStudents,
      noCourseStudents,
      stringCourseStudents: stringCourseStudents.length,
      stringCourseSamples: stringCourseStudents,
      invalidCourseStudents: invalidCourseStudents.length,
      invalidCourseSamples: invalidCourseStudents,
      courseCounts,
      studentsNeedingFix,
      studentsWithValidCourses: totalStudents - studentsNeedingFix
    };

    const resultsPath = path.join(__dirname, 'diagnostic-results.json');
    fs.writeFileSync(resultsPath, JSON.stringify(results, null, 2));
    console.log(`\nDiagnostic results saved to: ${resultsPath}`);

  } catch (error) {
    console.error('Diagnostic failed:', error);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('\nDisconnected from MongoDB');
  }
}

// Run the diagnostic
diagnoseStudentCourses()
  .then(() => {
    console.log('Diagnostic completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Diagnostic failed:', error);
    process.exit(1);
  });