/**
 * Student lifecycle policy tests.
 *
 * The tests exercise the pure unresolved-failure policy and the database
 * side-effects of dismissal, automatic restoration, and readmission with mocked
 * models. They cover the academic-deficiency scenarios without touching real
 * student data.
 */

let objectIdSequence = 0;

class MockObjectId {
  constructor(value) {
    this.value = value || `00000000000000000000${++objectIdSequence}`.slice(-24);
  }

  toString() {
    return this.value;
  }

  valueOf() {
    return this.value;
  }

  static isValid() {
    return true;
  }
}

jest.mock('mongoose', () => ({
  Types: { ObjectId: MockObjectId }
}));

jest.mock('./models/Student', () => ({
  findById: jest.fn(),
  findOneAndUpdate: jest.fn(),
  findByIdAndUpdate: jest.fn(),
  updateOne: jest.fn(async () => ({ modifiedCount: 1 }))
}));
jest.mock('./models/Enrollment', () => ({ find: jest.fn() }));
jest.mock('./models/AuditLog', () => ({ create: jest.fn(async () => ({})) }));
jest.mock('./models/StudentNotification', () => ({
  updateOne: jest.fn(async () => ({ upsertedCount: 1 }))
}));
jest.mock('./models/StudentBlockAssignment', () => ({
  find: jest.fn(),
  updateMany: jest.fn(async () => ({ modifiedCount: 1 })),
  aggregate: jest.fn(async () => [])
}));
jest.mock('./models/SectionWaitlist', () => ({
  find: jest.fn(),
  updateMany: jest.fn(async () => ({ modifiedCount: 1 }))
}));
jest.mock('./models/BlockSection', () => ({
  findByIdAndUpdate: jest.fn(async () => ({}))
}));
jest.mock('./models/SystemSetting', () => ({ findOne: jest.fn() }));
jest.mock('./services/gradingScaleService', () => ({
  loadGradeScale: jest.fn(async () => ({ passingGrade: 3 }))
}));

const Student = require('./models/Student');
const Enrollment = require('./models/Enrollment');
const AuditLog = require('./models/AuditLog');
const StudentNotification = require('./models/StudentNotification');
const StudentBlockAssignment = require('./models/StudentBlockAssignment');
const SectionWaitlist = require('./models/SectionWaitlist');
const BlockSection = require('./models/BlockSection');
const SystemSetting = require('./models/SystemSetting');
const {
  collectUnresolvedFailures,
  deriveAcademicStanding,
  evaluateStudentAcademicStanding,
  readmitStudent,
  reactivateStudent,
  REASON_ACADEMIC_DEFICIENCY,
  REASON_ACADEMIC_RESTORATION,
  REASON_AUTHORIZED_READMISSION,
  REASON_AUTHORIZED_REACTIVATION
} = require('./services/studentLifecycleService');

const chain = (value) => ({
  select: jest.fn().mockReturnThis(),
  lean: jest.fn(async () => value)
});

function failingEntry(overrides = {}) {
  return {
    _id: new MockObjectId(),
    subjectId: new MockObjectId(),
    code: 'MATH101',
    title: 'Mathematics',
    units: 3,
    grade: 5,
    gradeMark: null,
    status: 'Completed',
    submissionStatus: 'Published',
    ...overrides
  };
}

function passingEntry(overrides = {}) {
  return failingEntry({ grade: 1.75, ...overrides });
}

function enrollment(overrides = {}) {
  return {
    _id: new MockObjectId(),
    schoolYear: '2025-2026',
    semester: '1st',
    status: 'Enrolled',
    gradeSubmission: { status: 'Published' },
    subjects: [],
    ...overrides
  };
}

function student(overrides = {}) {
  return {
    _id: new MockObjectId(),
    studentNumber: '2025-0001',
    firstName: 'Ada',
    lastName: 'Lovelace',
    schoolYear: '2025-2026',
    semester: '2nd',
    lifecycleStatus: 'Enrolled',
    lifecycleStatusHistory: [],
    academicStanding: 'GOOD_STANDING',
    isActive: true,
    ...overrides
  };
}

/** The writes that change a student's lifecycle status. */
function lifecycleWrites() {
  return Student.findOneAndUpdate.mock.calls.filter(
    (call) => call[1]?.$set && Object.prototype.hasOwnProperty.call(call[1].$set, 'lifecycleStatus')
  );
}

function setDismissalPolicy(value) {
  SystemSetting.findOne.mockReturnValue(chain({ key: 'academicDismissalPolicy', value }));
}

beforeEach(() => {
  jest.clearAllMocks();
  Student.findById.mockResolvedValue(null);
  Student.findOneAndUpdate.mockResolvedValue(null);
  Student.findByIdAndUpdate.mockResolvedValue(null);
  Student.updateOne.mockResolvedValue({ modifiedCount: 1 });
  Enrollment.find.mockReturnValue(chain([]));
  StudentBlockAssignment.find.mockReturnValue(chain([]));
  StudentBlockAssignment.updateMany.mockResolvedValue({ modifiedCount: 1 });
  StudentBlockAssignment.aggregate.mockResolvedValue([]);
  SectionWaitlist.find.mockReturnValue(chain([]));
  SectionWaitlist.updateMany.mockResolvedValue({ modifiedCount: 1 });
  StudentNotification.updateOne.mockResolvedValue({ upsertedCount: 1 });
  AuditLog.create.mockResolvedValue({});
  BlockSection.findByIdAndUpdate.mockResolvedValue({});
  SystemSetting.findOne.mockReturnValue(chain(null));
});

