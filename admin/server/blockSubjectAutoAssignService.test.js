/**
 * Tests for blockSubjectAutoAssignService
 *
 * Tests the curriculum-driven auto-assignment logic that populates
 * BlockSubjectAssignment records from CurriculumSubject placements.
 * Uses mock objects — no live MongoDB connection required.
 */

jest.mock('./models/CurriculumSubject', () => ({
  find: jest.fn(),
}));
jest.mock('./models/Subject', () => ({
  find: jest.fn(),
}));
jest.mock('./models/BlockSubjectAssignment', () => ({
  find: jest.fn(),
  insertMany: jest.fn(),
}));

const CurriculumSubject = require('./models/CurriculumSubject');
const Subject = require('./models/Subject');
const BlockSubjectAssignment = require('./models/BlockSubjectAssignment');
const { autoAssignSubjectsFromCurriculum } = require('./services/blockSubjectAutoAssignService');

// Helpers
const mockObjectId = (str) => str;

function makeCurriculumSubject(subjectId, opts = {}) {
  return {
    subjectId: mockObjectId(subjectId),
    isRequired: opts.isRequired !== undefined ? opts.isRequired : true,
    type: opts.type || 'General',
  };
}

function makeSubject(id, code, opts = {}) {
  return {
    _id: mockObjectId(id),
    code,
    isActive: opts.isActive !== undefined ? opts.isActive : true,
    status: opts.status || 'Active',
  };
}

function makeSection(id) {
  return { _id: mockObjectId(id) };
}

function mockCurriculumSubjectFind(docs) {
  CurriculumSubject.find.mockReturnValue({
    select: jest.fn().mockReturnValue({
      lean: jest.fn().mockResolvedValue(docs),
    }),
  });
}

function mockSubjectFind(docs) {
  Subject.find.mockReturnValue({
    select: jest.fn().mockReturnValue({
      lean: jest.fn().mockResolvedValue(docs),
    }),
  });
}

function mockAssignmentFind(docs) {
  BlockSubjectAssignment.find.mockReturnValue({
    select: jest.fn().mockReturnValue({
      lean: jest.fn().mockResolvedValue(docs),
    }),
  });
}

