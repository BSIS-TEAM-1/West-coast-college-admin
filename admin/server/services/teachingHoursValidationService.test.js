/**
 * Teaching Hours Validation Service Tests
 */

const {
  parseSchedule,
  calculateDurationHours,
  calculateWeeklyContactHours,
  getExpectedContactHours,
  validateTeachingHours,
  shouldTriggerWarning
} = require('./teachingHoursValidationService');

describe('Teaching Hours Validation Service', () => {
  describe('parseSchedule', () => {
    test('should parse TBA as empty array', () => {
      expect(parseSchedule('TBA')).toEqual([]);
      expect(parseSchedule('tba')).toEqual([]);
      expect(parseSchedule('')).toEqual([]);
      expect(parseSchedule(null)).toEqual([]);
    });

    test('should parse classic format MW 07:30-09:00', () => {
      const result = parseSchedule('MW 07:30-09:00');
      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({ day: 'M', start: '07:30', end: '09:00', room: '' });
      expect(result[1]).toEqual({ day: 'W', start: '07:30', end: '09:00', room: '' });
    });

    test('should parse classic format TTH 13:00-14:30', () => {
      const result = parseSchedule('TTH 13:00-14:30');
      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({ day: 'T', start: '13:00', end: '14:30', room: '' });
      expect(result[1]).toEqual({ day: 'TH', start: '13:00', end: '14:30', room: '' });
    });

    test('should parse per-day format with rooms', () => {
      const result = parseSchedule('M 07:30-09:00 @ Room 205 / W 13:00-14:30 @ Lab 3');
      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({ day: 'M', start: '07:30', end: '09:00', room: 'Room 205' });
      expect(result[1]).toEqual({ day: 'W', start: '13:00', end: '14:30', room: 'Lab 3' });
    });

    test('should parse single day format', () => {
      const result = parseSchedule('F 08:00-10:00');
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({ day: 'F', start: '08:00', end: '10:00', room: '' });
    });

    test('should parse five-day format', () => {
      const result = parseSchedule('MTWTHF 08:00-09:00');
      expect(result).toHaveLength(5);
      expect(result.map(r => r.day)).toEqual(['M', 'T', 'W', 'TH', 'F']);
    });
  });

  describe('calculateDurationHours', () => {
    test('should calculate 1.5 hours for 07:30-09:00', () => {
      expect(calculateDurationHours('07:30', '09:00')).toBe(1.5);
    });

    test('should calculate 1 hour for 13:00-14:00', () => {
      expect(calculateDurationHours('13:00', '14:00')).toBe(1);
    });

    test('should calculate 3 hours for 08:00-11:00', () => {
      expect(calculateDurationHours('08:00', '11:00')).toBe(3);
    });

    test('should return 0 for invalid duration', () => {
      expect(calculateDurationHours('09:00', '07:30')).toBe(0);
      expect(calculateDurationHours('09:00', '09:00')).toBe(0);
    });
  });

  describe('calculateWeeklyContactHours', () => {
    test('should return 0 for TBA', () => {
      expect(calculateWeeklyContactHours('TBA')).toBe(0);
    });

    test('should calculate 3 hours for MW 07:30-09:00', () => {
      expect(calculateWeeklyContactHours('MW 07:30-09:00')).toBe(3);
    });

    test('should calculate 3 hours for TTH 07:30-09:00', () => {
      expect(calculateWeeklyContactHours('TTH 07:30-09:00')).toBe(3);
    });

    test('should calculate 5 hours for MWF 08:00-09:40', () => {
      expect(calculateWeeklyContactHours('MWF 08:00-09:40')).toBe(5);
    });

    test('should calculate 6 hours for MW 07:30-10:30', () => {
      expect(calculateWeeklyContactHours('MW 07:30-10:30')).toBe(6);
    });

    test('should calculate per-day format correctly', () => {
      const hours = calculateWeeklyContactHours('M 07:30-09:00 @ Room 205 / W 13:00-14:30 @ Lab 3');
      expect(hours).toBe(3); // 1.5 + 1.5
    });
  });

  describe('getExpectedContactHours', () => {
    test('should return 0 for null subject', () => {
      expect(getExpectedContactHours(null)).toBe(0);
    });

    test('should sum lecturePeriods and labPeriods', () => {
      const subject = { lecturePeriods: 3, labPeriods: 0 };
      expect(getExpectedContactHours(subject)).toBe(3);
    });

    test('should handle lab-only subjects', () => {
      const subject = { lecturePeriods: 0, labPeriods: 6 };
      expect(getExpectedContactHours(subject)).toBe(6);
    });

    test('should handle combined lecture+lab subjects', () => {
      const subject = { lecturePeriods: 2, labPeriods: 3 };
      expect(getExpectedContactHours(subject)).toBe(5);
    });

    test('should handle missing fields as 0', () => {
      const subject = {};
      expect(getExpectedContactHours(subject)).toBe(0);
    });
  });

  describe('validateTeachingHours', () => {
    test('should validate matching hours', () => {
      const subject = { lecturePeriods: 3, labPeriods: 0 };
      const result = validateTeachingHours({
        schedule: 'MW 07:30-09:00',
        subject
      });
      
      expect(result.isValid).toBe(true);
      expect(result.scheduledHours).toBe(3);
      expect(result.expectedHours).toBe(3);
      expect(result.discrepancy).toBe(0);
      expect(result.message).toContain('match');
    });

    test('should detect excess hours (acceptance criterion)', () => {
      const subject = { lecturePeriods: 3, labPeriods: 0 };
      const result = validateTeachingHours({
        schedule: 'MW 07:30-10:30', // 6 hours
        subject
      });
      
      expect(result.isValid).toBe(false);
      expect(result.scheduledHours).toBe(6);
      expect(result.expectedHours).toBe(3);
      expect(result.discrepancy).toBe(3);
      expect(result.message).toContain('exceed');
    });

    test('should detect under-scheduled hours (not invalid, but recorded)', () => {
      const subject = { lecturePeriods: 3, labPeriods: 0 };
      const result = validateTeachingHours({
        schedule: 'MW 08:00-09:00', // 2 hours
        subject
      });
      
      // Under-scheduling is not invalid (registrar may have legitimate reasons)
      // Only excess hours trigger warnings
      expect(result.isValid).toBe(true);
      expect(result.scheduledHours).toBe(2);
      expect(result.expectedHours).toBe(3);
      expect(result.discrepancy).toBe(-1);
      expect(result.message).toContain('below');
    });

    test('should handle TBA schedule', () => {
      const subject = { lecturePeriods: 3, labPeriods: 0 };
      const result = validateTeachingHours({
        schedule: 'TBA',
        subject
      });
      
      expect(result.scheduledHours).toBe(0);
      expect(result.expectedHours).toBe(3);
      expect(result.discrepancy).toBe(-3);
      expect(result.message).toContain('No schedule');
    });

    test('should handle subject with no expected hours', () => {
      const subject = { lecturePeriods: 0, labPeriods: 0 };
      const result = validateTeachingHours({
        schedule: 'MW 07:30-09:00',
        subject
      });
      
      expect(result.scheduledHours).toBe(3);
      expect(result.expectedHours).toBe(0);
      expect(result.discrepancy).toBe(3);
      expect(result.message).toContain('no configured expected contact hours');
    });

    test('should support tolerance parameter', () => {
      const subject = { lecturePeriods: 3, labPeriods: 0 };
      const result = validateTeachingHours({
        schedule: 'MW 07:30-09:30', // 4 hours (1 hour over)
        subject,
        tolerance: 1 // Allow 1 hour tolerance
      });
      
      expect(result.isValid).toBe(true);
      expect(result.discrepancy).toBe(1);
    });

    test('should fail when discrepancy exceeds tolerance', () => {
      const subject = { lecturePeriods: 3, labPeriods: 0 };
      const result = validateTeachingHours({
        schedule: 'MW 07:30-10:30', // 6 hours (3 hours over)
        subject,
        tolerance: 1 // Allow 1 hour tolerance
      });
      
      expect(result.isValid).toBe(false);
      expect(result.discrepancy).toBe(3);
    });
  });

  describe('shouldTriggerWarning', () => {
    test('should trigger warning when scheduled exceeds expected', () => {
      const validation = {
        discrepancy: 2,
        expectedHours: 3
      };
      expect(shouldTriggerWarning(validation)).toBe(true);
    });

    test('should not trigger warning when hours match', () => {
      const validation = {
        discrepancy: 0,
        expectedHours: 3
      };
      expect(shouldTriggerWarning(validation)).toBe(false);
    });

    test('should not trigger warning when under-scheduled', () => {
      const validation = {
        discrepancy: -1,
        expectedHours: 3
      };
      expect(shouldTriggerWarning(validation)).toBe(false);
    });

    test('should not trigger warning when expected hours is 0', () => {
      const validation = {
        discrepancy: 5,
        expectedHours: 0
      };
      expect(shouldTriggerWarning(validation)).toBe(false);
    });

    test('should validate 12-hour AM/PM format schedule against expected contact hours', () => {
      const subject = { lecturePeriods: 3, labPeriods: 0, units: 3 };
      const matching = validateTeachingHours({
        schedule: 'MW 7:30 AM - 9:00 AM', // 1.5 + 1.5 = 3 hours
        subject
      });
      expect(matching.isValid).toBe(true);
      expect(matching.scheduledHours).toBe(3);
      expect(matching.expectedHours).toBe(3);
      expect(shouldTriggerWarning(matching)).toBe(false);

      const excess = validateTeachingHours({
        schedule: 'MW 7:30 AM - 10:30 AM', // 3.0 + 3.0 = 6 hours
        subject
      });
      expect(excess.isValid).toBe(false);
      expect(excess.scheduledHours).toBe(6);
      expect(excess.expectedHours).toBe(3);
      expect(excess.discrepancy).toBe(3);
      expect(shouldTriggerWarning(excess)).toBe(true);
    });

    test('should fallback to units when lecturePeriods and labPeriods are not configured', () => {
      const subject = { units: 3 };
      const result = validateTeachingHours({
        schedule: 'MW 7:30 AM - 10:30 AM', // 6 hours
        subject
      });
      expect(result.expectedHours).toBe(3);
      expect(result.scheduledHours).toBe(6);
      expect(shouldTriggerWarning(result)).toBe(true);
    });
  });
});
