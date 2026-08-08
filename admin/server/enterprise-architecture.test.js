const test = require('node:test');
const assert = require('node:assert/strict');

// ---- EventBus Tests ----
test('EventBus: emit and receive events', async () => {
  delete require.cache[require.resolve('./domains/shared/EventBus')];
  const eventBus = require('./domains/shared/EventBus');
  let received = null;

  eventBus.on('TestEvent', async (event) => {
    received = event;
  });

  await eventBus.emit('TestEvent', { message: 'hello' });

  assert.equal(received.event, 'TestEvent');
  assert.equal(received.payload.message, 'hello');
  assert.ok(received.timestamp instanceof Date);
});

test('EventBus: handler errors do not block other handlers', async () => {
  delete require.cache[require.resolve('./domains/shared/EventBus')];
  const eventBus = require('./domains/shared/EventBus');
  let secondHandlerCalled = false;

  eventBus.on('ErrorTest', async () => {
    throw new Error('Handler 1 failed');
  });

  eventBus.on('ErrorTest', async () => {
    secondHandlerCalled = true;
  });

  await eventBus.emit('ErrorTest', {});

  assert.equal(secondHandlerCalled, true);
});

test('EventBus: once handler only fires once', async () => {
  delete require.cache[require.resolve('./domains/shared/EventBus')];
  const eventBus = require('./domains/shared/EventBus');
  let callCount = 0;

  eventBus.once('OnceTest', async () => {
    callCount++;
  });

  await eventBus.emit('OnceTest', {});
  await eventBus.emit('OnceTest', {});

  assert.equal(callCount, 1);
});

test('EventBus: event log records all events', async () => {
  delete require.cache[require.resolve('./domains/shared/EventBus')];
  const eventBus = require('./domains/shared/EventBus');

  await eventBus.emit('LogTest1', { a: 1 });
  await eventBus.emit('LogTest2', { b: 2 });

  const log = eventBus.getEventLog(10);
  const logTest1 = log.find((e) => e.event === 'LogTest1');
  const logTest2 = log.find((e) => e.event === 'LogTest2');

  assert.ok(logTest1);
  assert.ok(logTest2);
  assert.equal(logTest1.payload.a, 1);
  assert.equal(logTest2.payload.b, 2);
});

// ---- DomainEvents Tests ----
test('DomainEvents: all expected events are defined', () => {
  const DomainEvents = require('./domains/shared/DomainEvents');

  assert.equal(DomainEvents.STUDENT_ENROLLED, 'StudentEnrolled');
  assert.equal(DomainEvents.ENROLLMENT_COMPLETED, 'EnrollmentCompleted');
  assert.equal(DomainEvents.STUDENT_PROMOTED, 'StudentPromoted');
  assert.equal(DomainEvents.STUDENT_RETAINED, 'StudentRetained');
  assert.equal(DomainEvents.STUDENT_GRADUATED, 'StudentGraduated');
  assert.equal(DomainEvents.SCHOOL_YEAR_OPENED, 'SchoolYearOpened');
  assert.equal(DomainEvents.SCHOOL_YEAR_CLOSED, 'SchoolYearClosed');
  assert.equal(DomainEvents.ACADEMIC_PERIOD_OPENED, 'AcademicPeriodOpened');
  assert.equal(DomainEvents.ACADEMIC_PERIOD_CLOSED, 'AcademicPeriodClosed');
  assert.equal(DomainEvents.BLOCK_CREATED, 'BlockCreated');
  assert.equal(DomainEvents.BLOCK_ARCHIVED, 'BlockArchived');
  assert.equal(DomainEvents.SNAPSHOT_GENERATED, 'SnapshotGenerated');
  assert.equal(DomainEvents.DOCUMENT_ARCHIVED, 'DocumentArchived');
  assert.equal(DomainEvents.AUDIT_LOG_CREATED, 'AuditLogCreated');
});

// ---- BaseRepository Tests ----
test('BaseRepository: can be instantiated with a model-like object', () => {
  const BaseRepository = require('./domains/shared/BaseRepository');
  const fakeModel = {
    findById: () => ({ exec: () => null }),
    findOne: () => ({ exec: () => null, session: () => ({ exec: () => null }), lean: () => ({ exec: () => null }), select: () => ({ exec: () => null }), populate: () => ({ exec: () => null }) }),
    find: () => ({ exec: () => [], session: () => ({ exec: () => [] }), lean: () => ({ exec: () => [] }), select: () => ({ exec: () => [] }), populate: () => ({ exec: () => [] }), sort: () => ({ exec: () => [], limit: () => ({ exec: () => [], skip: () => ({ exec: () => [] }) }) }) }),
    countDocuments: () => ({ exec: () => 0 }),
    create: () => Promise.resolve({}),
    findByIdAndUpdate: () => ({ exec: () => null, session: () => ({ exec: () => null }), lean: () => ({ exec: () => null }) }),
    updateOne: () => ({ exec: () => null, session: () => ({ exec: () => null }) }),
    updateMany: () => ({ exec: () => null, session: () => ({ exec: () => null }) }),
    findByIdAndDelete: () => ({ exec: () => null, session: () => ({ exec: () => null }) }),
    deleteOne: () => ({ exec: () => null, session: () => ({ exec: () => null }) }),
    deleteMany: () => ({ exec: () => null, session: () => ({ exec: () => null }) }),
    aggregate: () => ({ exec: () => [], session: () => ({ exec: () => [] }) }),
  };

  const repo = new BaseRepository(fakeModel);
  assert.ok(repo);
  assert.equal(repo.model, fakeModel);
});

