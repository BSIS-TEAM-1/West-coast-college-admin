const mongoose = require('mongoose');
const Curriculum = require('../models/Curriculum');
const CurriculumSubject = require('../models/CurriculumSubject');
const Subject = require('../models/Subject');
const BlockGroup = require('../models/BlockGroup');
const BlockSection = require('../models/BlockSection');
const BlockSubjectAssignment = require('../models/BlockSubjectAssignment');
const StudentBlockAssignment = require('../models/StudentBlockAssignment');
const Enrollment = require('../models/Enrollment');
const AuditLog = require('../models/AuditLog');
const { normalizeSchoolYear } = require('../services/blockTerm');
const { autoAssignSubjectsFromCurriculum } = require('../services/blockSubjectAutoAssignService');
const {
  MIN_YEAR_LEVEL,
  MAX_YEAR_LEVEL,
  SEMESTERS: VALID_SEMESTERS,
  supportedYearLevels,
} = require('../lib/curriculumYears');

const VALID_SUBJECT_TYPES = ['General', 'Major', 'Professional', 'Elective'];

/**
 * Validate the placement fields shared by add/update/bulk. Returns an error
 * string for the first invalid field, or null when the values are usable.
 * Mongoose also validates these enums, but by then the failure surfaces as a
 * 500; controllers should reject bad input with a readable 400 instead.
 */
