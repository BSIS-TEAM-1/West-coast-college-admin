/**
 * Offline tests for program-shift block resolution.
 *
 * resolveShiftSection must accept every label shape the registrar shift form
 * can submit: the real section code, a trailing fragment of it, the block
 * group's display name (or its tail), and a bare section letter. The old
 * matching logic only understood the first two, which is why the registrar's
 * "shift + assign to block" flow kept rejecting with
 * "No open section matches ...".
 *
 * The shift-options endpoint must also survive the TERM-STAMP MISMATCH the
 * live data actually has: freshly created students carry the current-date
 * school year while every block group is stamped with the legacy term they
 * were created under. performAssignment keys the assignment to the BLOCK's
 * term and imposes no student school-year check, so the resolver and the
 * options endpoint fall back to the most recent matching term instead of
 * returning an empty list.
 *
 * Models are mocked so the suite runs offline; the code under test is the
 * real controller.
 */

jest.mock('./models/BlockGroup', () => ({ find: jest.fn() }));
jest.mock('./models/BlockSection', () => ({ find: jest.fn(), countDocuments: jest.fn() }));

const BlockGroup = require('./models/BlockGroup');
const BlockSection = require('./models/BlockSection');
const StudentController = require('./controllers/studentController');
const blockController = require('./controllers/blockController');

const SY = '2026-2027';
const SEM = '1st';
const LEGACY_SY = '2021-2022';
const NEWER_SY = '2027-2028';

function groupDoc(id, fields = {}) {
  return {
    _id: id,
    name: fields.name,
    courseId: fields.courseId,
    courseCode: fields.courseCode ?? String(fields.courseId),
    yearLevel: fields.yearLevel ?? 1,
    semester: fields.semester ?? SEM,
    schoolYear: fields.schoolYear ?? LEGACY_SY,
    year: fields.year ?? fields.schoolYear ?? LEGACY_SY,
    section: fields.section ?? 'A',
  };
}

function sectionDoc(id, blockGroupId, sectionCode, capacity = 5, currentPopulation = 0) {
  return {
    _id: id,
    blockGroupId,
    sectionCode,
    capacity,
    currentPopulation,
    status: 'OPEN',
  };
}

function mockRes() {
  const res = {
    statusCode: 200,
    payload: undefined,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.payload = payload; return this; },
  };
  return res;
}

/**
 * Mock BlockSection.find honoring the blockGroupId $in filter the controllers
 * pass, so the DB-level scoping is exercised in every test.
 */
function mockSectionFind(allSections) {
  return (query) => ({
    lean: async () => {
      const ids = ((query?.blockGroupId && query.blockGroupId.$in) || []).map(String);
      if (ids.length === 0) return allSections;
      return allSections.filter((section) => ids.includes(String(section.blockGroupId)));
    },
  });
}

/**
 * Mock BlockGroup.find distinguishing the strict term pass (query carries
 * $or: [{schoolYear}, {year}]) from the semester-only fallback pass.
 */
function mockGroupFind(strictGroups, looseGroups) {
  return (query) => {
    const payload = query && query.$or ? strictGroups : looseGroups;
    // Only the shift-options endpoint sorts; resolveShiftSection does not.
    return {
      sort: () => ({ lean: async () => payload }),
      lean: async () => payload,
    };
  };
}

// Reference shape used across the suite: a BSED-English year-1 block whose
// group display name ("BSED-ENG-1-A") does not share a prefix with its real
// section code ("102-1-A"), stamped with the legacy term.
const group102 = groupDoc('group-102', { courseId: 102, name: 'BSED-ENG-1-A' });
const sec102 = sectionDoc('section-102', 'group-102', '102-1-A', 5, 0);

