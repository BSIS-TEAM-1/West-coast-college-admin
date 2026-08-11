const mongoose = require('mongoose');
const Curriculum = require('../models/Curriculum');
const CurriculumSubject = require('../models/CurriculumSubject');
const Enrollment = require('../models/Enrollment');
const Subject = require('../models/Subject');

const PROGRAM_NAMES = {
  101: 'BEED',
  102: 'BSED',
  103: 'BSED',
  201: 'BSBA',
};

const VALID_SEMESTERS = ['1st', '2nd', 'Summer'];
const VALID_SUBJECT_TYPES = ['General', 'Major', 'Professional', 'Elective'];

/**
 * Validate a bulk list of subject placements supplied at curriculum-creation
 * time. Each entry: { subjectId, yearLevel, semester, type?, isRequired?,
 * prerequisiteSubjectIds?, displayOrder? }. Resolves the referenced Subject
 * docs in one query so we can copy snapshot fields (courseNo/descriptiveTitle/
 * units/lecturePeriods/labPeriods) at creation time — same pattern as
 * CurriculumSubjectController.addSubject.
 *
 * Returns { valid, message, placements } where each placement carries the
 * resolved subject doc and normalized placement fields.
 */
async function validatePlacements(rawSubjects) {
  if (!Array.isArray(rawSubjects) || rawSubjects.length === 0) {
    return { valid: true, message: '', placements: [] };
  }

  const seenSubjectIds = new Set();
  const placements = [];

  for (let i = 0; i < rawSubjects.length; i++) {
    const entry = rawSubjects[i];
    const subjectId = entry && entry.subjectId ? String(entry.subjectId) : null;
    if (!subjectId) {
      return { valid: false, message: `Subject placement at index ${i} is missing subjectId`, placements: [] };
    }
    if (seenSubjectIds.has(subjectId)) {
      return { valid: false, message: `Subject ${subjectId} is placed more than once in the curriculum (a subject can only be placed once per curriculum)`, placements: [] };
    }
    seenSubjectIds.add(subjectId);

    const yearLevel = Number(entry.yearLevel);
    if (!Number.isFinite(yearLevel) || yearLevel < 1 || yearLevel > 6) {
      return { valid: false, message: `Subject ${subjectId} has invalid yearLevel (must be 1-6)`, placements: [] };
    }

    const semester = entry.semester;
    if (!VALID_SEMESTERS.includes(semester)) {
      return { valid: false, message: `Subject ${subjectId} has invalid semester (must be one of ${VALID_SEMESTERS.join(', ')})`, placements: [] };
    }

    const type = entry.type || 'General';
    if (!VALID_SUBJECT_TYPES.includes(type)) {
      return { valid: false, message: `Subject ${subjectId} has invalid type "${type}"`, placements: [] };
    }

    const prereqRaw = Array.isArray(entry.prerequisiteSubjectIds) ? entry.prerequisiteSubjectIds : [];
    const prereqIds = prereqRaw.map(String);
    if (prereqIds.includes(subjectId)) {
      return { valid: false, message: `Subject ${subjectId} cannot be a prerequisite of itself`, placements: [] };
    }
    if (new Set(prereqIds).size !== prereqIds.length) {
      return { valid: false, message: `Subject ${subjectId} has duplicate prerequisite subject ids`, placements: [] };
    }

    placements.push({
      subjectId,
      yearLevel,
      semester,
      type,
      isRequired: entry.isRequired !== undefined ? Boolean(entry.isRequired) : true,
      prerequisiteSubjectIds: prereqIds,
      displayOrder: Number(entry.displayOrder) || 0,
    });
  }

  // Resolve all referenced subjects (placements + prerequisites) in one query.
  const allSubjectIds = new Set();
  for (const p of placements) {
    allSubjectIds.add(p.subjectId);
    for (const pr of p.prerequisiteSubjectIds) allSubjectIds.add(pr);
  }
  const subjects = await Subject.find({ _id: { $in: Array.from(allSubjectIds) } })
    .select('_id code title units lecturePeriods labPeriods isActive status prerequisiteSubjectIds')
    .lean();
  const subjectMap = new Map(subjects.map((s) => [String(s._id), s]));

  for (const p of placements) {
    const subject = subjectMap.get(p.subjectId);
    if (!subject) {
      return { valid: false, message: `Subject ${p.subjectId} does not exist`, placements: [] };
    }
    if (!subject.isActive || subject.status === 'Inactive') {
      return { valid: false, message: `Subject ${subject.code || p.subjectId} is inactive and cannot be placed in a curriculum`, placements: [] };
    }
    for (const prId of p.prerequisiteSubjectIds) {
      if (!subjectMap.has(prId)) {
        return { valid: false, message: `Prerequisite subject ${prId} for subject ${subject.code} does not exist`, placements: [] };
      }
    }
    p.subject = subject;
    // If no explicit prerequisites were supplied, seed from the Subject's
    // default prerequisite list — same behavior as addSubject.
    if (p.prerequisiteSubjectIds.length === 0 && Array.isArray(subject.prerequisiteSubjectIds) && subject.prerequisiteSubjectIds.length > 0) {
      p.prerequisiteSubjectIds = subject.prerequisiteSubjectIds.map(String);
    }
  }

  return { valid: true, message: '', placements };
}

