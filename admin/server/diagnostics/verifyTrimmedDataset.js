/** READ-ONLY verification after the mock trim: per-section counts, orphans, and a rollover preview. Writes nothing. */
require('dotenv').config({ path: '../.env' });
const mongoose = require('mongoose');
const Student = require('../models/Student');
const Enrollment = require('../models/Enrollment');
const StudentBlockAssignment = require('../models/StudentBlockAssignment');
const BlockSection = require('../models/BlockSection');
const RolloverService = require('../services/academicYearRolloverService');

(async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('connected');

    console.log('students:', await Student.countDocuments({}));
    console.log('enrollments:', await Enrollment.countDocuments({}));
    console.log('assignments:', await StudentBlockAssignment.countDocuments({}));

    // Orphan check: assignments/students that no longer line up.
    const students = await Student.find({}).select('_id studentNumber course yearLevel section lifecycleStatus latestGrade').lean();
    const studentIds = new Set(students.map((s) => String(s._id)));
    const assignments = await StudentBlockAssignment.find({}).lean();
    const orphans = assignments.filter((a) => !studentIds.has(String(a.studentId)));
    console.log('orphan block assignments:', orphans.length);
    const enrollmentOrphans = await Enrollment.countDocuments({ studentId: { $nin: [...studentIds] } });
    console.log('orphan enrollments:', enrollmentOrphans);

    // Per-section distribution
    const bySection = {};
    for (const a of assignments) {
      const sid = String(a.sectionId);
      bySection[sid] = (bySection[sid] || 0) + 1;
    }
    const sections = await BlockSection.find({}).select('sectionCode currentPopulation capacity status').lean();
    console.log('\nsections:');
    let mismatch = 0;
    for (const s of sections.sort((a, b) => String(a.sectionCode).localeCompare(String(b.sectionCode)))) {
      const actual = bySection[String(s._id)] || 0;
      if (actual !== s.currentPopulation) {
        mismatch += 1;
        console.log(`  MISMATCH ${s.sectionCode}: population ${s.currentPopulation} vs actual ${actual}`);
      }
      console.log(`  ${s.sectionCode}: assigned ${actual}/${s.capacity} (stored pop ${s.currentPopulation})`);
    }
    console.log('population mismatches:', mismatch);

    // Per-course/yearLevel student distribution
    const grouped = {};
    for (const s of students) {
      const key = `${s.course}-${s.yearLevel}-${s.section || 'UNASSIGNED'}`;
      grouped[key] = (grouped[key] || 0) + 1;
    }
    console.log('\nstudents by course-year-section:');
    for (const [k, v] of Object.entries(grouped).sort()) console.log(' ', k, v);

    // Grade variety for the rollover
    const grades = students.reduce((acc, s) => {
      if (typeof s.latestGrade !== 'number') acc.needsReview += 1;
      else if (s.latestGrade <= 3.0) acc.passing += 1;
      else acc.failing += 1;
      return acc;
    }, { passing: 0, failing: 0, needsReview: 0 });
    console.log('\ngrade variety:', grades);

    // Rollover preview (read-only service call, same as the UI would do)
    const summary = await RolloverService.previewSummary({
      fromSchoolYear: '2026-2027',
      toSchoolYear: '2027-2028',
      semester: '1st',
    });
    console.log('\nROLL PREVIEW SUMMARY (as shown in the UI):');
    console.log('  total students:', summary.totalStudents);
    console.log('  action summary:', JSON.stringify(summary.summary));

    const preview = await RolloverService.previewRollover({
      fromSchoolYear: '2026-2027',
      toSchoolYear: '2027-2028',
      semester: '1st',
    });
    console.log('\nfull preview students:', preview.totalStudents);
    console.log('needsReview count:', preview.summary.needsReview);
    console.log('curriculumAdjustments:', JSON.stringify(preview.curriculumAdjustments));
    console.log('\nsample evaluations (first 8):');
    for (const e of preview.evaluations.slice(0, 8)) {
      console.log(`  ${e.studentNumber} ${e.name} | block ${e.block} | ${e.recommendedAction} (${e.reason})`);
    }
  } catch (err) {
    console.error('FAILED:', err.message);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect().catch(() => {});
  }
})();
