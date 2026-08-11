const mongoose = require('mongoose');
const BlockGroup = require('../models/BlockGroup');
const BlockSection = require('../models/BlockSection');
const StudentBlockAssignment = require('../models/StudentBlockAssignment');
const SectionWaitlist = require('../models/SectionWaitlist');
const BlockActionLog = require('../models/BlockActionLog');
const Student = require('../models/Student');
const Enrollment = require('../models/Enrollment');
const { buildSafeQuery, safeObjectId } = require('../securityMiddleware');
const { logger } = require('../services/logger');
const blockEligibilityService = require('../services/blockEligibilityService');
const Curriculum = require('../models/Curriculum');
const AcademicPeriod = require('../models/AcademicPeriod');
const Subject = require('../models/Subject');
const CurriculumSubject = require('../models/CurriculumSubject');
const { autoAssignSubjectsFromCurriculum } = require('../services/blockSubjectAutoAssignService');

class BlockController {
  extractBlockSlotFromName(value) {
    const text = String(value || '').trim().toUpperCase().replace(/\u2013/g, '-');
    if (!text) return null;

    const match = text.match(/(?:^|-)(\d+)-?([A-D])$/);
    if (!match) return null;

    const yearLevel = Number(match[1]);
    const letter = match[2];
    if (!Number.isFinite(yearLevel) || yearLevel < 1) return null;

    return { yearLevel, letter };
  }

  buildCanonicalBlockCode(rawValue) {
    const normalized = String(rawValue || '')
      .trim()
      .toUpperCase()
      .replace(/\u2013/g, '-')
      .replace(/\s+/g, '');
    if (!normalized) return '';

    const course = this.extractCourseFromGroupName(normalized);
    const slot = this.extractBlockSlotFromName(normalized);
    if (course && slot) return `${course}-${slot.yearLevel}-${slot.letter}`;
    return normalized.replace(/--+/g, '-');
  }

  normalizeCourseCode(rawCourse) {
    if (rawCourse === null || rawCourse === undefined) return null;
    const text = String(rawCourse).trim();
    if (!text) return null;

    if (/^\d+$/.test(text)) {
      const numeric = Number(text);
      return Number.isFinite(numeric) ? numeric : null;
    }

    const upper = text.toUpperCase().replace(/\u2013/g, '-');
    if (upper === 'BEED') return 101;
    if (upper === 'BSED-ENGLISH' || upper === 'ENGLISH') return 102;
    if (upper === 'BSED-MATH' || upper === 'MATH' || upper === 'MATHEMATICS') return 103;
    if (
      upper === 'BSBA-HRM' ||
      upper === 'BSBS-HRM' ||
      upper === 'HRM' ||
      upper.includes('BUSINESS ADMINISTRATION')
    ) return 201;

    return null;
  }

  getCourseFilterConditions(groupCourse) {
    // Keep filters cast-safe for Number schema fields.
    const numericCourse = Number(groupCourse);
    const conditions = [{ course: numericCourse }, { course: String(numericCourse) }];

    // Fallback for legacy records where course appears in studentNumber.
    const studentNumberAliasMap = {
      101: ['BEED'],
      102: ['BSED-ENGLISH', 'ENGLISH'],
      103: ['BSED-MATH', 'MATH', 'MATHEMATICS'],
      201: ['BSBA-HRM', 'BSBS-HRM', 'HRM']
    };

    conditions.push({ studentNumber: { $regex: `-${numericCourse}-`, $options: 'i' } });

    const aliases = studentNumberAliasMap[numericCourse] || [];
    aliases.forEach((alias) => {
      conditions.push({ studentNumber: { $regex: `-${alias}`, $options: 'i' } });
    });

    return conditions;
  }

  formatSchoolYearFromStartYear(value) {
    const year = Number(value);
    if (!Number.isFinite(year) || year < 1000) return '';
    return `${year}-${year + 1}`;
  }

  async clearEnrollmentSubjectAssignmentsForStudents({ studentIds = [], semester = '', schoolYear = '', session = null } = {}) {
    const validStudentObjectIds = Array.from(
      new Set(
        studentIds
          .map((studentId) => String(studentId || '').trim())
          .filter((studentId) => mongoose.Types.ObjectId.isValid(studentId))
      )
    ).map((studentId) => new mongoose.Types.ObjectId(studentId));

    if (validStudentObjectIds.length === 0) {
      return 0;
    }

    const enrollmentQuery = {
      studentId: { $in: validStudentObjectIds },
      status: { $ne: 'Dropped' }
    };
    if (String(semester || '').trim()) enrollmentQuery.semester = String(semester).trim();
    if (String(schoolYear || '').trim()) enrollmentQuery.schoolYear = String(schoolYear).trim();

    let enrollmentQueryBuilder = Enrollment.find(enrollmentQuery);
    if (session) enrollmentQueryBuilder = enrollmentQueryBuilder.session(session);
    const enrollments = await enrollmentQueryBuilder;

    let updatedEnrollments = 0;
    for (const enrollment of enrollments) {
      let changed = false;
      (Array.isArray(enrollment.subjects) ? enrollment.subjects : []).forEach((entry) => {
        if (String(entry?.status || '').toLowerCase() === 'dropped') return;

        const currentInstructor = String(entry?.instructor || '').trim();
        const currentSchedule = String(entry?.schedule || '').trim();
        const currentRoom = String(entry?.room || '').trim();
        const needsReset = (
          (currentInstructor && !/^TBA$/i.test(currentInstructor)) ||
          (currentSchedule && !/^TBA$/i.test(currentSchedule)) ||
          (currentRoom && !/^TBA$/i.test(currentRoom))
        );

        if (!needsReset) return;

        entry.instructor = 'TBA';
        entry.schedule = 'TBA';
        entry.room = 'TBA';
        entry.dateModified = new Date();
        changed = true;
      });

      if (changed) {
        enrollment.markModified('subjects');
        await enrollment.save(session ? { session } : undefined);
        updatedEnrollments += 1;
      }
    }

    return updatedEnrollments;
  }

  extractYearLevelFromGroupName(groupName) {
    const match = String(groupName || '').match(/(\d+)(?!.*\d)/);
    if (!match) return null;
    const level = Number(match[1]);
    return Number.isFinite(level) ? level : null;
  }

  extractCourseFromGroupName(groupName) {
    const text = String(groupName || '').toUpperCase();
    if (!text) return null;
    if (text.includes('101') || text.includes('BEED')) return 101;
    if (text.includes('102') || text.includes('ENGLISH')) return 102;
    if (text.includes('103') || text.includes('MATH') || text.includes('MATHEMATICS')) return 103;
    if (text.includes('201') || text.includes('BSBA') || text.includes('HRM')) return 201;
    return null;
  }

  getGroupYearLevel(group) {
    const structuredYearLevel = Number(group?.yearLevel);
    if (Number.isFinite(structuredYearLevel) && structuredYearLevel > 0) return structuredYearLevel;
    return this.extractYearLevelFromGroupName(group?.name);
  }

  getGroupCourseId(group) {
    const structuredCourseId = this.normalizeCourseCode(group?.courseId);
    if (structuredCourseId) return structuredCourseId;
    return this.extractCourseFromGroupName(group?.name);
  }

  getGroupSection(group) {
    const structuredSection = String(group?.section || '').trim().toUpperCase();
    if (structuredSection) return structuredSection;
    return this.extractBlockSlotFromName(group?.name)?.letter || '';
  }

  getSchoolYearFromStartYear(value) {
    const startYear = Number(value);
    return Number.isFinite(startYear) && startYear > 0 ? `${startYear}-${startYear + 1}` : '';
  }

