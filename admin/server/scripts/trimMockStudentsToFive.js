/**
 * trimMockStudentsToFive.js
 *
 * Dev-database maintenance (wcc-admin):
 *   1. Removes bulk-generated mock students (created inside the two Oct 20
 *      2026 batch windows) + automated "ZZPROBE" probes, together with their
 *      enrollments and block assignments.
 *   2. Backs up every removed document to a local JSON file BEFORE deleting.
 *   3. Tops every OPEN block section of the active school year up to exactly
 *      5 students (keeping the registrar's own manually-created students in
 *      place), with realistic rollover variety:
 *        - 3 passing grades (promote),
 *        - 1 failing grade (retain),
 *        - 1 missing grade (needs-review exception list).
 *   4. Recomputes BlockSection.currentPopulation from actual assignments.
 *
 * Modes:  node scripts/trimMockStudentsToFive.js --dry-run   (default)
 *         node scripts/trimMockStudentsToFive.js --apply
 */
require('dotenv').config({ path: '../.env' });
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const Student = require('../models/Student');
const Enrollment = require('../models/Enrollment');
const StudentBlockAssignment = require('../models/StudentBlockAssignment');
const BlockGroup = require('../models/BlockGroup');
const BlockSection = require('../models/BlockSection');
const Curriculum = require('../models/Curriculum');
const AuditLog = require('../models/AuditLog');
const Admin = require('../models/Admin');

const APPLY = process.argv.includes('--apply');
const DRY_RUN_FLAG = process.argv.includes('--dry-run');
const DRY_RUN = !APPLY || DRY_RUN_FLAG;

// Only these fields mark a record as auto-generated mock data.
const BULK_START = new Date('2026-10-20T05:40:00.000Z');
const BULK_END = new Date('2026-10-20T07:00:00.000Z');
const SCHOOL_YEAR = '2026-2027';
const SEMESTER = '1st';
const TARGET_PER_SECTION = 5;

const ENROLLMENT_COURSE_BY_CODE = { 101: 'BEED', 102: 'BSED', 103: 'BSED', 201: 'BSBA' };
// 5-slot rollover variety applied per section, in creation order.
const GRADE_PATTERN = [1.25, 1.5, 2.75, 4.0, undefined];

const FIRST_NAMES = [
  'Aiden', 'Bella', 'Cyrus', 'Daniela', 'Ethan', 'Fatima', 'Giovan', 'Hanna',
  'Ivo', 'Jessa', 'Kirvin', 'Lian', 'Mateo', 'Noemi', 'Owen', 'Paula',
  'Quiel', 'Rhian', 'Simon', 'Trisha', 'Uriel', 'Vina', 'Waldo', 'Xander',
  'Ysabel', 'Zandro', 'Aria', 'Brian', 'Celine', 'Diego',
];
const LAST_NAMES = [
  'Abrenica', 'Bagsic', 'Cabatingan', 'Dalisay', 'Escaño', 'Fernandez',
  'Gutierrez', 'Hernando', 'Ilagan', 'Jacinto', 'Katigbak', 'Lorenzo',
  'Manalo', 'Nepomuceno', 'Olivares', 'Padilla', 'Quintos', 'Ravago',
  'Salcedo', 'Tamiyong', 'Umandap', 'Valdez', 'Wenceslao', 'Yanong',
  'Zaballa', 'Bacani', 'Corpuz', 'Dimaisip', 'Enrile', 'Friginal',
];

function studentDisplayNumberName(index) {
  const first = FIRST_NAMES[index % FIRST_NAMES.length];
  const last = LAST_NAMES[(index * 7 + Math.floor(index / FIRST_NAMES.length)) % LAST_NAMES.length];
  return { first, last };
}

