const mongoose = require('mongoose');
const BlockGroup = require('../models/BlockGroup');
const BlockSection = require('../models/BlockSection');
const StudentBlockAssignment = require('../models/StudentBlockAssignment');
const SectionWaitlist = require('../models/SectionWaitlist');
const BlockActionLog = require('../models/BlockActionLog');
const Student = require('../models/Student');

class BlockController {
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
    const conditions = [{ course: groupCourse }, { course: String(groupCourse) }];

    if (groupCourse === 101) {
      conditions.push({ course: 'BEED' });
      conditions.push({ course: 'Bachelor of Elementary Education (BEED)' });
    } else if (groupCourse === 102) {
      conditions.push({ course: 'BSEd-English' });
      conditions.push({ course: 'ENGLISH' });
      conditions.push({ course: 'Bachelor of Secondary Education - Major in English' });
      conditions.push({ course: 'Bachelor of Secondary Education – Major in English' });
    } else if (groupCourse === 103) {
      conditions.push({ course: 'BSEd-Math' });
      conditions.push({ course: 'MATH' });
      conditions.push({ course: 'MATHEMATICS' });
      conditions.push({ course: 'Bachelor of Secondary Education - Major in Mathematics' });
      conditions.push({ course: 'Bachelor of Secondary Education – Major in Mathematics' });
    } else if (groupCourse === 201) {
      conditions.push({ course: 'BSBA-HRM' });
      conditions.push({ course: 'BSBS-HRM' });
      conditions.push({ course: 'HRM' });
      conditions.push({ course: 'Bachelor of Science in Business Administration - Major in HRM' });
      conditions.push({ course: 'Bachelor of Science in Business Administration – Major in HRM' });
    }

    return conditions;
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