  // GET /api/blocks/assignable-students?semester=1st&year=2026&q=juan
  async getAssignableStudents(req, res) {
    try {
      const { semester, year, q = '', limit = 200, groupId } = req.query;
      logger.debug('getAssignableStudents called with', req.query);
      if (!semester || !year) {
        return res.status(400).json({ error: 'semester and year are required' });
      }

      const assignedIds = await StudentBlockAssignment.find({
        semester,
        year: Number(year),
        status: { $in: ['ASSIGNED', 'WAITLISTED'] }
      }).distinct('studentId');
      logger.debug('assignedIds length:', assignedIds.length);

      const assignedObjectIds = assignedIds
        .filter((id) => mongoose.isValidObjectId(id))
        .map((id) => new mongoose.Types.ObjectId(id));
      logger.debug('assignedObjectIds length:', assignedObjectIds.length);

      const search = String(q).trim();
      const andConditions = [];

      if (assignedObjectIds.length > 0) {
        andConditions.push({ _id: { $nin: assignedObjectIds } });
      }

      if (search) {
        andConditions.push({
          $or: [
            { firstName: { $regex: search, $options: 'i' } },
            { middleName: { $regex: search, $options: 'i' } },
            { lastName: { $regex: search, $options: 'i' } },
            { studentNumber: { $regex: search, $options: 'i' } }
          ]
        });
      }

      if (groupId && mongoose.Types.ObjectId.isValid(groupId)) {
        const group = await BlockGroup.findById(groupId).select('name courseId yearLevel');
        const groupYearLevel = this.getGroupYearLevel(group);
        const groupCourse = this.getGroupCourseId(group);

        if (groupCourse) {
          andConditions.push({ $or: this.getCourseFilterConditions(groupCourse) });
        }

        if (groupYearLevel) {
          // Regular students must match year level.
          // Non-regular students are included for relearning/remedial assignment cases.
          andConditions.push({
            $or: [
              { yearLevel: groupYearLevel },
              { studentStatus: { $ne: 'Regular' } }
            ]
          });
        }
      }

      const query = andConditions.length > 0 ? { $and: andConditions } : {};
      logger.debug('query:', JSON.stringify(query));

      logger.debug('about to find students');
      const students = await Student.find(query)
        .select('_id studentNumber firstName middleName lastName suffix yearLevel studentStatus course')
        .sort({ lastName: 1, firstName: 1 })
        .limit(Math.min(Number(limit) || 200, 500))
        .lean();
      logger.debug('found students:', students.length);

      res.json(students);
    } catch (error) {
      console.error('Get assignable students error:', error);
      res.status(500).json({ error: 'Failed to fetch assignable students' });
    }
  }

  // POST /api/blocks/groups
  async createBlockGroup(req, res) {
    try {
      const { name, courseId, courseCode, yearLevel, schoolYear, section, semester, year, policies, curriculumId, studentClassification } = req.body;
      if (!name || !semester || !year) {
        return res.status(400).json({ error: 'name, semester, and year are required' });
      }

      // Validate curriculumId if provided
      let validatedCurriculumId = null;
      if (curriculumId && mongoose.Types.ObjectId.isValid(curriculumId)) {
        const curriculum = await Curriculum.findById(curriculumId).select('programCode status').lean();
        if (!curriculum) {
          return res.status(400).json({ error: 'Curriculum not found' });
        }
        const structuredCourseId = this.normalizeCourseCode(courseId) || this.normalizeCourseCode(courseCode) || this.extractCourseFromGroupName(this.buildCanonicalBlockCode(name));
        if (structuredCourseId && Number(curriculum.programCode) !== Number(structuredCourseId)) {
          return res.status(400).json({ error: 'Curriculum does not belong to the selected program' });
        }
        validatedCurriculumId = curriculumId;
      }

      const validClassifications = ['Regular', 'Irregular', 'Transferee', 'Returning', 'All'];
      const validatedClassification = validClassifications.includes(studentClassification) ? studentClassification : 'All';

      const normalizedSemester = String(semester).trim();
      const normalizedYear = Number(year);
      if (!Number.isFinite(normalizedYear)) {
        return res.status(400).json({ error: 'year must be a valid number' });
      }

      const canonicalName = this.buildCanonicalBlockCode(name);
      const incomingSlot = this.extractBlockSlotFromName(canonicalName);
      const structuredCourseId = this.normalizeCourseCode(courseId) || this.normalizeCourseCode(courseCode) || this.extractCourseFromGroupName(canonicalName);
      const structuredYearLevel = Number(yearLevel) || incomingSlot?.yearLevel || null;
      const structuredSection = String(section || incomingSlot?.letter || '').trim().toUpperCase();
      const structuredSchoolYear = String(schoolYear || this.getSchoolYearFromStartYear(normalizedYear)).trim();

      const sameTermGroups = await BlockGroup.find({
        semester: normalizedSemester,
        year: normalizedYear
      }).select('name courseId yearLevel section');

      const hasSemanticDuplicate = sameTermGroups.some((group) => {
        const existingCourse = this.getGroupCourseId(group);
        const existingYearLevel = this.getGroupYearLevel(group);
        const existingSection = this.getGroupSection(group);
        return (
          structuredCourseId &&
          structuredYearLevel &&
          structuredSection &&
          existingCourse === structuredCourseId &&
          existingYearLevel === structuredYearLevel &&
          existingSection === structuredSection
        );
      });

      if (hasSemanticDuplicate) {
        return res.status(409).json({ error: 'Block group already exists for this semester/year' });
      }

      const group = await BlockGroup.create({
        name: String(name).trim(),
        courseId: structuredCourseId || undefined,
        courseCode: courseCode || undefined,
        yearLevel: structuredYearLevel || undefined,
        semester: normalizedSemester,
        schoolYear: structuredSchoolYear || undefined,
        year: normalizedYear,
        section: structuredSection || undefined,
        curriculumId: validatedCurriculumId || undefined,
        studentClassification: validatedClassification,
        policies: {
          ...(policies || {})
        }
      });

      res.status(201).json(group);
    } catch (error) {
      if (error && error.code === 11000) {
        return res.status(409).json({ error: 'Block group already exists for this semester/year' });
      }
      console.error('Create block group error:', error);
      res.status(500).json({ error: 'Failed to create block group' });
    }
  }

