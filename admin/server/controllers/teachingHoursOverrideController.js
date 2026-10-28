const mongoose = require('mongoose');
const TeachingHoursOverride = require('../models/TeachingHoursOverride');
const Admin = require('../models/Admin');
const Subject = require('../models/Subject');
const BlockSection = require('../models/BlockSection');
const { validateTeachingHours } = require('../services/teachingHoursValidationService');

class TeachingHoursOverrideController {
  /**
   * Record a teaching hours override with justification
   * Only authorized users can call this endpoint
   */
  static async recordOverride(req, res) {
    try {
      const {
        professorId,
        professorName,
        subjectId,
        subjectCode,
        subjectTitle,
        sectionId,
        sectionCode,
        semester,
        schoolYear,
        schedule,
        room,
        justification
      } = req.body;

      // Validate required fields
      if (!mongoose.Types.ObjectId.isValid(professorId)) {
        return res.status(400).json({
          success: false,
          message: 'Valid professor ID is required'
        });
      }

      if (!mongoose.Types.ObjectId.isValid(subjectId)) {
        return res.status(400).json({
          success: false,
          message: 'Valid subject ID is required'
        });
      }

      if (!mongoose.Types.ObjectId.isValid(sectionId)) {
        return res.status(400).json({
          success: false,
          message: 'Valid section ID is required'
        });
      }

      if (!justification || justification.trim().length < 10) {
        return res.status(400).json({
          success: false,
          message: 'Justification is required and must be at least 10 characters'
        });
      }

      // Verify professor exists
      const professor = await Admin.findById(professorId).select('_id username displayName');
      if (!professor) {
        return res.status(404).json({
          success: false,
          message: 'Professor not found'
        });
      }

      // Verify subject exists and get configuration
      const subject = await Subject.findById(subjectId).select('_id code title units lecturePeriods labPeriods');
      if (!subject) {
        return res.status(404).json({
          success: false,
          message: 'Subject not found'
        });
      }

      // Verify section exists
      const section = await BlockSection.findById(sectionId).select('_id sectionCode');
      if (!section) {
        return res.status(404).json({
          success: false,
          message: 'Section not found'
        });
      }

      // Re-validate teaching hours to ensure accuracy
      const validation = validateTeachingHours({
        schedule: schedule || '',
        subject: subject
      });

      // Only allow override if there's actually a discrepancy
      if (validation.discrepancy <= 0) {
        return res.status(400).json({
          success: false,
          message: 'No teaching hours discrepancy detected. Override not required.'
        });
      }

      // Get authorized user details
      const authorizedUser = await Admin.findById(req.adminId).select('_id username displayName');
      if (!authorizedUser) {
        return res.status(404).json({
          success: false,
          message: 'Authorized user not found'
        });
      }

      // Create override record
      const override = await TeachingHoursOverride.create({
        professorId,
        professorName: professorName || professor.displayName || professor.username,
        subjectId,
        subjectCode: subjectCode || subject.code,
        subjectTitle: subjectTitle || subject.title,
        sectionId,
        sectionCode: sectionCode || section.sectionCode,
        semester,
        schoolYear,
        expectedContactHours: validation.expectedHours,
        assignedContactHours: validation.scheduledHours,
        discrepancy: validation.discrepancy,
        schedule: schedule || 'TBA',
        room: room || 'TBA',
        units: subject.units,
        lecturePeriods: subject.lecturePeriods,
        labPeriods: subject.labPeriods,
        authorizedBy: req.adminId,
        authorizedByName: authorizedUser.displayName || authorizedUser.username,
        justification: justification.trim()
      });

      res.status(201).json({
        success: true,
        message: 'Teaching hours override recorded successfully',
        data: {
          overrideId: String(override._id),
          professorName: override.professorName,
          subjectCode: override.subjectCode,
          expectedContactHours: override.expectedContactHours,
          assignedContactHours: override.assignedContactHours,
          discrepancy: override.discrepancy,
          authorizedBy: override.authorizedByName,
          createdAt: override.createdAt
        }
      });
    } catch (error) {
      console.error('Error recording teaching hours override:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to record teaching hours override'
      });
    }
  }

  /**
   * Get teaching hours overrides for a professor
   */
  static async getProfessorOverrides(req, res) {
    try {
      const { professorId } = req.params;
      const { semester, schoolYear } = req.query;

      if (!mongoose.Types.ObjectId.isValid(professorId)) {
        return res.status(400).json({
          success: false,
          message: 'Valid professor ID is required'
        });
      }

      const query = { professorId };
      if (semester) query.semester = semester;
      if (schoolYear) query.schoolYear = schoolYear;

      const overrides = await TeachingHoursOverride.find(query)
        .sort({ createdAt: -1 })
        .lean();

      res.json({
        success: true,
        data: overrides.map(override => ({
          id: String(override._id),
          subjectCode: override.subjectCode,
          subjectTitle: override.subjectTitle,
          sectionCode: override.sectionCode,
          semester: override.semester,
          schoolYear: override.schoolYear,
          expectedContactHours: override.expectedContactHours,
          assignedContactHours: override.assignedContactHours,
          discrepancy: override.discrepancy,
          schedule: override.schedule,
          room: override.room,
          justification: override.justification,
          authorizedBy: override.authorizedByName,
          createdAt: override.createdAt
        }))
      });
    } catch (error) {
      console.error('Error fetching teaching hours overrides:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to fetch teaching hours overrides'
      });
    }
  }

  /**
   * Get all teaching hours overrides (admin view)
   */
  static async getAllOverrides(req, res) {
    try {
      const { semester, schoolYear, limit = 50 } = req.query;

      const query = {};
      if (semester) query.semester = semester;
      if (schoolYear) query.schoolYear = schoolYear;

      const overrides = await TeachingHoursOverride.find(query)
        .sort({ createdAt: -1 })
        .limit(Number(limit))
        .lean();

      res.json({
        success: true,
        data: overrides.map(override => ({
          id: String(override._id),
          professorName: override.professorName,
          subjectCode: override.subjectCode,
          subjectTitle: override.subjectTitle,
          sectionCode: override.sectionCode,
          semester: override.semester,
          schoolYear: override.schoolYear,
          expectedContactHours: override.expectedContactHours,
          assignedContactHours: override.assignedContactHours,
          discrepancy: override.discrepancy,
          schedule: override.schedule,
          room: override.room,
          justification: override.justification,
          authorizedBy: override.authorizedByName,
          createdAt: override.createdAt
        }))
      });
    } catch (error) {
      console.error('Error fetching all teaching hours overrides:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to fetch teaching hours overrides'
      });
    }
  }
}

module.exports = TeachingHoursOverrideController;
