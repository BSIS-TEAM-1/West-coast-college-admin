const mongoose = require('mongoose');
const Subject = require('../models/Subject');
const Enrollment = require('../models/Enrollment');
const CurriculumSubject = require('../models/CurriculumSubject');

/**
 * Validates a proposed prerequisite list for a subject:
 * - rejects self-reference
 * - rejects duplicate IDs
 * - rejects invalid/deleted subject IDs
 * - rejects INACTIVE subjects only if they are newly added (not already
 *   present on the subject before this edit). This prevents routine edits
 *   (e.g. fixing a typo in the title) from being blocked just because one
 *   of the subject's existing prerequisites was later archived elsewhere.
 *   Historical/grandfathered prerequisite links remain valid.
 * - rejects circular prerequisite chains (A -> B -> A)
 * Returns { valid: boolean, message?: string }
 */
async function validatePrerequisites(subjectId, prerequisiteSubjectIds, existingPrerequisiteIds = []) {
  if (!prerequisiteSubjectIds || prerequisiteSubjectIds.length === 0) {
    return { valid: true };
  }

  const ids = prerequisiteSubjectIds.map((id) => String(id));
  const existingIds = new Set((existingPrerequisiteIds || []).map((id) => String(id)));

  if (subjectId && ids.includes(String(subjectId))) {
    return { valid: false, message: 'A subject cannot be a prerequisite of itself' };
  }

  const uniqueIds = new Set(ids);
  if (uniqueIds.size !== ids.length) {
    return { valid: false, message: 'Duplicate prerequisite subjects are not allowed' };
  }

  const validIds = ids.filter((id) => mongoose.Types.ObjectId.isValid(id));
  if (validIds.length !== ids.length) {
    return { valid: false, message: 'One or more prerequisite subject IDs are invalid' };
  }

  const foundSubjects = await Subject.find({ _id: { $in: validIds } }).select('_id status isActive prerequisiteSubjectIds').lean();
  if (foundSubjects.length !== validIds.length) {
    return { valid: false, message: 'One or more prerequisite subjects do not exist' };
  }
  const newlyAddedInactive = foundSubjects.find((s) => {
    const isInactive = s.status === 'Inactive' || s.isActive === false;
    return isInactive && !existingIds.has(String(s._id));
  });
  if (newlyAddedInactive) {
    return { valid: false, message: 'Prerequisite subjects must be active. Archived subjects can only remain as previously-set (grandfathered) prerequisites.' };
  }

  // Circular reference check via BFS over prerequisite graph
  if (subjectId) {
    const visited = new Set();
    const queue = [...validIds];
    const subjectMap = new Map(foundSubjects.map((s) => [String(s._id), s]));

    while (queue.length > 0) {
      const currentId = queue.shift();
      if (currentId === String(subjectId)) {
        return { valid: false, message: 'Circular prerequisite relationship detected' };
      }
      if (visited.has(currentId)) continue;
      visited.add(currentId);

      let current = subjectMap.get(currentId);
      if (!current) {
        current = await Subject.findById(currentId).select('prerequisiteSubjectIds').lean();
        if (current) subjectMap.set(currentId, current);
      }
      if (current && Array.isArray(current.prerequisiteSubjectIds)) {
        for (const nextId of current.prerequisiteSubjectIds) {
          queue.push(String(nextId));
        }
      }
    }
  }

  return { valid: true };
}

