// Jest supplies the global `test`/`expect`; node:assert is used directly so
// the assertions stay identical to the service's own contract.
const assert = require('node:assert/strict');
const { describeAssignmentFailure } = require('./services/assignmentFailure');
const { normalizeSchoolYear } = require('./services/blockTerm');

// Regression tests for "2026-101-82347: Failed to assign student" — every
// failure used to collapse into a 500 with no explanation, so the registrar
// had nothing to act on.

test('duplicate term record returns 409 with an actionable reason', () => {
  const error = Object.assign(new Error('E11000 duplicate key error collection: wcc.studentblockassignments'), {
    code: 11000,
    keyValue: { studentId: '2026-101-82347', semester: '1st', year: '2026-2027', schoolYear: '2026-2027' },
  });

  const failure = describeAssignmentFailure(error);

  assert.equal(failure.status, 409);
  assert.match(failure.error, /already has a block record/i);
  assert.equal(failure.reasons.length, 1);
  assert.match(failure.reasons[0], /1st 2026-2027/);
  assert.match(failure.reasons[0], /Remove or move the existing record/i);
});

test('duplicate key without keyValue still explains the cause', () => {
  const failure = describeAssignmentFailure(Object.assign(new Error('E11000'), { code: 11000 }));

  assert.equal(failure.status, 409);
  assert.match(failure.reasons[0], /already exists for this student and term/i);
});

test('mongoose validation errors name the offending fields', () => {
  const error = Object.assign(new Error('StudentBlockAssignment validation failed'), {
    name: 'ValidationError',
    errors: {
      year: { message: 'Path `year` is required.' },
      semester: { message: '`1st Sem` is not a valid enum value for path `semester`.' },
    },
  });

  const failure = describeAssignmentFailure(error);

  assert.equal(failure.status, 400);
  assert.match(failure.error, /incomplete or invalid/i);
  assert.deepEqual(failure.reasons, [
    'year: Path `year` is required.',
    'semester: `1st Sem` is not a valid enum value for path `semester`.',
  ]);
});

test('guard rejections keep their status, headline and details', () => {
  const error = Object.assign(new Error('Enrollment period mismatch'), {
    statusCode: 409,
    details: ['The enrollment belongs to 2025-2026, the block belongs to 2026-2027.'],
  });

  const failure = describeAssignmentFailure(error);

  assert.equal(failure.status, 409);
  assert.equal(failure.error, 'Enrollment period mismatch');
  assert.deepEqual(failure.reasons, ['The enrollment belongs to 2025-2026, the block belongs to 2026-2027.']);
});

test('guard rejection without details falls back to its message', () => {
  const failure = describeAssignmentFailure(
    Object.assign(new Error('Enrollment is locked'), { statusCode: 400 })
  );

  assert.equal(failure.status, 400);
  assert.deepEqual(failure.reasons, ['Enrollment is locked']);
});

test('transaction write conflicts are reported as retryable, not as a server fault', () => {
  const failure = describeAssignmentFailure(
    Object.assign(new Error('WriteConflict'), { errorLabels: ['TransientTransactionError'] })
  );

  assert.equal(failure.status, 409);
  assert.match(failure.error, /another change was in progress/i);
  assert.match(failure.reasons[0], /try again/i);
});

test('unknown errors pass the underlying message through instead of swallowing it', () => {
  const failure = describeAssignmentFailure(new TypeError("Cannot read properties of null (reading 'schoolYear')"));

  assert.equal(failure.status, 500);
  assert.equal(failure.error, 'Failed to assign student');
  assert.deepEqual(failure.reasons, ["Cannot read properties of null (reading 'schoolYear')"]);
});

test('a missing error still yields a reason', () => {
  const failure = describeAssignmentFailure(undefined);

  assert.equal(failure.status, 500);
  assert.equal(failure.reasons.length, 1);
  assert.match(failure.reasons[0], /did not report a reason/i);
});

// The actual cause behind the reported "2026-101-82347: Failed to assign
// student": groups created before the schema change store `year` as 2026,
// while block assignments require "2026-2027".
test('legacy numeric block years are normalised to a school year', () => {
  assert.equal(normalizeSchoolYear(2026), '2026-2027');
  assert.equal(normalizeSchoolYear('2026'), '2026-2027');
  assert.equal(normalizeSchoolYear(' 2026-2027 '), '2026-2027');
});

test('unusable year values fall back to an empty string instead of throwing', () => {
  assert.equal(normalizeSchoolYear(undefined), '');
  assert.equal(normalizeSchoolYear(null), '');
  assert.equal(normalizeSchoolYear(''), '');
  assert.equal(normalizeSchoolYear('not-a-year'), '');
});
