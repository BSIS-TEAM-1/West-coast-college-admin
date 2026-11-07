/**
 * Multi-instance lifecycle concurrency tests.
 *
 * Production runs more than one application instance, and the in-process
 * evaluation lock cannot coordinate across them. Safety therefore has to come
 * from database-level conditional updates. These tests load the lifecycle
 * service TWICE (`jest.isolateModules` gives each copy its own lock map, which
 * models two separate processes) and drive both copies against one shared
 * in-memory student store that applies the same filters a MongoDB
 * `findOneAndUpdate` would.
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

jest.mock('mongoose', () => ({ Types: { ObjectId: MockObjectId } }));
jest.mock('./models/Student', () => ({
  findById: jest.fn(),
  findOneAndUpdate: jest.fn(),
  findByIdAndUpdate: jest.fn(),
  updateOne: jest.fn(async () => ({ modifiedCount: 1 }))
}));
jest.mock('./models/Enrollment', () => ({ find: jest.fn() }));
jest.mock('./models/AuditLog', () => ({ create: jest.fn(async () => ({})) }));
jest.mock('./models/StudentNotification', () => ({ updateOne: jest.fn(async () => ({}) ) }));
jest.mock('./models/StudentBlockAssignment', () => ({
  find: jest.fn(),
  updateMany: jest.fn(async () => ({ modifiedCount: 1 })),
  aggregate: jest.fn(async () => [])
}));
jest.mock('./models/SectionWaitlist', () => ({
  find: jest.fn(),
  updateMany: jest.fn(async () => ({ modifiedCount: 1 }))
}));
jest.mock('./models/BlockSection', () => ({ findByIdAndUpdate: jest.fn(async () => ({})) }));
jest.mock('./models/SystemSetting', () => ({ findOne: jest.fn() }));
jest.mock('./services/gradingScaleService', () => ({
  loadGradeScale: jest.fn(async () => ({ passingGrade: 3 }))
}));

const Student = require('./models/Student');
const Enrollment = require('./models/Enrollment');
const StudentNotification = require('./models/StudentNotification');
const AuditLog = require('./models/AuditLog');
const StudentBlockAssignment = require('./models/StudentBlockAssignment');
const SectionWaitlist = require('./models/SectionWaitlist');
const SystemSetting = require('./models/SystemSetting');

const REASON_ACADEMIC_DEFICIENCY = 'ACADEMIC_DEFICIENCY';
const DECISION_AUTOMATIC_DISMISSAL = 'AUTOMATIC_DISMISSAL';
const DECISION_AUTOMATIC_RESTORATION = 'AUTOMATIC_RESTORATION';

const chain = (value) => ({
  select: jest.fn().mockReturnThis(),
  lean: jest.fn(async () => value)
});

/** Two independent loadings of the service = two application instances. */
function loadInstance() {
  let instance;
  jest.isolateModules(() => {
    instance = require('./services/studentLifecycleService');
  });
  return instance;
}

function cloneStudent(doc) {
  return {
    ...doc,
    lifecycleStatusHistory: (doc.lifecycleStatusHistory || []).slice(),
    lifecycleStatusFailedSubjects: (doc.lifecycleStatusFailedSubjects || []).slice()
  };
}

/**
 * Only the filter operators the lifecycle service actually uses are
 * implemented; anything else is a test bug and throws loudly.
 */
function matchesFilter(doc, filter) {
  return Object.entries(filter || {}).every(([key, condition]) => {
    if (key === '$or') {
      return condition.some((clause) => matchesFilter(doc, clause));
    }

    const value = doc[key];

    if (condition === null || condition === undefined) {
      return value === null || value === undefined;
    }

    if (condition instanceof MockObjectId || typeof condition === 'string' || typeof condition === 'number') {
      return String(value) === String(condition);
    }

    if (typeof condition === 'object') {
      let checked = false;
      if ('$in' in condition) {
        checked = true;
        if (!condition.$in.some((candidate) => String(candidate) === String(value))) return false;
      }
      if ('$ne' in condition) {
        checked = true;
        if (String(value) === String(condition.$ne)) return false;
      }
      if ('$exists' in condition) {
        checked = true;
        if (Boolean(condition.$exists) !== (value !== undefined)) return false;
      }
      if ('$lt' in condition) {
        checked = true;
        if (value === undefined || value === null) return false;
        if (!(new Date(value).getTime() < new Date(condition.$lt).getTime())) return false;
      }
      if (!checked) throw new Error(`Unsupported filter condition on ${key}: ${JSON.stringify(condition)}`);
      return true;
    }

    return String(value) === String(condition);
  });
}

