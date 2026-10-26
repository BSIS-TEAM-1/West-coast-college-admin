/**
 * Subject Enrollment Service — validation and lifecycle for the per-subject
 * records inside an Enrollment.
 *
 * The three records this service keeps separate on purpose:
 *
 *   Student               — who the learner is (profile, year level, program)
 *   StudentBlockAssignment— the learner's normal cohort for a term
 *   Enrollment.subjects[] — the subjects the learner actually takes
 *
 * Block membership narrows what is *normal* for a student but never blocks a
 * subject outright: a student may take a subject offered by another section
 * when their own block does not carry it. Every deviation is validated and
 * recorded rather than silently permitted.
 *
 * Validation layers, in order:
 *   1. subject catalog      — exists, active
 *   2. duplicate enrollment — one live attempt per subject per term
 *   3. prerequisites        — satisfied by a prior passing attempt
 *   4. subject offerings    — offered this term (block offering or curriculum placement)
 *   5. academic standing    — student record still enrollable
 *   6. institutional policy — locked records, graded subjects, overrides
 *
 * Layers 3, 4 and 6 are overridable by an authorized registrar with a written
 * reason (which is stored on the subject entry and in the audit log). Layers
 * 1, 2, 5 and the lock are never overridable.
 */

const Enrollment = require('../models/Enrollment');
const Student = require('../models/Student');
const Subject = require('../models/Subject');
const CurriculumSubject = require('../models/CurriculumSubject');
const BlockGroup = require('../models/BlockGroup');
const BlockSection = require('../models/BlockSection');
const BlockSubjectAssignment = require('../models/BlockSubjectAssignment');
const StudentBlockAssignment = require('../models/StudentBlockAssignment');
const AuditLog = require('../models/AuditLog');
const { resolveCurriculum, createOrReactivateEnrollment } = require('./enrollmentService');
const { assertEnrollmentMutable } = require('./enrollmentImmutabilityGuard');
const { assignmentSchoolYear } = require('./enrollmentGuard');
const { normalizeSchoolYear } = require('./blockTerm');
const { SEMESTERS } = require('../lib/curriculumYears');

const PASSING_GRADE = 3.0;
const TERM_ORDER = { '1st': 0, '2nd': 1, Summer: 2 };

/** Statuses that mean "this subject is currently being taken". */
const LIVE_STATUSES = ['Enrolled', 'Incomplete'];
/** Statuses that mean "this attempt was stopped and may be retaken". */
const PRIOR_ATTEMPT_STATUSES = ['Dropped', 'Removed', 'Failed'];
/** Lifecycle states that make a student non-enrollable. */
const NON_ENROLLABLE_LIFECYCLE = ['Graduated'];

const REASON = {
  SUBJECT_NOT_FOUND: 'SUBJECT_NOT_FOUND',
  SUBJECT_INACTIVE: 'SUBJECT_INACTIVE',
  DUPLICATE_ACTIVE: 'DUPLICATE_ACTIVE',
  PREREQUISITE_NOT_MET: 'PREREQUISITE_NOT_MET',
  NOT_OFFERED: 'NOT_OFFERED',
  STUDENT_NOT_ENROLLABLE: 'STUDENT_NOT_ENROLLABLE',
  ENROLLMENT_LOCKED: 'ENROLLMENT_LOCKED',
  OVERRIDE_REQUIRED: 'OVERRIDE_REQUIRED',
  ALREADY_DROPPED: 'ALREADY_DROPPED',
  GRADED_SUBJECT: 'GRADED_SUBJECT',
  NO_ELIGIBLE_PRIOR_ATTEMPT: 'NO_ELIGIBLE_PRIOR_ATTEMPT',
  NOT_A_LATER_TERM: 'NOT_A_LATER_TERM',
  SUBJECT_NOT_IN_ENROLLMENT: 'SUBJECT_NOT_IN_ENROLLMENT',
};

/** Errors that a registrar can never override. */
const HARD_BLOCKS = new Set([
  REASON.SUBJECT_NOT_FOUND,
  REASON.SUBJECT_INACTIVE,
  REASON.DUPLICATE_ACTIVE,
  REASON.STUDENT_NOT_ENROLLABLE,
  REASON.ENROLLMENT_LOCKED,
  REASON.ALREADY_DROPPED,
  REASON.SUBJECT_NOT_IN_ENROLLMENT,
]);

function termOrder(semester) {
  return Object.prototype.hasOwnProperty.call(TERM_ORDER, String(semester))
    ? TERM_ORDER[String(semester)]
    : -1;
}

/** True when (aYear, aSem) falls strictly after (bYear, bSem). */
function isLaterTerm(aYear, aSem, bYear, bSem) {
  const aStart = Number(String(aYear || '').split('-')[0]);
  const bStart = Number(String(bYear || '').split('-')[0]);
  if (!Number.isFinite(aStart) || !Number.isFinite(bStart)) return false;
  if (aStart !== bStart) return aStart > bStart;
  return termOrder(aSem) > termOrder(bSem);
}

/**
 * A prior attempt satisfies a requirement when it carries a passing grade, or
 * was marked Completed without a numeric grade. Dropped/removed attempts never
 * satisfy it; a failing grade never satisfies it.
 */
function isRequirementSatisfied(entry) {
  if (!entry) return false;
  if (PRIOR_ATTEMPT_STATUSES.includes(entry.status)) return false;
  if (typeof entry.grade === 'number') return entry.grade <= PASSING_GRADE;
  return entry.status === 'Completed';
}

/** An attempt that can be retaken: stopped early, or graded as a failure. */
function isRetakeableAttempt(entry) {
  if (!entry) return false;
  // Dropped or Removed status is always retakeable regardless of grade
  const status = String(entry.status || '').trim().toLowerCase();
  if (status === 'dropped' || status === 'removed') return true;
  if (entry.gradeMark === 'FA') return true;
  return typeof entry.grade === 'number' && entry.grade > PASSING_GRADE;
}

/**
 * A retakeOf snapshot is only evidence of a genuine retake when it carries the
 * complete pointer back to the attempt it replaces: the enrollment header, the
 * exact subject entry inside it, and the term of that attempt. Empty
 * subdocuments or partial rows (older data wrote less than this) are not
 * evidence and must never render as "Retake of …".
 */
