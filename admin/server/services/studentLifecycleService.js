/**
 * Student lifecycle service — academic deficiency dismissal, restoration, and
 * readmission.
 *
 * Policy (the single source of truth for every dismissal decision):
 *   - A subject is identified by its curriculum subject identity (subjectId),
 *     not by the term in which it was taken. Every attempt at that subject —
 *     across terms, including retakes — is grouped together.
 *   - Only finalized (published) grade records are evaluated. Draft, submitted,
 *     verified, returned, or in-progress rows never count.
 *   - A finalized passing attempt resolves the subject permanently: an earlier
 *     failure stops counting once the subject is passed through a retake.
 *   - A subject whose finalized result is failing, and which has no passing
 *     attempt, is ONE unresolved failed subject — however many times it was
 *     failed, and regardless of duplicate grade rows in the same term.
 *   - Dropped/removed subjects and dropped/cancelled terms do not count as
 *     failures.
 *   - The threshold is a number of distinct unresolved failed subjects
 *     (default 3, configurable through SystemSetting 'academicDismissalPolicy').
 *   - Dismissal never deletes data. It archives active roster membership and
 *     appends a lifecycle history event plus an audit log.
 *   - An automatic academic-deficiency dismissal is reversed automatically when
 *     a finalized passing retake brings the count back below the threshold and
 *     policy permits it. Manual dismissals, voluntary withdrawals, and
 *     authorized readmissions are never reversed by the evaluator.
 *   - Historical attempts, grades, and dismissal events are never deleted or
 *     rewritten.
 *
 * Every dismissal decision must go through evaluateStudentAcademicStanding.
 * Controllers, rollover, and background jobs must not re-implement this policy.
 */

const mongoose = require('mongoose');
const Student = require('../models/Student');
const Enrollment = require('../models/Enrollment');
const AuditLog = require('../models/AuditLog');
const StudentNotification = require('../models/StudentNotification');
const StudentBlockAssignment = require('../models/StudentBlockAssignment');
const SectionWaitlist = require('../models/SectionWaitlist');
const BlockSection = require('../models/BlockSection');
const SystemSetting = require('../models/SystemSetting');
const gradingScaleService = require('./gradingScaleService');

async function invalidateActiveVerifications(studentId, reason) {
  try {
    const reEnrollmentVerificationService = require('./reEnrollmentVerificationService');
    if (typeof reEnrollmentVerificationService?.invalidateStudentVerifications === 'function') {
      await reEnrollmentVerificationService.invalidateStudentVerifications({ studentId, reason });
    }
  } catch (_error) {
    // Ignore when verification model is not initialized in isolated unit tests.
  }
}

const FAILURE_THRESHOLD = 3;
const DISMISSAL_POLICY_KEY = 'academicDismissalPolicy';
const DEFAULT_DISMISSAL_POLICY = {
  failureThreshold: FAILURE_THRESHOLD,
  allowAutomaticRecovery: true
};

const REASON_ACADEMIC_DEFICIENCY = 'ACADEMIC_DEFICIENCY';
const REASON_ACADEMIC_RESTORATION = 'ACADEMIC_DEFICIENCY_RESTORED';
const REASON_AUTHORIZED_READMISSION = 'AUTHORIZED_READMISSION';
const REASON_AUTHORIZED_REACTIVATION = 'AUTHORIZED_REACTIVATION';

const DECISION_AUTOMATIC_DISMISSAL = 'AUTOMATIC_DISMISSAL';
const DECISION_AUTOMATIC_RESTORATION = 'AUTOMATIC_RESTORATION';
const DECISION_READMITTED = 'READMITTED';
const DECISION_REACTIVATED = 'REACTIVATED';

const STANDING_GOOD = 'GOOD_STANDING';
const STANDING_PROBATION = 'ACADEMIC_PROBATION';
const STANDING_DISMISSED = 'DISMISSED';
const ACADEMIC_STANDINGS = new Set([STANDING_GOOD, STANDING_PROBATION, STANDING_DISMISSED]);

const DROPPED = 'Dropped';
const ACTIVE_LIFECYCLES = new Set(['Pending', 'Enrolled', 'Not Enrolled', 'Irregular']);
const READMISSION_STATUSES = new Set(['Pending', 'Not Enrolled', 'Irregular']);
// A reactivation reverses a leave of absence (or an archive/"inactive" state)
// back to an active, enrollable lifecycle. It is not a readmission: nothing was
// dismissed, so no dismissal event is being reversed.
const REACTIVATION_SOURCE_STATUSES = new Set(['Leave of Absence', 'Inactive']);
const SEMESTER_RANK = { '1st': 0, '2nd': 1, Summer: 2 };
const TERMINAL_NON_FAILING_MARKS = new Set(['INC', 'DRP', 'W', 'NG']);
const DROPPED_SUBJECT_STATUSES = new Set(['dropped', 'removed']);
const DROPPED_ENROLLMENT_STATUSES = new Set(['dropped', 'cancelled']);
const LIVE_ATTEMPT_STATUSES = new Set(['Enrolled', 'Incomplete']);

/** In-process serializer so concurrent grade writes for one student cannot interleave. */
const evaluationLocks = new Map();

function normalizeText(value) {
  return String(value ?? '').trim();
}

function normalizeMark(value) {
  return normalizeText(value).toUpperCase();
}

function schoolYearStart(schoolYear) {
  const start = Number.parseInt(String(schoolYear || '').slice(0, 4), 10);
  return Number.isFinite(start) ? start : 0;
}

function termSortValue(schoolYear, semester) {
  const rank = SEMESTER_RANK[normalizeText(semester)];
  return schoolYearStart(schoolYear) * 10 + (rank === undefined ? 0 : rank);
}

function timestampValue(value) {
  if (!value) return 0;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : 0;
}

/**
 * Normalize a configured passing grade. `null`/`undefined`/`''` mean "not
 * supplied" and must fall back to the institutional default — coercing them with
 * Number() yields 0, which would make every graded subject look failing.
 */
function normalizePassingGrade(value, fallback = 3) {
  if (value === null || value === undefined || normalizeText(value) === '') return fallback;
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : fallback;
}

function isDroppedSubjectEntry(entry) {
  if (!entry) return true;
  if (entry.droppedAt) return true;
  if (DROPPED_SUBJECT_STATUSES.has(normalizeText(entry.status).toLowerCase())) return true;
  return normalizeMark(entry.gradeMark) === 'DRP';
}

function hasFinalizedGradeValue(entry) {
  if (!entry) return false;
  if (normalizeMark(entry.gradeMark)) return true;
  return typeof entry.grade === 'number' && Number.isFinite(entry.grade);
}

/**
 * A grade is finalized only after publication. Legacy records may have the
 * aggregate submission stamped as Published while a subject-level status was
 * left at Verified; accept those only when the entry is not Draft/Returned.
 */
function isFinalizedSubjectEntry(entry, enrollment) {
  if (!entry) return false;
  const subjectStatus = normalizeText(entry.submissionStatus);
  if (subjectStatus === 'Published') return true;

  const aggregateStatus = normalizeText(enrollment?.gradeSubmission?.status);
  if (aggregateStatus !== 'Published') return false;
  if (subjectStatus === 'Draft' || subjectStatus === 'Returned') return false;
  return hasFinalizedGradeValue(entry);
}

function isFailingSubjectEntry(entry, passingGrade = 3) {
  if (!entry || isDroppedSubjectEntry(entry)) return false;

  const mark = normalizeMark(entry.gradeMark);
  if (mark === 'FA') return true;
  if (mark && TERMINAL_NON_FAILING_MARKS.has(mark)) return false;

  if (typeof entry.grade !== 'number' || !Number.isFinite(entry.grade)) return false;
  return entry.grade > normalizePassingGrade(passingGrade) + 1e-9;
}