  // PATCH /api/blocks/groups/:groupId
  async updateBlockGroup(req, res) {
    try {
      const { groupId } = req.params;

      let validatedGroupId;
      try {
        validatedGroupId = safeObjectId(groupId);
      } catch (error) {
        return res.status(400).json({ error: 'Invalid block group id' });
      }

      const group = await BlockGroup.findById(validatedGroupId);
      if (!group) {
        return res.status(404).json({ error: 'Block group not found' });
      }

      const { name, courseId, courseCode, yearLevel, schoolYear, section, semester, year, policies, curriculumId, studentClassification } = req.body;

      const nextCourseId = (courseId !== undefined || courseCode !== undefined)
        ? (this.normalizeCourseCode(courseId) || this.normalizeCourseCode(courseCode))
        : this.getGroupCourseId(group);
      const nextYearLevel = yearLevel !== undefined ? Number(yearLevel) : this.getGroupYearLevel(group);
      const nextSection = section !== undefined ? String(section).trim().toUpperCase() : this.getGroupSection(group);
      const nextSemester = semester !== undefined ? String(semester).trim() : group.semester;
      const nextYear = year !== undefined ? Number(year) : group.year;
      if (!Number.isFinite(nextYear)) {
        return res.status(400).json({ error: 'year must be a valid number' });
      }
      const nextSchoolYear = schoolYear !== undefined
        ? String(schoolYear).trim()
        : (year !== undefined ? this.getSchoolYearFromStartYear(nextYear) : group.schoolYear);

      const sameTermGroups = await BlockGroup.find({
        _id: { $ne: group._id },
        semester: nextSemester,
        year: nextYear
      }).select('name courseId yearLevel section');

      const hasSemanticDuplicate = sameTermGroups.some((other) => {
        const existingCourse = this.getGroupCourseId(other);
        const existingYearLevel = this.getGroupYearLevel(other);
        const existingSection = this.getGroupSection(other);
        return (
          nextCourseId &&
          nextYearLevel &&
          nextSection &&
          existingCourse === nextCourseId &&
          existingYearLevel === nextYearLevel &&
          existingSection === nextSection
        );
      });

      if (hasSemanticDuplicate) {
        return res.status(409).json({ error: 'Another block group already exists for this course/year/section in the selected term' });
      }

      if (name !== undefined) group.name = String(name).trim();
      if (nextCourseId) group.courseId = nextCourseId;
      if (courseCode !== undefined) group.courseCode = courseCode;
      if (nextYearLevel) group.yearLevel = nextYearLevel;
      group.semester = nextSemester;
      if (nextSchoolYear) group.schoolYear = nextSchoolYear;
      group.year = nextYear;
      if (nextSection) group.section = nextSection;
      if (policies) {
        group.policies = { ...(group.policies || {}), ...policies };
      }

      // Update curriculumId if provided
      let curriculumIdChanged = false;
      if (curriculumId !== undefined) {
        // Safety: prevent eligibility rule changes on groups with existing assignments
        if (String(group.curriculumId || '') !== String(curriculumId || '')) {
          curriculumIdChanged = true;
          const assignmentCount = await StudentBlockAssignment.countDocuments({
            sectionId: { $in: await BlockSection.find({ blockGroupId: group._id }).distinct('_id') },
            status: 'ASSIGNED',
          });

          if (assignmentCount > 0) {
            const activePeriod = await AcademicPeriod.findOne({ status: 'Active' }).lean();
            const groupSchoolYear = group.schoolYear || this.getSchoolYearFromStartYear(group.year);
            const isArchived = activePeriod && groupSchoolYear && activePeriod.schoolYear !== groupSchoolYear;

            if (isArchived) {
              return res.status(409).json({
                error: 'Cannot change curriculum for a block group in an archived school year with existing assignments. This would alter the historical meaning of those assignments.',
              });
            }

            // For active school years with assignments, allow but warn
            // The assignment will still be valid because eligibility is re-checked on new assignments
          }
        }

        if (curriculumId && mongoose.Types.ObjectId.isValid(curriculumId)) {
          const curriculum = await Curriculum.findById(curriculumId).select('programCode status').lean();
          if (!curriculum) {
            return res.status(400).json({ error: 'Curriculum not found' });
          }
          if (nextCourseId && Number(curriculum.programCode) !== Number(nextCourseId)) {
            return res.status(400).json({ error: 'Curriculum does not belong to the selected program' });
          }
          group.curriculumId = curriculumId;
        } else {
          group.curriculumId = null;
        }
      }

      // Update studentClassification if provided
      if (studentClassification !== undefined) {
        // Safety: prevent classification changes on archived school years with existing assignments
        if (String(group.studentClassification || 'All') !== String(studentClassification)) {
          const assignmentCount = await StudentBlockAssignment.countDocuments({
            sectionId: { $in: await BlockSection.find({ blockGroupId: group._id }).distinct('_id') },
            status: 'ASSIGNED',
          });

          if (assignmentCount > 0) {
            const activePeriod = await AcademicPeriod.findOne({ status: 'Active' }).lean();
            const groupSchoolYear = group.schoolYear || this.getSchoolYearFromStartYear(group.year);
            const isArchived = activePeriod && groupSchoolYear && activePeriod.schoolYear !== groupSchoolYear;

            if (isArchived) {
              return res.status(409).json({
                error: 'Cannot change student classification for a block group in an archived school year with existing assignments.',
              });
            }
          }
        }

        const validClassifications = ['Regular', 'Irregular', 'Transferee', 'Returning', 'All'];
        if (validClassifications.includes(studentClassification)) {
          group.studentClassification = studentClassification;
        }
      }

      await group.save();

      // If curriculumId was added or changed, auto-assign subjects to all
      // existing sections in the group. This keeps existing blocks in sync
      // when a curriculum is linked after the block was already created.
      let autoAssignResult = null;
      if (curriculumIdChanged && group.curriculumId) {
        try {
          const existingSections = await BlockSection.find({ blockGroupId: group._id }).lean();
          if (existingSections.length > 0) {
            autoAssignResult = await autoAssignSubjectsFromCurriculum(
              group,
              existingSections,
              req.adminId
            );
          }
        } catch (autoAssignError) {
          logger.error('Auto-assign failed during block group update:', autoAssignError);
          // Don't fail the update — the group is saved, registrar can sync manually
        }
      }

      res.json({
        ...group.toObject(),
        autoAssign: autoAssignResult,
      });
    } catch (error) {
      if (error && error.code === 11000) {
        return res.status(409).json({ error: 'Block group already exists for this semester/year' });
      }
      console.error('Update block group error:', error);
      res.status(500).json({ error: 'Failed to update block group' });
    }
  }

  // POST /api/blocks/groups/:groupId/sections
  async createSectionInGroup(req, res) {
    try {
      const { groupId } = req.params;
      const { sectionCode, capacity, schedule } = req.body;

      if (!sectionCode || !capacity) {
        return res.status(400).json({ error: 'sectionCode and capacity are required' });
      }

      const group = await BlockGroup.findById(groupId);
      if (!group) {
        return res.status(404).json({ error: 'Block group not found' });
      }

      const canonicalSectionCode = this.buildCanonicalBlockCode(sectionCode);
      const existingSections = await BlockSection.find({ blockGroupId: groupId }).select('sectionCode').lean();
      const duplicateSection = existingSections.some((section) =>
        this.buildCanonicalBlockCode(section.sectionCode) === canonicalSectionCode
      );
      if (duplicateSection) {
        return res.status(409).json({ error: 'Section code already exists in this group' });
      }

      const section = await BlockSection.create({
        blockGroupId: groupId,
        sectionCode: canonicalSectionCode || String(sectionCode).trim(),
        capacity: Number(capacity),
        schedule: schedule ? String(schedule).trim() : ''
      });

      // Auto-assign curriculum subjects to the new section if the block group
      // has a linked curriculum. This is the core of curriculum-driven block
      // assignment: every new section automatically receives the required
      // subjects from the block's curriculum for its yearLevel + semester.
      let autoAssignResult = null;
      if (group.curriculumId) {
        try {
          autoAssignResult = await autoAssignSubjectsFromCurriculum(
            group,
            [section],
            req.adminId
          );
        } catch (autoAssignError) {
          logger.error('Auto-assign failed during section creation:', autoAssignError);
          // Don't fail the section creation — the section exists and the
          // registrar can click "Sync from Curriculum" to retry.
        }
      }

      res.status(201).json({
        ...section.toObject(),
        autoAssign: autoAssignResult,
      });
    } catch (error) {
      if (error && error.code === 11000) {
        return res.status(409).json({ error: 'Section code already exists in this group' });
      }
      console.error('Create section error:', error);
      res.status(500).json({ error: 'Failed to create section' });
    }
  }

  // POST /api/blocks/groups/:groupId/sync-subjects
  async syncSubjectsFromCurriculum(req, res) {
    try {
      const { groupId } = req.params;
      const { sectionIds, includeElectives } = req.body || {};

      const group = await BlockGroup.findById(groupId);
      if (!group) {
        return res.status(404).json({ error: 'Block group not found' });
      }

      if (!group.curriculumId) {
        return res.status(400).json({
          error: 'This block group has no linked curriculum. Assign a curriculum first, then sync.'
        });
      }

      // Get sections — either filtered by sectionIds or all in the group
      let sections;
      if (sectionIds && Array.isArray(sectionIds) && sectionIds.length > 0) {
        sections = await BlockSection.find({
          _id: { $in: sectionIds.map((id) => safeObjectId(id)) },
          blockGroupId: groupId,
        }).lean();
      } else {
        sections = await BlockSection.find({ blockGroupId: groupId }).lean();
      }

      const result = await autoAssignSubjectsFromCurriculum(
        group,
        sections,
        req.adminId,
        { includeElectives: Boolean(includeElectives) }
      );

      res.json({
        success: true,
        summary: result,
      });
    } catch (error) {
      console.error('Sync subjects from curriculum error:', error);
      res.status(500).json({ error: 'Failed to sync subjects from curriculum' });
    }
  }

  // PATCH /api/blocks/sections/:sectionId
  async updateSection(req, res) {
    try {
      const { sectionId } = req.params;

      let validatedSectionId;
      try {
        validatedSectionId = safeObjectId(sectionId);
      } catch (error) {
        return res.status(400).json({ error: 'Invalid section id' });
      }

      const section = await BlockSection.findById(validatedSectionId);
      if (!section) {
        return res.status(404).json({ error: 'Section not found' });
      }

      const { sectionCode, capacity, schedule } = req.body;

      if (capacity !== undefined) {
        const nextCapacity = Number(capacity);
        if (!Number.isFinite(nextCapacity) || nextCapacity < 1) {
          return res.status(400).json({ error: 'capacity must be a positive number' });
        }
        if (nextCapacity < section.currentPopulation) {
          return res.status(400).json({ error: `capacity cannot be lower than the current population (${section.currentPopulation})` });
        }
        section.capacity = nextCapacity;
      }

      if (sectionCode !== undefined) {
        const canonicalSectionCode = this.buildCanonicalBlockCode(sectionCode) || String(sectionCode).trim();
        const siblingSections = await BlockSection.find({
          blockGroupId: section.blockGroupId,
          _id: { $ne: section._id }
        }).select('sectionCode').lean();
        const duplicateSection = siblingSections.some((sibling) =>
          this.buildCanonicalBlockCode(sibling.sectionCode) === canonicalSectionCode
        );
        if (duplicateSection) {
          return res.status(409).json({ error: 'Section code already exists in this group' });
        }
        section.sectionCode = canonicalSectionCode;
      }

      if (schedule !== undefined) {
        section.schedule = String(schedule).trim();
      }

      await section.save();
      res.json(section);
    } catch (error) {
      if (error && error.code === 11000) {
        return res.status(409).json({ error: 'Section code already exists in this group' });
      }
      console.error('Update section error:', error);
      res.status(500).json({ error: 'Failed to update section' });
    }
  }

