const mongoose = require('mongoose');
const BlockGroup = require('../models/BlockGroup');

function normalizeCourseCode(rawCourse) {
  if (rawCourse === null || rawCourse === undefined) return null;
  const text = String(rawCourse).trim();
  if (!text) return null;

  if (/^\d+$/.test(text)) {
    const numeric = Number(text);
    return Number.isFinite(numeric) ? numeric : null;
  }

  const upper = text.toUpperCase().replace(/\u2013/g, '-');
  if (upper.includes('BEED')) return 101;
  if (upper.includes('BSED') && upper.includes('ENGLISH')) return 102;
  if (upper.includes('BSED') && upper.includes('MATH')) return 103;
  if (upper.includes('BSBA') || upper.includes('HRM')) return 201;
  return null;
}

function extractBlockSlot(value) {
  const text = String(value || '').trim().toUpperCase().replace(/\u2013/g, '-');
  const match = text.match(/(?:^|-)(\d+)-?([A-D])$/);
  if (!match) return { yearLevel: null, section: '' };

  const yearLevel = Number(match[1]);
  return {
    yearLevel: Number.isFinite(yearLevel) ? yearLevel : null,
    section: match[2]
  };
}

function deriveCourseCode(courseId) {
  const courseLabels = {
    101: 'BEED',
    102: 'BSED-ENGLISH',
    103: 'BSED-MATH',
    201: 'BSBA-HRM'
  };
  return courseLabels[courseId] || '';
}

async function backfillBlockGroupStructuredFields() {
  const groups = await BlockGroup.find({});
  let updated = 0;
  const skipped = [];

  for (const group of groups) {
    const slot = extractBlockSlot(group.name);
    const courseId = group.courseId || normalizeCourseCode(group.name);
    const schoolYear = group.schoolYear || (
      Number.isFinite(Number(group.year)) && Number(group.year) > 0
        ? `${Number(group.year)}-${Number(group.year) + 1}`
        : ''
    );

    const patch = {};
    if (!group.courseId && courseId) patch.courseId = courseId;
    if (!group.courseCode && courseId) patch.courseCode = deriveCourseCode(courseId);
    if (!group.yearLevel && slot.yearLevel) patch.yearLevel = slot.yearLevel;
    if (!group.section && slot.section) patch.section = slot.section;
    if (!group.schoolYear && schoolYear) patch.schoolYear = schoolYear;

    const needsManualReview = !courseId || !slot.yearLevel || !slot.section;

    if (!Object.keys(patch).length) {
      if (needsManualReview) {
        skipped.push({ id: group._id.toString(), name: group.name });
      }
      continue;
    }

    await BlockGroup.updateOne({ _id: group._id }, { $set: patch });
    updated += 1;
    if (needsManualReview) {
      skipped.push({ id: group._id.toString(), name: group.name });
    }
  }

  return { updated, skipped };
}

async function run() {
  const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI || process.env.DATABASE_URL;
  if (!mongoUri) {
    throw new Error('Set MONGODB_URI, MONGO_URI, or DATABASE_URL before running this migration.');
  }

  await mongoose.connect(mongoUri);
  const result = await backfillBlockGroupStructuredFields();
  console.log(`Updated ${result.updated} block group(s).`);
  if (result.skipped.length) {
    console.warn('Skipped block groups that need manual review:', result.skipped);
  }
  await mongoose.disconnect();
}

if (require.main === module) {
  run().catch(async (error) => {
    console.error('BlockGroup structured-field backfill failed:', error);
    await mongoose.disconnect().catch(() => {});
    process.exit(1);
  });
}

module.exports = {
  backfillBlockGroupStructuredFields,
  extractBlockSlot,
  normalizeCourseCode
};
