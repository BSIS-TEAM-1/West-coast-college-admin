/** READ-ONLY: professor accounts + current per-enrollment subject/instructor state. Writes nothing. */
require('dotenv').config({ path: '../.env' });
const mongoose = require('mongoose');
const TARGET_SCHOOL_YEAR = '2026-2027';

(async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    const db = mongoose.connection.db;

    const professors = await db.collection('admins').find({ accountType: 'professor' }).toArray();
    console.log(`Professor accounts (${professors.length}):`);
    for (const p of professors) {
      console.log(`  username=${p.username} | displayName=${p.displayName || '-'} | uid=${p.uid || '-'} | status=${p.status}`);
    }
    const allAdmins = await db.collection('admins').find({}).toArray();
    console.log(`\nAll admin-family accounts: ${allAdmins.length}`);
    for (const a of allAdmins) console.log(`  ${a.username} | type=${a.accountType} | status=${a.status}`);

    const enrollments = await db.collection('enrollments').find({ schoolYear: TARGET_SCHOOL_YEAR }).toArray();
    console.log(`\nEnrollments: ${enrollments.length}`);
    let totalSubjects = 0, withInstructor = 0, emptyEnrollments = 0, subjectRefCount = {};
    const sample = enrollments[0];
    if (sample) {
      console.log('Sample enrollment subjects:', JSON.stringify((sample.subjects || []).slice(0, 3), null, 1));
    }
    for (const e of enrollments) {
      const list = (e.subjects || []).filter(Boolean);
      if (list.length === 0) emptyEnrollments += 1;
      for (const s of list) {
        if (!s || !s.subjectId) continue;
        const k = String(s.subjectId);
        subjectRefCount[k] = (subjectRefCount[k] || 0) + 1;
        totalSubjects += 1;
        if (s.instructor && String(s.instructor).trim()) withInstructor += 1;
      }
    }
    console.log(`\nSubject entries across enrollments: ${totalSubjects} | with instructor set: ${withInstructor}`);
    console.log(`Enrollments with empty subject lists: ${emptyEnrollments} of ${enrollments.length}`);
    const subjectIds = Object.keys(subjectRefCount);
    const allSubjects = await db.collection('subjects').find({}).toArray();
    const subjects = allSubjects.filter((s) => subjectIds.includes(String(s._id)));
    console.log(`Distinct subjects referenced (${subjects.length}):`);
    for (const s of subjects.sort((a, b) => a.code.localeCompare(b.code))) {
      console.log(`  ${s.code} v${s.version} | ${s.title} | ${s.subjectType} | ${subjectRefCount[String(s._id)]} enrollment references | instructor entries exist on refs`);
    }

    // Block subject assignments for context
    const bsa = await db.collection('blocksubjectassignments').find({}).toArray();
    console.log(`\nBlockSubjectAssignment docs: ${bsa.length}`);
    const bsaBySection = {};
    for (const b of bsa) {
      const k = String(b.blockSectionId);
      bsaBySection[k] = (bsaBySection[k] || 0) + 1;
    }
    console.log('  per section:', bsaBySection);
  } catch (err) {
    console.error('FAILED:', err.message);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect().catch(() => {});
  }
})();
