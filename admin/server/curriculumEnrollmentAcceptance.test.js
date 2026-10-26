/**
 * Full acceptance suite for curriculum / block / individual-enrollment
 * independence (requirements A–F).
 *
 * What is being proven:
 *   A. Curriculum   — a curriculum shows every supported year and semester
 *                     before anything is placed; in-use versions stay immutable.
 *   B. Blocks       — a block receives the requirements for its own program and
 *                     cohort, and is told when the curriculum has nothing for it.
 *   C. Enrollment   — subject enrollments are separate records, generated from
 *                     the curriculum and validated (offerings, prerequisites,
 *                     duplicates, standing) before they are written.
 *   D. Drop/Retake  — a dropped attempt is preserved, a retake is a new record
 *                     in a later term, and neither year level nor block moves.
 *   E. Evaluation   — requirement status, retake reconciliation, progression and
 *                     graduation come from the curriculum, not the block label.
 *   F. Persistence  — writes land on the record a re-read would return, and
 *                     locked history rejects changes.
 *
 * Models are mocked so the suite runs offline; the business rules under test
 * are the real controller and service code.
 */

const CurriculumController = require('./controllers/curriculumController');
const CurriculumSubjectController = require('./controllers/curriculumSubjectController');
const blockController = require('./controllers/blockController');
const EnrollmentManagementController = require('./controllers/enrollmentManagementController');
const subjectEnrollmentService = require('./services/subjectEnrollmentService');
const curriculumProgressService = require('./services/curriculumProgressService');
const { autoAssignSubjectsFromCurriculum } = require('./services/blockSubjectAutoAssignService');
const { SUPPORTED_YEAR_LEVELS } = require('./lib/curriculumYears');

jest.mock('./models/Student', () => ({
  find: jest.fn(),
  findById: jest.fn(),
  findOne: jest.fn(),
  updateOne: jest.fn(),
  updateMany: jest.fn(),
  create: jest.fn(),
  countDocuments: jest.fn(),
  exists: jest.fn(),
}));

jest.mock('./models/Enrollment', () => ({
  find: jest.fn(),
  findById: jest.fn(),
  findOne: jest.fn(),
  updateOne: jest.fn(),
  create: jest.fn(),
  countDocuments: jest.fn(),
  exists: jest.fn(),
}));

jest.mock('./models/Curriculum', () => ({
  find: jest.fn(),
  findById: jest.fn(),
  findOne: jest.fn(),
  exists: jest.fn(),
  countDocuments: jest.fn(),
  updateOne: jest.fn(),
}));

jest.mock('./models/CurriculumSubject', () => ({
  find: jest.fn(),
  findById: jest.fn(),
  findOne: jest.fn(),
  countDocuments: jest.fn(),
  create: jest.fn(),
  findByIdAndDelete: jest.fn(),
  deleteMany: jest.fn(),
}));

jest.mock('./models/Subject', () => ({
  find: jest.fn(),
  findById: jest.fn(),
}));

jest.mock('./models/BlockGroup', () => ({
  find: jest.fn(),
  findById: jest.fn(),
  exists: jest.fn(),
  create: jest.fn(),
  countDocuments: jest.fn(),
}));

jest.mock('./models/BlockSection', () => ({
  find: jest.fn(),
  findById: jest.fn(),
}));

jest.mock('./models/BlockSubjectAssignment', () => ({
  find: jest.fn(),
  countDocuments: jest.fn(),
  create: jest.fn(),
  insertMany: jest.fn(),
  deleteMany: jest.fn(),
}));

jest.mock('./models/StudentBlockAssignment', () => ({
  find: jest.fn(),
  create: jest.fn(),
  updateOne: jest.fn(),
  deleteMany: jest.fn(),
  countDocuments: jest.fn(),
}));

jest.mock('./models/AuditLog', () => ({
  create: jest.fn(),
}));

const Student = require('./models/Student');
const Enrollment = require('./models/Enrollment');
const Curriculum = require('./models/Curriculum');
const CurriculumSubject = require('./models/CurriculumSubject');
const Subject = require('./models/Subject');
const BlockGroup = require('./models/BlockGroup');
const BlockSection = require('./models/BlockSection');
const BlockSubjectAssignment = require('./models/BlockSubjectAssignment');
const StudentBlockAssignment = require('./models/StudentBlockAssignment');
const AuditLog = require('./models/AuditLog');

// ─── Fixture identifiers (valid 24-hex so mongoose.isValidObjectId passes) ───
const ADMIN_ID = '64b0000000000000000000a1';
const STUDENT_ID = '64b000000000000000000001';
const CURRICULUM_ID = '64b000000000000000000002';
const S_FIL = '64b000000000000000000011';
const S_ENG = '64b000000000000000000012';
const S_MAT = '64b000000000000000000013';
const S_SCI = '64b000000000000000000014';
const GROUP_ID = '64b000000000000000000021';
const SECTION_ID = '64b000000000000000000022';
const ENR_ORIGINAL = '64b000000000000000000031';
const ENR_NEW_TERM = '64b000000000000000000032';

const TERM_1 = { schoolYear: '2026-2027', semester: '1st' };
const TERM_2 = { schoolYear: '2027-2028', semester: '1st' };

const SUBJECTS = [
  { _id: S_FIL, code: 'FIL101', title: 'Purposive Communication', units: 3, isActive: true, status: 'Active', prerequisiteSubjectIds: [] },
  { _id: S_ENG, code: 'ENG101', title: 'The Life & Works of Rizal', units: 3, isActive: true, status: 'Active', prerequisiteSubjectIds: [] },
  { _id: S_MAT, code: 'MATH101', title: 'Mathematics in the Modern World', units: 3, isActive: true, status: 'Active', prerequisiteSubjectIds: [S_FIL] },
  { _id: S_SCI, code: 'SCI201', title: 'Science, Technology & Society', units: 3, isActive: true, status: 'Active', prerequisiteSubjectIds: [S_FIL] },
  { _id: '64b000000000000000000077', code: 'DEAD101', title: 'Discontinued Course', units: 3, isActive: false, status: 'Inactive', prerequisiteSubjectIds: [] },
];

const PLACEMENTS = [
  { _id: '64b000000000000000000041', curriculumId: CURRICULUM_ID, subjectId: S_FIL, courseNo: 'FIL101', descriptiveTitle: 'Purposive Communication', units: 3, lecturePeriods: 3, labPeriods: 0, isRequired: true, type: 'General', yearLevel: 1, semester: '1st', displayOrder: 1, prerequisiteSubjectIds: [] },
  { _id: '64b000000000000000000042', curriculumId: CURRICULUM_ID, subjectId: S_ENG, courseNo: 'ENG101', descriptiveTitle: 'The Life & Works of Rizal', units: 3, lecturePeriods: 3, labPeriods: 0, isRequired: true, type: 'General', yearLevel: 1, semester: '1st', displayOrder: 2, prerequisiteSubjectIds: [] },
  { _id: '64b000000000000000000043', curriculumId: CURRICULUM_ID, subjectId: S_MAT, courseNo: 'MATH101', descriptiveTitle: 'Mathematics in the Modern World', units: 3, lecturePeriods: 3, labPeriods: 0, isRequired: true, type: 'General', yearLevel: 1, semester: '1st', displayOrder: 3, prerequisiteSubjectIds: [S_FIL] },
  { _id: '64b000000000000000000044', curriculumId: CURRICULUM_ID, subjectId: S_SCI, courseNo: 'SCI201', descriptiveTitle: 'Science, Technology & Society', units: 3, lecturePeriods: 3, labPeriods: 0, isRequired: true, type: 'General', yearLevel: 2, semester: '1st', displayOrder: 1, prerequisiteSubjectIds: [S_FIL] },
];