describe('resolveShiftSection', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    BlockGroup.find.mockImplementation(mockGroupFind([group102], [group102]));
    BlockSection.find.mockImplementation(mockSectionFind([sec102]));
  });

  test('matches the exact section code', async () => {
    const result = await StudentController.resolveShiftSection({
      course: 102, semester: SEM, schoolYear: SY, selection: '102-1-A',
    });
    expect(result.section).not.toBeNull();
    expect(result.section.sectionCode).toBe('102-1-A');
  });

  test('matches a trailing fragment of the section code ("1-A")', async () => {
    const result = await StudentController.resolveShiftSection({
      course: 102, semester: SEM, schoolYear: SY, selection: '1-A',
    });
    expect(result.section?.sectionCode).toBe('102-1-A');
  });

  test('matches the block group display name', async () => {
    const result = await StudentController.resolveShiftSection({
      course: 102, semester: SEM, schoolYear: SY, selection: 'BSED-ENG-1-A',
    });
    expect(result.section?.sectionCode).toBe('102-1-A');
  });

  test('matches the tail of the block group display name ("ENG-1-A")', async () => {
    // The old shift form split the group name on "-" and submitted
    // parts[1]-parts[2]; for "BSED-ENG-1-A" that is "ENG-1-A", which the old
    // resolver rejected, aborting the whole shift.
    const result = await StudentController.resolveShiftSection({
      course: 102, semester: SEM, schoolYear: SY, selection: 'ENG-1-A',
    });
    expect(result.section?.sectionCode).toBe('102-1-A');
  });

  test('matches a bare section letter via the group section letter', async () => {
    const result = await StudentController.resolveShiftSection({
      course: 102, semester: SEM, schoolYear: SY, selection: 'A',
    });
    expect(result.section?.sectionCode).toBe('102-1-A');
  });

  test('normalizes dashes and whitespace in the selection', async () => {
    const result = await StudentController.resolveShiftSection({
      course: 102, semester: SEM, schoolYear: SY, selection: ' 102–1-A ',
    });
    expect(result.section?.sectionCode).toBe('102-1-A');
  });

  test('rejects an unknown label and lists the open section codes', async () => {
    const result = await StudentController.resolveShiftSection({
      course: 102, semester: SEM, schoolYear: SY, selection: '9-Z',
    });
    expect(result.section).toBeNull();
    expect(result.reason).toContain('No open section matches "9-Z"');
    expect(result.reason).toContain('102-1-A');
  });

  test('rejects when no block for the course exists in the semester', async () => {
    const group103 = groupDoc('group-103', { courseId: 103, name: 'BSED-MATH-1-A' });
    BlockGroup.find.mockImplementation(mockGroupFind([group103], [group103]));
    const result = await StudentController.resolveShiftSection({
      course: 102, semester: SEM, schoolYear: SY, selection: '102-1-A',
    });
    expect(result.section).toBeNull();
    expect(result.reason).toContain('No 1st block exists for the selected course');
  });

  test('rejects when the matching block has no open section', async () => {
    BlockSection.find.mockImplementation(mockSectionFind([]));
    const result = await StudentController.resolveShiftSection({
      course: 102, semester: SEM, schoolYear: SY, selection: '102-1-A',
    });
    expect(result.section).toBeNull();
    expect(result.reason).toContain('no open section');
  });

  test('keeps the full section code match ahead of weaker label matches', async () => {
    // Two sections could match a loose label ("A") via different tiers; the
    // exact section code must win deterministically.
    const secOther = sectionDoc('section-102-b', 'group-102', '102-1-B', 10, 0);
    BlockSection.find.mockImplementation(mockSectionFind([sec102, secOther]));
    const result = await StudentController.resolveShiftSection({
      course: 102, semester: SEM, schoolYear: SY, selection: '102-1-A',
    });
    expect(result.section?._id).toBe('section-102');
  });

  test('picks the section with the most free slots among equal label matches', async () => {
    const secFull = sectionDoc('section-full', 'group-102', '102-1-B', 1, 1);
    BlockSection.find.mockImplementation(mockSectionFind([sec102, secFull]));
    const result = await StudentController.resolveShiftSection({
      course: 102, semester: SEM, schoolYear: SY, selection: 'A',
    });
    expect(result.section?.sectionCode).toBe('102-1-A');
    expect(result.section?.currentPopulation).toBe(0);
  });

  describe('term-stamp mismatch fallback', () => {
    test('resolves the section when the student term predates the block stamp', async () => {
      // Student's schoolYear "2026-2027" matches nothing; the legacy
      // "2021-2022" group for the same semester is still assignable because
      // performAssignment keys the term to the BLOCK group.
      const result = await StudentController.resolveShiftSection({
        course: 102, semester: SEM, schoolYear: SY, selection: '1-A',
      });
      expect(BlockGroup.find).toHaveBeenCalledTimes(1); // no fallback needed
      expect(result.section?.sectionCode).toBe('102-1-A');
    });

    test('falls back to the latest matching term when the student term has no groups', async () => {
      const newer = groupDoc('group-102-newer', { courseId: 102, schoolYear: NEWER_SY });
      const newerSection = sectionDoc('section-newer', 'group-102-newer', '102-1-A', 30, 0);
      // Strict pass: no groups stamped with the student's term at all.
      BlockGroup.find.mockImplementation(mockGroupFind([], [group102, newer]));
      BlockSection.find.mockImplementation(
        mockSectionFind([sec102, newerSection]) // both ids present; $in decides
      );

      const result = await StudentController.resolveShiftSection({
        course: 102, semester: SEM, schoolYear: SY, selection: '102-1-A',
      });
      // Two BlockGroup.find calls: the strict pass, then the semester-only
      // fallback pass.
      expect(BlockGroup.find).toHaveBeenCalledTimes(2);
      expect(result.section?.sectionCode).toBe('102-1-A');
      expect(result.section?.capacity).toBe(30);
      // The fallback must pick the MOST RECENT stamp (2027-2028 group).
      expect(result.section?._id).toBe('section-newer');
    });

    test('prefers the strict term pass even when a newer stamp exists', async () => {
      const newer = groupDoc('group-102-newer', { courseId: 102, schoolYear: NEWER_SY });
      const newerSection = sectionDoc('section-newer', 'group-102-newer', '102-1-B', 30, 0);
      BlockGroup.find.mockImplementation(mockGroupFind([group102], [group102, newer]));
      BlockSection.find.mockImplementation(mockSectionFind([sec102, newerSection]));

      const result = await StudentController.resolveShiftSection({
        course: 102, semester: SEM, schoolYear: SY, selection: '102-1-A',
      });
      expect(BlockGroup.find).toHaveBeenCalledTimes(1);
      expect(result.section?.sectionCode).toBe('102-1-A');
    });

    test('rejects when neither the student term nor any term has blocks', async () => {
      BlockGroup.find.mockImplementation(mockGroupFind([], []));
      const result = await StudentController.resolveShiftSection({
        course: 102, semester: SEM, schoolYear: SY, selection: '102-1-A',
      });
      expect(result.section).toBeNull();
      expect(result.reason).toContain('No 1st block exists for the selected course');
    });
  });
});

