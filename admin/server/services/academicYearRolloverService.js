const crypto = require('crypto');
const mongoose = require('mongoose');
const Student = require('../models/Student');
const Enrollment = require('../models/Enrollment');
const BlockGroup = require('../models/BlockGroup');
const BlockSection = require('../models/BlockSection');
const StudentBlockAssignment = require('../models/StudentBlockAssignment');
const ArchiveSnapshot = require('../models/ArchiveSnapshot');
const AcademicArchiveService = require('./AcademicArchiveService');
const AuditLog = require('../models/AuditLog');
const SystemSetting = require('../models/SystemSetting');
const eventBus = require('../domains/shared/EventBus');
const DomainEvents = require('../domains/shared/DomainEvents');

const ACADEMIC_TERM_KEY = 'academicTerm';
const FINAL_YEAR_LEVEL = 4;
const PASSING_GRADE = 3.0;
const DEFAULT_SECTION_CAPACITY = 40;

// Student.course is numeric; Enrollment.course is a string enum.
const ENROLLMENT_COURSE_BY_CODE = {
  101: 'BEED',
  102: 'BSED',
  103: 'BSED',
  201: 'BSBA'
};

const VALID_ACTIONS = ['promote', 'retain', 'graduate', 'skip'];

function schoolYearStart(schoolYear) {
  return Number(String(schoolYear || '').split('-')[0]);
}

function isValidSchoolYear(value) {
  return /^\d{4}-\d{4}$/.test(String(value || '').trim());
}

function studentDisplayName(student) {
  return [student.firstName, student.middleName, student.lastName, student.suffix]
    .map((part) => String(part || '').trim())
    .filter(Boolean)
    .join(' ');
}

/**
 * Classify a student for rollover based on grades and year level.
 * The registrar can override every recommendation before execution
 * (this satisfies the "Registrar Approved" requirement).
 */
function recommendAction(student) {
  const hasGrade = typeof student.latestGrade === 'number';
  const passed = hasGrade && student.latestGrade <= PASSING_GRADE;
  const isFinalYear = Number(student.yearLevel) >= FINAL_YEAR_LEVEL;

  if (!hasGrade) {
    return { action: 'retain', reason: 'No grade recorded - needs registrar review', needsReview: true };
  }
  if (!passed) {
    return { action: 'retain', reason: `Failing grade (${student.latestGrade})`, needsReview: false };
  }
  if (isFinalYear) {
    return { action: 'graduate', reason: 'Final year completed with passing grade', needsReview: false };
  }
  return { action: 'promote', reason: `Passing grade (${student.latestGrade})`, needsReview: false };
}

class AcademicYearRolloverService {
  /**
   * Dry-run evaluation. Read-only: classifies every active student for the
   * closing school year and returns per-student recommendations.
   */
  static async previewRollover({ fromSchoolYear, toSchoolYear, semester }) {
    if (!isValidSchoolYear(fromSchoolYear)) {
      throw Object.assign(new Error('fromSchoolYear must be in YYYY-YYYY format'), { statusCode: 400 });
    }
    if (toSchoolYear && !isValidSchoolYear(toSchoolYear)) {
      throw Object.assign(new Error('toSchoolYear must be in YYYY-YYYY format'), { statusCode: 400 });
    }

    const resolvedToSchoolYear = toSchoolYear || `${schoolYearStart(fromSchoolYear) + 1}-${schoolYearStart(fromSchoolYear) + 2}`;

    const students = await Student.find({
      schoolYear: fromSchoolYear,
      lifecycleStatus: { $in: ['Enrolled', 'Pending', 'Not Enrolled'] }
    })
      .select('studentNumber firstName middleName lastName suffix course yearLevel section semester schoolYear latestGrade lifecycleStatus studentStatus')
      .sort({ course: 1, yearLevel: 1, lastName: 1 })
      .lean();

    const evaluations = students.map((student) => {
      const recommendation = recommendAction(student);
      return {
        studentId: String(student._id),
        studentNumber: student.studentNumber,
        name: studentDisplayName(student),
        course: student.course,
        yearLevel: student.yearLevel,
        section: student.section || null,
        latestGrade: typeof student.latestGrade === 'number' ? student.latestGrade : null,
        lifecycleStatus: student.lifecycleStatus,
        recommendedAction: recommendation.action,
        reason: recommendation.reason,
        needsReview: recommendation.needsReview
      };
    });

    const summary = evaluations.reduce((acc, item) => {
      acc[item.recommendedAction] = (acc[item.recommendedAction] || 0) + 1;
      if (item.needsReview) acc.needsReview += 1;
      return acc;
    }, { promote: 0, retain: 0, graduate: 0, skip: 0, needsReview: 0 });

    return {
      fromSchoolYear,
      toSchoolYear: resolvedToSchoolYear,
      semester: semester || '1st',
      totalStudents: evaluations.length,
      summary,
      evaluations
    };
  }

