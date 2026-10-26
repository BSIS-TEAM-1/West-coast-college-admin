/** READ-ONLY: post-flatten integrity check — references still point at the renamed y1 sections. Writes nothing. */
require('dotenv').config({ path: '../.env' });
const mongoose = require('mongoose');

const TARGET_SCHOOL_YEAR = '2021-2022';

(async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    const db = mongoose.connection.db;

    const groups = await db.collection('blockgroups').find({}).toArray();
    const sections = await db.collection('blocksections').find({}).toArray();
    const students = await db.collection('students').find({ schoolYear: TARGET_SCHOOL_YEAR }).toArray();
    const assignments = await db.collection('studentblockassignments').find({}).toArray();

    const sectionById = new Map(sections.map((s) => [String(s._id), s]));
    const groupById = new Map(groups.map((g) => [String(g._id), g]));

    let issues = 0;

    // 1. Every group is year 1
    const badGroups = groups.filter((g) => g.yearLevel !== 1);
    console.log('block groups not year 1:', badGroups.length); issues += badGroups.length;

    // 2. Group names / section codes all match course-1-L
    const badNames = groups.filter((g) => !/^\d{3}-1-[A-D]$/.test(g.name));
    const badCodes = sections.filter((s) => !/^\d{3}-1-[A-D]$/.test(s.sectionCode));
    console.log('bad group names:', badNames.map((g) => g.name).join(',') || 'none');
    console.log('bad section codes:', badCodes.map((s) => s.sectionCode).join(',') || 'none');
    issues += badNames.length + badCodes.length;

    // 3. Unique (course, section letter) per group + fully consistent group ∩ section letters
    const byGroup = new Map();
    for (const s of sections) {
      const arr = byGroup.get(String(s.blockGroupId)) || [];
      arr.push(s);
      byGroup.set(String(s.blockGroupId), arr);
    }
    for (const g of groups) {
      const secs = byGroup.get(String(g._id)) || [];
      const letters = secs.map((s) => s.sectionCode.slice(-1)).sort();
      if (new Set(letters).size !== letters.length) {
        console.log(`DUPLICATE section letters in group ${g.name}: ${letters.join(',')}`);
        issues += 1;
      }
      const groupLetter = g.name.slice(-1);
      for (const s of secs) {
        if (s.sectionCode !== `${g.name}`.replace(/[A-D]$/, s.sectionCode.slice(-1))) {
          console.log(`MISMATCH group ${g.name} vs section ${s.sectionCode}`);
          issues += 1;
        }
      }
      // the group's own letter letter must not collide with a sibling section letter
      if (secs.some((s) => s.sectionCode.slice(-1) === groupLetter) && !secs.some((s) => s.sectionCode === g.name)) {
        console.log(`group letter collision: ${g.name}`);
        issues += 1;
      }
    }

    // 4. Every assignment points at an existing y1 section of the same school year
    for (const a of assignments) {
      const s = sectionById.get(String(a.sectionId));
      if (!s) { console.log(`DANGLING assignment: ${a.studentId} -> ${a.sectionId}`); issues += 1; continue; }
      const g = groupById.get(String(s.blockGroupId));
      if (!g || g.yearLevel !== 1) { console.log(`assignment to non-y1 block: ${a.studentId}`); issues += 1; }
    }

    // 5. Students: year 1 + section label consistent with their assignment's section code
    for (const st of students) {
      if (st.yearLevel !== 1) { console.log(`student not y1: ${st.studentNumber}`); issues += 1; }
      const a = assignments.find((x) => String(x.studentId) === String(st._id) || x.studentId === st.studentNumber);
      if (a) {
        const s = sectionById.get(String(a.sectionId));
        if (s && st.section && st.section !== s.sectionCode) {
          console.log(`SECTION MISMATCH student ${st.studentNumber}: label=${st.section} assigned=${s.sectionCode}`);
          issues += 1;
        }
      } else if (st.section) {
        console.log(`student has section "${st.section}" but no block assignment: ${st.studentNumber}`);
      }
    }

    console.log(`\nchecks against ${groups.length} groups / ${sections.length} sections / ${students.length} students / ${assignments.length} assignments`);
    console.log(issues === 0 ? 'ALL CLEAN ✔' : `${issues} issue(s) found`);
  } catch (err) {
    console.error('FAILED:', err.message);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect().catch(() => {});
  }
})();