/**
 * A passing attempt satisfies the subject. Mirrors the curriculum retake
 * reconciliation rules (a numeric grade at or below the passing grade, or a
 * Completed attempt without a numeric grade); a failed or dropped attempt never
 * satisfies it.
 */
function isPassingSubjectEntry(entry, passingGrade = 3) {
  if (!entry || isDroppedSubjectEntry(entry)) return false;

  const status = normalizeText(entry.status);
  const mark = normalizeMark(entry.gradeMark);
  if (status === 'Failed' || status === 'Removed' || status === 'Dropped') return false;
  if (mark === 'FA') return false;
  if (mark && TERMINAL_NON_FAILING_MARKS.has(mark)) return false;

  if (typeof entry.grade === 'number' && Number.isFinite(entry.grade)) {
    return entry.grade <= normalizePassingGrade(passingGrade) + 1e-9;
  }
  return status === 'Completed';
}

/** An attempt that is still being taken: no finalized outcome yet. */
function isOpenSubjectEntry(entry) {
  if (!entry || isDroppedSubjectEntry(entry)) return false;
  if (!LIVE_ATTEMPT_STATUSES.has(normalizeText(entry.status))) return false;
  if (normalizeMark(entry.gradeMark)) return false;
  return !(typeof entry.grade === 'number' && Number.isFinite(entry.grade));
}

/**
 * The curriculum subject identity an attempt belongs to. Every term, retake,
 * and duplicate row for the same subject collapses onto this key.
 */
function subjectIdentity(entry) {
  const rawSubjectId = entry?.subjectId?._id || entry?.subjectId;
  const subjectId = normalizeText(rawSubjectId);
  if (subjectId) return `subject:${subjectId}`;
  const code = normalizeMark(entry?.code);
  if (code) return `code:${code}`;
  const entryId = normalizeText(entry?._id);
  return entryId ? `entry:${entryId}` : '';
}

function failureSnapshot(enrollment, entry) {
  const mark = normalizeMark(entry.gradeMark) || null;
  const rawSubjectId = entry?.subjectId?._id || entry?.subjectId;
  return {
    enrollmentId: enrollment?._id || null,
    subjectEntryId: normalizeText(entry?._id) || null,
    subjectId: mongoose.Types.ObjectId.isValid(String(rawSubjectId || '')) ? rawSubjectId : null,
    code: normalizeText(entry?.code),
    title: normalizeText(entry?.title),
    units: Number.isFinite(Number(entry?.units)) ? Number(entry.units) : null,
    grade: typeof entry?.grade === 'number' && Number.isFinite(entry.grade)
      ? entry.grade
      : (mark === 'FA' ? 5 : null),
    gradeMark: mark,
    schoolYear: normalizeText(enrollment?.schoolYear),
    semester: normalizeText(enrollment?.semester),
    finalizedAt: entry?.dateModified || enrollment?.gradeSubmission?.publishedAt || null
  };
}

function attemptSortDescending(left, right) {
  if (right.termValue !== left.termValue) return right.termValue - left.termValue;
  if (right.modifiedAt !== left.modifiedAt) return right.modifiedAt - left.modifiedAt;
  return right.index - left.index;
}

/**
 * Pure collection logic so policy can be unit-tested without a database.
 *
 * Groups every attempt by curriculum subject identity, then reports one entry
 * per subject that is still failed: finalized as failing, never passed, and not
 * dropped.
 *
 * @param {Array<Object>} enrollments
 * @param {{ passingGrade?: number }} [options]
 * @returns {Array<Object>} distinct unresolved failure snapshots
 */
function collectUnresolvedFailures(enrollments, options = {}) {
  const passingGrade = normalizePassingGrade(options.passingGrade);
  const groups = new Map();
  let attemptIndex = 0;

  for (const enrollment of Array.isArray(enrollments) ? enrollments : []) {
    if (!enrollment) continue;
    if (DROPPED_ENROLLMENT_STATUSES.has(normalizeText(enrollment.status).toLowerCase())) continue;

    for (const entry of Array.isArray(enrollment.subjects) ? enrollment.subjects : []) {
      const key = subjectIdentity(entry);
      if (!key) continue;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push({
        enrollment,
        entry,
        index: attemptIndex++,
        termValue: termSortValue(enrollment.schoolYear, enrollment.semester),
        modifiedAt: timestampValue(entry?.dateModified),
        finalized: isFinalizedSubjectEntry(entry, enrollment),
        dropped: isDroppedSubjectEntry(entry),
        failing: isFailingSubjectEntry(entry, passingGrade),
        passing: isPassingSubjectEntry(entry, passingGrade),
        open: isOpenSubjectEntry(entry)
      });
    }
  }

  const failures = [];
  for (const attempts of groups.values()) {
    const validAttempts = attempts.filter((attempt) => attempt.finalized && !attempt.dropped);

    // A passed subject is resolved for good — a later failing row (for example
    // a grade-improvement retake that was failed) never revives the failure.
    if (validAttempts.some((attempt) => attempt.passing)) continue;

    const failingAttempts = validAttempts.filter((attempt) => attempt.failing);
    if (failingAttempts.length === 0) continue;

    // The latest finalized failing result identifies the unresolved subject;
    // earlier failed attempts stay in history but do not add to the count.
    const latest = failingAttempts.slice().sort(attemptSortDescending)[0];
    failures.push({
      ...failureSnapshot(latest.enrollment, latest.entry),
      failingAttempts: failingAttempts.length,
      retakeInProgress: attempts.some((attempt) => attempt.open)
    });
  }

  return failures.sort((left, right) => {
    const termDifference = termSortValue(left.schoolYear, left.semester)
      - termSortValue(right.schoolYear, right.semester);
    if (termDifference !== 0) return termDifference;
    return String(left.code || '').localeCompare(String(right.code || ''));
  });
}

function deriveAcademicStanding(unresolvedFailureCount, threshold = FAILURE_THRESHOLD) {
  const count = Number(unresolvedFailureCount) || 0;
  const limit = Number.isFinite(Number(threshold)) && Number(threshold) >= 1
    ? Number(threshold)
    : FAILURE_THRESHOLD;
  if (count >= limit) return STANDING_DISMISSED;
  if (count > 0) return STANDING_PROBATION;
  return STANDING_GOOD;
}

function latestFailureTerm(failures, fallback = {}) {
  const latest = (failures || []).reduce((current, failure) => {
    if (!current) return failure;
    return termSortValue(failure.schoolYear, failure.semester)
      > termSortValue(current.schoolYear, current.semester)
      ? failure
      : current;
  }, null);

  return {
    schoolYear: normalizeText(latest?.schoolYear || fallback.schoolYear),
    semester: normalizeText(latest?.semester || fallback.semester)
  };
}

function formatEffectiveDate(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 10);
}

function formatFailureList(failures) {
  const codes = (failures || []).map((failure) => failure.code).filter(Boolean);
  return codes.length ? codes.join(', ') : 'the qualifying failed subjects';
}

function buildDismissalMessage({ failures, effectiveDate, term }) {
  const termLabel = [term?.semester, term?.schoolYear].filter(Boolean).join(' ');
  return [
    `Your student status is now DROPPED effective ${formatEffectiveDate(effectiveDate)} for academic deficiency`,
    termLabel ? `(${termLabel})` : '',
    `Unresolved failed subjects: ${formatFailureList(failures)}.`,
    'Your profile, grades, and academic records remain available. Contact the Registrar if you believe this is an error or to request authorized readmission.'
  ].filter(Boolean).join(' ');
}

function buildReactivationMessage(event) {
  const status = normalizeText(event.status).toUpperCase();
  return [
    `Your student record was reactivated effective ${formatEffectiveDate(event.effectiveDate)}.`,
    `Your student status is now ${status}.`,
    normalizeText(event.remarks),
    'Coordinate with the Registrar for enrollment and block assignment.'
  ].filter(Boolean).join(' ');
}

