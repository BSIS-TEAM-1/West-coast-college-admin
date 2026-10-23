const crypto = require('crypto');
const mongoose = require('mongoose');
const Student = require('../models/Student');
const Enrollment = require('../models/Enrollment');
const BlockGroup = require('../models/BlockGroup');
const BlockSection = require('../models/BlockSection');
const StudentBlockAssignment = require('../models/StudentBlockAssignment');
const ArchiveSnapshot = require('../models/ArchiveSnapshot');
const RolloverBatch = require('../models/RolloverBatch');
const AcademicArchiveService = require('./AcademicArchiveService');
const AuditLog = require('../models/AuditLog');
const SystemSetting = require('../models/SystemSetting');
const Curriculum = require('../models/Curriculum');
const curriculumProgressService = require('./curriculumProgressService');
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

function sameValue(left, right) {
  return String(left ?? '') === String(right ?? '');
}

function uniqueIdStrings(values) {
  return [...new Set((values || []).filter(Boolean).map((value) => String(value)))];
}

async function getAssignedBlockMap(schoolYear, semester) {
  const assignments = await StudentBlockAssignment.find({
    semester,
    status: 'ASSIGNED',
    $or: [{ schoolYear }, { year: schoolYear }],
  })
    .populate('sectionId', 'sectionCode')
    .lean();

  return new Map(
    assignments
      .filter((assignment) => assignment.sectionId?.sectionCode)
      .map((assignment) => [String(assignment.studentId), assignment.sectionId.sectionCode])
  );
}