  // ---- Enterprise-scale preview methods (hierarchical + lazy-loaded) ----

  /**
   * Returns hierarchical aggregate counts grouped by Course → Year Level → Section.
   * No student documents are loaded — uses MongoDB aggregation pipeline only.
   * Scales to 100,000+ students with minimal memory and DB load.
   */
  static async previewSummary({ fromSchoolYear, toSchoolYear, semester }) {
    if (!isValidSchoolYear(fromSchoolYear)) {
      throw Object.assign(new Error('fromSchoolYear must be in YYYY-YYYY format'), { statusCode: 400 });
    }
    if (toSchoolYear && !isValidSchoolYear(toSchoolYear)) {
      throw Object.assign(new Error('toSchoolYear must be in YYYY-YYYY format'), { statusCode: 400 });
    }

    const resolvedToSchoolYear = toSchoolYear || `${schoolYearStart(fromSchoolYear) + 1}-${schoolYearStart(fromSchoolYear) + 2}`;
    const targetSemester = ['1st', '2nd', 'Summer'].includes(semester) ? semester : '1st';

    const baseMatch = {
      schoolYear: fromSchoolYear,
      lifecycleStatus: { $in: ['Enrolled', 'Pending', 'Not Enrolled'] },
    };

    // Single aggregation pipeline: group by course, yearLevel, section
    // and classify each student inline using $switch
    const pipeline = [
      { $match: baseMatch },
      {
        $addFields: {
          _hasGrade: { $eq: [{ $type: '$latestGrade' }, 'number'] },
          _passed: {
            $and: [
              { $eq: [{ $type: '$latestGrade' }, 'number'] },
              { $lte: ['$latestGrade', PASSING_GRADE] },
            ],
          },
          _isFinalYear: { $gte: ['$yearLevel', FINAL_YEAR_LEVEL] },
        },
      },
      {
        $addFields: {
          _action: {
            $switch: {
              branches: [
                { case: { $not: [{ $eq: [{ $type: '$latestGrade' }, 'number'] }] }, then: 'retain' },
                { case: { $gt: ['$latestGrade', PASSING_GRADE] }, then: 'retain' },
                { case: { $gte: ['$yearLevel', FINAL_YEAR_LEVEL] }, then: 'graduate' },
              ],
              default: 'promote',
            },
          },
          _needsReview: {
            $ne: [{ $type: '$latestGrade' }, 'number'],
          },
        },
      },
      {
        $group: {
          _id: {
            course: '$course',
            yearLevel: '$yearLevel',
            section: { $ifNull: ['$section', 'Unassigned'] },
          },
          total: { $sum: 1 },
          promote: { $sum: { $cond: [{ $eq: ['$_action', 'promote'] }, 1, 0] } },
          retain: { $sum: { $cond: [{ $eq: ['$_action', 'retain'] }, 1, 0] } },
          graduate: { $sum: { $cond: [{ $eq: ['$_action', 'graduate'] }, 1, 0] } },
          needsReview: { $sum: { $cond: ['$_needsReview', 1, 0] } },
        },
      },
      { $sort: { '_id.course': 1, '_id.yearLevel': 1, '_id.section': 1 } },
    ];

    const groupResults = await Student.aggregate(pipeline);

    const groups = groupResults.map((g) => ({
      course: g._id.course,
      courseLabel: ENROLLMENT_COURSE_BY_CODE[g._id.course] || String(g._id.course),
      yearLevel: g._id.yearLevel,
      section: g._id.section,
      total: g.total,
      eligible: g.promote,
      retained: g.retain,
      graduating: g.graduate,
      needsReview: g.needsReview,
      status: g.needsReview > 0 ? 'needs_attention' : 'auto_approved',
    }));

    const summary = groups.reduce(
      (acc, g) => {
        acc.promote += g.eligible;
        acc.retain += g.retained;
        acc.graduate += g.graduating;
        acc.needsReview += g.needsReview;
        acc.total += g.total;
        return acc;
      },
      { promote: 0, retain: 0, graduate: 0, skip: 0, needsReview: 0, total: 0 }
    );

    return {
      fromSchoolYear,
      toSchoolYear: resolvedToSchoolYear,
      semester: targetSemester,
      totalStudents: summary.total,
      summary: {
        promote: summary.promote,
        retain: summary.retain,
        graduate: summary.graduate,
        skip: summary.skip,
        needsReview: summary.needsReview,
      },
      groups,
    };
  }