function buildRestorationMessage(event) {
  const status = normalizeText(event.status).toUpperCase();
  return [
    `Your student status is now ${status} effective ${formatEffectiveDate(event.effectiveDate)}.`,
    event.remarks ? `${normalizeText(event.remarks)}` : 'Your academic-deficiency dismissal has been reversed.',
    'Your previous dismissal remains part of your permanent academic record.',
    'Coordinate with the Registrar for enrollment and block assignment.'
  ].filter(Boolean).join(' ');
}

async function ensureLifecycleNotification(student, event) {
  if (!student?._id || !event) return false;
  const eventId = event.eventId || event._id;
  if (!eventId) return false;

  const eventKey = `student-lifecycle:${String(eventId)}`;
  const title = event.status === DROPPED
    ? 'Student status: DROPPED'
    : event.decision === DECISION_AUTOMATIC_RESTORATION
      ? 'Student status restored'
      : event.decision === DECISION_REACTIVATED
        ? 'Student status reactivated'
        : `Student status: ${String(event.status || '').toUpperCase()}`;
  const message = event.status === DROPPED
    ? buildDismissalMessage({
      failures: event.failedSubjects || [],
      effectiveDate: event.effectiveDate,
      term: { schoolYear: event.schoolYear, semester: event.semester }
    })
    : event.decision === DECISION_AUTOMATIC_RESTORATION
      ? buildRestorationMessage(event)
      : event.decision === DECISION_REACTIVATED
        ? buildReactivationMessage(event)
        : [
        `Your readmission was approved effective ${formatEffectiveDate(event.effectiveDate)}.`,
        `Your student status is now ${String(event.status || '').toUpperCase()}.`,
        'Coordinate with the Registrar for enrollment and block assignment.'
      ].join(' ');

  await StudentNotification.updateOne(
    { studentId: student._id, eventKey },
    {
      $setOnInsert: {
        studentId: student._id,
        studentNumber: normalizeText(student.studentNumber),
        type: 'STATUS_UPDATE',
        title,
        message,
        eventKey,
        isRead: false,
        readAt: null,
        data: {
          lifecycleStatus: event.status,
          reason: event.reason,
          decision: event.decision,
          effectiveDate: event.effectiveDate,
          schoolYear: event.schoolYear || '',
          semester: event.semester || '',
          failedSubjects: event.failedSubjects || []
        }
      }
    },
    { upsert: true }
  );
  return true;
}

async function recalculateSectionPopulation(sectionIds) {
  const normalized = Array.from(new Set((sectionIds || []).map((value) => normalizeText(value)).filter(Boolean)));
  if (normalized.length === 0) return;

  const sectionObjectIds = normalized
    .filter((sectionId) => mongoose.Types.ObjectId.isValid(sectionId))
    .map((sectionId) => new mongoose.Types.ObjectId(sectionId));
  if (sectionObjectIds.length === 0) return;

  const counts = await StudentBlockAssignment.aggregate([
    { $match: { sectionId: { $in: sectionObjectIds }, status: 'ASSIGNED' } },
    { $group: { _id: '$sectionId', total: { $sum: 1 } } }
  ]);
  const countMap = new Map(counts.map((item) => [String(item._id), Number(item.total) || 0]));
  await Promise.all(sectionObjectIds.map((sectionId) => BlockSection.findByIdAndUpdate(
    sectionId,
    { $set: { currentPopulation: countMap.get(String(sectionId)) || 0 } }
  )));
}

async function archiveActiveRoster(studentId, { effectiveDate, reason, actorId } = {}) {
  const normalizedStudentId = String(studentId || '').trim();
  if (!normalizedStudentId) return { archived: false, sectionCount: 0 };

  const assignments = await StudentBlockAssignment.find({
    studentId: normalizedStudentId,
    status: { $in: ['ASSIGNED', 'WAITLISTED'] }
  }).select('_id sectionId status').lean();

  const waitlists = await SectionWaitlist.find({
    studentId: normalizedStudentId,
    status: { $ne: 'ARCHIVED' }
  }).select('_id sectionId status').lean();

  const affectedSectionIds = Array.from(new Set(
    [...assignments, ...waitlists]
      .map((entry) => normalizeText(entry.sectionId))
      .filter(Boolean)
  ));

  const assignmentIds = assignments.map((entry) => entry._id);
  if (assignmentIds.length > 0) {
    // Group by prior status so restoration can put each membership back where
    // it was instead of guessing.
    for (const previousStatus of ['ASSIGNED', 'WAITLISTED']) {
      const ids = assignments
        .filter((entry) => (normalizeText(entry.status) || 'ASSIGNED') === previousStatus)
        .map((entry) => entry._id);
      if (ids.length === 0) continue;
      await StudentBlockAssignment.updateMany(
        { _id: { $in: ids } },
        {
          $set: {
            status: 'ARCHIVED',
            archivePreviousStatus: previousStatus,
            archivedAt: effectiveDate || new Date(),
            archivedBy: actorId || null,
            archiveReason: reason || REASON_ACADEMIC_DEFICIENCY
          }
        }
      );
    }
  }

  const waitlistIds = waitlists.map((entry) => entry._id);
  if (waitlistIds.length > 0) {
    await SectionWaitlist.updateMany(
      { _id: { $in: waitlistIds } },
      {
        $set: {
          status: 'ARCHIVED',
          archivePreviousStatus: 'ACTIVE',
          archivedAt: effectiveDate || new Date(),
          archivedBy: actorId || null,
          archiveReason: reason || REASON_ACADEMIC_DEFICIENCY
        }
      }
    );
  }

  // Keep section population accurate without deleting the archived record.
  await recalculateSectionPopulation(affectedSectionIds);

  return {
    archived: assignmentIds.length > 0 || waitlistIds.length > 0,
    sectionCount: affectedSectionIds.length
  };
}

/**
 * Reverse a dismissal's roster archiving. Only memberships archived by the same
 * reason are touched; each one returns to the status it held before archiving.
 */
async function restoreActiveRoster(studentId, { reason, actorId } = {}) {
  const normalizedStudentId = String(studentId || '').trim();
  if (!normalizedStudentId) return { restored: false, sectionCount: 0 };

  const archiveReason = reason || REASON_ACADEMIC_DEFICIENCY;

  const assignments = await StudentBlockAssignment.find({
    studentId: normalizedStudentId,
    status: 'ARCHIVED',
    archiveReason
  }).select('_id sectionId archivePreviousStatus').lean();

  const waitlists = await SectionWaitlist.find({
    studentId: normalizedStudentId,
    status: 'ARCHIVED',
    archiveReason
  }).select('_id sectionId').lean();

  const affectedSectionIds = Array.from(new Set(
    [...assignments, ...waitlists]
      .map((entry) => normalizeText(entry.sectionId))
      .filter(Boolean)
  ));

  for (const targetStatus of ['ASSIGNED', 'WAITLISTED']) {
    const ids = assignments
      .filter((entry) => (normalizeText(entry.archivePreviousStatus) || 'ASSIGNED') === targetStatus)
      .map((entry) => entry._id);
    if (ids.length === 0) continue;
    await StudentBlockAssignment.updateMany(
      { _id: { $in: ids }, status: 'ARCHIVED' },
      {
        $set: {
          status: targetStatus,
          archivePreviousStatus: null,
          archivedAt: null,
          archivedBy: null,
          archiveReason: null
        }
      }
    );
  }

  const waitlistIds = waitlists.map((entry) => entry._id);
  if (waitlistIds.length > 0) {
    await SectionWaitlist.updateMany(
      { _id: { $in: waitlistIds }, status: 'ARCHIVED' },
      {
        $set: {
          status: 'ACTIVE',
          archivePreviousStatus: null,
          archivedAt: null,
          archivedBy: null,
          archiveReason: null
        }
      }
    );
  }

  await recalculateSectionPopulation(affectedSectionIds);

  return {
    restored: assignments.length > 0 || waitlistIds.length > 0,
    sectionCount: affectedSectionIds.length
  };
}

