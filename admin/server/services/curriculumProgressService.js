/**
 * Curriculum Progress Service — evaluates a student against their applicable
 * CURRICULUM rather than against a block label.
 *
 * A block is a cohort label. It says nothing about what a student has
 * finished, so it must never be the basis for promotion or graduation. This
 * service derives the three things the system actually needs to know:
 *
 *   1. requirement status — for every placement in the student's curriculum,
 *      is it Completed, Failed, Dropped, In Progress, or Outstanding?
 *   2. retake reconciliation — a later passing attempt clears an earlier
 *      Dropped or Failed one; the earlier attempt stays on record.
 *   3. progression and graduation eligibility — derived from those statuses.
 *
 * Attempts outside the curriculum (transferred-in subjects, subjects taken
 * under an older curriculum version) are reported separately so they are
 * visible without silently satisfying a requirement the curriculum does not
 * actually list.
 */

const Enrollment = require('../models/Enrollment');
const Curriculum = require('../models/Curriculum');
const CurriculumSubject = require('../models/CurriculumSubject');
const { resolveCurriculum } = require('./enrollmentService');
const { loadEnrollmentHistory, isRequirementSatisfied, PASSING_GRADE, hasCompleteRetakeSnapshot, verifyRetakeReferences } = require('./subjectEnrollmentService');

const MAX_YEAR_LEVEL = 6;

const STATUS = {
  COMPLETED: 'Completed',
  FAILED: 'Failed',
  DROPPED: 'Dropped',
  IN_PROGRESS: 'In Progress',
  OUTSTANDING: 'Outstanding',
};

/** Official subject statuses that still count as an open attempt. */
const OPEN_SUBJECT_STATUSES = ['Enrolled', 'Incomplete'];

function isFailingAttempt(entry) {
  if (!entry) return false;
  if (entry.status === 'Failed') return true;
  if (String(entry.gradeMark || '').trim().toUpperCase() === 'FA') return true;
  return typeof entry.grade === 'number' && entry.grade > PASSING_GRADE;
}

/** True when the attempt was stopped and is now a dropped/withdrawn record. */
function isDroppedAttempt(entry) {
  if (!entry) return false;
  if (entry.status === 'Dropped' || entry.status === 'Removed') return true;
  const mark = String(entry.gradeMark || '').trim().toUpperCase();
  return mark === 'DRP' || mark === 'W';
}

/**
 * True when the attempt already carries an official outcome. A professor may
 * record FA/DRP without changing the subject's lifecycle status, so an
 * `Enrolled` row with a grade or mark is no longer an open attempt.
 */
function hasRecordedOutcome(entry) {
  if (!entry) return false;
  if (typeof entry.grade === 'number') return true;
  if (String(entry.gradeMark || '').trim()) return true;
  return ['Completed', 'Failed', 'Dropped', 'Removed'].includes(entry.status);
}

function isOpenAttempt(entry) {
  return Boolean(entry)
    && OPEN_SUBJECT_STATUSES.includes(entry.status)
    && !hasRecordedOutcome(entry);
}

/**
 * Reduce every attempt a student has made at one subject into a single status.
 *
 * Precedence: Completed > In Progress (a genuinely open attempt) > Failed >
 * Dropped > In Progress (an incomplete/no-grade mark). A retake that passed
 * clears an earlier failure; an outstanding retake keeps the requirement In
 * Progress, never Completed. A recorded FA/DRP/W outcome on an `Enrolled` row
 * is terminal, not "in progress".
 */
function deriveRequirementStatus(attempts) {
  if (!attempts || attempts.length === 0) return { status: STATUS.OUTSTANDING, attempts: [] };

  if (attempts.some(isRequirementSatisfied)) {
    const passing = attempts.find(isRequirementSatisfied);
    return {
      status: STATUS.COMPLETED,
      attempts,
      completedWith: {
        schoolYear: passing.schoolYear,
        semester: passing.semester,
        grade: typeof passing.grade === 'number' ? passing.grade : null,
      },
    };
  }

  if (attempts.some(isOpenAttempt)) {
    return { status: STATUS.IN_PROGRESS, attempts };
  }

  if (attempts.some(isFailingAttempt)) {
    return { status: STATUS.FAILED, attempts };
  }

  if (attempts.some(isDroppedAttempt)) {
    return { status: STATUS.DROPPED, attempts };
  }

  // INC/NG (and legacy rows with no grade data) are recorded outcomes, but
  // they are neither a failure nor a drop. They remain in progress until the
  // requirement is completed or retaken.
  return { status: STATUS.IN_PROGRESS, attempts };
}

