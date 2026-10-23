/** READ-ONLY: snapshot of blocks, sections, students, assignments by year level. Writes nothing. */
require('dotenv').config({ path: '../.env' });
const mongoose = require('mongoose');

(async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('connected');

    const db = mongoose.connection.db;

    // Raw counts by year level straight from the collections (no schema coupling)
    const forCollection = async (name, project = {}) => {
      try {
        return await db.collection(name).find({}, project).toArray();
      } catch (e) {
        console.log(`${name}: not found (${e.message})`);
        return [];
      }
    };

    const groups = await forCollection('blockgroups', { name: 1, courseId: 1, courseCode: 1, yearLevel: 1, semester: 1, schoolYear: 1, year: 1, section: 1 });
    const sections = await forCollection('blocksections', { sectionCode: 1, yearLevel: 1, schoolYear: 1, population: 1, capacity: 1, blockGroupId: 1 });
    const students = await forCollection('students', { _id: 1, studentNumber: 1, course: 1, yearLevel: 1, section: 1, schoolYear: 1, semester: 1, lifecycleStatus: 1 });
    const assignments = await forCollection('studentblockassignments', { _id: 1, studentId: 1, sectionId: 1, schoolYear: 1 });
    const enrollments = await forCollection('enrollments', { _id: 1, yearLevel: 1, schoolYear: 1, semester: 1, isActive: 1 });

    const tally = (rows, key) => {
      const out = {};
      for (const r of rows) {
        const v = key(r);
        out[v] = (out[v] || 0) + 1;
      }
      return out;
    };

    console.log('\n=== BlockGroups by [yearLevel | schoolYear | semester] ===');
    console.log(tally(groups, g => `y${g.yearLevel ?? '?'} ${g.schoolYear || g.year || '?'} ${g.semester || '?'}`));
    console.log('Block groups:', groups.length);
    for (const g of groups.sort((a, b) => String(a.schoolYear || a.year).localeCompare(String(b.schoolYear || b.year)) || a.yearLevel - b.yearLevel || String(a.semester).localeCompare(String(b.semester)))) {
      const secs = sections.filter(s => String(s.blockGroupId) === String(g._id));
      console.log(`  ${g.name} | course ${g.courseId}${g.courseCode ? ' (' + g.courseCode + ')' : ''} y${g.yearLevel} | ${g.semester} | ${g.schoolYear || g.year} | sections: ${secs.map(x => `${x.sectionCode}(pop ${x.population ?? x.currentPopulation ?? '?'}/${x.capacity ?? '?'})`).join(', ') || 'NONE'}`);
    }

    console.log('\n=== BlockSections by yearLevel ===');
    console.log(tally(sections, s => `y${s.yearLevel ?? '?'}`));

    console.log('\n=== Students by yearLevel ===');
    console.log(tally(students, s => `y${s.yearLevel ?? '?'}`));
    const yearLevelsBySchoolYear = {};
    for (const s of students) {
      const k = `${s.schoolYear || '?'} ${s.semester || '?'}`;
      yearLevelsBySchoolYear[k] = yearLevelsBySchoolYear[k] || {};
      yearLevelsBySchoolYear[k][`y${s.yearLevel ?? '?'}`] = (yearLevelsBySchoolYear[k][`y${s.yearLevel ?? '?'}`] || 0) + 1;
    }
    console.log(JSON.stringify(yearLevelsBySchoolYear, null, 2));

    console.log('\n=== StudentBlockAssignment docs:', assignments.length, '===');
    // Map sectionId -> section yearLevel to count assignments per year level
    const sectionYL = new Map(sections.map(s => [String(s._id), s.yearLevel]));
    const asgTally = {};
    for (const a of assignments) {
      const yl = sectionYL.get(String(a.sectionId));
      asgTally[`y${yl ?? '?'}`] = (asgTally[`y${yl ?? '?'}`] || 0) + 1;
    }
    console.log(asgTally);

    console.log('\n=== Enrollments by [schoolYear | semester | yearLevel] ===');
    console.log(tally(enrollments, e => `${e.schoolYear || '?'} ${e.semester || '?'} y${e.yearLevel ?? '?'}`));

    console.log('\n=== Enrollments active (isActive !== false) ===');
    console.log(tally(enrollments.filter(e => e.isActive !== false), e => `${e.schoolYear || '?'} ${e.semester || '?'} y${e.yearLevel ?? '?'}`));
  } catch (err) {
    console.error('FAILED:', err.message);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect().catch(() => {});
  }
})();
