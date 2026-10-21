/**
 * Prove the block -> curriculum assignment flow end to end on live data.
 *
 * Uses the real blockController methods behind:
 *   GET  /api/blocks/groups/:groupId/expected-subjects
 *   POST /api/blocks/groups/:groupId/sync-subjects   (via syncSubjectsFromCurriculum)
 *
 * Run: node testBlockCurriculumAssignment.js
 */
require('dotenv').config({ path: '../.env' });
require('dotenv').config({ path: '../.env.credentail-details', override: true });
const mongoose = require('mongoose');
const blockController = require('./controllers/blockController');
const BlockGroup = require('./models/BlockGroup');
const BlockSection = require('./models/BlockSection');
const BlockSubjectAssignment = require('./models/BlockSubjectAssignment');
const CurriculumSubject = require('./models/CurriculumSubject');
const Subject = require('./models/Subject');

const ADMIN_ID = '6ad6fe0fc031192c6508b17d'; // registrar, used only for the audit trail

function mockRes() {
  const res = {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.body = payload; return this; },
  };
  return res;
}

function unwrapExpected(body) {
  return body && body.data ? body.data : body;
}

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);

  const group = await BlockGroup.findOne({ name: '101-2-A' }).lean();
  if (!group) throw new Error('Block group 101-2-A not found');
  console.log(`\nBlock under test: ${group.name}  courseCode=${group.courseCode} yearLevel=${group.yearLevel} semester=${group.semester} schoolYear=${group.schoolYear}`);
  console.log(`Linked curriculum : ${group.curriculumId}`);

  // Reset this one group's subject assignments so the before/after comparison is
  // meaningful regardless of what earlier runs persisted. Scoped to this group only.
  const preSections = await BlockSection.find({ blockGroupId: group._id }).lean();
  const cleared = await BlockSubjectAssignment.deleteMany({
    blockSectionId: { $in: preSections.map((s) => s._id) },
  });
  console.log(`Reset: removed ${cleared.deletedCount} pre-existing assignment rows for this group`);

  // ---------------------------------------------------------------- curriculumFit
  const fit = await blockController.evaluateCurriculumFit(group.curriculumId, group.yearLevel, group.semester);
  console.log('\n--- evaluateCurriculumFit (what the UI shows when a curriculum is attached) ---');
  console.log(`  curriculumName       : ${fit.curriculumName}`);
  console.log(`  cohort               : Year ${fit.yearLevel}, ${fit.semester} semester`);
  console.log(`  expectedSubjectCount : ${fit.expectedSubjectCount}`);
  console.log(`  programMatches       : ${fit.programMatches}`);
  console.log(`  warning              : ${fit.warning || 'none'}`);

  if (fit.expectedSubjectCount === 0) throw new Error('Expected the curriculum to carry Year 2 subjects after seeding');
  if (fit.warning) throw new Error(`Unexpected warning: ${fit.warning}`);

  // ------------------------------------------------------- expected-subjects (before)
  const before = mockRes();
  await blockController.getExpectedSubjects({ params: { groupId: String(group._id) } }, before);
  if (before.statusCode !== 200) throw new Error(`expected-subjects failed: ${JSON.stringify(before.body)}`);
  const beforeData = unwrapExpected(before.body);
  console.log('\n--- GET expected-subjects, BEFORE sync ---');
  console.log(`  curriculum     : ${beforeData.curriculum ? beforeData.curriculum.name : 'none'}`);
  console.log(`  expected       : ${beforeData.expected.length}`);
  for (const e of beforeData.expected) {
    console.log(`     ${String(e.code).padEnd(9)} ${String(e.title).slice(0, 40).padEnd(41)} required=${e.isRequired} complete=${e.complete}`);
  }
  console.log(`  assignedNotExpected: ${beforeData.assignedNotExpected.length}`);
  console.log(`  warning        : ${beforeData.warning || 'none'}`);
  if (!beforeData.curriculum) throw new Error('Expected-subjects returned no curriculum');
  if (beforeData.expected.some((e) => e.complete)) throw new Error('Nothing should be complete yet');

  // --------------------------------------------------------------- sync-subjects
  const sections = await BlockSection.find({ blockGroupId: group._id }).lean();
  console.log(`\n--- sections in group ---`);
  console.log(`  ${sections.map((s) => s.sectionCode).join(', ')}`);

  const syncRes = mockRes();
  syncRes.req = { params: { groupId: String(group._id) }, body: { includeElectives: false }, adminId: ADMIN_ID };
  await blockController.syncSubjectsFromCurriculum(
    { params: { groupId: String(group._id) }, body: { includeElectives: false }, adminId: ADMIN_ID },
    syncRes
  );
  if (syncRes.statusCode !== 200) throw new Error(`sync failed: ${JSON.stringify(syncRes.body)}`);
  const summary = syncRes.body.summary;
  console.log('\n--- sync-subjects result ---');
  console.log(`  sections                 : ${summary.sections}`);
  console.log(`  curriculumSubjectsFound  : ${summary.curriculumSubjectsFound}`);
  console.log(`  created                  : ${summary.created}`);
  console.log(`  skipped                  : ${summary.skipped}`);
  if (summary.warnings.length) console.log(`  warnings                 : ${summary.warnings.join(' | ')}`);
  if (summary.errors.length) console.log(`  errors                   : ${summary.errors.join(' | ')}`);
  if (summary.created === 0) throw new Error('Sync created no assignments');

  // ----------------------------------------------------------------- idempotency
  const syncAgain = mockRes();
  await blockController.syncSubjectsFromCurriculum(
    { params: { groupId: String(group._id) }, body: { includeElectives: false }, adminId: ADMIN_ID },
    syncAgain
  );
  const again = syncAgain.body.summary;
  console.log(`\n--- sync re-run (idempotency) ---  created=${again.created} skipped=${again.skipped}`);
  if (again.created !== 0) throw new Error('Sync is not idempotent');

  // ------------------------------------------------------- expected-subjects (after)
  const after = mockRes();
  await blockController.getExpectedSubjects({ params: { groupId: String(group._id) } }, after);
  const afterData = unwrapExpected(after.body);
  console.log('\n--- GET expected-subjects, AFTER sync ---');
  console.log(`  curriculum     : ${afterData.curriculum ? afterData.curriculum.name : 'none'}`);
  for (const e of afterData.expected) {
    console.log(`     ${String(e.code).padEnd(9)} ${String(e.title).slice(0, 40).padEnd(41)} required=${e.isRequired} complete=${e.complete} missing=${e.missingSectionIds.length}`);
  }
  console.log(`  assignedNotExpected: ${afterData.assignedNotExpected.length}`);
  console.log(`  warning            : ${afterData.warning || 'none'}`);
  if (!afterData.expected.every((e) => e.complete)) throw new Error('Not every expected subject reached every section');

  // ------------------------------------- no Year 1 leakage into a Year 2 block
  const assigned = await BlockSubjectAssignment.find({
    blockSectionId: { $in: sections.map((s) => s._id) },
  }).lean();
  const assignedIds = assigned.map((a) => a.subjectId);
  const assignedSubjects = await Subject.find({ _id: { $in: assignedIds } }).select('code').lean();
  const assignedCodes = assignedSubjects.map((s) => s.code);
  console.log(`\n--- leakage check ---  ${assigned.length} assignment rows for this group`);
  const yearOnePlacements = await CurriculumSubject.find({ curriculumId: group.curriculumId, yearLevel: 1 }).lean();
  const yearOneSubjects = await Subject.find({ _id: { $in: yearOnePlacements.map((p) => p.subjectId) } }).select('code').lean();
  const yearOneCodes = yearOneSubjects.map((s) => s.code);
  const leaked = assignedCodes.filter((c) => yearOneCodes.includes(c));
  console.log(`  assigned codes : ${assignedCodes.join(', ')}`);
  console.log(`  Year 1 codes   : ${yearOneCodes.join(', ')}`);
  console.log(`  leaked         : ${leaked.length ? leaked.join(', ') : 'none'}`);
  if (leaked.length) throw new Error(`Year 1 subjects leaked into a Year 2 block: ${leaked.join(', ')}`);

  // ------------------------------------- sync every Year 2-4 block now that
  // curricula carry those placements
  const allGroups = await BlockGroup.find({ curriculumId: { $ne: null } }).lean();
  console.log(`\n--- syncing every curriculum-linked block group (${allGroups.length}) ---`);
  let totalCreated = 0;
  for (const g of allGroups) {
    const gSections = await BlockSection.find({ blockGroupId: g._id }).lean();
    if (!gSections.length) { console.log(`  ${g.name.padEnd(10)} no sections — skipped`); continue; }
    const r = mockRes();
    await blockController.syncSubjectsFromCurriculum(
      { params: { groupId: String(g._id) }, body: { includeElectives: false }, adminId: ADMIN_ID },
      r
    );
    const s = r.body && r.body.summary ? r.body.summary : { created: 0, curriculumSubjectsFound: 0, warnings: ['no summary'] };
    totalCreated += s.created || 0;
    console.log(`  ${g.name.padEnd(10)} found=${String(s.curriculumSubjectsFound).padEnd(3)} created=${String(s.created).padEnd(3)} ${s.warnings && s.warnings.length ? '⚠ ' + s.warnings.join(' | ') : ''}`);
  }
  console.log(`\n  total assignments created this run: ${totalCreated}`);

  // ------------------------------------------------------ final state per block
  const finalGroups = await BlockGroup.find({}).sort({ courseCode: 1, yearLevel: 1, name: 1 }).lean();
  console.log('\n=== final subject counts per block ===');
  for (const g of finalGroups) {
    const gSections = await BlockSection.find({ blockGroupId: g._id }).select('_id sectionCode').lean();
    const counts = await Promise.all(gSections.map((s) => BlockSubjectAssignment.countDocuments({ blockSectionId: s._id })));
    const expected = g.curriculumId && g.yearLevel && g.semester
      ? await CurriculumSubject.countDocuments({ curriculumId: g.curriculumId, yearLevel: g.yearLevel, semester: g.semester, isRequired: true })
      : 0;
    console.log(`  ${g.name.padEnd(10)} year=${g.yearLevel} sem=${g.semester.padEnd(6)} expected=${String(expected).padEnd(3)} sections: ${gSections.map((s, i) => `${s.sectionCode}=${counts[i]}`).join(', ')}`);
  }

  await mongoose.disconnect();
}

main().catch((e) => { console.error('\nFAILED:', e.message); process.exit(1); });
