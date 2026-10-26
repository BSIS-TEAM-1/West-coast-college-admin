/**
 * Tests for applySectionScheduleDefaults — the TBA-aware schedule
 * inheritance for block assignments.
 *
 * When a student is newly assigned to a section, their enrollment subject
 * entries start as TBA. Schedules only live on the enrollment subject rows of
 * the students already in the section, so these tests pin down:
 *   - the section's dominant time/room/instructor is inherited per subject;
 *   - missing time stays 'TBA', missing room stays 'TBA';
 *   - real (non-TBA) values are never overwritten;
 *   - no peers → nothing is written;
 *   - the section can be looked up from the student's block assignment when
 *     it is not passed explicitly.
 *
 * Models are mocked following the project's jest conventions — no real data.
 */

jest.mock('./models/Enrollment', () => ({ find: jest.fn() }));
jest.mock('./models/Student', () => ({ find: jest.fn() }));
jest.mock('./models/Subject', () => ({ find: jest.fn() }));
jest.mock('./models/CurriculumSubject', () => ({ find: jest.fn() }));
jest.mock('./models/BlockGroup', () => ({ find: jest.fn() }));
jest.mock('./models/BlockSection', () => ({ find: jest.fn() }));
jest.mock('./models/BlockSubjectAssignment', () => ({ find: jest.fn(), deleteMany: jest.fn() }));
jest.mock('./models/StudentBlockAssignment', () => ({ find: jest.fn(), findOne: jest.fn() }));
jest.mock('./models/AuditLog', () => ({ create: jest.fn() }));
jest.mock('./services/enrollmentService', () => ({ resolveCurriculum: jest.fn(), createOrReactivateEnrollment: jest.fn() }));
jest.mock('./services/enrollmentImmutabilityGuard', () => ({ assertEnrollmentMutable: jest.fn() }));
jest.mock('./services/enrollmentGuard', () => ({ assignmentSchoolYear: jest.fn() }));
jest.mock('./services/blockTerm', () => ({ normalizeSchoolYear: jest.fn() }));
jest.mock('./lib/curriculumYears', () => ({ SEMESTERS: ['1st', '2nd', 'Summer'] }));

const Enrollment = require('./models/Enrollment');
const StudentBlockAssignment = require('./models/StudentBlockAssignment');
const { applySectionScheduleDefaults } = require('./services/subjectEnrollmentService');

const SY = '2021-2022';
const SEM = '1st';

const chain = (resolveValue) => {
  const chainable = {
    session: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    sort: jest.fn().mockReturnThis(),
    lean: jest.fn(async () => resolveValue),
  };
  chainable.then = Promise.resolve(resolveValue).then.bind(Promise.resolve(resolveValue));
  return chainable;
};

const makeEnrollmentDoc = (subjects, overrides = {}) => ({
  studentId: 'stu1',
  studentNumber: '2025-101-001',
  schoolYear: SY,
  semester: SEM,
  subjects,
  ...overrides,
  markModified: jest.fn(),
  save: jest.fn(async () => ({})),
});

beforeEach(() => {
  jest.clearAllMocks();
});