function hasCompleteRetakeSnapshot(retakeOf) {
  return Boolean(
    retakeOf &&
    typeof retakeOf === 'object' &&
    String(retakeOf.enrollmentId || '').trim() &&
    String(retakeOf.subjectEntryId || '').trim() &&
    String(retakeOf.schoolYear || '').trim() &&
    String(retakeOf.semester || '').trim()
  );
}

/**
 * Verify every retakeOf snapshot in a student's enrollment history against the
 * history itself. A snapshot counts as a genuine retake only when:
 *   1. it is complete (see hasCompleteRetakeSnapshot);
 *   2. the enrollment it points at (retakeOf.enrollmentId) exists inside this
 *      student's history;
 *   3. the exact subject entry it points at (retakeOf.subjectEntryId) exists
 *      inside that enrollment;
 *   4. that referenced attempt belongs to the same subject (subjectIds match,
 *      or the code matches only when legacy rows carry no subjectId — the code
 *      is a corroborating check on top of resolvable ids, never the basis for
 *      claiming a retake);
 *   5. the referenced attempt happened strictly earlier than the entry that
 *      claims to retake it.
 *
 * Snapshots that fail any check are cleared on the in-memory view
 * (entry.retakeOf = null) so neither the UI note nor the evaluation can treat
 * the subject as a retake. An enrollment record is never merely "assumed to be
 * a retake" because of a status, grade, or duplicate subject — re-enrollment
 * without an explicit retake record stays a regular attempt. Nothing is
 * written back to the database and no reference is ever fabricated.
 *
 * @param {Array<Object>} enrollments - one student's enrollment history
 *   (mongoose documents or lean objects; documents are mutated in memory only)
 * @returns {{ verified: number, stripped: number, reasons: string[] }}
 */
function verifyRetakeReferences(enrollments) {
  const list = Array.isArray(enrollments) ? enrollments : [];
  const enrollmentById = new Map();
  for (const enrollment of list) {
    if (enrollment && enrollment._id !== undefined) {
      enrollmentById.set(String(enrollment._id), enrollment);
    }
  }

  let verified = 0;
  let stripped = 0;
  const reasons = [];

  for (const enrollment of list) {
    for (const entry of enrollment?.subjects || []) {
      const retakeOf = entry?.retakeOf;
      if (!retakeOf || typeof retakeOf !== 'object') continue;

      let problem = null;
      if (!hasCompleteRetakeSnapshot(retakeOf)) {
        problem = 'incomplete retake snapshot';
      } else {
        const referencedEnrollment = enrollmentById.get(String(retakeOf.enrollmentId));
        if (!referencedEnrollment) {
          problem = 'referenced enrollment is not in this student history';
        } else {
          const referencedEntry = (referencedEnrollment.subjects || [])
            .find((subject) => String(subject?._id || '') === String(retakeOf.subjectEntryId));
          if (!referencedEntry) {
            problem = 'referenced subject entry was not found in the referenced enrollment';
          } else {
            const currentSubjectId = String(entry.subjectId || '').trim();
            const referencedSubjectId = String(referencedEntry.subjectId || '').trim();
            const sameSubject = currentSubjectId && referencedSubjectId
              ? currentSubjectId === referencedSubjectId
              : String(entry.code || '').trim().toUpperCase() === String(referencedEntry.code || '').trim().toUpperCase();
            if (!sameSubject) {
              problem = 'referenced attempt belongs to a different subject';
            } else if (!isLaterTerm(
              enrollment.schoolYear, enrollment.semester,
              retakeOf.schoolYear, retakeOf.semester
            )) {
              problem = 'referenced attempt is not in an earlier term than the retaking entry';
            }
          }
        }
      }

      if (problem) {
        entry.retakeOf = null;
        stripped++;
        reasons.push(
          `${entry.code || 'subject'} (${String(enrollment.schoolYear || '')} ${enrollment.semester}): ${problem}`
        );
      } else {
        verified++;
      }
    }
  }

  return { verified, stripped, reasons };
}

/**
 * Never let an audit-write failure roll back an academic action that already
 * succeeded — report it instead.
 */
async function recordAudit(fields) {
  try {
    await AuditLog.create(fields);
  } catch (error) {
    console.error('Failed to write enrollment audit entry:', error);
  }
}

function auditRole(reqLike) {
  return String(reqLike?.accountType || 'registrar').toLowerCase() === 'admin' ? 'admin' : 'registrar';
}

/**
 * Load every enrollment a student has ever had, including locked history.
 * Locked records are excluded by a model-level query guard unless the caller
 * opts in, and academic history is exactly where they are needed.
 */
async function loadEnrollmentHistory(studentId) {
  return Enrollment.find({ studentId }, null, { allowLocked: true })
    .select('schoolYear semester yearLevel status curriculumId lockedAt subjects')
    .lean();
}

/**
 * Sections that carry subjects for a given academic term.
 *
 * @returns {Promise<{ sectionIds: Set<string>, sectionsById: Map<string, Object> }>}
 */
async function loadTermSections(schoolYear, semester) {
  const groups = await BlockGroup.find({
    semester,
    $or: [{ schoolYear }, { year: schoolYear }],
  }).select('_id').lean();

  if (groups.length === 0) return { sectionIds: new Set(), sectionsById: new Map() };

  const sections = await BlockSection.find({
    blockGroupId: { $in: groups.map((g) => g._id) },
  }).select('_id sectionCode blockGroupId').lean();

  return {
    sectionIds: new Set(sections.map((s) => String(s._id))),
    sectionsById: new Map(sections.map((s) => [String(s._id), s])),
  };
}

/** Sections belonging to the student's own block for this term. */
async function loadOwnSectionIds(studentId, schoolYear, semester) {
  const assignments = await StudentBlockAssignment.find({
    studentId,
    status: 'ASSIGNED',
  }).select('sectionId semester schoolYear year').lean();

  const own = assignments.filter((a) => {
    // assignmentSchoolYear is the shared rule; normalizeSchoolYear is only a
    // fallback for rows that stored the term in `year` as a "YYYY-YYYY" string.
    const term = assignmentSchoolYear(a) || normalizeSchoolYear(a.schoolYear || a.year);
    return term === schoolYear && String(a.semester || '') === semester;
  });
  return new Set(own.map((a) => String(a.sectionId)).filter(Boolean));
}

