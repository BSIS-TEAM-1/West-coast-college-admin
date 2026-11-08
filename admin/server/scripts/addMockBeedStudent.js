/**
 * addMockBeedStudent.js
 *
 * Creates one mock BEED (course 101) Year 1 student for the ACTIVE academic
 * term and assigns them to the open section of the active-term block group,
 * mirroring the creation conventions of scripts/trimMockStudentsToFive.js:
 *   - unique student number  YYYY + course code + 5 digits
 *   - Student + Enrollment (subjects: [], zero assessment) + BlockAssignment
 *   - BlockSection.currentPopulation recounted from actual assignments
 *
 * Modes:  node scripts/addMockBeedStudent.js            # dry run (default)
 *         node scripts/addMockBeedStudent.js --apply
 */
require('dotenv').config({ path: '../.env' });
const mongoose = require('mongoose');
const Student = require('../models/Student');
const Enrollment = require('../models/Enrollment');
const StudentBlockAssignment = require('../models/StudentBlockAssignment');
const BlockGroup = require('../models/BlockGroup');
const BlockSection = require('../models/BlockSection');
const SystemSetting = require('../models/SystemSetting');
const Curriculum = require('../models/Curriculum');
const AuditLog = require('../models/AuditLog');
const Admin = require('../models/Admin');

const APPLY = process.argv.includes('--apply');

const COURSE_CODE = 101; // BEED
const YEAR_LEVEL = 1;
const ENROLLMENT_COURSE = 'BEED';