class CurriculumController {
  static async listCurriculums(req, res) {
    try {
      const { programCode, status, q } = req.query;
      const query = {};
      if (programCode) query.programCode = Number(programCode);
      if (status) query.status = status;
      if (q) {
        query.$or = [
          { name: { $regex: String(q).trim(), $options: 'i' } },
          { code: { $regex: String(q).trim(), $options: 'i' } },
          { version: { $regex: String(q).trim(), $options: 'i' } },
        ];
      }

      const curriculums = await Curriculum.find(query)
        .select('-subjects')
        .sort({ status: 1, programCode: 1, version: -1 })
        .lean();

      const enriched = await Promise.all(
        curriculums.map(async (c) => {
          const subjectCount = await CurriculumSubject.countDocuments({ curriculumId: c._id });
          return { ...c, subjectCount };
        })
      );

      res.json({ success: true, data: enriched });
    } catch (error) {
      console.error('Error fetching curriculums:', error);
      res.status(500).json({ success: false, message: 'Failed to fetch curriculums' });
    }
  }

  static async getCurriculum(req, res) {
    try {
      const { id } = req.params;
      const curriculum = await Curriculum.findById(id).select('-subjects').lean();
      if (!curriculum) {
        return res.status(404).json({ success: false, message: 'Curriculum not found' });
      }

      const subjectCount = await CurriculumSubject.countDocuments({ curriculumId: id });
      res.json({ success: true, data: { ...curriculum, subjectCount } });
    } catch (error) {
      console.error('Error fetching curriculum:', error);
      res.status(500).json({ success: false, message: 'Failed to fetch curriculum' });
    }
  }