  /**
   * Lazy-load paginated students for a specific group (course/yearLevel/section).
   * Supports server-side search and filtering.
   */
  static async previewStudents({ fromSchoolYear, course, yearLevel, section, page = 1, limit = 50, search = '', filter = 'all' }) {
    if (!isValidSchoolYear(fromSchoolYear)) {
      throw Object.assign(new Error('fromSchoolYear must be in YYYY-YYYY format'), { statusCode: 400 });
    }

    const pageNumber = Math.max(1, Number.parseInt(page, 10) || 1);
    const limitNumber = Math.min(100, Math.max(1, Number.parseInt(limit, 10) || 50));

    const query = {
      schoolYear: fromSchoolYear,
      lifecycleStatus: { $in: ['Enrolled', 'Pending', 'Not Enrolled'] },
    };

    if (course !== undefined && course !== null && course !== '') {
      query.course = Number(course);
    }
    if (yearLevel !== undefined && yearLevel !== null && yearLevel !== '') {
      query.yearLevel = Number(yearLevel);
    }
    if (section && section !== 'Unassigned') {
      query.section = section;
    } else if (section === 'Unassigned') {
      query.$or = [{ section: null }, { section: '' }, { section: { $exists: false } }];
    }

    if (search) {
      const searchRegex = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      query.$and = [
        ...(query.$and || []),
        {
          $or: [
            { studentNumber: searchRegex },
            { firstName: searchRegex },
            { lastName: searchRegex },
          ],
        },
      ];
    }

    if (filter === 'needs_review') {
      query.latestGrade = { $exists: false };
    }

    const [students, total] = await Promise.all([
      Student.find(query)
        .select('studentNumber firstName middleName lastName suffix course yearLevel section semester schoolYear latestGrade lifecycleStatus studentStatus')
        .sort({ lastName: 1, firstName: 1 })
        .skip((pageNumber - 1) * limitNumber)
        .limit(limitNumber)
        .lean(),
      Student.countDocuments(query),
    ]);

    const studentsWithEvaluations = students.map((student) => {
      const recommendation = recommendAction(student);
      return {
        studentId: String(student._id),
        studentNumber: student.studentNumber,
        name: studentDisplayName(student),
        course: student.course,
        yearLevel: student.yearLevel,
        section: student.section || null,
        latestGrade: typeof student.latestGrade === 'number' ? student.latestGrade : null,
        lifecycleStatus: student.lifecycleStatus,
        recommendedAction: recommendation.action,
        reason: recommendation.reason,
        needsReview: recommendation.needsReview,
      };
    });

    return {
      students: studentsWithEvaluations,
      total,
      page: pageNumber,
      totalPages: Math.ceil(total / limitNumber),
    };
  }