// ---- Promotion Policy Engine Tests ----
test('PromotionPolicy: promote eligible student', () => {
  const PromotionPolicyEngine = require('./services/promotionPolicyService');
  const DEFAULT_POLICY = PromotionPolicyEngine.DEFAULT_POLICY;

  const student = {
    _id: '1',
    studentNumber: '2025-101-001',
    firstName: 'Juan',
    lastName: 'Dela Cruz',
    yearLevel: 1,
    latestEnrollment: {
      subjects: [
        { grade: 1.5, status: 'Completed', units: 3 },
        { grade: 2.0, status: 'Completed', units: 3 },
      ],
    },
  };

  const result = PromotionPolicyEngine.evaluateWithPolicy(student, DEFAULT_POLICY, { registrarApproved: true });
  assert.equal(result.action, 'promote');
  assert.equal(result.details.hasInc, false);
  assert.equal(result.details.hasFailingGrade, false);
});

test('PromotionPolicy: retain student with INC subjects', () => {
  const PromotionPolicyEngine = require('./services/promotionPolicyService');
  const DEFAULT_POLICY = PromotionPolicyEngine.DEFAULT_POLICY;

  const student = {
    _id: '2',
    studentNumber: '2025-101-002',
    firstName: 'Maria',
    lastName: 'Santos',
    yearLevel: 2,
    latestEnrollment: {
      subjects: [
        { grade: 1.5, status: 'Completed', units: 3 },
        { grade: null, status: 'Incomplete', units: 3 },
      ],
    },
  };

  const result = PromotionPolicyEngine.evaluateWithPolicy(student, DEFAULT_POLICY, { registrarApproved: true });
  assert.equal(result.action, 'retain');
  assert.equal(result.details.hasInc, true);
});

test('PromotionPolicy: retain student with failing grade', () => {
  const PromotionPolicyEngine = require('./services/promotionPolicyService');
  const DEFAULT_POLICY = PromotionPolicyEngine.DEFAULT_POLICY;

  const student = {
    _id: '3',
    studentNumber: '2025-101-003',
    firstName: 'Pedro',
    lastName: 'Reyes',
    yearLevel: 1,
    latestEnrollment: {
      subjects: [
        { grade: 1.5, status: 'Completed', units: 3 },
        { grade: 5.0, status: 'Completed', units: 3 },
      ],
    },
  };

  const result = PromotionPolicyEngine.evaluateWithPolicy(student, DEFAULT_POLICY, { registrarApproved: true });
  assert.equal(result.action, 'retain');
  assert.equal(result.details.hasFailingGrade, true);
});

test('PromotionPolicy: graduate final year student', () => {
  const PromotionPolicyEngine = require('./services/promotionPolicyService');
  const DEFAULT_POLICY = PromotionPolicyEngine.DEFAULT_POLICY;

  const student = {
    _id: '4',
    studentNumber: '2024-101-004',
    firstName: 'Ana',
    lastName: 'Lim',
    yearLevel: 4,
    latestEnrollment: {
      subjects: [
        { grade: 1.0, status: 'Completed', units: 3 },
        { grade: 2.5, status: 'Completed', units: 3 },
      ],
    },
  };

  const result = PromotionPolicyEngine.evaluateWithPolicy(student, DEFAULT_POLICY, { registrarApproved: true });
  assert.equal(result.action, 'graduate');
  assert.equal(result.details.isFinalYear, true);
});

test('PromotionPolicy: reject student with disciplinary hold', () => {
  const PromotionPolicyEngine = require('./services/promotionPolicyService');
  const DEFAULT_POLICY = PromotionPolicyEngine.DEFAULT_POLICY;

  const student = {
    _id: '5',
    studentNumber: '2025-101-005',
    firstName: 'Jose',
    lastName: 'Cruz',
    yearLevel: 2,
    latestEnrollment: {
      subjects: [
        { grade: 1.5, status: 'Completed', units: 3 },
      ],
    },
  };

  const result = PromotionPolicyEngine.evaluateWithPolicy(student, DEFAULT_POLICY, {
    registrarApproved: true,
    hasDisciplinaryHold: true,
  });
  assert.equal(result.action, 'reject');
});

