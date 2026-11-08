/**
 * Lifecycle restrictions shared by every enrollment / block-assignment guard.
 *
 * A student in one of these lifecycle states must never reserve a block slot,
 * receive a block assignment, consume a re-enrollment verification, or be
 * finalized as Enrolled/Irregular. Each state has its own authorized exit:
 *   - Dropped           -> authorized readmission (studentLifecycleService.readmitStudent)
 *   - Leave of Absence  -> authorized reactivation (studentLifecycleService.reactivateStudent)
 *   - Inactive          -> authorized reactivation
 *   - Graduated         -> terminal; never re-enrolled through this workflow
 *
 * Keeping the list in one module guarantees that eligibility, assignment,
 * finalization, verification and the candidates list cannot drift apart.
 */

const RESTRICTIONS = {
  Dropped: {
    code: 'STUDENT_DROPPED',
    message: 'Dropped students require authorized readmission before block assignment.',
  },
  'Leave of Absence': {
    code: 'STUDENT_ON_LEAVE',
    message: 'Students on Leave of Absence require authorized reactivation before block assignment.',
  },
  Inactive: {
    code: 'STUDENT_INACTIVE',
    message: 'Inactive students require authorized reactivation before block assignment.',
  },
  Graduated: {
    code: 'STUDENT_GRADUATED',
    message: 'Graduated students cannot be enrolled or assigned to a block.',
  },
};

const RESTRICTED_ENROLLMENT_LIFECYCLES = Object.freeze(Object.keys(RESTRICTIONS));
const SUPERSEDABLE_ENROLLMENT_STATUSES = new Set(['Pending', 'Enrolled']);

/**
 * @param {string} lifecycleStatus
 * @returns {{ status: string, code: string, message: string } | null}
 */
function getLifecycleRestriction(lifecycleStatus) {
  const status = String(lifecycleStatus ?? '').trim();
  const restriction = RESTRICTIONS[status];
  return restriction ? { status, ...restriction } : null;
}

/**
 * Timestamp of the student's most recent DROPPED or READMITTED lifecycle event,
 * or null when the student has never been dismissed/readmitted.
 */
function latestDismissalAt(student) {
  const history = Array.isArray(student?.lifecycleStatusHistory) ? student.lifecycleStatusHistory : [];
  let latest = null;
  for (const event of history) {
    const isDismissalOrReadmission =
      String(event?.status || '').trim() === 'Dropped' ||
      String(event?.decision || '').trim() === 'READMITTED' ||
      String(event?.reason || '').trim() === 'AUTHORIZED_READMISSION';
    if (!isDismissalOrReadmission) continue;
    const at = new Date(event.changedAt || event.effectiveDate || 0).getTime();
    if (Number.isFinite(at) && at > 0 && (latest === null || at > latest)) {
      latest = at;
    }
  }
  if (
    latest === null &&
    String(student?.lifecycleStatusReason || '').trim() === 'AUTHORIZED_READMISSION'
  ) {
    const fallbackAt = new Date(
      student.lifecycleStatusChangedAt || student.lifecycleStatusEffectiveDate || 0
    ).getTime();
    if (Number.isFinite(fallbackAt) && fallbackAt > 0) {
      latest = fallbackAt;
    }
  }
  return latest;
}

/**
 * True when an enrollment was opened before (or invalidated by) the student's
 * latest academic dismissal/readmission. Such a record must not count as
 * "already enrolled" nor as evidence that the student completed re-enrollment
 * after readmission.
 * Locked records and final statuses (Completed, Retained, Graduated, ...) are
 * history and are never considered superseded.
 */
function isSupersededByDismissal(enrollment, student) {
  if (!enrollment || enrollment.lockedAt) return false;
  if (!SUPERSEDABLE_ENROLLMENT_STATUSES.has(String(enrollment.status || '').trim())) return false;

  const cutoffAt = latestDismissalAt(student);
  const wasReadmitted =
    cutoffAt !== null ||
    String(student?.lifecycleStatusReason || '').trim() === 'AUTHORIZED_READMISSION' ||
    (Array.isArray(student?.lifecycleStatusHistory) &&
      student.lifecycleStatusHistory.some(
        (event) =>
          String(event?.status || '').trim() === 'Dropped' ||
          String(event?.decision || '').trim() === 'READMITTED'
      ));

  if (!wasReadmitted) return false;

  // If the enrollment was explicitly retired (isCurrent === false) while the
  // student is awaiting re-enrollment after readmission, it is superseded.
  if (enrollment.isCurrent === false && String(student?.lifecycleStatus || '').trim() !== 'Enrolled') {
    return true;
  }

  const createdAt = new Date(enrollment.createdAt || 0).getTime();
  if (cutoffAt !== null && Number.isFinite(createdAt) && createdAt > 0) {
    return createdAt <= cutoffAt;
  }

  // Fallback for unit-test/lean objects without createdAt: if the student was
  // readmitted and their lifecycleStatus is Pending / Not Enrolled (not yet
  // finalized as Enrolled), a pre-existing Enrolled/Pending record without a
  // post-readmission timestamp is superseded.
  if (
    (!Number.isFinite(createdAt) || createdAt <= 0) &&
    ['Pending', 'Not Enrolled', 'Irregular'].includes(String(student?.lifecycleStatus || '').trim())
  ) {
    return true;
  }

  return false;
}

module.exports = {
  RESTRICTED_ENROLLMENT_LIFECYCLES,
  getLifecycleRestriction,
  latestDismissalAt,
  isSupersededByDismissal,
};
