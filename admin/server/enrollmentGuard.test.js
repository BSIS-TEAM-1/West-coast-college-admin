/**
 * Unit tests for services/enrollmentGuard.js — the single source of truth
 * for the official ENROLLED transition.
 *
 * Rule under test: a student must NOT be considered officially enrolled
 * unless a valid (ASSIGNED) block assignment exists for the same school year,
 * semester, course/program, and year level.
 */

const mockChain = (resolveValue) => {
  const chain = {
    select: jest.fn().mockReturnThis(),
    sort: jest.fn().mockReturnThis(),
    lean: jest.fn().mockResolvedValue(resolveValue),
    session: jest.fn().mockReturnThis(),
  };
  const thenable = Promise.resolve(resolveValue);
  Object.assign(chain, thenable);
  chain.then = thenable.then.bind(thenable);
  chain.catch = thenable.catch.bind(thenable);
  return chain;
};

jest.mock('mongoose', () => {
  function MockObjectId(id) {
    this.id = String(id);
  }
  MockObjectId.isValid = jest.fn(() => true);
  return {
    Types: { ObjectId: MockObjectId },
    startSession: jest.fn(),
  };
});

jest.mock('./models/Student', () => ({
  findById: jest.fn(),
  findByIdAndUpdate: jest.fn(),
  updateOne: jest.fn(),
}));
jest.mock('./models/Enrollment', () => ({
  findOne: jest.fn(),
  find: jest.fn(),
  updateOne: jest.fn(),
  updateMany: jest.fn(),
  create: jest.fn(),
}));
jest.mock('./models/StudentBlockAssignment', () => ({
  find: jest.fn(),
  findOne: jest.fn(),
}));
jest.mock('./models/BlockSection', () => ({
  find: jest.fn(),
  findById: jest.fn(),
}));
jest.mock('./models/BlockGroup', () => ({
  find: jest.fn(),
  findById: jest.fn(),
}));

const Student = require('./models/Student');
const Enrollment = require('./models/Enrollment');
const StudentBlockAssignment = require('./models/StudentBlockAssignment');
const BlockSection = require('./models/BlockSection');
const BlockGroup = require('./models/BlockGroup');
const guard = require('./services/enrollmentGuard');

const SECTION_ID = 'section123456789012345678';
const GROUP_ID = 'group12345678901234567890';

const baseStudent = {
  _id: 'student123456789012345678',
  studentNumber: '2024-00001',
  course: 101,
  yearLevel: 1,
  semester: '1st',
  schoolYear: '2024-2025',
  lifecycleStatus: 'Pending',
};

const baseEnrollment = {
  _id: 'enrollment1234567890123',
  studentId: baseStudent._id,
  schoolYear: '2024-2025',
  semester: '1st',
  status: 'Pending',
  isCurrent: true,
};

const baseAssignment = {
  _id: 'assignment1234567890123',
  studentId: baseStudent._id,
  sectionId: SECTION_ID,
  semester: '1st',
  year: 2024,
  schoolYear: '2024-2025',
  status: 'ASSIGNED',
};

const baseSection = { _id: SECTION_ID, sectionCode: 'BEED-1A', blockGroupId: GROUP_ID };
const baseGroup = {
  _id: GROUP_ID,
  name: 'BEED-1',
  courseId: 101,
  yearLevel: 1,
  semester: '1st',
  schoolYear: '2024-2025',
};

function mockHappyPath() {
  Enrollment.findOne.mockReturnValue(mockChain(baseEnrollment));
  StudentBlockAssignment.find.mockReturnValue(mockChain([baseAssignment]));
  BlockSection.find.mockReturnValue(mockChain([baseSection]));
  BlockGroup.find.mockReturnValue(mockChain([baseGroup]));
}

beforeEach(() => {
  jest.resetAllMocks();
  // resetAllMocks() wipes mock implementations, including ObjectId.isValid.
  const mongoose = require('mongoose');
  mongoose.Types.ObjectId.isValid.mockReturnValue(true);
});