  // GET /api/blocks/assignable-students?semester=1st&year=2026&q=juan
  async getAssignableStudents(req, res) {
    try {
      const { semester, year, q = '', limit = 200, groupId } = req.query;
      console.log('getAssignableStudents called with', req.query);
      if (!semester || !year) {
        return res.status(400).json({ error: 'semester and year are required' });
      }

      const assignedIds = await StudentBlockAssignment.find({
        semester,
        year: Number(year),
        status: { $in: ['ASSIGNED', 'WAITLISTED'] }
      }).distinct('studentId');
      console.log('assignedIds length:', assignedIds.length);

      const assignedObjectIds = assignedIds
        .filter((id) => mongoose.isValidObjectId(id))
        .map((id) => new mongoose.Types.ObjectId(id));
      console.log('assignedObjectIds length:', assignedObjectIds.length);

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
        // Temporarily disabled group filters to debug 500 error
        /*
        const group = await BlockGroup.findById(groupId).select('name');
        const groupYearLevel = this.extractYearLevelFromGroupName(group?.name);
        const groupCourse = this.extractCourseFromGroupName(group?.name);

        if (groupCourse) andConditions.push({ course: groupCourse });

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
        */
      }

      const query = andConditions.length > 0 ? { $and: andConditions } : {};
      console.log('query:', JSON.stringify(query));

      console.log('about to find students');
      const students = await Student.find(query)
        .select('_id studentNumber firstName middleName lastName suffix yearLevel studentStatus course')
        .sort({ lastName: 1, firstName: 1 })
        .limit(Math.min(Number(limit) || 200, 500));
      console.log('found students:', students.length);

      res.json(students);
    } catch (error) {
      console.error('Get assignable students error:', error);
      res.status(500).json({ error: 'Failed to fetch assignable students' });
    }
  }

  // POST /api/blocks/groups
  async createBlockGroup(req, res) {
    try {
      const { name, semester, year, policies } = req.body;
      if (!name || !semester || !year) {
        return res.status(400).json({ error: 'name, semester, and year are required' });
      }

      const group = await BlockGroup.create({
        name: String(name).trim(),
        semester,
        year: Number(year),
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

      const section = await BlockSection.create({
        blockGroupId: groupId,
        sectionCode: String(sectionCode).trim(),
        capacity: Number(capacity),
        schedule: schedule ? String(schedule).trim() : ''
      });

      res.status(201).json(section);
    } catch (error) {
      if (error && error.code === 11000) {
        return res.status(409).json({ error: 'Section code already exists in this group' });
      }
      console.error('Create section error:', error);
      res.status(500).json({ error: 'Failed to create section' });
    }
  }

  // DELETE /api/blocks/groups/:groupId
  async deleteBlockGroup(req, res) {
    try {
      const { groupId } = req.params;
      if (!mongoose.Types.ObjectId.isValid(groupId)) {
        return res.status(400).json({ error: 'Invalid block group id' });
      }

      const group = await BlockGroup.findById(groupId);
      if (!group) {
        return res.status(404).json({ error: 'Block group not found' });
      }

      const sections = await BlockSection.find({ blockGroupId: groupId }).select('_id currentPopulation sectionCode');
      const sectionIds = sections.map((s) => s._id);

      if (sectionIds.length > 0) {
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

        // Keep counters consistent when no active records remain.
        if (sections.some((s) => Number(s.currentPopulation) > 0)) {
          await BlockSection.updateMany(
            { _id: { $in: sectionIds } },
            { $set: { currentPopulation: 0 } }
          );
        }

        await BlockSection.deleteMany({ blockGroupId: groupId });
      }

      await BlockGroup.findByIdAndDelete(groupId);
      res.json({ message: 'Block group deleted successfully' });
    } catch (error) {
      console.error('Delete block group error:', error);
      res.status(500).json({ error: 'Failed to delete block group' });
    }
  }

  // POST /api/blocks/assign-student
  async assignStudent(req, res) {
    const { studentId, sectionId, semester, year } = req.body;

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      // Check existing assignment
      const existing = await StudentBlockAssignment.findOne({ studentId, semester, year }).session(session);
      if (existing) {
        await session.abortTransaction();
        return res.status(400).json({ error: 'Student already assigned for this semester' });
      }

      // Get section
      const section = await BlockSection.findById(sectionId).session(session);
      if (!section || section.status !== 'OPEN') {
        await session.abortTransaction();
        return res.status(400).json({ error: 'Section not found or not open' });
      }

      const group = await BlockGroup.findById(section.blockGroupId).session(session);
      const student = await Student.findById(studentId).select('yearLevel studentStatus course').session(session);
      if (!student) {
        await session.abortTransaction();
        return res.status(404).json({ error: 'Student not found' });
      }

      const groupYearLevel = this.extractYearLevelFromGroupName(group?.name);
      const groupCourse = this.extractCourseFromGroupName(group?.name);

      const normalizedStudentCourse = this.normalizeCourseCode(student.course);
      if (groupCourse && normalizedStudentCourse !== groupCourse) {
        await session.abortTransaction();
        return res.status(400).json({
          error: 'Student course does not match selected block group'
        });
      }

      if (groupYearLevel && student.studentStatus === 'Regular' && Number(student.yearLevel) !== groupYearLevel) {
        await session.abortTransaction();
        return res.status(400).json({
          error: `Regular students can only be assigned to year level ${groupYearLevel} blocks for this group`
        });
      }

      const projected = section.currentPopulation + 1;

      if (projected > section.capacity) {
        // Overcapacity
        const suggested = await this.getSuggestedSections(sectionId);
        const allowedActions = this.determineAllowedActions(group.policies);

        await session.abortTransaction();
        return res.json({
          status: 'OVER_CAPACITY',
          section: {
            id: section._id,
            code: section.sectionCode,
            capacity: section.capacity,
            currentPopulation: section.currentPopulation
          },
          projectedPopulation: projected,
          allowedActions,
          suggestedSections: suggested,
          policyLimits: group.policies
        });
      } else {
        // Assign normally
        const assignment = await StudentBlockAssignment.create([{ studentId, sectionId, semester, year, assignedAt: new Date() }], { session });
        await BlockSection.findByIdAndUpdate(sectionId, { $inc: { currentPopulation: 1 } }, { session });
        await BlockActionLog.create([{ actionType: 'ASSIGN', sectionId, studentId, registrarId: req.registrarId || req.adminId, timestamp: new Date() }], { session });

        await session.commitTransaction();
        return res.json({ status: 'ASSIGNED', assignmentId: assignment[0]._id });
      }
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

      await BlockActionLog.create([{ actionType: action, sectionId, studentId, registrarId: req.registrarId || req.adminId, reason, timestamp: new Date(), details: params }], { session });
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
    // Remove from original
    await StudentBlockAssignment.deleteOne({ studentId, semester, year }).session(session);
    await BlockSection.findByIdAndUpdate(originalSectionId, { $inc: { currentPopulation: -1 } }, { session });

    // Add to target
    const assignment = await StudentBlockAssignment.create([{ studentId, sectionId: targetSectionId, semester, year, assignedAt: new Date() }], { session });
    await BlockSection.findByIdAndUpdate(targetSectionId, { $inc: { currentPopulation: 1 } }, { session });
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
    await BlockSection.findByIdAndUpdate(sectionId, { status: 'CLOSED' }, { session });
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

}

module.exports = new BlockController();
