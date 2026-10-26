/**
 * DATA MIGRATION (test-data only): collapse the four year-1 sections per course
 * (101-1-A/B/C/D ...) into ONE block per course (the original "-A" sections).
 *
 * What happens per course (101, 102, 103, 201):
 *   keep    BlockGroup {course}-1-A + its BlockSection
 *   delete  BlockGroups {course}-1-B/C/D + their BlockSections
 *   move    every StudentBlockAssignment pointing at a deleted section -> kept section
 *   update  student.section label -> kept block name
 *   update  enrollment.subjects[].sectionCode string mapping (when set)
 *   repoint BlockSubjectAssignment docs of deleted sections onto the kept section
 *           (exact duplicates by (subjectId, semester, academicYear) are removed)
 *   reset   kept sections' currentPopulation to the real assignment count
 *
 * Capacity stays at least 40; each kept section ends with its course's students.
 * This matches rollover behavior going forward: the next rollovers create
 * exactly one "{course}-{yearLevel}-A" block per course/year level.
 *
 * Run: node diagnostics/collapseToOneBlockPerCourse.js
 */
require('dotenv').config({ path: '../.env' });
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');

const TARGET_SCHOOL_YEAR = '2021-2022';
const COURSES = [101, 102, 103, 201];
const BACKUP_DIR = path.join(__dirname, '..', 'backups', `pre-one-block-per-course_${TARGET_SCHOOL_YEAR}`);

