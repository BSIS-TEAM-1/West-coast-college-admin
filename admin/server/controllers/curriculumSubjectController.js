const mongoose = require('mongoose');
const Curriculum = require('../models/Curriculum');
const CurriculumSubject = require('../models/CurriculumSubject');
const Subject = require('../models/Subject');
const BlockGroup = require('../models/BlockGroup');
const BlockSection = require('../models/BlockSection');
const BlockSubjectAssignment = require('../models/BlockSubjectAssignment');
const StudentBlockAssignment = require('../models/StudentBlockAssignment');
const Enrollment = require('../models/Enrollment');

// NOTE: units/lecturePeriods/labPeriods/prerequisiteSubjectIds are NOT read
// from the populated Subject for display/totals — CurriculumSubject snapshots
// those fields at placement time (see models/CurriculumSubject.js). This
// select is only for identity/live-reference fields (code/title as fallback
// display, subjectType, status for admin visibility).
const SUBJECT_SELECT = '_id code title units subjectType lecturePeriods labPeriods status isActive prerequisiteSubjectIds';

class CurriculumSubjectController {
  static async getSubjects(req, res) {
    try {
      const { id } = req.params;
      const { yearLevel, semester } = req.query;

      const query = { curriculumId: id };
      if (yearLevel) query.yearLevel = Number(yearLevel);
      if (semester) query.semester = semester;

      const curriculumSubjects = await CurriculumSubject.find(query)
        .populate({ path: 'subjectId', select: SUBJECT_SELECT })
        .populate({ path: 'prerequisiteSubjectIds', select: SUBJECT_SELECT })
        .sort({ yearLevel: 1, semester: 1, displayOrder: 1, 'subjectId.code': 1 })
        .lean();

      res.json({ success: true, data: curriculumSubjects });
    } catch (error) {
      console.error('Error fetching curriculum subjects:', error);
      res.status(500).json({ success: false, message: 'Failed to fetch curriculum subjects' });
    }
  }

  static async getStructure(req, res) {
    try {
      const { id } = req.params;

      const curriculum = await Curriculum.findById(id).select('-subjects').lean();
      if (!curriculum) {
        return res.status(404).json({ success: false, message: 'Curriculum not found' });
      }

      const curriculumSubjects = await CurriculumSubject.find({ curriculumId: id })
        .populate({ path: 'subjectId', select: SUBJECT_SELECT })
        .populate({ path: 'prerequisiteSubjectIds', select: SUBJECT_SELECT })
        .sort({ yearLevel: 1, semester: 1, displayOrder: 1 })
        .lean();

      const yearMap = new Map();
      let totalUnits = 0;
      let totalLecturePeriods = 0;
      let totalLabPeriods = 0;
      let requiredCount = 0;
      let electiveCount = 0;

      for (const cs of curriculumSubjects) {
        const year = cs.yearLevel;
        if (!yearMap.has(year)) {
          yearMap.set(year, new Map());
        }
        const semMap = yearMap.get(year);
        if (!semMap.has(cs.semester)) {
          semMap.set(cs.semester, []);
        }
        semMap.get(cs.semester).push(cs);

        // Use the CurriculumSubject snapshot (approved-at-placement values),
        // NOT the live populated Subject — this is what keeps curriculum
        // totals stable when the master Subject is edited later.
        totalUnits += cs.units || 0;
        totalLecturePeriods += cs.lecturePeriods || 0;
        totalLabPeriods += cs.labPeriods || 0;
        if (cs.isRequired) {
          requiredCount++;
        } else {
          electiveCount++;
        }
      }

      const years = [];
      for (const [yearLevel, semMap] of yearMap) {
        const semesters = [];
        let yearUnits = 0;
        let yearLecturePeriods = 0;
        let yearLabPeriods = 0;
        for (const [semester, subjects] of semMap) {
          const semUnits = subjects.reduce((sum, s) => sum + (s.units || 0), 0);
          const semLecturePeriods = subjects.reduce((sum, s) => sum + (s.lecturePeriods || 0), 0);
          const semLabPeriods = subjects.reduce((sum, s) => sum + (s.labPeriods || 0), 0);
          yearUnits += semUnits;
          yearLecturePeriods += semLecturePeriods;
          yearLabPeriods += semLabPeriods;
          semesters.push({
            semester,
            subjects,
            totalUnits: semUnits,
            totalLecturePeriods: semLecturePeriods,
            totalLabPeriods: semLabPeriods,
          });
        }
        years.push({
          yearLevel,
          semesters,
          totalUnits: yearUnits,
          totalLecturePeriods: yearLecturePeriods,
          totalLabPeriods: yearLabPeriods,
        });
      }

      res.json({
        success: true,
        data: {
          curriculum,
          years,
          summary: {
            totalSubjects: curriculumSubjects.length,
            totalUnits,
            totalLecturePeriods,
            totalLabPeriods,
            requiredCount,
            electiveCount,
            yearsCovered: years.length,
          },
        },
      });
    } catch (error) {
      console.error('Error fetching curriculum structure:', error);
      res.status(500).json({ success: false, message: 'Failed to fetch curriculum structure' });
    }
  }

