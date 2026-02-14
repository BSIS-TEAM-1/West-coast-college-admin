const mongoose = require('mongoose');
const Counter = require('../models/Counter');

class StudentNumberService {
  /**
   * Generate a unique student number
   * @param {number} courseNumber - Course number (e.g., 101, 102)
   * @param {string} schoolYear - School year in format 'YYYY-YYYY'
   * @returns {Promise<string>} Generated student number
   */
  static async generateStudentNumber(courseNumber, schoolYear) {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      // Extract the starting year (first 4 digits) from schoolYear
      const startYear = schoolYear.split('-')[0];
      
      // Convert course number to course code
      const courseCodes = {
        101: 'BEED',
        102: 'BSEd-English',
        103: 'BSEd-Math',
        201: 'BSBA-HRM'
      };
      const courseCode = (courseCodes[courseNumber] || `COURSE${courseNumber}`).toUpperCase();
      
      // Create a unique counter ID for this course and school year
      const counterId = `student_${courseCode}_${startYear}`;
      
      // Find and update the counter in a transaction to ensure atomicity
      const counter = await Counter.findByIdAndUpdate(
        counterId,
        { $inc: { sequence: 1 } },
        { new: true, upsert: true, session }
      );

      // Format the sequence number with leading zeros (now random)
      const sequence = String(Math.floor(10000 + Math.random() * 90000)).padStart(5, '0');
      
      // Commit the transaction
      await session.commitTransaction();
      session.endSession();

      // Return the formatted student number
      return `${startYear}-${courseCode}-${sequence}`;
    } catch (error) {
      // If anything goes wrong, abort the transaction
      await session.abortTransaction();
      session.endSession();
      console.error('Error generating student number:', error);
      throw new Error('Failed to generate student number');
    }
  }

  /**
   * Get the next sequence number for a course and school year
   * @param {string} courseCode - Course code
   * @param {string} schoolYear - School year in format 'YYYY-YYYY'
   * @returns {Promise<number>} Next sequence number
   */
  static async getNextSequence(courseCode, schoolYear) {
    const startYear = schoolYear.split('-')[0];
    const counterId = `student_${courseCode}_${startYear}`;
    
    const counter = await Counter.findById(counterId);
    return counter ? counter.seq + 1 : 1;
  }
}

module.exports = StudentNumberService;