/**
 * Flatten a student's enrollment history into per-subject attempt lists.
 */
function indexAttemptsBySubject(enrollments) {
  const bySubject = new Map();
  for (const enrollment of enrollments || []) {
    for (const entry of enrollment.subjects || []) {
      const key = String(entry.subjectId);
      if (!bySubject.has(key)) bySubject.set(key, []);
      bySubject.get(key).push({
        ...entry,
        schoolYear: enrollment.schoolYear,
        semester: enrollment.semester,
        enrollmentId: enrollment._id,
        enrollmentStatus: enrollment.status,
        locked: Boolean(enrollment.lockedAt),
      });
    }
  }
  for (const list of bySubject.values()) {
    list.sort((a, b) => {
      const aStart = Number(String(a.schoolYear || '').split('-')[0]) || 0;
      const bStart = Number(String(b.schoolYear || '').split('-')[0]) || 0;
      return aStart - bStart;
    });
  }
  return bySubject;
}

/**
 * Evaluate a resolved curriculum against a student's attempt history.
 *
 * Pure: takes already-loaded data so it can be unit tested and reused by the
 * bulk (rollover) path without extra queries.
 *
 * @param {Object} params
 * @param {Object} params.curriculum
 * @param {Object[]} params.placements - CurriculumSubject rows for that curriculum
 * @param {Object[]} params.enrollments - the student's enrollment history
 * @param {Object} params.student
 * @returns {Object} progress report
 */
