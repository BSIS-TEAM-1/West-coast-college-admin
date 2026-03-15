const crypto = require('crypto');
const mongoose = require('mongoose');
const Counter = require('../models/Counter');

const STUDENT_NUMBER_SPACE = 100000;
const MAX_STUDENT_SEQUENCE = STUDENT_NUMBER_SPACE - 1;

function gcd(left, right) {
  let a = Math.abs(Number(left) || 0);
  let b = Math.abs(Number(right) || 0);

  while (b !== 0) {
    const remainder = a % b;
    a = b;
    b = remainder;
  }

  return a;
}

class StudentNumberService {
  static permutationCache = new Map();

  static getGenerationMeta(courseNumber, schoolYear) {
    const numericCourse = Number(courseNumber);
    const startYear = String(schoolYear || '').trim().split('-')[0];
    if (!numericCourse || !/^\d{4}$/.test(startYear)) {
      throw new Error('Valid course and school year are required to generate a student number');
    }

    const courseCode = String(numericCourse);
    return {
      courseCode,
      startYear,
      counterId: `student_${courseCode}_${startYear}`
    };
  }

  static getPermutationCoefficients(courseNumber, schoolYear) {
    const { courseCode, startYear } = StudentNumberService.getGenerationMeta(courseNumber, schoolYear);
    const scopeKey = `${courseCode}:${startYear}`;
    const cached = StudentNumberService.permutationCache.get(scopeKey);
    if (cached) return cached;

    const seedMaterial = `${process.env.STUDENT_NUMBER_SEED || process.env.JWT_SECRET || 'wcc-student-number-seed'}:${scopeKey}`;
    const digest = crypto.createHash('sha256').update(seedMaterial).digest();

    let multiplier = digest.readUInt32BE(0) % STUDENT_NUMBER_SPACE;
    if (multiplier === 0) multiplier = 1;
    while (gcd(multiplier, STUDENT_NUMBER_SPACE) !== 1) {
      multiplier = (multiplier + 1) % STUDENT_NUMBER_SPACE || 1;
    }

    const offset = digest.readUInt32BE(4) % STUDENT_NUMBER_SPACE;
    const coefficients = { multiplier, offset };
    StudentNumberService.permutationCache.set(scopeKey, coefficients);
    return coefficients;
  }

  static encodeSequence(courseNumber, schoolYear, sequence) {
    const normalizedSequence = Number(sequence);
    if (!Number.isInteger(normalizedSequence) || normalizedSequence < 1) {
      throw new Error('A valid sequence number is required to build a student number');
    }
    if (normalizedSequence > MAX_STUDENT_SEQUENCE) {
      throw new Error('Student number capacity exceeded for this course and school year');
    }

    const { multiplier, offset } = StudentNumberService.getPermutationCoefficients(courseNumber, schoolYear);
    const permutedValue = (((normalizedSequence - 1) * multiplier) + offset) % STUDENT_NUMBER_SPACE;
    return String(permutedValue).padStart(5, '0');
  }

  static formatStudentNumber(courseNumber, schoolYear, sequence) {
    const { courseCode, startYear } = StudentNumberService.getGenerationMeta(courseNumber, schoolYear);
    return `${startYear}-${courseCode}-${StudentNumberService.encodeSequence(courseNumber, schoolYear, sequence)}`;
  }

  static async studentNumberExists(studentNumber) {
    const Student = mongoose.models.Student || mongoose.model('Student');
    return Boolean(await Student.exists({ studentNumber }));
  }

  /**
   * Generate a unique student number
   * @param {number} courseNumber - Course number (e.g., 101, 102)
   * @param {string} schoolYear - School year in format 'YYYY-YYYY'
   * @returns {Promise<string>} Generated student number
   */
  static async generateStudentNumber(courseNumber, schoolYear) {
    try {
      const { counterId } = StudentNumberService.getGenerationMeta(courseNumber, schoolYear);

      while (true) {
        const sequence = await Counter.getNextSequence(counterId);
        const studentNumber = StudentNumberService.formatStudentNumber(courseNumber, schoolYear, sequence);
        if (!(await StudentNumberService.studentNumberExists(studentNumber))) {
          return studentNumber;
        }
      }
    } catch (error) {
      console.error('Error generating student number:', error);
      throw new Error('Failed to generate student number');
    }
  }

  /**
   * Preview the next available student number for a course and school year
   * @param {number} courseNumber - Course number
   * @param {string} schoolYear - School year in format 'YYYY-YYYY'
   * @returns {Promise<string>} Preview student number
   */
  static async previewStudentNumber(courseNumber, schoolYear) {
    const { counterId } = StudentNumberService.getGenerationMeta(courseNumber, schoolYear);
    let sequence = await Counter.getCurrentSequence(counterId);

    while (true) {
      sequence += 1;
      const studentNumber = StudentNumberService.formatStudentNumber(courseNumber, schoolYear, sequence);
      if (!(await StudentNumberService.studentNumberExists(studentNumber))) {
        return studentNumber;
      }
    }
  }
}

module.exports = StudentNumberService;