const STUDENT = {
  _id: STUDENT_ID,
  studentNumber: '2026-101-0001',
  firstName: 'Ana',
  lastName: 'Cruz',
  course: 101,
  curriculumVersion: '2026',
  yearLevel: 1,
  schoolYear: TERM_1.schoolYear,
  semester: TERM_1.semester,
  lifecycleStatus: 'Enrolled',
  studentStatus: 'Active',
  isActive: true,
};

const ACTIVE_ASSIGNMENT = {
  _id: '64b000000000000000000051',
  studentId: STUDENT_ID,
  sectionId: SECTION_ID,
  status: 'ASSIGNED',
  semester: '1st',
  schoolYear: '2026-2027',
  year: '2026-2027',
};

const TERM_GROUP = {
  _id: GROUP_ID,
  curriculumId: CURRICULUM_ID,
  yearLevel: 1,
  semester: '1st',
  schoolYear: '2026-2027',
  year: '2026-2027',
  name: 'BEED-1-A',
};

const TERM_SECTION = { _id: SECTION_ID, sectionCode: 'A', blockGroupId: GROUP_ID };

/** Mutable per-test enrollment history shared by the Enrollment mocks. */
let history = [];
/** Mutable per-test block offerings for the term. */
let offerings = [];

// ─── Mock plumbing ──────────────────────────────────────────────────────────

function chain(raw, populated) {
  const c = {};
  let current = raw;
  const populatedValue = populated === undefined ? raw : populated;

  ['select', 'sort', 'skip', 'limit', 'session', 'where', 'populateOne'].forEach((name) => {
    c[name] = jest.fn(() => c);
  });
  c.populate = jest.fn(() => {
    current = populatedValue;
    return c;
  });
  c.lean = jest.fn(() => c);
  c.exec = jest.fn(() => Promise.resolve(current));
  c.then = (onOk, onErr) => Promise.resolve(current).then(onOk, onErr);
  c.catch = (fn) => Promise.resolve(current).catch(fn);
  c.finally = (fn) => Promise.resolve(current).finally(fn);
  return c;
}

function matchCond(value, cond) {
  if (cond === undefined) return true;
  if (cond !== null && typeof cond === 'object' && !Array.isArray(cond)) {
    if ('$in' in cond) return (cond.$in || []).some((v) => String(v) === String(value));
    if ('$ne' in cond) return String(value) !== String(cond.$ne);
    if ('$exists' in cond) {
      const present = value !== undefined && value !== null;
      return cond.$exists ? present : !present;
    }
    return false;
  }
  if (cond === null) return value === null || value === undefined;
  return String(value) === String(cond);
}

function populatedSubject(subjectId) {
  const subject = SUBJECTS.find((s) => String(s._id) === String(subjectId));
  return subject ? { ...subject } : subjectId;
}

function makeDoc(obj) {
  return {
    ...obj,
    save: jest.fn().mockResolvedValue(obj),
    markModified: jest.fn(),
  };
}

function targetEnrollment(overrides = {}) {
  return makeDoc({
    _id: ENR_ORIGINAL,
    studentId: STUDENT_ID,
    studentNumber: STUDENT.studentNumber,
    curriculumId: CURRICULUM_ID,
    yearLevel: STUDENT.yearLevel,
    status: 'Enrolled',
    isCurrent: true,
    lockedAt: null,
    subjects: [],
    ...TERM_1,
    ...overrides,
  });
}

function mockRes() {
  const res = {
    statusCode: 200,
    body: null,
    status: jest.fn(function status(code) {
      res.statusCode = code;
      return res;
    }),
    json: jest.fn(function json(payload) {
      res.body = payload;
      return res;
    }),
  };
  return res;
}

function mockReq(overrides = {}) {
  return {
    params: {},
    query: {},
    body: {},
    adminId: ADMIN_ID,
    accountType: 'registrar',
    ...overrides,
  };
}

function configureModelMocks() {
  Student.updateOne = jest.fn().mockResolvedValue({ modifiedCount: 1 });
  // dropSubjectFromEnrollment updates the student's standing via
  // findByIdAndUpdate; the mock must cover both so the drop path can run.
  Student.findByIdAndUpdate = jest.fn().mockResolvedValue({ matchedCount: 1, modifiedCount: 1 });
  Student.findById = jest.fn().mockImplementation(() => chain({ ...STUDENT }));

  Enrollment.find = jest.fn().mockImplementation((filter = {}) => {
    const matches = history.filter((e) => {
      if (!matchCond(e.studentId, filter.studentId)) return false;
      if (filter.schoolYear !== undefined && e.schoolYear !== filter.schoolYear) return false;
      if (filter.semester !== undefined && e.semester !== filter.semester) return false;
      if (filter.lockedAt !== undefined && !matchCond(e.lockedAt ?? null, filter.lockedAt)) return false;
      return true;
    });
    return chain(matches);
  });
  Enrollment.findOne = jest.fn().mockImplementation((filter = {}) => {
    const found = history.find(
      (e) => matchCond(e.studentId, filter.studentId)
        && (!filter.schoolYear || e.schoolYear === filter.schoolYear)
        && (!filter.semester || e.semester === filter.semester)
    );
    return chain(found || null);
  });
  Enrollment.findById = jest.fn().mockImplementation((id) => {
    const found = history.find((e) => String(e._id) === String(id));
    return chain(found || null);
  });
  Enrollment.create = jest.fn().mockImplementation(async (docs) => {
    const list = Array.isArray(docs) ? docs : [docs];
    return list.map((doc) => makeDoc({ _id: ENR_NEW_TERM, ...doc }));
  });
  Enrollment.updateOne = jest.fn().mockResolvedValue({ modifiedCount: 1 });
  Enrollment.exists = jest.fn().mockResolvedValue(null);

  Curriculum.findById = jest.fn().mockImplementation(() =>
    chain({ _id: CURRICULUM_ID, name: 'BEED 2026', programCode: 101, programName: 'BEED', version: '2026', status: 'Active' })
  );
  Curriculum.findOne = jest.fn().mockImplementation((filter = {}) => {
    if (filter.status === 'Active' || filter.version) {
      return chain({ _id: CURRICULUM_ID, programCode: filter.programCode ?? 101, version: '2026', status: 'Active' });
    }
    return chain(null);
  });

  CurriculumSubject.find = jest.fn().mockImplementation((filter = {}) => {
    const raw = PLACEMENTS.filter((p) => matchCond(p.curriculumId, filter.curriculumId)
      && matchCond(p.yearLevel, filter.yearLevel)
      && matchCond(p.semester, filter.semester)
      && matchCond(p.isRequired, filter.isRequired)
      && matchCond(p.subjectId, filter.subjectId));
    const populated = raw.map((p) => ({ ...p, subjectId: populatedSubject(p.subjectId) }));
    return chain(raw, populated);
  });

  Subject.find = jest.fn().mockImplementation((filter = {}) => {
    const list = SUBJECTS.filter((s) => {
      if (!filter._id || !('$in' in (filter._id || {}))) return true;
      return matchCond(s._id, filter._id);
    });
    return chain(list);
  });

  BlockGroup.find = jest.fn().mockImplementation((filter = {}) => {
    const list = [TERM_GROUP].filter((g) => {
      if (!matchCond(g.semester, filter.semester)) return false;
      if (!matchCond(g.curriculumId, filter.curriculumId)) return false;
      if (Array.isArray(filter.$or)) {
        return filter.$or.some((clause) =>
          Object.entries(clause).every(([k, v]) => matchCond(g[k], v))
        );
      }
      return true;
    });
    return chain(list);
  });
  BlockGroup.findById = jest.fn().mockImplementation(() => chain({ ...TERM_GROUP }));
  BlockGroup.exists = jest.fn().mockResolvedValue(null);

  BlockSection.find = jest.fn().mockImplementation(() => chain([{ ...TERM_SECTION }]));

  BlockSubjectAssignment.find = jest.fn().mockImplementation(() => chain(offerings));
  BlockSubjectAssignment.insertMany = jest.fn().mockImplementation(async (docs) => docs);
  BlockSubjectAssignment.deleteMany = jest.fn().mockResolvedValue({ deletedCount: 0 });
  BlockSubjectAssignment.countDocuments = jest.fn().mockResolvedValue(0);

  StudentBlockAssignment.find = jest.fn().mockImplementation((filter = {}) => {
    const list = [ACTIVE_ASSIGNMENT].filter((a) => matchCond(a.studentId, filter.studentId)
      && matchCond(a.status, filter.status));
    return chain(list);
  });
  StudentBlockAssignment.create = jest.fn();
  StudentBlockAssignment.updateOne = jest.fn();
  StudentBlockAssignment.deleteMany = jest.fn();

  AuditLog.create = jest.fn().mockResolvedValue({});
}