async function writeAuditLog({
  student,
  actorId,
  accountType,
  description,
  oldValue,
  newValue,
  action = 'UPDATE',
  severity = 'CRITICAL'
}) {
  if (!actorId || !mongoose.Types.ObjectId.isValid(String(actorId))) return false;
  await AuditLog.create({
    action,
    resourceType: 'STUDENT',
    resourceId: String(student?._id || ''),
    resourceName: `${normalizeText(student?.studentNumber)} — ${normalizeText(student?.lastName)}, ${normalizeText(student?.firstName)}`.trim(),
    description: String(description || '').slice(0, 500),
    performedBy: actorId,
    performedByRole: String(accountType || 'registrar').toLowerCase() === 'admin' ? 'admin' : 'registrar',
    oldValue,
    newValue,
    status: 'SUCCESS',
    severity
  });
  return true;
}

async function resolvePassingGrade(explicitPassingGrade) {
  if (explicitPassingGrade !== null && explicitPassingGrade !== undefined
    && normalizeText(explicitPassingGrade) !== '') {
    const explicit = Number(explicitPassingGrade);
    if (Number.isFinite(explicit) && explicit > 0) return explicit;
  }
  try {
    const scale = await gradingScaleService.loadGradeScale();
    return Number.isFinite(Number(scale?.passingGrade)) ? Number(scale.passingGrade) : 3;
  } catch (_error) {
    return 3;
  }
}

/** Merge a stored policy document with the safe defaults. */
function mergeDismissalPolicy(value) {
  const stored = value && typeof value === 'object' ? value : {};
  const candidate = Number(stored.failureThreshold);
  return {
    failureThreshold: Number.isFinite(candidate) && candidate >= 1
      ? Math.floor(candidate)
      : DEFAULT_DISMISSAL_POLICY.failureThreshold,
    allowAutomaticRecovery: stored.allowAutomaticRecovery === undefined
      ? DEFAULT_DISMISSAL_POLICY.allowAutomaticRecovery
      : Boolean(stored.allowAutomaticRecovery)
  };
}

async function loadDismissalPolicy() {
  try {
    const doc = await SystemSetting.findOne({ key: DISMISSAL_POLICY_KEY }).lean();
    return mergeDismissalPolicy(doc?.value);
  } catch (error) {
    console.error('[student-lifecycle] Failed to load the dismissal policy, using defaults:', error);
    return { ...DEFAULT_DISMISSAL_POLICY };
  }
}

function resolveThreshold(explicitThreshold, policy) {
  const candidate = Number(explicitThreshold ?? policy?.failureThreshold);
  if (Number.isFinite(candidate) && candidate >= 1) return Math.floor(candidate);
  return FAILURE_THRESHOLD;
}

function currentDismissalEvent(student) {
  const history = Array.isArray(student?.lifecycleStatusHistory) ? student.lifecycleStatusHistory : [];
  const eventId = normalizeText(student?.lifecycleStatusEventId);

  let index = eventId
    ? history.findIndex((entry) => normalizeText(entry?.eventId) === eventId)
    : -1;
  if (index === -1) {
    for (let cursor = history.length - 1; cursor >= 0; cursor -= 1) {
      if (normalizeText(history[cursor]?.status) === DROPPED) {
        index = cursor;
        break;
      }
    }
  }
  if (index === -1) return null;
  return { event: history[index], index };
}

/**
 * Only a system-generated academic-deficiency dismissal may be reversed
 * automatically. A manual dismissal, a withdrawal, or an authorized readmission
 * carries a different reason/decision and is left untouched.
 */
function isAutomaticAcademicDismissal(student, dismissal) {
  if (normalizeText(student?.lifecycleStatusReason) !== REASON_ACADEMIC_DEFICIENCY) return false;
  const event = dismissal?.event;
  if (!event) return false;
  return normalizeText(event.reason) === REASON_ACADEMIC_DEFICIENCY
    && normalizeText(event.decision) === DECISION_AUTOMATIC_DISMISSAL;
}

/** The status the student held before the dismissal, never a new invention. */
function resolveRestorationStatus(student, dismissal, enrollments) {
  const history = Array.isArray(student?.lifecycleStatusHistory) ? student.lifecycleStatusHistory : [];
  const limit = dismissal && dismissal.index >= 0 ? dismissal.index : history.length;
  for (let cursor = limit - 1; cursor >= 0; cursor -= 1) {
    const status = normalizeText(history[cursor]?.status);
    if (ACTIVE_LIFECYCLES.has(status)) return status;
  }

  const hasLiveEnrollment = (Array.isArray(enrollments) ? enrollments : []).some((enrollment) => {
    if (!enrollment) return false;
    if (DROPPED_ENROLLMENT_STATUSES.has(normalizeText(enrollment.status).toLowerCase())) return false;
    const status = normalizeText(enrollment.status);
    if (status !== 'Enrolled' && status !== 'Pending') return false;
    return normalizeText(enrollment.schoolYear) === normalizeText(student?.schoolYear)
      && normalizeText(enrollment.semester) === normalizeText(student?.semester);
  });

  return hasLiveEnrollment ? 'Enrolled' : 'Not Enrolled';
}

function withStudentEvaluationLock(studentId, task) {
  const key = String(studentId);
  const previous = evaluationLocks.get(key) || Promise.resolve();
  const run = previous.catch(() => {}).then(task);

  let tracked;
  tracked = run.then(
    (value) => {
      if (evaluationLocks.get(key) === tracked) evaluationLocks.delete(key);
      return value;
    },
    (error) => {
      if (evaluationLocks.get(key) === tracked) evaluationLocks.delete(key);
      throw error;
    }
  );
  evaluationLocks.set(key, tracked);
  return tracked;
}

/** Keep academic standing in step with the unresolved failure count. */
async function syncAcademicStanding({
  student,
  academicStanding,
  failureCount,
  threshold,
  actorId,
  accountType,
  source,
  effectiveDate
}) {
  const current = ACADEMIC_STANDINGS.has(normalizeText(student?.academicStanding))
    ? normalizeText(student.academicStanding)
    : STANDING_GOOD;
  if (current === academicStanding) return { changed: false, academicStanding: current };

  // Database-level guard: only the first evaluation to observe the previous
  // standing changes it, and an evaluation that started before a newer one
  // (older effectiveDate) cannot overwrite the newer standing. Duplicate or
  // stale evaluations therefore produce no write at all.
  const updated = await Student.findOneAndUpdate(
    {
      _id: student._id,
      academicStanding: { $ne: academicStanding },
      $or: [
        { academicStandingUpdatedAt: null },
        { academicStandingUpdatedAt: { $exists: false } },
        { academicStandingUpdatedAt: { $lt: effectiveDate } }
      ]
    },
    {
      $set: {
        academicStanding,
        academicStandingUpdatedAt: effectiveDate,
        lastUpdated: effectiveDate
      }
    },
    { new: true, runValidators: true }
  );

  if (!updated) return { changed: false, academicStanding };

  try {
    await writeAuditLog({
      student: updated,
      actorId,
      accountType,
      action: 'UPDATE',
      severity: 'MEDIUM',
      description: `Academic standing for ${normalizeText(updated.studentNumber)} changed from ${current} to ${academicStanding} after ${failureCount} distinct unresolved failed subject(s) (dismissal threshold ${threshold}).`,
      oldValue: { academicStanding: current },
      newValue: {
        academicStanding,
        unresolvedFailureCount: failureCount,
        threshold,
        source
      }
    });
  } catch (error) {
    console.error('[student-lifecycle] Failed to write academic-standing audit log:', error);
  }

  return { changed: true, academicStanding, previousAcademicStanding: current };
}