/**
 * Resolve the curriculum subjects that suggest what a student should take.
 *
 * @param {Object} params
 * @param {number} params.programCode
 * @param {string|null} [params.curriculumVersion]
 * @param {number} params.yearLevel
 * @param {string} params.semester
 * @param {string|null} [params.studentId]
 * @param {boolean} [params.isIrregular]
 * @param {import('mongoose').ClientSession|null} [params.session]
 * @returns {Promise<{curriculumId: *, curriculum: Object|null, source: string|null, reason: string|null, subjects: Object[]}>}
 */
async function resolveSuggestedSubjects({ programCode, curriculumVersion, yearLevel, semester, studentId, isIrregular, session }) {
  const empty = { curriculumId: null, curriculum: null, source: null, reason: null, subjects: [] };
  if (!programCode || !SEMESTERS.includes(semester)) return empty;

  const { curriculumId, source, reason } = await resolveCurriculum({
    programCode,
    curriculumVersion,
    session,
  });
  if (!curriculumId) return { ...empty, reason };

  const Curriculum = require('../models/Curriculum');
  const curriculumQuery = Curriculum.findById(curriculumId)
    .select('_id name code programCode programName version status effectiveSchoolYear');

  // For irregular students, get all curriculum subjects from all semesters
  // For regular students, only get subjects for the current semester
  let placementQuery;
  if (isIrregular) {
    placementQuery = CurriculumSubject.find({ curriculumId })
      .sort({ yearLevel: 1, semester: 1, displayOrder: 1, courseNo: 1 })
      .populate({ path: 'subjectId', select: '_id code title units isActive status prerequisiteSubjectIds' });
  } else {
    placementQuery = CurriculumSubject.find({ curriculumId, yearLevel: Number(yearLevel), semester })
      .sort({ displayOrder: 1, courseNo: 1 })
      .populate({ path: 'subjectId', select: '_id code title units isActive status prerequisiteSubjectIds' });
  }

  if (session) {
    curriculumQuery.session(session);
    placementQuery.session(session);
  }

  const [curriculum, placements] = await Promise.all([curriculumQuery.lean(), placementQuery.lean()]);

  // If studentId is provided for irregular students, get their enrollment history
  // to exclude subjects they've already completed
  let completedSubjectIds = new Set();
  if (isIrregular && studentId) {
    const history = await loadEnrollmentHistory(studentId);
    history.forEach(enrollment => {
      (enrollment.subjects || []).forEach(subject => {
        // Exclude subjects that were completed or passed
        if (subject.status === 'Completed' || (typeof subject.grade === 'number' && subject.grade <= PASSING_GRADE)) {
          completedSubjectIds.add(String(subject.subjectId));
        }
      });
    });
  }

  const subjects = placements
    .filter((placement) => Boolean(placement.subjectId))
    .filter((placement) => {
      // For irregular students, exclude already completed subjects
      if (isIrregular && completedSubjectIds.has(String(placement.subjectId._id))) {
        return false;
      }
      return true;
    })
    .map((placement) => {
      const subject = placement.subjectId;
      return {
        curriculumSubjectId: String(placement._id),
        subjectId: String(subject._id),
        code: subject.code || placement.courseNo,
        title: subject.title || placement.descriptiveTitle,
        units: placement.units,
        lecturePeriods: placement.lecturePeriods,
        labPeriods: placement.labPeriods,
        type: placement.type,
        isRequired: placement.isRequired,
        yearLevel: placement.yearLevel,
        semester: placement.semester,
        prerequisiteSubjectIds: (placement.prerequisiteSubjectIds || []).map(String),
        available: Boolean(subject.isActive) && subject.status !== 'Inactive',
      };
    });

  return { curriculumId, curriculum, source, reason, subjects };
}

/**
 * Add the applicable curriculum subjects when a student is finalized into a
 * block. Existing subject entries are deliberately preserved: this fills an
 * incomplete enrollment without recreating dropped, graded, or manual rows.
 */
async function autoAssignCurriculumSubjects({ enrollmentId, curriculumId, actorId, session, pruneForeign = false }) {
  const enrollmentQuery = Enrollment.findById(enrollmentId);
  const enrollment = session ? await enrollmentQuery.session(session) : await enrollmentQuery;
  if (!enrollment) {
    throw Object.assign(new Error('Enrollment not found for curriculum subject assignment'), { statusCode: 404 });
  }
  assertEnrollmentMutable(enrollment, 'subjects');

  const effectiveCurriculumId = curriculumId || enrollment.curriculumId;
  if (!effectiveCurriculumId) {
    return { added: [], skipped: [], pruned: [], reason: 'No curriculum is linked to this enrollment' };
  }

  const pruned = [];
  if (pruneForeign) {
    const allPlacementsQuery = CurriculumSubject.find({ curriculumId: effectiveCurriculumId })
      .select('subjectId courseNo yearLevel semester');
    if (session) allPlacementsQuery.session(session);
    const allPlacements = await allPlacementsQuery.lean();

    const allowedSubjectIds = new Set(allPlacements.map((p) => String(p.subjectId)));
    const allowedCodes = new Set(allPlacements.map((p) => String(p.courseNo).trim().toUpperCase()));

    const initialLength = (enrollment.subjects || []).length;
    enrollment.subjects = (enrollment.subjects || []).filter((entry) => {
      const idStr = String(entry.subjectId || '');
      const codeStr = String(entry.code || '').trim().toUpperCase();

      if (allowedSubjectIds.has(idStr) || allowedCodes.has(codeStr)) {
        return true;
      }
      if (entry.grade != null || entry.gradeMark != null) {
        return true;
      }
      pruned.push(entry.code || idStr);
      return false;
    });

    if (enrollment.subjects.length !== initialLength) {
      enrollment.markModified('subjects');
    }
  }

  const placementQuery = CurriculumSubject.find({
    curriculumId: effectiveCurriculumId,
    yearLevel: Number(enrollment.yearLevel),
    semester: enrollment.semester,
  }).select('subjectId courseNo descriptiveTitle units');
  if (session) placementQuery.session(session);
  const placements = await placementQuery.lean();

  const existingSubjectIds = new Set((enrollment.subjects || []).map((entry) => String(entry.subjectId)));
  const missingPlacements = placements.filter((placement) =>
    placement.subjectId && !existingSubjectIds.has(String(placement.subjectId))
  );

  const now = new Date();
  const added = [];
  const skipped = [];
  if (missingPlacements.length > 0) {
    const subjectQuery = Subject.find({
      _id: { $in: missingPlacements.map((placement) => placement.subjectId) },
    }).select('_id code title units isActive status');
    if (session) subjectQuery.session(session);
    const subjects = await subjectQuery.lean();
    const subjectById = new Map(subjects.map((subject) => [String(subject._id), subject]));

    for (const placement of missingPlacements) {
      const subject = subjectById.get(String(placement.subjectId));
      if (!subject || subject.isActive === false || subject.status === 'Inactive') {
        skipped.push(String(placement.subjectId));
        continue;
      }

      enrollment.subjects.push({
        subjectId: subject._id,
        code: subject.code || placement.courseNo,
        title: subject.title || placement.descriptiveTitle,
        units: Number(placement.units ?? subject.units) || 3,
        schedule: 'TBA',
        room: 'TBA',
        instructor: 'TBA',
        status: 'Enrolled',
        dateEnrolled: now,
        dateModified: now,
        ...(actorId ? { addedBy: actorId } : {}),
      });
      added.push({ subjectId: String(subject._id), code: subject.code || placement.courseNo });
    }
  }

  if (added.length > 0 || pruned.length > 0) {
    if (curriculumId && String(enrollment.curriculumId || '') !== String(curriculumId)) {
      enrollment.curriculumId = curriculumId;
    }
    enrollment.markModified('subjects');
    if (actorId) enrollment.updatedBy = actorId;
    await enrollment.save({ session, validateBeforeSave: false });

    // New curriculum subjects start as TBA. If the student's section already
    // has schedules stamped into its other students' enrollments, inherit
    // them so the fresh entries show the same time/room/instructor.
    await applySectionScheduleDefaults({ enrollment, session });
    await recordAudit({
      action: 'UPDATE',
      resourceType: 'ENROLLMENT',
      resourceId: String(enrollment._id),
      resourceName: `${enrollment.studentNumber || ''} — ${enrollment.schoolYear} ${enrollment.semester}`.trim(),
      description: `Curriculum subjects synchronized: ${added.length} added, ${pruned.length} foreign removed`,
      performedBy: actorId,
      performedByRole: auditRole(),
      newValue: { enrollmentId: String(enrollment._id), curriculumId: String(effectiveCurriculumId), subjects: added, pruned },
      status: 'SUCCESS',
      severity: 'MEDIUM',
    });
  }

  return { added, skipped, pruned, reason: null };
}