  static async addSubject(req, res) {
    try {
      const { id } = req.params;
      const { subjectId, yearLevel, semester, type, isRequired, prerequisiteSubjectIds, displayOrder } = req.body;

      if (!subjectId || !yearLevel || !semester) {
        return res.status(400).json({
          success: false,
          message: 'subjectId, yearLevel, and semester are required',
        });
      }

      const curriculum = await Curriculum.findById(id).select('status programCode');
      if (!curriculum) {
        return res.status(404).json({ success: false, message: 'Curriculum not found' });
      }
      if (curriculum.status === 'Archived') {
        return res.status(403).json({ success: false, message: 'Cannot add subjects to an archived curriculum' });
      }

      const subject = await Subject.findById(subjectId).select('_id code title units lecturePeriods labPeriods isActive status prerequisiteSubjectIds');
      if (!subject) {
        return res.status(404).json({ success: false, message: 'Subject not found' });
      }
      if (!subject.isActive || subject.status === 'Inactive') {
        return res.status(400).json({ success: false, message: 'Cannot add an inactive subject to curriculum' });
      }

      const existing = await CurriculumSubject.findOne({ curriculumId: id, subjectId });
      if (existing) {
        return res.status(409).json({
          success: false,
          message: 'This subject is already placed in this curriculum',
        });
      }

      const effectivePrerequisites = Array.isArray(prerequisiteSubjectIds)
        ? prerequisiteSubjectIds
        : (subject.prerequisiteSubjectIds || []);

      // SNAPSHOT the academic-impact fields from Subject at placement time.
      // These become immutable with respect to future Subject edits — see
      // models/CurriculumSubject.js for the full rationale. Only an explicit
      // registrar edit to this CurriculumSubject (updateSubject below) may
      // change them afterwards.
      const curriculumSubject = await CurriculumSubject.create({
        curriculumId: id,
        subjectId,
        yearLevel: Number(yearLevel),
        semester,
        type: type || 'General',
        isRequired: isRequired !== undefined ? Boolean(isRequired) : true,
        courseNo: subject.code,
        descriptiveTitle: subject.title,
        units: subject.units,
        lecturePeriods: subject.lecturePeriods || 0,
        labPeriods: subject.labPeriods || 0,
        prerequisiteSubjectIds: effectivePrerequisites,
        displayOrder: displayOrder || 0,
        createdBy: req.adminId,
      });

      const populated = await CurriculumSubject.findById(curriculumSubject._id)
        .populate({ path: 'subjectId', select: SUBJECT_SELECT })
        .populate({ path: 'prerequisiteSubjectIds', select: SUBJECT_SELECT })
        .lean();

      res.status(201).json({
        success: true,
        data: populated,
        message: 'Subject added to curriculum successfully',
      });
    } catch (error) {
      console.error('Error adding subject to curriculum:', error);
      res.status(500).json({ success: false, message: error.message || 'Failed to add subject to curriculum' });
    }
  }