/** Retry a dismissal/restoration notification left pending by an earlier failure. */
async function retryPendingNotification(student) {
  let notificationCreated = false;
  const dismissal = currentDismissalEvent(student);
  const event = dismissal?.event;
  if (!event) return { notificationCreated, event: null };

  try {
    notificationCreated = await ensureLifecycleNotification(student, event);
    if (notificationCreated && student.lifecycleStatusNotificationPending) {
      await Student.updateOne(
        { _id: student._id },
        { $set: { lifecycleStatusNotificationPending: false } }
      ).catch(() => {});
    }
  } catch (error) {
    console.error('[student-lifecycle] Failed to retry lifecycle notification:', error);
    await Student.updateOne(
      { _id: student._id },
      { $set: { lifecycleStatusNotificationPending: true } }
    ).catch(() => {});
  }
  return { notificationCreated, event };
}

/**
 * Dismiss an active student whose unresolved failures reached the threshold.
 * The write filter makes concurrent evaluations safe: only one can transition
 * the lifecycle and append the event.
 */
async function applyAutomaticDismissal({
  student,
  failures,
  threshold,
  academicStanding,
  currentStatus,
  actorId,
  accountType,
  source,
  effectiveDate
}) {
  const term = latestFailureTerm(failures, {
    schoolYear: student.schoolYear,
    semester: student.semester
  });
  const eventId = new mongoose.Types.ObjectId();
  const event = {
    eventId,
    status: DROPPED,
    reason: REASON_ACADEMIC_DEFICIENCY,
    effectiveDate,
    schoolYear: term.schoolYear,
    semester: term.semester,
    failedSubjects: failures,
    decision: DECISION_AUTOMATIC_DISMISSAL,
    remarks: `${threshold} or more distinct unresolved failed subjects. A subject counts once; a subject passed through a retake does not count.`,
    source,
    changedAt: effectiveDate,
    changedBy: actorId || null
  };

  // The write filter repeats the eligibility check so a stale read (a student
  // who graduated, withdrew, or was already dismissed concurrently) cannot be
  // dismissed by this evaluation.
  const updated = await Student.findOneAndUpdate(
    { _id: student._id, lifecycleStatus: { $in: Array.from(ACTIVE_LIFECYCLES) } },
    {
      $set: {
        lifecycleStatus: DROPPED,
        lifecycleStatusReason: REASON_ACADEMIC_DEFICIENCY,
        lifecycleStatusEffectiveDate: effectiveDate,
        lifecycleStatusTerm: term,
        lifecycleStatusFailedSubjects: failures,
        lifecycleStatusEventId: eventId,
        lifecycleStatusChangedAt: effectiveDate,
        lifecycleStatusChangedBy: actorId || null,
        lifecycleStatusNotificationPending: false,
        academicStanding,
        academicStandingUpdatedAt: effectiveDate,
        lastUpdated: effectiveDate
      },
      $push: { lifecycleStatusHistory: event }
    },
    { new: true, runValidators: true }
  );

  if (!updated) {
    return {
      changed: false,
      alreadyDropped: true,
      failureCount: failures.length,
      unresolvedFailureCount: failures.length,
      threshold,
      failures,
      academicStanding
    };
  }

  let rosterArchived = false;
  try {
    const archiveResult = await archiveActiveRoster(student._id, {
      effectiveDate,
      reason: REASON_ACADEMIC_DEFICIENCY,
      actorId
    });
    rosterArchived = archiveResult.archived;
  } catch (error) {
    console.error('[student-lifecycle] Failed to archive roster membership:', error);
  }

  try {
    if (typeof Enrollment.updateMany === 'function') {
      await Enrollment.updateMany(
        {
          studentId: student._id,
          lockedAt: null,
          isCurrent: true,
          status: { $in: ['Pending', 'Enrolled'] }
        },
        { $set: { isCurrent: false } }
      );
    }
  } catch (error) {
    console.error('[student-lifecycle] Failed to retire active enrollment on dismissal:', error);
  }

  await invalidateActiveVerifications(student._id, REASON_ACADEMIC_DEFICIENCY);

  let auditLogged = false;
  try {
    auditLogged = await writeAuditLog({
      student: updated,
      actorId,
      accountType,
      description: `Student ${normalizeText(updated.studentNumber)} dismissed (lifecycle ${currentStatus} → DROPPED) for academic deficiency after ${failures.length} distinct unresolved failed subject(s) (${formatFailureList(failures)}) reached the configured threshold of ${threshold}.`,
      oldValue: { lifecycleStatus: currentStatus },
      newValue: {
        lifecycleStatus: DROPPED,
        lifecycleStatusReason: REASON_ACADEMIC_DEFICIENCY,
        effectiveDate,
        schoolYear: term.schoolYear,
        semester: term.semester,
        unresolvedFailureCount: failures.length,
        threshold,
        failedSubjectCodes: failures.map((failure) => failure.code)
      }
    });
  } catch (error) {
    console.error('[student-lifecycle] Failed to write dismissal audit log:', error);
  }

  let notificationCreated = false;
  try {
    notificationCreated = await ensureLifecycleNotification(updated, event);
    if (!notificationCreated) {
      await Student.updateOne(
        { _id: updated._id },
        { $set: { lifecycleStatusNotificationPending: true } }
      ).catch(() => {});
    }
  } catch (error) {
    console.error('[student-lifecycle] Failed to create dismissal notification:', error);
    await Student.updateOne(
      { _id: updated._id },
      { $set: { lifecycleStatusNotificationPending: true } }
    ).catch(() => {});
  }

  return {
    changed: true,
    failureCount: failures.length,
    unresolvedFailureCount: failures.length,
    threshold,
    failures,
    term,
    academicStanding,
    lifecycleStatus: DROPPED,
    eventId: String(eventId),
    rosterArchived,
    auditLogged,
    notificationCreated
  };
}

/**
 * Reverse a system-generated academic-deficiency dismissal after the student
 * passed a retake. The dismissal event stays in history; a restoration event is
 * appended, and roster membership archived by the dismissal is reinstated.
 */