class SubjectController {
  static async getSubjects(req, res) {
    try {
      const query = {};
      const { subjectType, status, isActive, q, limit, offset, excludeIds } = req.query;

      if (subjectType) query.subjectType = subjectType;
      if (status) query.status = status;
      if (isActive !== undefined) {
        query.isActive = String(isActive) === 'true';
      }
      if (q) {
        query.$or = [
          { code: { $regex: String(q).trim(), $options: 'i' } },
          { title: { $regex: String(q).trim(), $options: 'i' } }
        ];
      }
      // excludeIds: comma-separated list of subject IDs to exclude from results
      // (e.g. subjects already placed in the curriculum). Used by the wizard's
      // search-first subject picker to avoid re-offering placed subjects.
      if (excludeIds) {
        const ids = String(excludeIds).split(',').map(s => s.trim()).filter(Boolean);
        if (ids.length > 0) query._id = { $nin: ids };
      }

      // Pagination — defaults to returning all results (backward compatible).
      // When `limit` is provided, returns a paginated slice with total count.
      const parsedLimit = limit !== undefined ? parseInt(String(limit), 10) : null;
      const parsedOffset = offset !== undefined ? parseInt(String(offset), 10) : 0;
      const usePagination = parsedLimit !== null && Number.isFinite(parsedLimit) && parsedLimit > 0;

      if (usePagination) {
        const [subjects, total] = await Promise.all([
          Subject.find(query)
            .populate('prerequisiteSubjectIds', 'code title')
            .sort({ status: 1, code: 1 })
            .skip(parsedOffset)
            .limit(parsedLimit)
            .lean(),
          Subject.countDocuments(query),
        ]);
        res.json({ success: true, data: subjects, total, limit: parsedLimit, offset: parsedOffset });
      } else {
        const subjects = await Subject.find(query)
          .populate('prerequisiteSubjectIds', 'code title')
          .sort({ status: 1, code: 1 })
          .lean();
        res.json({ success: true, data: subjects });
      }
    } catch (error) {
      console.error('Error fetching subjects:', error);
      res.status(500).json({ success: false, message: 'Failed to fetch subjects' });
    }
  }

  static async createSubject(req, res) {
    try {
      const { code, title, units, subjectType, lecturePeriods, labPeriods, status, prerequisiteSubjectIds } = req.body;

      if (!code || !title || units === undefined || units === null) {
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

      const prereqCheck = await validatePrerequisites(null, prerequisiteSubjectIds);
      if (!prereqCheck.valid) {
        return res.status(400).json({ success: false, message: prereqCheck.message });
      }

      const subject = await Subject.create({
        code: normalizedCode,
        title: String(title).trim(),
        units: Number(units),
        subjectType: subjectType || undefined,
        lecturePeriods: lecturePeriods !== undefined ? Number(lecturePeriods) : undefined,
        labPeriods: labPeriods !== undefined ? Number(labPeriods) : undefined,
        status: status || undefined,
        prerequisiteSubjectIds: prerequisiteSubjectIds || undefined,
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
      const { code, title, units, subjectType, lecturePeriods, labPeriods, status, prerequisiteSubjectIds, isActive } = req.body;

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

      if (prerequisiteSubjectIds !== undefined) {
        const prereqCheck = await validatePrerequisites(id, prerequisiteSubjectIds, subject.prerequisiteSubjectIds);
        if (!prereqCheck.valid) {
          return res.status(400).json({ success: false, message: prereqCheck.message });
        }
        subject.prerequisiteSubjectIds = prerequisiteSubjectIds;
      }

      if (title !== undefined) subject.title = String(title).trim();
      if (units !== undefined) subject.units = Number(units);
      if (subjectType !== undefined) subject.subjectType = subjectType;
      if (lecturePeriods !== undefined) subject.lecturePeriods = Number(lecturePeriods);
      if (labPeriods !== undefined) subject.labPeriods = Number(labPeriods);
      if (status !== undefined) {
        subject.status = status;
        subject.isActive = status === 'Active';
      } else if (isActive !== undefined) {
        subject.isActive = Boolean(isActive);
        subject.status = subject.isActive ? 'Active' : 'Inactive';
      }
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

      const hasEnrollmentReference = await Enrollment.exists({
        'subjects.subjectId': id
      });
      if (hasEnrollmentReference) {
        return res.status(409).json({
          success: false,
          message: 'Cannot delete subject because enrollment records reference it. Archive it instead.'
        });
      }

      const hasCurriculumPlacement = await CurriculumSubject.exists({ subjectId: id });
      if (hasCurriculumPlacement) {
        return res.status(409).json({
          success: false,
          message: 'Cannot delete subject because it is placed in one or more curricula. Remove it from those curricula or archive it instead.'
        });
      }

      const isReferencedAsPrerequisite = await Subject.exists({ prerequisiteSubjectIds: id });
      if (isReferencedAsPrerequisite) {
        return res.status(409).json({
          success: false,
          message: 'Cannot delete subject because it is a prerequisite for one or more other subjects. Archive it instead.'
        });
      }

      const isReferencedAsCurriculumPrerequisite = await CurriculumSubject.exists({ prerequisiteSubjectIds: id });
      if (isReferencedAsCurriculumPrerequisite) {
        return res.status(409).json({
          success: false,
          message: 'Cannot delete subject because it is a prerequisite in one or more curriculum placements. Archive it instead.'
        });
      }

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