describe('applySectionScheduleDefaults', () => {
  test('inherits the section schedule/room/instructor for TBA entries', async () => {
    StudentBlockAssignment.findOne.mockImplementation(() => chain({ _id: 'a1', sectionId: 'sec1' }));
    StudentBlockAssignment.find.mockImplementation(() => chain([
      { studentId: 'stu1' },
      { studentId: 'peer1' },
      { studentId: 'peer2' },
    ]));
    Enrollment.find.mockImplementation(() => chain([
      { subjects: [{ subjectId: 'subj1', schedule: 'MWF 08:00-09:00', room: 'R201', instructor: 'Prof Cruz' }] },
      { subjects: [{ subjectId: 'subj1', schedule: 'MWF 08:00-09:00', room: 'R201', instructor: 'Prof Cruz' }] },
    ]));

    const enrollment = makeEnrollmentDoc([
      { subjectId: 'subj1', code: 'ENG-1', schedule: 'TBA', room: 'TBA', instructor: 'TBA', status: 'Enrolled' },
    ]);

    await applySectionScheduleDefaults({ enrollment });

    expect(enrollment.subjects[0].schedule).toBe('MWF 08:00-09:00');
    expect(enrollment.subjects[0].room).toBe('R201');
    expect(enrollment.subjects[0].instructor).toBe('Prof Cruz');
    expect(enrollment.save).toHaveBeenCalledTimes(1);
  });

  test('keeps TBA when the section has no peer schedule data', async () => {
    StudentBlockAssignment.findOne.mockImplementation(() => chain(null));
    StudentBlockAssignment.find.mockImplementation(() => chain([
      { studentId: 'stu1' },
      { studentId: 'peer1' },
    ]));
    Enrollment.find.mockImplementation(() => chain([
      { subjects: [{ subjectId: 'subj1', schedule: 'TBA', room: '', instructor: 'TBA' }] },
    ]));

    const enrollment = makeEnrollmentDoc([
      { subjectId: 'subj1', schedule: 'TBA', room: 'TBA', instructor: 'TBA', status: 'Enrolled' },
    ]);

    await applySectionScheduleDefaults({ enrollment });

    expect(enrollment.subjects[0].schedule).toBe('TBA');
    expect(enrollment.subjects[0].room).toBe('TBA');
    expect(enrollment.subjects[0].instructor).toBe('TBA');
    expect(enrollment.save).not.toHaveBeenCalled();
  });

  test('never overwrites real values and fills only the missing fields', async () => {
    StudentBlockAssignment.findOne.mockImplementation(() => chain({ sectionId: 'sec1' }));
    StudentBlockAssignment.find.mockImplementation(() => chain([{ studentId: 'stu1' }, { studentId: 'peer1' }]));
    Enrollment.find.mockImplementation(() => chain([
      { subjects: [{ subjectId: 'subj1', schedule: 'TTH 13:00-14:30', room: 'R305', instructor: 'Prof Cruz' }] },
    ]));

    const enrollment = makeEnrollmentDoc([
      { subjectId: 'subj1', schedule: 'M-F 07:00-08:00', room: 'TBA', instructor: 'TBA', status: 'Enrolled' },
    ]);

    await applySectionScheduleDefaults({ enrollment });

    expect(enrollment.subjects[0].schedule).toBe('M-F 07:00-08:00'); // untouched
    expect(enrollment.subjects[0].room).toBe('R305');
    expect(enrollment.subjects[0].instructor).toBe('Prof Cruz');
    expect(enrollment.save).toHaveBeenCalledTimes(1);
  });

  test('returns without writing when the student is the only one in the section', async () => {
    StudentBlockAssignment.findOne.mockImplementation(() => chain({ sectionId: 'sec1' }));
    StudentBlockAssignment.find.mockImplementation(() => chain([{ studentId: 'stu1' }]));

    const enrollment = makeEnrollmentDoc([
      { subjectId: 'subj1', schedule: 'TBA', room: 'TBA', instructor: 'TBA', status: 'Enrolled' },
    ]);

    await applySectionScheduleDefaults({ enrollment, sectionId: 'sec1' });

    expect(Enrollment.find).not.toHaveBeenCalled();
    expect(enrollment.save).not.toHaveBeenCalled();
    expect(enrollment.subjects[0].schedule).toBe('TBA');
  });

  test('looks up the section from the block assignment when sectionId is omitted', async () => {
    StudentBlockAssignment.findOne.mockImplementation((filter) => {
      expect(filter.studentId).toBe('stu1');
      expect(filter.semester).toBe(SEM);
      return chain({ sectionId: 'sec_from_assignment' });
    });
    StudentBlockAssignment.find.mockImplementation((filter) => {
      expect(filter.sectionId).toBe('sec_from_assignment');
      return chain([{ studentId: 'stu1' }, { studentId: 'peer1' }]);
    });
    Enrollment.find.mockImplementation(() => chain([
      { subjects: [{ subjectId: 'subj1', schedule: 'MWF 10:00-11:00', room: 'R101', instructor: 'Prof Reyes' }] },
    ]));

    const enrollment = makeEnrollmentDoc([
      { subjectId: 'subj1', schedule: 'TBA', room: 'TBA', instructor: 'TBA', status: 'Enrolled' },
    ]);

    await applySectionScheduleDefaults({ enrollment });

    expect(enrollment.subjects[0].schedule).toBe('MWF 10:00-11:00');
    expect(enrollment.subjects[0].room).toBe('R101');
    expect(enrollment.subjects[0].instructor).toBe('Prof Reyes');
  });

  test('falls back to TBA gracefully when the lookup throws', async () => {
    StudentBlockAssignment.findOne.mockImplementation(() => { throw new Error('boom'); });

    const enrollment = makeEnrollmentDoc([
      { subjectId: 'subj1', schedule: 'TBA', room: 'TBA', instructor: 'TBA', status: 'Enrolled' },
    ]);

    await expect(applySectionScheduleDefaults({ enrollment, sectionId: 'secX' })).resolves.toBeUndefined();
    expect(enrollment.save).not.toHaveBeenCalled();
  });
});
