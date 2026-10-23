/** READ-ONLY: blocks/sections + dependent enrollments/assignments of bulk students. Writes nothing. */
require('dotenv').config({ path: '../.env' });
const mongoose = require('mongoose');
const Student = require('../models/Student');
const Enrollment = require('../models/Enrollment');
const StudentBlockAssignment = require('../models/StudentBlockAssignment');
const BlockGroup = require('../models/BlockGroup');
const BlockSection = require('../models/BlockSection');
const BlockSubjectAssignment = require('../models/BlockSubjectAssignment');
const Counter = require('../models/Counter');

(async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('connected');

    // Bulk students = created inside the two 2026-10-20 batch windows.
    const bulkStudents = await Student.find({
      createdAt: { $gte: new Date('2026-10-20T05:40:00Z'), $lt: new Date('2026-10-20T07:00:00Z') },
    }).select('_id studentNumber firstName lastName section course yearLevel').lean();
    const probes = await Student.find({ lastName: 'ZZPROBE' }).select('_id studentNumber firstName lastName').lean();
    const bulkIds = [...new Set([...bulkStudents, ...probes].map(s => String(s._id)))];
    console.log('bulk batch students:', bulkStudents.length, '| ZZPROBE probes:', probes.length, '| total removal candidates:', bulkIds.length);

    const grouped = {};
    for (const s of bulkStudents) {
      const key = `${s.course}-${s.yearLevel}-${s.section || 'UNASSIGNED'}`;
      grouped[key] = (grouped[key] || 0) + 1;
    }
    console.log('\nbulk students by course-year-section:');
    for (const [k, v] of Object.entries(grouped).sort()) console.log(' ', k, v);

    const enr = await Enrollment.countDocuments({ studentId: { $in: bulkIds } });
    const enrWithSubjects = await Enrollment.countDocuments({ studentId: { $in: bulkIds }, subjects: { $exists: true, $ne: [] } });
    const enrWithGrades = await Enrollment.countDocuments({ studentId: { $in: bulkIds }, 'subjects.grade': { $type: 'number' } });
    const asg = await StudentBlockAssignment.countDocuments({
      $or: [
        { studentId: { $in: bulkIds } },
        { studentId: { $type: 'string', $in: bulkIds } },
      ],
    });
    console.log('\nEnrollments of removal candidates:', enr, '| with subjects:', enrWithSubjects, '| with grades:', enrWithGrades);
    console.log('Block assignments of removal candidates:', asg);

    // Remaining (non-candidate) students
    const keep = await Student.find({ _id: { $nin: bulkIds } })
      .select('studentNumber firstName lastName course yearLevel section lifecycleStatus')
      .lean();
    console.log('\nKept students (' + keep.length + '):');
    for (const s of keep) {
      console.log(`  ${s.studentNumber} | ${s.firstName} ${s.lastName} | c${s.course} y${s.yearLevel} ${s.section || '-'} | ${s.lifecycleStatus}`);
    }

    // Blocks + sections
    const groups = await BlockGroup.find({}).lean();
    const sections = await BlockSection.find({}).lean();
    console.log('\nBlock groups:', groups.length);
    for (const g of groups.sort((a, b) => (a.semester === b.semester ? a.yearLevel - b.yearLevel : String(a.semester).localeCompare(String(b.semester))))) {
      const secs = sections.filter(s => String(s.blockGroupId) === String(g._id));
      console.log(`  ${g.name} | course ${g.courseId} y${g.yearLevel} | ${g.semester} | ${g.schoolYear || g.year} | sections: ${secs.map(x => `${x.sectionCode}(pop ${x.currentPopulation}/${x.capacity},${x.status})`).join(', ') || 'NONE'}`);
    }

    const bsa = await BlockSubjectAssignment.countDocuments({});
    console.log('\nBlockSubjectAssignment docs:', bsa);

    const counters = await Counter.find({}).lean();
    console.log('\nCounters:', counters.map(c => `${c.key || c._id}: ${c.value ?? c.seq ?? '?'}`));
  } catch (err) {
    console.error('FAILED:', err.message);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect().catch(() => {});
  }
})();