  /**
   * Lazy-load paginated exception students (needsReview=true) across all groups.
   * These are students with missing grades, INC, or other flags requiring manual review.
   */
  static async previewExceptions({ fromSchoolYear, page = 1, limit = 50, search = '', course, yearLevel }) {
    if (!isValidSchoolYear(fromSchoolYear)) {
      throw Object.assign(new Error('fromSchoolYear must be in YYYY-YYYY format'), { statusCode: 400 });
    }

    const pageNumber = Math.max(1, Number.parseInt(page, 10) || 1);
    const limitNumber = Math.min(100, Math.max(1, Number.parseInt(limit, 10) || 50));

    const query = {
      schoolYear: fromSchoolYear,
      lifecycleStatus: { $in: ['Enrolled', 'Pending', 'Not Enrolled'] },
      latestGrade: { $exists: false },
    };

    if (course !== undefined && course !== null && course !== '') {
      query.course = Number(course);
    }
    if (yearLevel !== undefined && yearLevel !== null && yearLevel !== '') {
      query.yearLevel = Number(yearLevel);
    }

    if (search) {
      const searchRegex = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      query.$or = [
        { studentNumber: searchRegex },
        { firstName: searchRegex },
        { lastName: searchRegex },
      ];
    }

    const [students, total] = await Promise.all([
      Student.find(query)
        .select('studentNumber firstName middleName lastName suffix course yearLevel section semester schoolYear latestGrade lifecycleStatus studentStatus')
        .sort({ course: 1, yearLevel: 1, lastName: 1 })
        .skip((pageNumber - 1) * limitNumber)
        .limit(limitNumber)
        .lean(),
      Student.countDocuments(query),
    ]);

    const exceptions = students.map((student) => {
      const recommendation = recommendAction(student);
      return {
        studentId: String(student._id),
        studentNumber: student.studentNumber,
        name: studentDisplayName(student),
        course: student.course,
        yearLevel: student.yearLevel,
        section: student.section || null,
        latestGrade: typeof student.latestGrade === 'number' ? student.latestGrade : null,
        lifecycleStatus: student.lifecycleStatus,
        recommendedAction: recommendation.action,
        reason: recommendation.reason,
        needsReview: true,
      };
    });

    return {
      students: exceptions,
      total,
      page: pageNumber,
      totalPages: Math.ceil(total / limitNumber),
    };
  }