const SCHEDULE_PLACEHOLDER = 'TBA';

function isSchedulePlaceholder(value) {
  const raw = String(value ?? '').trim();
  return raw === '' || raw.toUpperCase() === SCHEDULE_PLACEHOLDER;
}

function pickDominantValue(counts) {
  if (!counts || counts.size === 0) return null;
  let bestKey = null;
  let bestCount = -1;
  for (const [value, count] of counts.entries()) {
    if (count > bestCount || (count === bestCount && bestKey !== null && String(value) < String(bestKey))) {
      bestKey = value;
      bestCount = count;
    }
  }
  return bestCount > 0 ? bestKey : null;
}

/**
 * Fill TBA schedule/room/instructor entries on an enrollment's subjects from
 * the section the student is assigned to.
 *
 * Schedules live on the ENROLLMENT subject rows of the students already in the
 * section (registrar stamps them there via the section-subject assignments),
 * so the only source for a freshly assigned student's schedule is the peers:
 * per subject, the most frequent non-TBA value among the section's other
 * students wins. Missing time stays 'TBA', missing room stays 'TBA' — a
 * section's schedule is never shown as an empty string.
 *
 * Best-effort by design: with no section, no peers, or a lookup failure, the
 * entries simply remain TBA and nothing else is affected.
 *
 * @param {Object} params
 * @param {Object} params.enrollment - mongoose Enrollment document (mutable)
 * @param {string|null} [params.sectionId] - the section the student was just assigned to
 * @param {import('mongoose').ClientSession} [params.session]
 */
async function applySectionScheduleDefaults({ enrollment, sectionId = null, session = null }) {
  try {
    if (!enrollment || !Array.isArray(enrollment.subjects) || enrollment.subjects.length === 0) return;
    const fillable = enrollment.subjects.filter((entry) =>
      isSchedulePlaceholder(entry.schedule) || isSchedulePlaceholder(entry.room) || isSchedulePlaceholder(entry.instructor)
    );
    if (fillable.length === 0) return;

    const termSchoolYear = enrollment.schoolYear;
    let resolvedSectionId = sectionId;
    if (!resolvedSectionId) {
      const assignmentQuery = StudentBlockAssignment.findOne({
        studentId: enrollment.studentId,
        semester: enrollment.semester,
        status: 'ASSIGNED',
        $or: [{ schoolYear: termSchoolYear }, { year: termSchoolYear }],
      }).sort({ assignedAt: -1 });
      const assignment = session
        ? await assignmentQuery.session(session).lean()
        : await assignmentQuery.lean();
      resolvedSectionId = assignment?.sectionId || null;
    }
    if (!resolvedSectionId) return;

    const peerAssignmentQuery = StudentBlockAssignment.find({
      sectionId: resolvedSectionId,
      semester: enrollment.semester,
      status: 'ASSIGNED',
      $or: [{ schoolYear: termSchoolYear }, { year: termSchoolYear }],
    }).select('studentId');
    const peerAssignments = session ? await peerAssignmentQuery.session(session) : await peerAssignmentQuery;
    const excludeStudentId = String(enrollment.studentId);
    const peerStudentIds = [...new Set(
      (Array.isArray(peerAssignments) ? peerAssignments : [])
        .map((assignment) => String(assignment.studentId))
        .filter(Boolean)
        .filter((studentId) => studentId !== excludeStudentId)
    )];
    if (peerStudentIds.length === 0) return;

    const peerEnrollmentQuery = Enrollment.find({
      studentId: { $in: peerStudentIds },
      semester: enrollment.semester,
      schoolYear: termSchoolYear,
      isCurrent: true,
    }).select('subjects');
    const peerEnrollments = session ? await peerEnrollmentQuery.session(session) : await peerEnrollmentQuery;

    // Aggregate the peers' values per subject (subjectId preferred, code as a
    // stable fallback when an id is missing on either side).
    const scheduleCounts = new Map();
    const roomCounts = new Map();
    const instructorCounts = new Map();
    const bump = (map, key, value) => {
      if (!key) return;
      const raw = String(value ?? '').trim();
      if (isSchedulePlaceholder(raw)) return;
      const normalized = map.get(key) || new Map();
      normalized.set(raw, (normalized.get(raw) || 0) + 1);
      map.set(key, normalized);
    };
    for (const peer of (Array.isArray(peerEnrollments) ? peerEnrollments : [])) {
      for (const entry of (Array.isArray(peer.subjects) ? peer.subjects : [])) {
        const key = String(entry?.subjectId || '') || String(entry?.code || '').trim().toUpperCase();
        bump(scheduleCounts, key, entry?.schedule);
        bump(roomCounts, key, entry?.room);
        bump(instructorCounts, key, entry?.instructor);
      }
    }

    let changed = false;
    for (const entry of enrollment.subjects) {
      const key = String(entry?.subjectId || '') || String(entry?.code || '').trim().toUpperCase();
      if (!key || !scheduleCounts.has(key) && !roomCounts.has(key) && !instructorCounts.has(key)) continue;
      const dominantSchedule = pickDominantValue(scheduleCounts.get(key));
      const dominantRoom = pickDominantValue(roomCounts.get(key));
      const dominantInstructor = pickDominantValue(instructorCounts.get(key));
      if (isSchedulePlaceholder(entry.schedule) && dominantSchedule) {
        entry.schedule = dominantSchedule;
        changed = true;
      }
      if (isSchedulePlaceholder(entry.room) && dominantRoom) {
        entry.room = dominantRoom;
        changed = true;
      }
      if (isSchedulePlaceholder(entry.instructor) && dominantInstructor) {
        entry.instructor = dominantInstructor;
        changed = true;
      }
    }

    if (changed) {
      enrollment.markModified('subjects');
      await enrollment.save({ session, validateBeforeSave: false });
    }
  } catch (error) {
    // Schedule inheritance is a convenience layer: if the section has no
    // schedule data yet (or the lookup fails), the entries simply stay TBA.
    console.warn('Section schedule inheritance skipped:', error?.message || error);
  }
}

