'use strict';

const { convertToSchoolYear } = require('./dateUtils');

/**
 * Normalise a block/term year to the "YYYY-YYYY" school-year form.
 *
 * Legacy block groups stored `year` as a number (2026) while block
 * assignments validate against `^\d{4}-\d{4}$`, so assigning a student to one
 * of those groups failed with an opaque validation error. Returns '' when the
 * value cannot be interpreted, letting the caller fall back to another field.
 */
function normalizeSchoolYear(value) {
  if (value === null || value === undefined || value === '') return '';
  try {
    return convertToSchoolYear(typeof value === 'string' ? value.trim() : value);
  } catch {
    return '';
  }
}

module.exports = { normalizeSchoolYear };