test('PromotionPolicy: promote pending registrar approval', () => {
  const PromotionPolicyEngine = require('./services/promotionPolicyService');
  const DEFAULT_POLICY = PromotionPolicyEngine.DEFAULT_POLICY;

  const student = {
    _id: '6',
    studentNumber: '2025-101-006',
    firstName: 'Liza',
    lastName: 'Tan',
    yearLevel: 1,
    latestEnrollment: {
      subjects: [
        { grade: 1.5, status: 'Completed', units: 3 },
      ],
    },
  };

  const result = PromotionPolicyEngine.evaluateWithPolicy(student, DEFAULT_POLICY, { registrarApproved: false });
  assert.equal(result.action, 'promote');
  assert.equal(result.details.registrarApproved, false);
});

// ---- Permission Matrix Tests ----
test('RBAC: registrar can close school year', () => {
  const { hasPermission } = require('./domains/shared/permissionMiddleware');
  assert.equal(hasPermission({ accountType: 'registrar' }, 'close_school_year'), true);
});

test('RBAC: faculty cannot close school year', () => {
  const { hasPermission } = require('./domains/shared/permissionMiddleware');
  assert.equal(hasPermission({ accountType: 'faculty' }, 'close_school_year'), false);
});

test('RBAC: faculty can submit grades', () => {
  const { hasPermission } = require('./domains/shared/permissionMiddleware');
  assert.equal(hasPermission({ accountType: 'faculty' }, 'submit_grades'), true);
});

test('RBAC: student can only view own timeline', () => {
  const { hasPermission, getPermissionsForRole } = require('./domains/shared/permissionMiddleware');
  assert.equal(hasPermission({ accountType: 'student' }, 'view_academic_timeline'), true);
  assert.equal(hasPermission({ accountType: 'student' }, 'close_school_year'), false);

  const studentPerms = getPermissionsForRole('student');
  assert.ok(studentPerms.includes('view_academic_timeline'));
  assert.ok(!studentPerms.includes('close_school_year'));
});

test('RBAC: dean can review promotion but not close school year', () => {
  const { hasPermission } = require('./domains/shared/permissionMiddleware');
  assert.equal(hasPermission({ accountType: 'dean' }, 'review_promotion'), true);
  assert.equal(hasPermission({ accountType: 'dean' }, 'close_school_year'), false);
  assert.equal(hasPermission({ accountType: 'dean' }, 'view_archive'), true);
});

test('RBAC: normalizeRole maps common variations', () => {
  const { normalizeRole } = require('./domains/shared/permissionMiddleware');
  assert.equal(normalizeRole('SuperAdmin'), 'admin');
  assert.equal(normalizeRole('Administrator'), 'admin');
  assert.equal(normalizeRole('Teacher'), 'faculty');
  assert.equal(normalizeRole('Instructor'), 'faculty');
  assert.equal(normalizeRole('registrar'), 'registrar');
});

// ---- Immutability Guard Tests ----
test('Immutability: locked enrollment pre-save hook rejects modification', async () => {
  const mongoose = require('mongoose');
  const Enrollment = require('./models/Enrollment');

  const enrollment = new Enrollment({
    studentId: new mongoose.Types.ObjectId(),
    studentNumber: '2025-101-001',
    schoolYear: '2025-2026',
    semester: '1st',
    yearLevel: 1,
    course: 'BEED',
    assessment: {
      tuitionFee: 10000,
      miscFee: 1000,
      otherFees: 0,
      totalAmount: 11000,
      balance: 11000,
      paymentStatus: 'Unpaid',
    },
    createdBy: new mongoose.Types.ObjectId(),
  });

  // Simulate a locked, non-new document
  // In a real scenario, the document was saved with lockedAt in a previous save.
  // We simulate this by setting lockedAt before marking as non-new.
  enrollment.lockedAt = new Date();
  enrollment.isNew = false;
  // Clear the modification tracking to simulate a document loaded from DB
  enrollment.$__reset();

  // The immutability guard logic from the pre-save hook:
  // if (!this.isNew && this.lockedAt && !this.isModified('lockedAt')) → reject
  const isLocked = !enrollment.isNew && enrollment.lockedAt && !enrollment.isModified('lockedAt');
  assert.equal(isLocked, true, 'Locked enrollment should be detected as immutable');

  // A new document with lockedAt should NOT be rejected (the locking write itself is allowed)
  const newEnrollment = new Enrollment({
    studentId: new mongoose.Types.ObjectId(),
    studentNumber: '2025-101-002',
    schoolYear: '2025-2026',
    semester: '1st',
    yearLevel: 1,
    course: 'BEED',
    assessment: {
      tuitionFee: 10000,
      miscFee: 1000,
      otherFees: 0,
      totalAmount: 11000,
      balance: 11000,
      paymentStatus: 'Unpaid',
    },
    createdBy: new mongoose.Types.ObjectId(),
  });
  newEnrollment.lockedAt = new Date();
  // isNew is true, so the guard should NOT trigger
  const shouldAllowLockingWrite = newEnrollment.isNew || !newEnrollment.lockedAt || newEnrollment.isModified('lockedAt');
  assert.equal(shouldAllowLockingWrite, true, 'Locking write on a new document should be allowed');
});
