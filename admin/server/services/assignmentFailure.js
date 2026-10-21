'use strict';

/**
 * Turns an error thrown while assigning a student to a block into a response
 * the registrar can act on.
 *
 * Why this exists: every unexpected failure used to collapse into
 * `500 { error: 'Failed to assign student' }`, so the UI showed
 * "2026-101-82347: Failed to assign student" with nothing to fix. Each branch
 * below carries at least one readable reason, and known causes (duplicate
 * term record, invalid field, busy database) get a status the client can
 * distinguish from a genuine server fault.
 */

function asText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function describeAssignmentFailure(error) {
  if (!error) {
    return {
      status: 500,
      error: 'Failed to assign student',
      reasons: ['The server did not report a reason. Check the server log for details.'],
    };
  }

  const message = asText(error.message);

  // Deliberate rejections raised by a service or guard (enrollment
  // finalization period/context mismatches, locked enrollments, ...).
  if (error.statusCode === 400 || error.statusCode === 409) {
    const details = Array.isArray(error.details)
      ? error.details.map(asText).filter(Boolean)
      : [];
    const reason = message || 'Assignment failed enrollment validation';
    return {
      status: error.statusCode,
      error: reason,
      reasons: details.length ? details : [reason],
    };
  }

  // Unique index (studentId, semester, year, schoolYear). The assignment
  // lookup only sees ASSIGNED rows, so a WAITLISTED or legacy row for the
  // same term surfaces here as E11000.
  if (error.code === 11000) {
    const key = error.keyValue && typeof error.keyValue === 'object' ? error.keyValue : {};
    const term = [key.semester, key.year].map(asText).filter(Boolean).join(' ');
    return {
      status: 409,
      error: 'This student already has a block record for that term',
      reasons: [
        term
          ? `A block assignment already exists for ${term}. Remove or move the existing record before assigning this one.`
          : 'A block assignment already exists for this student and term. Remove or move the existing record before assigning this one.',
      ],
    };
  }

  // Mongoose refused the document (missing semester/year, bad school year
  // format, ...). Report the offending fields instead of the generic text.
  if (error.name === 'ValidationError' && error.errors && typeof error.errors === 'object') {
    const details = Object.entries(error.errors).map(([field, detail]) => {
      const fieldMessage = asText(detail && detail.message) || 'is invalid';
      return `${field}: ${fieldMessage}`;
    });
    return {
      status: 400,
      error: 'The assignment record is incomplete or invalid',
      reasons: details.length
        ? details
        : [message || 'The assignment record is incomplete or invalid.'],
    };
  }

  if (error.name === 'CastError') {
    return {
      status: 400,
      error: 'Invalid student or section reference',
      reasons: [
        message ||
          `${asText(String(error.value)) || 'The value'} is not a valid ${error.path || 'identifier'}. Refresh the list and try again.`,
      ],
    };
  }

  // Multi-document transaction conflicts are retryable, not a server fault.
  const labels = Array.isArray(error.errorLabels) ? error.errorLabels : [];
  if (
    labels.includes('TransientTransactionError') ||
    error.code === 112 ||
    error.codeName === 'WriteConflict'
  ) {
    return {
      status: 409,
      error: 'The assignment could not be saved because another change was in progress',
      reasons: ['The database was busy. Nothing was saved — please try again.'],
    };
  }

  // Unknown cause. Keep the stable headline but pass the underlying message
  // through: this is an internal admin tool, and a dead-end error is worse
  // than an ugly one.
  return {
    status: 500,
    error: 'Failed to assign student',
    reasons: [message || 'The server hit an unexpected error while saving the assignment.'],
  };
}

module.exports = { describeAssignmentFailure };