beforeEach(() => {
  jest.resetAllMocks();
  history = [];
  offerings = [
    { blockSectionId: SECTION_ID, subjectId: S_FIL, semester: '1st', academicYear: '2026-2027' },
    { blockSectionId: SECTION_ID, subjectId: S_ENG, semester: '1st', academicYear: '2026-2027' },
    { blockSectionId: SECTION_ID, subjectId: S_MAT, semester: '1st', academicYear: '2026-2027' },
  ];
  configureModelMocks();
});

// ─── A. Curriculum management ───────────────────────────────────────────────

describe('A. Curriculum management', () => {
  test('a new curriculum displays every supported year level and semester before subjects are added', async () => {
    CurriculumSubject.find.mockImplementation(() => chain([], []));

    const res = mockRes();
    await CurriculumSubjectController.getStructure(mockReq({ params: { id: CURRICULUM_ID } }), res);

    expect(res.statusCode).toBe(200);
    const { years, summary } = res.body.data;
    expect(years.map((y) => y.yearLevel)).toEqual([...SUPPORTED_YEAR_LEVELS]);
    for (const year of years) {
      expect(year.semesters.map((s) => s.semester)).toEqual(['1st', '2nd', 'Summer']);
      for (const semester of year.semesters) {
        expect(semester.subjects).toEqual([]);
      }
    }
    expect(summary.totalSubjects).toBe(0);
    expect(summary.yearsCovered).toBe(0);
    expect(summary.yearsSupported).toBe(SUPPORTED_YEAR_LEVELS.length);
  });

  test('years covered still counts only the years that actually hold subjects', async () => {
    const res = mockRes();
    await CurriculumSubjectController.getStructure(mockReq({ params: { id: CURRICULUM_ID } }), res);

    const { years, summary } = res.body.data;
    expect(years).toHaveLength(SUPPORTED_YEAR_LEVELS.length);
    expect(summary.yearsCovered).toBe(2);
    expect(summary.totalSubjects).toBe(4);
    expect(years.find((y) => y.yearLevel === 1).semesters[0].subjects).toHaveLength(3);
    expect(years.find((y) => y.yearLevel === 2).semesters[0].subjects).toHaveLength(1);
  });

  test('an in-use curriculum version cannot be silently rewritten', async () => {
    const curriculum = {
      _id: CURRICULUM_ID,
      status: 'Active',
      programCode: 101,
      version: '2026',
      save: jest.fn(),
    };
    Curriculum.findById.mockImplementation(() => chain(curriculum));
    Enrollment.exists.mockResolvedValue({ _id: ENR_ORIGINAL });

    const res = mockRes();
    await CurriculumController.updateCurriculum(
      mockReq({ params: { id: CURRICULUM_ID }, body: { version: '2027' } }),
      res
    );

    expect(res.statusCode).toBe(409);
    expect(res.body.message).toMatch(/already used by enrollment records/);
    expect(curriculum.version).toBe('2026');
    expect(curriculum.save).not.toHaveBeenCalled();
  });

  test('removing a curriculum subject never touches a locked historical enrollment', async () => {
    Curriculum.findById.mockImplementation(() => chain({ _id: CURRICULUM_ID, status: 'Active' }));
    CurriculumSubject.findByIdAndDelete.mockResolvedValue({
      _id: '64b000000000000000000041',
      curriculumId: CURRICULUM_ID,
      subjectId: S_FIL,
      courseNo: 'FIL101',
      yearLevel: 1,
      semester: '1st',
    });
    BlockSection.find.mockImplementation(() => chain([{ _id: SECTION_ID }]));
    StudentBlockAssignment.find.mockImplementation(() =>
      chain([{ studentId: STUDENT_ID, sectionId: SECTION_ID, status: 'ASSIGNED', semester: '1st', year: '2026-2027' }])
    );

    const res = mockRes();
    await CurriculumSubjectController.removeSubject(
      mockReq({ params: { id: CURRICULUM_ID, curriculumSubjectId: '64b000000000000000000041' } }),
      res
    );

    expect(res.statusCode).toBe(200);

    const enrollmentFilter = Enrollment.find.mock.calls[0][0];
    // Locked (historical) records are excluded at the query itself.
    expect(enrollmentFilter.lockedAt).toBeNull();

    // The change is recorded rather than applied silently.
    expect(AuditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ resourceType: 'CURRICULUM', action: 'DELETE' })
    );
  });
});

// ─── B. Block management ────────────────────────────────────────────────────

describe('B. Block management', () => {
  test('a block receives the curriculum requirements for its own program and year level', async () => {
    const group = { ...TERM_GROUP, yearLevel: 2 };
    const sections = [{ _id: SECTION_ID, sectionCode: 'A' }];

    const result = await autoAssignSubjectsFromCurriculum(group, sections, ADMIN_ID);

    expect(result.created).toBe(1);
    const inserted = BlockSubjectAssignment.insertMany.mock.calls[0][0];
    expect(inserted).toHaveLength(1);
    expect(inserted[0]).toEqual(expect.objectContaining({
      subjectId: S_SCI,
      semester: '1st',
      academicYear: '2026-2027',
    }));
    // Year 1 placements must not leak into a Year 2 block.
    expect(inserted.map((d) => String(d.subjectId))).not.toContain(S_FIL);
  });

  test('a block is told when its curriculum has nothing placed for its cohort', async () => {
    CurriculumSubject.countDocuments.mockResolvedValue(0);
    const emptyFit = await blockController.evaluateCurriculumFit(CURRICULUM_ID, 3, '1st');
    expect(emptyFit.expectedSubjectCount).toBe(0);
    expect(emptyFit.warning).toMatch(/no subjects placed at Year 3/);

    CurriculumSubject.countDocuments.mockResolvedValue(2);
    const fitted = await blockController.evaluateCurriculumFit(CURRICULUM_ID, 1, '1st');
    expect(fitted.expectedSubjectCount).toBe(2);
    expect(fitted.warning).toBeNull();
  });

  test('a curriculum from another program is rejected when creating a block', async () => {
    Curriculum.findById.mockImplementation(() =>
      chain({ _id: CURRICULUM_ID, programCode: 102, status: 'Active' })
    );

    const res = mockRes();
    await blockController.createBlockGroup(mockReq({
      body: { name: 'BEED-1-A', semester: '1st', year: '2026-2027', courseId: 101, curriculumId: CURRICULUM_ID },
    }), res);

    expect(res.statusCode).toBe(400);
    expect(res.body.error).toMatch(/does not belong to the selected program/);
    expect(BlockGroup.create).not.toHaveBeenCalled();
  });

  test('an archived curriculum cannot back a new block', async () => {
    Curriculum.findById.mockImplementation(() =>
      chain({ _id: CURRICULUM_ID, programCode: 101, status: 'Archived' })
    );

    const res = mockRes();
    await blockController.createBlockGroup(mockReq({
      body: { name: 'BEED-1-A', semester: '1st', year: '2026-2027', courseId: 101, curriculumId: CURRICULUM_ID },
    }), res);

    expect(res.statusCode).toBe(400);
    expect(res.body.error).toMatch(/read-only/);
  });

  test('a matching curriculum is accepted and the cohort fit is reported back', async () => {
    Curriculum.findById.mockImplementation(() =>
      chain({ _id: CURRICULUM_ID, programCode: 101, status: 'Active' })
    );
    CurriculumSubject.countDocuments.mockResolvedValue(0);
    BlockGroup.find.mockImplementation(() => chain([]));
    BlockGroup.create.mockResolvedValue({ toObject: () => ({ _id: GROUP_ID, name: 'BEED-1-A' }) });

    const res = mockRes();
    await blockController.createBlockGroup(mockReq({
      body: { name: 'BEED-1-A', semester: '1st', year: '2026-2027', courseId: 101, yearLevel: 1, curriculumId: CURRICULUM_ID },
    }), res);

    expect(res.statusCode).toBe(201);
    expect(res.body.curriculumFit.curriculumId).toBe(CURRICULUM_ID);
    expect(res.body.curriculumFit.programMatches).toBe(true);
    expect(res.body.curriculumFit.warning).toMatch(/no subjects placed/);
  });
});

