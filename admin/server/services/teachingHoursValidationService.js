/**
 * Teaching Hours Validation Service
 * 
 * Parses schedule strings and calculates weekly contact hours to detect
 * discrepancies between assigned schedules and expected academic requirements.
 * 
 * This service distinguishes between:
 * - Teaching units (academic credit units)
 * - Weekly contact hours (actual classroom time)
 * 
 * Expected contact hours are derived from lecturePeriods + labPeriods
 * configured in CurriculumSubject, falling back to units when periods are unconfigured.
 */

const DAY_TOKENS = ['TH', 'SU', 'M', 'T', 'W', 'F', 'S'];

/**
 * Parse a time string (12-hour AM/PM or 24-hour) into minutes from midnight (0..1439)
 * @param {string} str - Time string like "07:30", "13:00", "1:30 PM", "7:30 AM"
 * @returns {number|null} - Minutes from midnight or null if unparseable
 */
function parseTimeMinutes(str) {
  const trimmed = String(str || '').trim();
  if (!trimmed) return null;

  const ampmMatch = trimmed.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (ampmMatch) {
    let hour = parseInt(ampmMatch[1], 10);
    const min = parseInt(ampmMatch[2], 10);
    const meridiem = ampmMatch[3].toUpperCase();
    if (isNaN(hour) || isNaN(min) || min > 59) return null;
    if (meridiem === 'PM' && hour < 12) hour += 12;
    if (meridiem === 'AM' && hour === 12) hour = 0;
    return hour * 60 + min;
  }

  const match = trimmed.match(/^(\d{1,2}):(\d{2})$/);
  if (match) {
    let hour = parseInt(match[1], 10);
    const min = parseInt(match[2], 10);
    if (isNaN(hour) || isNaN(min) || min > 59) return null;
    if (hour >= 1 && hour <= 6) hour += 12; // school afternoon heuristic
    if (hour > 23) return null;
    return hour * 60 + min;
  }

  return null;
}

/**
 * Parse a schedule string into a structured representation
 * Supports formats:
 * - "MW 07:30-09:00" or "MW 7:30 AM - 9:00 AM" (classic format)
 * - "M 07:30-09:00 @ Room 205 / W 13:00-14:30 @ Lab 3" or "M 1:30 PM - 4:00 PM @ room1" (per-day format)
 * - "TBA" (no schedule)
 * 
 * @param {string} schedule - The schedule string to parse
 * @returns {Array<{day: string, start: string, end: string, room: string}>} - Array of day schedules
 */
function parseSchedule(schedule) {
  const trimmed = String(schedule || '').trim();
  
  if (!trimmed || /^TBA$/i.test(trimmed)) {
    return [];
  }

  const schedules = [];

  // Per-day format: "M 07:30-09:00 @ Room 205 / W 13:00-14:30 @ Lab 3"
  if (trimmed.includes('/')) {
    const segments = trimmed.split('/').map(s => s.trim()).filter(Boolean);
    
    for (const segment of segments) {
      // Extract optional @ room suffix
      const roomMatch = segment.match(/^(.+?)\s*@\s*(.+)$/);
      const segmentBody = roomMatch ? roomMatch[1].trim() : segment;
      const segmentRoom = roomMatch ? roomMatch[2].trim() : '';
      
      const match = segmentBody.match(/^([A-Z]+)\s+(.+?)\s*-\s*(.+)$/i);
      if (!match) continue;
      
      const daysRaw = match[1].toUpperCase();
      const start = match[2].trim();
      const end = match[3].trim();
      
      let cursor = daysRaw;
      while (cursor.length > 0) {
        const token = DAY_TOKENS.find((value) => cursor.startsWith(value));
        if (!token) break;
        schedules.push({ day: token, start, end, room: segmentRoom });
        cursor = cursor.slice(token.length);
      }
    }
    
    return schedules;
  }

  // Classic format: "MW 07:30-09:00" or "MW 7:30 AM - 9:00 AM"
  const separatorIndex = trimmed.indexOf(' ');
  if (separatorIndex < 0) {
    return [];
  }
  
  const daysRaw = trimmed.slice(0, separatorIndex).toUpperCase();
  const timeRaw = trimmed.slice(separatorIndex + 1).trim();
  const timeMatch = timeRaw.match(/^(.+?)\s*-\s*(.+)$/);
  
  if (!timeMatch) {
    return [];
  }
  
  const start = timeMatch[1].trim();
  const end = timeMatch[2].trim();
  
  let cursor = daysRaw;
  while (cursor.length > 0) {
    const token = DAY_TOKENS.find((value) => cursor.startsWith(value));
    if (!token) break;
    schedules.push({ day: token, start, end, room: '' });
    cursor = cursor.slice(token.length);
  }
  
  return schedules;
}