describe('collectUnresolvedFailures – counting policy', () => {
  test('excludes draft or otherwise unpublished grade records', () => {
    const result = collectUnresolvedFailures([
      enrollment({
        subjects: [
          failingEntry({ submissionStatus: 'Draft' }),
          failingEntry({ _id: new MockObjectId(), subjectId: new MockObjectId(), code: 'ENG101' })
        ]
      })
    ]);

    expect(result).toHaveLength(1);
    expect(result[0].code).toBe('ENG101');
  });

  test('excludes submitted and verified records that are not finalized yet', () => {
    const result = collectUnresolvedFailures([
      enrollment({
        gradeSubmission: { status: 'Draft' },
        subjects: [
          failingEntry({ submissionStatus: 'Submitted' }),
          failingEntry({ submissionStatus: 'Verified' }),
          failingEntry({ _id: new MockObjectId(), subjectId: new MockObjectId(), code: 'KEEP' })
        ]
      })
    ]);

    expect(result.map((item) => item.code)).toEqual(['KEEP']);
  });

  test('counts duplicate grade records for the same subject and term once', () => {
    const duplicateSubjectId = new MockObjectId();
    const result = collectUnresolvedFailures([
      enrollment({
        subjects: [
          failingEntry({ subjectId: duplicateSubjectId, code: 'MATH101' }),
          failingEntry({ _id: new MockObjectId(), subjectId: duplicateSubjectId, code: 'MATH101' })
        ]
      })
    ]);

    expect(result).toHaveLength(1);
    expect(result[0].failingAttempts).toBe(2);
  });

  test('excludes dropped and removed subject entries', () => {
    const result = collectUnresolvedFailures([
      enrollment({
        subjects: [
          failingEntry({ code: 'DROPPED1', status: 'Dropped' }),
          failingEntry({ code: 'REMOVED1', status: 'Removed' }),
          failingEntry({ code: 'DRP1', gradeMark: 'DRP', grade: null }),
          failingEntry({ code: 'KEEP1' })
        ]
      })
    ]);

    expect(result.map((item) => item.code)).toEqual(['KEEP1']);
  });

  test('excludes a dropped or cancelled term entirely', () => {
    const result = collectUnresolvedFailures([
      enrollment({ status: 'Dropped', subjects: [failingEntry({ code: 'DROPPED-TERM' })] }),
      enrollment({ _id: new MockObjectId(), status: 'Cancelled', subjects: [failingEntry({ code: 'CANCELLED-TERM' })] }),
      enrollment({ _id: new MockObjectId(), status: 'Enrolled', subjects: [failingEntry({ code: 'KEEP' })] })
    ]);

    expect(result.map((item) => item.code)).toEqual(['KEEP']);
  });

  test('counts FA as a failing grade even when the numeric grade is null', () => {
    const result = collectUnresolvedFailures([
      enrollment({ subjects: [failingEntry({ code: 'FA101', grade: null, gradeMark: 'FA' })] })
    ]);

    expect(result).toHaveLength(1);
    expect(result[0].grade).toBe(5);
    expect(result[0].gradeMark).toBe('FA');
  });

  test('does not count passing grades or terminal non-failing marks', () => {
    const result = collectUnresolvedFailures([
      enrollment({
        subjects: [
          failingEntry({ code: 'PASS', grade: 2.5 }),
          failingEntry({ code: 'INC', grade: null, gradeMark: 'INC' }),
          failingEntry({ code: 'W', grade: null, gradeMark: 'W' }),
          failingEntry({ code: 'NG', grade: null, gradeMark: 'NG' })
        ]
      })
    ]);

    expect(result).toHaveLength(0);
  });

  test('counts the same subject failed in two different terms once', () => {
    const subjectId = new MockObjectId();
    const result = collectUnresolvedFailures([
      enrollment({ subjects: [failingEntry({ subjectId, code: 'MATH101' })] }),
      enrollment({
        _id: new MockObjectId(),
        semester: '2nd',
        subjects: [failingEntry({ _id: new MockObjectId(), subjectId, code: 'MATH101' })]
      })
    ]);

    expect(result).toHaveLength(1);
    expect(result[0].failingAttempts).toBe(2);
    // The surviving snapshot points at the latest finalized attempt.
    expect(result[0].semester).toBe('2nd');
  });

  test('does not count a subject that was failed and later passed', () => {
    const subjectId = new MockObjectId();
    const result = collectUnresolvedFailures([
      enrollment({ subjects: [failingEntry({ subjectId, code: 'PROG1' })] }),
      enrollment({
        _id: new MockObjectId(),
        semester: '2nd',
        subjects: [passingEntry({ _id: new MockObjectId(), subjectId, code: 'PROG1' })]
      })
    ]);

    expect(result).toHaveLength(0);
  });

  test('three historical failures with one passed retake count as two unresolved failures', () => {
    const retaken = new MockObjectId();
    const math = new MockObjectId();
    const english = new MockObjectId();
    const result = collectUnresolvedFailures([
      enrollment({
        subjects: [
          failingEntry({ subjectId: retaken, code: 'PROG1' }),
          failingEntry({ subjectId: math, code: 'MATH101' }),
          failingEntry({ subjectId: english, code: 'ENG101' })
        ]
      }),
      enrollment({
        _id: new MockObjectId(),
        semester: '2nd',
        subjects: [passingEntry({ _id: new MockObjectId(), subjectId: retaken, code: 'PROG1' })]
      })
    ]);

    expect(result.map((item) => item.code).sort()).toEqual(['ENG101', 'MATH101']);
  });

  test('three historical failures with two passed retakes count as one unresolved failure', () => {
    const first = new MockObjectId();
    const second = new MockObjectId();
    const third = new MockObjectId();
    const result = collectUnresolvedFailures([
      enrollment({
        subjects: [
          failingEntry({ subjectId: first, code: 'PROG1' }),
          failingEntry({ subjectId: second, code: 'MATH101' }),
          failingEntry({ subjectId: third, code: 'ENG101' })
        ]
      }),
      enrollment({
        _id: new MockObjectId(),
        semester: '2nd',
        subjects: [
          passingEntry({ _id: new MockObjectId(), subjectId: first, code: 'PROG1' }),
          passingEntry({ _id: new MockObjectId(), subjectId: second, code: 'MATH101' })
        ]
      })
    ]);

    expect(result.map((item) => item.code)).toEqual(['ENG101']);
  });

  test('three historical failures with all retakes passed leave zero unresolved failures', () => {
    const first = new MockObjectId();
    const second = new MockObjectId();
    const third = new MockObjectId();
    const result = collectUnresolvedFailures([
      enrollment({
        subjects: [
          failingEntry({ subjectId: first, code: 'PROG1' }),
          failingEntry({ subjectId: second, code: 'MATH101' }),
          failingEntry({ subjectId: third, code: 'ENG101' })
        ]
      }),
      enrollment({
        _id: new MockObjectId(),
        semester: '2nd',
        subjects: [
          passingEntry({ _id: new MockObjectId(), subjectId: first, code: 'PROG1' }),
          passingEntry({ _id: new MockObjectId(), subjectId: second, code: 'MATH101' }),
          passingEntry({ _id: new MockObjectId(), subjectId: third, code: 'ENG101' })
        ]
      })
    ]);

    expect(result).toHaveLength(0);
  });

  test('a failed retake keeps the subject unresolved and is still one failure', () => {
    const subjectId = new MockObjectId();
    const result = collectUnresolvedFailures([
      enrollment({ subjects: [failingEntry({ subjectId, code: 'PROG1' })] }),
      enrollment({
        _id: new MockObjectId(),
        semester: '2nd',
        subjects: [failingEntry({ _id: new MockObjectId(), subjectId, code: 'PROG1' })]
      })
    ]);

    expect(result).toHaveLength(1);
  });

  test('a retake still in progress leaves the original unresolved failure in place', () => {
    const subjectId = new MockObjectId();
    const result = collectUnresolvedFailures([
      enrollment({ subjects: [failingEntry({ subjectId, code: 'PROG1' })] }),
      enrollment({
        _id: new MockObjectId(),
        schoolYear: '2026-2027',
        semester: '1st',
        subjects: [{
          _id: new MockObjectId(),
          subjectId,
          code: 'PROG1',
          title: 'Programming 1',
          units: 3,
          grade: null,
          gradeMark: null,
          status: 'Enrolled',
          submissionStatus: 'Draft'
        }]
      })
    ]);

    expect(result).toHaveLength(1);
    expect(result[0].retakeInProgress).toBe(true);
  });

  test('a dropped retake leaves the original unresolved failure in place', () => {
    const subjectId = new MockObjectId();
    const result = collectUnresolvedFailures([
      enrollment({ subjects: [failingEntry({ subjectId, code: 'PROG1' })] }),
      enrollment({
        _id: new MockObjectId(),
        semester: '2nd',
        subjects: [failingEntry({
          _id: new MockObjectId(),
          subjectId,
          code: 'PROG1',
          status: 'Dropped',
          grade: null
        })]
      })
    ]);

    expect(result).toHaveLength(1);
  });
});