  static async createCurriculum(req, res) {
    try {
      const { programCode, name, code, version, effectiveSchoolYear, description, subjects } = req.body;

      if (!programCode) {
        return res.status(400).json({ success: false, message: 'Program code is required' });
      }

      const programName = PROGRAM_NAMES[Number(programCode)] || 'Unknown';

      const existing = await Curriculum.findOne({
        programCode: Number(programCode),
        version: String(version || new Date().getFullYear()).trim(),
      });
      if (existing) {
        return res.status(409).json({
          success: false,
          message: 'A curriculum with this version already exists for this program',
        });
      }

      // Optional bulk subject placements with prerequisites. Validate ALL
      // placements up front so we never enter a transaction with invalid
      // subject data — if any placement is invalid, the whole request is
      // rejected with 400 and nothing is written.
      let placements = [];
      if (Array.isArray(subjects) && subjects.length > 0) {
        const validation = await validatePlacements(subjects);
        if (!validation.valid) {
          return res.status(400).json({ success: false, message: validation.message });
        }
        placements = validation.placements;
      }

      // ATOMICITY: wrap curriculum + CurriculumSubject creation in a single
      // MongoDB transaction so that a failure during placement creation
      // rolls back the curriculum shell too — no partial curriculum can
      // remain. Transactions are supported because the deployment uses
      // MongoDB Atlas (replica set). Same pattern as
      // academicYearRolloverService.runRollover and blockController.
      const session = await mongoose.startSession();
      let curriculum = null;
      let createdCount = 0;
      try {
        await session.withTransaction(async () => {
          curriculum = await Curriculum.create([{
            programCode: Number(programCode),
            programName,
            name: name ? String(name).trim() : `${programName} Curriculum ${version || new Date().getFullYear()}`,
            code: code ? String(code).trim().toUpperCase() : undefined,
            version: String(version || new Date().getFullYear()).trim(),
            effectiveSchoolYear: effectiveSchoolYear || undefined,
            description: description ? String(description).trim() : undefined,
            status: 'Draft',
            createdBy: req.adminId,
          }], { session });
          curriculum = curriculum[0];

          // Create CurriculumSubject records with snapshot fields copied
          // from each referenced Subject at placement time — same snapshot
          // pattern as CurriculumSubjectController.addSubject. These become
          // immutable with respect to future Subject edits.
          if (placements.length > 0) {
            const docs = placements.map((p) => ({
              curriculumId: curriculum._id,
              subjectId: p.subject._id,
              yearLevel: p.yearLevel,
              semester: p.semester,
              type: p.type,
              isRequired: p.isRequired,
              courseNo: p.subject.code,
              descriptiveTitle: p.subject.title,
              units: p.subject.units,
              lecturePeriods: p.subject.lecturePeriods || 0,
              labPeriods: p.subject.labPeriods || 0,
              prerequisiteSubjectIds: p.prerequisiteSubjectIds,
              displayOrder: p.displayOrder,
              createdBy: req.adminId,
            }));
            await CurriculumSubject.insertMany(docs, { session });
            createdCount = docs.length;
          }
        });
      } finally {
        await session.endSession();
      }

      res.status(201).json({
        success: true,
        data: { ...curriculum.toObject(), subjectCount: createdCount },
        message: `Curriculum created successfully${createdCount > 0 ? ` with ${createdCount} subject(s)` : ''}`,
      });
    } catch (error) {
      console.error('Error creating curriculum:', error);
      res.status(500).json({ success: false, message: error.message || 'Failed to create curriculum' });
    }
  }

  static async updateCurriculum(req, res) {
    try {
      const { id } = req.params;
      const { name, code, version, effectiveSchoolYear, description } = req.body;

      const curriculum = await Curriculum.findById(id);
      if (!curriculum) {
        return res.status(404).json({ success: false, message: 'Curriculum not found' });
      }

      if (curriculum.status === 'Archived') {
        return res.status(403).json({ success: false, message: 'Archived curricula are read-only' });
      }

      if (name !== undefined) curriculum.name = String(name).trim();
      if (code !== undefined) curriculum.code = String(code).trim().toUpperCase();
      if (version !== undefined) {
        const duplicate = await Curriculum.findOne({
          programCode: curriculum.programCode,
          version: String(version).trim(),
          _id: { $ne: id },
        });
        if (duplicate) {
          return res.status(409).json({ success: false, message: 'Version already exists for this program' });
        }
        curriculum.version = String(version).trim();
      }
      if (effectiveSchoolYear !== undefined) curriculum.effectiveSchoolYear = effectiveSchoolYear || undefined;
      if (description !== undefined) curriculum.description = String(description).trim();
      curriculum.updatedBy = req.adminId;

      await curriculum.save();
      res.json({ success: true, data: curriculum, message: 'Curriculum updated successfully' });
    } catch (error) {
      console.error('Error updating curriculum:', error);
      res.status(500).json({ success: false, message: error.message || 'Failed to update curriculum' });
    }
  }

