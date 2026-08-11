const mongoose = require('mongoose');
const CurriculumSubject = require('../models/CurriculumSubject');
const Subject = require('../models/Subject');
const BlockSubjectAssignment = require('../models/BlockSubjectAssignment');

/**
 * Auto-assigns subjects from a BlockGroup's linked Curriculum to its sections.
 *
 * The Curriculum is the academic blueprint. CurriculumSubject defines which
 * subjects belong to a curriculum at a specific yearLevel + semester.
 * BlockSubjectAssignment defines which subjects are actually offered to a
 * specific block section.
 *
 * This service bridges the two: for a BlockGroup with a curriculumId, it finds
 * matching CurriculumSubject placements and creates BlockSubjectAssignment
 * records for each section.
 *
 * Key properties:
 * - Idempotent: running twice creates 0 duplicates (uses unique index + E11000 catch)
 * - Only assigns isRequired subjects by default (includeElectives option for non-required)
 * - Skips inactive subjects with warnings
 * - Uses bulk insertMany for efficiency
 * - Does NOT delete existing assignments (sync only adds, never removes)
 */
async function autoAssignSubjectsFromCurriculum(blockGroup, sections, adminId, options = {}) {
  const { includeElectives = false } = options;

  const result = {
    sections: 0,
    curriculumSubjectsFound: 0,
    created: 0,
    skipped: 0,
    warnings: [],
    errors: [],
  };

  // Validate blockGroup has curriculum context
  if (!blockGroup.curriculumId) {
    result.warnings.push('Block group has no linked curriculum — skipping auto-assign.');
    return result;
  }

  if (!blockGroup.yearLevel) {
    result.warnings.push('Block group has no year level — skipping auto-assign.');
    return result;
  }

  if (!blockGroup.semester) {
    result.warnings.push('Block group has no semester — skipping auto-assign.');
    return result;
  }

  if (!blockGroup.schoolYear) {
    result.warnings.push('Block group has no school year — skipping auto-assign.');
    return result;
  }

  if (!sections || sections.length === 0) {
    result.warnings.push('No sections found in block group — nothing to assign.');
    return result;
  }

  result.sections = sections.length;

  // Query CurriculumSubject for this curriculum + yearLevel + semester
  const curriculumQuery = {
    curriculumId: blockGroup.curriculumId,
    yearLevel: Number(blockGroup.yearLevel),
    semester: blockGroup.semester,
  };

  // Filter by isRequired unless includeElectives is true
  if (!includeElectives) {
    curriculumQuery.isRequired = true;
  }

  const curriculumSubjects = await CurriculumSubject.find(curriculumQuery)
    .select('subjectId isRequired type')
    .lean();

  result.curriculumSubjectsFound = curriculumSubjects.length;

  if (curriculumSubjects.length === 0) {
    result.warnings.push(
      `No ${includeElectives ? '' : 'required '}subjects found in curriculum for Year ${blockGroup.yearLevel}, ${blockGroup.semester} Semester.`
    );
    return result;
  }

  // Collect all subjectIds and check which are active
  const subjectIds = curriculumSubjects.map((cs) => cs.subjectId);
  const activeSubjects = await Subject.find({
    _id: { $in: subjectIds },
    isActive: true,
    status: { $ne: 'Inactive' },
  }).select('_id code').lean();

  const activeSubjectIds = new Set(activeSubjects.map((s) => String(s._id)));
  const activeSubjectMap = new Map(activeSubjects.map((s) => [String(s._id), s]));

  // Filter curriculum subjects to only active ones
  const validPlacements = curriculumSubjects.filter((cs) =>
    activeSubjectIds.has(String(cs.subjectId))
  );

  // Report skipped inactive subjects
  for (const cs of curriculumSubjects) {
    if (!activeSubjectIds.has(String(cs.subjectId))) {
      const subjectCode = '(unknown)';
      result.warnings.push(`Skipped subject ${subjectCode} because it is inactive.`);
    }
  }

  if (validPlacements.length === 0) {
    result.warnings.push('All curriculum subjects are inactive — no assignments created.');
    return result;
  }

  // Query existing assignments to determine what's already there (idempotency)
  const sectionIds = sections.map((s) => s._id);
  const existingAssignments = await BlockSubjectAssignment.find({
    blockSectionId: { $in: sectionIds },
    subjectId: { $in: validPlacements.map((p) => p.subjectId) },
    semester: blockGroup.semester,
    academicYear: blockGroup.schoolYear,
  }).select('blockSectionId subjectId').lean();

  // Build a set of existing (sectionId|subjectId) pairs for fast lookup
  const existingKeys = new Set(
    existingAssignments.map((a) => `${String(a.blockSectionId)}|${String(a.subjectId)}`)
  );

  // Build the docs to insert
  const docsToInsert = [];
  for (const section of sections) {
    for (const placement of validPlacements) {
      const key = `${String(section._id)}|${String(placement.subjectId)}`;
      if (existingKeys.has(key)) {
        result.skipped++;
        continue;
      }
      docsToInsert.push({
        blockSectionId: section._id,
        subjectId: placement.subjectId,
        semester: blockGroup.semester,
        academicYear: blockGroup.schoolYear,
        assignedBy: adminId,
        assignedAt: new Date(),
      });
    }
  }

  if (docsToInsert.length === 0) {
    return result;
  }

  // Bulk insert with ordered: false to continue past duplicate-key errors
  try {
    await BlockSubjectAssignment.insertMany(docsToInsert, { ordered: false });
    result.created = docsToInsert.length;
  } catch (error) {
    // E11000 = duplicate key — some assignments already existed (race condition)
    // Count how many succeeded vs failed
    if (error?.code === 11000 || error?.writeErrors?.some((e) => e.code === 11000)) {
      const successfulInserts = error.insertedDocs
        ? error.insertedDocs.length
        : docsToInsert.length - (error.writeErrors?.length || 0);
      result.created = successfulInserts;
      result.skipped += (error.writeErrors?.length || 0);
    } else {
      result.errors.push(error.message || 'Failed to insert assignments');
      throw error;
    }
  }

  return result;
}

module.exports = { autoAssignSubjectsFromCurriculum };