describe('deriveAcademicStanding', () => {
  test('maps the unresolved count onto academic standing separately from the lifecycle', () => {
    expect(deriveAcademicStanding(0, 3)).toBe('GOOD_STANDING');
    expect(deriveAcademicStanding(1, 3)).toBe('ACADEMIC_PROBATION');
    expect(deriveAcademicStanding(2, 3)).toBe('ACADEMIC_PROBATION');
    expect(deriveAcademicStanding(3, 3)).toBe('DISMISSED');
    expect(deriveAcademicStanding(4, 3)).toBe('DISMISSED');
  });
});

describe('evaluateStudentAcademicStanding – threshold', () => {
  test('zero unresolved failed subjects keep the student active with GOOD_STANDING', async () => {
    const current = student();
    Student.findById.mockResolvedValue(current);
    Enrollment.find.mockReturnValue(chain([
      enrollment({
        subjects: [
          passingEntry({ code: 'MATH101', grade: 1.5 }),
          passingEntry({ code: 'ENG101', grade: 2.0 }),
          failingEntry({ code: 'MATH102', status: 'Dropped' }),
          failingEntry({ code: 'ENG102', gradeMark: 'W', grade: null }),
          failingEntry({ code: 'HIST1', gradeMark: 'INC', grade: null })
        ]
      })
    ]));

    const result = await evaluateStudentAcademicStanding({ studentId: current._id, actorId: new MockObjectId() });

    expect(result.changed).toBe(false);
    expect(result.unresolvedFailureCount).toBe(0);
    expect(result.academicStanding).toBe('GOOD_STANDING');
    expect(lifecycleWrites()).toHaveLength(0);
  });

  test('one unresolved failed subject keeps the student active', async () => {
    const current = student();
    Student.findById.mockResolvedValue(current);
    Enrollment.find.mockReturnValue(chain([
      enrollment({ subjects: [failingEntry({ code: 'ONE' })] })
    ]));

    const result = await evaluateStudentAcademicStanding({ studentId: current._id, actorId: new MockObjectId() });

    expect(result.changed).toBe(false);
    expect(result.unresolvedFailureCount).toBe(1);
    expect(result.academicStanding).toBe('ACADEMIC_PROBATION');
    expect(lifecycleWrites()).toHaveLength(0);
  });

  test('two unresolved failed subjects keep the student active', async () => {
    const current = student();
    Student.findById.mockResolvedValue(current);
    Enrollment.find.mockReturnValue(chain([
      enrollment({ subjects: [failingEntry({ code: 'ONE' }), failingEntry({ code: 'TWO' })] })
    ]));

    const result = await evaluateStudentAcademicStanding({ studentId: current._id, actorId: new MockObjectId() });

    expect(result.changed).toBe(false);
    expect(result.unresolvedFailureCount).toBe(2);
    expect(lifecycleWrites()).toHaveLength(0);
  });

  test('three unresolved failed subjects trigger the dismissal workflow', async () => {
    const current = student();
    const assignment = { _id: new MockObjectId(), sectionId: new MockObjectId(), status: 'ASSIGNED' };
    Student.findById.mockResolvedValue(current);
    Student.findOneAndUpdate.mockResolvedValue({ ...current, lifecycleStatus: 'Dropped' });
    Enrollment.find.mockReturnValue(chain([
      enrollment({
        subjects: [
          failingEntry({ code: 'MATH101' }),
          failingEntry({ code: 'ENG101' }),
          failingEntry({ code: 'FIL101' })
        ]
      })
    ]));
    StudentBlockAssignment.find.mockReturnValue(chain([assignment]));

    const result = await evaluateStudentAcademicStanding({ studentId: current._id, actorId: new MockObjectId() });

    expect(result.changed).toBe(true);
    expect(result.unresolvedFailureCount).toBe(3);
    expect(result.academicStanding).toBe('DISMISSED');
    expect(result.rosterArchived).toBe(true);
    expect(result.auditLogged).toBe(true);
    expect(result.notificationCreated).toBe(true);

    const writes = lifecycleWrites();
    expect(writes).toHaveLength(1);
    const update = writes[0][1];
    expect(update.$set.lifecycleStatus).toBe('Dropped');
    expect(update.$set.lifecycleStatusReason).toBe(REASON_ACADEMIC_DEFICIENCY);
    expect(update.$set.academicStanding).toBe('DISMISSED');
    expect(update.$push.lifecycleStatusHistory.status).toBe('Dropped');
    expect(update.$push.lifecycleStatusHistory.decision).toBe('AUTOMATIC_DISMISSAL');
    expect(update.$push.lifecycleStatusHistory.failedSubjects).toHaveLength(3);

    expect(StudentBlockAssignment.updateMany).toHaveBeenCalledWith(
      { _id: { $in: [assignment._id] } },
      expect.objectContaining({
        $set: expect.objectContaining({
          status: 'ARCHIVED',
          archivePreviousStatus: 'ASSIGNED',
          archiveReason: REASON_ACADEMIC_DEFICIENCY
        })
      })
    );
    expect(StudentNotification.updateOne).toHaveBeenCalledWith(
      expect.objectContaining({ eventKey: expect.stringContaining('student-lifecycle:') }),
      expect.objectContaining({ $setOnInsert: expect.objectContaining({ isRead: false }) }),
      { upsert: true }
    );
  });

  test('four unresolved failed subjects exceed the threshold', async () => {
    const current = student();
    Student.findById.mockResolvedValue(current);
    Student.findOneAndUpdate.mockResolvedValue({ ...current, lifecycleStatus: 'Dropped' });
    Enrollment.find.mockReturnValue(chain([
      enrollment({
        subjects: [
          failingEntry({ code: 'A' }),
          failingEntry({ code: 'B' }),
          failingEntry({ code: 'C' }),
          failingEntry({ code: 'D' })
        ]
      })
    ]));

    const result = await evaluateStudentAcademicStanding({ studentId: current._id, actorId: new MockObjectId() });

    expect(result.changed).toBe(true);
    expect(result.unresolvedFailureCount).toBe(4);
    expect(lifecycleWrites()).toHaveLength(1);
  });

  test('three historical failures with one passed retake do not dismiss', async () => {
    const retaken = new MockObjectId();
    const current = student();
    Student.findById.mockResolvedValue(current);
    Enrollment.find.mockReturnValue(chain([
      enrollment({
        subjects: [
          failingEntry({ subjectId: retaken, code: 'PROG1' }),
          failingEntry({ code: 'MATH101' }),
          failingEntry({ code: 'ENG101' })
        ]
      }),
      enrollment({
        _id: new MockObjectId(),
        semester: '2nd',
        subjects: [passingEntry({ _id: new MockObjectId(), subjectId: retaken, code: 'PROG1' })]
      })
    ]));

    const result = await evaluateStudentAcademicStanding({ studentId: current._id, actorId: new MockObjectId() });

    expect(result.changed).toBe(false);
    expect(result.unresolvedFailureCount).toBe(2);
    expect(lifecycleWrites()).toHaveLength(0);
  });

  test('three historical failures with two passed retakes leave one unresolved failure', async () => {
    const first = new MockObjectId();
    const second = new MockObjectId();
    const current = student();
    Student.findById.mockResolvedValue(current);
    Enrollment.find.mockReturnValue(chain([
      enrollment({
        subjects: [
          failingEntry({ subjectId: first, code: 'PROG1' }),
          failingEntry({ subjectId: second, code: 'MATH101' }),
          failingEntry({ code: 'ENG101' })
        ]
      }),
      enrollment({
        _id: new MockObjectId(),
        semester: '2nd',
        subjects: [
          passingEntry({ _id: new MockObjectId(), subjectId: first, code: 'PROG1' }),
          passingEntry({ _id: new MockObjectId(), subjectId: second, code: 'MATH101' })
        ]
      })
    ]));

    const result = await evaluateStudentAcademicStanding({ studentId: current._id, actorId: new MockObjectId() });

    expect(result.changed).toBe(false);
    expect(result.unresolvedFailureCount).toBe(1);
    expect(lifecycleWrites()).toHaveLength(0);
  });

  test('a draft 5.00 grade never triggers dismissal', async () => {
    const current = student();
    Student.findById.mockResolvedValue(current);
    Enrollment.find.mockReturnValue(chain([
      enrollment({
        gradeSubmission: { status: 'Draft' },
        subjects: [
          failingEntry({ code: 'A', submissionStatus: 'Draft' }),
          failingEntry({ code: 'B', submissionStatus: 'Draft' }),
          failingEntry({ code: 'C', submissionStatus: 'Draft' })
        ]
      })
    ]));

    const result = await evaluateStudentAcademicStanding({ studentId: current._id, actorId: new MockObjectId() });

    expect(result.changed).toBe(false);
    expect(result.unresolvedFailureCount).toBe(0);
    expect(lifecycleWrites()).toHaveLength(0);
  });

  test('a dropped subject does not count as a failure', async () => {
    const current = student();
    Student.findById.mockResolvedValue(current);
    Enrollment.find.mockReturnValue(chain([
      enrollment({
        subjects: [
          failingEntry({ code: 'DROPPED', status: 'Dropped' }),
          failingEntry({ code: 'ONE' }),
          failingEntry({ code: 'TWO' })
        ]
      })
    ]));

    const result = await evaluateStudentAcademicStanding({ studentId: current._id, actorId: new MockObjectId() });

    expect(result.changed).toBe(false);
    expect(result.unresolvedFailureCount).toBe(2);
    expect(lifecycleWrites()).toHaveLength(0);
  });

  test('never auto-dismisses a graduated student', async () => {
    const current = student({ lifecycleStatus: 'Graduated' });
    Student.findById.mockResolvedValue(current);
    Enrollment.find.mockReturnValue(chain([
      enrollment({ subjects: [failingEntry({ code: 'A' }), failingEntry({ code: 'B' }), failingEntry({ code: 'C' })] })
    ]));

    const result = await evaluateStudentAcademicStanding({ studentId: current._id, actorId: new MockObjectId() });

    expect(result.changed).toBe(false);
    expect(result.reason).toBe('lifecycle_not_eligible_for_automatic_dismissal');
    expect(lifecycleWrites()).toHaveLength(0);
  });

  test('honours a threshold configured by institutional policy', async () => {
    setDismissalPolicy({ failureThreshold: 4 });
    const current = student();
    Student.findById.mockResolvedValue(current);
    Enrollment.find.mockReturnValue(chain([
      enrollment({ subjects: [failingEntry({ code: 'A' }), failingEntry({ code: 'B' }), failingEntry({ code: 'C' })] })
    ]));

    const result = await evaluateStudentAcademicStanding({ studentId: current._id, actorId: new MockObjectId() });

    expect(result.threshold).toBe(4);
    expect(result.changed).toBe(false);
    expect(lifecycleWrites()).toHaveLength(0);
  });
});