/**
 * Validate a set of subject ids before they are written into an enrollment.
 *
 * @param {Object} params
 * @param {Object} params.student - Student doc/lean object
 * @param {Object} params.enrollment - target Enrollment (header) doc
 * @param {string[]} params.subjectIds
 * @returns {Promise<{results: Object[], okIds: string[], failedIds: string[]}>}
 */
async function validateSubjectSelection({ student, enrollment, subjectIds }) {
  const ids = [...new Set((subjectIds || []).map((value) => String(value)).filter(Boolean))];
  const results = [];

  if (!enrollment) {
    return {
      results: ids.map((subjectId) => ({
        subjectId,
        ok: false,
        reasonCode: REASON.SUBJECT_NOT_IN_ENROLLMENT,
        message: 'Enrollment record not found',
        requiresOverride: false,
      })),
      okIds: [],
      failedIds: ids,
    };
  }

  const schoolYear = enrollment.schoolYear;
  const semester = enrollment.semester;

  // 6a. Locked records are immutable historical snapshots — never overridable.
  if (enrollment.lockedAt) {
    return {
      results: ids.map((subjectId) => ({
        subjectId,
        ok: false,
        reasonCode: REASON.ENROLLMENT_LOCKED,
        message: `Enrollment for ${schoolYear} ${semester} is locked as a historical record`,
        requiresOverride: false,
      })),
      okIds: [],
      failedIds: ids,
    };
  }

  if (ids.length === 0) {
    return { results: [], okIds: [], failedIds: [] };
  }

  // 5. Academic standing applies to every subject in the request.
  const standingError = checkAcademicStanding(student);

  const [subjects, history, termSections, ownSectionIds, placements] = await Promise.all([
    Subject.find({ _id: { $in: ids } })
      .select('_id code title units isActive status prerequisiteSubjectIds')
      .lean(),
    loadEnrollmentHistory(student._id),
    loadTermSections(schoolYear, semester),
    loadOwnSectionIds(student._id, schoolYear, semester),
    enrollment.curriculumId
      ? CurriculumSubject.find({ curriculumId: enrollment.curriculumId })
          .select('subjectId prerequisiteSubjectIds yearLevel semester isRequired')
          .lean()
      : Promise.resolve([]),
  ]);

  const subjectById = new Map(subjects.map((s) => [String(s._id), s]));
  const placementBySubjectId = new Map(placements.map((p) => [String(p.subjectId), p]));

  // 4. Offerings: which sections carry each subject for this term.
  const sectionIdList = [...termSections.sectionIds];
  const offerings = sectionIdList.length > 0
    ? await BlockSubjectAssignment.find({
        blockSectionId: { $in: sectionIdList },
        subjectId: { $in: ids },
        semester,
      }).select('blockSectionId subjectId').lean()
    : [];

  const offeringSectionsBySubject = new Map();
  for (const offering of offerings) {
    const key = String(offering.subjectId);
    if (!offeringSectionsBySubject.has(key)) offeringSectionsBySubject.set(key, new Set());
    offeringSectionsBySubject.get(key).add(String(offering.blockSectionId));
  }

  // 2 + 3. Live duplicates in this term, and prerequisite evidence across all terms.
  const termEnrollments = history.filter(
    (entry) => entry.schoolYear === schoolYear && entry.semester === semester
  );

  const prerequisiteIds = new Set();
  for (const id of ids) {
    const placement = placementBySubjectId.get(id);
    const subject = subjectById.get(id);
    const list = placement?.prerequisiteSubjectIds?.length
      ? placement.prerequisiteSubjectIds
      : (subject?.prerequisiteSubjectIds || []);
    list.forEach((prereqId) => prerequisiteIds.add(String(prereqId)));
  }

  const prereqEvidence = new Map();
  if (prerequisiteIds.size > 0) {
    for (const entry of history) {
      for (const subjectEntry of entry.subjects || []) {
        const key = String(subjectEntry.subjectId);
        if (!prerequisiteIds.has(key)) continue;
        const list = prereqEvidence.get(key) || [];
        list.push(subjectEntry);
        prereqEvidence.set(key, list);
      }
    }
  }

  const prereqDocs = prerequisiteIds.size > 0
    ? await Subject.find({ _id: { $in: [...prerequisiteIds] } }).select('_id code title').lean()
    : [];
  const prereqCodeById = new Map(prereqDocs.map((s) => [String(s._id), s.code]));

  for (const id of ids) {
    const subject = subjectById.get(id);
    const placement = placementBySubjectId.get(id);
    const result = {
      subjectId: id,
      code: subject?.code || placement?.courseNo || null,
      title: subject?.title || placement?.descriptiveTitle || null,
      units: subject?.units ?? placement?.units ?? null,
      ok: true,
      reasonCode: null,
      message: null,
      requiresOverride: false,
      offeredOutsideBlock: false,
      offeredViaCurriculum: false,
      alreadyEnrolled: false,
    };

    // 1. Subject catalog.
    if (!subject) {
      result.ok = false;
      result.reasonCode = REASON.SUBJECT_NOT_FOUND;
      result.message = 'Subject not found in the subject catalog';
      results.push(result);
      continue;
    }
    if (!subject.isActive || subject.status === 'Inactive') {
      result.ok = false;
      result.reasonCode = REASON.SUBJECT_INACTIVE;
      result.message = `Subject ${subject.code} is inactive and cannot be enrolled`;
      results.push(result);
      continue;
    }

    if (standingError) {
      result.ok = false;
      result.reasonCode = REASON.STUDENT_NOT_ENROLLABLE;
      result.message = standingError;
      results.push(result);
      continue;
    }

    // 2. Duplicate enrollment — a live attempt per subject per term.
    const duplicate = findLiveDuplicate(termEnrollments, id, enrollment._id);
    if (duplicate) {
      result.ok = false;
      result.alreadyEnrolled = true;
      result.reasonCode = REASON.DUPLICATE_ACTIVE;
      result.message =
        String(duplicate.enrollmentId) === String(enrollment._id)
          ? `${subject.code} is already in this term's enrollment`
          : `${subject.code} is already enrolled for ${schoolYear} ${semester}`;
      results.push(result);
      continue;
    }

    // 4. Subject offering for this term.
    const offeringSections = offeringSectionsBySubject.get(id);
    if (offeringSections && offeringSections.size > 0) {
      const inOwnBlock = [...offeringSections].some((sectionId) => ownSectionIds.has(sectionId));
      result.offeredOutsideBlock = !inOwnBlock;
      if (!inOwnBlock) {
        const firstSection = termSections.sectionsById.get([...offeringSections][0]);
        result.sectionCode = firstSection?.sectionCode || null;
      }
    } else if (placement) {
      result.offeredViaCurriculum = true;
    } else {
      result.ok = false;
      result.reasonCode = REASON.NOT_OFFERED;
      result.message = `${subject.code} is not offered for ${schoolYear} ${semester}`;
      result.requiresOverride = true;
      results.push(result);
      continue;
    }

    // 3. Prerequisites — satisfied by any prior passing attempt.
    // Skip prerequisite validation for Year 1 Semester 1 since there are no prior subjects.
    const isFirstSemester = placement?.yearLevel === 1 && placement?.semester === '1st';
    if (!isFirstSemester) {
      const requiredPrereqs = placement?.prerequisiteSubjectIds?.length
        ? placement.prerequisiteSubjectIds
        : (subject.prerequisiteSubjectIds || []);
      const unmet = requiredPrereqs
        .map((prereqId) => String(prereqId))
        .filter((prereqId) => {
          const attempts = prereqEvidence.get(prereqId) || [];
          return !attempts.some(isRequirementSatisfied);
        });

      if (unmet.length > 0) {
        const labels = unmet
          .map((prereqId) => prereqCodeById.get(prereqId) || 'a prerequisite subject')
          .join(', ');
        result.ok = false;
        result.reasonCode = REASON.PREREQUISITE_NOT_MET;
        result.message = `Prerequisite not met for ${subject.code}: ${labels}`;
        result.requiresOverride = true;
        result.unmetPrerequisites = unmet;
        results.push(result);
        continue;
      }
    }

    results.push(result);
  }

  return {
    results,
    okIds: results.filter((r) => r.ok).map((r) => r.subjectId),
    failedIds: results.filter((r) => !r.ok).map((r) => r.subjectId),
  };
}

