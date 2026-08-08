const SystemSetting = require('../models/SystemSetting');

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
}

module.exports = new SettingsController();