async function generateStudentNumber(startYear, course, used) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const digits = String(Math.floor(Math.random() * 90000) + 10000);
    const candidate = `${startYear}${String(course).padStart(3, '0')}${digits}`;
    if (used.has(candidate)) continue;
    const exists = await Student.findOne({ studentNumber: candidate }).lean();
    if (!exists) {
      used.add(candidate);
      return candidate;
    }
  }
  throw new Error('Unable to generate a unique student number');
}

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log(APPLY ? '*** APPLY MODE ***' : 'dry-run mode (no writes). Use --apply to execute.');

  // ---- 1. Identify removal candidates ----
  const candidates = await Student.find({
    $or: [
      { createdAt: { $gte: BULK_START, $lt: BULK_END } },
      { lastName: 'ZZPROBE' },
    ],
  }).lean();
  const candidateIds = candidates.map((s) => s._id);
  const candidateIdStrings = candidateIds.map(String);
  console.log(`Removal candidates: ${candidates.length} students`);

  const removeEnrollments = candidateIdStrings.length
    ? await Enrollment.find({ studentId: { $in: candidateIdStrings } }).lean()
    : [];
  const removeAssignments = candidateIdStrings.length
    ? await StudentBlockAssignment.find({
        $or: [
          { studentId: { $in: candidateIdStrings } },
          { studentId: { $type: 'string', $in: candidateIdStrings } },
        ],
      }).lean()
    : [];
  console.log(`  enrollments: ${removeEnrollments.length}, block assignments: ${removeAssignments.length}`);
  console.log(`  recorded grades on these enrollments: ${removeEnrollments.filter((e) => (e.subjects || []).some((s) => typeof s.grade === 'number')).length}`);

  const keptStudents = await Student.countDocuments({ _id: { $nin: candidateIds } });
  console.log(`  students kept: ${keptStudents}`);

  if (candidates.length === 0) {
    console.log('Nothing to remove.');
  }

  // ---- 2. Backup before any delete ----
  let backupPath = null;
  if (APPLY && candidateIdStrings.length > 0) {
    const backupsDir = path.join(__dirname, '..', 'backups');
    if (!fs.existsSync(backupsDir)) fs.mkdirSync(backupsDir, { recursive: true });
    backupPath = path.join(backupsDir, `mock-students-backup-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
    fs.writeFileSync(backupPath, JSON.stringify({
      capturedAt: new Date().toISOString(),
      note: 'Bulk mock students removed by scripts/trimMockStudentsToFive.js. Restore with mongoimport or a small restore script if needed.',
      students: candidates,
      enrollments: removeEnrollments,
      blockAssignments: removeAssignments,
    }, null, 2));
    console.log(`Backup written: ${backupPath}`);
  }

  // ---- 3. Resolve active curricula once per program ----
  const curricula = await Curriculum.find({ status: 'Active' }).select('programCode _id').lean();
  const curriculumByProgram = new Map();
  for (const c of curricula) {
    const key = Number(c.programCode);
    if (Number.isFinite(key) && !curriculumByProgram.has(key)) curriculumByProgram.set(key, c._id);
  }

  // ---- 4. Top up each OPEN section to TARGET_PER_SECTION ----
  // IMPORTANT: the mock students are (or will be) the majority of each filled
  // section, so the starting count must reflect the POST-DELETION state:
  // existing assignments minus those belonging to removal candidates.
  const candidatesBySection = new Map();
  for (const assignment of removeAssignments) {
    const key = String(assignment.sectionId);
    candidatesBySection.set(key, (candidatesBySection.get(key) || 0) + 1);
  }

  const groups = await BlockGroup.find({}).lean();
  const sections = await BlockSection.find({ status: 'OPEN' }).lean();
  const sectionsByGroup = new Map();
  for (const section of sections) {
    const key = String(section.blockGroupId);
    if (!sectionsByGroup.has(key)) sectionsByGroup.set(key, []);
    sectionsByGroup.get(key).push(section);
  }

  const usedNumbers = new Set();
  let creationIndex = 0;
  const plan = [];
  const newAll = [];
  const touchedSections = [];

  for (const group of groups) {
    const groupSections = sectionsByGroup.get(String(group._id)) || [];
    const section = groupSections.sort((a, b) => b.capacity - a.capacity)[0];
    if (!section) continue;

    const existingAssignments = await StudentBlockAssignment.countDocuments({
      sectionId: section._id,
      status: 'ASSIGNED',
    });
    const candidateCount = candidatesBySection.get(String(section._id)) || 0;
    const startingAssignments = Math.max(0, existingAssignments - candidateCount);
    const need = TARGET_PER_SECTION - startingAssignments;
    if (need <= 0) {
      console.log(`  ${section.sectionCode}: ${startingAssignments}/${TARGET_PER_SECTION} students — no action`);
      continue;
    }

    const created = [];
    for (let slot = 0; slot < need; slot += 1) {
      const { first, last } = studentDisplayNumberName(creationIndex);
      created.push({
        index: creationIndex,
        first,
        last,
        slot,
        group,
        section,
      });
      creationIndex += 1;
    }
    plan.push({ section, group, created });
    console.log(`  ${section.sectionCode}: ${existingAssignments}/${TARGET_PER_SECTION} → create ${need} students`);
  }

  if (!APPLY) {
    console.log('\nDry-run complete. Re-run with --apply to execute.');
    return;
  }

  // ---- 5. Apply: delete candidates, then create top-ups ----
  let deletedStudents = 0;
  let deletedEnrollments = 0;
  let deletedAssignments = 0;

  if (candidateIdStrings.length > 0) {
    deletedAssignments = (await StudentBlockAssignment.deleteMany({
      $or: [
        { studentId: { $in: candidateIdStrings } },
        { studentId: { $type: 'string', $in: candidateIdStrings } },
      ],
    })).deletedCount || 0;
    deletedEnrollments = (await Enrollment.deleteMany({ studentId: { $in: candidateIdStrings } })).deletedCount || 0;
    deletedStudents = (await Student.deleteMany({ _id: { $in: candidateIds } })).deletedCount || 0;
  }
  console.log(`Deleted: ${deletedStudents} students, ${deletedEnrollments} enrollments, ${deletedAssignments} block assignments`);

  const now = new Date();
  const syStart = Number(String(SCHOOL_YEAR).split('-')[0]);

  for (const { section, group, created } of plan) {
    const course = Number(group.courseId ?? group.courseCode ?? 0);
    const isFinalYear = Number(group.yearLevel) >= 4;
    const createdStudents = [];

    for (const entry of created) {
      const studentNumber = await generateStudentNumber(syStart, course, usedNumbers);
      const grade = GRADE_PATTERN[entry.slot % GRADE_PATTERN.length];
      const [student] = await Student.create([{
        studentNumber,
        firstName: entry.first,
        lastName: entry.last,
        course,
        yearLevel: Number(group.yearLevel),
        semester: group.semester || SEMESTER,
        schoolYear: group.schoolYear || group.year || SCHOOL_YEAR,
        studentStatus: 'Regular',
        classification: 'Regular',
        lifecycleStatus: 'Enrolled',
        enrollmentStatus: 'Enrolled',
        isActive: true,
        section: section.sectionCode,
        corStatus: 'Verified',
        contactNumber: `0918${String(Math.floor(Math.random() * 1e7)).padStart(7, '0')}`,
        address: 'Test Address',
        ...(typeof grade === 'number' ? {
          latestGrade: grade,
          gradeProfessor: 'rollover-test',
          gradeDate: now,
        } : {}),
      }]);

      const [enrollment] = await Enrollment.create([{
        studentId: student._id,
        studentNumber,
        schoolYear: SCHOOL_YEAR,
        semester: SEMESTER,
        yearLevel: Number(group.yearLevel),
        course: ENROLLMENT_COURSE_BY_CODE[course] || 'BEED',
        curriculumId: curriculumByProgram.get(course) || null,
        subjects: [],
        assessment: {
          tuitionFee: 0, miscFee: 0, otherFees: 0, totalAmount: 0,
          discount: 0, balance: 0, paymentStatus: 'Unpaid', paymentHistory: [],
        },
        status: 'Enrolled',
        isCurrent: true,
        createdBy: student._id, // maintenance script attribution
      }]);

      const [assignment] = await StudentBlockAssignment.create([{
        studentId: String(student._id),
        enrollmentId: enrollment._id,
        sectionId: section._id,
        semester: SEMESTER,
        year: SCHOOL_YEAR,
        schoolYear: SCHOOL_YEAR,
        status: 'ASSIGNED',
        assignedAt: now,
      }]);

      createdStudents.push({ student, enrollment, assignment });
      newAll.push(entry);
    }

    // Exact recount so the census is authoritative.
    const assignedCount = await StudentBlockAssignment.countDocuments({
      sectionId: section._id,
      status: 'ASSIGNED',
    });
    await BlockSection.updateOne({ _id: section._id }, { $set: { currentPopulation: assignedCount } });
    touchedSections.push({ sectionCode: section.sectionCode, population: assignedCount });
    console.log(`  ${section.sectionCode}: +${createdStudents.length} → population ${assignedCount}/${section.capacity}`);
  }

  // ---- 6. Recompute every remaining OPEN section population ----
  for (const section of sections) {
    if (touchedSections.some((t) => t.sectionCode === section.sectionCode)) continue;
    const assignedCount = await StudentBlockAssignment.countDocuments({
      sectionId: section._id,
      status: 'ASSIGNED',
    });
    if (section.currentPopulation !== assignedCount) {
      await BlockSection.updateOne({ _id: section._id }, { $set: { currentPopulation: assignedCount } });
      console.log(`  population fix ${section.sectionCode}: ${section.currentPopulation} → ${assignedCount}`);
    }
  }

  // ---- 7. Audit log (only if a real admin account exists) ----
  const admin = await Admin.findOne({ username: 'westcoastcollegeadmin26' }).lean();
  if (admin) {
    await AuditLog.create([{
      action: 'DELETE',
      resourceType: 'STUDENT',
      resourceId: 'bulk-mock-cleanup',
      resourceName: `Removed ${deletedStudents} bulk mock students (+3 probes) and topped sections to ${TARGET_PER_SECTION}`,
      description: `Maintenance trimMockStudentsToFive.js: removed ${deletedStudents} students, ${deletedEnrollments} enrollments, ${deletedAssignments} assignments; backup: ${path.basename(backupPath || '')}`,
      performedBy: admin._id,
      performedByRole: 'admin',
      status: 'SUCCESS',
      severity: 'HIGH',
    }]);
    console.log('Audit log entry created.');
  } else {
    console.log('No admin account found — audit entry skipped (backup JSON is the record).');
  }

  const finalStudents = await Student.countDocuments({});
  console.log(`\nDONE. Final student count: ${finalStudents}`);
}

main()
  .catch((err) => { console.error('FAILED:', err.message); process.exitCode = 1; })
  .finally(async () => {
    try { await mongoose.disconnect(); } catch (e) { /* ignore */ }
  });
