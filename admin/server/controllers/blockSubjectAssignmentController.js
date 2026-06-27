const mongoose = require('mongoose');
const BlockSubjectAssignment = require('../models/BlockSubjectAssignment');
const BlockSection = require('../models/BlockSection');
const Subject = require('../models/Subject');

const assignmentPopulate = [
  { path: 'subjectId', select: '_id code title units course yearLevel semester isActive' },
  { path: 'blockSectionId', select: '_id sectionCode blockGroupId capacity currentPopulation status' },
  { path: 'assignedBy', select: '_id username displayName' }
];

const normalizeAssignment = (assignment) => ({
  _id: String(assignment._id),
  blockSection: assignment.blockSectionId,
  subject: assignment.subjectId,
  semester: assignment.semester,
  academicYear: assignment.academicYear,
  assignedBy: assignment.assignedBy,
  assignedAt: assignment.assignedAt,
  createdAt: assignment.createdAt,
  updatedAt: assignment.updatedAt
});

class BlockSubjectAssignmentController {
  static async getAssignments(req, res) {
    try {
      const { blockSectionId, semester, academicYear, subjectId } = req.query;
      const query = {};

      if (blockSectionId) query.blockSectionId = blockSectionId;
      if (subjectId) query.subjectId = subjectId;
      if (semester) query.semester = semester;
      if (academicYear) query.academicYear = academicYear;

      const assignments = await BlockSubjectAssignment.find(query)
        .populate(assignmentPopulate)
        .sort({ academicYear: -1, semester: 1, createdAt: -1 });

      res.json({
        success: true,
        data: assignments.map(normalizeAssignment)
      });
    } catch (error) {
      console.error('Error fetching block subject assignments:', error);
      res.status(500).json({ success: false, message: 'Failed to fetch subject assignments' });
    }
  }

  static async assignSubjects(req, res) {
    try {
      const { blockSectionId, subjectIds, semester, academicYear } = req.body;
      const normalizedSubjectIds = Array.from(new Set(subjectIds.map(String)));

      const section = await BlockSection.findById(blockSectionId).select('_id');
      if (!section) {
        return res.status(404).json({ success: false, message: 'Block section not found' });
      }

      const subjects = await Subject.find({
        _id: { $in: normalizedSubjectIds.map((id) => new mongoose.Types.ObjectId(id)) },
        isActive: true
      }).select('_id');

      if (subjects.length !== normalizedSubjectIds.length) {
        return res.status(400).json({ success: false, message: 'One or more selected subjects were not found' });
      }

      const docs = normalizedSubjectIds.map((subjectId) => ({
        blockSectionId,
        subjectId,
        semester,
        academicYear,
        assignedBy: req.adminId,
        assignedAt: new Date()
      }));

      await BlockSubjectAssignment.insertMany(docs, { ordered: false }).catch((error) => {
        if (error?.code !== 11000 && error?.writeErrors?.some((entry) => entry.code !== 11000)) {
          throw error;
        }
      });

      const assignments = await BlockSubjectAssignment.find({
        blockSectionId,
        semester,
        academicYear
      })
        .populate(assignmentPopulate)
        .sort({ createdAt: -1 });

      res.status(201).json({
        success: true,
        data: assignments.map(normalizeAssignment),
        message: 'Selected subjects assigned successfully'
      });
    } catch (error) {
      console.error('Error assigning subjects to block section:', error);
      res.status(500).json({ success: false, message: error.message || 'Failed to assign subjects' });
    }
  }

  static async deleteAssignment(req, res) {
    try {
      const assignment = await BlockSubjectAssignment.findByIdAndDelete(req.params.id);
      if (!assignment) {
        return res.status(404).json({ success: false, message: 'Subject assignment not found' });
      }

      res.json({
        success: true,
        data: { _id: String(assignment._id) },
        message: 'Subject assignment removed successfully'
      });
    } catch (error) {
      console.error('Error removing block subject assignment:', error);
      res.status(500).json({ success: false, message: 'Failed to remove subject assignment' });
    }
  }
}

module.exports = BlockSubjectAssignmentController;