  /**
   * Execute the rollover inside a single database transaction.
   * If any step fails, everything is rolled back - no partial rollover.
   *
   * decisions: [{ studentId, action }] where action is promote|retain|graduate|skip.
   * groupDecisions: [{ course, yearLevel, section?, action }] — server expands to individual students.
   * decisionOverrides: [{ studentId, action }] — manual overrides for exception students.
   */
  static async executeRollover({ fromSchoolYear, toSchoolYear, semester, decisions, groupDecisions, decisionOverrides, adminId, adminRole }) {
    if (!isValidSchoolYear(fromSchoolYear) || !isValidSchoolYear(toSchoolYear)) {
      throw Object.assign(new Error('fromSchoolYear and toSchoolYear must be in YYYY-YYYY format'), { statusCode: 400 });
    }
    if (fromSchoolYear === toSchoolYear) {
      throw Object.assign(new Error('The new school year must be different from the closing school year'), { statusCode: 400 });
    }
    if (!adminId) {
      throw Object.assign(new Error('An initiating admin is required'), { statusCode: 400 });
    }

    // ---- Resolve decisions from groupDecisions + decisionOverrides ----
    // If groupDecisions is provided, expand each group to individual student decisions
    // using the server-side recommendAction() logic, then apply decisionOverrides.
    let resolvedDecisions = decisions;

    if (Array.isArray(groupDecisions) && groupDecisions.length > 0) {
      resolvedDecisions = [];

      for (const gd of groupDecisions) {
        if (!VALID_ACTIONS.includes(gd?.action)) {
          throw Object.assign(new Error(`Invalid group action: ${gd?.action}`), { statusCode: 400 });
        }

        const groupQuery = {
          schoolYear: fromSchoolYear,
          lifecycleStatus: { $in: ['Enrolled', 'Pending', 'Not Enrolled'] },
          course: Number(gd.course),
          yearLevel: Number(gd.yearLevel),
        };

        if (gd.section && gd.section !== 'Unassigned') {
          groupQuery.section = gd.section;
        } else if (gd.section === 'Unassigned') {
          groupQuery.$or = [{ section: null }, { section: '' }, { section: { $exists: false } }];
        }

        const groupStudents = await Student.find(groupQuery)
          .select('_id')
          .lean();

        for (const s of groupStudents) {
          resolvedDecisions.push({ studentId: String(s._id), action: gd.action });
        }
      }

      // Apply individual overrides (exception students with manual decisions)
      if (Array.isArray(decisionOverrides)) {
        const overrideMap = new Map(decisionOverrides.map((d) => [d.studentId, d.action]));
        resolvedDecisions = resolvedDecisions.map((d) => {
          if (overrideMap.has(d.studentId)) {
            return { studentId: d.studentId, action: overrideMap.get(d.studentId) };
          }
          return d;
        });

        // Add overrides for students not covered by any group
        const coveredIds = new Set(resolvedDecisions.map((d) => d.studentId));
        for (const override of decisionOverrides) {
          if (!coveredIds.has(override.studentId) && VALID_ACTIONS.includes(override.action)) {
            resolvedDecisions.push({ studentId: override.studentId, action: override.action });
          }
        }
      }
    }

    if (!Array.isArray(resolvedDecisions) || resolvedDecisions.length === 0) {
      throw Object.assign(new Error('At least one student decision is required'), { statusCode: 400 });
    }

    const invalidDecision = resolvedDecisions.find((d) => !d?.studentId || !VALID_ACTIONS.includes(d?.action));
    if (invalidDecision) {
      throw Object.assign(new Error('Each decision must include a studentId and a valid action (promote, retain, graduate, skip)'), { statusCode: 400 });
    }

    const targetSemester = ['1st', '2nd', 'Summer'].includes(semester) ? semester : '1st';
    const rolloverBatchId = `rollover_${fromSchoolYear}_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    const fromStartYear = schoolYearStart(fromSchoolYear);
    const toStartYear = schoolYearStart(toSchoolYear);

    const session = await mongoose.startSession();

    const results = {
      rolloverBatchId,
      fromSchoolYear,
      toSchoolYear,
      semester: targetSemester,
      promoted: [],
      retained: [],
      graduated: [],
      skipped: [],
      failures: [],
      blocksCreated: [],
      snapshotIds: []
    };

    try {
      await session.withTransaction(async () => {
        // ---- Step 1: Archive current school year blocks (duplicate academic structure) ----
        const closingGroups = await BlockGroup.find({ year: fromStartYear }).session(session).lean();
        const closingSectionsByGroup = {};
        for (const group of closingGroups) {
          closingSectionsByGroup[String(group._id)] = await BlockSection.find({ blockGroupId: group._id }).session(session).lean();
        }

        // Cache of new-year block sections keyed by course+yearLevel
        const newSectionCache = new Map();

        const ensureBlockForCohort = async (course, yearLevel) => {
          const cacheKey = `${course}_${yearLevel}`;
          if (newSectionCache.has(cacheKey)) return newSectionCache.get(cacheKey);

          let group = await BlockGroup.findOne({
            year: toStartYear,
            semester: targetSemester,
            courseId: Number(course),
            yearLevel: Number(yearLevel)
          }).session(session);

          if (!group) {
            const templateGroup = closingGroups.find(
              (g) => Number(g.courseId) === Number(course) && Number(g.yearLevel) === Number(yearLevel)
            );
            const name = `${course}-${yearLevel}A`;
            const created = await BlockGroup.create([{
              name,
              courseId: Number(course),
              courseCode: templateGroup?.courseCode || String(ENROLLMENT_COURSE_BY_CODE[course] || course),
              yearLevel: Number(yearLevel),
              semester: targetSemester,
              schoolYear: toSchoolYear,
              year: toStartYear,
              section: 'A',
              policies: templateGroup?.policies || undefined
            }], { session });
            group = created[0];
            results.blocksCreated.push({ blockGroupId: String(group._id), name: group.name });
          }

          let section = await BlockSection.findOne({ blockGroupId: group._id }).sort({ currentPopulation: 1 }).session(session);
          if (!section) {
            const templateGroup = closingGroups.find(
              (g) => Number(g.courseId) === Number(course) && Number(g.yearLevel) === Number(yearLevel)
            );
            const templateSection = templateGroup
              ? (closingSectionsByGroup[String(templateGroup._id)] || [])[0]
              : null;
            const createdSections = await BlockSection.create([{
              blockGroupId: group._id,
              sectionCode: `${course}-${yearLevel}-A`,
              capacity: templateSection?.capacity || DEFAULT_SECTION_CAPACITY,
              currentPopulation: 0,
              status: 'OPEN'
            }], { session });
            section = createdSections[0];
            results.blocksCreated.push({ sectionId: String(section._id), sectionCode: section.sectionCode });
          }

          const cohort = { group, section };
          newSectionCache.set(cacheKey, cohort);
          return cohort;
        };

        // ---- Step 2: Evaluate students and apply decisions ----
        const now = new Date();

        const closingStudents = [];
        const closingEnrollments = [];

        for (const decision of resolvedDecisions) {
          const student = await Student.findById(decision.studentId).session(session);
          if (!student) {
            results.failures.push({ studentId: decision.studentId, error: 'Student not found' });
            continue;
          }

          const closingStudentRecord = student.toObject({ minimize: false });
          closingStudents.push(closingStudentRecord);

          if (decision.action === 'skip') {
            results.skipped.push({ studentId: String(student._id), studentNumber: student.studentNumber });
            continue;
          }

          // Close the student's current enrollment for the closing school year (lock it forever).
          const currentEnrollment = await Enrollment.findOne({
            studentId: student._id,
            schoolYear: fromSchoolYear,
            isCurrent: true,
            lockedAt: null
          }).session(session);

          const closedStatus = decision.action === 'promote'
            ? 'Completed'
            : decision.action === 'graduate'
              ? 'Graduated'
              : 'Retained';

          if (currentEnrollment) {
            closingEnrollments.push(currentEnrollment.toObject({ minimize: false }));
            currentEnrollment.status = closedStatus;
            currentEnrollment.isCurrent = false;
            currentEnrollment.lockedAt = now;
            currentEnrollment.lockedBy = adminId;
            currentEnrollment.rolloverBatchId = rolloverBatchId;
            currentEnrollment.updatedBy = adminId;
            await currentEnrollment.save({ session });
          }

          const entry = {
            studentId: String(student._id),
            studentNumber: student.studentNumber,
            name: studentDisplayName(student),
            course: student.course,
            fromYearLevel: student.yearLevel,
            previousEnrollmentId: currentEnrollment ? String(currentEnrollment._id) : null
          };

          if (decision.action === 'graduate') {
            // Graduation terminates the enrollment chain - no new enrollment.
            student.lifecycleStatus = 'Graduated';
            student.enrollmentStatus = 'Not Enrolled';
            student.isActive = false;
            student.updatedBy = adminId;
            await student.save({ session, validateBeforeSave: false });
            results.graduated.push({ ...entry, toYearLevel: student.yearLevel });
            continue;
          }

          // Promotion and retention both create a NEW enrollment record.
          const newYearLevel = decision.action === 'promote'
            ? Math.min(Number(student.yearLevel) + 1, 5)
            : Number(student.yearLevel);

          const { section } = await ensureBlockForCohort(student.course, newYearLevel);

          // Retire any other current enrollments inside the transaction.
          await Enrollment.updateMany(
            { studentId: student._id, isCurrent: true },
            { $set: { isCurrent: false } },
            { session }
          );

          const newEnrollments = await Enrollment.create([{
            studentId: student._id,
            studentNumber: student.studentNumber,
            schoolYear: toSchoolYear,
            semester: targetSemester,
            yearLevel: newYearLevel,
            course: ENROLLMENT_COURSE_BY_CODE[student.course] || 'BEED',
            subjects: [],
            assessment: { tuitionFee: 0, miscFee: 0, otherFees: 0, totalAmount: 0 },
            status: 'Enrolled',
            isCurrent: true,
            rolloverBatchId,
            previousEnrollmentId: currentEnrollment ? currentEnrollment._id : null,
            createdBy: adminId
          }], { session });

          // Assign the student to the new block section.
          await StudentBlockAssignment.findOneAndUpdate(
            { studentId: String(student._id), semester: targetSemester, year: toStartYear },
            {
              $set: {
                sectionId: section._id,
                status: 'ASSIGNED',
                assignedAt: now
              }
            },
            { upsert: true, session }
          );
          await BlockSection.updateOne(
            { _id: section._id },
            { $inc: { currentPopulation: 1 } },
            { session }
          );

          // Move the student forward.
          student.yearLevel = newYearLevel;
          student.schoolYear = toSchoolYear;
          student.semester = targetSemester;
          student.section = section.sectionCode;
          student.lifecycleStatus = 'Enrolled';
          student.enrollmentStatus = 'Enrolled';
          student.updatedBy = adminId;
          await student.save({ session, validateBeforeSave: false });

          const resultEntry = { ...entry, toYearLevel: newYearLevel, newEnrollmentId: String(newEnrollments[0]._id), newSection: section.sectionCode };
          if (decision.action === 'promote') {
            results.promoted.push(resultEntry);
          } else {
            results.retained.push(resultEntry);
          }
        }

        if (results.failures.length > 0) {
          throw Object.assign(
            new Error(`Rollover aborted: ${results.failures.length} student record(s) could not be processed. No changes were applied.`),
            { statusCode: 409, failures: results.failures }
          );
        }

        // ---- Step 3: Generate immutable archive snapshots ----
        const counts = {
          total: resolvedDecisions.length,
          promoted: results.promoted.length,
          retained: results.retained.length,
          graduated: results.graduated.length,
          skipped: results.skipped.length
        };

        const blockSnapshotData = closingGroups.map((group) => ({
          blockGroupId: String(group._id),
          name: group.name,
          courseId: group.courseId,
          yearLevel: group.yearLevel,
          semester: group.semester,
          schoolYear: group.schoolYear,
          sections: (closingSectionsByGroup[String(group._id)] || []).map((s) => ({
            sectionId: String(s._id),
            sectionCode: s.sectionCode,
            capacity: s.capacity,
            currentPopulation: s.currentPopulation,
            status: s.status
          }))
        }));

        const snapshotDocs = AcademicArchiveService.createSnapshotsForRollover({
          closingStudents,
          closingEnrollments,
          resolvedDecisions,
          counts,
          blockSnapshotData,
          blocksCreated: results.blocksCreated,
          context: {
            fromSchoolYear,
            toSchoolYear,
            targetSemester,
            rolloverBatchId,
            adminId,
          },
        });

        const createdSnapshots = await ArchiveSnapshot.create(snapshotDocs, { session, ordered: true });
        results.snapshotIds = createdSnapshots.map((doc) => String(doc._id));

        // ---- Step 4: Advance the global academic term (final write) ----
        await SystemSetting.findOneAndUpdate(
          { key: ACADEMIC_TERM_KEY },
          { $set: { value: { schoolYear: toSchoolYear, semester: targetSemester } } },
          { upsert: true, session }
        );

        // ---- Step 5: Audit log ----
        await AuditLog.create([{
          action: 'ARCHIVE',
          resourceType: 'SYSTEM',
          resourceId: rolloverBatchId,
          resourceName: `Academic Year Rollover ${fromSchoolYear} -> ${toSchoolYear}`,
          description: `School year rollover executed: ${counts.promoted} promoted, ${counts.retained} retained, ${counts.graduated} graduated, ${counts.skipped} skipped.`,
          performedBy: adminId,
          performedByRole: ['admin', 'registrar'].includes(String(adminRole || '').toLowerCase()) ? String(adminRole).toLowerCase() : 'registrar',
          newValue: { rolloverBatchId, fromSchoolYear, toSchoolYear, semester: targetSemester, counts },
          status: 'SUCCESS',
          severity: 'HIGH'
        }], { session });
      });
    } finally {
      await session.endSession();
    }

    // ---- Post-commit: Publish domain events ----
    // Events are emitted AFTER the transaction commits so handlers
    // never see partial data. If a handler fails, the rollover itself
    // is still successful (events are best-effort notifications).
    eventBus.emit(DomainEvents.SCHOOL_YEAR_CLOSED, {
      schoolYear: fromSchoolYear,
      newSchoolYear: toSchoolYear,
      semester: targetSemester,
      rolloverBatchId,
      adminId,
      correlationId: rolloverBatchId,
    });

    for (const entry of results.promoted) {
      eventBus.emit(DomainEvents.STUDENT_PROMOTED, {
        studentId: entry.studentId,
        studentNumber: entry.studentNumber,
        fromYearLevel: entry.yearLevel,
        toYearLevel: entry.toYearLevel,
        schoolYear: toSchoolYear,
        adminId,
        correlationId: rolloverBatchId,
      });
    }

    for (const entry of results.retained) {
      eventBus.emit(DomainEvents.STUDENT_RETAINED, {
        studentId: entry.studentId,
        studentNumber: entry.studentNumber,
        yearLevel: entry.yearLevel,
        schoolYear: toSchoolYear,
        adminId,
        correlationId: rolloverBatchId,
      });
    }

    for (const entry of results.graduated) {
      eventBus.emit(DomainEvents.STUDENT_GRADUATED, {
        studentId: entry.studentId,
        studentNumber: entry.studentNumber,
        schoolYear: fromSchoolYear,
        adminId,
        correlationId: rolloverBatchId,
      });
    }

    for (const snapId of results.snapshotIds || []) {
      eventBus.emit(DomainEvents.SNAPSHOT_GENERATED, {
        snapshotId: snapId,
        schoolYear: fromSchoolYear,
        rolloverBatchId,
        correlationId: rolloverBatchId,
      });
    }

    return results;
  }

  static async listSnapshots({ schoolYear, type, limit = 100 } = {}) {
    const filter = {};
    if (schoolYear && isValidSchoolYear(schoolYear)) filter.schoolYear = schoolYear;
    if (type) filter.type = type;

    return ArchiveSnapshot.find(filter)
      .select('type title schoolYear newSchoolYear semester rolloverBatchId counts generatedBy generatedAt')
      .sort({ generatedAt: -1 })
      .limit(Math.min(Number(limit) || 100, 500))
      .populate('generatedBy', 'username displayName')
      .lean();
  }

  static async getSnapshotById(id) {
    return ArchiveSnapshot.findById(id).populate('generatedBy', 'username displayName').lean();
  }
}

module.exports = AcademicYearRolloverService;