// ─── C. Individual subject enrollment ───────────────────────────────────────

describe('C. Student subject enrollment', () => {
  test('block finalization fills a pre-existing empty enrollment from its curriculum', async () => {
    const enrollment = targetEnrollment({ subjects: [] });
    Enrollment.findById.mockImplementation(() => chain(enrollment));

    const outcome = await subjectEnrollmentService.autoAssignCurriculumSubjects({
      enrollmentId: enrollment._id,
      curriculumId: CURRICULUM_ID,
      actorId: ADMIN_ID,
    });

    expect(outcome.added.map((entry) => entry.code)).toEqual(['FIL101', 'ENG101', 'MATH101']);
    expect(enrollment.subjects.map((entry) => entry.code)).toEqual(['FIL101', 'ENG101', 'MATH101']);
    expect(enrollment.save).toHaveBeenCalled();
  });

  test('suggested subjects come from the applicable curriculum for the year level and semester', async () => {
    const result = await subjectEnrollmentService.resolveSuggestedSubjects({
      programCode: 101,
      curriculumVersion: '2026',
      yearLevel: 1,
      semester: '1st',
    });

    expect(result.curriculumId).toBe(CURRICULUM_ID);
    expect(result.source).toBe('version');
    expect(result.subjects.map((s) => s.code)).toEqual(['FIL101', 'ENG101', 'MATH101']);
    // MATH101 has FIL101 as a prerequisite at the subject level, not at the placement level
    expect(result.subjects.find((s) => s.code === 'MATH101').prerequisiteSubjectIds).toEqual([S_FIL]);
    // Nothing is suggested for a year the curriculum has not populated yet.
    const emptyYear = await subjectEnrollmentService.resolveSuggestedSubjects({
      programCode: 101,
      curriculumVersion: '2026',
      yearLevel: 4,
      semester: '1st',
    });
    expect(emptyYear.subjects).toEqual([]);
  });

  test('a regular student can enroll in eligible subjects offered for their term', async () => {
    const enrollment = targetEnrollment();
    const validation = await subjectEnrollmentService.validateSubjectSelection({
      student: STUDENT,
      enrollment,
      subjectIds: [S_FIL, S_ENG],
    });

    expect(validation.failedIds).toEqual([]);
    expect(validation.okIds).toHaveLength(2);
    expect(validation.results.every((r) => r.requiresOverride === false)).toBe(true);
    // Offered by the student's own block, so nothing is flagged as a deviation.
    expect(validation.results.every((r) => r.offeredOutsideBlock === false)).toBe(true);
  });

  test('subjects offered by another section are allowed and flagged, not blocked', async () => {
    const enrollment = targetEnrollment();
    // The block no longer carries ENG, but another section of the same term does.
    offerings = [{ blockSectionId: '64b000000000000000000023', subjectId: S_ENG, semester: '1st', academicYear: '2026-2027' }];

    const validation = await subjectEnrollmentService.validateSubjectSelection({
      student: STUDENT,
      enrollment,
      subjectIds: [S_ENG],
    });

    expect(validation.okIds).toEqual([S_ENG]);
    expect(validation.results[0].offeredOutsideBlock).toBe(true);
  });

  test('prerequisites are validated and require a written registrar override', async () => {
    // Use year 2 semester 1 enrollment to test prerequisites (year 1 semester 1 skips prereq validation)
    const enrollment = targetEnrollment({ yearLevel: 2 });

    const validation = await subjectEnrollmentService.validateSubjectSelection({
      student: STUDENT,
      enrollment,
      subjectIds: [S_SCI],
    });
    expect(validation.results[0].reasonCode).toBe(subjectEnrollmentService.REASON.PREREQUISITE_NOT_MET);
    expect(validation.results[0].requiresOverride).toBe(true);
    expect(validation.results[0].message).toMatch(/FIL101/);

    const withoutOverride = await subjectEnrollmentService.addSubjectsToEnrollment({
      enrollment,
      student: STUDENT,
      subjectIds: [S_SCI],
      actorId: ADMIN_ID,
    });
    expect(withoutOverride.added).toHaveLength(0);
    expect(withoutOverride.failed[0].reasonCode).toBe('OVERRIDE_REQUIRED');

    const withOverride = await subjectEnrollmentService.addSubjectsToEnrollment({
      enrollment,
      student: STUDENT,
      subjectIds: [S_SCI],
      actorId: ADMIN_ID,
      overrideReason: 'Dean approved a corequisite arrangement for the term.',
    });
    expect(withOverride.added).toHaveLength(1);
    expect(enrollment.subjects[0].overrideReason).toMatch(/Dean approved/);
    expect(enrollment.subjects[0].overriddenBy).toBe(ADMIN_ID);
  });

  test('prerequisites are skipped for year 1 semester 1', async () => {
    const enrollment = targetEnrollment({ yearLevel: 1 });

    // Even though MATH101 has FIL101 as a prerequisite at the subject level,
    // year 1 semester 1 should skip prerequisite validation
    const validation = await subjectEnrollmentService.validateSubjectSelection({
      student: STUDENT,
      enrollment,
      subjectIds: [S_MAT],
    });
    expect(validation.okIds).toEqual([S_MAT]);
    expect(validation.results[0].ok).toBe(true);
    expect(validation.results[0].requiresOverride).toBe(false);
  });

  test('an unauthorized duplicate enrollment in the same term is prevented', async () => {
    const enrollment = targetEnrollment({ subjects: [{ subjectId: S_FIL, code: 'FIL101', status: 'Enrolled' }] });
    history = [{ ...enrollment }];

    const validation = await subjectEnrollmentService.validateSubjectSelection({
      student: STUDENT,
      enrollment,
      subjectIds: [S_FIL],
    });

    expect(validation.okIds).toEqual([]);
    expect(validation.results[0].reasonCode).toBe(subjectEnrollmentService.REASON.DUPLICATE_ACTIVE);
    expect(validation.results[0].requiresOverride).toBe(false);
    expect(validation.results[0].message).toMatch(/already/);

    const outcome = await subjectEnrollmentService.addSubjectsToEnrollment({
      enrollment,
      student: STUDENT,
      subjectIds: [S_FIL],
      actorId: ADMIN_ID,
      overrideReason: 'Registrar note',
    });
    expect(outcome.added).toHaveLength(0);
    expect(enrollment.subjects).toHaveLength(1);
  });

  test('a subject already taken in another section of the same term is still a duplicate', async () => {
    const otherTermEnrollment = targetEnrollment({
      _id: '64b000000000000000000091',
      subjects: [{ subjectId: S_FIL, code: 'FIL101', status: 'Enrolled' }],
    });
    history = [otherTermEnrollment];
    const enrollment = targetEnrollment();

    const validation = await subjectEnrollmentService.validateSubjectSelection({
      student: STUDENT,
      enrollment,
      subjectIds: [S_FIL],
    });

    expect(validation.okIds).toEqual([]);
    expect(validation.results[0].reasonCode).toBe(subjectEnrollmentService.REASON.DUPLICATE_ACTIVE);
    expect(validation.results[0].message).toMatch(/2026-2027 1st/);
  });

  test('inactive students and inactive subjects cannot be enrolled', async () => {
    const enrollment = targetEnrollment();

    const inactiveStudent = await subjectEnrollmentService.validateSubjectSelection({
      student: { ...STUDENT, isActive: false },
      enrollment,
      subjectIds: [S_FIL],
    });
    expect(inactiveStudent.results[0].reasonCode).toBe(subjectEnrollmentService.REASON.STUDENT_NOT_ENROLLABLE);

    const inactiveSubject = await subjectEnrollmentService.validateSubjectSelection({
      student: STUDENT,
      enrollment,
      subjectIds: ['64b000000000000000000077'],
    });
    expect(inactiveSubject.results[0].reasonCode).toBe(subjectEnrollmentService.REASON.SUBJECT_INACTIVE);
  });

  test('a subject offered nowhere this term is rejected unless the registrar overrides it', async () => {
    // Nothing places SCI at Year 1 in this curriculum and no block carries it
    // this term, so it is not offered for this student's term.
    CurriculumSubject.find.mockImplementation(() => chain(PLACEMENTS.slice(0, 3), []));
    offerings = [];
    const enrollment = targetEnrollment();

    const validation = await subjectEnrollmentService.validateSubjectSelection({
      student: STUDENT,
      enrollment,
      subjectIds: [S_SCI],
    });
    expect(validation.results[0].reasonCode).toBe(subjectEnrollmentService.REASON.NOT_OFFERED);
    expect(validation.results[0].requiresOverride).toBe(true);

    const blocked = await subjectEnrollmentService.addSubjectsToEnrollment({
      enrollment,
      student: STUDENT,
      subjectIds: [S_SCI],
      actorId: ADMIN_ID,
    });
    expect(blocked.added).toHaveLength(0);
    expect(blocked.failed[0].reasonCode).toBe('OVERRIDE_REQUIRED');

    const allowed = await subjectEnrollmentService.addSubjectsToEnrollment({
      enrollment,
      student: STUDENT,
      subjectIds: [S_SCI],
      actorId: ADMIN_ID,
      overrideReason: 'Cross-enrollment approved by the registrar.',
    });
    expect(allowed.added).toHaveLength(1);
    expect(enrollment.subjects[0].overrideReason).toMatch(/Cross-enrollment/);
  });
});