function makeBlockGroup(opts = {}) {
  return {
    _id: 'group1',
    curriculumId: opts.curriculumId !== undefined ? opts.curriculumId : 'curr1',
    yearLevel: opts.yearLevel !== undefined ? opts.yearLevel : 1,
    semester: opts.semester !== undefined ? opts.semester : '1st',
    schoolYear: opts.schoolYear !== undefined ? opts.schoolYear : '2026-2027',
  };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('autoAssignSubjectsFromCurriculum', () => {
  test('auto-assigns required subjects matching curriculum + year + semester', async () => {
    const group = makeBlockGroup();
    const sections = [makeSection('sec1')];
    const csDocs = [
      makeCurriculumSubject('subj1'),
      makeCurriculumSubject('subj2'),
      makeCurriculumSubject('subj3'),
    ];
    mockCurriculumSubjectFind(csDocs);
    mockSubjectFind([
      makeSubject('subj1', 'ENG101'),
      makeSubject('subj2', 'MATH101'),
      makeSubject('subj3', 'SCI101'),
    ]);
    mockAssignmentFind([]);
    BlockSubjectAssignment.insertMany.mockResolvedValue([]);

    const result = await autoAssignSubjectsFromCurriculum(group, sections, 'admin1');

    expect(result.sections).toBe(1);
    expect(result.curriculumSubjectsFound).toBe(3);
    expect(result.created).toBe(3);
    expect(result.skipped).toBe(0);
    expect(BlockSubjectAssignment.insertMany).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ blockSectionId: 'sec1', subjectId: 'subj1', semester: '1st', academicYear: '2026-2027' }),
        expect.objectContaining({ blockSectionId: 'sec1', subjectId: 'subj2', semester: '1st', academicYear: '2026-2027' }),
        expect.objectContaining({ blockSectionId: 'sec1', subjectId: 'subj3', semester: '1st', academicYear: '2026-2027' }),
      ]),
      expect.objectContaining({ ordered: false })
    );
  });

  test('does NOT assign subjects from another curriculum', async () => {
    // The service queries by curriculumId, so subjects from other curriculums
    // are never returned by the CurriculumSubject.find query.
    const group = makeBlockGroup({ curriculumId: 'curr1' });
    const sections = [makeSection('sec1')];
    // Only curr1 subjects are returned (the service doesn't see curr2 subjects)
    mockCurriculumSubjectFind([makeCurriculumSubject('subj1')]);
    mockSubjectFind([makeSubject('subj1', 'ENG101')]);
    mockAssignmentFind([]);
    BlockSubjectAssignment.insertMany.mockResolvedValue([]);

    const result = await autoAssignSubjectsFromCurriculum(group, sections, 'admin1');

    expect(result.created).toBe(1);
    // Verify the query used the correct curriculumId
    expect(CurriculumSubject.find).toHaveBeenCalledWith(
      expect.objectContaining({ curriculumId: 'curr1' })
    );
  });

  test('does NOT assign subjects from another year level', async () => {
    const group = makeBlockGroup({ yearLevel: 1 });
    const sections = [makeSection('sec1')];
    mockCurriculumSubjectFind([makeCurriculumSubject('subj1')]);
    mockSubjectFind([makeSubject('subj1', 'ENG101')]);
    mockAssignmentFind([]);
    BlockSubjectAssignment.insertMany.mockResolvedValue([]);

    await autoAssignSubjectsFromCurriculum(group, sections, 'admin1');

    expect(CurriculumSubject.find).toHaveBeenCalledWith(
      expect.objectContaining({ yearLevel: 1 })
    );
  });

  test('does NOT assign subjects from another semester', async () => {
    const group = makeBlockGroup({ semester: '2nd' });
    const sections = [makeSection('sec1')];
    mockCurriculumSubjectFind([makeCurriculumSubject('subj1')]);
    mockSubjectFind([makeSubject('subj1', 'ENG101')]);
    mockAssignmentFind([]);
    BlockSubjectAssignment.insertMany.mockResolvedValue([]);

    await autoAssignSubjectsFromCurriculum(group, sections, 'admin1');

    expect(CurriculumSubject.find).toHaveBeenCalledWith(
      expect.objectContaining({ semester: '2nd' })
    );
  });

  test('skips electives by default (includeElectives=false)', async () => {
    const group = makeBlockGroup();
    const sections = [makeSection('sec1')];
    mockCurriculumSubjectFind([makeCurriculumSubject('subj1')]); // only required returned
    mockSubjectFind([makeSubject('subj1', 'ENG101')]);
    mockAssignmentFind([]);
    BlockSubjectAssignment.insertMany.mockResolvedValue([]);

    const result = await autoAssignSubjectsFromCurriculum(group, sections, 'admin1');

    expect(CurriculumSubject.find).toHaveBeenCalledWith(
      expect.objectContaining({ isRequired: true })
    );
    expect(result.created).toBe(1);
  });

  test('includes electives when includeElectives=true', async () => {
    const group = makeBlockGroup();
    const sections = [makeSection('sec1')];
    mockCurriculumSubjectFind([
      makeCurriculumSubject('subj1'),
      makeCurriculumSubject('subj2', { isRequired: false }),
    ]);
    mockSubjectFind([
      makeSubject('subj1', 'ENG101'),
      makeSubject('subj2', 'ELECTIVE01'),
    ]);
    mockAssignmentFind([]);
    BlockSubjectAssignment.insertMany.mockResolvedValue([]);

    const result = await autoAssignSubjectsFromCurriculum(group, sections, 'admin1', {
      includeElectives: true,
    });

    // Should NOT have isRequired filter
    expect(CurriculumSubject.find).toHaveBeenCalledWith(
      expect.not.objectContaining({ isRequired: expect.anything() })
    );
    expect(result.created).toBe(2);
  });

  test('skips inactive subjects with warning', async () => {
    const group = makeBlockGroup();
    const sections = [makeSection('sec1')];
    mockCurriculumSubjectFind([
      makeCurriculumSubject('subj1'),
      makeCurriculumSubject('subj2'),
    ]);
    // subj2 is inactive
    mockSubjectFind([makeSubject('subj1', 'ENG101')]);
    mockAssignmentFind([]);
    BlockSubjectAssignment.insertMany.mockResolvedValue([]);

    const result = await autoAssignSubjectsFromCurriculum(group, sections, 'admin1');

    expect(result.created).toBe(1);
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings.some((w) => w.includes('inactive'))).toBe(true);
  });

  test('idempotent — running twice creates 0 duplicates', async () => {
    const group = makeBlockGroup();
    const sections = [makeSection('sec1')];
    mockCurriculumSubjectFind([makeCurriculumSubject('subj1')]);
    mockSubjectFind([makeSubject('subj1', 'ENG101')]);

    // First run: no existing assignments
    mockAssignmentFind([]);
    BlockSubjectAssignment.insertMany.mockResolvedValue([]);
    const result1 = await autoAssignSubjectsFromCurriculum(group, sections, 'admin1');
    expect(result1.created).toBe(1);
    expect(result1.skipped).toBe(0);

    // Second run: existing assignment found
    mockAssignmentFind([{ blockSectionId: 'sec1', subjectId: 'subj1' }]);
    BlockSubjectAssignment.insertMany.mockClear();
    const result2 = await autoAssignSubjectsFromCurriculum(group, sections, 'admin1');
    expect(result2.created).toBe(0);
    expect(result2.skipped).toBe(1);
    expect(BlockSubjectAssignment.insertMany).not.toHaveBeenCalled();
  });

  test('BlockGroup without curriculumId returns warning, no assignments', async () => {
    const group = makeBlockGroup({ curriculumId: null });
    const sections = [makeSection('sec1')];

    const result = await autoAssignSubjectsFromCurriculum(group, sections, 'admin1');

    expect(result.created).toBe(0);
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(CurriculumSubject.find).not.toHaveBeenCalled();
  });

  test('BlockGroup with no sections returns warning, no assignments', async () => {
    const group = makeBlockGroup();
    const sections = [];

    const result = await autoAssignSubjectsFromCurriculum(group, sections, 'admin1');

    expect(result.created).toBe(0);
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(CurriculumSubject.find).not.toHaveBeenCalled();
  });

  test('multiple sections each get correct assignments', async () => {
    const group = makeBlockGroup();
    const sections = [makeSection('sec1'), makeSection('sec2'), makeSection('sec3')];
    mockCurriculumSubjectFind([
      makeCurriculumSubject('subj1'),
      makeCurriculumSubject('subj2'),
    ]);
    mockSubjectFind([
      makeSubject('subj1', 'ENG101'),
      makeSubject('subj2', 'MATH101'),
    ]);
    mockAssignmentFind([]);
    BlockSubjectAssignment.insertMany.mockResolvedValue([]);

    const result = await autoAssignSubjectsFromCurriculum(group, sections, 'admin1');

    expect(result.sections).toBe(3);
    expect(result.created).toBe(6); // 3 sections × 2 subjects
    // Verify insertMany got 6 docs
    const insertedDocs = BlockSubjectAssignment.insertMany.mock.calls[0][0];
    expect(insertedDocs).toHaveLength(6);
    // Verify each section appears
    const sectionIdsInDocs = new Set(insertedDocs.map((d) => d.blockSectionId));
    expect(sectionIdsInDocs.has('sec1')).toBe(true);
    expect(sectionIdsInDocs.has('sec2')).toBe(true);
    expect(sectionIdsInDocs.has('sec3')).toBe(true);
  });

  test('existing assignments are skipped, not duplicated', async () => {
    const group = makeBlockGroup();
    const sections = [makeSection('sec1')];
    mockCurriculumSubjectFind([
      makeCurriculumSubject('subj1'),
      makeCurriculumSubject('subj2'),
    ]);
    mockSubjectFind([
      makeSubject('subj1', 'ENG101'),
      makeSubject('subj2', 'MATH101'),
    ]);
    // subj1 already assigned
    mockAssignmentFind([{ blockSectionId: 'sec1', subjectId: 'subj1' }]);
    BlockSubjectAssignment.insertMany.mockResolvedValue([]);

    const result = await autoAssignSubjectsFromCurriculum(group, sections, 'admin1');

    expect(result.created).toBe(1); // only subj2
    expect(result.skipped).toBe(1); // subj1
    const insertedDocs = BlockSubjectAssignment.insertMany.mock.calls[0][0];
    expect(insertedDocs).toHaveLength(1);
    expect(insertedDocs[0].subjectId).toBe('subj2');
  });

  test('handles E11000 duplicate key gracefully (race condition)', async () => {
    const group = makeBlockGroup();
    const sections = [makeSection('sec1')];
    mockCurriculumSubjectFind([makeCurriculumSubject('subj1')]);
    mockSubjectFind([makeSubject('subj1', 'ENG101')]);
    mockAssignmentFind([]); // didn't find existing, but DB has it (race)

    // Simulate E11000 from insertMany
    const e11000Error = Object.assign(new Error('E11000 duplicate key'), {
      code: 11000,
      writeErrors: [{ code: 11000 }],
      insertedDocs: [],
    });
    BlockSubjectAssignment.insertMany.mockRejectedValue(e11000Error);

    const result = await autoAssignSubjectsFromCurriculum(group, sections, 'admin1');

    expect(result.created).toBe(0);
    expect(result.skipped).toBe(1);
    expect(result.errors.length).toBe(0);
  });

  test('no curriculum subjects found returns warning', async () => {
    const group = makeBlockGroup();
    const sections = [makeSection('sec1')];
    mockCurriculumSubjectFind([]);
    mockSubjectFind([]);
    mockAssignmentFind([]);

    const result = await autoAssignSubjectsFromCurriculum(group, sections, 'admin1');

    expect(result.created).toBe(0);
    expect(result.curriculumSubjectsFound).toBe(0);
    expect(result.warnings.length).toBeGreaterThan(0);
  });
});