describe('evaluateStudentAcademicStanding – idempotency and concurrency', () => {
  test('a duplicate grade finalization event does not create a second dismissal', async () => {
    const current = student();
    Student.findById.mockResolvedValue(current);
    Student.findOneAndUpdate.mockResolvedValue({ ...current, lifecycleStatus: 'Dropped' });
    Enrollment.find.mockReturnValue(chain([
      enrollment({ subjects: [failingEntry({ code: 'A' }), failingEntry({ code: 'B' }), failingEntry({ code: 'C' })] })
    ]));

    const first = await evaluateStudentAcademicStanding({ studentId: current._id, actorId: new MockObjectId() });
    expect(first.changed).toBe(true);

    const eventId = first.eventId;
    Student.findById.mockResolvedValue({
      ...current,
      lifecycleStatus: 'Dropped',
      lifecycleStatusReason: REASON_ACADEMIC_DEFICIENCY,
      lifecycleStatusEventId: eventId,
      lifecycleStatusHistory: [{
        eventId,
        status: 'Dropped',
        reason: REASON_ACADEMIC_DEFICIENCY,
        decision: 'AUTOMATIC_DISMISSAL',
        effectiveDate: new Date('2026-01-01'),
        failedSubjects: []
      }]
    });

    const second = await evaluateStudentAcademicStanding({ studentId: current._id, actorId: new MockObjectId() });

    expect(second.changed).toBe(false);
    expect(second.alreadyDropped).toBe(true);
    expect(lifecycleWrites()).toHaveLength(1);
    expect(StudentNotification.updateOne).toHaveBeenCalledTimes(2);
  });

  test('concurrent grade updates produce exactly one dismissal and a consistent count', async () => {
    const current = student();
    let dismissed = false;
    Student.findById.mockResolvedValue(current);
    Student.findOneAndUpdate.mockImplementation(async (filter, update) => {
      if (update?.$set?.lifecycleStatus === 'Dropped' && !dismissed) {
        dismissed = true;
        return { ...current, lifecycleStatus: 'Dropped' };
      }
      return null;
    });
    Enrollment.find.mockReturnValue(chain([
      enrollment({ subjects: [failingEntry({ code: 'A' }), failingEntry({ code: 'B' }), failingEntry({ code: 'C' })] })
    ]));

    const results = await Promise.all([
      evaluateStudentAcademicStanding({ studentId: current._id, actorId: new MockObjectId() }),
      evaluateStudentAcademicStanding({ studentId: current._id, actorId: new MockObjectId() })
    ]);

    expect(results.map((result) => result.unresolvedFailureCount)).toEqual([3, 3]);
    expect(results.filter((result) => result.changed)).toHaveLength(1);
    expect(lifecycleWrites()).toHaveLength(2);
    expect(StudentNotification.updateOne).toHaveBeenCalledTimes(1);
  });
});