// ─── D. Dropped and retake subjects ─────────────────────────────────────────

describe('D. Dropped and retake subjects', () => {
  const droppedOriginal = () => targetEnrollment({
    subjects: [
      {
        _id: '64b000000000000000000061',
        subjectId: S_ENG,
        code: 'ENG101',
        title: 'The Life & Works of Rizal',
        units: 3,
        status: 'Dropped',
        grade: null,
        gradeMark: 'DRP',
        droppedAt: new Date('2026-09-01T00:00:00Z'),
        dropReason: 'Workload conflict',
      },
      { _id: '64b000000000000000000062', subjectId: S_FIL, code: 'FIL101', status: 'Completed', grade: 1.5 },
    ],
    ...TERM_1,
  });

  test('a student can retake a dropped Year 1 subject in a later term without moving year level or block', async () => {
    const original = droppedOriginal();
    history = [original];
    const student = { ...STUDENT, yearLevel: 2 };
    const yearLevelBefore = student.yearLevel;

    const result = await subjectEnrollmentService.retakeSubject({
      student,
      subjectId: S_ENG,
      ...TERM_2,
      actorId: ADMIN_ID,
    });

    // Year level and block are untouched — a retake never demotes a student.
    expect(student.yearLevel).toBe(yearLevelBefore);
    expect(Student.updateOne).not.toHaveBeenCalled();
    expect(StudentBlockAssignment.create).not.toHaveBeenCalled();
    expect(StudentBlockAssignment.updateOne).not.toHaveBeenCalled();
    expect(StudentBlockAssignment.deleteMany).not.toHaveBeenCalled();

    // The retake is a NEW entry in the NEW term.
    expect(result.enrollment.schoolYear).toBe(TERM_2.schoolYear);
    expect(result.enrollment.semester).toBe(TERM_2.semester);
    expect(String(result.enrollment._id)).not.toBe(String(original._id));
    expect(result.entry.subjectId).toBe(S_ENG);
    expect(result.entry.retakeOf.enrollmentId).toBe(original._id);
    expect(result.entry.retakeOf.schoolYear).toBe(TERM_1.schoolYear);
    expect(result.entry.retakeOf.status).toBe('Dropped');

    expect(AuditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'RETAKE', resourceType: 'ENROLLMENT' })
    );
  });

  test('the previous dropped enrollment record remains intact', async () => {
    const original = droppedOriginal();
    const originalSnapshot = JSON.parse(JSON.stringify(original));
    history = [original];

    await subjectEnrollmentService.retakeSubject({
      student: { ...STUDENT, yearLevel: 2 },
      subjectId: S_ENG,
      ...TERM_2,
      actorId: ADMIN_ID,
    });

    const originalSubject = original.subjects.find((s) => s.subjectId === S_ENG);
    expect(originalSubject.status).toBe('Dropped');
    expect(originalSubject.gradeMark).toBe('DRP');
    expect(originalSubject.droppedAt.toISOString()).toBe(originalSnapshot.subjects[0].droppedAt);
    expect(originalSubject.dropReason).toBe('Workload conflict');
    // Nothing wrote back to the historical record.
    expect(original.save).not.toHaveBeenCalled();
    expect(Enrollment.updateOne).not.toHaveBeenCalled();
  });

  test('the retake is a separate transaction in the correct term', async () => {
    history = [droppedOriginal()];

    const result = await subjectEnrollmentService.retakeSubject({
      student: { ...STUDENT, yearLevel: 2 },
      subjectId: S_ENG,
      ...TERM_2,
      actorId: ADMIN_ID,
    });

    expect(Enrollment.create).toHaveBeenCalledTimes(1);
    expect(Enrollment.create.mock.calls[0][0][0]).toMatchObject({
      schoolYear: TERM_2.schoolYear,
      semester: TERM_2.semester,
      status: 'Pending',
      studentId: STUDENT_ID,
    });
    // The original term's record still holds exactly one, unchanged attempt.
    const originalAttempts = history[0].subjects.filter((s) => String(s.subjectId) === S_ENG);
    expect(originalAttempts).toHaveLength(1);
    expect(originalAttempts[0].status).toBe('Dropped');
  });

  test('a retake cannot be recorded in the same or an earlier term', async () => {
    history = [droppedOriginal()];

    await expect(subjectEnrollmentService.retakeSubject({
      student: STUDENT,
      subjectId: S_ENG,
      ...TERM_1,
      actorId: ADMIN_ID,
    })).rejects.toMatchObject({ statusCode: 409, reasonCode: 'NOT_A_LATER_TERM' });
  });

  test('a retake is refused when there is no dropped or failed attempt', async () => {
    history = [droppedOriginal()];

    await expect(subjectEnrollmentService.retakeSubject({
      student: STUDENT,
      subjectId: S_MAT,
      ...TERM_2,
      actorId: ADMIN_ID,
    })).rejects.toMatchObject({ statusCode: 409, reasonCode: 'NO_ELIGIBLE_PRIOR_ATTEMPT' });
  });

  test('dropping a subject preserves the record and its grade', async () => {
    const enrollment = targetEnrollment({
      subjects: [
        { subjectId: S_ENG, code: 'ENG101', status: 'Enrolled', grade: 2.5, gradeMark: null },
        { subjectId: S_FIL, code: 'FIL101', status: 'Enrolled', grade: null, gradeMark: null },
      ],
    });

    const graded = await subjectEnrollmentService.dropSubjectFromEnrollment({
      enrollment,
      subjectId: S_ENG,
      actorId: ADMIN_ID,
      reason: 'Medical withdrawal',
      overrideReason: 'Approved by the registrar; grade retained for the record.',
    });
    expect(graded.entry.status).toBe('Dropped');
    // The grade is preserved exactly; only the status changed.
    expect(graded.entry.grade).toBe(2.5);
    expect(graded.entry.droppedBy).toBe(ADMIN_ID);
    expect(graded.entry.droppedAt).toBeInstanceOf(Date);

    const ungraded = await subjectEnrollmentService.dropSubjectFromEnrollment({
      enrollment,
      subjectId: S_FIL,
      actorId: ADMIN_ID,
      reason: 'Program shift',
    });
    expect(ungraded.entry.status).toBe('Dropped');
    expect(ungraded.entry.gradeMark).toBe('DRP');

    // No subject entry is ever deleted.
    expect(enrollment.subjects).toHaveLength(2);
    expect(enrollment.save).toHaveBeenCalledTimes(2);
    expect(AuditLog.create).toHaveBeenCalledTimes(2);
    expect(AuditLog.create).toHaveBeenCalledWith(expect.objectContaining({ action: 'DROP' }));
  });

  test('a graded subject cannot be dropped without a written override', async () => {
    const enrollment = targetEnrollment({
      subjects: [{ subjectId: S_ENG, code: 'ENG101', status: 'Completed', grade: 1.5 }],
    });

    await expect(subjectEnrollmentService.dropSubjectFromEnrollment({
      enrollment,
      subjectId: S_ENG,
      actorId: ADMIN_ID,
    })).rejects.toMatchObject({ statusCode: 409, reasonCode: 'GRADED_SUBJECT' });

    expect(enrollment.subjects[0].status).toBe('Completed');
  });

  test('a subject cannot be dropped twice', async () => {
    const enrollment = targetEnrollment({
      subjects: [{ subjectId: S_ENG, code: 'ENG101', status: 'Dropped', droppedAt: new Date('2026-09-01') }],
    });

    await expect(subjectEnrollmentService.dropSubjectFromEnrollment({
      enrollment,
      subjectId: S_ENG,
      actorId: ADMIN_ID,
    })).rejects.toMatchObject({ statusCode: 409, reasonCode: 'ALREADY_DROPPED' });
  });
});