/** A tiny store with MongoDB's single-document conditional-update semantics. */
function createStudentStore(initial) {
  const store = { doc: cloneStudent(initial) };

  Student.findById.mockImplementation(async () => cloneStudent(store.doc));

  Student.findOneAndUpdate.mockImplementation(async (filter, update) => {
    if (!matchesFilter(store.doc, filter)) return null;

    const changes = update.$set || {};
    const attemptedStanding = Object.prototype.hasOwnProperty.call(changes, 'academicStanding')
      ? changes.academicStanding
      : null;
    // Mirror the model enum so a bad standing can never slip through silently.
    if (attemptedStanding && !['GOOD_STANDING', 'ACADEMIC_PROBATION', 'DISMISSED'].includes(attemptedStanding)) {
      throw new Error(`invalid academicStanding ${attemptedStanding}`);
    }

    Object.assign(store.doc, changes);
    for (const [field, value] of Object.entries(update.$push || {})) {
      if (!Array.isArray(store.doc[field])) store.doc[field] = [];
      store.doc[field].push(value);
    }
    return cloneStudent(store.doc);
  });

  return store;
}

function failingEntry(code, subjectId = new MockObjectId()) {
  return {
    _id: new MockObjectId(),
    subjectId,
    code,
    title: code,
    units: 3,
    grade: 5,
    gradeMark: null,
    status: 'Completed',
    submissionStatus: 'Published'
  };
}

function passingEntry(code, subjectId = new MockObjectId()) {
  return { ...failingEntry(code, subjectId), _id: new MockObjectId(), grade: 1.75 };
}

function term(subjects, overrides = {}) {
  return {
    _id: new MockObjectId(),
    schoolYear: '2025-2026',
    semester: '1st',
    status: 'Enrolled',
    gradeSubmission: { status: 'Published' },
    subjects,
    ...overrides
  };
}

function studentDoc(overrides = {}) {
  return {
    _id: new MockObjectId(),
    studentNumber: '2025-0001',
    firstName: 'Ada',
    lastName: 'Lovelace',
    schoolYear: '2025-2026',
    semester: '2nd',
    lifecycleStatus: 'Enrolled',
    lifecycleStatusReason: null,
    lifecycleStatusEventId: null,
    lifecycleStatusHistory: [],
    academicStanding: 'GOOD_STANDING',
    academicStandingUpdatedAt: null,
    isActive: true,
    ...overrides
  };
}

let enrollments = [];
let instanceA;
let instanceB;

beforeEach(() => {
  jest.clearAllMocks();
  enrollments = [];
  instanceA = loadInstance();
  instanceB = loadInstance();

  Student.updateOne.mockResolvedValue({ modifiedCount: 1 });
  Student.findByIdAndUpdate.mockResolvedValue(null);
  Enrollment.find.mockImplementation(() => chain(enrollments));
  StudentBlockAssignment.find.mockReturnValue(chain([]));
  StudentBlockAssignment.updateMany.mockResolvedValue({ modifiedCount: 0 });
  StudentBlockAssignment.aggregate.mockResolvedValue([]);
  SectionWaitlist.find.mockReturnValue(chain([]));
  SectionWaitlist.updateMany.mockResolvedValue({ modifiedCount: 0 });
  StudentNotification.updateOne.mockResolvedValue({});
  AuditLog.create.mockResolvedValue({});
  SystemSetting.findOne.mockReturnValue(chain(null));
});

