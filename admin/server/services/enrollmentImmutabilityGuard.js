/**
 * Enrollment Immutability Guard
 *
 * Centralized enforcement of the rule that locked enrollments are immutable
 * historical records. The Mongoose pre-save and pre-update hooks on the
 * Enrollment model already enforce this at the database layer. This module
 * provides an explicit assertion for use in service/controller code that
 * needs to check mutability before attempting modifications.
 *
 * Architecture:
 *   Enrollment.lockedAt != null  →  academic fields are immutable
 *   Enrollment.lockedAt == null  →  enrollment is mutable
 *
 * Academic fields protected:
 *   - curriculumId
 *   - course
 *   - yearLevel
 *   - schoolYear
 *   - semester
 *
 * Non-academic fields (subjects, grades, status, isCurrent) may still be
 * modified by the rollover service during the locking process itself.
 */

const LOCKED_ENROLLMENT_ERROR = 'This enrollment is locked as an immutable historical record and cannot be modified.';

/**
 * Assert that an enrollment is mutable (not locked).
 * Throws an Error if the enrollment has lockedAt set.
 *
 * @param {Object|null} enrollment - Enrollment document (lean or mongoose)
 * @param {string} [fieldName] - Optional field name for a more specific error message
 * @throws {Error} If enrollment is locked
 */
function assertEnrollmentMutable(enrollment, fieldName) {
  if (!enrollment) return;

  const lockedAt = enrollment.lockedAt || (enrollment.get ? enrollment.get('lockedAt') : null);
  if (lockedAt) {
    const fieldMsg = fieldName ? ` (attempted to modify: ${fieldName})` : '';
    throw new Error(`${LOCKED_ENROLLMENT_ERROR}${fieldMsg}`);
  }
}

/**
 * Check if an enrollment is locked without throwing.
 *
 * @param {Object|null} enrollment - Enrollment document (lean or mongoose)
 * @returns {boolean}
 */
function isEnrollmentLocked(enrollment) {
  if (!enrollment) return false;
  const lockedAt = enrollment.lockedAt || (enrollment.get ? enrollment.get('lockedAt') : null);
  return Boolean(lockedAt);
}

/**
 * List of academic fields that are immutable once an enrollment is locked.
 */
const IMMUTABLE_ACADEMIC_FIELDS = [
  'curriculumId',
  'course',
  'yearLevel',
  'schoolYear',
  'semester',
];

module.exports = {
  assertEnrollmentMutable,
  isEnrollmentLocked,
  IMMUTABLE_ACADEMIC_FIELDS,
  LOCKED_ENROLLMENT_ERROR,
};
