/**
 * Rollover term resolution.
 *
 * A rollover request carries the OPENING term of the target:
 *   - semester rollover: same school year, opening the next term (1st → 2nd)
 *   - year rollover:     a new school year, opening its first term
 *
 * The term being CLOSED is not always the opening term. In a year rollover the
 * closing cohort lives in the term the school year actually ended in (usually
 * the 2nd semester, or Summer when the school offers it). Reading the opening
 * semester (1st) there would grade and block-check the wrong term, so the
 * closing semester must be resolved explicitly.
 *
 * This module is intentionally small and DB-light: the async wrapper reads the
 * active academic term once per request, and only falls back to the closing
 * year's own enrollment records for a retrospective closure (where the active
 * term already belongs to a later school year).
 */

const SystemSetting = require('../models/SystemSetting');
const Enrollment = require('../models/Enrollment');

const ACADEMIC_TERM_KEY = 'academicTerm';
const SEMESTERS = ['1st', '2nd', 'Summer'];
const TERM_ORDER = { '1st': 0, '2nd': 1, Summer: 2 };

function sameText(left, right) {
  return String(left ?? '').trim() === String(right ?? '').trim();
}

function isSemester(value) {
  return SEMESTERS.includes(String(value ?? ''));
}

/**
 * The term immediately before the opening term. Only same-year semester
 * rollovers use this; the supported transition is 1st → 2nd.
 */
function previousSemester(openingSemester) {
  if (openingSemester === '2nd') return '1st';
  if (openingSemester === 'Summer') return '2nd';
  return null;
}

function latestSemester(semesters) {
  const valid = (semesters || [])
    .map((semester) => String(semester ?? '').trim())
    .filter((semester) => SEMESTERS.includes(semester));
  if (valid.length === 0) return null;
  return valid.sort((left, right) => TERM_ORDER[left] - TERM_ORDER[right])[valid.length - 1];
}

/**
 * Pure resolver. Prefer the active term when it belongs to the closing year;
 * otherwise use the latest term that actually has data for that year.
 */
function resolveClosingSemester({
  fromSchoolYear,
  toSchoolYear,
  openingSemester,
  activeTerm = null,
  latestTermSemester = null,
}) {
  const opening = isSemester(openingSemester) ? String(openingSemester) : null;
  if (!opening) return null;

  if (sameText(fromSchoolYear, toSchoolYear)) {
    return previousSemester(opening);
  }

  if (
    activeTerm
    && sameText(activeTerm.schoolYear, fromSchoolYear)
    && isSemester(activeTerm.semester)
  ) {
    return String(activeTerm.semester);
  }

  if (isSemester(latestTermSemester)) {
    return String(latestTermSemester);
  }

  // No active term in the closing year and no enrollment history to inspect:
  // preserve the historical fallback (the opening term).
  return opening;
}

/**
 * Latest semester with enrollment data for a school year. Used only for a
 * retrospective year closure, where the active term is a later school year.
 */
async function findLatestTermSemester(schoolYear) {
  if (!schoolYear) return null;
  const semesters = await Enrollment.distinct('semester', {
    schoolYear,
    status: { $nin: ['Dropped', 'Cancelled'] },
  });
  return latestSemester(semesters);
}

/**
 * Async wrapper used by previews/validation/execution. Pass `activeTerm` when
 * the caller already loaded it; omit it to read it from SystemSetting.
 */
async function resolveClosingSemesterForRollover({
  fromSchoolYear,
  toSchoolYear,
  openingSemester,
  activeTerm = undefined,
}) {
  const opening = isSemester(openingSemester) ? String(openingSemester) : null;
  if (!opening) return null;

  if (sameText(fromSchoolYear, toSchoolYear)) {
    return previousSemester(opening);
  }

  let resolvedActiveTerm = activeTerm;
  if (resolvedActiveTerm === undefined) {
    const setting = await SystemSetting.findOne({ key: ACADEMIC_TERM_KEY }).lean();
    resolvedActiveTerm = setting?.value || null;
  }

  let latestTermSemester = null;
  if (resolvedActiveTerm && !sameText(resolvedActiveTerm.schoolYear, fromSchoolYear)) {
    // The active term is already in a later school year: this is a
    // retrospective closure, so derive the closing term from the year's data.
    latestTermSemester = await findLatestTermSemester(fromSchoolYear);
  }

  return resolveClosingSemester({
    fromSchoolYear,
    toSchoolYear,
    openingSemester: opening,
    activeTerm: resolvedActiveTerm,
    latestTermSemester,
  });
}

module.exports = {
  ACADEMIC_TERM_KEY,
  SEMESTERS,
  TERM_ORDER,
  previousSemester,
  latestSemester,
  resolveClosingSemester,
  findLatestTermSemester,
  resolveClosingSemesterForRollover,
};