async function getStudentIdsForBlock({ schoolYear, semester, block }) {
  const blockMap = await getAssignedBlockMap(schoolYear, semester);
  if (block === 'Unassigned') {
    return { assignedIds: [...blockMap.keys()], matchingIds: null };
  }
  return {
    assignedIds: [...blockMap.keys()],
    matchingIds: [...blockMap.entries()]
      .filter(([, assignedBlock]) => assignedBlock === block)
      .map(([studentId]) => studentId),
  };
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

/**
 * Gate an AUTOMATIC graduation recommendation on the student's curriculum.
 *
 * `recommendAction` only reads latestGrade + yearLevel. That is enough to say
 * "final year, passing" but not "has finished the program", and a block label
 * alone must never decide graduation either. Any entry that recommends
 * "graduate" without curriculum completion is downgraded to "retain" with a
 * recorded reason so the preview tells the registrar the truth.
 *
 * Explicit per-student overrides are applied by callers AFTER this gate, so a
 * registrar's own decision always wins over the server's recommendation.
 *
 * @param {Object[]} entries - mutable recommendation objects
 * @param {(entry: Object) => Object|null} studentLookup - resolves a lean student doc
 * @param {string} actionField - which action field to gate
 * @returns {Promise<Object[]>} the entries that were adjusted (for reporting)
 */
async function gateGraduationOnCurriculum(entries, studentLookup, actionField = 'recommendedAction') {
  const candidates = (entries || []).filter((entry) => entry[actionField] === 'graduate');
  if (candidates.length === 0) return [];

  const studentById = new Map();
  for (const entry of candidates) {
    const student = studentLookup(entry);
    if (student) studentById.set(String(student._id), student);
  }
  if (studentById.size === 0) return [];

  const gate = await curriculumProgressService.getGraduationGate([...studentById.values()]);

  const adjusted = [];
  for (const entry of candidates) {
    const student = studentById.get(String(entry.studentId));
    if (!student) continue;
    const signal = gate.get(String(student._id));
    if (!signal || signal.eligible) continue;

    entry[actionField] = 'retain';
    entry.needsReview = true;
    entry.reason = signal.curriculumResolved
      ? `Curriculum requirements incomplete (${signal.outstandingRequiredCount} required subject(s) outstanding)`
      : 'No curriculum could be resolved for this program, so graduation cannot be confirmed';
    adjusted.push({ studentId: entry.studentId, from: 'graduate', to: 'retain', reason: entry.reason });
  }
  return adjusted;
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

    const blockMap = await getAssignedBlockMap(fromSchoolYear, semester || '1st');
    const evaluations = students.map((student) => {
      const recommendation = recommendAction(student);
      return {
        studentId: String(student._id),
        studentNumber: student.studentNumber,
        name: studentDisplayName(student),
        course: student.course,
        yearLevel: student.yearLevel,
        block: blockMap.get(String(student._id)) || null,
        latestGrade: typeof student.latestGrade === 'number' ? student.latestGrade : null,
        lifecycleStatus: student.lifecycleStatus,
        recommendedAction: recommendation.action,
        reason: recommendation.reason,
        needsReview: recommendation.needsReview
      };
    });

    // Curriculum gate: never recommend graduation without the curriculum
    // agreeing that the requirements are complete.
    const curriculumAdjustments = await gateGraduationOnCurriculum(evaluations, (entry) =>
      students.find((student) => String(student._id) === entry.studentId)
    );

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
      evaluations,
      curriculumAdjustments,
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
        $lookup: {
          from: StudentBlockAssignment.collection.name,
          let: { studentId: { $toString: '$_id' } },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ['$studentId', '$$studentId'] },
                    { $eq: ['$semester', targetSemester] },
                    { $eq: ['$status', 'ASSIGNED'] },
                    { $or: [{ $eq: ['$schoolYear', fromSchoolYear] }, { $eq: ['$year', fromSchoolYear] }] },
                  ],
                },
              },
            },
            { $limit: 1 },
          ],
          as: '_blockAssignment',
        },
      },
      { $unwind: { path: '$_blockAssignment', preserveNullAndEmptyArrays: true } },
      {
        $lookup: {
          from: BlockSection.collection.name,
          localField: '_blockAssignment.sectionId',
          foreignField: '_id',
          as: '_blockSection',
        },
      },
      { $unwind: { path: '$_blockSection', preserveNullAndEmptyArrays: true } },
      {
        $addFields: {
          // Aggregation $type returns the BSON type name ("double", "int",
          // "long", "decimal") — there is no "number" alias in aggregation
          // expressions (that alias only exists in find-query $type), so the
          // numeric check must accept the individual numeric types.
          _hasGrade: {
            $in: [{ $type: '$latestGrade' }, ['double', 'int', 'long', 'decimal']],
          },
          _passed: {
            $and: [
              {
                $in: [{ $type: '$latestGrade' }, ['double', 'int', 'long', 'decimal']],
              },
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
                {
                  case: {
                    $not: [{
                      $in: [{ $type: '$latestGrade' }, ['double', 'int', 'long', 'decimal']],
                    }],
                  },
                  then: 'retain',
                },
                { case: { $gt: ['$latestGrade', PASSING_GRADE] }, then: 'retain' },
                { case: { $gte: ['$yearLevel', FINAL_YEAR_LEVEL] }, then: 'graduate' },
              ],
              default: 'promote',
            },
          },
          _needsReview: {
            $not: [{
              $in: [{ $type: '$latestGrade' }, ['double', 'int', 'long', 'decimal']],
            }],
          },
        },
      },
      {
        $group: {
          _id: {
            course: '$course',
            yearLevel: '$yearLevel',
            block: { $ifNull: ['$_blockSection.sectionCode', 'Unassigned'] },
          },
          total: { $sum: 1 },
          promote: { $sum: { $cond: [{ $eq: ['$_action', 'promote'] }, 1, 0] } },
          retain: { $sum: { $cond: [{ $eq: ['$_action', 'retain'] }, 1, 0] } },
          graduate: { $sum: { $cond: [{ $eq: ['$_action', 'graduate'] }, 1, 0] } },
          needsReview: { $sum: { $cond: ['$_needsReview', 1, 0] } },
        },
      },
      { $sort: { '_id.course': 1, '_id.yearLevel': 1, '_id.block': 1 } },
    ];

    const groupResults = await Student.aggregate(pipeline);

    const groups = groupResults.map((g) => ({
      course: g._id.course,
      courseLabel: ENROLLMENT_COURSE_BY_CODE[g._id.course] || String(g._id.course),
      yearLevel: g._id.yearLevel,
      block: g._id.block,
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
  static async previewStudents({ fromSchoolYear, semester = '1st', course, yearLevel, block, page = 1, limit = 50, search = '', filter = 'all' }) {
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
    if (block) {
      const { assignedIds, matchingIds } = await getStudentIdsForBlock({ schoolYear: fromSchoolYear, semester, block });
      query._id = block === 'Unassigned' ? { $nin: assignedIds } : { $in: matchingIds };
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

    const blockMap = await getAssignedBlockMap(fromSchoolYear, semester);
    const studentsWithEvaluations = students.map((student) => {
      const recommendation = recommendAction(student);
      return {
        studentId: String(student._id),
        studentNumber: student.studentNumber,
        name: studentDisplayName(student),
        course: student.course,
        yearLevel: student.yearLevel,
        block: blockMap.get(String(student._id)) || null,
        latestGrade: typeof student.latestGrade === 'number' ? student.latestGrade : null,
        lifecycleStatus: student.lifecycleStatus,
        recommendedAction: recommendation.action,
        reason: recommendation.reason,
        needsReview: recommendation.needsReview,
      };
    });

    await gateGraduationOnCurriculum(
      studentsWithEvaluations,
      (entry) => students.find((student) => String(student._id) === entry.studentId)
    );

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
  static async previewExceptions({ fromSchoolYear, semester = '1st', page = 1, limit = 50, search = '', course, yearLevel, block }) {
    if (!isValidSchoolYear(fromSchoolYear)) {
      throw Object.assign(new Error('fromSchoolYear must be in YYYY-YYYY format'), { statusCode: 400 });
    }

    const pageNumber = Math.max(1, Number.parseInt(page, 10) || 1);
    const limitNumber = Math.min(100, Math.max(1, Number.parseInt(limit, 10) || 50));

    const query = {
      schoolYear: fromSchoolYear,
      lifecycleStatus: { $in: ['Enrolled', 'Pending', 'Not Enrolled'] },
      // Match the summary aggregation: any non-numeric grade (missing or null)
      // is an exception that needs registrar review.
      latestGrade: { $not: { $type: 'number' } },
    };

    if (course !== undefined && course !== null && course !== '') {
      query.course = Number(course);
    }
    if (yearLevel !== undefined && yearLevel !== null && yearLevel !== '') {
      query.yearLevel = Number(yearLevel);
    }
    if (block) {
      const { assignedIds, matchingIds } = await getStudentIdsForBlock({ schoolYear: fromSchoolYear, semester, block });
      query._id = block === 'Unassigned' ? { $nin: assignedIds } : { $in: matchingIds };
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

    const [students, total] = await Promise.all([
      Student.find(query)
        .select('studentNumber firstName middleName lastName suffix course yearLevel section semester schoolYear latestGrade lifecycleStatus studentStatus')
        .sort({ course: 1, yearLevel: 1, lastName: 1 })
        .skip((pageNumber - 1) * limitNumber)
        .limit(limitNumber)
        .lean(),
      Student.countDocuments(query),
    ]);

    const blockMap = await getAssignedBlockMap(fromSchoolYear, semester);
    const exceptions = students.map((student) => {
      const recommendation = recommendAction(student);
      return {
        studentId: String(student._id),
        studentNumber: student.studentNumber,
        name: studentDisplayName(student),
        course: student.course,
        yearLevel: student.yearLevel,
        block: blockMap.get(String(student._id)) || null,
        latestGrade: typeof student.latestGrade === 'number' ? student.latestGrade : null,
        lifecycleStatus: student.lifecycleStatus,
        recommendedAction: recommendation.action,
        reason: recommendation.reason,
        needsReview: true,
      };
    });

    await gateGraduationOnCurriculum(
      exceptions,
      (entry) => students.find((student) => String(student._id) === entry.studentId)
    );

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

    const targetSemester = ['1st', '2nd', 'Summer'].includes(semester) ? semester : '1st';

    // ---- Resolve decisions from groupDecisions + decisionOverrides ----
    // If groupDecisions is provided, expand each group to individual student decisions
    // using the server-side recommendAction() logic, then apply decisionOverrides.
    let resolvedDecisions = decisions;
    let curriculumAdjustments = [];

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

        if (gd.block) {
          const { assignedIds, matchingIds } = await getStudentIdsForBlock({
            schoolYear: fromSchoolYear,
            semester: targetSemester,
            block: gd.block,
          });
          groupQuery._id = gd.block === 'Unassigned' ? { $nin: assignedIds } : { $in: matchingIds };
        }

        const groupStudents = await Student.find(groupQuery)
          .select('_id')
          .lean();

        for (const s of groupStudents) {
          resolvedDecisions.push({ studentId: String(s._id), action: gd.action });
        }
      }

      // A bulk group action is still the SERVER's default, not the registrar's
      // explicit per-student decision. Confirm graduation against the
      // curriculum before it is acted on; the overrides below run afterwards,
      // so an explicit registrar override always wins over this gate.
      const graduateStudentIds = resolvedDecisions
        .filter((d) => d.action === 'graduate')
        .map((d) => d.studentId);
      if (graduateStudentIds.length > 0) {
        const graduateStudents = await Student.find({ _id: { $in: graduateStudentIds } })
          .select('_id course curriculumVersion yearLevel')
          .lean();
        const graduateById = new Map(graduateStudents.map((s) => [String(s._id), s]));
        curriculumAdjustments = await gateGraduationOnCurriculum(
          resolvedDecisions,
          (entry) => graduateById.get(String(entry.studentId)),
          'action'
        );
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

    // A student can only have one outcome in a rollover. Group expansion and
    // overrides can overlap, so keep the first resolved decision per student.
    const seenDecisionStudentIds = new Set();
    resolvedDecisions = resolvedDecisions.filter((decision) => {
      const studentId = String(decision.studentId);
      if (seenDecisionStudentIds.has(studentId)) return false;
      seenDecisionStudentIds.add(studentId);
      return true;
    });

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
      snapshotIds: [],
      // Automatic "graduate" recommendations that the curriculum corrected to
      // "retain" — surfaced rather than applied silently.
      curriculumAdjustments
    };

    const studentChanges = [];
    let previousAcademicTerm = null;

    try {
      await session.withTransaction(async () => {
        // withTransaction may retry the whole callback after a transient error.
        // Reset in-memory accumulators so a retry cannot duplicate results or
        // corrupt the revert manifest.
        results.promoted.length = 0;
        results.retained.length = 0;
        results.graduated.length = 0;
        results.skipped.length = 0;
        results.failures.length = 0;
        results.blocksCreated.length = 0;
        results.snapshotIds.length = 0;
        studentChanges.length = 0;
        previousAcademicTerm = null;

        // Capture the term before the rollover so a revert can restore it.
        const termSetting = await SystemSetting.findOne({ key: ACADEMIC_TERM_KEY }).session(session).lean();
        previousAcademicTerm = termSetting?.value || null;

        // ---- Step 1: Archive current school year blocks (duplicate academic structure) ----
        const now = new Date();
        const closingGroups = await BlockGroup.find({
          $or: [
            { schoolYear: fromSchoolYear },
            { year: fromSchoolYear },
            { year: fromStartYear },
            { year: String(fromStartYear) },
          ],
        }).session(session).lean();

        const closingGroupIds = closingGroups.map((group) => group._id);
        const closingSections = closingGroupIds.length > 0
          ? await BlockSection.find({ blockGroupId: { $in: closingGroupIds } }).session(session).lean()
          : [];
        const closingSectionsByGroup = {};
        for (const section of closingSections) {
          const key = String(section.blockGroupId);
          if (!closingSectionsByGroup[key]) closingSectionsByGroup[key] = [];
          closingSectionsByGroup[key].push(section);
        }

        // Fetch target-year groups and sections once instead of once per cohort.
        const targetGroups = await BlockGroup.find({
          semester: targetSemester,
          $or: [
            { schoolYear: toSchoolYear },
            { year: toSchoolYear },
            { year: toStartYear },
            { year: String(toStartYear) },
          ],
        }).session(session);
        const targetGroupByCohort = new Map();
        for (const group of targetGroups) {
          targetGroupByCohort.set(`${Number(group.courseId)}_${Number(group.yearLevel)}`, group);
        }
        const targetSections = targetGroups.length > 0
          ? await BlockSection.find({ blockGroupId: { $in: targetGroups.map((group) => group._id) } }).session(session)
          : [];
        const sectionsByGroup = new Map();
        for (const section of targetSections) {
          const key = String(section.blockGroupId);
          if (!sectionsByGroup.has(key)) sectionsByGroup.set(key, []);
          sectionsByGroup.get(key).push(section);
        }

        // Cache of new-year block sections keyed by course+yearLevel
        const newSectionCache = new Map();

        const ensureBlockForCohort = async (course, yearLevel) => {
          const cacheKey = `${Number(course)}_${Number(yearLevel)}`;
          if (newSectionCache.has(cacheKey)) return newSectionCache.get(cacheKey);

          let group = targetGroupByCohort.get(cacheKey);
          if (!group) {
            const templateGroup = closingGroups.find(
              (g) => Number(g.courseId) === Number(course) && Number(g.yearLevel) === Number(yearLevel)
            );
            const name = `${course}-${yearLevel}-A`;
            const created = await BlockGroup.create([{
              name,
              courseId: Number(course),
              courseCode: templateGroup?.courseCode || String(ENROLLMENT_COURSE_BY_CODE[course] || course),
              yearLevel: Number(yearLevel),
              semester: targetSemester,
              schoolYear: toSchoolYear,
              year: toSchoolYear,
              section: 'A',
              policies: templateGroup?.policies || undefined
            }], { session });
            group = created[0];
            targetGroupByCohort.set(cacheKey, group);
            sectionsByGroup.set(String(group._id), []);
            results.blocksCreated.push({ blockGroupId: String(group._id), name: group.name });
          }

          const sections = sectionsByGroup.get(String(group._id)) || [];
          let section = sections
            .slice()
            .sort((a, b) => Number(a.currentPopulation || 0) - Number(b.currentPopulation || 0))[0];

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
            sections.push(section);
            sectionsByGroup.set(String(group._id), sections);
            results.blocksCreated.push({ sectionId: String(section._id), sectionCode: section.sectionCode });
          }

          const cohort = { group, section };
          newSectionCache.set(cacheKey, cohort);
          return cohort;
        };

        // ---- Step 2: Evaluate students and apply decisions ----
        const closingStudents = [];
        const closingEnrollments = [];

        const studentIds = [...new Set(resolvedDecisions.map((decision) => String(decision.studentId)))]
          .filter((studentId) => mongoose.Types.ObjectId.isValid(studentId));
        const studentDocs = studentIds.length > 0
          ? await Student.find({ _id: { $in: studentIds } }).session(session)
          : [];
        const studentMap = new Map(studentDocs.map((student) => [String(student._id), student]));

        // Load every current enrollment for the affected students once. Locked
        // records are included so the revert manifest captures the same set the
        // old per-student queries did.
        const currentEnrollmentDocs = studentIds.length > 0
          ? await Enrollment.find({ studentId: { $in: studentIds }, isCurrent: true }).session(session)
          : [];
        const currentEnrollmentsByStudent = new Map();
        for (const enrollment of currentEnrollmentDocs) {
          const key = String(enrollment.studentId);
          if (!currentEnrollmentsByStudent.has(key)) currentEnrollmentsByStudent.set(key, []);
          currentEnrollmentsByStudent.get(key).push(enrollment);
        }

        // Load target-year assignments once so they can be upserted in one bulk write.
        const targetAssignmentDocs = studentIds.length > 0
          ? await StudentBlockAssignment.find({
              studentId: { $in: studentIds },
              semester: targetSemester,
              $or: [
                { year: toSchoolYear },
                { year: toStartYear },
                { year: String(toStartYear) },
              ],
            }).session(session).lean()
          : [];
        const targetAssignmentByStudent = new Map();
        for (const assignment of targetAssignmentDocs) {
          if (!targetAssignmentByStudent.has(String(assignment.studentId))) {
            targetAssignmentByStudent.set(String(assignment.studentId), assignment);
          }
        }

        // Resolve active curricula once per program.
        const programCodes = [...new Set(studentDocs.map((student) => Number(student.course)).filter(Number.isFinite))];
        const programCodeValues = [...new Set([...programCodes, ...programCodes.map(String)])];
        const activeCurricula = programCodeValues.length > 0
          ? await Curriculum.find({ programCode: { $in: programCodeValues }, status: 'Active' })
              .select('_id programCode')
              .session(session)
              .lean()
          : [];
        const curriculumByProgram = new Map();
        for (const curriculum of activeCurricula) {
          const key = Number(curriculum.programCode);
          if (!curriculumByProgram.has(key)) curriculumByProgram.set(key, curriculum._id);
        }

        const newEnrollmentDocs = [];
        const oldEnrollmentOps = [];
        const studentOps = [];
        const assignmentOps = [];
        const sectionIncrements = new Map();
        const promoteRetainStudentIds = [];

        for (const decision of resolvedDecisions) {
          const student = studentMap.get(String(decision.studentId));
          if (!student) {
            results.failures.push({ studentId: decision.studentId, error: 'Student not found' });
            continue;
          }

          const closingStudentRecord = student.toObject({ minimize: false });
          closingStudents.push(closingStudentRecord);

          const studentBefore = {
            yearLevel: student.yearLevel,
            schoolYear: student.schoolYear,
            semester: student.semester,
            section: student.section ?? null,
            lifecycleStatus: student.lifecycleStatus,
            enrollmentStatus: student.enrollmentStatus,
            isActive: student.isActive,
            latestGrade: student.latestGrade,
            gradeProfessor: student.gradeProfessor,
            gradeDate: student.gradeDate,
            updatedBy: student.updatedBy || null,
          };

          if (decision.action === 'skip') {
            results.skipped.push({ studentId: String(student._id), studentNumber: student.studentNumber });
            continue;
          }

          const currentEnrollments = currentEnrollmentsByStudent.get(String(student._id)) || [];
          const currentEnrollment = currentEnrollments.find(
            (enrollment) => enrollment.schoolYear === fromSchoolYear && !enrollment.lockedAt
          ) || null;

          // ---- Freshness check: the decision must still match reality ----
          // Preview/override decisions can go stale in the minutes between
          // planning and execution: the student may have withdrawn (Inactive),
          // become Irregular, graduated, or already have been rolled over.
          // Acting on a stale decision would promote a withdrawn student or
          // double-apply the rollover, so the whole batch is aborted with a
          // clear failure list and a fresh preview is required.
          const rolloverEligibleLifecycle = ['Enrolled', 'Pending', 'Not Enrolled'];
          if (
            !sameValue(student.schoolYear, fromSchoolYear) ||
            !rolloverEligibleLifecycle.includes(student.lifecycleStatus)
          ) {
            results.failures.push({
              studentId: String(student._id),
              studentNumber: student.studentNumber,
              error: `Student no longer matches the closing school year state (schoolYear: ${student.schoolYear ?? 'none'}, lifecycleStatus: ${student.lifecycleStatus ?? 'none'}). The preview is stale — run a new preview.`,
              reasonCode: 'STALE_ROLLOVER_STATE',
            });
            continue;
          }

          // ---- Duplicate enrollment prevention ----
          // If the student already has an enrollment for the target term
          // (e.g. pre-registered for the new year), creating a second one
          // would duplicate the record, so the batch is aborted.
          if (decision.action !== 'graduate') {
            const conflictingEnrollment = currentEnrollments.find(
              (enrollment) => enrollment.schoolYear === toSchoolYear && enrollment.semester === targetSemester
            );
            if (conflictingEnrollment) {
              results.failures.push({
                studentId: String(student._id),
                studentNumber: student.studentNumber,
                error: `Student already has an enrollment for ${toSchoolYear} ${targetSemester} (${conflictingEnrollment.status}). The rollover was not applied.`,
                reasonCode: 'TARGET_ENROLLMENT_EXISTS',
              });
              continue;
            }
          }

          const previousEnrollmentBefore = currentEnrollment ? {
            _id: currentEnrollment._id,
            status: currentEnrollment.status,
            isCurrent: currentEnrollment.isCurrent,
            lockedAt: currentEnrollment.lockedAt || null,
            lockedBy: currentEnrollment.lockedBy || null,
            rolloverBatchId: currentEnrollment.rolloverBatchId || null,
            updatedBy: currentEnrollment.updatedBy || null,
          } : null;

          const otherCurrentEnrollmentIds = currentEnrollments
            .filter((enrollment) => !currentEnrollment || String(enrollment._id) !== String(currentEnrollment._id))
            .map((enrollment) => String(enrollment._id));

          const closedStatus = decision.action === 'promote'
            ? 'Completed'
            : decision.action === 'graduate'
              ? 'Graduated'
              : 'Retained';

          if (currentEnrollment) {
            closingEnrollments.push(currentEnrollment.toObject({ minimize: false }));
            oldEnrollmentOps.push({
              updateOne: {
                filter: { _id: currentEnrollment._id, lockedAt: null },
                update: {
                  $set: {
                    status: closedStatus,
                    isCurrent: false,
                    lockedAt: now,
                    lockedBy: adminId,
                    rolloverBatchId,
                    updatedBy: adminId,
                    updatedAt: now,
                  },
                },
              },
            });
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

            studentOps.push({
              updateOne: {
                filter: { _id: student._id },
                update: {
                  $set: {
                    lifecycleStatus: 'Graduated',
                    enrollmentStatus: 'Not Enrolled',
                    isActive: false,
                    updatedBy: adminId,
                    updatedAt: now,
                  },
                },
              },
            });

            studentChanges.push({
              studentId: String(student._id),
              studentNumber: student.studentNumber,
              action: decision.action,
              studentBefore,
              studentAfter: {
                yearLevel: student.yearLevel,
                schoolYear: student.schoolYear,
                semester: student.semester,
                section: student.section,
                lifecycleStatus: student.lifecycleStatus,
                enrollmentStatus: student.enrollmentStatus,
                isActive: student.isActive,
              },
              previousEnrollment: previousEnrollmentBefore,
              otherCurrentEnrollmentIds: [],
              newEnrollmentId: null,
              newYearLevel: student.yearLevel,
              newSectionId: null,
              newSectionCode: null,
              previousBlockAssignment: null,
              newBlockAssignmentId: null,
            });

            results.graduated.push({ ...entry, toYearLevel: student.yearLevel });
            continue;
          }

          // Promotion and retention both create a NEW enrollment record.
          const newYearLevel = decision.action === 'promote'
            ? Math.min(Number(student.yearLevel) + 1, 5)
            : Number(student.yearLevel);

          const { section } = await ensureBlockForCohort(student.course, newYearLevel);

          const newCurriculumId = (currentEnrollment && currentEnrollment.curriculumId)
            ? currentEnrollment.curriculumId
            : (curriculumByProgram.get(Number(student.course)) || null);

          const newEnrollmentId = new mongoose.Types.ObjectId();
          newEnrollmentDocs.push({
            _id: newEnrollmentId,
            studentId: student._id,
            studentNumber: student.studentNumber,
            schoolYear: toSchoolYear,
            semester: targetSemester,
            yearLevel: newYearLevel,
            course: ENROLLMENT_COURSE_BY_CODE[student.course] || 'BEED',
            curriculumId: newCurriculumId,
            subjects: [],
            assessment: {
              tuitionFee: 0,
              miscFee: 0,
              otherFees: 0,
              totalAmount: 0,
              discount: 0,
              balance: 0,
              paymentStatus: 'Fully Paid',
              paymentHistory: [],
            },
            status: 'Enrolled',
            isCurrent: true,
            rolloverBatchId,
            previousEnrollmentId: currentEnrollment ? currentEnrollment._id : null,
            createdBy: adminId,
            createdAt: now,
            updatedAt: now,
          });

          const previousBlockAssignment = targetAssignmentByStudent.get(String(student._id)) || null;
          const previousBlockAssignmentBefore = previousBlockAssignment ? {
            _id: previousBlockAssignment._id,
            enrollmentId: previousBlockAssignment.enrollmentId || null,
            sectionId: previousBlockAssignment.sectionId,
            semester: previousBlockAssignment.semester,
            year: previousBlockAssignment.year,
            schoolYear: previousBlockAssignment.schoolYear || null,
            status: previousBlockAssignment.status,
            assignedAt: previousBlockAssignment.assignedAt || null,
            waitlistPriority: previousBlockAssignment.waitlistPriority ?? null,
          } : null;

          const assignmentId = previousBlockAssignment?._id || new mongoose.Types.ObjectId();
          assignmentOps.push({
            updateOne: {
              filter: { _id: assignmentId },
              update: {
                $set: {
                  studentId: String(student._id),
                  sectionId: section._id,
                  semester: targetSemester,
                  year: toSchoolYear,
                  schoolYear: toSchoolYear,
                  status: 'ASSIGNED',
                  assignedAt: now,
                  updatedAt: now,
                },
                $setOnInsert: { createdAt: now },
              },
              upsert: true,
            },
          });

          const sectionKey = String(section._id);
          sectionIncrements.set(sectionKey, (sectionIncrements.get(sectionKey) || 0) + 1);
          promoteRetainStudentIds.push(student._id);

          // Move the student forward in memory; the actual write is batched below.
          student.yearLevel = newYearLevel;
          student.schoolYear = toSchoolYear;
          student.semester = targetSemester;
          student.section = section.sectionCode;
          student.lifecycleStatus = 'Enrolled';
          student.enrollmentStatus = 'Enrolled';
          student.updatedBy = adminId;

          studentOps.push({
            updateOne: {
              filter: { _id: student._id },
              update: {
                $set: {
                  yearLevel: newYearLevel,
                  schoolYear: toSchoolYear,
                  semester: targetSemester,
                  section: section.sectionCode,
                  lifecycleStatus: 'Enrolled',
                  enrollmentStatus: 'Enrolled',
                  updatedBy: adminId,
                  updatedAt: now,
                },
              },
            },
          });

          studentChanges.push({
            studentId: String(student._id),
            studentNumber: student.studentNumber,
            action: decision.action,
            studentBefore,
            studentAfter: {
              yearLevel: student.yearLevel,
              schoolYear: student.schoolYear,
              semester: student.semester,
              section: student.section,
              lifecycleStatus: student.lifecycleStatus,
              enrollmentStatus: student.enrollmentStatus,
              isActive: student.isActive,
            },
            previousEnrollment: previousEnrollmentBefore,
            otherCurrentEnrollmentIds,
            newEnrollmentId: String(newEnrollmentId),
            newYearLevel,
            newSectionId: String(section._id),
            newSectionCode: section.sectionCode,
            previousBlockAssignment: previousBlockAssignmentBefore,
            newBlockAssignmentId: String(assignmentId),
          });

          const resultEntry = { ...entry, toYearLevel: newYearLevel, newEnrollmentId: String(newEnrollmentId), newSection: section.sectionCode };
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

        // ---- Step 2b: Apply all batched writes ----
        // Retire every current enrollment for promote/retain students before
        // inserting the new current enrollment, otherwise that insert would be
        // immediately retired by this update.
        if (promoteRetainStudentIds.length > 0) {
          await Enrollment.updateMany(
            { studentId: { $in: promoteRetainStudentIds }, isCurrent: true },
            { $set: { isCurrent: false } },
            { session }
          );
        }

        if (oldEnrollmentOps.length > 0) {
          const oldEnrollmentResult = await Enrollment.bulkWrite(oldEnrollmentOps, { session });
          if (oldEnrollmentResult.matchedCount !== oldEnrollmentOps.length) {
            throw Object.assign(
              new Error('A closing enrollment changed during the rollover. No changes were applied.'),
              { statusCode: 409 }
            );
          }
        }

        if (newEnrollmentDocs.length > 0) {
          await Enrollment.insertMany(newEnrollmentDocs, { session, ordered: true });
        }

        if (studentOps.length > 0) {
          const studentResult = await Student.bulkWrite(studentOps, { session });
          if (studentResult.matchedCount !== studentOps.length) {
            throw Object.assign(
              new Error('A student record changed during the rollover. No changes were applied.'),
              { statusCode: 409 }
            );
          }
        }

        if (assignmentOps.length > 0) {
          await StudentBlockAssignment.bulkWrite(assignmentOps, { session });
        }

        if (sectionIncrements.size > 0) {
          const sectionResult = await BlockSection.bulkWrite(
            [...sectionIncrements.entries()].map(([sectionId, increment]) => ({
              updateOne: {
                filter: { _id: sectionId },
                update: { $inc: { currentPopulation: increment } },
              },
            })),
            { session }
          );
          if (sectionResult.matchedCount !== sectionIncrements.size) {
            throw Object.assign(
              new Error('A block section changed during the rollover. No changes were applied.'),
              { statusCode: 409 }
            );
          }
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

        // ---- Step 3b: Persist the reversible rollover manifest ----
        const createdBlockGroupIds = results.blocksCreated
          .filter((item) => item.blockGroupId)
          .map((item) => item.blockGroupId);
        const createdBlockSectionIds = results.blocksCreated
          .filter((item) => item.sectionId)
          .map((item) => item.sectionId);

        await RolloverBatch.create([{
          batchId: rolloverBatchId,
          fromSchoolYear,
          toSchoolYear,
          semester: targetSemester,
          status: 'applied',
          executedAt: now,
          executedBy: adminId,
          previousAcademicTerm,
          createdBlockGroupIds,
          createdBlockSectionIds,
          studentChanges,
          counts,
          snapshotIds: results.snapshotIds,
        }], { session });

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

  /**
   * Latest rollover manifest summary for the registrar UI.
   * Student-level changes are intentionally excluded from this payload.
   */
  static async getLatestRolloverBatch() {
    return RolloverBatch.findOne({})
      .sort({ executedAt: -1 })
      .select('-studentChanges')
      .populate('executedBy', 'username displayName')
      .populate('revertedBy', 'username displayName')
      .lean();
  }

  /**
   * Revert the most recent applied rollover.
   *
   * Safety rules:
   *   - only the latest applied batch can be reverted
   *   - the active academic term must still be the batch's target term
   *   - every student/enrollment/assignment must still match the post-rollover state
   *   - new enrollments must not contain grades or payments
   *   - blocks/sections created by the rollover must not contain outside students
   *
   * The entire revert runs in one MongoDB transaction.
   */
  static async revertRollover({ batchId, adminId, adminRole }) {
    if (!batchId || typeof batchId !== 'string') {
      throw Object.assign(new Error('A rollover batch id is required.'), { statusCode: 400 });
    }
    if (!adminId) {
      throw Object.assign(new Error('An initiating admin is required.'), { statusCode: 400 });
    }

    const existingBatch = await RolloverBatch.findOne({ batchId }).lean();
    if (!existingBatch) {
      throw Object.assign(new Error('Rollover batch not found.'), { statusCode: 404 });
    }
    if (existingBatch.status !== 'applied') {
      throw Object.assign(new Error('This rollover has already been reverted.'), { statusCode: 409 });
    }

    const latestApplied = await RolloverBatch.findOne({ status: 'applied' })
      .sort({ executedAt: -1 })
      .select('batchId')
      .lean();
    if (!latestApplied || latestApplied.batchId !== batchId) {
      throw Object.assign(new Error('Only the most recent applied rollover can be reverted.'), { statusCode: 409 });
    }

    const session = await mongoose.startSession();
    let summary = null;

    try {
      summary = await session.withTransaction(async () => {
        const batch = await RolloverBatch.findOne({ batchId }).session(session);
        if (!batch) {
          throw Object.assign(new Error('Rollover batch not found.'), { statusCode: 404 });
        }
        if (batch.status !== 'applied') {
          throw Object.assign(new Error('This rollover has already been reverted.'), { statusCode: 409 });
        }

        const latestInsideTransaction = await RolloverBatch.findOne({ status: 'applied' })
          .sort({ executedAt: -1 })
          .select('batchId')
          .session(session)
          .lean();
        if (!latestInsideTransaction || latestInsideTransaction.batchId !== batchId) {
          throw Object.assign(new Error('Only the most recent applied rollover can be reverted.'), { statusCode: 409 });
        }

        const termSetting = await SystemSetting.findOne({ key: ACADEMIC_TERM_KEY }).session(session).lean();
        const activeTerm = termSetting?.value || null;
        if (!activeTerm || !sameValue(activeTerm.schoolYear, batch.toSchoolYear) || !sameValue(activeTerm.semester, batch.semester)) {
          throw Object.assign(
            new Error('The active academic term has changed since this rollover. Revert is blocked.'),
            { statusCode: 409 }
          );
        }

        const changes = Array.isArray(batch.studentChanges) ? batch.studentChanges : [];
        if (changes.length === 0) {
          throw Object.assign(
            new Error('This rollover has no revert manifest. It cannot be reverted automatically.'),
            { statusCode: 409 }
          );
        }

        const studentIds = uniqueIdStrings(changes.map((change) => change.studentId));
        const newEnrollmentIds = uniqueIdStrings(changes.map((change) => change.newEnrollmentId));
        const previousEnrollmentIds = uniqueIdStrings(changes.map((change) => change.previousEnrollment?._id));
        const newAssignmentIds = uniqueIdStrings(changes.map((change) => change.newBlockAssignmentId));
        const previousAssignmentIds = uniqueIdStrings(changes.map((change) => change.previousBlockAssignment?._id));
        const createdSectionIds = uniqueIdStrings(batch.createdBlockSectionIds);
        const createdGroupIds = uniqueIdStrings(batch.createdBlockGroupIds);

        const [students, newEnrollments, previousEnrollments, newAssignments, previousAssignments] = await Promise.all([
          Student.find({ _id: { $in: studentIds } }).session(session).lean(),
          newEnrollmentIds.length
            ? Enrollment.find({ _id: { $in: newEnrollmentIds } }).session(session).lean()
            : [],
          previousEnrollmentIds.length
            ? Enrollment.find({ _id: { $in: previousEnrollmentIds } }).session(session).lean()
            : [],
          newAssignmentIds.length
            ? StudentBlockAssignment.find({ _id: { $in: newAssignmentIds } }).session(session).lean()
            : [],
          previousAssignmentIds.length
            ? StudentBlockAssignment.find({ _id: { $in: previousAssignmentIds } }).session(session).lean()
            : [],
        ]);

        const byId = (documents) => new Map(documents.map((document) => [String(document._id), document]));
        const studentMap = byId(students);
        const newEnrollmentMap = byId(newEnrollments);
        const previousEnrollmentMap = byId(previousEnrollments);
        const newAssignmentMap = byId(newAssignments);
        const previousAssignmentMap = byId(previousAssignments);

        // ---- Preflight: nothing is written until every record is safe to restore ----
        for (const change of changes) {
          const label = change.studentNumber || change.studentId;
          const student = studentMap.get(String(change.studentId));
          if (!student) {
            throw Object.assign(new Error(`Student ${label} no longer exists. Revert is blocked.`), { statusCode: 409 });
          }

          const after = change.studentAfter || {};
          for (const field of ['yearLevel', 'schoolYear', 'semester', 'section', 'lifecycleStatus', 'enrollmentStatus', 'isActive']) {
            if (!sameValue(student[field], after[field])) {
              throw Object.assign(
                new Error(`Student ${label} changed after the rollover (${field}). Revert is blocked.`),
                { statusCode: 409 }
              );
            }
          }

          if (change.newEnrollmentId) {
            const newEnrollment = newEnrollmentMap.get(String(change.newEnrollmentId));
            if (!newEnrollment) {
              throw Object.assign(new Error(`New enrollment for ${label} was not found. Revert is blocked.`), { statusCode: 409 });
            }
            if (newEnrollment.rolloverBatchId !== batch.batchId) {
              throw Object.assign(new Error(`New enrollment for ${label} does not belong to this rollover. Revert is blocked.`), { statusCode: 409 });
            }
            if (!newEnrollment.isCurrent || newEnrollment.lockedAt) {
              throw Object.assign(new Error(`New enrollment for ${label} is no longer active. Revert is blocked.`), { statusCode: 409 });
            }
            if (!sameValue(newEnrollment.schoolYear, batch.toSchoolYear) || !sameValue(newEnrollment.semester, batch.semester)) {
              throw Object.assign(new Error(`New enrollment for ${label} is outside the rollover term. Revert is blocked.`), { statusCode: 409 });
            }
            if (Number(newEnrollment.yearLevel) !== Number(change.newYearLevel)) {
              throw Object.assign(new Error(`New enrollment for ${label} has an unexpected year level. Revert is blocked.`), { statusCode: 409 });
            }

            // Documented safety rule: a new enrollment may only be deleted by
            // a revert while it is untouched. Grades, grade marks, raw scores,
            // an active submission workflow, or recorded payments are
            // legitimate post-rollover changes that would otherwise be
            // silently destroyed, so the revert is blocked for review.
            const gradedSubjects = (newEnrollment.subjects || []).filter(
              (subject) =>
                typeof subject.grade === 'number' ||
                subject.gradeMark != null ||
                (subject.rawScore != null && subject.rawScore !== undefined) ||
                (subject.submissionStatus && subject.submissionStatus !== 'Draft')
            );
            if (gradedSubjects.length > 0) {
              throw Object.assign(
                new Error(`New enrollment for ${label} already carries ${gradedSubjects.length} subject grade record(s). Revert is blocked to preserve academic history.`),
                { statusCode: 409 }
              );
            }
            if (newEnrollment.gradeSubmission && newEnrollment.gradeSubmission.status && newEnrollment.gradeSubmission.status !== 'Draft') {
              throw Object.assign(
                new Error(`New enrollment for ${label} has an active grade submission (${newEnrollment.gradeSubmission.status}). Revert is blocked to preserve academic history.`),
                { statusCode: 409 }
              );
            }
            const recordedPayments = (newEnrollment.assessment?.paymentHistory || []);
            if (recordedPayments.length > 0) {
              throw Object.assign(
                new Error(`New enrollment for ${label} has ${recordedPayments.length} recorded payment(s). Revert is blocked to preserve financial records.`),
                { statusCode: 409 }
              );
            }
          }

          if (change.previousEnrollment?._id) {
            const previousEnrollment = previousEnrollmentMap.get(String(change.previousEnrollment._id));
            if (!previousEnrollment) {
              throw Object.assign(new Error(`Closing enrollment for ${label} was not found. Revert is blocked.`), { statusCode: 409 });
            }
            if (previousEnrollment.rolloverBatchId !== batch.batchId) {
              throw Object.assign(new Error(`Closing enrollment for ${label} does not belong to this rollover. Revert is blocked.`), { statusCode: 409 });
            }
            if (!previousEnrollment.lockedAt || previousEnrollment.isCurrent) {
              throw Object.assign(new Error(`Closing enrollment for ${label} is no longer locked. Revert is blocked.`), { statusCode: 409 });
            }
          }

          if (change.newBlockAssignmentId) {
            const assignment = newAssignmentMap.get(String(change.newBlockAssignmentId));
            if (!assignment) {
              throw Object.assign(new Error(`New block assignment for ${label} was not found. Revert is blocked.`), { statusCode: 409 });
            }
            if (!sameValue(assignment.sectionId, change.newSectionId)) {
              throw Object.assign(new Error(`New block assignment for ${label} points to a different section. Revert is blocked.`), { statusCode: 409 });
            }
            if (assignment.status !== 'ASSIGNED' || !sameValue(assignment.year, batch.toSchoolYear)) {
              throw Object.assign(new Error(`New block assignment for ${label} has changed. Revert is blocked.`), { statusCode: 409 });
            }
          }

          if (change.previousBlockAssignment?._id) {
            if (!previousAssignmentMap.has(String(change.previousBlockAssignment._id))) {
              throw Object.assign(new Error(`Previous block assignment for ${label} was not found. Revert is blocked.`), { statusCode: 409 });
            }
          }
        }

        const otherCurrentEnrollmentIds = uniqueIdStrings(
          changes.flatMap((change) => change.otherCurrentEnrollmentIds || [])
        );
        if (otherCurrentEnrollmentIds.length > 0) {
          const otherCurrentEnrollments = await Enrollment.find({
            _id: { $in: otherCurrentEnrollmentIds },
          }).session(session).select('_id lockedAt').lean();
          if (otherCurrentEnrollments.length !== otherCurrentEnrollmentIds.length) {
            throw Object.assign(
              new Error('A current enrollment that existed before the rollover was removed. Revert is blocked.'),
              { statusCode: 409 }
            );
          }
          if (otherCurrentEnrollments.some((enrollment) => enrollment.lockedAt)) {
            throw Object.assign(
              new Error('A current enrollment that existed before the rollover has been locked. Revert is blocked.'),
              { statusCode: 409 }
            );
          }
        }

        if (createdSectionIds.length > 0) {
          const assignmentsInCreatedSections = await StudentBlockAssignment.find({
            sectionId: { $in: createdSectionIds },
          }).session(session).select('_id sectionId').lean();
          const allowedAssignmentIds = new Set(newAssignmentIds);
          for (const assignment of assignmentsInCreatedSections) {
            if (!allowedAssignmentIds.has(String(assignment._id))) {
              throw Object.assign(
                new Error('A block section created by this rollover now has students from outside the rollover. Revert is blocked.'),
                { statusCode: 409 }
              );
            }
          }
        }

        if (createdGroupIds.length > 0) {
          const sectionsInCreatedGroups = await BlockSection.find({
            blockGroupId: { $in: createdGroupIds },
          }).session(session).select('_id blockGroupId').lean();
          const allowedSectionIds = new Set(createdSectionIds);
          for (const section of sectionsInCreatedGroups) {
            if (!allowedSectionIds.has(String(section._id))) {
              throw Object.assign(
                new Error('A block group created by this rollover now has sections from outside the rollover. Revert is blocked.'),
                { statusCode: 409 }
              );
            }
          }
        }

        // ---- Apply the revert ----
        if (newEnrollmentIds.length > 0) {
          await Enrollment.deleteMany({
            _id: { $in: newEnrollmentIds },
            lockedAt: null,
          }).session(session);
        }

        const previousEnrollmentOps = changes
          .filter((change) => change.previousEnrollment?._id)
          .map((change) => ({
            updateOne: {
              filter: { _id: change.previousEnrollment._id },
              update: {
                $set: {
                  status: change.previousEnrollment.status,
                  isCurrent: change.previousEnrollment.isCurrent,
                  lockedAt: change.previousEnrollment.lockedAt ?? null,
                  lockedBy: change.previousEnrollment.lockedBy ?? null,
                  rolloverBatchId: change.previousEnrollment.rolloverBatchId ?? null,
                  updatedBy: change.previousEnrollment.updatedBy ?? null,
                },
              },
            },
          }));
        if (previousEnrollmentOps.length > 0) {
          // bulkWrite bypasses the read-only guard, which is required here:
          // the revert intentionally unlocks the historical enrollment.
          await Enrollment.bulkWrite(previousEnrollmentOps, { session });
        }

        if (otherCurrentEnrollmentIds.length > 0) {
          await Enrollment.updateMany(
            { _id: { $in: otherCurrentEnrollmentIds }, lockedAt: null },
            { $set: { isCurrent: true } },
            { session }
          );
        }

        // Batched: one round trip per model instead of one per student. A
        // 168-student revert used to spend most of its time here.
        // Note: latestGrade/gradeProfessor/gradeDate are intentionally NOT
        // restored — the rollover never changed them (revert must only reverse
        // changes attributable to this rollover), and restoring them would
        // silently overwrite a later authorized grade correction.
        const studentOps = changes
          .filter((change) => change.studentBefore)
          .map((change) => ({
            updateOne: {
              filter: { _id: change.studentId },
              update: {
                $set: {
                  yearLevel: change.studentBefore.yearLevel,
                  schoolYear: change.studentBefore.schoolYear,
                  semester: change.studentBefore.semester,
                  section: change.studentBefore.section ?? null,
                  lifecycleStatus: change.studentBefore.lifecycleStatus,
                  enrollmentStatus: change.studentBefore.enrollmentStatus,
                  isActive: change.studentBefore.isActive,
                  updatedBy: change.studentBefore.updatedBy ?? null,
                },
              },
            },
          }));
        if (studentOps.length > 0) {
          await Student.bulkWrite(studentOps, { session });
        }

        const populationDecrements = new Map();
        const assignmentOps = [];
        for (const change of changes) {
          const previousAssignment = change.previousBlockAssignment;
          const newAssignmentId = change.newBlockAssignmentId;

          if (previousAssignment?._id && newAssignmentId && String(previousAssignment._id) !== String(newAssignmentId)) {
            assignmentOps.push({ deleteOne: { filter: { _id: newAssignmentId } } });
          }

          if (previousAssignment?._id) {
            assignmentOps.push({
              updateOne: {
                filter: { _id: previousAssignment._id },
                update: {
                  $set: {
                    enrollmentId: previousAssignment.enrollmentId ?? null,
                    sectionId: previousAssignment.sectionId,
                    semester: previousAssignment.semester,
                    year: previousAssignment.year,
                    schoolYear: previousAssignment.schoolYear ?? null,
                    status: previousAssignment.status,
                    assignedAt: previousAssignment.assignedAt ?? null,
                    waitlistPriority: previousAssignment.waitlistPriority ?? null,
                  },
                },
                upsert: true,
              },
            });
          } else if (newAssignmentId) {
            assignmentOps.push({ deleteOne: { filter: { _id: newAssignmentId } } });
          }

          if (change.newSectionId) {
            const sectionKey = String(change.newSectionId);
            populationDecrements.set(sectionKey, (populationDecrements.get(sectionKey) || 0) + 1);
          }
        }
        if (assignmentOps.length > 0) {
          await StudentBlockAssignment.bulkWrite(assignmentOps, { session });
        }

        if (populationDecrements.size > 0) {
          const affectedSections = await BlockSection.find({ _id: { $in: [...populationDecrements.keys()] } })
            .session(session)
            .lean();
          const sectionOps = affectedSections.map((section) => {
            const decrement = populationDecrements.get(String(section._id)) || 0;
            return {
              updateOne: {
                filter: { _id: section._id },
                update: { $set: { currentPopulation: Math.max(0, Number(section.currentPopulation || 0) - decrement) } },
              },
            };
          });
          if (sectionOps.length > 0) {
            await BlockSection.bulkWrite(sectionOps, { session });
          }
        }

        // Only remove blocks/sections this batch created, and only once nothing
        // is left pointing at them.
        let removedSections = 0;
        if (createdSectionIds.length > 0) {
          const remainingBySection = await StudentBlockAssignment.aggregate([
            { $match: { sectionId: { $in: createdSectionIds } } },
            { $group: { _id: '$sectionId', count: { $sum: 1 } } },
          ]).session(session);
          const occupied = new Set(remainingBySection.map((row) => String(row._id)));
          const emptySectionIds = createdSectionIds.filter((id) => !occupied.has(String(id)));
          if (emptySectionIds.length > 0) {
            const deletion = await BlockSection.deleteMany({ _id: { $in: emptySectionIds } }).session(session);
            removedSections = deletion?.deletedCount || 0;
          }
        }

        let removedGroups = 0;
        if (createdGroupIds.length > 0) {
          const remainingByGroup = await BlockSection.aggregate([
            { $match: { blockGroupId: { $in: createdGroupIds } } },
            { $group: { _id: '$blockGroupId', count: { $sum: 1 } } },
          ]).session(session);
          const occupied = new Set(remainingByGroup.map((row) => String(row._id)));
          const emptyGroupIds = createdGroupIds.filter((id) => !occupied.has(String(id)));
          if (emptyGroupIds.length > 0) {
            const deletion = await BlockGroup.deleteMany({ _id: { $in: emptyGroupIds } }).session(session);
            removedGroups = deletion?.deletedCount || 0;
          }
        }

        const restoredAcademicTerm = batch.previousAcademicTerm || {
          schoolYear: batch.fromSchoolYear,
          semester: batch.semester,
        };
        await SystemSetting.findOneAndUpdate(
          { key: ACADEMIC_TERM_KEY },
          { $set: { value: restoredAcademicTerm } },
          { upsert: true, session }
        );

        const revertedAt = new Date();
        batch.status = 'reverted';
        batch.revertedAt = revertedAt;
        batch.revertedBy = adminId;
        await batch.save({ session });

        const auditRole = ['admin', 'registrar'].includes(String(adminRole || '').toLowerCase())
          ? String(adminRole).toLowerCase()
          : 'registrar';
        const [auditLog] = await AuditLog.create([{
          action: 'RESTORE',
          resourceType: 'SYSTEM',
          resourceId: batch.batchId,
          resourceName: `Academic Year Rollover Reverted ${batch.fromSchoolYear} -> ${batch.toSchoolYear}`,
          description: `School year rollover reverted: ${batch.counts?.promoted || 0} promoted, ${batch.counts?.retained || 0} retained, ${batch.counts?.graduated || 0} graduated restored.`,
          performedBy: adminId,
          performedByRole: auditRole,
          status: 'SUCCESS',
          severity: 'HIGH',
        }], { session });
        batch.revertAuditLogId = auditLog._id;
        await batch.save({ session });

        const [revertSnapshot] = await ArchiveSnapshot.create([{
          type: 'ROLLOVER_REVERT',
          title: `Rollover Reverted - SY ${batch.fromSchoolYear} to SY ${batch.toSchoolYear}`,
          schoolYear: batch.fromSchoolYear,
          newSchoolYear: batch.toSchoolYear,
          semester: batch.semester,
          rolloverBatchId: batch.batchId,
          data: {
            action: 'REVERT',
            revertedAt: revertedAt.toISOString(),
            revertedBy: String(adminId),
            previousAcademicTerm: restoredAcademicTerm,
            counts: batch.counts,
          },
          counts: batch.counts || {},
          generatedBy: adminId,
        }], { session });
        batch.revertSnapshotId = revertSnapshot._id;
        await batch.save({ session });

        return {
          rolloverBatchId: batch.batchId,
          fromSchoolYear: batch.fromSchoolYear,
          toSchoolYear: batch.toSchoolYear,
          semester: batch.semester,
          revertedAt: revertedAt.toISOString(),
          restoredStudents: changes.length,
          deletedEnrollments: newEnrollmentIds.length,
          restoredEnrollments: previousEnrollmentIds.length,
          restoredAcademicTerm,
          removedSections,
          removedGroups,
        };
      });
    } finally {
      await session.endSession();
    }

    if (summary) {
      eventBus.emit(DomainEvents.ROLLOVER_REVERTED, {
        rolloverBatchId: summary.rolloverBatchId,
        fromSchoolYear: summary.fromSchoolYear,
        toSchoolYear: summary.toSchoolYear,
        semester: summary.semester,
        adminId,
        correlationId: summary.rolloverBatchId,
      });
    }

    return summary;
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
