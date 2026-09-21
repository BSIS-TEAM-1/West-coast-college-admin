/**
 * Enrollment Guard — single source of truth for the official ENROLLED transition.
 *
 * Core business rule:
 *   A student must NOT be considered officially enrolled unless a valid block
 *   assignment exists for the same academic period and academic context.
 *
 * Required lifecycle:
 *   APPLICANT → REGISTERED → ENROLLMENT_PENDING → BLOCK_ASSIGNED → ENROLLED
 *
 * A student may transition to ENROLLED only when ALL of these hold:
 *   1.  Student record exists.
 *   2.  Academic school year is defined.
 *   3.  Semester is defined.
 *   4.  Course/program is defined.
 *   5.  Year level is defined.
 *   6.  An Enrollment record exists for the same academic period.
 *   7.  A valid (ASSIGNED) block assignment exists.
 *   8.  The block assignment belongs to the same school year, semester,
 *       course/program, and year level.
 *   9.  The student is actually associated with that block.
 *   10. The enrollment operation succeeds completely (caller's transaction).
 *
 * All writers that can produce lifecycleStatus='Enrolled' MUST go through
 * assertEnrolledRequirements() or finalizeEnrollment() in this module:
 *   - StudentController.updateStudent (direct lifecycle edits, COR verification)
 *   - BlockController.assignStudent (finalizes ENROLLED after block assignment)
 *   - scripts/migrations that reconcile enrollment state
 *
 * The frontend must never mark a student ENROLLED on its own; the backend
 * rejects direct ENROLLED transitions that fail these checks (HTTP 409).
 */

const mongoose = require('mongoose');
const Student = require('../models/Student');
const Enrollment = require('../models/Enrollment');
const StudentBlockAssignment = require('../models/StudentBlockAssignment');
const BlockSection = require('../models/BlockSection');
const BlockGroup = require('../models/BlockGroup');
const { normalizeCourseCode } = require('../lib/programMapping');

const SEMESTERS = ['1st', '2nd', 'Summer'];
const SCHOOL_YEAR_PATTERN = /^\d{4}-\d{4}$/;

function schoolYearFromStartYear(value) {
  const year = Number(value);
  if (!Number.isFinite(year) || year < 1000) return '';
  return `${year}-${year + 1}`;
}

/**
 * Resolve the school year an assignment belongs to.
 * Prefers the explicit schoolYear field; falls back to deriving it from `year`.
 */
function assignmentSchoolYear(assignment) {
  const explicit = String(assignment?.schoolYear || '').trim();
  if (SCHOOL_YEAR_PATTERN.test(explicit)) return explicit;
  return schoolYearFromStartYear(assignment?.year);
}

function toObjectIdIfValid(value) {
  const text = String(value || '').trim();
  if (!text || !mongoose.Types.ObjectId.isValid(text)) return null;
  return new mongoose.Types.ObjectId(text);
}

/**
 * Find a valid block assignment for a student's current academic context.
 *
 * Matching rule: status ASSIGNED + same student + same schoolYear + same
 * semester + the section's block group declares the same course/program and
 * year level (when the group declares them).
 *
 * @param {Object} studentLike - Student doc/lean object (needs _id, schoolYear, semester, course, yearLevel)
 * @param {Object} [options]
 * @param {import('mongoose').ClientSession|null} [options.session]
 * @returns {Promise<{ assignment: Object|null, section: Object|null, group: Object|null, reasons: string[] }>}
 */
