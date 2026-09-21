/**
 * Date utility functions for enrollment system
 * Handles semester and school year format conversions
 */

/**
 * Convert numeric year to school year string format
 * @param {number|string} year - Numeric year (e.g., 2026) or school year string (e.g., "2026-2027")
 * @returns {string} School year in format "YYYY-YYYY"
 */
function convertToSchoolYear(year) {
  if (typeof year === 'string') {
    // If already in school year format, return as-is
    if (/^\d{4}-\d{4}$/.test(year)) {
      return year;
    }
    // If string but not in format, try to parse as number
    const numericYear = parseInt(year, 10);
    if (!isNaN(numericYear)) {
      return `${numericYear}-${numericYear + 1}`;
    }
    throw new Error(`Invalid year format: ${year}`);
  }
  
  if (typeof year === 'number') {
    if (!Number.isFinite(year) || year < 1000 || year > 9999) {
      throw new Error(`Invalid numeric year: ${year}`);
    }
    return `${year}-${year + 1}`;
  }
  
  throw new Error(`Year must be a number or string, got: ${typeof year}`);
}

/**
 * Extract the starting year from a school year string
 * @param {string} schoolYear - School year in format "YYYY-YYYY"
 * @returns {number} Starting year as number
 */
function extractStartYear(schoolYear) {
  if (typeof schoolYear !== 'string' || !/^\d{4}-\d{4}$/.test(schoolYear)) {
    throw new Error(`Invalid school year format: ${schoolYear}`);
  }
  return parseInt(schoolYear.split('-')[0], 10);
}

/**
 * Normalize semester value to standard format
 * @param {string} semester - Semester value (e.g., "1st", "2nd", "Summer", "1", "2")
 * @returns {string} Normalized semester value
 */
function normalizeSemester(semester) {
  if (typeof semester !== 'string') {
    throw new Error(`Semester must be a string, got: ${typeof semester}`);
  }
  
  const normalized = semester.trim().toLowerCase();
  
  // Map common variations to standard format
  const semesterMap = {
    '1': '1st',
    '2': '2nd',
    'first': '1st',
    'second': '2nd',
    'summer': 'Summer',
    '1st': '1st',
    '2nd': '2nd'
  };
  
  return semesterMap[normalized] || semester;
}

/**
 * Check if a semester/year combination is current
 * @param {string} semester - Semester value
 * @param {string|number} year - School year or numeric year
 * @param {string} currentSemester - Current semester (optional, defaults to system setting)
 * @param {string} currentYear - Current school year (optional, defaults to system setting)
 * @returns {boolean} True if the given semester/year is current
 */
function isCurrentSemester(semester, year, currentSemester = null, currentYear = null) {
  // If current values not provided, we'd need to fetch from system settings
  // For now, this is a placeholder - actual implementation would check AcademicPeriod
  // This function can be extended when AcademicPeriod integration is needed
  
  try {
    const normalizedSemester = normalizeSemester(semester);
    const normalizedYear = convertToSchoolYear(year);
    
    // Placeholder logic - replace with actual AcademicPeriod check
    return normalizedSemester === currentSemester && normalizedYear === currentYear;
  } catch (error) {
    console.error('Error checking current semester:', error);
    return false;
  }
}

module.exports = {
  convertToSchoolYear,
  extractStartYear,
  normalizeSemester,
  isCurrentSemester
};