/**
 * Calculate the duration in hours from a time range
 * @param {string} start - Start time in HH:MM or 12-hour AM/PM format
 * @param {string} end - End time in HH:MM or 12-hour AM/PM format
 * @returns {number} - Duration in hours (can be fractional)
 */
function calculateDurationHours(start, end) {
  const startMinutes = parseTimeMinutes(start);
  const endMinutes = parseTimeMinutes(end);

  if (startMinutes === null || endMinutes === null || endMinutes <= startMinutes) {
    return 0;
  }

  return (endMinutes - startMinutes) / 60;
}

/**
 * Calculate total weekly contact hours from a schedule string
 * @param {string} schedule - The schedule string
 * @returns {number} - Total weekly contact hours
 */
function calculateWeeklyContactHours(schedule) {
  const daySchedules = parseSchedule(schedule);
  
  let totalHours = 0;
  
  for (const daySchedule of daySchedules) {
    const duration = calculateDurationHours(daySchedule.start, daySchedule.end);
    totalHours += duration;
  }
  
  return Math.round(totalHours * 10) / 10;
}

/**
 * Get expected contact hours from a subject
 * Uses lecturePeriods + labPeriods from CurriculumSubject if configured,
 * otherwise falls back to units (1 unit = 1 contact hour for standard lecture).
 * 
 * @param {Object} subject - Subject document (populated Subject or CurriculumSubject)
 * @returns {number} - Expected weekly contact hours
 */
function getExpectedContactHours(subject) {
  if (!subject) return 0;
  
  const lecturePeriods = Number(subject.lecturePeriods ?? 0);
  const labPeriods = Number(subject.labPeriods ?? 0);
  
  if (lecturePeriods > 0 || labPeriods > 0) {
    return lecturePeriods + labPeriods;
  }

  // If lecture/lab periods not explicitly configured, fall back to units if present
  if (subject.units !== undefined && subject.units !== null) {
    return Number(subject.units) || 0;
  }
  
  return 0;
}

/**
 * Validate teaching hours assignment
 * Compares scheduled contact hours against expected contact hours
 * 
 * @param {Object} options - Validation options
 * @param {string} options.schedule - The assigned schedule string
 * @param {Object} options.subject - Subject document with lecturePeriods/labPeriods
 * @param {number} options.tolerance - Optional tolerance in hours (default: 0)
 * @returns {Object} - Validation result
 */
function validateTeachingHours({ schedule, subject, tolerance = 0 }) {
  const scheduledHours = calculateWeeklyContactHours(schedule);
  const expectedHours = getExpectedContactHours(subject);
  const discrepancy = Math.round((scheduledHours - expectedHours) * 10) / 10;
  
  // Consider valid if scheduled hours are at or below expected hours (or within tolerance)
  const isValid = discrepancy <= tolerance;
  
  let message = '';
  if (expectedHours === 0) {
    message = 'Subject has no configured expected contact hours.';
  } else if (scheduledHours === 0) {
    message = 'No schedule provided (TBA).';
  } else if (discrepancy > 0) {
    message = `Scheduled hours (${scheduledHours.toFixed(1)}) exceed expected contact hours (${expectedHours.toFixed(1)}) by ${discrepancy.toFixed(1)} hours.`;
  } else if (discrepancy < 0) {
    message = `Scheduled hours (${scheduledHours.toFixed(1)}) are below expected contact hours (${expectedHours.toFixed(1)}) by ${Math.abs(discrepancy).toFixed(1)} hours.`;
  } else {
    message = `Scheduled hours (${scheduledHours.toFixed(1)}) match expected contact hours (${expectedHours.toFixed(1)}).`;
  }
  
  return {
    isValid,
    scheduledHours,
    expectedHours,
    discrepancy,
    message
  };
}

/**
 * Check if a teaching hours discrepancy should trigger a warning
 * Triggers when scheduled hours exceed expected hours
 * 
 * @param {Object} validation - Result from validateTeachingHours
 * @returns {boolean} - Whether to show a warning
 */
function shouldTriggerWarning(validation) {
  return validation.discrepancy > 0 && validation.expectedHours > 0;
}

module.exports = {
  parseTimeMinutes,
  parseSchedule,
  calculateDurationHours,
  calculateWeeklyContactHours,
  getExpectedContactHours,
  validateTeachingHours,
  shouldTriggerWarning
};
