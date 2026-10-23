/**
 * trimBlocksToMain.js
 *
 * Dev-database maintenance (wcc-admin), follows trimMockStudentsToFive.js:
 *   1. Keeps exactly ONE block group per course+yearLevel (the "...-A" group).
 *   2. Deletes the extra -B/-C groups, their sections, the students assigned
 *      to them, and their enrollments / assignments / subject plans /
 *      waitlists. Every removed document is backed up to local JSON FIRST.
 *   3. Recounts BlockSection.currentPopulation for the surviving sections.
 *
 * Modes:  node scripts/trimBlocksToMain.js --dry-run   (default)
 *         node scripts/trimBlocksToMain.js --apply
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
const BlockSubjectAssignment = require('../models/BlockSubjectAssignment');
const SectionWaitlist = require('../models/SectionWaitlist');

const APPLY = process.argv.includes('--apply');
const DRY_RUN = !APPLY;

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log(APPLY ? '*** APPLY MODE ***' : 'dry-run mode (no writes). Use --apply to execute.');

  const groups = await BlockGroup.find({}).lean();
  const keepGroups = groups.filter((g) => /-A$/.test(String(g.name || '')));
  const dropGroups = groups.filter((g) => !/-A$/.test(String(g.name || '')));
  const dropGroupIds = dropGroups.map((g) => g._id);

  const dropSections = await BlockSection.find({ blockGroupId: { $in: dropGroupIds } }).lean();
  const dropSectionIds = dropSections.map((s) => s._id);
  console.log(`groups: ${groups.length} total → keep ${keepGroups.length} ("-A"), drop ${dropGroups.length}`);
  console.log(`sections to drop: ${dropSectionIds.length} (${dropSections.map((s) => s.sectionCode).join(', ')})`);

  // Sanity: every kept group must still have a section.
  const keepSections = await BlockSection.find({ blockGroupId: { $in: keepGroups.map((g) => g._id) } }).lean();
  const groupsWithoutSection = keepGroups.filter(
    (g) => !keepSections.some((s) => String(s.blockGroupId) === String(g._id))
  );
  if (groupsWithoutSection.length > 0) {
    throw new Error(`Refusing: kept groups without a section: ${groupsWithoutSection.map((g) => g.name).join(', ')}`);
  }

  // Students that live (by assignment or section label) in a dropped section.
  const assignmentsToDrop = await StudentBlockAssignment.find({
    sectionId: { $in: dropSectionIds },
  }).lean();
  const assignmentStudentIds = new Set(assignmentsToDrop.map((a) => String(a.studentId)));
  const dropCodes = new Set(dropSections.map((s) => s.sectionCode));
  const students = await Student.find({}).lean();
  const dropStudents = students.filter(
    (s) => assignmentStudentIds.has(String(s._id)) || dropCodes.has(String(s.section || ''))
  );
  const dropStudentIds = dropStudents.map((s) => s._id);
  const dropStudentIdStrings = dropStudentIds.map(String);
  console.log(`students to remove: ${dropStudentIds.length} (${dropStudents.slice(0, 5).map((s) => s.studentNumber).join(', ')}${dropStudentIds.length > 5 ? ', ...' : ''})`);

  const dropEnrollments = dropStudentIdStrings.length
    ? await Enrollment.find({ studentId: { $in: dropStudentIdStrings } }).lean()
    : [];
  const dropAssignments = dropStudentIdStrings.length
    ? await StudentBlockAssignment.find({
        $or: [
          { studentId: { $in: dropStudentIdStrings } },
          { studentId: { $type: 'string', $in: dropStudentIdStrings } },
        ],
      }).lean()
    : [];
  const dropSubjectPlans = await BlockSubjectAssignment.find({ blockSectionId: { $in: dropSectionIds } }).lean();
  const dropWaitlists = await SectionWaitlist.find({ sectionId: { $in: dropSectionIds } }).lean();

  console.log(`dependents: enrollments ${dropEnrollments.length}, assignments ${dropAssignments.length}, subject plans ${dropSubjectPlans.length}, waitlist entries ${dropWaitlists.length}`);

  const keptById = students.filter((s) => !dropStudentIdStrings.includes(String(s._id)));
  const grades = keptById.reduce((acc, s) => {
    if (typeof s.latestGrade !== 'number') acc.needsReview += 1;
    else if (s.latestGrade <= 3.0) acc.passing += 1;
    else acc.failing += 1;
    return acc;
  }, { passing: 0, failing: 0, needsReview: 0 });
  console.log(`kept students: ${keptById.length} | grades: ${JSON.stringify(grades)}`);

  if (!APPLY) {
    console.log('\nDry-run complete. Re-run with --apply to execute.');
    return;
  }

  // ---- Backup everything before deleting ----
  const backupsDir = path.join(__dirname, '..', 'backups');
  if (!fs.existsSync(backupsDir)) fs.mkdirSync(backupsDir, { recursive: true });
  const backupPath = path.join(backupsDir, `main-blocks-trim-backup-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  fs.writeFileSync(backupPath, JSON.stringify({
    capturedAt: new Date().toISOString(),
    note: 'Extra -B/-C block groups and their students removed by scripts/trimBlocksToMain.js. Restore from this file if needed.',
    groups: dropGroups,
    sections: dropSections,
    students: dropStudents,
    enrollments: dropEnrollments,
    blockAssignments: dropAssignments,
    blockSubjectAssignments: dropSubjectPlans,
    sectionWaitlists: dropWaitlists,
  }, null, 2));
  console.log(`Backup written: ${backupPath}`);

  // ---- Apply (dependents first, then the referenced records) ----
  if (dropAssignments.length) {
    const r = await StudentBlockAssignment.deleteMany({
      $or: [
        { studentId: { $in: dropStudentIdStrings } },
        { studentId: { $type: 'string', $in: dropStudentIdStrings } },
      ],
    });
    console.log('assignments deleted:', r.deletedCount);
  }
  if (dropEnrollments.length) {
    const r = await Enrollment.deleteMany({ studentId: { $in: dropStudentIdStrings } });
    console.log('enrollments deleted:', r.deletedCount);
  }
  if (dropStudentIds.length) {
    const r = await Student.deleteMany({ _id: { $in: dropStudentIds } });
    console.log('students deleted:', r.deletedCount);
  }
  if (dropSubjectPlans.length) {
    const r = await BlockSubjectAssignment.deleteMany({ blockSectionId: { $in: dropSectionIds } });
    console.log('subject plans deleted:', r.deletedCount);
  }
  if (dropWaitlists.length) {
    const r = await SectionWaitlist.deleteMany({ sectionId: { $in: dropSectionIds } });
    console.log('waitlist entries deleted:', r.deletedCount);
  }
  if (dropSections.length) {
    const r = await BlockSection.deleteMany({ _id: { $in: dropSectionIds } });
    console.log('sections deleted:', r.deletedCount);
  }
  if (dropGroupIds.length) {
    const r = await BlockGroup.deleteMany({ _id: { $in: dropGroupIds } });
    console.log('groups deleted:', r.deletedCount);
  }

  // Recount surviving sections.
  const surviving = await BlockSection.find({}).lean();
  for (const section of surviving) {
    const assigned = await StudentBlockAssignment.countDocuments({ sectionId: section._id, status: 'ASSIGNED' });
    if (section.currentPopulation !== assigned) {
      await BlockSection.updateOne({ _id: section._id }, { $set: { currentPopulation: assigned } });
      console.log(`population fix ${section.sectionCode}: ${section.currentPopulation} → ${assigned}`);
    }
  }

  const finalStudents = await Student.countDocuments({});
  const finalGroups = await BlockGroup.countDocuments({});
  console.log(`\nDONE. Final: ${finalStudents} students, ${finalGroups} block groups.`);
}

main()
  .catch((err) => { console.error('FAILED:', err.message); process.exitCode = 1; })
  .finally(async () => {
    try { await mongoose.disconnect(); } catch (e) { /* ignore */ }
  });