  // DELETE /api/blocks/sections/:sectionId
  async deleteSection(req, res) {
    try {
      const { sectionId } = req.params;

      let validatedSectionId;
      try {
        validatedSectionId = safeObjectId(sectionId);
      } catch (error) {
        return res.status(400).json({ error: 'Invalid section id' });
      }

      const section = await BlockSection.findById(validatedSectionId);
      if (!section) {
        return res.status(404).json({ error: 'Section not found' });
      }

      const assignedCount = await StudentBlockAssignment.countDocuments({
        sectionId: section._id,
        status: { $in: ['ASSIGNED', 'WAITLISTED'] }
      });
      const waitlistCount = await SectionWaitlist.countDocuments({ sectionId: section._id });

      if (assignedCount > 0 || waitlistCount > 0) {
        return res.status(409).json({
          error: `Cannot delete section. It still has ${assignedCount} assigned/waitlisted and ${waitlistCount} waitlisted record(s).`
        });
      }

      await BlockSection.deleteOne({ _id: section._id });
      res.json({ message: 'Section deleted successfully' });
    } catch (error) {
      console.error('Delete section error:', error);
      res.status(500).json({ error: 'Failed to delete section' });
    }
  }

  // DELETE /api/blocks/groups/:groupId
  async deleteBlockGroup(req, res) {
    try {
      const { groupId } = req.params;
      
      // Validate ObjectId safely
      let validatedGroupId;
      try {
        validatedGroupId = safeObjectId(groupId);
      } catch (error) {
        return res.status(400).json({ error: 'Invalid block group id' });
      }

      const group = await BlockGroup.findById(validatedGroupId);
      if (!group) {
        return res.status(404).json({ error: 'Block group not found' });
      }

      const sections = await BlockSection.find({ blockGroupId: validatedGroupId }).select('_id currentPopulation sectionCode');
      const sectionIds = sections.map((s) => s._id);

      if (sectionIds.length > 0) {
        const assignments = await StudentBlockAssignment.find({
          sectionId: { $in: sectionIds },
          status: { $in: ['ASSIGNED', 'WAITLISTED'] }
        }).select('_id studentId sectionId status');
        const waitlistEntries = await SectionWaitlist.find({
          sectionId: { $in: sectionIds }
        }).select('_id studentId sectionId');
        const loggedStudentIds = await BlockActionLog.distinct('studentId', {
          sectionId: { $in: sectionIds }
        });

        const studentIdSet = new Set([
          ...[...assignments, ...waitlistEntries]
            .map((entry) => String(entry.studentId || '').trim())
            .filter(Boolean),
          ...loggedStudentIds
            .map((studentId) => String(studentId || '').trim())
            .filter(Boolean)
        ]);

        const validStudentIds = Array.from(studentIdSet).filter((studentId) =>
          mongoose.Types.ObjectId.isValid(studentId)
        );
        const existingStudents = await Student.find({ _id: { $in: validStudentIds } }).select('_id').lean();
        const existingStudentIdSet = new Set(existingStudents.map((student) => String(student._id)));

        const orphanAssignmentIds = assignments
          .filter((entry) => !existingStudentIdSet.has(String(entry.studentId || '').trim()))
          .map((entry) => entry._id);
        const orphanWaitlistIds = waitlistEntries
          .filter((entry) => !existingStudentIdSet.has(String(entry.studentId || '').trim()))
          .map((entry) => entry._id);

        if (orphanAssignmentIds.length > 0) {
          await StudentBlockAssignment.deleteMany({ _id: { $in: orphanAssignmentIds } });
        }
        if (orphanWaitlistIds.length > 0) {
          await SectionWaitlist.deleteMany({ _id: { $in: orphanWaitlistIds } });
        }

        const assignedCount = await StudentBlockAssignment.countDocuments({
          sectionId: { $in: sectionIds },
          status: { $in: ['ASSIGNED', 'WAITLISTED'] }
        });
        const waitlistCount = await SectionWaitlist.countDocuments({ sectionId: { $in: sectionIds } });

        if (assignedCount > 0 || waitlistCount > 0) {
          return res.status(409).json({
            error: `Cannot delete block. It still has ${assignedCount} assigned/waitlisted and ${waitlistCount} waitlisted record(s).`
          });
        }

        const schoolYear = this.formatSchoolYearFromStartYear(group.year);
        const stillAssignedStudentIds = validStudentIds.length > 0
          ? await StudentBlockAssignment.find({
              studentId: { $in: validStudentIds },
              status: 'ASSIGNED',
              ...(group.semester ? { semester: group.semester } : {}),
              ...(Number.isFinite(Number(group.year)) ? { year: Number(group.year) } : {})
            }).distinct('studentId')
          : [];
        const stillAssignedStudentIdSet = new Set(
          stillAssignedStudentIds.map((studentId) => String(studentId || '').trim()).filter(Boolean)
        );
        const studentIdsToCleanup = validStudentIds.filter((studentId) => !stillAssignedStudentIdSet.has(studentId));

        if (studentIdsToCleanup.length > 0) {
          await this.clearEnrollmentSubjectAssignmentsForStudents({
            studentIds: studentIdsToCleanup,
            semester: group.semester,
            schoolYear
          });
        }

        // Keep counters consistent when no active records remain.
        if (sections.some((s) => Number(s.currentPopulation) > 0)) {
          await BlockSection.updateMany(
            { _id: { $in: sectionIds } },
            { $set: { currentPopulation: 0 } }
          );
        }

        await BlockSection.deleteMany({ blockGroupId: validatedGroupId });
      }

      await BlockGroup.findByIdAndDelete(validatedGroupId);
      res.json({ message: 'Block group deleted successfully' });
    } catch (error) {
      console.error('Delete block group error:', error);
      res.status(500).json({ error: 'Failed to delete block group' });
    }
  }

  // GET /api/blocks/eligible
  async getEligibleBlocks(req, res) {
    try {
      const { studentId } = req.query;
      if (!studentId || !mongoose.Types.ObjectId.isValid(studentId)) {
        return res.status(400).json({ success: false, error: 'Valid studentId is required' });
      }

      const result = await blockEligibilityService.getEligibleBlocks(studentId);
      res.json({ success: true, data: result });
    } catch (error) {
      console.error('Get eligible blocks error:', error);
      res.status(500).json({ success: false, error: error.message || 'Failed to fetch eligible blocks' });
    }
  }

  // POST /api/blocks/eligible/bulk
  async getBulkEligibility(req, res) {
    try {
      const { studentIds, sectionId } = req.body;
      if (!Array.isArray(studentIds) || !studentIds.length) {
        return res.status(400).json({ success: false, error: 'studentIds must be a non-empty array' });
      }
      if (!sectionId || !mongoose.Types.ObjectId.isValid(sectionId)) {
        return res.status(400).json({ success: false, error: 'Valid sectionId is required' });
      }

      const result = await blockEligibilityService.getBulkEligibility(studentIds, sectionId);
      res.json({ success: true, data: result });
    } catch (error) {
      console.error('Get bulk eligibility error:', error);
      res.status(500).json({ success: false, error: error.message || 'Failed to evaluate bulk eligibility' });
    }
  }

