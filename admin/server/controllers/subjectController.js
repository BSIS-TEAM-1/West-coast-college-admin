const Subject = require('../models/Subject');

class SubjectController {
  static async getSubjects(req, res) {
    try {
      const query = { isActive: true };
      const { course, yearLevel, semester, q } = req.query;

      if (course) query.course = Number(course);
      if (yearLevel) query.yearLevel = Number(yearLevel);
      if (semester) query.semester = semester;
      if (q) {
        query.$or = [
          { code: { $regex: String(q).trim(), $options: 'i' } },
          { title: { $regex: String(q).trim(), $options: 'i' } }
        ];
      }

      const subjects = await Subject.find(query).sort({ code: 1 });
      res.json({ success: true, data: subjects });
    } catch (error) {
      console.error('Error fetching subjects:', error);
      res.status(500).json({ success: false, message: 'Failed to fetch subjects' });
    }
  }

  static async createSubject(req, res) {
    try {
      const { code, title, units, course, yearLevel, semester } = req.body;

      if (!code || !title || !units) {
        return res.status(400).json({
          success: false,
          message: 'Code, title, and units are required'
        });
      }

      const normalizedCode = String(code).trim().toUpperCase();
      const existing = await Subject.findOne({ code: normalizedCode });
      if (existing) {
        return res.status(409).json({
          success: false,
          message: 'Subject code already exists'
        });
      }

      const subject = await Subject.create({
        code: normalizedCode,
        title: String(title).trim(),
        units: Number(units),
        course: course ? Number(course) : undefined,
        yearLevel: yearLevel ? Number(yearLevel) : undefined,
        semester: semester || undefined,
        createdBy: req.adminId
      });

      res.status(201).json({
        success: true,
        data: subject,
        message: 'Subject created successfully'
      });
    } catch (error) {
      console.error('Error creating subject:', error);
      res.status(500).json({ success: false, message: error.message || 'Failed to create subject' });
    }
  }

  static async updateSubject(req, res) {
    try {
      const { id } = req.params;
      const { code, title, units, course, yearLevel, semester, isActive } = req.body;

      const subject = await Subject.findById(id);
      if (!subject) {
        return res.status(404).json({ success: false, message: 'Subject not found' });
      }

      if (code) {
        const normalizedCode = String(code).trim().toUpperCase();
        const duplicate = await Subject.findOne({ code: normalizedCode, _id: { $ne: id } });
        if (duplicate) {
          return res.status(409).json({ success: false, message: 'Subject code already exists' });
        }
        subject.code = normalizedCode;
      }

      if (title !== undefined) subject.title = String(title).trim();
      if (units !== undefined) subject.units = Number(units);
      if (course !== undefined) subject.course = course ? Number(course) : undefined;
      if (yearLevel !== undefined) subject.yearLevel = yearLevel ? Number(yearLevel) : undefined;
      if (semester !== undefined) subject.semester = semester || undefined;
      if (isActive !== undefined) subject.isActive = Boolean(isActive);
      subject.updatedBy = req.adminId;

      await subject.save();
      res.json({ success: true, data: subject, message: 'Subject updated successfully' });
    } catch (error) {
      console.error('Error updating subject:', error);
      res.status(500).json({ success: false, message: error.message || 'Failed to update subject' });
    }
  }

  static async deleteSubject(req, res) {
    try {
      const { id } = req.params;
      const subject = await Subject.findByIdAndDelete(id);
      if (!subject) {
        return res.status(404).json({ success: false, message: 'Subject not found' });
      }
      res.json({ success: true, data: subject, message: 'Subject deleted successfully' });
    } catch (error) {
      console.error('Error deleting subject:', error);
      res.status(500).json({ success: false, message: error.message || 'Failed to delete subject' });
    }
  }
}

module.exports = SubjectController;