const FIRST_NAMES = ['Miguel', 'Rowena', 'Theo', 'Lucia', 'Emman'];
const LAST_NAMES = ['Alcaraz', 'Bautista', 'Cerrado', 'Delmendo', 'Estrada'];

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log(APPLY ? '*** APPLY MODE ***' : 'dry-run mode (no writes). Use --apply to execute.');

  const setting = await SystemSetting.findOne({ key: 'academicTerm' }).lean();
  const activeSchoolYear = setting?.value?.schoolYear;
  const activeSemester = setting?.value?.semester;
  if (!activeSchoolYear || !activeSemester) throw new Error('Active academic term is not configured.');
  console.log(`Active term: ${activeSchoolYear} ${activeSemester}`);

  // ---- Resolve the open section of the active-term BEED Year 1 block ----
  const group = await BlockGroup.findOne({
    courseId: COURSE_CODE,
    yearLevel: YEAR_LEVEL,
    semester: activeSemester,
    schoolYear: activeSchoolYear,
    status: { $ne: 'Archived' },
  }).lean();
  if (!group) {
    throw new Error(`No block group found for course ${COURSE_CODE} year ${YEAR_LEVEL} in ${activeSchoolYear} ${activeSemester}`);
  }

  let section = await BlockSection.findOne({
    blockGroupId: group._id,
    status: { $ne: 'ARCHIVED' },
  }).sort({ capacity: -1 }).lean();
  if (!section) throw new Error(`Section is missing for block group ${group.name}.`);

  const existingAssignments = await StudentBlockAssignment.countDocuments({
    sectionId: section._id,
    status: 'ASSIGNED',
  });
  if (existingAssignments >= Number(section.capacity)) {
    throw new Error(`Section ${section.sectionCode} is full (${existingAssignments}/${section.capacity}).`);
  }
  console.log(`Target section: ${section.sectionCode} (${existingAssignments}/${section.capacity})`);

  // ---- Build the mock student profile ----
  async function uniqueStudentNumber() {
    const syStart = Number(String(activeSchoolYear).split('-')[0]);
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const digits = String(Math.floor(Math.random() * 90000) + 10000);
      const candidate = `${syStart}${String(COURSE_CODE).padStart(3, '0')}${digits}`;
      const exists = await Student.findOne({ studentNumber: candidate }).lean();
      if (!exists) return candidate;
    }
    throw new Error('Unable to generate a unique student number');
  }

  async function uniqueName() {
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const first = FIRST_NAMES[Math.floor(Math.random() * FIRST_NAMES.length)];
      const last = LAST_NAMES[Math.floor(Math.random() * LAST_NAMES.length)];
      const clash = await Student.findOne({ firstName: first, lastName: last }).lean();
      if (!clash) return { first, last };
    }
    return { first: FIRST_NAMES[0], last: `${LAST_NAMES[0]}-${Date.now().toString().slice(-4)}` };
  }

  const curriculum = await Curriculum.findOne({
    programCode: { $in: [COURSE_CODE, String(COURSE_CODE)] },
    status: 'Active',
  }).select('_id programCode').lean();

  const studentNumber = await uniqueStudentNumber();
  const { first, last } = await uniqueName();
  console.log(`Planned student: ${studentNumber} — ${first} ${last} (BEED, Year ${YEAR_LEVEL}, ${activeSchoolYear} ${activeSemester})`);
  console.log(`Curriculum: ${curriculum ? String(curriculum._id) : 'none'}`);

  if (!APPLY) {
    console.log('\nDry-run complete. Re-run with --apply to create the student.');
    return;
  }

  // ---- Create the records ----
  const now = new Date();
  const admin = await Admin.findOne({ accountType: 'admin' }).sort({ createdAt: 1 }).lean();
  const createdBy = admin ? admin._id : undefined;
  if (!createdBy) {
    throw new Error('No admin account found to attribute the enrollment to (Enrollment.createdBy is required).');
  }

  const [student] = await Student.create([{
    studentNumber,
    firstName: first,
    lastName: last,
    course: COURSE_CODE,
    yearLevel: YEAR_LEVEL,
    semester: activeSemester,
    schoolYear: activeSchoolYear,
    studentStatus: 'Regular',
    classification: 'Regular',
    lifecycleStatus: 'Enrolled',
    enrollmentStatus: 'Enrolled',
    isActive: true,
    section: section.sectionCode,
    corStatus: 'Verified',
    contactNumber: `0918${String(Math.floor(Math.random() * 1e7)).padStart(7, '0')}`,
    address: 'Test Address',
  }]);

  const [enrollment] = await Enrollment.create([{
    studentId: student._id,
    studentNumber,
    schoolYear: activeSchoolYear,
    semester: activeSemester,
    yearLevel: YEAR_LEVEL,
    course: ENROLLMENT_COURSE,
    curriculumId: curriculum ? curriculum._id : null,
    subjects: [],
    assessment: {
      tuitionFee: 0, miscFee: 0, otherFees: 0, totalAmount: 0,
      discount: 0, balance: 0, paymentStatus: 'Unpaid', paymentHistory: [],
    },
    status: 'Enrolled',
    isCurrent: true,
    createdBy,
  }]);

  await StudentBlockAssignment.create([{
    studentId: String(student._id),
    enrollmentId: enrollment._id,
    sectionId: section._id,
    semester: activeSemester,
    year: activeSchoolYear,
    schoolYear: activeSchoolYear,
    status: 'ASSIGNED',
    assignedAt: now,
  }]);

  // Recount so the section census is authoritative.
  const assignedCount = await StudentBlockAssignment.countDocuments({
    sectionId: section._id,
    status: 'ASSIGNED',
  });
  await BlockSection.updateOne(
    { _id: section._id },
    { $set: { currentPopulation: assignedCount } }
  );

  if (admin) {
    await AuditLog.create([{
      action: 'CREATE',
      resourceType: 'STUDENT',
      resourceId: String(student._id),
      resourceName: `${studentNumber} — ${first} ${last}`,
      description: `Mock student created: BEED Year ${YEAR_LEVEL}, ${activeSchoolYear} ${activeSemester}, section ${section.sectionCode}.`,
      performedBy: admin._id,
      performedByRole: 'admin',
      status: 'SUCCESS',
      severity: 'LOW',
    }]);
    console.log('Audit log entry created.');
  } else {
    console.log('No admin account found — audit entry skipped.');
  }

  console.log(`\nDONE. Created ${studentNumber} — ${first} ${last} | section ${section.sectionCode} population now ${assignedCount}/${section.capacity}`);
}

main()
  .catch((err) => { console.error('FAILED:', err.message); process.exitCode = 1; })
  .finally(async () => {
    try { await mongoose.disconnect(); } catch (e) { /* ignore */ }
  });