function evaluateProgress({ curriculum, placements, enrollments, student }) {
  // Only retakeOf snapshots that resolve to a real, earlier attempt of the same
  // subject in the student's own history may mark an attempt as a retake;
  // everything else is treated as a regular attempt.
  verifyRetakeReferences(enrollments);
  const attemptsBySubject = indexAttemptsBySubject(enrollments);
  const placementSubjectIds = new Set((placements || []).map((p) => String(p.subjectId)));

  const requirements = (placements || []).map((placement) => {
    const attempts = attemptsBySubject.get(String(placement.subjectId)) || [];
    const derived = deriveRequirementStatus(attempts);
    return {
      curriculumSubjectId: String(placement._id),
      subjectId: String(placement.subjectId),
      code: placement.courseNo,
      title: placement.descriptiveTitle,
      units: placement.units || 0,
      isRequired: placement.isRequired !== false,
      type: placement.type,
      yearLevel: placement.yearLevel,
      semester: placement.semester,
      status: derived.status,
      completedWith: derived.completedWith || null,
      attempts: attempts.map((entry) => ({
        schoolYear: entry.schoolYear,
        semester: entry.semester,
        status: entry.status,
        grade: typeof entry.grade === 'number' ? entry.grade : null,
        gradeMark: entry.gradeMark || null,
        locked: entry.locked,
        isRetake: hasCompleteRetakeSnapshot(entry.retakeOf),
      })),
    };
  });

  // Attempts at subjects the curriculum does not list — transferred credits,
  // or placements carried over from an older curriculum version.
  const outsideCurriculum = [];
  for (const [subjectId, attempts] of attemptsBySubject.entries()) {
    if (placementSubjectIds.has(subjectId)) continue;
    const derived = deriveRequirementStatus(attempts);
    outsideCurriculum.push({
      subjectId,
      code: attempts[attempts.length - 1]?.code,
      title: attempts[attempts.length - 1]?.title,
      status: derived.status,
      attempts: attempts.length,
    });
  }

  const tally = (status, { requiredOnly = false } = {}) =>
    requirements.filter(
      (r) => r.status === status && (!requiredOnly || r.isRequired)
    ).length;

  const requiredRequirements = requirements.filter((r) => r.isRequired);
  const totalRequiredUnits = requiredRequirements.reduce((sum, r) => sum + (r.units || 0), 0);
  const completedRequiredUnits = requiredRequirements
    .filter((r) => r.status === STATUS.COMPLETED)
    .reduce((sum, r) => sum + (r.units || 0), 0);

  const outstanding = requirements.filter(
    (r) => r.isRequired && r.status !== STATUS.COMPLETED
  );

  const completionPercentage = totalRequiredUnits > 0
    ? Math.round((completedRequiredUnits / totalRequiredUnits) * 100)
    : 0;

  const currentYearLevel = Number(student?.yearLevel) || 1;

  // A student may advance only once every required subject of their current
  // year is completed. This reads the curriculum, not the block label.
  const currentYearRequirements = requiredRequirements.filter(
    (r) => Number(r.yearLevel) === currentYearLevel
  );
  const currentYearOutstanding = currentYearRequirements.filter(
    (r) => r.status !== STATUS.COMPLETED
  );
  const canAdvance = currentYearOutstanding.length === 0 && currentYearRequirements.length > 0;
  const recommendedYearLevel = canAdvance
    ? Math.min(currentYearLevel + 1, MAX_YEAR_LEVEL)
    : currentYearLevel;

  const eligible = requiredRequirements.length > 0 && outstanding.length === 0;

  return {
    studentId: String(student?._id || ''),
    curriculum: curriculum
      ? {
          _id: String(curriculum._id),
          name: curriculum.name,
          programCode: curriculum.programCode,
          programName: curriculum.programName,
          version: curriculum.version,
          status: curriculum.status,
        }
      : null,
    summary: {
      totalRequirements: requirements.length,
      requiredCount: requiredRequirements.length,
      electiveCount: requirements.length - requiredRequirements.length,
      completed: tally(STATUS.COMPLETED),
      failed: tally(STATUS.FAILED),
      dropped: tally(STATUS.DROPPED),
      inProgress: tally(STATUS.IN_PROGRESS),
      outstanding: tally(STATUS.OUTSTANDING),
      totalRequiredUnits,
      completedRequiredUnits,
      outstandingRequiredUnits: Number((totalRequiredUnits - completedRequiredUnits).toFixed(2)),
      completionPercentage,
      outsideCurriculum: outsideCurriculum.length,
    },
    requirements,
    outsideCurriculum,
    graduationEligibility: {
      eligible,
      reason: eligible
        ? 'All required curriculum subjects are completed'
        : `${outstanding.length} required subject(s) still outstanding`,
      outstanding: outstanding.map((r) => ({
        subjectId: r.subjectId,
        code: r.code,
        title: r.title,
        yearLevel: r.yearLevel,
        semester: r.semester,
        units: r.units,
        status: r.status,
      })),
    },
    progression: {
      currentYearLevel,
      recommendedYearLevel,
      canAdvance,
      blockedBy: currentYearOutstanding.map((r) => ({ code: r.code, status: r.status })),
      reason: canAdvance
        ? `All Year ${currentYearLevel} required subjects are completed`
        : currentYearOutstanding.length === 0
          ? `No required subjects are recorded for Year ${currentYearLevel}`
          : `${currentYearOutstanding.length} Year ${currentYearLevel} required subject(s) are not yet completed`,
    },
    evaluatedAt: new Date(),
  };
}

/**
 * Full progress report for one student.
 */
async function getStudentProgress(studentId) {
  const Student = require('../models/Student');
  const student = await Student.findById(studentId)
    .select('studentNumber firstName middleName lastName suffix course curriculumVersion yearLevel schoolYear semester lifecycleStatus')
    .lean();
  if (!student) {
    throw Object.assign(new Error('Student not found'), { statusCode: 404 });
  }

  const { curriculumId } = await resolveCurriculum({
    programCode: student.course,
    curriculumVersion: student.curriculumVersion,
  });

  if (!curriculumId) {
    return {
      studentId: String(student._id),
      curriculum: null,
      summary: null,
      requirements: [],
      outsideCurriculum: [],
      graduationEligibility: {
        eligible: false,
        reason: 'No curriculum could be resolved for this program',
        outstanding: [],
      },
      progression: {
        currentYearLevel: student.yearLevel,
        recommendedYearLevel: student.yearLevel,
        canAdvance: false,
        blockedBy: [],
        reason: 'No curriculum could be resolved for this program',
      },
      evaluatedAt: new Date(),
    };
  }

  const [curriculum, placements, enrollments] = await Promise.all([
    Curriculum.findById(curriculumId)
      .select('_id name programCode programName version status')
      .lean(),
    CurriculumSubject.find({ curriculumId })
      .sort({ yearLevel: 1, semester: 1, displayOrder: 1 })
      .select('subjectId courseNo descriptiveTitle units isRequired type yearLevel semester displayOrder')
      .lean(),
    loadEnrollmentHistory(student._id),
  ]);

  return evaluateProgress({ curriculum, placements, enrollments, student });
}