// ─── E. Academic evaluation ─────────────────────────────────────────────────

describe('E. Academic evaluation', () => {
  const buildHistory = (withRetake = false) => {
    const original = targetEnrollment({
      subjects: [
        { subjectId: S_FIL, code: 'FIL101', status: 'Completed', grade: 1.5 },
        { _id: '64b000000000000000000065', subjectId: S_ENG, code: 'ENG101', status: 'Dropped', grade: null, gradeMark: 'DRP' },
        { _id: '64b000000000000000000066', subjectId: S_MAT, code: 'MATH101', status: 'Completed', grade: 5.0 },
      ],
      ...TERM_1,
    });
    if (!withRetake) return [original];
    return [
      original,
      targetEnrollment({
        _id: ENR_NEW_TERM,
        ...TERM_2,
        subjects: [
          // Shape matches what retakeSubject() actually writes: a complete,
          // resolvable snapshot of the attempt being replaced.
          {
            subjectId: S_ENG,
            code: 'ENG101',
            status: 'Completed',
            grade: 2.0,
            retakeOf: {
              enrollmentId: ENR_ORIGINAL,
              subjectEntryId: '64b000000000000000000065',
              schoolYear: TERM_1.schoolYear,
              semester: TERM_1.semester,
              status: 'Dropped',
            },
          },
        ],
      }),
    ];
  };

  test('completed, failed, dropped and outstanding requirements are tracked by official status', async () => {
    const progress = curriculumProgressService.evaluateProgress({
      curriculum: { _id: CURRICULUM_ID, programCode: 101, name: 'BEED 2026', version: '2026', status: 'Active' },
      placements: PLACEMENTS,
      enrollments: buildHistory(false),
      student: STUDENT,
    });

    const byCode = Object.fromEntries(progress.requirements.map((r) => [r.code, r.status]));
    expect(byCode).toEqual({
      FIL101: 'Completed',
      ENG101: 'Dropped',
      MATH101: 'Failed',
      SCI201: 'Outstanding',
    });
    expect(progress.summary.completed).toBe(1);
    expect(progress.summary.failed).toBe(1);
    expect(progress.summary.dropped).toBe(1);
    expect(progress.summary.outstanding).toBe(1);
    expect(progress.graduationEligibility.eligible).toBe(false);
  });

  test('a retake result is reconciled with the outstanding requirement and the earlier attempt stays on record', async () => {
    const progress = curriculumProgressService.evaluateProgress({
      curriculum: { _id: CURRICULUM_ID, programCode: 101, name: 'BEED 2026', version: '2026', status: 'Active' },
      placements: PLACEMENTS,
      enrollments: buildHistory(true),
      student: STUDENT,
    });

    const rizal = progress.requirements.find((r) => r.code === 'ENG101');
    expect(rizal.status).toBe('Completed');
    expect(rizal.completedWith).toEqual({ schoolYear: TERM_2.schoolYear, semester: TERM_2.semester, grade: 2.0 });
    // Both attempts remain visible — nothing was overwritten.
    expect(rizal.attempts).toHaveLength(2);
    expect(rizal.attempts[0].status).toBe('Dropped');
    expect(rizal.attempts[0].isRetake).toBe(false);
    expect(rizal.attempts[1].isRetake).toBe(true);
  });

  test('a subject retaken after a failure is not counted as failed', async () => {
    const enrollments = buildHistory(true);
    enrollments[1].subjects.push({
      subjectId: S_MAT,
      code: 'MATH101',
      status: 'Completed',
      grade: 2.25,
      retakeOf: {
        enrollmentId: ENR_ORIGINAL,
        subjectEntryId: '64b000000000000000000066',
        schoolYear: TERM_1.schoolYear,
        semester: TERM_1.semester,
        status: 'Completed',
      },
    });

    const progress = curriculumProgressService.evaluateProgress({
      curriculum: { _id: CURRICULUM_ID, programCode: 101, name: 'BEED 2026', version: '2026', status: 'Active' },
      placements: PLACEMENTS,
      enrollments,
      student: STUDENT,
    });

    expect(progress.requirements.find((r) => r.code === 'MATH101').status).toBe('Completed');
    expect(progress.summary.failed).toBe(0);
  });

  test('progression and graduation are computed from the curriculum, never from the block label', async () => {
    const fullyPassedYearOne = [
      targetEnrollment({
        subjects: [
          { subjectId: S_FIL, code: 'FIL101', status: 'Completed', grade: 1.5 },
          { subjectId: S_ENG, code: 'ENG101', status: 'Completed', grade: 2.0 },
          { subjectId: S_MAT, code: 'MATH101', status: 'Completed', grade: 2.25 },
        ],
        ...TERM_1,
      }),
    ];

    const progress = curriculumProgressService.evaluateProgress({
      curriculum: { _id: CURRICULUM_ID, programCode: 101, name: 'BEED 2026', version: '2026', status: 'Active' },
      placements: PLACEMENTS,
      enrollments: fullyPassedYearOne,
      student: STUDENT,
    });

    expect(progress.progression.currentYearLevel).toBe(1);
    expect(progress.progression.canAdvance).toBe(true);
    expect(progress.progression.recommendedYearLevel).toBe(2);
    // Still not a graduate: Year 2's requirement is outstanding, whatever the block says.
    expect(progress.graduationEligibility.eligible).toBe(false);
    expect(progress.graduationEligibility.outstanding.map((r) => r.code)).toEqual(['SCI201']);
  });

  test('a student cannot advance while a required subject of their current year is open', async () => {
    const progress = curriculumProgressService.evaluateProgress({
      curriculum: { _id: CURRICULUM_ID, programCode: 101, name: 'BEED 2026', version: '2026', status: 'Active' },
      placements: PLACEMENTS,
      enrollments: [targetEnrollment({ subjects: [{ subjectId: S_FIL, code: 'FIL101', status: 'Enrolled', grade: null }], ...TERM_1 })],
      student: STUDENT,
    });

    expect(progress.progression.canAdvance).toBe(false);
    expect(progress.progression.recommendedYearLevel).toBe(1);
    // An in-progress subject of the current year still blocks advancement —
    // only completed requirements count.
    expect(progress.progression.blockedBy.map((b) => b.code).sort()).toEqual(['ENG101', 'FIL101', 'MATH101']);
  });

  test('the graduation gate refuses to graduate a student with outstanding curriculum requirements', async () => {
    history = buildHistory(true);
    const gate = await curriculumProgressService.getGraduationGate([{ ...STUDENT, yearLevel: 4, latestGrade: 1.0 }]);

    const signal = gate.get(STUDENT_ID);
    expect(signal.curriculumResolved).toBe(true);
    expect(signal.eligible).toBe(false);
    // MATH101 failed (5.0) and SCI201 was never attempted.
    expect(signal.outstandingRequiredCount).toBe(2);
  });

  test('the graduation gate approves once every required subject is completed', async () => {
    history = [
      targetEnrollment({
        subjects: PLACEMENTS.map((p, i) => ({
          subjectId: p.subjectId,
          code: p.courseNo,
          status: 'Completed',
          grade: 1.5 + i * 0.1,
        })),
        ...TERM_1,
      }),
    ];
    const gate = await curriculumProgressService.getGraduationGate([{ ...STUDENT, yearLevel: 4, latestGrade: 1.0 }]);

    expect(gate.get(STUDENT_ID).eligible).toBe(true);
  });
});