function findLiveDuplicate(termEnrollments, subjectId, excludeEnrollmentId) {
  for (const entry of termEnrollments) {
    if (excludeEnrollmentId && String(entry._id) === String(excludeEnrollmentId)) {
      // Entries already inside the target enrollment are still duplicates —
      // they just get a more specific message from the caller.
      const inside = (entry.subjects || []).find(
        (s) => String(s.subjectId) === subjectId && LIVE_STATUSES.includes(s.status)
      );
      if (inside) return { ...inside, enrollmentId: entry._id, insideTarget: true };
      continue;
    }
    const match = (entry.subjects || []).find(
      (s) => String(s.subjectId) === subjectId && LIVE_STATUSES.includes(s.status)
    );
    if (match) return { ...match, enrollmentId: entry._id, insideTarget: false };
  }
  return null;
}

function checkAcademicStanding(student) {
  if (!student) return 'Student record does not exist';
  if (student.isActive === false) return 'Inactive student records cannot be enrolled';
  if (NON_ENROLLABLE_LIFECYCLE.includes(student.lifecycleStatus)) {
    return `A ${student.lifecycleStatus} student cannot be enrolled in new subjects`;
  }
  return null;
}

/**
 * Validate and write new subject entries into an enrollment.
 *
 * @param {Object} params
 * @param {Object} params.enrollment - mongoose Enrollment document
 * @param {Object} params.student
 * @param {string[]} params.subjectIds
 * @param {import('mongoose').Types.ObjectId|string} params.actorId
 * @param {string} [params.overrideReason] - required when a result requires one
 * @param {import('mongoose').ClientSession|null} [params.session]
 * @returns {Promise<{added: Object[], failed: Object[], requiresOverride: boolean}>}
 */