/**
 * Curriculum-completion signal for a set of students.
 *
 * Used by the rollover so an automatic graduation recommendation is never made
 * without the curriculum agreeing. Only the fields the decision needs are
 * computed, so it stays cheap for a large cohort.
 *
 * @param {Object[]} students - lean student docs (needs _id, course, curriculumVersion, yearLevel)
 * @returns {Promise<Map<string, {eligible: boolean, outstandingRequiredCount: number, curriculumId: string|null}>>}
 */
async function getGraduationGate(students) {
  const gate = new Map();
  if (!students || students.length === 0) return gate;

  const resolveCache = new Map();
  for (const student of students) {
    const key = `${Number(student.course)}|${String(student.curriculumVersion || '').trim()}`;
    if (!resolveCache.has(key)) {
      resolveCache.set(
        key,
        await resolveCurriculum({
          programCode: student.course,
          curriculumVersion: student.curriculumVersion,
        })
      );
    }
    const { curriculumId } = resolveCache.get(key);
    gate.set(String(student._id), {
      eligible: false,
      outstandingRequiredCount: null,
      curriculumId: curriculumId ? String(curriculumId) : null,
      curriculumResolved: Boolean(curriculumId),
    });
  }

  const curriculumIds = [...new Set(
    [...gate.values()].map((v) => v.curriculumId).filter(Boolean)
  )];
  if (curriculumIds.length === 0) return gate;

  const placements = await CurriculumSubject.find({
    curriculumId: { $in: curriculumIds },
  }).select('curriculumId subjectId units isRequired').lean();

  const placementsByCurriculum = new Map();
  for (const placement of placements) {
    const key = String(placement.curriculumId);
    if (!placementsByCurriculum.has(key)) placementsByCurriculum.set(key, []);
    placementsByCurriculum.get(key).push(placement);
  }

  const studentIds = students.map((s) => s._id);
  const enrollments = await Enrollment.find(
    { studentId: { $in: studentIds } },
    null,
    { allowLocked: true }
  ).select('studentId subjects').lean();

  const attemptsByStudentAndSubject = new Map();
  for (const enrollment of enrollments) {
    const studentKey = String(enrollment.studentId);
    if (!attemptsByStudentAndSubject.has(studentKey)) {
      attemptsByStudentAndSubject.set(studentKey, new Map());
    }
    const perSubject = attemptsByStudentAndSubject.get(studentKey);
    for (const entry of enrollment.subjects || []) {
      const key = String(entry.subjectId);
      if (!perSubject.has(key)) perSubject.set(key, []);
      perSubject.get(key).push(entry);
    }
  }

  for (const student of students) {
    const entry = gate.get(String(student._id));
    const curriculumPlacements = entry.curriculumId
      ? placementsByCurriculum.get(entry.curriculumId) || []
      : [];

    const required = curriculumPlacements.filter((p) => p.isRequired !== false);
    if (required.length === 0) {
      // An empty curriculum cannot evidence completion — never graduate on it.
      entry.eligible = false;
      entry.outstandingRequiredCount = required.length;
      continue;
    }

    const attempts = attemptsByStudentAndSubject.get(String(student._id)) || new Map();
    const outstanding = required.filter((placement) => {
      const list = attempts.get(String(placement.subjectId)) || [];
      return !list.some(isRequirementSatisfied);
    });

    entry.outstandingRequiredCount = outstanding.length;
    entry.eligible = outstanding.length === 0;
  }

  return gate;
}

module.exports = {
  STATUS,
  PASSING_GRADE,
  isFailingAttempt,
  deriveRequirementStatus,
  indexAttemptsBySubject,
  evaluateProgress,
  getStudentProgress,
  getGraduationGate,
};