// ─── F. Persistence and regression guards ───────────────────────────────────

describe('F. Persistence and regression guards', () => {
  test('added subjects persist on the record a re-read would return', async () => {
    const enrollment = targetEnrollment();
    history = [enrollment];

    await subjectEnrollmentService.addSubjectsToEnrollment({
      enrollment,
      student: STUDENT,
      subjectIds: [S_FIL, S_ENG],
      actorId: ADMIN_ID,
    });

    expect(enrollment.save).toHaveBeenCalledTimes(1);
    expect(enrollment.markModified).toHaveBeenCalledWith('subjects');

    // A refresh re-reads the same document; the entries must be on it.
    const reread = history[0];
    expect(reread.subjects.map((s) => s.code)).toEqual(['FIL101', 'ENG101']);
    expect(reread.subjects[0]).toEqual(expect.objectContaining({
      status: 'Enrolled',
      addedBy: ADMIN_ID,
      dateEnrolled: expect.any(Date),
    }));
    // The audit trail is written alongside the record.
    expect(AuditLog.create).toHaveBeenCalledWith(expect.objectContaining({ action: 'CREATE', resourceType: 'ENROLLMENT' }));
  });

  test('a locked historical enrollment rejects any subject change', async () => {
    const locked = targetEnrollment({ lockedAt: new Date('2027-06-01T00:00:00Z') });

    const validation = await subjectEnrollmentService.validateSubjectSelection({
      student: STUDENT,
      enrollment: locked,
      subjectIds: [S_FIL],
    });
    expect(validation.okIds).toEqual([]);
    expect(validation.results[0].reasonCode).toBe(subjectEnrollmentService.REASON.ENROLLMENT_LOCKED);

    await expect(subjectEnrollmentService.addSubjectsToEnrollment({
      enrollment: locked,
      student: STUDENT,
      subjectIds: [S_FIL],
      actorId: ADMIN_ID,
    })).rejects.toMatchObject({ statusCode: 409 });

    await expect(subjectEnrollmentService.dropSubjectFromEnrollment({
      enrollment: locked,
      subjectId: S_FIL,
      actorId: ADMIN_ID,
    })).rejects.toMatchObject({ statusCode: 409 });
  });

  test('the enrollment management endpoints report per-subject results', async () => {
    const enrollment = targetEnrollment();
    history = [enrollment];

    const validateRes = mockRes();
    await EnrollmentManagementController.validateEnrollmentSubjects(
      mockReq({ params: { enrollmentId: ENR_ORIGINAL }, body: { subjectIds: [S_FIL, S_ENG] } }),
      validateRes
    );
    expect(validateRes.body.data.results).toHaveLength(2);
    expect(validateRes.body.data.failedIds).toEqual([]);

    const addRes = mockRes();
    await EnrollmentManagementController.addEnrollmentSubjects(
      mockReq({ params: { enrollmentId: ENR_ORIGINAL }, body: { subjectIds: [S_FIL] } }),
      addRes
    );
    expect(addRes.statusCode).toBe(201);
    expect(addRes.body.data.added).toHaveLength(1);

    const dropRes = mockRes();
    await EnrollmentManagementController.dropEnrollmentSubject(
      mockReq({
        params: { enrollmentId: ENR_ORIGINAL, subjectId: S_FIL },
        body: { reason: 'Dropped after consultation' },
      }),
      dropRes
    );
    expect(dropRes.statusCode).toBe(200);
    expect(dropRes.body.data.subject.status).toBe('Dropped');
    // The entry is still on the record after the drop.
    expect(enrollment.subjects.find((s) => s.subjectId === S_FIL)).toBeTruthy();
  });

  test('the academic progress endpoint returns a curriculum-based report', async () => {
    history = [targetEnrollment({
      subjects: [{ subjectId: S_FIL, code: 'FIL101', status: 'Completed', grade: 1.5 }],
      ...TERM_1,
    })];

    const res = mockRes();
    await EnrollmentManagementController.getAcademicProgress(mockReq({ params: { id: STUDENT_ID } }), res);

    expect(res.statusCode).toBe(200);
    expect(res.body.data.curriculum.programCode).toBe(101);
    expect(res.body.data.summary.completed).toBe(1);
    expect(res.body.data.graduationEligibility.eligible).toBe(false);
    expect(res.body.data.progression.currentYearLevel).toBe(1);
  });
});

// ─── G. Retake note verification ────────────────────────────────────────────
//
// The "Retake of …" note in the student history table may only appear when the
// retakeOf snapshot resolves to a real, earlier attempt of the same subject in
// the student's own enrollment history. verifyRetakeReferences() is the rule:
// these tests pin down what counts as a genuine retake and what does not.

