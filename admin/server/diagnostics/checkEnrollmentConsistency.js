/**
 * Data Consistency Diagnostic: Enrollment vs Student.enrollmentStatus
 *
 * Identifies inconsistencies between:
 *   - Student.enrollmentStatus (denormalized display field)
 *   - Enrollment collection (authoritative academic-period record)
 *
 * Checks for:
 *   1. Student says "Enrolled" but no matching Enrollment exists
 *   2. Enrollment exists but isCurrent=false
 *   3. Enrollment has wrong school year
 *   4. Enrollment has wrong semester
 *   5. Enrollment has invalid/missing curriculumId
 *   6. Enrollment has invalid/missing program
 *   7. Duplicate current enrollments (multiple isCurrent=true for same student)
 *
 * Usage:
 *   node diagnostics/checkEnrollmentConsistency.js
 *
 * This diagnostic is READ-ONLY. It never modifies data.
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });
const mongoose = require('mongoose');
const Student = require('../models/Student');
const Enrollment = require('../models/Enrollment');
const Curriculum = require('../models/Curriculum');
const { normalizeCourseCode } = require('../lib/programMapping');

async function run() {
  const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI;
  if (!mongoUri) {
    console.error('ERROR: MONGODB_URI not set in environment');
    process.exit(1);
  }

  await mongoose.connect(mongoUri);
  console.log('Connected to MongoDB\n');
  console.log('═══════════════════════════════════════════════════');
  console.log('       ENROLLMENT CONSISTENCY DIAGNOSTIC');
  console.log('═══════════════════════════════════════════════════\n');

  const allStudents = await Student.find({})
    .select('_id studentNumber course yearLevel semester schoolYear curriculumVersion lifecycleStatus enrollmentStatus firstName lastName')
    .lean();

  const findings = {
    totalStudents: allStudents.length,
    enrolledStudents: 0,
    noEnrollmentRecord: [],
    notCurrentEnrollment: [],
    wrongSchoolYear: [],
    wrongSemester: [],
    invalidCurriculum: [],
    invalidProgram: [],
    duplicateCurrentEnrollments: [],
  };

  for (const student of allStudents) {
    const tag = `[${student.studentNumber || student._id}]`;

    if (student.lifecycleStatus === 'Enrolled') {
      findings.enrolledStudents++;
    }

    // Find all enrollments for this student
    const enrollments = await Enrollment.find({ studentId: student._id }).lean();
    const currentEnrollments = enrollments.filter((e) => e.isCurrent);

    // Check for duplicate current enrollments
    if (currentEnrollments.length > 1) {
      findings.duplicateCurrentEnrollments.push({
        tag,
        count: currentEnrollments.length,
        details: currentEnrollments.map((e) => `${e.schoolYear} ${e.semester} (${e.status})`),
      });
    }

    // Find matching enrollment for student's current academic period
    const expectedSchoolYear = student.schoolYear;
    const expectedSemester = student.semester || '1st';

    const matchingEnrollment = enrollments.find(
      (e) => e.schoolYear === expectedSchoolYear && e.semester === expectedSemester
    );

    if (student.lifecycleStatus === 'Enrolled') {
      if (!matchingEnrollment) {
        findings.noEnrollmentRecord.push({
          tag,
          schoolYear: expectedSchoolYear,
          semester: expectedSemester,
          course: student.course,
        });
      } else {
        // Check isCurrent
        if (!matchingEnrollment.isCurrent) {
          findings.notCurrentEnrollment.push({
            tag,
            schoolYear: expectedSchoolYear,
            semester: expectedSemester,
          });
        }

        // Check curriculumId
        if (!matchingEnrollment.curriculumId) {
          findings.invalidCurriculum.push({
            tag,
            reason: 'curriculumId is null',
          });
        } else {
          // Validate curriculum exists
          const curriculum = await Curriculum.findById(matchingEnrollment.curriculumId).select('_id programCode status').lean();
          if (!curriculum) {
            findings.invalidCurriculum.push({
              tag,
              reason: `curriculumId ${matchingEnrollment.curriculumId} not found in Curriculum collection`,
            });
          } else if (Number(curriculum.programCode) !== Number(normalizeCourseCode(student.course))) {
            findings.invalidCurriculum.push({
              tag,
              reason: `curriculum programCode ${curriculum.programCode} does not match student course ${student.course}`,
            });
          }
        }

        // Check program/course
        const expectedProgramCode = normalizeCourseCode(student.course);
        if (!expectedProgramCode) {
          findings.invalidProgram.push({
            tag,
            reason: `student.course "${student.course}" cannot be normalized`,
          });
        }
      }
    }
  }

  // ─── Print report ───
  console.log(`Total students:                    ${findings.totalStudents}`);
  console.log(`Students with lifecycleStatus=Enrolled: ${findings.enrolledStudents}`);
  console.log('');

  const sections = [
    { label: '1. Student says "Enrolled" but NO Enrollment record exists', data: findings.noEnrollmentRecord },
    { label: '2. Enrollment exists but isCurrent=false', data: findings.notCurrentEnrollment },
    { label: '3. Enrollment has wrong school year', data: findings.wrongSchoolYear },
    { label: '4. Enrollment has wrong semester', data: findings.wrongSemester },
    { label: '5. Enrollment has invalid/missing curriculum', data: findings.invalidCurriculum },
    { label: '6. Enrollment has invalid/missing program', data: findings.invalidProgram },
    { label: '7. Duplicate current enrollments (multiple isCurrent=true)', data: findings.duplicateCurrentEnrollments },
  ];

  for (const section of sections) {
    const count = section.data.length;
    console.log(`─── ${section.label}: ${count} ───`);
    if (count > 0) {
      section.data.forEach((item) => {
        const detail = item.reason || item.details?.join(', ') || `${item.schoolYear || ''} ${item.semester || ''}`.trim();
        console.log(`  ${item.tag} ${detail}`);
      });
    }
    console.log('');
  }

  const totalIssues = sections.reduce((sum, s) => sum + s.data.length, 0);
  console.log('═══════════════════════════════════════════════════');
  console.log(`Total issues found: ${totalIssues}`);
  if (totalIssues === 0) {
    console.log('All enrollment records are consistent.');
  } else {
    console.log('Run migrations/backfillMissingEnrollments.js to fix missing enrollments.');
  }
  console.log('═══════════════════════════════════════════════════');

  await mongoose.disconnect();
}

run().catch((err) => {
  console.error('Diagnostic failed:', err);
  process.exit(1);
});