async function addSubjectsToEnrollment({ enrollment, student, subjectIds, actorId, overrideReason, accountType, session }) {
  assertEnrollmentMutable(enrollment, 'subjects');

  const { results } = await validateSubjectSelection({ student, enrollment, subjectIds });
  const reason = String(overrideReason || '').trim();

  const added = [];
  const failed = [];
  let usedOverride = false;

  for (const result of results) {
    // `requiresOverride` results are reported as not-ok by validation, but they
    // are exactly the cases an authorized registrar may still approve. Hard
    // blocks (duplicates, inactive subjects, standing) never carry the flag.
    if (!result.ok && !result.requiresOverride) {
      failed.push(result);
      continue;
    }
    if (result.requiresOverride && !reason) {
      failed.push({
        ...result,
        ok: false,
        reasonCode: REASON.OVERRIDE_REQUIRED,
        message: `${result.message} — a registrar override reason is required`,
      });
      continue;
    }

    const now = new Date();
    const entry = {
      subjectId: result.subjectId,
      code: result.code,
      title: result.title,
      units: result.units || 3,
      schedule: 'TBA',
      room: 'TBA',
      instructor: 'TBA',
      status: 'Enrolled',
      dateEnrolled: now,
      dateModified: now,
      sectionCode: result.sectionCode || null,
    };
    if (actorId) entry.addedBy = actorId;
    if (result.requiresOverride && reason) {
      entry.overrideReason = reason;
      if (actorId) entry.overriddenBy = actorId;
      usedOverride = true;
    }

    enrollment.subjects.push(entry);
    added.push({ ...result, ok: true, enrolledAt: now.toISOString() });
  }

  if (added.length > 0) {
    enrollment.markModified('subjects');
    if (actorId) enrollment.updatedBy = actorId;
    await enrollment.save({ session, validateBeforeSave: false });
  }

  if (added.length > 0) {
    await recordAudit({
      action: usedOverride ? 'OVERRIDE' : 'CREATE',
      resourceType: 'ENROLLMENT',
      resourceId: String(enrollment._id),
      resourceName: `${enrollment.studentNumber || ''} — ${enrollment.schoolYear} ${enrollment.semester}`.trim(),
      description:
        `Added ${added.length} subject(s) to ${enrollment.schoolYear} ${enrollment.semester}: `
        + added.map((entry) => entry.code).join(', ')
        + (usedOverride ? ` · override: ${reason}` : ''),
      performedBy: actorId,
      performedByRole: auditRole({ accountType }),
      newValue: {
        enrollmentId: String(enrollment._id),
        studentId: String(enrollment.studentId),
        subjects: added.map((entry) => ({ subjectId: entry.subjectId, code: entry.code, outsideBlock: Boolean(entry.offeredOutsideBlock) })),
        overrideReason: usedOverride ? reason : null,
      },
      status: 'SUCCESS',
      severity: usedOverride ? 'HIGH' : 'MEDIUM',
    });
  }

  return { added, failed, requiresOverride: usedOverride };
}

/**
 * Drop a subject without ever deleting it.
 *
 * The original entry keeps its grade and gains an official Dropped status plus
 * the registrar, time, and reason — that combination is the record of the
 * attempt, and it is what a later retake points back at.
 *
 * @returns {Promise<{entry: Object, dropped: boolean}>}
 * @throws {Error} statusCode 404/409 when the drop is not permitted
 */
async function dropSubjectFromEnrollment({ enrollment, subjectId, actorId, reason, overrideReason, session }) {
  assertEnrollmentMutable(enrollment, 'subjects');

  const entry = (enrollment.subjects || []).find((s) => String(s.subjectId) === String(subjectId));
  if (!entry) {
    throw Object.assign(new Error('Subject is not part of this enrollment'), { statusCode: 404, reasonCode: REASON.SUBJECT_NOT_IN_ENROLLMENT });
  }
  if (entry.status === 'Dropped') {
    throw Object.assign(new Error(`${entry.code} was already dropped on ${entry.droppedAt ? new Date(entry.droppedAt).toDateString() : 'a previous date'}`), { statusCode: 409, reasonCode: REASON.ALREADY_DROPPED });
  }

  const isGraded = typeof entry.grade === 'number' || entry.status === 'Completed';
  const override = String(overrideReason || '').trim();
  if (isGraded && !override) {
    throw Object.assign(
      new Error(`${entry.code} already carries an official grade (${entry.grade ?? entry.status}). Dropping it requires a written override reason.`),
      { statusCode: 409, reasonCode: REASON.GRADED_SUBJECT }
    );
  }

  const previous = { status: entry.status, grade: entry.grade, gradeMark: entry.gradeMark };

  // Preserve the numeric grade exactly as it stands; only the status changes,
  // and DRP is displayed in place of a mark that never existed.
  entry.status = 'Dropped';
  if (entry.grade === null || entry.grade === undefined) {
    entry.gradeMark = 'DRP';
  }
  entry.droppedAt = new Date();
  if (actorId) entry.droppedBy = actorId;
  entry.dropReason = String(reason || '').trim() || (override || 'Dropped by registrar');
  if (override && actorId) {
    entry.overrideReason = override;
    entry.overriddenBy = actorId;
  }
  entry.dateModified = new Date();

  enrollment.markModified('subjects');
  if (actorId) enrollment.updatedBy = actorId;
  await enrollment.save({ session, validateBeforeSave: false });

  // A subject-level drop does not drop the student from the institution.
  // It changes their academic standing to Irregular for subsequent enrollment.
  await Student.findByIdAndUpdate(
    enrollment.studentId,
    {
      $set: {
        lifecycleStatus: 'Irregular',
        studentStatus: 'Irregular',
        classification: 'Irregular',
      },
    },
    session ? { session } : undefined
  );

  await recordAudit({
    action: 'DROP',
    resourceType: 'ENROLLMENT',
    resourceId: String(enrollment._id),
    resourceName: `${enrollment.studentNumber || ''} — ${enrollment.schoolYear} ${enrollment.semester}`.trim(),
    description:
      `Dropped ${entry.code} from ${enrollment.schoolYear} ${enrollment.semester} · ${entry.dropReason}`
      + (override ? ` · override: ${override}` : ''),
    performedBy: actorId,
    performedByRole: auditRole(),
    oldValue: previous,
    newValue: { status: 'Dropped', grade: entry.grade, gradeMark: entry.gradeMark, dropReason: entry.dropReason },
    status: 'SUCCESS',
    severity: 'HIGH',
  });

  return { entry, dropped: true };
}

/**
 * Create a retake of a previously dropped/failed subject in a later term.
 *
 * Guarantees:
 *   - the student's year level is never changed by a retake;
 *   - the original attempt is never rewritten (it is only snapshotted);
 *   - the retake lands in a NEW enrollment record for the target term;
 *   - a live attempt for the same subject in the target term blocks it.
 *
 * @returns {Promise<{enrollment: Object, entry: Object, added: Object, original: Object}>}
 */