describe('two application instances', () => {
  test('cannot record two dismissal events for the same grade finalization', async () => {
    const store = createStudentStore(studentDoc());
    enrollments = [term([failingEntry('MATH101'), failingEntry('ENG101'), failingEntry('FIL101')])];

    const [first, second] = await Promise.all([
      instanceA.evaluateStudentAcademicStanding({ studentId: store.doc._id }),
      instanceB.evaluateStudentAcademicStanding({ studentId: store.doc._id })
    ]);

    expect([first.changed, second.changed].filter(Boolean)).toHaveLength(1);
    const dismissals = store.doc.lifecycleStatusHistory.filter(
      (event) => event.decision === DECISION_AUTOMATIC_DISMISSAL
    );
    expect(dismissals).toHaveLength(1);
    expect(store.doc.lifecycleStatus).toBe('Dropped');
    expect(store.doc.academicStanding).toBe('DISMISSED');
    expect(StudentNotification.updateOne).toHaveBeenCalledTimes(1);
  });

  test('cannot record two restoration events for the same passed retake', async () => {
    const dismissalEventId = new MockObjectId();
    const store = createStudentStore(studentDoc({
      lifecycleStatus: 'Dropped',
      lifecycleStatusReason: REASON_ACADEMIC_DEFICIENCY,
      lifecycleStatusEventId: dismissalEventId,
      academicStanding: 'DISMISSED',
      lifecycleStatusHistory: [
        { eventId: new MockObjectId(), status: 'Enrolled', reason: 'ENROLLMENT', decision: 'ENROLLED' },
        {
          eventId: dismissalEventId,
          status: 'Dropped',
          reason: REASON_ACADEMIC_DEFICIENCY,
          decision: DECISION_AUTOMATIC_DISMISSAL,
          effectiveDate: new Date('2026-01-10')
        }
      ]
    }));
    // Three historical failures, one since passed: two unresolved.
    const retaken = new MockObjectId();
    enrollments = [
      term([failingEntry('PROG1', retaken), failingEntry('MATH101'), failingEntry('ENG101')]),
      term([passingEntry('PROG1', retaken)], {
        schoolYear: '2026-2027',
        semester: '1st'
      })
    ];

    const [first, second] = await Promise.all([
      instanceA.evaluateStudentAcademicStanding({ studentId: store.doc._id }),
      instanceB.evaluateStudentAcademicStanding({ studentId: store.doc._id })
    ]);

    expect([first.changed, second.changed].filter(Boolean)).toHaveLength(1);
    const restorations = store.doc.lifecycleStatusHistory.filter(
      (event) => event.decision === DECISION_AUTOMATIC_RESTORATION
    );
    expect(restorations).toHaveLength(1);
    expect(store.doc.lifecycleStatus).toBe('Enrolled');
    expect(store.doc.academicStanding).toBe('ACADEMIC_PROBATION');

    // The dismissal event is preserved, not rewritten.
    expect(store.doc.lifecycleStatusHistory.filter(
      (event) => event.decision === DECISION_AUTOMATIC_DISMISSAL
    )).toHaveLength(1);
  });

  test('a stale instance cannot dismiss a student who graduated meanwhile', async () => {
    const store = createStudentStore(studentDoc());
    enrollments = [term([failingEntry('MATH101'), failingEntry('ENG101'), failingEntry('FIL101')])];

    // The instance read the student while active; the registrar graduated the
    // student before the dismissal write landed.
    const snapshot = cloneStudent(store.doc);
    Student.findById.mockImplementationOnce(async () => {
      store.doc.lifecycleStatus = 'Graduated';
      return snapshot;
    });

    const result = await instanceA.evaluateStudentAcademicStanding({ studentId: store.doc._id });

    expect(result.changed).toBe(false);
    expect(store.doc.lifecycleStatus).toBe('Graduated');
    expect(store.doc.lifecycleStatusHistory).toHaveLength(0);
  });

  test('a stale instance cannot restore a dismissal that was superseded by a manual one', async () => {
    const dismissalEventId = new MockObjectId();
    const manualEventId = new MockObjectId();
    const store = createStudentStore(studentDoc({
      lifecycleStatus: 'Dropped',
      lifecycleStatusReason: REASON_ACADEMIC_DEFICIENCY,
      lifecycleStatusEventId: dismissalEventId,
      academicStanding: 'DISMISSED',
      lifecycleStatusHistory: [{
        eventId: dismissalEventId,
        status: 'Dropped',
        reason: REASON_ACADEMIC_DEFICIENCY,
        decision: DECISION_AUTOMATIC_DISMISSAL,
        effectiveDate: new Date('2026-01-10')
      }]
    }));
    const retaken = new MockObjectId();
    enrollments = [
      term([failingEntry('PROG1', retaken), failingEntry('MATH101'), failingEntry('ENG101')]),
      term([passingEntry('PROG1', retaken)], { schoolYear: '2026-2027', semester: '1st' })
    ];

    const snapshot = cloneStudent(store.doc);
    Student.findById.mockImplementationOnce(async () => {
      // Another instance/registrar records a manual dismissal first.
      store.doc.lifecycleStatusEventId = manualEventId;
      store.doc.lifecycleStatusReason = 'MANUAL_DISMISSAL';
      store.doc.lifecycleStatusHistory.push({
        eventId: manualEventId,
        status: 'Dropped',
        reason: 'MANUAL_DISMISSAL',
        decision: 'MANUAL_DISMISSAL',
        effectiveDate: new Date('2026-02-01')
      });
      return snapshot;
    });

    const result = await instanceA.evaluateStudentAcademicStanding({ studentId: store.doc._id });

    expect(result.changed).toBe(false);
    expect(result.restored).toBe(false);
    expect(result.reason).toBe('dismissal_state_changed_concurrently');
    expect(store.doc.lifecycleStatus).toBe('Dropped');
    expect(store.doc.lifecycleStatusEventId).toBe(manualEventId);
    expect(store.doc.lifecycleStatusHistory.filter(
      (event) => event.decision === DECISION_AUTOMATIC_RESTORATION
    )).toHaveLength(0);
  });

  test('an older evaluation cannot overwrite a newer academic standing', async () => {
    const store = createStudentStore(studentDoc({
      academicStanding: 'GOOD_STANDING',
      academicStandingUpdatedAt: new Date('2026-05-01')
    }));
    enrollments = [term([failingEntry('MATH101')])];

    // This evaluation started before the newer standing was recorded.
    const stale = await instanceA.evaluateStudentAcademicStanding({
      studentId: store.doc._id,
      effectiveDate: new Date('2026-01-01')
    });

    expect(stale.standingChanged).toBe(false);
    expect(store.doc.academicStanding).toBe('GOOD_STANDING');

    // A current evaluation is allowed to correct the standing.
    const fresh = await instanceB.evaluateStudentAcademicStanding({
      studentId: store.doc._id,
      effectiveDate: new Date('2026-06-01')
    });

    expect(fresh.standingChanged).toBe(true);
    expect(store.doc.academicStanding).toBe('ACADEMIC_PROBATION');
  });

  test('the final standing reflects the latest finalized grade history', async () => {
    const store = createStudentStore(studentDoc({
      lifecycleStatusHistory: [
        { eventId: new MockObjectId(), status: 'Enrolled', reason: 'ENROLLMENT', decision: 'ENROLLED' }
      ]
    }));
    enrollments = [term([failingEntry('MATH101'), failingEntry('ENG101'), failingEntry('FIL101')])];

    await instanceA.evaluateStudentAcademicStanding({ studentId: store.doc._id });
    expect(store.doc.lifecycleStatus).toBe('Dropped');

    // A retake is finalized on the other instance.
    const retaken = new MockObjectId();
    enrollments = [
      term([failingEntry('MATH101'), failingEntry('ENG101'), failingEntry('FIL101', retaken)]),
      term([passingEntry('FIL101', retaken)], { schoolYear: '2026-2027', semester: '1st' })
    ];
    await instanceB.evaluateStudentAcademicStanding({ studentId: store.doc._id });

    expect(store.doc.lifecycleStatus).toBe('Enrolled');
    expect(store.doc.academicStanding).toBe('ACADEMIC_PROBATION');
    expect(store.doc.lifecycleStatusFailedSubjects.map((entry) => entry.code).sort())
      .toEqual(['ENG101', 'MATH101']);
  });
});