  /**
   * Auto-create a minimal enrollment when a student is assigned to a block
   * but has no existing enrollment for that academic period.
   *
   * Subjects are auto-populated from the block group's curriculum (if configured)
   * matching the student's year level and the block's semester. If no curriculum
   * is configured, an empty-subjects enrollment is created — subjects can be
   * assigned later via the block subject auto-assign flow.
   *
   * The enrollment is created with status 'Pending' and isCurrent=true so that
   * subsequent eligibility checks within the same transaction will find it.
   */
  async createEnrollmentForBlockAssignment({ student, group, section, schoolYear, semester, createdBy, session }) {
    if (!schoolYear || !semester) {
      throw new Error('Block group is missing schoolYear or semester — cannot auto-create enrollment.');
    }

    const yearLevel = Number(group.yearLevel) || Number(student.yearLevel) || 1;
    const enrollmentCourseMap = { 101: 'BEED', 102: 'BSED', 103: 'BSED', 201: 'BSBA' };
    const course = enrollmentCourseMap[Number(student.course)] || 'BEED';

    // Resolve curriculum — prefer the block group's curriculumId, then student's version
    let curriculumId = group.curriculumId || null;
    if (!curriculumId && student.curriculumVersion) {
      const matched = await Curriculum.findOne({
        programCode: Number(student.course),
        version: String(student.curriculumVersion).trim(),
      }).select('_id').lean().session(session);
      if (matched) curriculumId = matched._id;
    }
    if (!curriculumId) {
      const active = await Curriculum.findOne({
        programCode: Number(student.course),
        status: 'Active',
      }).select('_id').lean().session(session);
      if (active) curriculumId = active._id;
    }

    // Auto-populate subjects from curriculum
    let subjects = [];
    if (curriculumId) {
      const curriculumSubjects = await CurriculumSubject.find({
        curriculumId,
        yearLevel,
        semester,
      }).select('subjectId').lean().session(session);

      const subjectIds = curriculumSubjects.map((cs) => cs.subjectId).filter(Boolean);
      if (subjectIds.length > 0) {
        const subjectDocs = await Subject.find({ _id: { $in: subjectIds } })
          .select('_id code title units')
          .lean().session(session);
        const subjectById = new Map(subjectDocs.map((s) => [String(s._id), s]));
        subjects = subjectIds.map((subjectId) => {
          const doc = subjectById.get(String(subjectId));
          return {
            subjectId,
            code: doc?.code || 'TBA',
            title: doc?.title || 'Untitled Subject',
            units: doc?.units || 3,
            schedule: 'TBA',
            room: 'TBA',
            instructor: 'TBA',
            status: 'Enrolled',
          };
        });
      }
    }

    const totalUnits = subjects.reduce((sum, s) => sum + (Number(s.units) || 0), 0);
    const tuitionFee = totalUnits * 1000;
    const miscFee = 5000;

    // Mark any existing current enrollments for this student as not current
    await Enrollment.updateMany(
      { studentId: student._id, isCurrent: true },
      { $set: { isCurrent: false } },
      { session }
    );

    // createdBy must be a valid ObjectId or omitted entirely
    const enrollmentData = {
      studentId: student._id,
      studentNumber: student.studentNumber,
      schoolYear,
      semester,
      yearLevel,
      course,
      curriculumId,
      subjects,
      assessment: {
        tuitionFee,
        miscFee,
        totalAmount: tuitionFee + miscFee,
      },
      status: 'Pending',
      isCurrent: true,
    };
    if (createdBy && mongoose.Types.ObjectId.isValid(String(createdBy))) {
      enrollmentData.createdBy = String(createdBy);
    }

    const [enrollment] = await Enrollment.create([enrollmentData], { session });

    return enrollment;
  }