function validatePlacementFields({ yearLevel, semester, type, units, lecturePeriods, labPeriods }, { requireYearAndSemester }) {
  if (yearLevel !== undefined || requireYearAndSemester) {
    const parsedYear = Number(yearLevel);
    if (!Number.isInteger(parsedYear) || parsedYear < MIN_YEAR_LEVEL || parsedYear > MAX_YEAR_LEVEL) {
      return `yearLevel must be a whole number between ${MIN_YEAR_LEVEL} and ${MAX_YEAR_LEVEL}`;
    }
  }
  if ((semester !== undefined || requireYearAndSemester) && !VALID_SEMESTERS.includes(semester)) {
    return `semester must be one of ${VALID_SEMESTERS.join(', ')}`;
  }
  if (type !== undefined && !VALID_SUBJECT_TYPES.includes(type)) {
    return `type must be one of ${VALID_SUBJECT_TYPES.join(', ')}`;
  }
  for (const [field, value] of [['units', units], ['lecturePeriods', lecturePeriods], ['labPeriods', labPeriods]]) {
    if (value === undefined) continue;
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed < 0) {
      return `${field} must be a non-negative number`;
    }
  }
  return null;
}

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

      // The structure endpoint is also the place a registrar discovers which
      // years exist at all — the per-year "Add Subject" control only renders
      // inside a year block. Emitting every supported year and semester (with
      // empty ones included) is what makes an unpopulated year reachable;
      // building the map from populated years alone locked Year 2-4 out.
      const highestYearWithSubjects = yearMap.size > 0 ? Math.max(...yearMap.keys()) : 0;
      const years = supportedYearLevels(highestYearWithSubjects).map((yearLevel) => {
        const semMap = yearMap.get(yearLevel) || new Map();
        const semesters = VALID_SEMESTERS.map((semester) => {
          const subjects = semMap.get(semester) || [];
          return {
            semester,
            subjects,
            totalUnits: subjects.reduce((sum, s) => sum + (s.units || 0), 0),
            totalLecturePeriods: subjects.reduce((sum, s) => sum + (s.lecturePeriods || 0), 0),
            totalLabPeriods: subjects.reduce((sum, s) => sum + (s.labPeriods || 0), 0),
          };
        });
        return {
          yearLevel,
          semesters,
          totalUnits: semesters.reduce((sum, s) => sum + s.totalUnits, 0),
          totalLecturePeriods: semesters.reduce((sum, s) => sum + s.totalLecturePeriods, 0),
          totalLabPeriods: semesters.reduce((sum, s) => sum + s.totalLabPeriods, 0),
        };
      });

      // "Years covered" keeps its original meaning — years that actually hold
      // at least one subject — so it stays a truthful progress figure now that
      // `years` always reports the full supported range.
      const yearsCovered = years.filter((year) =>
        year.semesters.some((semester) => semester.subjects.length > 0)
      ).length;

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
            yearsCovered,
            yearsSupported: years.length,
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

      const fieldError = validatePlacementFields(
        { yearLevel, semester, type },
        { requireYearAndSemester: true }
      );
      if (fieldError) {
        return res.status(400).json({ success: false, message: fieldError });
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

      // Auto-sync to linked block groups
      try {
        const groups = await BlockGroup.find({ curriculumId: id }).lean();
        if (groups.length > 0) {
          const sections = await BlockSection.find({
            blockGroupId: { $in: groups.map((g) => g._id) },
          }).lean();
          const sectionsByGroup = new Map();
          for (const section of sections) {
            const key = String(section.blockGroupId);
            const groupSections = sectionsByGroup.get(key) || [];
            groupSections.push(section);
            sectionsByGroup.set(key, groupSections);
          }
          for (const group of groups) {
            try {
              await autoAssignSubjectsFromCurriculum(
                group,
                sectionsByGroup.get(String(group._id)) || [],
                req.adminId
              );
            } catch (syncError) {
              console.error(`Failed to sync curriculum to block group ${group.name}:`, syncError);
            }
          }
        }
      } catch (syncError) {
        console.error('Auto-sync curriculum subjects error:', syncError);
      }

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

      for (let i = 0; i < subjects.length; i++) {
        const entry = subjects[i] || {};
        const fieldError = validatePlacementFields(entry, { requireYearAndSemester: true });
        if (fieldError) {
          return res.status(400).json({
            success: false,
            message: `Subject placement at index ${i}: ${fieldError}`,
          });
        }
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

      // Auto-sync to linked block groups
      if (created.length > 0) {
        try {
          const groups = await BlockGroup.find({ curriculumId: id }).lean();
          if (groups.length > 0) {
            const sections = await BlockSection.find({
              blockGroupId: { $in: groups.map((g) => g._id) },
            }).lean();
            const sectionsByGroup = new Map();
            for (const section of sections) {
              const key = String(section.blockGroupId);
              const groupSections = sectionsByGroup.get(key) || [];
              groupSections.push(section);
              sectionsByGroup.set(key, groupSections);
            }
            for (const group of groups) {
              try {
                await autoAssignSubjectsFromCurriculum(
                  group,
                  sectionsByGroup.get(String(group._id)) || [],
                  req.adminId
                );
              } catch (syncError) {
                console.error(`Failed to sync curriculum to block group ${group.name}:`, syncError);
              }
            }
          }
        } catch (syncError) {
          console.error('Auto-sync curriculum subjects error:', syncError);
        }
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

      const fieldError = validatePlacementFields(
        { yearLevel, semester, type, units, lecturePeriods, labPeriods },
        { requireYearAndSemester: false }
      );
      if (fieldError) {
        return res.status(400).json({ success: false, message: fieldError });
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

      // Auto-sync to linked block groups
      try {
        const groups = await BlockGroup.find({ curriculumId: id }).lean();
        if (groups.length > 0) {
          const sections = await BlockSection.find({
            blockGroupId: { $in: groups.map((g) => g._id) },
          }).lean();
          const sectionsByGroup = new Map();
          for (const section of sections) {
            const key = String(section.blockGroupId);
            const groupSections = sectionsByGroup.get(key) || [];
            groupSections.push(section);
            sectionsByGroup.set(key, groupSections);
          }
          for (const group of groups) {
            try {
              await autoAssignSubjectsFromCurriculum(
                group,
                sectionsByGroup.get(String(group._id)) || [],
                req.adminId
              );
            } catch (syncError) {
              console.error(`Failed to sync curriculum to block group ${group.name}:`, syncError);
            }
          }
        }
      } catch (syncError) {
        console.error('Auto-sync curriculum subjects error:', syncError);
      }

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
            }).select('studentId semester year schoolYear').lean();

            if (studentAssignments.length > 0) {
              // Build one filter per affected student+term. StudentBlockAssignment.year
              // is the "YYYY-YYYY" string on current rows (legacy rows stored a
              // bare number), so normalise it instead of Number(year) — the old
              // logic produced NaN for every current assignment and silently
              // skipped the enrollment update.
              const enrollmentFilters = new Map();
              for (const sa of studentAssignments) {
                const studentId = String(sa.studentId || '');
                const schoolYear = normalizeSchoolYear(sa.schoolYear || sa.year);
                const semester = String(sa.semester || '').trim();
                if (!mongoose.isValidObjectId(studentId) || !schoolYear || !VALID_SEMESTERS.includes(semester)) {
                  continue;
                }
                enrollmentFilters.set(`${studentId}|${schoolYear}|${semester}`, {
                  studentId: new mongoose.Types.ObjectId(studentId),
                  schoolYear,
                  semester,
                });
              }

              if (enrollmentFilters.size > 0) {
                const enrollments = await Enrollment.find({
                  $or: Array.from(enrollmentFilters.values()),
                  // Locked (historical) records are immutable — never touch them.
                  lockedAt: null,
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

      // Removing a placement can cascade into live enrollment records, which
      // would otherwise be an invisible edit to a student's term. Record it so
      // the curriculum change and its blast radius are always traceable. An
      // audit-write failure must not roll back a completed removal, so it is
      // reported instead of thrown.
      try {
        await AuditLog.create({
          action: 'DELETE',
          resourceType: 'CURRICULUM',
          resourceId: String(id),
          resourceName: cs.courseNo || cs.descriptiveTitle || String(curriculumSubjectId),
          description:
            `Removed subject ${cs.courseNo || cs.descriptiveTitle || ''} (year ${cs.yearLevel ?? 'N/A'}, ${cs.semester || 'N/A'}) from curriculum`
            + ` · ${removedAssignments} block assignment(s) cleaned up`
            + ` · ${updatedEnrollments} enrollment(s) updated`,
          performedBy: req.adminId,
          performedByRole: String(req.accountType || 'registrar').toLowerCase() === 'admin' ? 'admin' : 'registrar',
          newValue: {
            curriculumId: String(id),
            curriculumSubjectId: String(curriculumSubjectId),
            subjectId: cs.subjectId ? String(cs.subjectId) : null,
            removedAssignments,
            updatedEnrollments,
          },
          status: 'SUCCESS',
          severity: updatedEnrollments > 0 ? 'HIGH' : 'MEDIUM',
        });
      } catch (auditError) {
        console.error('Failed to record curriculum subject removal audit entry:', auditError);
      }

      res.json({ success: true, data: { _id: String(cs._id) }, message: parts.join(' · ') });
    } catch (error) {
      console.error('Error removing curriculum subject:', error);
      res.status(500).json({ success: false, message: error.message || 'Failed to remove curriculum subject' });
    }
  }
}

module.exports = CurriculumSubjectController;