describe('evaluateStudentAcademicStanding – automatic recovery', () => {
  function dismissedStudent(overrides = {}) {
    const dismissalEventId = new MockObjectId();
    return student({
      lifecycleStatus: 'Dropped',
      lifecycleStatusReason: REASON_ACADEMIC_DEFICIENCY,
      lifecycleStatusEventId: dismissalEventId,
      lifecycleStatusFailedSubjects: [{ code: 'PROG1', grade: 5 }],
      lifecycleStatusHistory: [
        { eventId: new MockObjectId(), status: 'Enrolled', reason: 'ENROLLMENT', decision: 'ENROLLED' },
        {
          eventId: dismissalEventId,
          status: 'Dropped',
          reason: REASON_ACADEMIC_DEFICIENCY,
          decision: 'AUTOMATIC_DISMISSAL',
          effectiveDate: new Date('2026-01-10'),
          failedSubjects: [{ code: 'PROG1', grade: 5 }]
        }
      ],
      ...overrides
    });
  }

  function threeFailuresOnePassed() {
    const retaken = new MockObjectId();
    return [
      enrollment({
        subjects: [
          failingEntry({ subjectId: retaken, code: 'PROG1' }),
          failingEntry({ code: 'MATH101' }),
          failingEntry({ code: 'ENG101' })
        ]
      }),
      enrollment({
        _id: new MockObjectId(),
        schoolYear: '2026-2027',
        semester: '1st',
        subjects: [passingEntry({ _id: new MockObjectId(), subjectId: retaken, code: 'PROG1' })]
      })
    ];
  }

  test('a previously auto-dropped student who passes a retake is restored', async () => {
    const current = dismissedStudent();
    const archivedAssignment = {
      _id: new MockObjectId(),
      sectionId: new MockObjectId(),
      archivePreviousStatus: 'ASSIGNED'
    };
    Student.findById.mockResolvedValue(current);
    Student.findOneAndUpdate.mockResolvedValue({ ...current, lifecycleStatus: 'Enrolled' });
    Enrollment.find.mockReturnValue(chain(threeFailuresOnePassed()));
    StudentBlockAssignment.find.mockReturnValue(chain([archivedAssignment]));

    const result = await evaluateStudentAcademicStanding({ studentId: current._id, actorId: new MockObjectId() });

    expect(result.changed).toBe(true);
    expect(result.restored).toBe(true);
    expect(result.unresolvedFailureCount).toBe(2);
    expect(result.lifecycleStatus).toBe('Enrolled');
    expect(result.rosterRestored).toBe(true);
    expect(result.auditLogged).toBe(true);

    const writes = lifecycleWrites();
    expect(writes).toHaveLength(1);
    const update = writes[0][1];
    expect(update.$set.lifecycleStatus).toBe('Enrolled');
    expect(update.$set.lifecycleStatusReason).toBe(REASON_ACADEMIC_RESTORATION);
    expect(update.$set.academicStanding).toBe('ACADEMIC_PROBATION');
    expect(update.$set.isActive).toBe(true);
    expect(update.$push.lifecycleStatusHistory.status).toBe('Enrolled');
    expect(update.$push.lifecycleStatusHistory.decision).toBe('AUTOMATIC_RESTORATION');
    expect(update.$push.lifecycleStatusHistory.remarks).toContain('below the dismissal threshold');
    expect(update.$push.lifecycleStatusHistory.failedSubjects).toHaveLength(2);

    // The dismissal event is preserved, never overwritten.
    expect(update.$set.lifecycleStatusHistory).toBeUndefined();

    expect(StudentBlockAssignment.updateMany).toHaveBeenCalledWith(
      { _id: { $in: [archivedAssignment._id] }, status: 'ARCHIVED' },
      expect.objectContaining({ $set: expect.objectContaining({ status: 'ASSIGNED' }) })
    );

    expect(AuditLog.create).toHaveBeenCalledWith(expect.objectContaining({
      resourceType: 'STUDENT',
      severity: 'CRITICAL',
      description: expect.stringContaining('restored')
    }));
    expect(StudentNotification.updateOne).toHaveBeenCalledWith(
      expect.objectContaining({ eventKey: expect.stringContaining('student-lifecycle:') }),
      expect.objectContaining({ $setOnInsert: expect.objectContaining({ title: 'Student status restored' }) }),
      { upsert: true }
    );
  });

  test('an auto-dropped student still at the threshold is not restored', async () => {
    const current = dismissedStudent();
    Student.findById.mockResolvedValue(current);
    Enrollment.find.mockReturnValue(chain([
      enrollment({
        subjects: [
          failingEntry({ code: 'PROG1' }),
          failingEntry({ code: 'MATH101' }),
          failingEntry({ code: 'ENG101' })
        ]
      })
    ]));

    const result = await evaluateStudentAcademicStanding({ studentId: current._id, actorId: new MockObjectId() });

    expect(result.changed).toBe(false);
    expect(result.restored).toBe(false);
    expect(result.reason).toBe('dismissal_threshold_still_met');
    expect(lifecycleWrites()).toHaveLength(0);
  });

  test('a manually dismissed student is never restored automatically', async () => {
    const current = dismissedStudent({
      lifecycleStatusReason: 'MANUAL_DISMISSAL',
      lifecycleStatusHistory: [{
        eventId: new MockObjectId(),
        status: 'Dropped',
        reason: 'MANUAL_DISMISSAL',
        decision: 'MANUAL_DISMISSAL',
        effectiveDate: new Date('2026-01-10')
      }],
      lifecycleStatusEventId: null
    });
    Student.findById.mockResolvedValue(current);
    Enrollment.find.mockReturnValue(chain(threeFailuresOnePassed()));

    const result = await evaluateStudentAcademicStanding({ studentId: current._id, actorId: new MockObjectId() });

    expect(result.changed).toBe(false);
    expect(result.restored).toBe(false);
    expect(result.reason).toBe('dismissal_not_system_generated');
    expect(lifecycleWrites()).toHaveLength(0);
  });

  test('recovery is skipped when institutional policy disables it', async () => {
    setDismissalPolicy({ allowAutomaticRecovery: false });
    const current = dismissedStudent();
    Student.findById.mockResolvedValue(current);
    Enrollment.find.mockReturnValue(chain(threeFailuresOnePassed()));

    const result = await evaluateStudentAcademicStanding({ studentId: current._id, actorId: new MockObjectId() });

    expect(result.changed).toBe(false);
    expect(result.restored).toBe(false);
    expect(result.reason).toBe('automatic_recovery_disabled_by_policy');
    expect(lifecycleWrites()).toHaveLength(0);
  });

  test('retries a pending dismissal notification without creating a new status event', async () => {
    const current = dismissedStudent({ lifecycleStatusNotificationPending: true });
    Student.findById.mockResolvedValue(current);
    Enrollment.find.mockReturnValue(chain([
      enrollment({
        subjects: [
          failingEntry({ code: 'PROG1' }),
          failingEntry({ code: 'MATH101' }),
          failingEntry({ code: 'ENG101' })
        ]
      })
    ]));

    await evaluateStudentAcademicStanding({ studentId: current._id, actorId: new MockObjectId() });

    expect(StudentNotification.updateOne).toHaveBeenCalledTimes(1);
    expect(Student.updateOne).toHaveBeenCalledWith(
      { _id: current._id },
      { $set: { lifecycleStatusNotificationPending: false } }
    );
    expect(lifecycleWrites()).toHaveLength(0);
  });
});