  // POST /api/blocks/assign-student
  async assignStudent(req, res) {
    const { studentId, sectionId, semester, year } = req.body;

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      // Get section
      const section = await BlockSection.findById(sectionId).session(session);
      if (!section || section.status !== 'OPEN') {
        await session.abortTransaction();
        return res.status(400).json({ error: 'Section not found or not open' });
      }

      const group = await BlockGroup.findById(section.blockGroupId).session(session);
      const student = await Student.findById(studentId)
        .select('studentNumber yearLevel studentStatus course firstName lastName classification curriculumVersion schoolYear semester')
        .session(session);
      if (!student) {
        await session.abortTransaction();
        return res.status(404).json({ error: 'Student not found' });
      }

      // Find the active enrollment for this student.
      // Use the block group's academic context (schoolYear, semester) as the primary lookup
      // since the student is being assigned to this specific block's term.
      const blockSchoolYear = group.schoolYear || this.getSchoolYearFromStartYear(group.year);
      const blockSemester = semester || group.semester;

      let enrollment = await blockEligibilityService.findActiveEnrollment(
        studentId,
        blockSchoolYear || student.schoolYear,
        blockSemester || student.semester
      );

      // Auto-create a minimal enrollment if none exists.
      // This is the correct flow: assigning a student to a block IS the enrollment step.
      // The enrollment is created with curriculum subjects auto-populated from the block's curriculum.
      if (!enrollment) {
        try {
          enrollment = await this.createEnrollmentForBlockAssignment({
            student,
            group,
            section,
            schoolYear: blockSchoolYear,
            semester: blockSemester,
            createdBy: req.adminId,
            session
          });
        } catch (createErr) {
          await session.abortTransaction();
          return res.status(400).json({
            error: 'No active enrollment found and could not create one automatically.',
            reasons: [createErr.message || 'Failed to auto-create enrollment. Please enroll the student first.'],
            checks: { enrollmentStatus: false }
          });
        }
      }

      // Determine schoolYear for the assignment
      const assignmentSchoolYear = (enrollment && enrollment.schoolYear) || student.schoolYear ||
        blockSchoolYear;

      // Check existing assignment using schoolYear + semester
      const existing = await StudentBlockAssignment.findOne({
        $or: [
          { enrollmentId: enrollment ? enrollment._id : null },
          { studentId, schoolYear: assignmentSchoolYear, semester },
        ].filter((c) => c.enrollmentId || (c.studentId && c.schoolYear)),
        status: 'ASSIGNED',
      }).session(session);

      // Load curriculum doc for the block group if configured
      let curriculumDoc = null;
      if (group.curriculumId) {
        curriculumDoc = await Curriculum.findById(group.curriculumId).select('version programCode programName status').lean().session(session);
      }

      // Load active academic period
      const activePeriod = await AcademicPeriod.findOne({ status: 'Active' }).lean().session(session);

      // Server-side eligibility revalidation — never trust frontend
      const eligibility = blockEligibilityService.evaluateStudentEligibility(
        enrollment,
        student.toObject(),
        group.toObject(),
        section.toObject(),
        existing && String(existing.sectionId) === String(section._id) ? null : existing,
        curriculumDoc,
        activePeriod,
        { allowAutoEnroll: true }
      );

      if (!eligibility.eligible) {
        await session.abortTransaction();
        return res.status(400).json({
          error: 'Student is not eligible for this block',
          reasons: eligibility.reasons,
          checks: eligibility.checks
        });
      }

      // Re-check capacity atomically (race condition protection)
      const updatedSection = await BlockSection.findOneAndUpdate(
        { _id: sectionId, currentPopulation: { $lt: section.capacity } },
        { $inc: { currentPopulation: 1 } },
        { session, new: true }
      );

      if (!updatedSection) {
        await session.abortTransaction();
        return res.status(400).json({
          error: 'Block section is now full. Please refresh and try again.',
          reasons: ['Block section is full.'],
        });
      }

      // Create assignment with schoolYear and enrollmentId
      const assignment = await StudentBlockAssignment.create([{
        studentId,
        enrollmentId: enrollment ? enrollment._id : null,
        sectionId,
        semester,
        year,
        schoolYear: assignmentSchoolYear,
        assignedAt: new Date()
      }], { session });

      const studentName = `${student.firstName || ''} ${student.lastName || ''}`.trim() || 'Unknown';
      await BlockActionLog.create([{
        actionType: 'ASSIGN',
        sectionId,
        sectionCode: section.sectionCode,
        blockGroupName: group ? group.name : '',
        studentId,
        studentName,
        registrarId: req.registrarId || req.adminId,
        timestamp: new Date(),
        details: {
          semester: semester || undefined,
          year: Number.isFinite(year) ? year : undefined,
          schoolYear: assignmentSchoolYear || undefined,
          blockGroupId: section.blockGroupId ? String(section.blockGroupId) : undefined,
          blockSectionId: String(sectionId),
        }
      }], { session });

      await session.commitTransaction();
      return res.json({ status: 'ASSIGNED', assignmentId: assignment[0]._id });
    } catch (error) {
      await session.abortTransaction();
      console.error('Assign student error:', error);
      res.status(500).json({ error: 'Failed to assign student' });
    } finally {
      session.endSession();
    }
  }

  // POST /api/blocks/overcapacity/decision
  async handleOvercapacityDecision(req, res) {
    const { action, reason, studentId, sectionId, semester, year, ...params } = req.body;

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const section = await BlockSection.findById(sectionId).session(session);
      const group = await BlockGroup.findById(section.blockGroupId).session(session);
      const student = studentId ? await Student.findById(studentId).select('firstName lastName').session(session) : null;

      // Re-check capacity
      if (section.currentPopulation + 1 > section.capacity + group.policies.maxOvercap && action !== 'WAITLIST') {
        await session.abortTransaction();
        return res.status(409).json({ error: 'Capacity exceeded, cannot proceed' });
      }

      let result;
      switch (action) {
        case 'OVERRIDE':
          result = await this.overrideAssign(studentId, sectionId, semester, year, reason, session);
          break;
        case 'WAITLIST':
          result = await this.addToWaitlist(studentId, sectionId, reason, session);
          break;
        case 'TRANSFER':
          result = await this.transferStudent(studentId, sectionId, params.targetSectionId, reason, semester, year, session);
          break;
        case 'INCREASE_CAPACITY':
          await this.increaseCapacity(sectionId, params.newCapacity, reason, session);
          result = await this.overrideAssign(studentId, sectionId, semester, year, reason, session);
          break;
        case 'AUTO_CREATE_SECTION':
          result = await this.autoCreateSection(group._id, section.sectionCode, params.copySchedule, params.moveOverflow, session);
          const newAssign = await this.assignToNewSection(studentId, result.newSectionId, semester, year, session);
          result = { ...result, ...newAssign };
          break;
        case 'REBALANCE':
          result = await this.rebalanceSections(group._id, params.strategy, session);
          break;
        case 'CLOSE_SECTION':
          result = await this.closeSection(sectionId, reason, session);
          break;
        default:
          await session.abortTransaction();
          return res.status(400).json({ error: 'Invalid action' });
      }

      const studentName = student ? `${student.firstName || ''} ${student.lastName || ''}`.trim() : 'Unknown';
      // transferStudent now creates its own UNASSIGN + TRANSFER log entries
      // with proper historical snapshots of both source and target sections.
      // Skip the duplicate caller log for TRANSFER actions.
      if (action !== 'TRANSFER') {
        await BlockActionLog.create([{
          actionType: action,
          sectionId,
          sectionCode: section.sectionCode,
          blockGroupName: group ? group.name : '',
          studentId,
          studentName,
          registrarId: req.registrarId || req.adminId,
          reason,
          timestamp: new Date(),
          details: {
            ...params,
            semester: semester || undefined,
            year: Number.isFinite(year) ? year : undefined,
            blockGroupId: section.blockGroupId ? String(section.blockGroupId) : undefined,
            blockSectionId: String(sectionId),
          }
        }], { session });
      }
      await session.commitTransaction();
      res.json({ status: 'SUCCESS', ...result });
    } catch (error) {
      await session.abortTransaction();
      console.error('Overcapacity decision error:', error);
      res.status(500).json({ error: 'Failed to process decision' });
    } finally {
      session.endSession();
    }
  }

  // GET /api/blocks/suggested-sections
  async getSuggestedSections(req, res) {
    try {
      const { sectionId, limit = 5 } = req.query;
      const suggested = await this.getSuggestedSections(sectionId);
      res.json(suggested.slice(0, limit));
    } catch (error) {
      console.error('Get suggested sections error:', error);
      res.status(500).json({ error: 'Failed to get suggested sections' });
    }
  }

  // POST /api/blocks/rebalance
  async rebalanceSections(req, res) {
    const { blockGroupId, strategy } = req.body;

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const group = await BlockGroup.findById(blockGroupId).session(session);
      if (!group) {
        await session.abortTransaction();
        return res.status(404).json({ error: 'Block group not found' });
      }

      const sections = await BlockSection.find({ blockGroupId, status: 'OPEN' }).session(session);
      if (sections.length < 2) {
        await session.abortTransaction();
        return res.status(400).json({ error: 'Not enough sections to rebalance' });
      }

      // Calculate new populations based on strategy
      const totalStudents = sections.reduce((sum, s) => sum + s.currentPopulation, 0);
      let newPopulations;

      switch (strategy) {
        case 'equal_population':
          const base = Math.floor(totalStudents / sections.length);
          const remainder = totalStudents % sections.length;
          newPopulations = sections.map((_, i) => base + (i < remainder ? 1 : 0));
          break;
        // Add other strategies if needed
        default:
          await session.abortTransaction();
          return res.status(400).json({ error: 'Invalid strategy' });
      }

      // Preview (for now, just return preview)
      const preview = {
        sections: sections.map((s, i) => ({
          id: s._id,
          code: s.sectionCode,
          newPopulation: newPopulations[i]
        }))
      };

      // In a real implementation, you'd apply the changes here
      // For now, just log and return preview
      await BlockActionLog.create([{ actionType: 'REBALANCE', sectionId: null, studentId: null, registrarId: req.registrarId || req.adminId, reason: `Rebalance ${strategy}`, timestamp: new Date(), details: { blockGroupId, strategy, preview } }], { session });

      await session.commitTransaction();
      res.json({ status: 'SUCCESS', preview });
    } catch (error) {
      await session.abortTransaction();
      console.error('Rebalance error:', error);
      res.status(500).json({ error: 'Failed to rebalance' });
    } finally {
      session.endSession();
    }
  }

  // Helper methods
  async getSuggestedSections(sectionId) {
    const section = await BlockSection.findById(sectionId);
    const group = await BlockGroup.findById(section.blockGroupId);
    const sections = await BlockSection.find({ blockGroupId: group._id, status: 'OPEN', _id: { $ne: sectionId } });
    return sections
      .filter(s => s.currentPopulation < s.capacity)
      .map(s => ({
        id: s._id,
        code: s.sectionCode,
        availableSlots: s.capacity - s.currentPopulation,
        schedule: s.schedule
      }))
      .sort((a, b) => b.availableSlots - a.availableSlots);
  }

  determineAllowedActions(policies) {
    const actions = ['OVERRIDE', 'WAITLIST', 'TRANSFER'];
    if (policies.allowCapacityIncrease) actions.push('INCREASE_CAPACITY');
    if (policies.allowAutoSectionCreation) actions.push('AUTO_CREATE_SECTION');
    actions.push('REBALANCE', 'CLOSE_SECTION');
    return actions;
  }

  async overrideAssign(studentId, sectionId, semester, year, reason, session) {
    const assignment = await StudentBlockAssignment.create([{ studentId, sectionId, semester, year, assignedAt: new Date() }], { session });
    await BlockSection.findByIdAndUpdate(sectionId, { $inc: { currentPopulation: 1 } }, { session });
    return { assignmentId: assignment[0]._id };
  }

  async addToWaitlist(studentId, sectionId, reason, session) {
    const waitlist = await SectionWaitlist.create([{ studentId, sectionId, reason }], { session });
    return { waitlistId: waitlist[0]._id };
  }

  async transferStudent(studentId, originalSectionId, targetSectionId, reason, semester, year, session) {
    // Capture historical snapshots BEFORE any deletion — audit logs are
    // immutable historical records and must not depend on post-deletion state.
    const originalSection = await BlockSection.findById(originalSectionId)
      .select('_id sectionCode blockGroupId')
      .session(session);
    const targetSection = await BlockSection.findById(targetSectionId)
      .select('_id sectionCode blockGroupId')
      .session(session);

    const originalGroup = originalSection?.blockGroupId
      ? await BlockGroup.findById(originalSection.blockGroupId).select('name').session(session)
      : null;
    const targetGroup = targetSection?.blockGroupId
      ? await BlockGroup.findById(targetSection.blockGroupId).select('name').session(session)
      : null;

    const student = await Student.findById(studentId)
      .select('firstName lastName')
      .session(session);
    const studentName = student ? `${student.firstName || ''} ${student.lastName || ''}`.trim() : 'Unknown';

    // Remove from original
    await StudentBlockAssignment.deleteOne({ studentId, semester, year }).session(session);
    await BlockSection.findByIdAndUpdate(originalSectionId, { $inc: { currentPopulation: -1 } }, { session });

    // Add to target
    const assignment = await StudentBlockAssignment.create([{ studentId, sectionId: targetSectionId, semester, year, assignedAt: new Date() }], { session });
    await BlockSection.findByIdAndUpdate(targetSectionId, { $inc: { currentPopulation: 1 } }, { session });

    // Create audit entries for BOTH the removal from the original section
    // and the assignment to the target section. Both preserve the historical
    // block/section identity captured before any deletion occurred.
    const schoolYear = year ? `${year}-${Number(year) + 1}` : undefined;
    await BlockActionLog.create([{
      actionType: 'UNASSIGN',
      sectionId: originalSectionId,
      sectionCode: originalSection?.sectionCode || '',
      blockGroupName: originalGroup?.name || '',
      studentId,
      studentName,
      registrarId: 'system',
      reason: reason || 'Transfer to another section',
      timestamp: new Date(),
      details: {
        semester: semester || undefined,
        year: Number.isFinite(year) ? year : undefined,
        schoolYear,
        blockGroupId: originalSection?.blockGroupId ? String(originalSection.blockGroupId) : undefined,
        blockSectionId: String(originalSectionId),
        transferTargetSectionId: String(targetSectionId),
        transferTargetSectionCode: targetSection?.sectionCode || undefined,
      }
    }], { session });

    await BlockActionLog.create([{
      actionType: 'TRANSFER',
      sectionId: targetSectionId,
      sectionCode: targetSection?.sectionCode || '',
      blockGroupName: targetGroup?.name || '',
      studentId,
      studentName,
      registrarId: 'system',
      reason: reason || 'Transfer from another section',
      timestamp: new Date(),
      details: {
        semester: semester || undefined,
        year: Number.isFinite(year) ? year : undefined,
        schoolYear,
        blockGroupId: targetSection?.blockGroupId ? String(targetSection.blockGroupId) : undefined,
        blockSectionId: String(targetSectionId),
        transferSourceSectionId: String(originalSectionId),
        transferSourceSectionCode: originalSection?.sectionCode || undefined,
      }
    }], { session });

    return { assignmentId: assignment[0]._id };
  }

  async increaseCapacity(sectionId, newCapacity, reason, session) {
    await BlockSection.findByIdAndUpdate(sectionId, { capacity: newCapacity }, { session });
    return { newCapacity };
  }

  async autoCreateSection(groupId, baseCode, copySchedule, moveOverflow, session) {
    // Generate new section code (simple increment)
    const match = baseCode.match(/^(.+)-(\d+)([A-Z])$/);
    if (!match) throw new Error('Invalid section code format');
    const prefix = match[1];
    const num = match[2];
    let letter = match[3];
    letter = String.fromCharCode(letter.charCodeAt(0) + 1); // Next letter
    const newCode = `${prefix}-${num}${letter}`;

    const newSection = await BlockSection.create([{
      blockGroupId: groupId,
      sectionCode: newCode,
      capacity: 30, // Default
      schedule: copySchedule ? baseCode : ''
    }], { session });

    // Move overflow if requested (not implemented yet)
    return { newSectionId: newSection[0]._id, newCode };
  }

  async assignToNewSection(studentId, sectionId, semester, year, session) {
    const assignment = await StudentBlockAssignment.create([{ studentId, sectionId, semester, year, assignedAt: new Date() }], { session });
    await BlockSection.findByIdAndUpdate(sectionId, { $inc: { currentPopulation: 1 } }, { session });
    return { assignmentId: assignment[0]._id };
  }

  async closeSection(sectionId, reason, session) {
    await BlockSection.findByIdAndUpdate(safeObjectId(sectionId), { status: 'CLOSED' }, { session });
    return {};
  }

  async rebalanceSections(groupId, strategy, session) {
    // Simplified: just return preview
    const sections = await BlockSection.find({ blockGroupId: groupId, status: 'OPEN' }).session(session);
    const preview = { sections: sections.map(s => ({ id: s._id, newPopulation: s.currentPopulation })) };
    return { preview };
  }

  // GET /api/blocks/groups - list all block groups
  async getBlockGroups(req, res) {
    try {
      const groups = await BlockGroup.find().sort({ name: 1 });
      res.json(groups);
    } catch (error) {
      console.error('Get block groups error:', error);
      res.status(500).json({ error: 'Failed to get block groups' });
    }
  }

  // GET /api/blocks/groups/:groupId/sections - list sections in a group
  async getSectionsInGroup(req, res) {
    try {
      const { groupId } = req.params;
      const sections = await BlockSection.find({ blockGroupId: groupId }).sort({ sectionCode: 1 });
      res.json(sections);
    } catch (error) {
      console.error('Get sections error:', error);
      res.status(500).json({ error: 'Failed to get sections' });
    }
  }

  // PATCH /api/blocks/sections/:sectionId/adviser - set section class adviser
  async updateSectionAdviser(req, res) {
    try {
      const { sectionId } = req.params;
      if (!mongoose.Types.ObjectId.isValid(sectionId)) {
        return res.status(400).json({ error: 'Invalid section id' });
      }

      const normalizedAdviser = String(req.body?.classAdviser || '').trim();
      if (!normalizedAdviser) {
        return res.status(400).json({ error: 'classAdviser is required' });
      }

      const updatedSection = await BlockSection.findByIdAndUpdate(
        sectionId,
        { $set: { classAdviser: normalizedAdviser } },
        { new: true }
      ).select('_id sectionCode capacity currentPopulation status blockGroupId classAdviser');

      if (!updatedSection) {
        return res.status(404).json({ error: 'Section not found' });
      }

      res.json({
        success: true,
        message: 'Section class adviser updated successfully',
        section: updatedSection
      });
    } catch (error) {
      console.error('Update section adviser error:', error);
      res.status(500).json({ error: 'Failed to update section adviser' });
    }
  }

  // GET /api/blocks/sections/:sectionId/students - list students assigned (including legacy waitlist records) to a section
  async getSectionStudents(req, res) {
    try {
      const { sectionId } = req.params;
      if (!mongoose.Types.ObjectId.isValid(sectionId)) {
        return res.status(400).json({ error: 'Invalid section id' });
      }

      const section = await BlockSection.findById(sectionId).select('_id sectionCode capacity currentPopulation status blockGroupId classAdviser');
      if (!section) {
        return res.status(404).json({ error: 'Section not found' });
      }

      const assignmentStatuses = ['ASSIGNED', 'WAITLISTED'];
      const assignments = await StudentBlockAssignment.find({
        sectionId: section._id,
        status: { $in: assignmentStatuses }
      })
        .select('_id studentId status assignedAt')
        .sort({ assignedAt: 1 });

      const studentIds = assignments
        .map((assignment) => String(assignment.studentId || '').trim())
        .filter(Boolean);

      const validStudentIds = studentIds.filter((studentId) =>
        mongoose.Types.ObjectId.isValid(studentId)
      );
      const students = validStudentIds.length > 0
        ? await Student.find({ _id: { $in: validStudentIds } })
        .select('_id studentNumber firstName middleName lastName suffix yearLevel studentStatus course assignedProfessor corStatus')
        .sort({ lastName: 1, firstName: 1 })
        : [];

      const existingStudentIdSet = new Set(students.map((student) => String(student._id)));
      const orphanAssignmentIds = assignments
        .filter((assignment) => !existingStudentIdSet.has(String(assignment.studentId || '').trim()))
        .map((assignment) => assignment._id);

      if (orphanAssignmentIds.length > 0) {
        await StudentBlockAssignment.deleteMany({ _id: { $in: orphanAssignmentIds } });
      }

      const assignmentByStudentId = new Map(
        assignments.map((assignment) => [String(assignment.studentId), assignment])
      );

      const payload = students.map((student) => {
        const assignment = assignmentByStudentId.get(String(student._id));
        return {
          _id: student._id,
          studentNumber: student.studentNumber,
          firstName: student.firstName,
          middleName: student.middleName,
          lastName: student.lastName,
          suffix: student.suffix,
          yearLevel: student.yearLevel,
          studentStatus: student.studentStatus,
          course: student.course,
          assignedProfessor: student.assignedProfessor || '',
          corStatus: student.corStatus || 'Pending',
          status: assignment?.status || 'ASSIGNED',
          assignedAt: assignment?.assignedAt || null
        };
      });

      const normalizedPopulation = assignments.filter(
        (assignment) => assignment.status === 'ASSIGNED'
      ).length;
      let sectionPayload = section.toObject();

      if (Number(section.currentPopulation) !== normalizedPopulation) {
        sectionPayload = (
          await BlockSection.findByIdAndUpdate(
            section._id,
            { $set: { currentPopulation: normalizedPopulation } },
            { new: true }
          ).select('_id sectionCode capacity currentPopulation status blockGroupId classAdviser')
        )?.toObject() || { ...sectionPayload, currentPopulation: normalizedPopulation };
      }

      res.json({
        section: sectionPayload,
        totalStudents: normalizedPopulation,
        students: payload
      });
    } catch (error) {
      console.error('Get section students error:', error);
      res.status(500).json({ error: 'Failed to get section students' });
    }
  }

  // DELETE /api/blocks/sections/:sectionId/students/:studentId - unassign one student from section
  async unassignStudentFromSection(req, res) {
    const { sectionId, studentId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(sectionId) || !mongoose.Types.ObjectId.isValid(studentId)) {
      return res.status(400).json({ error: 'Invalid section id or student id' });
    }

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const section = await BlockSection.findById(sectionId)
        .select('_id sectionCode blockGroupId currentPopulation')
        .session(session);
      if (!section) {
        await session.abortTransaction();
        return res.status(404).json({ error: 'Section not found' });
      }

      const group = await BlockGroup.findById(section.blockGroupId)
        .select('name semester year')
        .session(session);

      const normalizedStudentId = String(studentId).trim();
      const normalizedSemester = String(req.body?.semester || group?.semester || '').trim();
      const normalizedYear = Number(req.body?.year ?? group?.year);

      const assignmentQuery = {
        sectionId: section._id,
        studentId: normalizedStudentId,
        status: 'ASSIGNED'
      };
      if (normalizedSemester) assignmentQuery.semester = normalizedSemester;
      if (Number.isFinite(normalizedYear)) assignmentQuery.year = normalizedYear;

      let assignment = await StudentBlockAssignment.findOne(assignmentQuery).session(session);
      if (!assignment && (assignmentQuery.semester || assignmentQuery.year !== undefined)) {
        assignment = await StudentBlockAssignment.findOne({
          sectionId: section._id,
          studentId: normalizedStudentId,
          status: 'ASSIGNED'
        }).session(session);
      }

      if (!assignment) {
        await session.abortTransaction();
        return res.status(404).json({ error: 'Student is not assigned to this section' });
      }

      const assignmentSemester = String(assignment.semester || '').trim();
      const studentSnapshot = await Student.findById(normalizedStudentId)
        .select('_id firstName lastName schoolYear semester')
        .session(session);
      const targetSchoolYear = String(
        studentSnapshot?.schoolYear || this.formatSchoolYearFromStartYear(normalizedYear) || ''
      ).trim();
      const targetSemester = assignmentSemester || String(studentSnapshot?.semester || '').trim();

      const clearedTargetEnrollments = await this.clearEnrollmentSubjectAssignmentsForStudents({
        studentIds: [normalizedStudentId],
        semester: targetSemester,
        schoolYear: targetSchoolYear,
        session
      });

      // Legacy records are sometimes saved under inconsistent school-year or
      // current-enrollment flags. If the targeted cleanup missed them, clear
      // any remaining active enrollment subjects for this student as well.
      if (clearedTargetEnrollments === 0) {
        await this.clearEnrollmentSubjectAssignmentsForStudents({
          studentIds: [normalizedStudentId],
          session
        });
      }

      await StudentBlockAssignment.deleteOne({ _id: assignment._id }).session(session);

      await Student.findByIdAndUpdate(
        normalizedStudentId,
        {
          $set: {
            section: '',
            enrollmentStatus: 'Not Enrolled',
            corStatus: 'Pending'
          }
        },
        { session }
      );

      // A registrar unassign means the student no longer has an active block
      // load for the current enrollment. Drop any active enrollment rows so
      // professor loads and COR generation cannot keep stale assignments alive.
      await Enrollment.updateMany(
        {
          studentId: new mongoose.Types.ObjectId(normalizedStudentId),
          status: { $in: ['Pending', 'Enrolled'] }
        },
        {
          $set: {
            status: 'Dropped',
            isCurrent: false
          }
        },
        { session }
      );

      const assignedCount = await StudentBlockAssignment.countDocuments({
        sectionId: section._id,
        status: 'ASSIGNED'
      }).session(session);

      const updatedSection = await BlockSection.findByIdAndUpdate(
        section._id,
        { $set: { currentPopulation: assignedCount } },
        { new: true, session }
      ).select('_id sectionCode capacity currentPopulation status blockGroupId classAdviser');

      await BlockActionLog.create([{
        actionType: 'UNASSIGN',
        sectionId: section._id,
        sectionCode: section.sectionCode,
        blockGroupName: group ? group.name : '',
        studentId: normalizedStudentId,
        studentName: studentSnapshot ? `${studentSnapshot.firstName || ''} ${studentSnapshot.lastName || ''}`.trim() : 'Unknown',
        registrarId: req.registrarId || req.adminId || 'system',
        timestamp: new Date(),
        details: {
          semester: normalizedSemester || undefined,
          year: Number.isFinite(normalizedYear) ? normalizedYear : undefined,
          schoolYear: targetSchoolYear || undefined,
          blockGroupId: section.blockGroupId ? String(section.blockGroupId) : undefined,
          blockSectionId: String(section._id),
        }
      }], { session });

      await session.commitTransaction();
      res.json({
        success: true,
        message: 'Student unassigned from block successfully',
        section: updatedSection
      });
    } catch (error) {
      await session.abortTransaction();
      console.error('Unassign student from section error:', error);
      res.status(500).json({ error: 'Failed to unassign student from section' });
    } finally {
      session.endSession();
    }
  }

  async getCapacityUpdates(req, res) {
    try {
      const limit = Math.min(Number(req.query.limit) || 20, 100);
      const actionTypes = ['ASSIGN', 'UNASSIGN', 'TRANSFER'];
      const logs = await BlockActionLog.find({ actionType: { $in: actionTypes } })
        .sort({ timestamp: -1 })
        .limit(limit)
        .lean();

      const sectionIds = [...new Set(logs.map((l) => String(l.sectionId)).filter(Boolean))];
      const studentIds = [...new Set(logs.map((l) => String(l.studentId)).filter(Boolean))];

      const [sections, students] = await Promise.all([
        BlockSection.find({ _id: { $in: sectionIds } }).select('sectionCode blockGroupId').lean(),
        Student.find({ $or: [{ _id: { $in: studentIds } }, { studentNumber: { $in: studentIds } }] }).select('firstName lastName studentNumber _id').lean()
      ]);

      const groupIds = [...new Set(sections.map((s) => String(s.blockGroupId)).filter(Boolean))];
      const groups = await BlockGroup.find({ _id: { $in: groupIds } }).select('name').lean();

      const groupById = Object.fromEntries(groups.map((g) => [String(g._id), g.name]));
      const sectionById = Object.fromEntries(sections.map((s) => [
        String(s._id),
        { sectionCode: s.sectionCode, groupName: groupById[String(s.blockGroupId)] || '' }
      ]));
      const studentNameById = Object.fromEntries(students.map((s) => [
        String(s._id),
        `${s.firstName || ''} ${s.lastName || ''}`.trim() || s.studentNumber || 'Unknown'
      ]));
      const studentNameByNumber = Object.fromEntries(students.filter((s) => s.studentNumber).map((s) => [
        s.studentNumber,
        `${s.firstName || ''} ${s.lastName || ''}`.trim() || 'Unknown'
      ]));

      const updates = logs.map((log) => {
        const section = sectionById[String(log.sectionId)] || {};
        const studentName = log.studentName || studentNameById[log.studentId] || studentNameByNumber[log.studentId] || 'Unknown';
        // Prefer the historical snapshot stored in the log at event time.
        // Only fall back to live data for legacy records that have no snapshot.
        // Never override a non-empty snapshot with live data — audit logs are
        // immutable historical records and must not change when sections are
        // later renamed or deleted.
        const sectionCode = log.sectionCode || section.sectionCode || 'Unknown';
        const blockGroupName = log.blockGroupName || section.groupName || '';
        return {
          _id: String(log._id),
          actionType: log.actionType,
          sectionCode,
          blockGroupName,
          studentName,
          studentId: log.studentId,
          registrarId: log.registrarId,
          timestamp: log.timestamp,
          // Include historical context from the log's details if available
          schoolYear: log.details?.schoolYear || undefined,
          semester: log.details?.semester || undefined,
        };
      });

      res.json({ success: true, data: updates });
    } catch (error) {
      console.error('Get capacity updates error:', error);
      res.status(500).json({ success: false, error: 'Failed to fetch capacity updates.' });
    }
  }

}

module.exports = new BlockController();
