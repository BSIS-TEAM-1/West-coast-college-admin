/**
 * Rollover grade resolution.
 *
 * The rollover used to read only `Student.latestGrade`, a denormalized field
 * that is not written when a professor submits or the registrar publishes the
 * subject grades. A student with fully graded subjects therefore still showed
 * "No grade recorded - needs registrar review".
 *
 * The closing-term Enrollment is the source of truth. This helper derives the
 * student's effective rollover grade from the subjects of the term being
 * closed, falling back to the legacy `Student.latestGrade` only when the term
 * has no usable grade at all.
 *
 * The representative grade is the LOWEST (numerically highest) recorded grade
 * in the term, so a student who failed even one subject is never recommended
 * for promotion just because another subject had a passing grade.
 */

const Enrollment = require('../models/Enrollment');
const gradingScaleService = require('./gradingScaleService');

const EXCLUDED_ENROLLMENT_STATUSES = ['Dropped', 'Cancelled'];
const EXCLUDED_SUBJECT_STATUSES = ['Dropped', 'Removed'];
const RETURNED_STATUS = 'RETURNED';

function toFiniteNumber(value) {
  if (value === null || value === undefined || String(value).trim() === '') return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function normalizedStatus(value) {
  return String(value ?? '').trim().toUpperCase();
}

/**
 * Numeric grade carried by one enrollment subject, or null when the subject
 * has no usable grade (still draft without a value, INC/DRP/W/NG, dropped,
 * or returned for correction).
 *
 * FA always resolves to its fixed CHED equivalent (5.0), even for legacy rows
 * that only stored the mark.
 */
function subjectEffectiveGrade(subject) {
  if (!subject) return null;
  if (EXCLUDED_SUBJECT_STATUSES.includes(normalizedStatus(subject.status))) return null;
  if (normalizedStatus(subject.submissionStatus) === RETURNED_STATUS) return null;

  const failingEquivalent = gradingScaleService.failingEquivalentForMark(subject.gradeMark);
  if (failingEquivalent !== null) return failingEquivalent;

  const grade = toFiniteNumber(subject.grade);
  return grade !== null && grade > 0 ? grade : null;
}

/**
 * Reduce a student's closing-term enrollments to one rollover grade.
 * `gradedSubjects` counts the graded subject entries that contributed.
 */
function summarizeGrades(enrollments) {
  let grade = null;
  let gradedSubjects = 0;

  for (const enrollment of enrollments || []) {
    for (const subject of enrollment?.subjects || []) {
      const effectiveGrade = subjectEffectiveGrade(subject);
      if (effectiveGrade === null) continue;
      gradedSubjects += 1;
      if (grade === null || effectiveGrade > grade) grade = effectiveGrade;
    }
  }

  return { grade, gradedSubjects };
}

/**
 * Load the derived closing-term grade for every matching student.
 *
 * @param {Object} params
 * @param {string} params.schoolYear  closing school year
 * @param {string} [params.semester]  closing semester
 * @param {Array}  [params.studentIds] optional restriction (one page of students)
 * @returns {Promise<Map<string, {grade: number|null, gradedSubjects: number}>>}
 */
async function loadClosingGradeMap({ schoolYear, semester, studentIds = null }) {
  const map = new Map();
  if (!schoolYear) return map;
  if (Array.isArray(studentIds) && studentIds.length === 0) return map;

  const query = {
    schoolYear,
    status: { $nin: EXCLUDED_ENROLLMENT_STATUSES },
  };
  if (semester) query.semester = semester;
  if (Array.isArray(studentIds)) query.studentId = { $in: studentIds };

  const enrollments = await Enrollment.find(query)
    .select('studentId subjects')
    .lean();

  const grouped = new Map();
  for (const enrollment of enrollments || []) {
    const studentId = String(enrollment.studentId);
    if (!grouped.has(studentId)) grouped.set(studentId, []);
    grouped.get(studentId).push(enrollment);
  }

  for (const [studentId, studentEnrollments] of grouped.entries()) {
    map.set(studentId, summarizeGrades(studentEnrollments));
  }
  return map;
}

/**
 * IDs of students who have at least one usable grade in the closing term.
 * Used to find the real needs-review cohort without loading every enrollment.
 */
async function loadGradedStudentIds({ schoolYear, semester }) {
  if (!schoolYear) return [];

  const query = {
    schoolYear,
    status: { $nin: EXCLUDED_ENROLLMENT_STATUSES },
    subjects: {
      $elemMatch: {
        status: { $nin: EXCLUDED_SUBJECT_STATUSES },
        submissionStatus: { $ne: 'Returned' },
        $or: [
          { grade: { $type: 'number', $gt: 0 } },
          { gradeMark: /^fa$/i },
        ],
      },
    },
  };
  if (semester) query.semester = semester;

  const ids = await Enrollment.distinct('studentId', query);
  return (ids || []).map((id) => String(id));
}

/**
 * Pick the grade the rollover should classify: closing-term grade first,
 * legacy Student.latestGrade only as a fallback.
 */
function resolveEffectiveGrade(latestGrade, gradeInfo) {
  if (gradeInfo && Number.isFinite(gradeInfo.grade)) return gradeInfo.grade;
  return Number.isFinite(latestGrade) ? latestGrade : null;
}

module.exports = {
  CHED_FAILING_GRADE: gradingScaleService.CHED_FAILING_GRADE,
  subjectEffectiveGrade,
  summarizeGrades,
  loadClosingGradeMap,
  loadGradedStudentIds,
  resolveEffectiveGrade,
};