describe('G. Retake note verification', () => {
  // Entry ids used as the stable pointer targets of retakeOf snapshots.
  const ENG_DROPPED_ID = '64b000000000000000000065';
  const FIL_COMPLETED_ID = '64b000000000000000000081';
  const ENG_RETAKE_ID = '64b000000000000000000075';

  const TERM_3 = { schoolYear: '2028-2029', semester: '1st' };

  const droppedEng = () => ({
    _id: ENG_DROPPED_ID,
    subjectId: S_ENG,
    code: 'ENG101',
    title: 'The Life & Works of Rizal',
    units: 3,
    status: 'Dropped',
    grade: null,
    gradeMark: 'DRP',
  });

  const snapshot = (overrides = {}) => ({
    enrollmentId: ENR_ORIGINAL,
    subjectEntryId: ENG_DROPPED_ID,
    schoolYear: TERM_1.schoolYear,
    semester: TERM_1.semester,
    status: 'Dropped',
    ...overrides,
  });

  test('a regular first-time enrollment is never marked as a retake', () => {
    const history = [
      targetEnrollment({
        subjects: [{ subjectId: S_ENG, code: 'ENG101', status: 'Enrolled', grade: null, gradeMark: null }],
        ...TERM_1,
      }),
    ];

    const outcome = subjectEnrollmentService.verifyRetakeReferences(history);

    expect(outcome).toEqual({ verified: 0, stripped: 0, reasons: [] });
    // Nothing was retro-fitted onto the entry: no snapshot, no note.
    expect(history[0].subjects[0].retakeOf).toBeUndefined();
  });

  test('a legitimate retake keeps its verified previous-attempt reference', () => {
    const history = [
      targetEnrollment({ subjects: [droppedEng()], ...TERM_1 }),
      targetEnrollment({
        _id: ENR_NEW_TERM,
        subjects: [{
          subjectId: S_ENG,
          code: 'ENG101',
          status: 'Enrolled',
          grade: 1.0,
          retakeOf: snapshot(),
        }],
        ...TERM_2,
      }),
    ];

    const outcome = subjectEnrollmentService.verifyRetakeReferences(history);

    expect(outcome.verified).toBe(1);
    expect(outcome.stripped).toBe(0);
    // The complete snapshot survives intact — the note may be shown.
    expect(history[1].subjects[0].retakeOf).toEqual(snapshot());
  });

  test('re-enrolling a dropped subject is not silently inferred as a retake', () => {
    const history = [
      targetEnrollment({ subjects: [droppedEng()], ...TERM_1 }),
      // Plainly re-added through the add-subject flow: same subject enrolled
      // again, but no retake record exists, so no snapshot and no note.
      targetEnrollment({
        _id: ENR_NEW_TERM,
        subjects: [{ subjectId: S_ENG, code: 'ENG101', status: 'Enrolled', grade: null, gradeMark: null }],
        ...TERM_2,
      }),
    ];

    const outcome = subjectEnrollmentService.verifyRetakeReferences(history);

    expect(outcome.verified).toBe(0);
    expect(outcome.stripped).toBe(0);
    // A matching subject code plus an existing enrollment record is not
    // evidence of a retake — no reference may be fabricated.
    expect(history[1].subjects[0].retakeOf).toBeUndefined();
  });

  test('snapshots without a valid previous-attempt reference are stripped, not displayed', () => {
    const history = [
      targetEnrollment({
        subjects: [
          droppedEng(),
          { _id: FIL_COMPLETED_ID, subjectId: S_FIL, code: 'FIL101', status: 'Completed', grade: 1.5 },
        ],
        ...TERM_1,
      }),
      targetEnrollment({
        _id: ENR_NEW_TERM,
        subjects: [
          // Empty subdocument — carries no previous attempt at all.
          { subjectId: S_ENG, code: 'ENG101', status: 'Enrolled', retakeOf: {} },
          // Partial legacy snapshot — only the header pointer.
          { subjectId: S_ENG, code: 'ENG101', status: 'Enrolled', retakeOf: { enrollmentId: ENR_ORIGINAL } },
          // Complete-looking snapshot whose subject entry no longer exists.
          { subjectId: S_ENG, code: 'ENG101', status: 'Enrolled', retakeOf: snapshot({ subjectEntryId: '64b0000000000000000000de' }) },
          // Points at an enrollment that is not part of this student's history.
          { subjectId: S_ENG, code: 'ENG101', status: 'Enrolled', retakeOf: snapshot({ enrollmentId: '64b0000000000000000000de' }) },
          // Resolvable reference, but it belongs to a different subject.
          { subjectId: S_ENG, code: 'ENG101', status: 'Enrolled', retakeOf: snapshot({ subjectEntryId: FIL_COMPLETED_ID }) },
          // Does not point at an earlier term than the retaking entry.
          { subjectId: S_ENG, code: 'ENG101', status: 'Enrolled', retakeOf: snapshot({ schoolYear: TERM_2.schoolYear }) },
        ],
        ...TERM_2,
      }),
    ];

    const outcome = subjectEnrollmentService.verifyRetakeReferences(history);

    expect(outcome.verified).toBe(0);
    expect(outcome.stripped).toBe(history[1].subjects.length);
    for (const entry of history[1].subjects) {
      expect(entry.retakeOf).toBe(null);
    }
    // The untouched dropped attempt keeps its own record and grade.
    expect(history[0].subjects[0].status).toBe('Dropped');
    expect(history[0].subjects[0].gradeMark).toBe('DRP');
  });

  test('multiple enrollment records for the same subject verify independently', () => {
    const history = [
      targetEnrollment({ subjects: [droppedEng()], ...TERM_1 }),
      targetEnrollment({
        _id: ENR_NEW_TERM,
        subjects: [{
          _id: ENG_RETAKE_ID,
          subjectId: S_ENG,
          code: 'ENG101',
          status: 'Dropped',
          retakeOf: snapshot(),
        }],
        ...TERM_2,
      }),
      // Third term: retakes the TERM_2 attempt (dropped), so the retakeOf
      // chain resolves term by term. A retake always lands in a LATER term.
      targetEnrollment({
        _id: '64b000000000000000000034',
        subjects: [
          {
            subjectId: S_ENG,
            code: 'ENG101',
            status: 'Enrolled',
            grade: null,
            gradeMark: null,
            retakeOf: {
              enrollmentId: ENR_NEW_TERM,
              subjectEntryId: ENG_RETAKE_ID,
              schoolYear: TERM_2.schoolYear,
              semester: TERM_2.semester,
              status: 'Dropped',
            },
          },
        ],
        ...TERM_3,
      }),
      // A record of a DIFFERENT subject also exists for the same student.
      targetEnrollment({
        _id: '64b000000000000000000035',
        subjects: [
          {
            subjectId: S_MAT,
            code: 'MATH101',
            status: 'Completed',
            grade: 2.0,
            // Bogus: claims to retake the ENG101 attempt from TERM_1.
            retakeOf: snapshot({
              schoolYear: TERM_1.schoolYear,
              semester: TERM_1.semester,
              status: 'Dropped',
            }),
          },
        ],
        ...TERM_2,
      }),
    ];

    const outcome = subjectEnrollmentService.verifyRetakeReferences(history);

    // Both genuine attempts in the chain are verified.
    expect(outcome.verified).toBe(2);
    // The MATH101 entry whose retakeOf points at an ENG101 attempt is stripped.
    expect(outcome.stripped).toBe(1);
    expect(history[3].subjects[0].retakeOf).toBe(null);
    expect(history[1].subjects[0].retakeOf).toEqual(snapshot());
  });
});