describe('grade correction integrity', () => {
  test('a correction from failing to passing removes the subject from the unresolved count', async () => {
    const current = student();
    const subjects = [
      { id: new MockObjectId(), code: 'PROG1' },
      { id: new MockObjectId(), code: 'MATH101' },
      { id: new MockObjectId(), code: 'ENG101' }
    ];
    const failingTerm = (correctedCode) => enrollment({
      subjects: subjects.map((subject) => (subject.code === correctedCode
        ? passingEntry({ subjectId: subject.id, code: subject.code })
        : failingEntry({ subjectId: subject.id, code: subject.code })))
    });

    Student.findById.mockResolvedValue(current);
    Student.findOneAndUpdate.mockResolvedValue({ ...current, lifecycleStatus: 'Dropped' });

    // Before the correction the student has three unresolved failures.
    Enrollment.find.mockReturnValue(chain([failingTerm('none')]));
    const before = await evaluateStudentAcademicStanding({ studentId: current._id, actorId: new MockObjectId() });
    expect(before.unresolvedFailureCount).toBe(3);
    expect(before.changed).toBe(true);
    const dismissalWritesAfterFirst = lifecycleWrites().length;

    // An approved grade correction turns Programming 1 into a pass.
    Enrollment.find.mockReturnValue(chain([failingTerm('PROG1')]));
    const after = await evaluateStudentAcademicStanding({ studentId: current._id, actorId: new MockObjectId() });

    expect(after.unresolvedFailureCount).toBe(2);
    expect(after.failures.map((failure) => failure.code).sort()).toEqual(['ENG101', 'MATH101']);
    expect(after.changed).toBe(false);
    expect(lifecycleWrites()).toHaveLength(dismissalWritesAfterFirst);
  });

  test('a correction from passing to failing raises the count and dismisses at the threshold', async () => {
    const current = student();
    const subjects = [
      { id: new MockObjectId(), code: 'PROG1' },
      { id: new MockObjectId(), code: 'MATH101' },
      { id: new MockObjectId(), code: 'ENG101' }
    ];
    const term = (failingCode) => enrollment({
      subjects: subjects.map((subject) => (subject.code === failingCode
        ? failingEntry({ subjectId: subject.id, code: subject.code })
        : (subject.code === 'PROG1' || subject.code === 'MATH101'
          ? failingEntry({ subjectId: subject.id, code: subject.code })
          : passingEntry({ subjectId: subject.id, code: subject.code }))))
    });

    Student.findById.mockResolvedValue(current);
    Student.findOneAndUpdate.mockResolvedValue({ ...current, lifecycleStatus: 'Dropped' });

    Enrollment.find.mockReturnValue(chain([term('NONE')]));
    const before = await evaluateStudentAcademicStanding({ studentId: current._id, actorId: new MockObjectId() });
    expect(before.unresolvedFailureCount).toBe(2);
    expect(lifecycleWrites()).toHaveLength(0);

    // The corrected result for English is now failing: three unresolved subjects.
    Enrollment.find.mockReturnValue(chain([term('ENG101')]));
    const after = await evaluateStudentAcademicStanding({ studentId: current._id, actorId: new MockObjectId() });

    expect(after.unresolvedFailureCount).toBe(3);
    expect(after.changed).toBe(true);
    expect(lifecycleWrites()).toHaveLength(1);
  });

  test('a correction of the latest attempt resolves a subject that was failed twice', async () => {
    const current = student();
    const subjectId = new MockObjectId();
    Student.findById.mockResolvedValue(current);
    Enrollment.find.mockReturnValue(chain([
      enrollment({ subjects: [failingEntry({ subjectId, code: 'PROG1' })] }),
      enrollment({
        _id: new MockObjectId(),
        semester: '2nd',
        subjects: [failingEntry({ _id: new MockObjectId(), subjectId, code: 'PROG1' })]
      })
    ]));

    const before = await evaluateStudentAcademicStanding({ studentId: current._id, actorId: new MockObjectId() });
    expect(before.unresolvedFailureCount).toBe(1);

    // The latest failing attempt is corrected to a pass.
    Enrollment.find.mockReturnValue(chain([
      enrollment({ subjects: [failingEntry({ subjectId, code: 'PROG1' })] }),
      enrollment({
        _id: new MockObjectId(),
        semester: '2nd',
        subjects: [passingEntry({ _id: new MockObjectId(), subjectId, code: 'PROG1' })]
      })
    ]));

    const after = await evaluateStudentAcademicStanding({ studentId: current._id, actorId: new MockObjectId() });
    expect(after.unresolvedFailureCount).toBe(0);
    expect(after.academicStanding).toBe('GOOD_STANDING');
    expect(lifecycleWrites()).toHaveLength(0);
  });
});