describe('getShiftSectionOptions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    BlockGroup.find.mockImplementation(
      mockGroupFind(
        [group102, groupDoc('group-103', { courseId: 103, name: 'BSED-MATH-1-A' })],
        [group102, groupDoc('group-103', { courseId: 103, name: 'BSED-MATH-1-A' })]
      )
    );
    BlockSection.find.mockImplementation(
      mockSectionFind([sec102, sectionDoc('section-103', 'group-103', '103-1-A', 1, 1)])
    );
  });

  test('lists the real open section code with free seats and group name', async () => {
    const res = mockRes();
    await blockController.getShiftSectionOptions(
      { query: { course: '102', semester: SEM, schoolYear: SY } },
      res
    );
    expect(res.statusCode).toBe(200);
    expect(res.payload?.success).toBe(true);
    expect(res.payload?.data).toHaveLength(1);
    expect(res.payload?.data[0]).toMatchObject({
      sectionId: 'section-102',
      sectionCode: '102-1-A',
      groupName: 'BSED-ENG-1-A',
      schoolYear: LEGACY_SY,
      yearLevel: 1,
      capacity: 5,
      currentPopulation: 0,
      freeSlots: 5,
    });
    // Strict term pass found the group; no fallback marker needed.
    expect(res.payload?.term).toBeUndefined();
  });

  test('filters out other programs', async () => {
    const res = mockRes();
    await blockController.getShiftSectionOptions(
      { query: { course: '103', semester: SEM, schoolYear: SY } },
      res
    );
    expect(res.payload?.data).toHaveLength(1);
    expect(res.payload?.data[0].sectionCode).toBe('103-1-A');
    expect(res.payload?.data[0].freeSlots).toBe(0);
  });

  test('requires course and semester', async () => {
    const missingSemester = mockRes();
    await blockController.getShiftSectionOptions({ query: { course: '102' } }, missingSemester);
    expect(missingSemester.statusCode).toBe(400);

    const missingCourse = mockRes();
    await blockController.getShiftSectionOptions(
      { query: { semester: SEM } },
      missingCourse
    );
    expect(missingCourse.statusCode).toBe(400);
  });

  describe('term-stamp mismatch fallback', () => {
    test('offers the latest matching term when the student term has no groups', async () => {
      const newer = groupDoc('group-102-newer', { courseId: 102, schoolYear: NEWER_SY });
      const newerSection = sectionDoc('section-newer', 'group-102-newer', '102-1-A', 8, 2);
      BlockGroup.find.mockImplementation(
        mockGroupFind([], [group102, newer]) // strict finds nothing
      );
      BlockSection.find.mockImplementation(mockSectionFind([sec102, newerSection]));

      const res = mockRes();
      await blockController.getShiftSectionOptions(
        { query: { course: '102', semester: SEM, schoolYear: SY } },
        res
      );
      expect(res.statusCode).toBe(200);
      expect(res.payload?.success).toBe(true);
      expect(res.payload?.data).toHaveLength(1);
      expect(res.payload?.data[0]).toMatchObject({
        sectionCode: '102-1-A',
        schoolYear: NEWER_SY,
        freeSlots: 6,
      });
      expect(res.payload?.term).toBe(NEWER_SY);
    });

    test('explains when no block groups exist for the program in the semester', async () => {
      BlockGroup.find.mockImplementation(mockGroupFind([], []));
      const res = mockRes();
      await blockController.getShiftSectionOptions(
        { query: { course: '102', semester: SEM, schoolYear: SY } },
        res
      );
      expect(res.statusCode).toBe(200);
      expect(res.payload?.data).toEqual([]);
      expect(res.payload?.reason).toContain('No block groups exist');
    });

    test('explains when the program blocks have no open sections', async () => {
      BlockSection.find.mockImplementation(mockSectionFind([]));
      BlockSection.countDocuments.mockResolvedValue(2);
      const res = mockRes();
      await blockController.getShiftSectionOptions(
        { query: { course: '102', semester: SEM, schoolYear: SY } },
        res
      );
      expect(res.statusCode).toBe(200);
      expect(res.payload?.data).toEqual([]);
      expect(res.payload?.reason).toContain('no open sections');
    });

    test('explains when the program blocks have no sections at all', async () => {
      BlockSection.find.mockImplementation(mockSectionFind([]));
      BlockSection.countDocuments.mockResolvedValue(0);
      const res = mockRes();
      await blockController.getShiftSectionOptions(
        { query: { course: '102', semester: SEM, schoolYear: SY } },
        res
      );
      expect(res.statusCode).toBe(200);
      expect(res.payload?.data).toEqual([]);
      expect(res.payload?.reason).toContain('no sections yet');
    });
  });
});