describe('assertEnrolledRequirements', () => {
  test('rejects ENROLLED when no block assignment exists', async () => {
    Enrollment.findOne.mockReturnValue(mockChain(baseEnrollment));
    StudentBlockAssignment.find.mockReturnValue(mockChain([]));

    await expect(guard.assertEnrolledRequirements(baseStudent)).rejects.toMatchObject({
      statusCode: 409,
    });
  });

  test('rejects ENROLLED when no enrollment record exists', async () => {
    Enrollment.findOne.mockReturnValue(mockChain(null));

    await expect(guard.assertEnrolledRequirements(baseStudent)).rejects.toMatchObject({
      statusCode: 409,
    });
    expect(StudentBlockAssignment.find).not.toHaveBeenCalled();
  });

  test('rejects ENROLLED when assignment is for a different semester', async () => {
    Enrollment.findOne.mockReturnValue(mockChain(baseEnrollment));
    StudentBlockAssignment.find.mockReturnValue(
      mockChain([{ ...baseAssignment, semester: '2nd', schoolYear: '2024-2025' }])
    );

    const err = await guard.assertEnrolledRequirements(baseStudent).catch((e) => e);
    expect(err.statusCode).toBe(409);
    expect(err.details.join(' ')).toMatch(/2nd|semester|academic period/i);
  });

  test('rejects ENROLLED when block program does not match student program', async () => {
    Enrollment.findOne.mockReturnValue(mockChain(baseEnrollment));
    StudentBlockAssignment.find.mockReturnValue(mockChain([baseAssignment]));
    BlockSection.find.mockReturnValue(mockChain([baseSection]));
    BlockGroup.find.mockReturnValue(mockChain([{ ...baseGroup, courseId: 201 }]));

    const err = await guard.assertEnrolledRequirements(baseStudent).catch((e) => e);
    expect(err.statusCode).toBe(409);
    expect(err.details.join(' ')).toMatch(/program/i);
  });

  test('rejects ENROLLED when block year level does not match', async () => {
    Enrollment.findOne.mockReturnValue(mockChain(baseEnrollment));
    StudentBlockAssignment.find.mockReturnValue(mockChain([baseAssignment]));
    BlockSection.find.mockReturnValue(mockChain([baseSection]));
    BlockGroup.find.mockReturnValue(mockChain([{ ...baseGroup, yearLevel: 2 }]));

    await expect(guard.assertEnrolledRequirements(baseStudent)).rejects.toMatchObject({
      statusCode: 409,
    });
  });

  test('rejects ENROLLED when school year is missing', async () => {
    await expect(
      guard.assertEnrolledRequirements({ ...baseStudent, schoolYear: '' })
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  test('accepts ENROLLED when enrollment + matching block assignment exist', async () => {
    mockHappyPath();

    const result = await guard.assertEnrolledRequirements(baseStudent);
    expect(result.enrollment).toMatchObject({ _id: baseEnrollment._id });
    expect(result.assignment).toMatchObject({ _id: baseAssignment._id });
    expect(result.section).toMatchObject({ sectionCode: 'BEED-1A' });
    expect(result.group).toMatchObject({ _id: GROUP_ID });
  });

  test('matches assignment school year derived from start-year `year`', async () => {
    Enrollment.findOne.mockReturnValue(mockChain(baseEnrollment));
    const { schoolYear, ...withoutExplicitYear } = baseAssignment;
    StudentBlockAssignment.find.mockReturnValue(mockChain([withoutExplicitYear]));
    BlockSection.find.mockReturnValue(mockChain([baseSection]));
    BlockGroup.find.mockReturnValue(mockChain([baseGroup]));

    const result = await guard.assertEnrolledRequirements(baseStudent);
    expect(result.assignment).toBeTruthy();
  });
});

describe('finalizeEnrollment', () => {
  test('flips enrollment and student to Enrolled atomically', async () => {
    mockHappyPath();
    Enrollment.updateMany.mockReturnValue(mockChain({ modifiedCount: 0 }));
    Enrollment.updateOne.mockReturnValue(mockChain({ modifiedCount: 1 }));

    const save = jest.fn().mockResolvedValue(true);
    const studentDoc = {
      ...baseStudent,
      section: '',
      toObject: () => ({ ...baseStudent, section: '' }),
      save,
    };
    Student.findById.mockReturnValue(studentDoc);

    const result = await guard.finalizeEnrollment({ studentId: baseStudent._id });

    expect(Enrollment.updateOne).toHaveBeenCalledWith(
      { _id: baseEnrollment._id },
      { $set: { status: 'Enrolled', isCurrent: true } }
    );
    expect(studentDoc.lifecycleStatus).toBe('Enrolled');
    expect(studentDoc.section).toBe('BEED-1A');
    expect(save).toHaveBeenCalled();
    expect(result.enrollmentId).toBe(baseEnrollment._id);
  });

  test('refuses to finalize when block assignment is missing', async () => {
    Enrollment.findOne.mockReturnValue(mockChain(baseEnrollment));
    StudentBlockAssignment.find.mockReturnValue(mockChain([]));
    Student.findById.mockReturnValue({
      ...baseStudent,
      toObject: () => ({ ...baseStudent }),
      save: jest.fn(),
    });

    await expect(
      guard.finalizeEnrollment({ studentId: baseStudent._id })
    ).rejects.toMatchObject({ statusCode: 409 });
    expect(Enrollment.updateOne).not.toHaveBeenCalled();
  });
});
