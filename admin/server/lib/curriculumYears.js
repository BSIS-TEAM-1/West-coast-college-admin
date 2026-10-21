/**
 * Single source of truth for the year levels and semesters a curriculum may
 * hold.
 *
 * Every layer that asks "which years/semesters does a curriculum support?"
 * reads this module: the placement validators, the structure endpoint, the
 * academic-progress service, and the UI. Keeping it in one place is what
 * stops the two halves of the rule from drifting apart again — the original
 * defect was that the structure endpoint only reported years that already
 * had subjects, so the control for creating a new year could never render.
 */

const MIN_YEAR_LEVEL = 1;
const MAX_YEAR_LEVEL = 6;

/** Placement semesters, in academic order. */
const SEMESTERS = Object.freeze(['1st', '2nd', 'Summer']);

/** Every year level the system accepts for a curriculum placement. */
const SUPPORTED_YEAR_LEVELS = Object.freeze(
  Array.from({ length: MAX_YEAR_LEVEL - MIN_YEAR_LEVEL + 1 }, (_, index) => MIN_YEAR_LEVEL + index)
);

/**
 * Parse a candidate year level.
 *
 * @param {*} value
 * @returns {number|null} the normalized year level, or null when unusable
 */
function parseYearLevel(value) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) return null;
  if (parsed < MIN_YEAR_LEVEL || parsed > MAX_YEAR_LEVEL) return null;
  return parsed;
}

function isSupportedYearLevel(value) {
  return parseYearLevel(value) !== null;
}

/**
 * The full year range a structure response must expose.
 *
 * Always the entire supported range, plus anything higher that legacy data
 * already contains. Empty years are included on purpose: they are what gives
 * a registrar a place to start building that year.
 *
 * @param {number} [highestYearWithSubjects]
 * @returns {number[]}
 */
function supportedYearLevels(highestYearWithSubjects = 0) {
  const highest = Number.isInteger(Number(highestYearWithSubjects))
    ? Number(highestYearWithSubjects)
    : 0;
  const top = Math.max(MAX_YEAR_LEVEL, highest);
  return Array.from({ length: top - MIN_YEAR_LEVEL + 1 }, (_, index) => MIN_YEAR_LEVEL + index);
}

/**
 * Build an empty semester shell for a year so the structure shape is stable
 * whether or not the year has been populated yet.
 *
 * @param {number} yearLevel
 * @param {(semester: string) => Object} [decorate]
 */
function emptyYear(yearLevel, decorate) {
  return {
    yearLevel,
    semesters: SEMESTERS.map((semester) => {
      const base = {
        semester,
        subjects: [],
        totalUnits: 0,
        totalLecturePeriods: 0,
        totalLabPeriods: 0,
      };
      return typeof decorate === 'function' ? decorate(base) : base;
    }),
    totalUnits: 0,
    totalLecturePeriods: 0,
    totalLabPeriods: 0,
  };
}

module.exports = {
  MIN_YEAR_LEVEL,
  MAX_YEAR_LEVEL,
  SEMESTERS,
  SUPPORTED_YEAR_LEVELS,
  parseYearLevel,
  isSupportedYearLevel,
  supportedYearLevels,
  emptyYear,
};