describe('readmitStudent', () => {
  test('preserves the dismissal event and appends an authorized readmission event', async () => {
    const current = student({
      lifecycleStatus: 'Dropped',
      lifecycleStatusReason: 'ACADEMIC_DEFICIENCY',
      lifecycleStatusTerm: { schoolYear: '2025-2026', semester: '1st' },
      lifecycleStatusFailedSubjects: [{ code: 'MATH101', grade: 5 }],
      lifecycleStatusHistory: [{ status: 'Dropped', reason: 'ACADEMIC_DEFICIENCY' }]
    });
    Student.findById.mockResolvedValue(current);
    Student.findByIdAndUpdate.mockResolvedValue({ ...current, lifecycleStatus: 'Pending' });

    const result = await readmitStudent({
      studentId: current._id,
      lifecycleStatus: 'Pending',
      reason: 'Registrar review approved',
      actorId: new MockObjectId(),
      accountType: 'registrar'
    });

    expect(result.student).toBeTruthy();
    expect(Student.findByIdAndUpdate).toHaveBeenCalledTimes(1);
    const update = Student.findByIdAndUpdate.mock.calls[0][1];
    expect(update.$set.lifecycleStatus).toBe('Pending');
    expect(update.$set.lifecycleStatusReason).toBe(REASON_AUTHORIZED_READMISSION);
    expect(update.$set.isActive).toBe(true);
    expect(update.$push.lifecycleStatusHistory.status).toBe('Pending');
    expect(update.$push.lifecycleStatusHistory.decision).toBe('READMITTED');
    expect(AuditLog.create).toHaveBeenCalledWith(expect.objectContaining({
      action: 'APPROVE',
      resourceType: 'STUDENT',
      description: expect.stringContaining('Authorized readmission')
    }));
  });

  test('rejects readmission for a student who is not Dropped', async () => {
    const current = student({ lifecycleStatus: 'Enrolled' });
    Student.findById.mockResolvedValue(current);

    await expect(readmitStudent({
      studentId: current._id,
      reason: 'Not authorized',
      actorId: new MockObjectId()
    })).rejects.toMatchObject({ statusCode: 409 });
    expect(Student.findByIdAndUpdate).not.toHaveBeenCalled();
  });

  test('rejects a readmission target outside the supported states', async () => {
    const current = student({ lifecycleStatus: 'Dropped' });
    Student.findById.mockResolvedValue(current);

    await expect(readmitStudent({
      studentId: current._id,
      lifecycleStatus: 'Enrolled',
      reason: 'Invalid target',
      actorId: new MockObjectId()
    })).rejects.toMatchObject({ statusCode: 400 });
  });
});