  static async deleteCurriculum(req, res) {
    try {
      const { id } = req.params;

      const hasEnrollments = await Enrollment.exists({ curriculumId: id });
      if (hasEnrollments) {
        return res.status(409).json({
          success: false,
          message: 'Cannot delete curriculum because enrollment records reference it. Archive it instead.',
        });
      }

      const curriculum = await Curriculum.findByIdAndDelete(id);
      if (!curriculum) {
        return res.status(404).json({ success: false, message: 'Curriculum not found' });
      }

      await CurriculumSubject.deleteMany({ curriculumId: id });

      res.json({ success: true, data: { _id: String(curriculum._id) }, message: 'Curriculum deleted successfully' });
    } catch (error) {
      console.error('Error deleting curriculum:', error);
      res.status(500).json({ success: false, message: error.message || 'Failed to delete curriculum' });
    }
  }

  static async patchStatus(req, res) {
    try {
      const { id } = req.params;
      const { status } = req.body;

      const curriculum = await Curriculum.findById(id);
      if (!curriculum) {
        return res.status(404).json({ success: false, message: 'Curriculum not found' });
      }

      if (status === 'Active') {
        const subjectCount = await CurriculumSubject.countDocuments({ curriculumId: id });
        if (subjectCount === 0) {
          return res.status(400).json({
            success: false,
            message: 'Cannot activate a curriculum with no subjects. Add subjects first.',
          });
        }

        const existingActive = await Curriculum.findOne({
          programCode: curriculum.programCode,
          status: 'Active',
          _id: { $ne: id },
        });
        if (existingActive) {
          existingActive.status = 'Legacy';
          existingActive.updatedBy = req.adminId;
          await existingActive.save();
        }
      }

      if (curriculum.status === 'Archived' && status !== 'Archived') {
        return res.status(403).json({ success: false, message: 'Archived curricula cannot be reactivated' });
      }

      curriculum.status = status;
      curriculum.updatedBy = req.adminId;
      await curriculum.save();

      res.json({ success: true, data: curriculum, message: `Curriculum status changed to ${status}` });
    } catch (error) {
      console.error('Error updating curriculum status:', error);
      res.status(500).json({ success: false, message: error.message || 'Failed to update curriculum status' });
    }
  }

  static async duplicateCurriculum(req, res) {
    try {
      const { id } = req.params;
      const { version, effectiveSchoolYear, name } = req.body;

      const source = await Curriculum.findById(id);
      if (!source) {
        return res.status(404).json({ success: false, message: 'Curriculum not found' });
      }

      const newVersion = String(version || String(Number(source.version) + 1)).trim();

      const existing = await Curriculum.findOne({
        programCode: source.programCode,
        version: newVersion,
      });
      if (existing) {
        return res.status(409).json({ success: false, message: 'A curriculum with this version already exists' });
      }

      const duplicate = await Curriculum.create({
        programCode: source.programCode,
        programName: source.programName,
        name: name ? String(name).trim() : `${source.programName} Curriculum ${newVersion}`,
        code: source.code ? `${source.code.split('-')[0]}-${newVersion}` : undefined,
        version: newVersion,
        effectiveSchoolYear: effectiveSchoolYear || undefined,
        description: source.description,
        status: 'Draft',
        createdBy: req.adminId,
      });

      const sourceSubjects = await CurriculumSubject.find({ curriculumId: id }).lean();
      if (sourceSubjects.length > 0) {
        const newSubjects = sourceSubjects.map((s) => ({
          curriculumId: duplicate._id,
          subjectId: s.subjectId,
          yearLevel: s.yearLevel,
          semester: s.semester,
          type: s.type,
          isRequired: s.isRequired,
          prerequisiteSubjectIds: s.prerequisiteSubjectIds,
          displayOrder: s.displayOrder,
          createdBy: req.adminId,
        }));
        await CurriculumSubject.insertMany(newSubjects);
      }

      res.status(201).json({
        success: true,
        data: duplicate,
        message: `Curriculum duplicated as ${duplicate.name} (Draft)`,
      });
    } catch (error) {
      console.error('Error duplicating curriculum:', error);
      res.status(500).json({ success: false, message: error.message || 'Failed to duplicate curriculum' });
    }
  }
}

module.exports = CurriculumController;
