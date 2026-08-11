/**
 * Comprehensive Diagnostic: Curriculum, Orphaned Enrollments, BlockGroups
 *
 * Read-only investigation. Does NOT modify any records.
 */

const mongoose = require('mongoose');
require('dotenv').config();

const MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI;

async function run() {
  console.log('=== COMPREHENSIVE DIAGNOSTIC ===\n');
  await mongoose.connect(MONGO_URI);
  const db = mongoose.connection.db;

  const Student = require('./models/Student');
  const Enrollment = require('./models/Enrollment');
  const Curriculum = require('./models/Curriculum');
  const BlockGroup = require('./models/BlockGroup');
  const BlockSection = require('./models/BlockSection');
  const AuditLog = require('./models/AuditLog');

  // === 1. CURRICULUM INVESTIGATION ===
  console.log('=== 1. CURRICULUM INVESTIGATION ===\n');

  const curricula = await Curriculum.find({}).lean();
  console.log(`Curriculum documents in database: ${curricula.length}`);
  if (curricula.length > 0) {
    for (const c of curricula) {
      console.log(`  _id: ${c._id}, programCode: ${c.programCode}, programName: ${c.programName}, version: ${c.version}, status: ${c.status}`);
    }
  }
  console.log('');

  // Check audit logs for any curriculum-related activity
  const curriculumAuditLogs = await AuditLog.find({
    $or: [
      { action: /curriculum/i },
      { entity: /curriculum/i },
      { description: /curriculum/i },
      { 'changes.curriculumId': { $exists: true } },
    ]
  }).sort({ createdAt: -1 }).limit(20).lean();
  console.log(`Curriculum-related audit logs: ${curriculumAuditLogs.length}`);
  for (const log of curriculumAuditLogs) {
    console.log(`  ${log.createdAt} | ${log.action} | ${log.description || ''} | admin: ${log.adminId || 'N/A'}`);
  }
  console.log('');

  // Check backups collection for curriculum data
  const backupsCollection = db.collection('backups');
  const backupsWithCurriculum = await backupsCollection.find({
    $or: [
      { 'data.curriculums': { $exists: true } },
      { 'data.curricula': { $exists: true } },
      { 'collections.curriculums': { $exists: true } },
    ]
  }).sort({ createdAt: -1 }).limit(5).toArray();
  console.log(`Backups containing curriculum data: ${backupsWithCurriculum.length}`);
  for (const backup of backupsWithCurriculum) {
    const currData = backup.data?.curriculums || backup.data?.curricula || backup.collections?.curriculums;
    const count = Array.isArray(currData) ? currData.length : (typeof currData === 'object' ? Object.keys(currData).length : 'unknown');
    console.log(`  Backup ${backup._id} (${backup.createdAt}): ${count} curriculum records`);
    if (Array.isArray(currData) && currData.length > 0) {
      for (const c of currData.slice(0, 5)) {
        console.log(`    _id: ${c._id}, programCode: ${c.programCode}, version: ${c.version}, status: ${c.status}`);
      }
    }
  }
  console.log('');

  // Check if enterpriseArchitectureBackfill was ever run (check audit logs)
  const migrationAuditLogs = await AuditLog.find({
    $or: [
      { action: /migration/i },
      { description: /backfill/i },
      { description: /enterprise/i },
    ]
  }).sort({ createdAt: -1 }).limit(10).lean();
  console.log(`Migration-related audit logs: ${migrationAuditLogs.length}`);
  for (const log of migrationAuditLogs) {
    console.log(`  ${log.createdAt} | ${log.action} | ${log.description || ''}`);
  }
  console.log('');

  // Program/course mapping from codebase
  console.log('Program/Course mapping (from codebase):');
  console.log('  101 → BEED (Bachelor of Elementary Education)');
  console.log('  102 → BSED (Bachelor of Secondary Education - English)');
  console.log('  103 → BSED (Bachelor of Secondary Education - Math) [rollover] / BSIT [enterpriseArchitectureBackfill]');
  console.log('  201 → BSBA (Bachelor of Science in Business Administration - HRM)');
  console.log('  NOTE: enterpriseArchitectureBackfill.js uses 103=BSIT, but rollover uses 103=BSED');
  console.log('');

  // === 2. ORPHANED ENROLLMENTS INVESTIGATION ===
  console.log('=== 2. ORPHANED ENROLLMENTS INVESTIGATION ===\n');

  const orphanedIds = [
    '6992fc4200197bc8a896a683',
    '69a8262ba4488438976f770f',
    '6a74128558d6007e2a95e8f0',
  ];

  for (const enrollId of orphanedIds) {
    const enrollment = await Enrollment.findById(enrollId).lean();
    if (!enrollment) {
      console.log(`Enrollment ${enrollId}: NOT FOUND`);
      continue;
    }

    console.log(`Enrollment ${enrollId}:`);
    console.log(`  studentId: ${enrollment.studentId}`);
    console.log(`  studentNumber: ${enrollment.studentNumber || 'N/A'}`);
    console.log(`  course: ${enrollment.course}`);
    console.log(`  yearLevel: ${enrollment.yearLevel}`);
    console.log(`  schoolYear: ${enrollment.schoolYear}`);
    console.log(`  semester: ${enrollment.semester}`);
    console.log(`  status: ${enrollment.status}`);
    console.log(`  curriculumId: ${enrollment.curriculumId || 'null'}`);
    console.log(`  lockedAt: ${enrollment.lockedAt || 'null'}`);
    console.log(`  createdAt: ${enrollment.createdAt}`);
    console.log(`  updatedAt: ${enrollment.updatedAt}`);
    console.log(`  createdBy: ${enrollment.createdBy || 'N/A'}`);
    console.log(`  subjects count: ${enrollment.subjects?.length || 0}`);
    console.log('');

    // Search audit logs for this enrollment
    const enrollAuditLogs = await AuditLog.find({
      $or: [
        { 'entityId': enrollId },
        { 'metadata.enrollmentId': enrollId },
        { 'changes.enrollmentId': enrollId },
        { description: new RegExp(enrollId, 'i') },
      ]
    }).sort({ createdAt: -1 }).limit(10).lean();
    console.log(`  Audit logs for this enrollment: ${enrollAuditLogs.length}`);
    for (const log of enrollAuditLogs) {
      console.log(`    ${log.createdAt} | ${log.action} | ${log.description || ''} | admin: ${log.adminId || 'N/A'}`);
    }
    console.log('');

    // Search audit logs for the studentId
    const studentIdStr = String(enrollment.studentId);
    const studentAuditLogs = await AuditLog.find({
      $or: [
        { 'entityId': studentIdStr },
        { 'metadata.studentId': studentIdStr },
        { 'changes.studentId': studentIdStr },
        { description: new RegExp(studentIdStr, 'i') },
      ]
    }).sort({ createdAt: -1 }).limit(10).lean();
    console.log(`  Audit logs for studentId ${studentIdStr}: ${studentAuditLogs.length}`);
    for (const log of studentAuditLogs) {
      console.log(`    ${log.createdAt} | ${log.action} | ${log.description || ''} | admin: ${log.adminId || 'N/A'}`);
    }
    console.log('');

    // Search backups for this studentId
    const backupsWithStudent = await backupsCollection.find({
      $or: [
        { 'data.students': { $elemMatch: { _id: studentIdStr } } },
        { 'data.students': { $elemMatch: { _id: enrollment.studentId } } },
      ]
    }).sort({ createdAt: -1 }).limit(5).toArray();
    console.log(`  Backups containing studentId ${studentIdStr}: ${backupsWithStudent.length}`);
    for (const backup of backupsWithStudent) {
      const students = backup.data?.students || [];
      const found = students.find(s => String(s._id) === studentIdStr);
      if (found) {
        console.log(`    Backup ${backup._id} (${backup.createdAt}):`);
        console.log(`      Student _id: ${found._id}`);
        console.log(`      studentNumber: ${found.studentNumber}`);
        console.log(`      name: ${found.firstName} ${found.lastName}`);
        console.log(`      course: ${found.course}`);
        console.log(`      curriculumVersion: ${found.curriculumVersion || 'null'}`);
        console.log(`      isActive: ${found.isActive}`);
        console.log(`      studentStatus: ${found.studentStatus || 'N/A'}`);
      }
    }
    console.log('');
  }

  // === 3. DUPLICATE MISSING STUDENT (69954feb...) ===
  console.log('=== 3. DUPLICATE MISSING STUDENT 69954febb7be5a2a7ee6bd00 ===\n');

  const missingStudentId = '69954febb7be5a2a7ee6bd00';
  const missingStudentAuditLogs = await AuditLog.find({
    $or: [
      { 'entityId': missingStudentId },
      { 'metadata.studentId': missingStudentId },
      { description: new RegExp(missingStudentId, 'i') },
    ]
  }).sort({ createdAt: -1 }).limit(20).lean();
  console.log(`Audit logs for missing student ${missingStudentId}: ${missingStudentAuditLogs.length}`);
  for (const log of missingStudentAuditLogs) {
    console.log(`  ${log.createdAt} | ${log.action} | ${log.description || ''} | admin: ${log.adminId || 'N/A'}`);
    if (log.changes) {
      const changeKeys = Object.keys(log.changes);
      console.log(`    changes: ${changeKeys.join(', ')}`);
    }
  }
  console.log('');

  // Search backups for this student
  const backupsWithMissingStudent = await backupsCollection.find({
    'data.students': { $elemMatch: { _id: missingStudentId } }
  }).sort({ createdAt: -1 }).limit(10).toArray();
  console.log(`Backups containing student ${missingStudentId}: ${backupsWithMissingStudent.length}`);
  for (const backup of backupsWithMissingStudent) {
    const students = backup.data?.students || [];
    const found = students.find(s => String(s._id) === missingStudentId);
    if (found) {
      console.log(`  Backup ${backup._id} (${backup.createdAt}):`);
      console.log(`    studentNumber: ${found.studentNumber}`);
      console.log(`    name: ${found.firstName} ${found.lastName}`);
      console.log(`    course: ${found.course}`);
      console.log(`    curriculumVersion: ${found.curriculumVersion || 'null'}`);
      console.log(`    isActive: ${found.isActive}`);
      console.log(`    studentStatus: ${found.studentStatus || 'N/A'}`);
      console.log(`    yearLevel: ${found.yearLevel}`);
      console.log(`    schoolYear: ${found.schoolYear}`);
      console.log(`    semester: ${found.semester}`);
    }
  }
  console.log('');

  // === 4. BSED/BSBA-HRM MISMATCH ===
  console.log('=== 4. BSED/BSBA-HRM MISMATCH ===\n');

  const mismatchEnrollment = await Enrollment.findById('6992fc4200197bc8a896a683').lean();
  console.log(`Enrollment 6992fc42...:`);
  console.log(`  course: ${mismatchEnrollment?.course}`);
  console.log(`  studentNumber: ${mismatchEnrollment?.studentNumber}`);
  console.log(`  studentId: ${mismatchEnrollment?.studentId}`);
  console.log('');

  // The studentNumber "2024-BSBA-HRM-95392" suggests course 201 (BSBA)
  // But enrollment.course is BSED (which maps to 102 or 103)
  // Check if any student has this studentNumber
  const studentByNumber = await Student.findOne({ studentNumber: '2024-BSBA-HRM-95392' }).lean();
  console.log(`Student with studentNumber '2024-BSBA-HRM-95392': ${studentByNumber ? 'FOUND' : 'NOT FOUND'}`);
  if (studentByNumber) {
    console.log(`  _id: ${studentByNumber._id}`);
    console.log(`  course: ${studentByNumber.course}`);
    console.log(`  name: ${studentByNumber.firstName} ${studentByNumber.lastName}`);
  }

  // Also check if any backup has this student
  const backupsWithMismatchStudent = await backupsCollection.find({
    'data.students': { $elemMatch: { studentNumber: '2024-BSBA-HRM-95392' } }
  }).sort({ createdAt: -1 }).limit(5).toArray();
  console.log(`Backups with studentNumber '2024-BSBA-HRM-95392': ${backupsWithMismatchStudent.length}`);
  for (const backup of backupsWithMismatchStudent) {
    const students = backup.data?.students || [];
    const found = students.find(s => s.studentNumber === '2024-BSBA-HRM-95392');
    if (found) {
      console.log(`  Backup ${backup._id} (${backup.createdAt}):`);
      console.log(`    _id: ${found._id}`);
      console.log(`    course: ${found.course}`);
      console.log(`    name: ${found.firstName} ${found.lastName}`);
      console.log(`    curriculumVersion: ${found.curriculumVersion || 'null'}`);
    }
  }
  console.log('');

  // === 5. LORENZE'S MISSING CURRICULUM ===
  console.log('=== 5. LORENZE\'S MISSING CURRICULUM ===\n');

  const lorenze = await Student.findById('699338a411ff7f29020f334a').lean();
  if (lorenze) {
    console.log(`Student: ${lorenze.firstName} ${lorenze.lastName}`);
    console.log(`  _id: ${lorenze._id}`);
    console.log(`  studentNumber: ${lorenze.studentNumber}`);
    console.log(`  course: ${lorenze.course}`);
    console.log(`  curriculumVersion: ${lorenze.curriculumVersion || 'null'}`);
    console.log(`  yearLevel: ${lorenze.yearLevel}`);
    console.log(`  schoolYear: ${lorenze.schoolYear}`);
    console.log(`  semester: ${lorenze.semester}`);
    console.log(`  studentStatus: ${lorenze.studentStatus || 'N/A'}`);
    console.log(`  classification: ${lorenze.classification || 'N/A'}`);
    console.log(`  isActive: ${lorenze.isActive}`);
    console.log(`  createdAt: ${lorenze.createdAt}`);
    console.log(`  updatedAt: ${lorenze.updatedAt}`);
  }

  // Lorenze's enrollment
  const lorenzeEnrollment = await Enrollment.findOne({ studentId: '699338a411ff7f29020f334a' }).lean();
  if (lorenzeEnrollment) {
    console.log(`\nEnrollment:`);
    console.log(`  _id: ${lorenzeEnrollment._id}`);
    console.log(`  course: ${lorenzeEnrollment.course}`);
    console.log(`  yearLevel: ${lorenzeEnrollment.yearLevel}`);
    console.log(`  schoolYear: ${lorenzeEnrollment.schoolYear}`);
    console.log(`  semester: ${lorenzeEnrollment.semester}`);
    console.log(`  status: ${lorenzeEnrollment.status}`);
    console.log(`  curriculumId: ${lorenzeEnrollment.curriculumId || 'null'}`);
  }

  // Audit logs for Lorenze
  const lorenzeAuditLogs = await AuditLog.find({
    $or: [
      { 'entityId': String(lorenze._id) },
      { 'metadata.studentId': String(lorenze._id) },
    ]
  }).sort({ createdAt: -1 }).limit(20).lean();
  console.log(`\nAudit logs for Lorenze: ${lorenzeAuditLogs.length}`);
  for (const log of lorenzeAuditLogs) {
    console.log(`  ${log.createdAt} | ${log.action} | ${log.description || ''}`);
    if (log.changes && log.changes.curriculumVersion !== undefined) {
      console.log(`    curriculumVersion changed: ${JSON.stringify(log.changes.curriculumVersion)}`);
    }
  }
  console.log('');

  // Check applicants for Lorenze
  const applicantsCollection = db.collection('applicants');
  const lorenzeApplicant = await applicantsCollection.findOne({
    $or: [
      { studentNumber: lorenze.studentNumber },
      { firstName: lorenze.firstName, lastName: lorenze.lastName },
    ]
  });
  console.log(`Applicant record for Lorenze: ${lorenzeApplicant ? 'FOUND' : 'NOT FOUND'}`);
  if (lorenzeApplicant) {
    console.log(`  _id: ${lorenzeApplicant._id}`);
    console.log(`  course: ${lorenzeApplicant.course || 'N/A'}`);
    console.log(`  curriculumVersion: ${lorenzeApplicant.curriculumVersion || 'N/A'}`);
    console.log(`  createdAt: ${lorenzeApplicant.createdAt}`);
  }
  console.log('');

  // === 6. BLOCKGROUPS ===
  console.log('=== 6. BLOCKGROUPS ===\n');

  const blockGroups = await BlockGroup.find({}).lean();
  console.log(`BlockGroups: ${blockGroups.length}`);
  for (const group of blockGroups) {
    console.log(`  _id: ${group._id}`);
    console.log(`    name: ${group.name}`);
    console.log(`    courseId: ${group.courseId}`);
    console.log(`    courseCode: ${group.courseCode || 'N/A'}`);
    console.log(`    yearLevel: ${group.yearLevel}`);
    console.log(`    semester: ${group.semester}`);
    console.log(`    schoolYear: ${group.schoolYear || 'N/A'}`);
    console.log(`    year: ${group.year}`);
    console.log(`    section: ${group.section || 'N/A'}`);
    console.log(`    curriculumId: ${group.curriculumId || 'null'}`);
    console.log(`    studentClassification: ${group.studentClassification || 'All'}`);
    console.log(`    createdAt: ${group.createdAt}`);
    console.log('');

    // Check if curriculumId resolves
    if (group.curriculumId) {
      const linkedCurriculum = await Curriculum.findById(group.curriculumId).lean();
      console.log(`    → Curriculum lookup: ${linkedCurriculum ? 'FOUND' : 'NOT FOUND (dangling reference)'}`);
      if (linkedCurriculum) {
        console.log(`      programCode: ${linkedCurriculum.programCode}, version: ${linkedCurriculum.version}, status: ${linkedCurriculum.status}`);
      }
    }
    console.log('');
  }

  // BlockSections
  const blockSections = await BlockSection.find({}).lean();
  console.log(`BlockSections: ${blockSections.length}`);
  for (const section of blockSections) {
    console.log(`  _id: ${section._id}`);
    console.log(`    sectionCode: ${section.sectionCode}`);
    console.log(`    capacity: ${section.capacity}`);
    console.log(`    currentPopulation: ${section.currentPopulation}`);
    console.log(`    status: ${section.status || 'N/A'}`);
    console.log(`    groupId: ${section.groupId || 'N/A'}`);
    console.log('');
  }

  // === 7. ALL STUDENTS SUMMARY ===
  console.log('=== 7. ALL STUDENTS SUMMARY ===\n');

  const allStudents = await Student.find({}).select('_id studentNumber firstName lastName course curriculumVersion yearLevel schoolYear semester studentStatus isActive createdAt').lean();
  for (const s of allStudents) {
    console.log(`  _id: ${s._id}`);
    console.log(`    studentNumber: ${s.studentNumber}`);
    console.log(`    name: ${s.firstName} ${s.lastName}`);
    console.log(`    course: ${s.course}`);
    console.log(`    curriculumVersion: ${s.curriculumVersion || 'null'}`);
    console.log(`    yearLevel: ${s.yearLevel}`);
    console.log(`    schoolYear: ${s.schoolYear || 'N/A'}`);
    console.log(`    semester: ${s.semester || 'N/A'}`);
    console.log(`    studentStatus: ${s.studentStatus || 'N/A'}`);
    console.log(`    isActive: ${s.isActive}`);
    console.log(`    createdAt: ${s.createdAt}`);
    console.log('');
  }

  await mongoose.disconnect();
  console.log('Diagnostic complete.');
}

run().catch((error) => {
  console.error('Diagnostic failed:', error);
  process.exit(1);
});
