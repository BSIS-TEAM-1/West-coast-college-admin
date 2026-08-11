/**
 * Post-migration verification: confirm every CurriculumSubject record has
 * its snapshot fields (courseNo, descriptiveTitle, units, lecturePeriods,
 * labPeriods) populated and that they match the referenced Subject.
 *
 * Usage: node server/migrations/verify-curriculum-subject-snapshots.js
 */

const path = require('path');
const fs = require('fs');
const mongoose = require('mongoose');
const Subject = require('../models/Subject');
const CurriculumSubject = require('../models/CurriculumSubject');

const dotenv = require('dotenv');
const envFileCandidates = [
  { filePath: path.join(__dirname, '..', '..', '.env'), override: false },
  { filePath: path.join(__dirname, '..', '..', '.env.credential-details'), override: true },
  { filePath: path.join(__dirname, '..', '..', '.env.credentail-details'), override: true },
];
envFileCandidates.forEach(({ filePath, override }) => {
  if (fs.existsSync(filePath)) {
    dotenv.config({ path: filePath, override });
  }
});

const MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI || 'mongodb://localhost:27017/wcc';

async function run() {
  console.log('=== CurriculumSubject Snapshot Verification ===');
  await mongoose.connect(MONGO_URI);
  console.log('Connected to MongoDB.\n');

  const allCS = await CurriculumSubject.find({}).lean();
  console.log(`Total CurriculumSubject records: ${allCS.length}`);

  const subjectIds = allCS.map((cs) => cs.subjectId);
  const subjects = await Subject.find({ _id: { $in: subjectIds } })
    .select('_id code title units lecturePeriods labPeriods')
    .lean();
  const subjectMap = new Map(subjects.map((s) => [String(s._id), s]));

  let missingSnapshot = 0;
  let missingSubject = 0;
  let mismatched = 0;
  let matched = 0;
  const mismatches = [];

  for (const cs of allCS) {
    const subject = subjectMap.get(String(cs.subjectId));
    if (!subject) {
      missingSubject++;
      mismatches.push({ csId: cs._id, reason: 'Referenced Subject not found' });
      continue;
    }

    const hasAllSnapshots =
      cs.courseNo != null &&
      cs.descriptiveTitle != null &&
      cs.units != null &&
      cs.lecturePeriods != null &&
      cs.labPeriods != null;

    if (!hasAllSnapshots) {
      missingSnapshot++;
      mismatches.push({
        csId: cs._id,
        subjectCode: subject.code,
        reason: 'Missing one or more snapshot fields',
        courseNo: cs.courseNo,
        descriptiveTitle: cs.descriptiveTitle,
        units: cs.units,
        lecturePeriods: cs.lecturePeriods,
        labPeriods: cs.labPeriods,
      });
      continue;
    }

    const matchesSubject =
      cs.courseNo === subject.code &&
      cs.descriptiveTitle === subject.title &&
      cs.units === subject.units &&
      cs.lecturePeriods === (subject.lecturePeriods || 0) &&
      cs.labPeriods === (subject.labPeriods || 0);

    if (matchesSubject) {
      matched++;
    } else {
      mismatched++;
      mismatches.push({
        csId: cs._id,
        subjectCode: subject.code,
        reason: 'Snapshot values do not match referenced Subject',
        cs: { courseNo: cs.courseNo, descriptiveTitle: cs.descriptiveTitle, units: cs.units, lecturePeriods: cs.lecturePeriods, labPeriods: cs.labPeriods },
        subject: { code: subject.code, title: subject.title, units: subject.units, lecturePeriods: subject.lecturePeriods || 0, labPeriods: subject.labPeriods || 0 },
      });
    }
  }

  console.log('');
  console.log('=== Verification Report ===');
  console.log(`Records with all snapshots populated and matching Subject: ${matched}`);
  console.log(`Records missing one or more snapshot fields: ${missingSnapshot}`);
  console.log(`Records with snapshot values not matching Subject: ${mismatched}`);
  console.log(`Records referencing a missing Subject: ${missingSubject}`);
  console.log('');

  if (mismatches.length > 0) {
    console.log('--- Mismatches ---');
    for (const m of mismatches.slice(0, 20)) {
      console.log(`  ${m.csId} (${m.subjectCode || 'n/a'}): ${m.reason}`);
      if (m.cs && m.subject) {
        console.log(`    CS:     courseNo=${m.cs.courseNo}, title="${m.cs.descriptiveTitle}", units=${m.cs.units}, lec=${m.cs.lecturePeriods}, lab=${m.cs.labPeriods}`);
        console.log(`    Subject: code=${m.subject.code}, title="${m.subject.title}", units=${m.subject.units}, lec=${m.subject.lecturePeriods}, lab=${m.subject.labPeriods}`);
      }
    }
    if (mismatches.length > 20) {
      console.log(`  ... and ${mismatches.length - 20} more`);
    }
  } else {
    console.log('All CurriculumSubject snapshot fields are populated correctly and match their referenced Subject.');
  }

  await mongoose.disconnect();
  console.log('\nDone.');
}

run().catch((err) => {
  console.error('Verification failed:', err);
  process.exit(1);
});