(async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    const db = mongoose.connection.db;
    console.log(`collapsing to one block per course (SY ${TARGET_SCHOOL_YEAR})`);

    // ---- Backup everything this migration may touch ----
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
    const backupJobs = [
      ['blockgroups', {}],
      ['blocksections', {}],
      ['students', { schoolYear: TARGET_SCHOOL_YEAR }],
      ['enrollments', { schoolYear: TARGET_SCHOOL_YEAR }],
      ['studentblockassignments', {}],
      ['blocksubjectassignments', {}],
    ];
    for (const [name, filter] of backupJobs) {
      const docs = await db.collection(name).find(filter).toArray();
      fs.writeFileSync(
        path.join(BACKUP_DIR, `${name}.json`),
        JSON.stringify(docs, (_k, v) => (v && v._bsontype === 'ObjectId' ? v.toString() : v), 2),
      );
      console.log(`backed up ${name}: ${docs.length} docs -> ${BACKUP_DIR}`);
    }

    // ---- Load and plan ----
    const groups = await db.collection('blockgroups').find({}).toArray();
    const sections = await db.collection('blocksections').find({}).toArray();
    const sectionsByGroup = new Map();
    for (const s of sections) {
      const key = String(s.blockGroupId);
      sectionsByGroup.set(key, [...(sectionsByGroup.get(key) || []), s]);
    }

    const plan = [];
    const droppedSectionIdToKeptSection = new Map(); // dropped sectionId string -> kept section doc
    for (const course of COURSES) {
      const courseGroups = groups.filter((g) => Number(g.courseId) === course);
      const keptGroup = courseGroups.find((g) => g.name === `${course}-1-A`);
      if (!keptGroup) throw new Error(`No kept group ${course}-1-A found`);
      const droppedGroups = courseGroups.filter((g) => g.name !== `${course}-1-A`);
      const keptSections = sectionsByGroup.get(String(keptGroup._id)) || [];
      const keptSection = keptSections.find((s) => s.sectionCode === keptGroup.name) || keptSections[0];
      if (!keptSection) throw new Error(`No section for kept group ${keptGroup.name}`);
      const droppedSections = droppedGroups.flatMap((g) => sectionsByGroup.get(String(g._id)) || []);
      for (const s of droppedSections) droppedSectionIdToKeptSection.set(String(s._id), keptSection);
      plan.push({
        course,
        keptGroupName: keptGroup.name,
        keptSectionId: keptSection._id,
        droppedGroupNames: droppedGroups.map((g) => g.name),
        droppedSectionIds: droppedSections.map((s) => s._id),
      });
      console.log(`  ${course}: keep ${keptGroup.name} | drop ${droppedGroups.map((g) => g.name).join(', ')}`);
    }

    const allDroppedSectionIds = plan.flatMap((p) => p.droppedSectionIds);
    const droppedGroupNames = plan.flatMap((p) => p.droppedGroupNames);

    // ---- Apply in one transaction ----
    const session = db.client.startSession();
    session.startTransaction();
    try {
      const bsa = db.collection('blocksubjectassignments');

      // 1. Re-point student block assignments onto the kept sections
      for (const p of plan) {
        const res = await db.collection('studentblockassignments').updateMany(
          { sectionId: { $in: p.droppedSectionIds } },
          { $set: { sectionId: p.keptSectionId } },
          { session },
        );
        console.log(`  assignments moved to ${p.keptGroupName}: ${res.modifiedCount}`);
      }

      // 2. Update student section labels
      for (const p of plan) {
        const res = await db.collection('students').updateMany(
          { schoolYear: TARGET_SCHOOL_YEAR, section: { $in: p.droppedGroupNames } },
          { $set: { section: p.keptGroupName } },
          { session },
        );
        console.log(`  student labels updated for ${p.keptGroupName}: ${res.modifiedCount}`);
      }

      // 3. Enrollment subjects[].sectionCode string mapping
      const enrDocs = await db.collection('enrollments').find({ schoolYear: TARGET_SCHOOL_YEAR }, { session }).toArray();
      let enrTouched = 0;
      for (const e of enrDocs) {
        const set = {};
        (e.subjects || []).forEach((entry, i) => {
          if (entry && entry.sectionCode && droppedGroupNames.includes(String(entry.sectionCode))) {
            const p = plan.find((x) => x.droppedGroupNames.includes(String(entry.sectionCode)));
            set[`subjects.${i}.sectionCode`] = p.keptGroupName;
          }
        });
        if (Object.keys(set).length > 0) {
          await db.collection('enrollments').updateOne({ _id: e._id }, { $set: set }, { session });
          enrTouched += 1;
        }
      }
      console.log(`enrollments with section codes remapped: ${enrTouched}`);

      // 4. BlockSubjectAssignment: re-point onto kept sections, dedupe exact collisions
      let keptKeys = new Set();
      for (const p of plan) {
        const existingDocs = await bsa.find({ blockSectionId: p.keptSectionId }, { session }).toArray();
        for (const doc of existingDocs) {
          keptKeys.add(`${String(doc.subjectId)}|${doc.semester}|${doc.academicYear}`);
        }
      }
      const droppedBsa = await bsa.find({ blockSectionId: { $in: allDroppedSectionIds } }, { session }).toArray();
      let repointed = 0, deduped = 0;
      for (const doc of droppedBsa) {
        const key = `${String(doc.subjectId)}|${doc.semester}|${doc.academicYear}`;
        if (keptKeys.has(key)) {
          await bsa.deleteOne({ _id: doc._id }, { session });
          deduped += 1;
        } else {
          const keptSection = droppedSectionIdToKeptSection.get(String(doc.blockSectionId));
          await bsa.updateOne({ _id: doc._id }, { $set: { blockSectionId: keptSection._id } }, { session });
          keptKeys.add(key);
          repointed += 1;
        }
      }
      console.log(`block subject assignments: repointed=${repointed} deduped=${deduped}`);

      // 5. Recompute kept section populations/capacities
      for (const p of plan) {
        const count = await db.collection('studentblockassignments').countDocuments(
          { sectionId: p.keptSectionId }, { session },
        );
        await db.collection('blocksections').updateOne(
          { _id: p.keptSectionId },
          { $set: { currentPopulation: count, capacity: Math.max(40, count) } },
          { session },
        );
        console.log(`  ${p.keptGroupName}: population set to ${count}`);
      }

      // 6. Delete the dropped sections and groups
      const delSections = await db.collection('blocksections').deleteMany(
        { _id: { $in: allDroppedSectionIds } }, { session },
      );
      const delGroups = await db.collection('blockgroups').deleteMany(
        { name: { $in: droppedGroupNames } }, { session },
      );
      console.log(`deleted sections: ${delSections.deletedCount} | deleted groups: ${delGroups.deletedCount}`);

      await session.commitTransaction();
      console.log('\ntransaction committed ✔');
    } catch (txErr) {
      await session.abortTransaction();
      throw txErr;
    } finally {
      session.endSession();
    }
  } catch (err) {
    console.error('FAILED:', err.message);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect().catch(() => {});
  }
})();
