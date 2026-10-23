/** READ-ONLY: curriculum linkage + what subjects y1 curriculum placements would add. Writes nothing. */
require('dotenv').config({ path: '../.env' });
const mongoose = require('mongoose');
const Enrollment = require('../models/Enrollment');
const BlockGroup = require('../models/BlockGroup');
const Curriculum = require('../models/Curriculum');
const CurriculumSubject = require('../models/CurriculumSubject');
const Subject = require('../models/Subject');
const TARGET_SCHOOL_YEAR = '2026-2027';

(async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);

    const enrollments = await Enrollment.find({ schoolYear: TARGET_SCHOOL_YEAR })
      .select('_id studentNumber course yearLevel semester curriculumId subjects')
      .lean();
    const withCur = enrollments.filter((e) => e.curriculumId).length;
    console.log(`Enrollments: ${enrollments.length} | with curriculumId: ${withCur}`);
    const courses = {};
    for (const e of enrollments) courses[e.course] = (courses[e.course] || 0) + 1;
    console.log('by course:', courses);

    const groups = await BlockGroup.find({}).select('_id name courseId yearLevel curriculumId semester schoolYear year').lean();
    console.log('\nBlockGroups (curriculum link):');
    for (const g of groups.sort((a, b) => String(a.name).localeCompare(String(b.name)))) {
      console.log(`  ${g.name} | curriculumId=${g.curriculumId || 'NONE'}`);
    }

    const curriculums = await Curriculum.find({}).select('_id programCode programName version effectiveSchoolYear status').lean();
    console.log('\nCurriculums:');
    for (const c of curriculums.sort((a, b) => String(a.programCode).localeCompare(String(b.programCode)))) {
      console.log(`  ${c._id} | ${c.programCode} v${c.version} | eff=${c.effectiveSchoolYear || '-'} | status=${c.status || '-'}`);
    }

    // For each curriculum, what y1/1st placements exist?
    const subjects = await Subject.find({}).select('_id code title units isActive status').lean();
    const subjById = new Map(subjects.map((s) => [String(s._id), s]));
    console.log('\nCurriculumSubject placements (yearLevel=1, semester=1st):');
    for (const c of curriculums) {
      const placements = await CurriculumSubject.find({ curriculumId: c._id, yearLevel: 1, semester: '1st' })
        .select('subjectId courseNo descriptiveTitle units').lean();
      const lines = placements.map((p) => {
        const s = subjById.get(String(p.subjectId));
        return `${p.courseNo || (s && s.code) || '?'}${s ? (s.isActive === false || s.status === 'Inactive' ? ' [INACTIVE]' : '') : ' [NO SUBJECT DOC]'}`;
      });
      console.log(`  ${c.programCode} v${c.version}: ${placements.length} placement(s) -> ${lines.join(', ') || 'NONE'}`);
    }
  } catch (err) {
    console.error('FAILED:', err.message);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect().catch(() => {});
  }
})();