async function retakeSubject({ student, subjectId, schoolYear, semester, actorId, overrideReason, session }) {
  if (!/^\d{4}-\d{4}$/.test(String(schoolYear || ''))) {
    throw Object.assign(new Error('schoolYear must be in YYYY-YYYY format'), { statusCode: 400 });
  }
  if (!SEMESTERS.includes(semester)) {
    throw Object.assign(new Error(`semester must be one of ${SEMESTERS.join(', ')}`), { statusCode: 400 });
  }

  // Normalize subjectId to string
  const normalizedSubjectId = String(subjectId).trim();

  const history = await loadEnrollmentHistory(student._id);
  
  const attempts = [];
  for (const enrollment of history) {
    for (const entry of enrollment.subjects || []) {
      const entrySubjectId = String(entry.subjectId || '').trim();
      if (entrySubjectId !== normalizedSubjectId) continue;
      attempts.push({ enrollment, entry });
    }
  }

  const eligible = attempts.filter(({ entry }) => isRetakeableAttempt(entry));

  if (eligible.length === 0) {
    throw Object.assign(
      new Error('No dropped or failed attempt exists for this subject, so there is nothing to retake'),
      { statusCode: 409, reasonCode: REASON.NO_ELIGIBLE_PRIOR_ATTEMPT }
    );
  }

  const latest = eligible
    .slice()
    .sort((a, b) => isLaterTerm(
      b.enrollment.schoolYear, b.enrollment.semester,
      a.enrollment.schoolYear, a.enrollment.semester
    ) ? 1 : -1)[0];

  if (!isLaterTerm(schoolYear, semester, latest.enrollment.schoolYear, latest.enrollment.semester)) {
    throw Object.assign(
      new Error(
        `A retake must be recorded in a later term than the original attempt (${latest.enrollment.schoolYear} ${latest.enrollment.semester})`
      ),
      { statusCode: 409, reasonCode: REASON.NOT_A_LATER_TERM }
    );
  }

  // Year level is deliberately NOT touched: a retake never demotes a student.
  const yearLevelBefore = Number(student.yearLevel);

  const { enrollment: header } = await createOrReactivateEnrollment({
    studentId: student._id,
    studentNumber: student.studentNumber,
    programCode: student.course,
    yearLevel: student.yearLevel,
    semester,
    schoolYear,
    curriculumVersion: student.curriculumVersion,
    status: 'Pending',
    createdBy: actorId,
    session,
  });

  // createOrReactivateEnrollment returns a plain lean object when it reuses an
  // existing header. Subject writes need a real document (markModified/save),
  // so re-load it whenever we did not get one back.
  let enrollment = header;
  if (typeof enrollment.save !== 'function') {
    enrollment = session
      ? await Enrollment.findById(header._id).session(session)
      : await Enrollment.findById(header._id);
    if (!enrollment) {
      throw Object.assign(new Error('Could not create the enrollment record for the retake term'), { statusCode: 500 });
    }
  }

  if (enrollment.lockedAt) {
    throw Object.assign(
      new Error(`The enrollment for ${schoolYear} ${semester} is locked as a historical record`),
      { statusCode: 409, reasonCode: REASON.ENROLLMENT_LOCKED }
    );
  }

  const { added, failed, requiresOverride } = await addSubjectsToEnrollment({
    enrollment,
    student,
    subjectIds: [subjectId],
    actorId,
    overrideReason,
    session,
  });

  if (added.length === 0) {
    const failure = failed[0];
    const error = new Error(failure?.message || 'Retake could not be recorded');
    error.statusCode = 409;
    error.reasonCode = failure?.reasonCode || REASON.OVERRIDE_REQUIRED;
    error.details = failed;
    throw error;
  }

  // Link the new attempt back to the one it replaces. The source record is
  // read only — this snapshot is copied from it, never written to it.
  const newEntry = enrollment.subjects[enrollment.subjects.length - 1];
  newEntry.retakeOf = {
    enrollmentId: latest.enrollment._id,
    subjectEntryId: latest.entry._id,
    schoolYear: latest.enrollment.schoolYear,
    semester: latest.enrollment.semester,
    status: latest.entry.status,
    grade: typeof latest.entry.grade === 'number' ? latest.entry.grade : null,
    gradeMark: latest.entry.gradeMark || null,
  };
  enrollment.markModified('subjects');
  await enrollment.save({ session, validateBeforeSave: false });

  await recordAudit({
    action: 'RETAKE',
    resourceType: 'ENROLLMENT',
    resourceId: String(enrollment._id),
    resourceName: `${student.studentNumber || ''} — ${schoolYear} ${semester}`.trim(),
    description:
      `Retake of ${newEntry.code} recorded for ${schoolYear} ${semester} `
      + `(original ${latest.enrollment.schoolYear} ${latest.enrollment.semester}: `
      + `${latest.entry.status}${typeof latest.entry.grade === 'number' ? ` / grade ${latest.entry.grade}` : ''})`
      + (requiresOverride ? ` · override: ${String(overrideReason).trim()}` : ''),
    performedBy: actorId,
    performedByRole: auditRole(),
    oldValue: {
      schoolYear: latest.enrollment.schoolYear,
      semester: latest.enrollment.semester,
      status: latest.entry.status,
      grade: latest.entry.grade ?? null,
    },
    newValue: {
      enrollmentId: String(enrollment._id),
      subjectId: String(subjectId),
      schoolYear,
      semester,
      yearLevelUnchanged: Number(student.yearLevel) === yearLevelBefore,
    },
    status: 'SUCCESS',
    severity: 'HIGH',
  });

  return { enrollment, entry: newEntry, added: added[0], original: latest, requiresOverride };
}

module.exports = {
  PASSING_GRADE,
  REASON,
  LIVE_STATUSES,
  PRIOR_ATTEMPT_STATUSES,
  isRequirementSatisfied,
  isRetakeableAttempt,
  hasCompleteRetakeSnapshot,
  verifyRetakeReferences,
  isLaterTerm,
  loadEnrollmentHistory,
  loadTermSections,
  checkAcademicStanding,
  resolveSuggestedSubjects,
  autoAssignCurriculumSubjects,
  applySectionScheduleDefaults,
  validateSubjectSelection,
  addSubjectsToEnrollment,
  dropSubjectFromEnrollment,
  retakeSubject,
  recordAudit,
};