  static async bulkAddSubjects(req, res) {
    try {
      const { id } = req.params;
      const { subjects } = req.body;

      if (!Array.isArray(subjects) || subjects.length === 0) {
        return res.status(400).json({ success: false, message: 'subjects array is required' });
      }

      const curriculum = await Curriculum.findById(id).select('status programCode');
      if (!curriculum) {
        return res.status(404).json({ success: false, message: 'Curriculum not found' });
      }
      if (curriculum.status === 'Archived') {
        return res.status(403).json({ success: false, message: 'Cannot add subjects to an archived curriculum' });
      }

      const subjectIds = subjects.map((s) => s.subjectId);
      const foundSubjects = await Subject.find({ _id: { $in: subjectIds } })
        .select('_id code title units lecturePeriods labPeriods isActive status prerequisiteSubjectIds');
      const foundMap = new Map(foundSubjects.map((s) => [String(s._id), s]));

      const errors = [];
      const validEntries = [];
      for (const entry of subjects) {
        const subject = foundMap.get(String(entry.subjectId));
        if (!subject) {
          errors.push({ subjectId: entry.subjectId, message: 'Subject not found' });
        } else if (!subject.isActive || subject.status === 'Inactive') {
          errors.push({ subjectId: entry.subjectId, message: 'Cannot add an inactive subject' });
        } else {
          validEntries.push({ entry, subject });
        }
      }

      const existing = await CurriculumSubject.find({
        curriculumId: id,
        subjectId: { $in: validEntries.map((v) => v.entry.subjectId) },
      }).select('subjectId');
      const existingIds = new Set(existing.map((e) => String(e.subjectId)));

      const toCreate = [];
      const skipped = [];
      for (const { entry, subject } of validEntries) {
        if (existingIds.has(String(entry.subjectId))) {
          skipped.push({ subjectId: entry.subjectId, code: subject.code, message: 'Already in curriculum' });
          continue;
        }
        toCreate.push({
          curriculumId: id,
          subjectId: entry.subjectId,
          yearLevel: Number(entry.yearLevel),
          semester: entry.semester,
          type: entry.type || 'General',
          isRequired: entry.isRequired !== undefined ? Boolean(entry.isRequired) : true,
          courseNo: subject.code,
          descriptiveTitle: subject.title,
          units: subject.units,
          lecturePeriods: subject.lecturePeriods || 0,
          labPeriods: subject.labPeriods || 0,
          prerequisiteSubjectIds: subject.prerequisiteSubjectIds || [],
          displayOrder: entry.displayOrder || 0,
          createdBy: req.adminId,
        });
      }

      let created = [];
      if (toCreate.length > 0) {
        created = await CurriculumSubject.insertMany(toCreate);
      }

      res.json({
        success: true,
        data: {
          created: created.length,
          skipped: skipped.length,
          errors,
          skippedDetails: skipped,
        },
        message: `${created.length} subject${created.length !== 1 ? 's' : ''} added${skipped.length > 0 ? `, ${skipped.length} already present` : ''}${errors.length > 0 ? `, ${errors.length} error${errors.length !== 1 ? 's' : ''}` : ''}`,
      });
    } catch (error) {
      console.error('Error bulk adding subjects to curriculum:', error);
      res.status(500).json({ success: false, message: error.message || 'Failed to add subjects to curriculum' });
    }
  }

  static async updateSubject(req, res) {
    try {
      const { id, curriculumSubjectId } = req.params;
      const {
        yearLevel, semester, type, isRequired, prerequisiteSubjectIds, displayOrder,
        courseNo, descriptiveTitle, units, lecturePeriods, labPeriods,
      } = req.body;

      const curriculum = await Curriculum.findById(id).select('status');
      if (!curriculum) {
        return res.status(404).json({ success: false, message: 'Curriculum not found' });
      }
      if (curriculum.status === 'Archived') {
        return res.status(403).json({ success: false, message: 'Archived curricula are read-only' });
      }

      const cs = await CurriculumSubject.findById(curriculumSubjectId);
      if (!cs) {
        return res.status(404).json({ success: false, message: 'Curriculum subject not found' });
      }
      if (String(cs.curriculumId) !== String(id)) {
        return res.status(400).json({ success: false, message: 'Curriculum subject does not belong to this curriculum' });
      }

      if (prerequisiteSubjectIds !== undefined) {
        const ids = Array.isArray(prerequisiteSubjectIds) ? prerequisiteSubjectIds.map(String) : [];
        if (ids.includes(String(cs.subjectId))) {
          return res.status(400).json({ success: false, message: 'A subject cannot be a prerequisite of itself' });
        }
        if (new Set(ids).size !== ids.length) {
          return res.status(400).json({ success: false, message: 'Duplicate prerequisite subjects are not allowed' });
        }
        if (ids.length > 0) {
          const foundCount = await Subject.countDocuments({ _id: { $in: ids } });
          if (foundCount !== ids.length) {
            return res.status(400).json({ success: false, message: 'One or more prerequisite subjects do not exist' });
          }
        }
        cs.prerequisiteSubjectIds = prerequisiteSubjectIds;
      }

      if (yearLevel !== undefined) cs.yearLevel = Number(yearLevel);
      if (semester !== undefined) cs.semester = semester;
      if (type !== undefined) cs.type = type;
      if (isRequired !== undefined) cs.isRequired = Boolean(isRequired);
      if (displayOrder !== undefined) cs.displayOrder = Number(displayOrder);

      // Explicit registrar override of the curriculum snapshot. These never
      // change automatically when the master Subject changes — only here,
      // via a deliberate edit to this specific placement.
      if (courseNo !== undefined) cs.courseNo = String(courseNo).trim();
      if (descriptiveTitle !== undefined) cs.descriptiveTitle = String(descriptiveTitle).trim();
      if (units !== undefined) cs.units = Number(units);
      if (lecturePeriods !== undefined) cs.lecturePeriods = Number(lecturePeriods);
      if (labPeriods !== undefined) cs.labPeriods = Number(labPeriods);

      cs.updatedBy = req.adminId;

      await cs.save();

      const populated = await CurriculumSubject.findById(cs._id)
        .populate({ path: 'subjectId', select: SUBJECT_SELECT })
        .populate({ path: 'prerequisiteSubjectIds', select: SUBJECT_SELECT })
        .lean();

      res.json({ success: true, data: populated, message: 'Curriculum subject updated successfully' });
    } catch (error) {
      console.error('Error updating curriculum subject:', error);
      res.status(500).json({ success: false, message: error.message || 'Failed to update curriculum subject' });
    }
  }