async function applyAutomaticRestoration({
  student,
  dismissal,
  failures,
  threshold,
  academicStanding,
  enrollments,
  actorId,
  accountType,
  source,
  effectiveDate
}) {
  const restoredStatus = resolveRestorationStatus(student, dismissal, enrollments);
  const term = latestFailureTerm(failures, {
    schoolYear: student.schoolYear,
    semester: student.semester
  });
  const dismissalEventId = dismissal?.event?.eventId || null;
  const eventId = new mongoose.Types.ObjectId();
  const isReconciliation = source === 'lifecycle_reconciliation';
  const remarks = isReconciliation
    ? `Automatic restoration: academic deficiency evaluation corrected. The unresolved failed subject count of ${failures.length} does not meet the dismissal threshold of ${threshold}. The earlier dismissal (${formatEffectiveDate(dismissal?.event?.effectiveDate || dismissal?.event?.changedAt) || 'recorded'}) remains in the audit history.`
    : `Automatic restoration: the unresolved failed subject count fell to ${failures.length}, below the dismissal threshold of ${threshold}, after a finalized passing retake. The earlier dismissal (${formatEffectiveDate(dismissal?.event?.effectiveDate || dismissal?.event?.changedAt) || 'recorded'}) remains in the audit history.`;

  const event = {
    eventId,
    status: restoredStatus,
    reason: REASON_ACADEMIC_RESTORATION,
    effectiveDate,
    schoolYear: term.schoolYear,
    semester: term.semester,
    failedSubjects: failures,
    decision: DECISION_AUTOMATIC_RESTORATION,
    remarks,
    source,
    changedAt: effectiveDate,
    changedBy: actorId || null
  };

  const filter = { _id: student._id, lifecycleStatus: DROPPED };
  if (dismissalEventId) filter.lifecycleStatusEventId = dismissalEventId;

  const updated = await Student.findOneAndUpdate(
    filter,
    {
      $set: {
        lifecycleStatus: restoredStatus,
        lifecycleStatusReason: REASON_ACADEMIC_RESTORATION,
        lifecycleStatusEffectiveDate: effectiveDate,
        lifecycleStatusTerm: term,
        lifecycleStatusFailedSubjects: failures,
        lifecycleStatusEventId: eventId,
        lifecycleStatusChangedAt: effectiveDate,
        lifecycleStatusChangedBy: actorId || null,
        lifecycleStatusNotificationPending: false,
        academicStanding,
        academicStandingUpdatedAt: effectiveDate,
        isActive: true,
        lastUpdated: effectiveDate
      },
      $push: { lifecycleStatusHistory: event }
    },
    { new: true, runValidators: true }
  );

  if (!updated) {
    return {
      changed: false,
      alreadyDropped: true,
      restored: false,
      failureCount: failures.length,
      unresolvedFailureCount: failures.length,
      threshold,
      failures,
      academicStanding,
      reason: 'dismissal_state_changed_concurrently'
    };
  }

  let rosterRestored = false;
  try {
    const restoreResult = await restoreActiveRoster(student._id, {
      reason: REASON_ACADEMIC_DEFICIENCY,
      actorId
    });
    rosterRestored = restoreResult.restored;
  } catch (error) {
    console.error('[student-lifecycle] Failed to restore roster membership:', error);
  }

  let auditLogged = false;
  try {
    const logDescription = isReconciliation
      ? `Student ${normalizeText(updated.studentNumber)} restored (lifecycle DROPPED → ${restoredStatus}) after academic deficiency evaluation correction: unresolved failed subjects (${failures.length}) below threshold (${threshold}).`
      : `Student ${normalizeText(updated.studentNumber)} restored (lifecycle DROPPED → ${restoredStatus}) after a finalized passing retake reduced unresolved failed subjects to ${failures.length}, below the configured threshold of ${threshold}.`;

    auditLogged = await writeAuditLog({
      student: updated,
      actorId,
      accountType,
      description: logDescription,
      oldValue: {
        lifecycleStatus: DROPPED,
        lifecycleStatusReason: REASON_ACADEMIC_DEFICIENCY,
        failedSubjects: (student.lifecycleStatusFailedSubjects || []).map((entry) => ({
          code: entry.code,
          grade: entry.grade,
          gradeMark: entry.gradeMark,
          schoolYear: entry.schoolYear,
          semester: entry.semester
        })),
        dismissalEventId: dismissalEventId ? String(dismissalEventId) : null,
        dismissalEffectiveDate: dismissal?.event?.effectiveDate || null
      },
      newValue: {
        lifecycleStatus: restoredStatus,
        lifecycleStatusReason: REASON_ACADEMIC_RESTORATION,
        effectiveDate,
        unresolvedFailureCount: failures.length,
        threshold,
        remainingFailedSubjectCodes: failures.map((failure) => failure.code),
        source
      }
    });
  } catch (error) {
    console.error('[student-lifecycle] Failed to write restoration audit log:', error);
  }

  let notificationCreated = false;
  try {
    notificationCreated = await ensureLifecycleNotification(updated, event);
  } catch (error) {
    console.error('[student-lifecycle] Failed to create restoration notification:', error);
    await Student.updateOne(
      { _id: updated._id },
      { $set: { lifecycleStatusNotificationPending: true } }
    ).catch(() => {});
  }

  return {
    changed: true,
    restored: true,
    recovered: true,
    failureCount: failures.length,
    unresolvedFailureCount: failures.length,
    threshold,
    failures,
    academicStanding,
    lifecycleStatus: restoredStatus,
    previousLifecycleStatus: DROPPED,
    dismissalEventId: dismissalEventId ? String(dismissalEventId) : null,
    eventId: String(eventId),
    term,
    rosterRestored,
    auditLogged,
    notificationCreated
  };
}

function normalizeEvaluationArgs(input) {
  if (typeof input === 'string') return { studentId: input };
  if (!input || typeof input !== 'object') return {};
  if (input.studentId) return input;
  // An ObjectId (or similar identifier) passed directly instead of an options object.
  const asText = String(input);
  if (asText && asText !== '[object Object]') return { studentId: input };
  return input;
}

async function evaluateUnlocked({
  studentId,
  actorId = null,
  accountType = 'registrar',
  source = 'grade_publication',
  effectiveDate = new Date(),
  passingGrade = null,
  threshold = null
}) {
  if (!studentId) {
    return { changed: false, failureCount: 0, unresolvedFailureCount: 0, reason: 'student_id_required' };
  }

  const student = await Student.findById(studentId);
  if (!student) {
    return { changed: false, failureCount: 0, unresolvedFailureCount: 0, reason: 'student_not_found' };
  }

  const policy = await loadDismissalPolicy();
  const resolvedPassingGrade = await resolvePassingGrade(passingGrade);
  const dismissalThreshold = resolveThreshold(threshold, policy);
  const enrollments = await Enrollment.find({ studentId: student._id })
    .select('schoolYear semester status lockedAt gradeSubmission subjects')
    .lean();
  const failures = collectUnresolvedFailures(enrollments, { passingGrade: resolvedPassingGrade });
  const failureCount = failures.length;
  const academicStanding = deriveAcademicStanding(failureCount, dismissalThreshold);
  const currentStatus = normalizeText(student.lifecycleStatus) || 'Pending';

  const base = {
    failureCount,
    unresolvedFailureCount: failureCount,
    threshold: dismissalThreshold,
    failures,
    academicStanding
  };

  if (currentStatus === DROPPED) {
    const dismissal = currentDismissalEvent(student);
    const automatic = isAutomaticAcademicDismissal(student, dismissal);

    if (!automatic) {
      const { notificationCreated } = await retryPendingNotification(student);
      return {
        ...base,
        changed: false,
        alreadyDropped: true,
        restored: false,
        lifecycleStatus: DROPPED,
        notificationCreated,
        reason: 'dismissal_not_system_generated'
      };
    }

    if (failureCount >= dismissalThreshold) {
      const { notificationCreated } = await retryPendingNotification(student);
      return {
        ...base,
        changed: false,
        alreadyDropped: true,
        restored: false,
        lifecycleStatus: DROPPED,
        notificationCreated,
        reason: 'dismissal_threshold_still_met'
      };
    }

    if (!policy.allowAutomaticRecovery) {
      const { notificationCreated } = await retryPendingNotification(student);
      return {
        ...base,
        changed: false,
        alreadyDropped: true,
        restored: false,
        lifecycleStatus: DROPPED,
        notificationCreated,
        reason: 'automatic_recovery_disabled_by_policy'
      };
    }

    return applyAutomaticRestoration({
      student,
      dismissal,
      failures,
      threshold: dismissalThreshold,
      academicStanding,
      enrollments,
      actorId,
      accountType,
      source,
      effectiveDate
    });
  }

  if (!ACTIVE_LIFECYCLES.has(currentStatus)) {
    return {
      ...base,
      changed: false,
      reason: 'lifecycle_not_eligible_for_automatic_dismissal'
    };
  }

  if (failureCount < dismissalThreshold) {
    const standingUpdate = await syncAcademicStanding({
      student,
      academicStanding,
      failureCount,
      threshold: dismissalThreshold,
      actorId,
      accountType,
      source,
      effectiveDate
    });
    return {
      ...base,
      changed: false,
      lifecycleStatus: currentStatus,
      standingChanged: standingUpdate.changed
    };
  }

  return applyAutomaticDismissal({
    student,
    failures,
    threshold: dismissalThreshold,
    academicStanding,
    currentStatus,
    actorId,
    accountType,
    source,
    effectiveDate
  });
}

