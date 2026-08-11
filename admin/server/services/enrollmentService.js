/**
 * Enrollment Service — authoritative academic-period enrollment creation.
 *
 * Architecture:
 *   Application → Enrollment → Curriculum → Block → Curriculum Subjects
 *
 * Enrollment is the authoritative record for a student's enrollment in a
 * specific school year, semester, curriculum, program, and year level.
 *
 * Student.enrollmentStatus is a denormalized display field and MUST NOT
 * be used as a substitute for an Enrollment record.
 */

const mongoose = require('mongoose');
const Enrollment = require('../models/Enrollment');
const Curriculum = require('../models/Curriculum');
const { getEnrollmentCourseCode, normalizeCourseCode } = require('../lib/programMapping');

/**
 * Resolve the curriculum for a new enrollment.
 *
 * Resolution order:
 *   1. If curriculumId is explicitly provided, validate it exists and matches the program.
 *   2. If student.curriculumVersion is provided, match by programCode + version.
 *   3. Fall back to the Active curriculum for the program.
 *
 * If no curriculum can be determined, returns null and sets a reason.
 *
 * @param {Object} params
 * @param {number} params.programCode - Numeric program code (101, 102, etc.)
 * @param {string|null} params.curriculumVersion - Optional version string from Student
 * @param {string|null} params.explicitCurriculumId - Optional explicit curriculumId
 * @param {import('mongoose').ClientSession|null} params.session - Optional mongoose session
 * @returns {Promise<{ curriculumId: import('mongoose').Types.ObjectId|null, source: string|null, reason: string|null }>}
 */
async function resolveCurriculum({ programCode, curriculumVersion, explicitCurriculumId, session }) {
  const query = (q) => (session ? q.session(session) : q);

  // 1. Explicit curriculumId — validate it belongs to this program
  if (explicitCurriculumId) {
    const curriculum = await query(Curriculum.findById(explicitCurriculumId).select('_id programCode status').lean());
    if (curriculum && Number(curriculum.programCode) === Number(programCode)) {
      return { curriculumId: curriculum._id, source: 'explicit', reason: null };
    }
    return { curriculumId: null, source: null, reason: 'Explicit curriculumId does not match program or does not exist' };
  }

  // 2. Match by Student.curriculumVersion
  if (curriculumVersion && String(curriculumVersion).trim()) {
    const matched = await query(
      Curriculum.findOne({
        programCode: Number(programCode),
        version: String(curriculumVersion).trim(),
      }).select('_id status').lean()
    );
    if (matched) {
      return { curriculumId: matched._id, source: 'version', reason: null };
    }
  }

  // 3. Fall back to Active curriculum
  const active = await query(
    Curriculum.findOne({
      programCode: Number(programCode),
      status: 'Active',
    }).select('_id').lean()
  );
  if (active) {
    return { curriculumId: active._id, source: 'active', reason: null };
  }

  return { curriculumId: null, source: null, reason: `No curriculum found for program ${programCode}` };
}

/**
 * Create or reactivate an Enrollment record for a student.
 *
 * This operation is idempotent:
 *   - If an Enrollment already exists for (studentId, schoolYear, semester),
 *     it is reused. If it's not locked and not already 'Enrolled', it's reactivated.
 *   - If no Enrollment exists, a new one is created.
 *
 * @param {Object} params
 * @param {import('mongoose').Types.ObjectId|string} params.studentId
 * @param {string} params.studentNumber
 * @param {number} params.programCode - Numeric (101, 102, etc.)
 * @param {number} params.yearLevel
 * @param {string} params.semester - '1st', '2nd', 'Summer'
 * @param {string} params.schoolYear - '2026-2027'
 * @param {string|null} [params.curriculumVersion] - Optional Student.curriculumVersion
 * @param {string|null} [params.explicitCurriculumId] - Optional explicit curriculumId
 * @param {import('mongoose').ClientSession|null} [params.session] - Optional mongoose session
 * @returns {Promise<{ enrollment: Object, created: boolean, reactivated: boolean, curriculumSource: string }>}
 * @throws {Error} If required fields are missing or curriculum cannot be resolved
 */
async function createOrReactivateEnrollment({
  studentId,
  studentNumber,
  programCode,
  yearLevel,
  semester,
  schoolYear,
  curriculumVersion,
  explicitCurriculumId,
  session,
}) {
  // ─── Validate required fields ───
  if (!studentId) throw new Error('studentId is required');
  if (!schoolYear || !/^\d{4}-\d{4}$/.test(schoolYear)) {
    throw new Error(`Invalid schoolYear "${schoolYear}". Expected format YYYY-YYYY`);
  }
  if (!['1st', '2nd', 'Summer'].includes(semester)) {
    throw new Error(`Invalid semester "${semester}". Expected 1st, 2nd, or Summer`);
  }
  if (!Number.isFinite(Number(yearLevel)) || Number(yearLevel) < 1) {
    throw new Error(`Invalid yearLevel "${yearLevel}"`);
  }

  const normalizedProgramCode = normalizeCourseCode(programCode);
  if (!normalizedProgramCode) {
    throw new Error(`Invalid/missing program code "${programCode}"`);
  }

  const enrollmentCourse = getEnrollmentCourseCode(normalizedProgramCode);
  if (!enrollmentCourse) {
    throw new Error(`Cannot map program code ${normalizedProgramCode} to an Enrollment course enum value`);
  }

  // ─── Resolve curriculum ───
  const { curriculumId, source, reason } = await resolveCurriculum({
    programCode: normalizedProgramCode,
    curriculumVersion,
    explicitCurriculumId,
    session,
  });

  if (!curriculumId) {
    throw new Error(`Cannot create enrollment: ${reason}. Program ${normalizedProgramCode} has no applicable curriculum.`);
  }

  // ─── Check for existing enrollment ───
  const query = (q) => (session ? q.session(session) : q);
  const existing = await query(
    Enrollment.findOne({
      studentId,
      schoolYear,
      semester,
    }).lean()
  );

  if (existing) {
    // Do not mutate locked/historical records
    if (existing.lockedAt) {
      return { enrollment: existing, created: false, reactivated: false, curriculumSource: 'existing-locked' };
    }
    if (existing.status === 'Enrolled' && existing.isCurrent) {
      return { enrollment: existing, created: false, reactivated: false, curriculumSource: 'existing' };
    }
    // Reactivate
    await Enrollment.updateOne(
      { _id: existing._id },
      {
        $set: {
          status: 'Enrolled',
          isCurrent: true,
          curriculumId: curriculumId,
          course: enrollmentCourse,
          yearLevel: Number(yearLevel),
        },
      },
      { session }
    );
    return { enrollment: { ...existing, status: 'Enrolled', isCurrent: true, curriculumId }, created: false, reactivated: true, curriculumSource: source };
  }

  // ─── Create new enrollment ───
  const enrollmentDocs = await Enrollment.create([{
    studentId,
    studentNumber: studentNumber || '',
    schoolYear,
    semester,
    yearLevel: Number(yearLevel),
    course: enrollmentCourse,
    curriculumId,
    status: 'Enrolled',
    isCurrent: true,
    subjects: [],
  }], { session });

  return { enrollment: enrollmentDocs[0], created: true, reactivated: false, curriculumSource: source };
}

module.exports = {
  resolveCurriculum,
  createOrReactivateEnrollment,
};