  static async removeSubject(req, res) {
    try {
      const { id, curriculumSubjectId } = req.params;

      const curriculum = await Curriculum.findById(id).select('status');
      if (!curriculum) {
        return res.status(404).json({ success: false, message: 'Curriculum not found' });
      }
      if (curriculum.status === 'Archived') {
        return res.status(403).json({ success: false, message: 'Archived curricula are read-only' });
      }

      const cs = await CurriculumSubject.findByIdAndDelete(curriculumSubjectId);
      if (!cs) {
        return res.status(404).json({ success: false, message: 'Curriculum subject not found' });
      }

      // Cascade: remove BlockSubjectAssignment records for this subject in blocks
      // linked to this curriculum. BlockGroup.curriculumId → BlockSection → assignments.
      let removedAssignments = 0;
      let updatedEnrollments = 0;
      if (cs.subjectId) {
        const blockGroups = await BlockGroup.find({ curriculumId: cs.curriculumId }).select('_id semester year').lean();
        if (blockGroups.length > 0) {
          const blockGroupIds = blockGroups.map(g => g._id);
          const blockSections = await BlockSection.find({ blockGroupId: { $in: blockGroupIds } }).select('_id').lean();
          if (blockSections.length > 0) {
            const sectionIds = blockSections.map(s => s._id);

            // 1. Remove BlockSubjectAssignment records
            const deleteResult = await BlockSubjectAssignment.deleteMany({
              blockSectionId: { $in: sectionIds },
              subjectId: cs.subjectId
            });
            removedAssignments = deleteResult.deletedCount || 0;

            // 2. Mark enrollment subjects as 'Removed' for students assigned to these blocks
            const studentAssignments = await StudentBlockAssignment.find({
              sectionId: { $in: sectionIds },
              status: 'ASSIGNED'
            }).select('studentId semester year').lean();

            if (studentAssignments.length > 0) {
              // Build enrollment query: match by studentId + schoolYear + semester
              const enrollmentPairs = new Set();
              studentAssignments.forEach((sa) => {
                const startYear = Number(sa.year);
                if (Number.isFinite(startYear)) {
                  const schoolYear = `${startYear}-${startYear + 1}`;
                  enrollmentPairs.add(`${schoolYear}|${String(sa.semester || '').trim()}`);
                }
              });

              if (enrollmentPairs.size > 0) {
                const enrollmentQueries = Array.from(enrollmentPairs).map((pair) => {
                  const [schoolYear, semester] = pair.split('|');
                  return { schoolYear, semester };
                });

                const enrollments = await Enrollment.find({
                  $or: enrollmentQueries,
                  status: { $ne: 'Dropped' },
                  'subjects.subjectId': cs.subjectId,
                  'subjects.status': { $in: ['Enrolled', 'Incomplete'] },
                  'subjects.grade': null
                }).select('_id subjects');

                for (const enrollment of enrollments) {
                  let modified = false;
                  for (const subject of enrollment.subjects) {
                    if (String(subject.subjectId) === String(cs.subjectId)
                        && (subject.status === 'Enrolled' || subject.status === 'Incomplete')
                        && (subject.grade === null || subject.grade === undefined)) {
                      subject.status = 'Removed';
                      subject.dateModified = new Date();
                      modified = true;
                    }
                  }
                  if (modified) {
                    enrollment.markModified('subjects');
                    await enrollment.save();
                    updatedEnrollments += 1;
                  }
                }
              }
            }
          }
        }
      }

      const parts = ['Subject removed from curriculum'];
      if (removedAssignments > 0) parts.push(`${removedAssignments} block assignment(s) cleaned up`);
      if (updatedEnrollments > 0) parts.push(`${updatedEnrollments} enrollment(s) updated`);

      res.json({ success: true, data: { _id: String(cs._id) }, message: parts.join(' · ') });
    } catch (error) {
      console.error('Error removing curriculum subject:', error);
      res.status(500).json({ success: false, message: error.message || 'Failed to remove curriculum subject' });
    }
  }
}

module.exports = CurriculumSubjectController;