/**
 * THE centralized academic-standing evaluation.
 *
 * Loads the student's complete subject enrollment and finalized grade history,
 * groups attempts by curriculum subject identity, counts distinct unresolved
 * failed subjects, compares the result with the configured dismissal threshold,
 * and then dismisses, restores, or updates academic standing as appropriate.
 *
 * Idempotent: re-running it produces no additional lifecycle event, no duplicate
 * notification, and no duplicate audit entry. Serialized per student so
 * concurrent grade finalizations cannot interleave.
 *
 * @param {Object|string} options - options object, or a studentId
 * @param {string|Object} options.studentId
 * @param {string|Object} [options.actorId]
 * @param {string} [options.accountType]
 * @param {string} [options.source]
 * @param {Date} [options.effectiveDate]
 * @param {number} [options.passingGrade]
 * @param {number} [options.threshold]
 * @returns {Promise<Object>} evaluation result
 */
async function evaluateStudentAcademicStanding(options = {}) {
  const normalized = normalizeEvaluationArgs(options);
  const studentId = normalized.studentId;
  if (!studentId) {
    return { changed: false, failureCount: 0, unresolvedFailureCount: 0, reason: 'student_id_required' };
  }
  return withStudentEvaluationLock(studentId, () => evaluateUnlocked(normalized));
}

/**
 * Read-only companion to evaluateStudentAcademicStanding.
 *
 * Computes the same unresolved failure count, threshold, academic standing,
 * and eligibility flags, and reports the action the evaluator WOULD take —
 * without writing anything. Used by the dismissal reconciliation dry run so an
 * operator can review every case before a single record changes.
 *
 * @param {Object|string} options - options object, or a studentId
 * @returns {Promise<Object>} preview suitable for a report
 */
async function previewStudentAcademicStanding(options = {}) {
  const normalized = normalizeEvaluationArgs(options);
  const studentId = normalized.studentId;
  const empty = {
    changed: false,
    failureCount: 0,
    unresolvedFailureCount: 0,
    failures: [],
    plannedAction: 'none'
  };
  if (!studentId) return { ...empty, reason: 'student_id_required' };

  const student = await Student.findById(studentId);
  if (!student) return { ...empty, reason: 'student_not_found' };

  const policy = await loadDismissalPolicy();
  const resolvedPassingGrade = await resolvePassingGrade(normalized.passingGrade);
  const threshold = resolveThreshold(normalized.threshold, policy);
  const enrollments = await Enrollment.find({ studentId: student._id })
    .select('schoolYear semester status lockedAt gradeSubmission subjects')
    .lean();
  const failures = collectUnresolvedFailures(enrollments, { passingGrade: resolvedPassingGrade });
  const failureCount = failures.length;
  const academicStanding = deriveAcademicStanding(failureCount, threshold);
  const currentStatus = normalizeText(student.lifecycleStatus) || 'Pending';
  const dismissal = currentDismissalEvent(student);
  const automaticDismissal = isAutomaticAcademicDismissal(student, dismissal);

  const base = {
    studentId: String(student._id),
    studentNumber: normalizeText(student.studentNumber),
    studentName: [normalizeText(student.lastName), normalizeText(student.firstName)].filter(Boolean).join(', '),
    failureCount,
    unresolvedFailureCount: failureCount,
    threshold,
    failures,
    academicStanding,
    currentAcademicStanding: normalizeText(student.academicStanding) || STANDING_GOOD,
    lifecycleStatus: currentStatus,
    lifecycleStatusReason: normalizeText(student.lifecycleStatusReason) || null,
    dismissalEventId: dismissal?.event?.eventId ? String(dismissal.event.eventId) : null,
    dismissalEffectiveDate: dismissal?.event?.effectiveDate || null,
    automaticDismissal,
    allowAutomaticRecovery: policy.allowAutomaticRecovery
  };

  if (currentStatus === DROPPED) {
    if (!automaticDismissal) {
      return { ...base, plannedAction: 'none', reason: 'dismissal_not_system_generated' };
    }
    if (failureCount >= threshold) {
      return { ...base, plannedAction: 'none', reason: 'dismissal_threshold_still_met' };
    }
    if (!policy.allowAutomaticRecovery) {
      return { ...base, plannedAction: 'none', reason: 'automatic_recovery_disabled_by_policy' };
    }
    return { ...base, plannedAction: 'restore', reason: 'recovery_eligible' };
  }

  if (!ACTIVE_LIFECYCLES.has(currentStatus)) {
    return { ...base, plannedAction: 'none', reason: 'lifecycle_not_eligible_for_automatic_dismissal' };
  }

  if (failureCount < threshold) {
    return {
      ...base,
      plannedAction: base.currentAcademicStanding === academicStanding ? 'none' : 'sync_academic_standing',
      reason: 'below_threshold'
    };
  }

  return { ...base, plannedAction: 'dismiss', reason: 'dismissal_threshold_met' };
}

/**
 * Authorized readmission. Keeps the dismissal event in history and creates a
 * new history entry; it does not rewrite the prior status.
 */
async function readmitStudent({
  studentId,
  lifecycleStatus = 'Pending',
  reason,
  remarks = '',
  schoolYear = null,
  semester = null,
  actorId = null,
  accountType = 'registrar',
  effectiveDate = new Date()
} = {}) {
  const targetStatus = normalizeText(lifecycleStatus) || 'Pending';
  if (!READMISSION_STATUSES.has(targetStatus)) {
    const error = new Error(`Readmission target must be one of ${Array.from(READMISSION_STATUSES).join(', ')}.`);
    error.statusCode = 400;
    throw error;
  }

  const student = await Student.findById(studentId);
  if (!student) {
    const error = new Error('Student not found');
    error.statusCode = 404;
    throw error;
  }
  if (normalizeText(student.lifecycleStatus) !== DROPPED) {
    const error = new Error('Only a DROPPED student can be readmitted.');
    error.statusCode = 409;
    throw error;
  }

  const requestedSchoolYear = normalizeText(schoolYear);
  const requestedSemester = normalizeText(semester);
  const resolvedSchoolYear =
    requestedSchoolYear ||
    normalizeText(student.lifecycleStatusTerm?.schoolYear || student.schoolYear);
  const resolvedSemester =
    requestedSemester ||
    normalizeText(student.lifecycleStatusTerm?.semester || student.semester);

  const eventId = new mongoose.Types.ObjectId();
  const event = {
    eventId,
    status: targetStatus,
    reason: REASON_AUTHORIZED_READMISSION,
    effectiveDate,
    schoolYear: resolvedSchoolYear,
    semester: resolvedSemester,
    failedSubjects: [],
    decision: DECISION_READMITTED,
    remarks: normalizeText(remarks || reason),
    source: 'authorized_readmission',
    changedAt: effectiveDate,
    changedBy: actorId || null
  };

  const update = {
    $set: {
      lifecycleStatus: targetStatus,
      lifecycleStatusReason: REASON_AUTHORIZED_READMISSION,
      lifecycleStatusEffectiveDate: effectiveDate,
      lifecycleStatusTerm: { schoolYear: event.schoolYear, semester: event.semester },
      lifecycleStatusFailedSubjects: [],
      lifecycleStatusEventId: eventId,
      lifecycleStatusChangedAt: effectiveDate,
      lifecycleStatusChangedBy: actorId || null,
      lifecycleStatusNotificationPending: false,
      enrollmentStatus: 'Not Enrolled',
      section: null,
      isActive: true,
      lastUpdated: effectiveDate
    },
    $push: { lifecycleStatusHistory: event }
  };

  if (requestedSchoolYear) {
    update.$set.schoolYear = requestedSchoolYear;
  }
  if (requestedSemester) {
    update.$set.semester = requestedSemester;
  }

  if (targetStatus === 'Irregular') {
    update.$set.studentStatus = 'Irregular';
    update.$set.classification = 'Irregular';
  }

  const updated = await Student.findByIdAndUpdate(studentId, update, {
    new: true,
    runValidators: true
  });
  if (!updated) {
    const error = new Error('Student not found');
    error.statusCode = 404;
    throw error;
  }

  // Reconcile conflicting non-finalized enrollment records safely without
  // deleting or rewriting locked/completed historical enrollments.
  try {
    if (typeof Enrollment.updateMany === 'function') {
      await Enrollment.updateMany(
        {
          studentId: student._id,
          lockedAt: null,
          isCurrent: true,
          status: { $in: ['Pending', 'Enrolled'] }
        },
        { $set: { isCurrent: false } }
      );
    }
  } catch (error) {
    console.error('[student-lifecycle] Failed to reconcile non-finalized enrollments on readmission:', error);
  }

  // Invalidate any stale verification sessions from prior terms/dismissals.
  await invalidateActiveVerifications(student._id, REASON_AUTHORIZED_READMISSION);

  const previousFailedSubjects = (student.lifecycleStatusFailedSubjects || []).map((entry) => ({
    code: entry.code,
    grade: entry.grade,
    gradeMark: entry.gradeMark,
    schoolYear: entry.schoolYear,
    semester: entry.semester
  }));

  let auditLogged = false;
  try {
    auditLogged = await writeAuditLog({
      student: updated,
      actorId,
      accountType,
      action: 'APPROVE',
      description: `Authorized readmission for ${normalizeText(updated.studentNumber)}: lifecycle DROPPED → ${targetStatus.toUpperCase()}. ${normalizeText(remarks || reason || '')}`.trim(),
      oldValue: {
        lifecycleStatus: DROPPED,
        lifecycleStatusReason: student.lifecycleStatusReason || REASON_ACADEMIC_DEFICIENCY,
        failedSubjects: previousFailedSubjects
      },
      newValue: {
        lifecycleStatus: targetStatus,
        lifecycleStatusReason: REASON_AUTHORIZED_READMISSION,
        effectiveDate,
        remarks: normalizeText(remarks || reason)
      }
    });
  } catch (error) {
    console.error('[student-lifecycle] Failed to write readmission audit log:', error);
  }

  let notificationCreated = false;
  try {
    notificationCreated = await ensureLifecycleNotification(updated, event);
  } catch (error) {
    console.error('[student-lifecycle] Failed to create readmission notification:', error);
    await Student.updateOne(
      { _id: updated._id },
      { $set: { lifecycleStatusNotificationPending: true } }
    ).catch(() => {});
  }

  return {
    student: updated,
    event,
    auditLogged,
    notificationCreated
  };
}