async function findValidBlockAssignment(studentLike, options = {}) {
  const { session } = options;
  const empty = { assignment: null, section: null, group: null, reasons: [] };
  const scoped = (query) => (session ? query.session(session) : query);

  const studentId = String(studentLike?._id || studentLike?.studentId || '').trim();
  if (!studentId) {
    return { ...empty, reasons: ['Student record does not exist'] };
  }

  const expectedSchoolYear = String(studentLike?.schoolYear || '').trim();
  const expectedSemester = String(studentLike?.semester || '').trim();
  const expectedCourse = normalizeCourseCode(studentLike?.course);
  const expectedYearLevel = Number(studentLike?.yearLevel);

  const assignments = await scoped(
    StudentBlockAssignment.find({ studentId, status: 'ASSIGNED' }).lean()
  );
  if (!assignments.length) {
    return { ...empty, reasons: ['No block assignment exists for this student'] };
  }

  const periodMatches = assignments.filter(
    (assignment) =>
      assignmentSchoolYear(assignment) === expectedSchoolYear &&
      String(assignment.semester || '').trim() === expectedSemester
  );
  if (!periodMatches.length) {
    return {
      ...empty,
      reasons: [
        `No block assignment for academic period ${expectedSchoolYear || 'N/A'} ${expectedSemester || 'N/A'}`
      ]
    };
  }

  const sectionIds = Array.from(
    new Set(
      periodMatches
        .map((assignment) => String(assignment.sectionId || '').trim())
        .filter((sectionId) => mongoose.Types.ObjectId.isValid(sectionId))
    )
  ).map((sectionId) => new mongoose.Types.ObjectId(sectionId));

  const sections = sectionIds.length
    ? await scoped(BlockSection.find({ _id: { $in: sectionIds } }).lean())
    : [];
  const sectionById = new Map(sections.map((section) => [String(section._id), section]));

  const groupIds = Array.from(
    new Set(
      sections
        .map((section) => String(section.blockGroupId || '').trim())
        .filter((groupId) => mongoose.Types.ObjectId.isValid(groupId))
    )
  ).map((groupId) => new mongoose.Types.ObjectId(groupId));

  const groups = groupIds.length
    ? await scoped(BlockGroup.find({ _id: { $in: groupIds } }).lean())
    : [];
  const groupById = new Map(groups.map((group) => [String(group._id), group]));

  const reasons = [];
  for (const assignment of periodMatches) {
    const section = sectionById.get(String(assignment.sectionId || '').trim());
    if (!section) {
      reasons.push(`Block assignment references a section that no longer exists (${String(assignment.sectionId)})`);
      continue;
    }
    const group = groupById.get(String(section.blockGroupId || '').trim());
    if (!group) {
      reasons.push(`Block section ${section.sectionCode || section._id} is not attached to a block group`);
      continue;
    }

    const groupCourse = normalizeCourseCode(group.courseId ?? group.courseCode);
    if (groupCourse && expectedCourse && groupCourse !== expectedCourse) {
      reasons.push(
        `Block ${group.name || section.sectionCode} requires program ${groupCourse}, student is program ${expectedCourse}`
      );
      continue;
    }

    const groupYearLevel = Number(group.yearLevel);
    if (
      Number.isFinite(groupYearLevel) &&
      groupYearLevel > 0 &&
      Number.isFinite(expectedYearLevel) &&
      groupYearLevel !== expectedYearLevel
    ) {
      reasons.push(
        `Block ${group.name || section.sectionCode} requires Year ${groupYearLevel}, student is Year ${expectedYearLevel}`
      );
      continue;
    }

    // The assignment document itself is the proof of association (rule 9).
    return { assignment, section, group, reasons: [] };
  }

  return { ...empty, reasons };
}

/**
 * Find the authoritative Enrollment record for a student's academic period.
 */
async function findPeriodEnrollment(studentLike, options = {}) {
  const { session } = options;
  const scoped = (query) => (session ? query.session(session) : query);

  const studentId = toObjectIdIfValid(studentLike?._id || studentLike?.studentId);
  if (!studentId) return null;

  const schoolYear = String(studentLike?.schoolYear || '').trim();
  const semester = String(studentLike?.semester || '').trim();
  if (!schoolYear || !semester) return null;

  return scoped(
    Enrollment.findOne({
      studentId,
      schoolYear,
      semester,
      status: { $in: ['Enrolled', 'Pending'] }
    }).sort({ isCurrent: -1, createdAt: -1 }).lean()
  );
}

/**
 * Assert that a student satisfies every requirement for the ENROLLED state.
 *
 * @param {Object} studentLike - Student doc/lean object (merged with any pending updates)
 * @param {Object} [options]
 * @param {import('mongoose').ClientSession|null} [options.session]
 * @returns {Promise<{ enrollment: Object, assignment: Object, section: Object, group: Object }>}
 * @throws {Error} with statusCode 409 and details[] when requirements fail
 */
