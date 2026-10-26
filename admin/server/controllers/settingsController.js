const SystemSetting = require('../models/SystemSetting');
const gradingScaleService = require('../services/gradingScaleService');

const ACADEMIC_TERM_KEY = 'academicTerm';
const VALID_SEMESTERS = ['1st', '2nd', 'Summer'];
const DEFAULT_SEMESTER = '1st';

function getDefaultSchoolYear() {
  const year = new Date().getFullYear();
  return `${year}-${year + 1}`;
}

class SettingsController {
  // GET /api/settings/academic-term
  async getAcademicTerm(req, res) {
    try {
      const setting = await SystemSetting.findOne({ key: ACADEMIC_TERM_KEY }).lean();
      const value = setting?.value || {};

      res.json({
        schoolYear: value.schoolYear || getDefaultSchoolYear(),
        semester: VALID_SEMESTERS.includes(value.semester) ? value.semester : DEFAULT_SEMESTER
      });
    } catch (error) {
      console.error('Get academic term error:', error);
      res.status(500).json({ error: 'Failed to get academic term setting' });
    }
  }

  // PUT /api/settings/academic-term
  async updateAcademicTerm(req, res) {
    try {
      const { schoolYear, semester } = req.body;

      if (!schoolYear || !/^\d{4}-\d{4}$/.test(String(schoolYear).trim())) {
        return res.status(400).json({ error: 'schoolYear must be in YYYY-YYYY format' });
      }
      if (!VALID_SEMESTERS.includes(semester)) {
        return res.status(400).json({ error: `semester must be one of: ${VALID_SEMESTERS.join(', ')}` });
      }

      const updated = await SystemSetting.findOneAndUpdate(
        { key: ACADEMIC_TERM_KEY },
        { $set: { value: { schoolYear: String(schoolYear).trim(), semester } } },
        { upsert: true, new: true }
      ).lean();

      res.json({
        schoolYear: updated.value.schoolYear,
        semester: updated.value.semester
      });
    } catch (error) {
      console.error('Update academic term error:', error);
      res.status(500).json({ error: 'Failed to update academic term setting' });
    }
  }

  // GET /api/settings/grade-scale
  async getGradeScale(req, res) {
    try {
      const scale = await gradingScaleService.loadGradeScale();
      res.json({
        ...scale,
        allowedGrades: gradingScaleService.listAllowedGrades(scale),
        description: gradingScaleService.describeScale(scale)
      });
    } catch (error) {
      console.error('Get grade scale error:', error);
      res.status(500).json({ error: 'Failed to get grade scale setting' });
    }
  }

  // PUT /api/settings/grade-scale
  async updateGradeScale(req, res) {
    try {
      const { min, max, step, passingGrade } = req.body || {};
      const result = await gradingScaleService.saveGradeScale({ min, max, step, passingGrade }, req.adminId);
      if (result.error) {
        return res.status(400).json({ error: result.error });
      }

      res.json({
        ...result.scale,
        allowedGrades: gradingScaleService.listAllowedGrades(result.scale),
        description: gradingScaleService.describeScale(result.scale)
      });
    } catch (error) {
      console.error('Update grade scale error:', error);
      res.status(500).json({ error: 'Failed to update grade scale setting' });
    }
  }
}

module.exports = new SettingsController();