/**
 * Reactivate a student who is on leave of absence (or archived as inactive).
 *
 * The record returns to an active lifecycle — isActive, the leave marker on the
 * denormalized enrollment status, and the lifecycle history are all updated
 * together so the student can be enrolled again. Unlike readmission, no
 * dismissal event exists to reverse, so the previous leave event stays in
 * history untouched.
 */
async function reactivateStudent({
  studentId,
  lifecycleStatus = 'Pending',
  reason,
  remarks = '',
  actorId = null,
  accountType = 'registrar',
  effectiveDate = new Date()
} = {}) {
  const targetStatus = normalizeText(lifecycleStatus) || 'Pending';
  if (!READMISSION_STATUSES.has(targetStatus)) {
    const error = new Error(`Reactivation target must be one of ${Array.from(READMISSION_STATUSES).join(', ')}.`);
    error.statusCode = 400;
    throw error;
  }

  const student = await Student.findById(studentId);
  if (!student) {
    const error = new Error('Student not found');
    error.statusCode = 404;
    throw error;
  }

  const currentStatus = normalizeText(student.lifecycleStatus);
  if (!REACTIVATION_SOURCE_STATUSES.has(currentStatus)) {
    const error = new Error('Only a student on leave of absence or marked inactive can be reactivated.');
    error.statusCode = 409;
    throw error;
  }

  const eventId = new mongoose.Types.ObjectId();
  const event = {
    eventId,
    status: targetStatus,
    reason: REASON_AUTHORIZED_REACTIVATION,
    effectiveDate,
    schoolYear: normalizeText(student.lifecycleStatusTerm?.schoolYear || student.schoolYear),
    semester: normalizeText(student.lifecycleStatusTerm?.semester || student.semester),
    failedSubjects: [],
    decision: DECISION_REACTIVATED,
    remarks: normalizeText(remarks || reason),
    source: 'authorized_reactivation',
    changedAt: effectiveDate,
    changedBy: actorId || null
  };

  const update = {
    $set: {
      lifecycleStatus: targetStatus,
      lifecycleStatusReason: REASON_AUTHORIZED_REACTIVATION,
      lifecycleStatusEffectiveDate: effectiveDate,
      lifecycleStatusTerm: { schoolYear: event.schoolYear, semester: event.semester },
      lifecycleStatusFailedSubjects: [],
      lifecycleStatusEventId: eventId,
      lifecycleStatusChangedAt: effectiveDate,
      lifecycleStatusChangedBy: actorId || null,
      lifecycleStatusNotificationPending: false,
      isActive: true,
      // "On Leave" is the denormalized marker set when the leave started; it
      // must not survive reactivation or the roster keeps reporting a leave.
      enrollmentStatus: 'Not Enrolled',
      lastUpdated: effectiveDate
    },
    $push: { lifecycleStatusHistory: event }
  };

  if (targetStatus === 'Irregular') {
    update.$set.studentStatus = 'Irregular';
    update.$set.classification = 'Irregular';
  }

  const updated = await Student.findByIdAndUpdate(studentId, update, {
    new: true,
    runValidators: true
  });
  if (!updated) {
    const error = new Error('Student not found');
    error.statusCode = 404;
    throw error;
  }

  await invalidateActiveVerifications(student._id, REASON_AUTHORIZED_REACTIVATION);

  let auditLogged = false;
  try {
    auditLogged = await writeAuditLog({
      student: updated,
      actorId,
      accountType,
      action: 'UPDATE',
      description: `Reactivated ${normalizeText(updated.studentNumber)}: lifecycle ${currentStatus.toUpperCase()} → ${targetStatus.toUpperCase()}. ${normalizeText(remarks || reason || '')}`.trim(),
      oldValue: {
        lifecycleStatus: currentStatus,
        isActive: student.isActive,
        enrollmentStatus: student.enrollmentStatus || null
      },
      newValue: {
        lifecycleStatus: targetStatus,
        lifecycleStatusReason: REASON_AUTHORIZED_REACTIVATION,
        effectiveDate,
        remarks: normalizeText(remarks || reason)
      },
      severity: 'HIGH'
    });
  } catch (error) {
    console.error('[student-lifecycle] Failed to write reactivation audit log:', error);
  }

  let notificationCreated = false;
  try {
    notificationCreated = await ensureLifecycleNotification(updated, event);
  } catch (error) {
    console.error('[student-lifecycle] Failed to create reactivation notification:', error);
    await Student.updateOne(
      { _id: updated._id },
      { $set: { lifecycleStatusNotificationPending: true } }
    ).catch(() => {});
  }

  return {
    student: updated,
    event,
    auditLogged,
    notificationCreated
  };
}

module.exports = {
  FAILURE_THRESHOLD,
  DISMISSAL_POLICY_KEY,
  DEFAULT_DISMISSAL_POLICY,
  REASON_ACADEMIC_DEFICIENCY,
  REASON_ACADEMIC_RESTORATION,
  REASON_AUTHORIZED_READMISSION,
  REASON_AUTHORIZED_REACTIVATION,
  DECISION_REACTIVATED,
  DECISION_AUTOMATIC_DISMISSAL,
  DECISION_AUTOMATIC_RESTORATION,
  STANDING_GOOD,
  STANDING_PROBATION,
  STANDING_DISMISSED,
  DROPPED,
  ACTIVE_LIFECYCLES,
  collectUnresolvedFailures,
  deriveAcademicStanding,
  isFinalizedSubjectEntry,
  isFailingSubjectEntry,
  isPassingSubjectEntry,
  loadDismissalPolicy,
  evaluateStudentAcademicStanding,
  previewStudentAcademicStanding,
  readmitStudent,
  reactivateStudent,
  archiveActiveRoster,
  restoreActiveRoster,
  ensureLifecycleNotification
};
