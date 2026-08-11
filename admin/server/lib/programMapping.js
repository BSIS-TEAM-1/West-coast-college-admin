/**
 * Centralized program/course mapping for the WCC-Admin system.
 *
 * Single source of truth for:
 *   - numeric program codes (101, 102, 103, 201)
 *   - Enrollment.course enum values ('BEED', 'BSED', 'BSBA')
 *   - display labels and full program names
 *   - course code normalization
 *
 * All controllers, services, and migrations MUST use this module
 * instead of defining their own local mappings.
 */

// ─── Canonical program definitions ───
const PROGRAMS = [
  { code: 101, enrollmentCode: 'BEED', shortLabel: 'BEED',       fullLabel: 'Bachelor of Elementary Education' },
  { code: 102, enrollmentCode: 'BSED', shortLabel: 'BSEd-English', fullLabel: 'Bachelor of Secondary Education - Major in English' },
  { code: 103, enrollmentCode: 'BSED', shortLabel: 'BSEd-Math',   fullLabel: 'Bachelor of Secondary Education - Major in Mathematics' },
  { code: 201, enrollmentCode: 'BSBA', shortLabel: 'BSBA-HRM',   fullLabel: 'Bachelor of Science in Business Administration - Major in HRM' },
];

const PROGRAM_BY_CODE = Object.fromEntries(PROGRAMS.map((p) => [p.code, p]));

// ─── Public API ───

/**
 * Returns the Enrollment.course enum value for a numeric program code.
 * @param {number|string} programCode
 * @returns {string|null} e.g. 'BEED', 'BSED', 'BSBA'
 */
function getEnrollmentCourseCode(programCode) {
  const program = PROGRAM_BY_CODE[Number(programCode)];
  return program ? program.enrollmentCode : null;
}

/**
 * Returns the short label (e.g. 'BEED', 'BSEd-English') for a numeric program code.
 * @param {number|string} programCode
 * @returns {string|null}
 */
function getShortLabel(programCode) {
  const program = PROGRAM_BY_CODE[Number(programCode)];
  return program ? program.shortLabel : null;
}

/**
 * Returns the full program name for a numeric program code.
 * @param {number|string} programCode
 * @returns {string|null}
 */
function getFullLabel(programCode) {
  const program = PROGRAM_BY_CODE[Number(programCode)];
  return program ? program.fullLabel : null;
}

/**
 * Returns all program codes.
 * @returns {number[]}
 */
function getAllProgramCodes() {
  return PROGRAMS.map((p) => p.code);
}

/**
 * Returns the COURSE_OPTIONS array (compatible with existing code).
 * @returns {Array<{id: number, code: string, name: string}>}
 */
function getCourseOptions() {
  return PROGRAMS.map((p) => ({ id: p.code, code: p.shortLabel, name: p.fullLabel }));
}

/**
 * Normalizes any course representation to the canonical numeric code.
 * Accepts: 101, '101', 'BEED', 'BSEd-English', 'BSED-ENGLISH', 'ENGLISH', etc.
 * @param {string|number|null|undefined} rawCourse
 * @returns {number|null} 101, 102, 103, 201, or null if unrecognized
 */
function normalizeCourseCode(rawCourse) {
  if (rawCourse === null || rawCourse === undefined) return null;
  const text = String(rawCourse).trim();
  if (!text) return null;

  if (/^\d+$/.test(text)) {
    const numeric = Number(text);
    return Number.isFinite(numeric) ? numeric : null;
  }

  const upper = text.toUpperCase().replace(/\u2013/g, '-');
  if (upper === 'BEED') return 101;
  if (upper === 'BSED-ENGLISH' || upper === 'ENGLISH') return 102;
  if (upper === 'BSED-MATH' || upper === 'MATH' || upper === 'MATHEMATICS') return 103;
  if (upper === 'BSBA-HRM' || upper === 'BSBS-HRM' || upper === 'HRM' || upper.includes('BUSINESS ADMINISTRATION')) return 201;
  if (upper === 'BSED') return 102; // ambiguous — default to English
  if (upper === 'BSBA') return 201;
  return null;
}

module.exports = {
  PROGRAMS,
  getEnrollmentCourseCode,
  getShortLabel,
  getFullLabel,
  getAllProgramCodes,
  getCourseOptions,
  normalizeCourseCode,
};