async function assertEnrolledRequirements(studentLike, options = {}) {
  const reasons = [];

  if (!studentLike || !studentLike._id) {
    reasons.push('Student record does not exist');
  }

  const schoolYear = String(studentLike?.schoolYear || '').trim();
  if (!SCHOOL_YEAR_PATTERN.test(schoolYear)) {
    reasons.push(`Academic school year is missing or invalid ("${studentLike?.schoolYear || 'none'}")`);
  }

  const semester = String(studentLike?.semester || '').trim();
  if (!SEMESTERS.includes(semester)) {
    reasons.push(`Semester is missing or invalid ("${studentLike?.semester || 'none'}")`);
  }

  const course = normalizeCourseCode(studentLike?.course);
  if (!course) {
    reasons.push(`Course/program is missing or invalid ("${studentLike?.course ?? 'none'}")`);
  }

  const yearLevel = Number(studentLike?.yearLevel);
  if (!Number.isFinite(yearLevel) || yearLevel < 1) {
    reasons.push(`Year level is missing or invalid ("${studentLike?.yearLevel ?? 'none'}")`);
  }

  let enrollment = null;
  if (reasons.length === 0) {
    enrollment = await findPeriodEnrollment(studentLike, options);
    if (!enrollment) {
      reasons.push(
        `No enrollment record exists for ${schoolYear} ${semester}`
      );
    }
  }

  let match = { assignment: null, section: null, group: null, reasons: [] };
  if (reasons.length === 0) {
    match = await findValidBlockAssignment(studentLike, options);
    if (!match.assignment) {
      reasons.push(...match.reasons);
    }
  }

  if (reasons.length > 0) {
    const error = new Error(
      'Student does not meet the requirements for ENROLLED status: a valid block assignment for the same academic period and academic context is required.'
    );
    error.statusCode = 409;
    error.details = reasons;
    throw error;
  }

  return { enrollment, assignment: match.assignment, section: match.section, group: match.group };
}

/**
 * Finalize enrollment: verify requirements, then atomically flip the
 * Enrollment record and the Student lifecycle to ENROLLED.
 *
 * Must be called inside the caller's transaction (session) together with the
 * block assignment write, so a failed assignment can never leave an ENROLLED
 * state behind:
 *   Enrollment started → validate requirements → assign block →
 *   verify assignment → finalize enrollment → status = ENROLLED
 *
 * @param {Object} params
 * @param {string|ObjectId} params.studentId
 * @param {string} [params.schoolYear] - defaults to the student's stored school year
 * @param {string} [params.semester] - defaults to the student's stored semester
 * @param {string} [params.actorId] - registrar/admin performing the action
 * @param {import('mongoose').ClientSession|null} [params.session]
 */
async function finalizeEnrollment({ studentId, schoolYear, semester, actorId, session }) {
  const normalizedStudentId = String(studentId || '').trim();
  if (!normalizedStudentId) {
    throw Object.assign(new Error('studentId is required to finalize enrollment'), { statusCode: 400 });
  }

  const findQuery = Student.findById(normalizedStudentId);
  const student = session ? await findQuery.session(session) : await findQuery;
  if (!student) {
    throw Object.assign(new Error('Student not found'), { statusCode: 404 });
  }

  const effectiveSchoolYear = String(schoolYear || student.schoolYear || '').trim();
  const effectiveSemester = String(semester || student.semester || '').trim();

  const { enrollment, section } = await assertEnrolledRequirements(
    {
      ...(student.toObject ? student.toObject() : { ...student }),
      schoolYear: effectiveSchoolYear,
      semester: effectiveSemester
    },
    { session }
  );

  // Retire any other current enrollments for this student first.
  const retireQuery = Enrollment.updateMany(
    { studentId: student._id, _id: { $ne: enrollment._id }, isCurrent: true },
    { $set: { isCurrent: false } }
  );
  await (session ? retireQuery.session(session) : retireQuery);

  const finalizeQuery = Enrollment.updateOne(
    { _id: enrollment._id },
    { $set: { status: 'Enrolled', isCurrent: true } }
  );
  await (session ? finalizeQuery.session(session) : finalizeQuery);

  student.lifecycleStatus = 'Enrolled';
  student.schoolYear = effectiveSchoolYear;
  student.semester = effectiveSemester;
  if (section?.sectionCode) {
    student.section = String(section.sectionCode);
  }
  if (actorId) {
    student.updatedBy = actorId;
  }
  await student.save({ session, validateBeforeSave: false });

  return {
    student,
    enrollmentId: enrollment._id,
    sectionCode: section?.sectionCode || '',
  };
}

module.exports = {
  SEMESTERS,
  assignmentSchoolYear,
  findValidBlockAssignment,
  findPeriodEnrollment,
  assertEnrolledRequirements,
  finalizeEnrollment,
};