describe('reactivateStudent', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('returns a student on leave of absence to an active, enrollable record', async () => {
    const current = student({
      lifecycleStatus: 'Leave of Absence',
      isActive: false,
      enrollmentStatus: 'On Leave',
      lifecycleStatusHistory: [{ status: 'Leave of Absence', reason: 'MEDICAL_LEAVE' }]
    });
    Student.findById.mockResolvedValue(current);
    Student.findByIdAndUpdate.mockResolvedValue({ ...current, lifecycleStatus: 'Pending', isActive: true });

    const result = await reactivateStudent({
      studentId: current._id,
      lifecycleStatus: 'Pending',
      reason: 'Returned from leave',
      actorId: new MockObjectId(),
      accountType: 'registrar'
    });

    expect(result.student).toBeTruthy();
    const update = Student.findByIdAndUpdate.mock.calls[0][1];
    expect(update.$set.lifecycleStatus).toBe('Pending');
    expect(update.$set.lifecycleStatusReason).toBe(REASON_AUTHORIZED_REACTIVATION);
    expect(update.$set.isActive).toBe(true);
    expect(update.$set.enrollmentStatus).toBe('Not Enrolled');
    expect(update.$push.lifecycleStatusHistory.status).toBe('Pending');
    expect(update.$push.lifecycleStatusHistory.decision).toBe('REACTIVATED');

    expect(AuditLog.create).toHaveBeenCalledWith(expect.objectContaining({
      action: 'UPDATE',
      resourceType: 'STUDENT',
      description: expect.stringContaining('LEAVE OF ABSENCE → PENDING')
    }));

    const notification = StudentNotification.updateOne.mock.calls[0][1].$setOnInsert;
    expect(notification.title).toBe('Student status reactivated');
    expect(notification.message).toContain('reactivated');
  });

  test('reactivates a student archived as inactive', async () => {
    const current = student({ lifecycleStatus: 'Inactive', isActive: false });
    Student.findById.mockResolvedValue(current);
    Student.findByIdAndUpdate.mockResolvedValue({ ...current, lifecycleStatus: 'Pending', isActive: true });

    await reactivateStudent({ studentId: current._id, reason: 'Account restored', actorId: new MockObjectId() });

    const update = Student.findByIdAndUpdate.mock.calls[0][1];
    expect(update.$set.lifecycleStatus).toBe('Pending');
    expect(update.$set.isActive).toBe(true);
    expect(AuditLog.create).toHaveBeenCalledWith(expect.objectContaining({
      description: expect.stringContaining('INACTIVE → PENDING')
    }));
  });

  test('rejects reactivation for a student who is not on leave or inactive', async () => {
    const current = student({ lifecycleStatus: 'Enrolled' });
    Student.findById.mockResolvedValue(current);

    await expect(reactivateStudent({
      studentId: current._id,
      reason: 'Not on leave',
      actorId: new MockObjectId()
    })).rejects.toMatchObject({ statusCode: 409 });
    expect(Student.findByIdAndUpdate).not.toHaveBeenCalled();
  });

  test('rejects a reactivation target outside the supported states', async () => {
    const current = student({ lifecycleStatus: 'Leave of Absence', isActive: false });
    Student.findById.mockResolvedValue(current);

    await expect(reactivateStudent({
      studentId: current._id,
      lifecycleStatus: 'Enrolled',
      reason: 'Invalid target',
      actorId: new MockObjectId()
    })).rejects.toMatchObject({ statusCode: 400 });
    expect(Student.findByIdAndUpdate).not.toHaveBeenCalled();
  });
});
