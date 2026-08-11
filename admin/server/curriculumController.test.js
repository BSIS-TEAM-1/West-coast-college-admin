/**
 * Tests for Curriculum and CurriculumSubject controllers
 *
 * These tests use mock objects to validate controller logic without
 * requiring a live MongoDB connection. They follow the same pattern
 * as blockEligibilityService.test.js.
 */

// Mock mongoose before requiring controllers — needed for
// mongoose.startSession() used by createCurriculum's transaction.
jest.mock('mongoose', () => {
  const actual = jest.requireActual('mongoose');
  return {
    ...actual,
    startSession: jest.fn(),
  };
});
// Mock the mongoose models before requiring controllers
jest.mock('./models/Curriculum', () => ({
  findById: jest.fn(),
  findOne: jest.fn(),
  find: jest.fn(),
  create: jest.fn(),
  findByIdAndDelete: jest.fn(),
  exists: jest.fn(),
}));
jest.mock('./models/CurriculumSubject', () => ({
  find: jest.fn(),
  findById: jest.fn(),
  findOne: jest.fn(),
  countDocuments: jest.fn(),
  create: jest.fn(),
  findByIdAndDelete: jest.fn(),
  insertMany: jest.fn(),
  deleteMany: jest.fn(),
}));
jest.mock('./models/Enrollment', () => ({
  exists: jest.fn(),
}));
jest.mock('./models/Subject', () => ({
  findById: jest.fn(),
  find: jest.fn(),
}));

// Helper to make findById return a chainable that also resolves
function mockFindByIdSelect(doc) {
  return jest.fn().mockReturnValue({
    select: jest.fn().mockResolvedValue(doc),
  });
}

const Curriculum = require('./models/Curriculum');
const CurriculumSubject = require('./models/CurriculumSubject');
const Enrollment = require('./models/Enrollment');
const Subject = require('./models/Subject');
const mongoose = require('mongoose');
const CurriculumController = require('./controllers/curriculumController');
const CurriculumSubjectController = require('./controllers/curriculumSubjectController');

// Helper to create mock response
function mockRes() {
  const res = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  };
  return res;
}

// Helper to create mock request
function mockReq(body = {}, params = {}, query = {}, adminId = 'admin123') {
  return { body, params, query, adminId };
}

// Helper to create a mock transaction session. withTransaction runs the
// callback synchronously and returns its result; endSession is tracked so
// we can assert cleanup. The session object is also passed to create() /
// insertMany() via the { session } option, which the mocks ignore.
function mockSession() {
  const session = {
    withTransaction: jest.fn(async (fn) => fn()),
    endSession: jest.fn(),
  };
  mongoose.startSession.mockResolvedValue(session);
  return session;
}

describe('CurriculumController', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('createCurriculum', () => {
    test('creates curriculum with valid data', async () => {
      const createdDoc = {
        _id: 'curr1',
        programCode: 101,
        programName: 'BEED',
        version: '2026',
        status: 'Draft',
        name: 'BEED Curriculum 2026',
        toObject: () => ({ _id: 'curr1', programCode: 101, programName: 'BEED', version: '2026', status: 'Draft', name: 'BEED Curriculum 2026' }),
      };
      mockSession();
      Curriculum.findOne.mockResolvedValue(null);
      // create() is now called as Curriculum.create([{...}], { session }) and
      // the controller reads curriculum[0], so the mock must return an array.
      Curriculum.create.mockResolvedValue([createdDoc]);

      const req = mockReq({ programCode: 101, version: '2026', name: 'BEED Curriculum 2026' });
      const res = mockRes();

      await CurriculumController.createCurriculum(req, res);

      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({ programCode: 101, version: '2026' }),
        })
      );
    });

    test('rejects duplicate version for same program', async () => {
      Curriculum.findOne.mockResolvedValue({ _id: 'existing', programCode: 101, version: '2026' });

      const req = mockReq({ programCode: 101, version: '2026' });
      const res = mockRes();

      await CurriculumController.createCurriculum(req, res);

      expect(res.status).toHaveBeenCalledWith(409);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: false })
      );
    });

    test('rejects missing programCode', async () => {
      const req = mockReq({ version: '2026' });
      const res = mockRes();

      await CurriculumController.createCurriculum(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
    });

    test('creates curriculum with bulk subject placements and snapshots', async () => {
      const createdDoc = { _id: 'curr1', programCode: 101, programName: 'BEED', version: '2026', status: 'Draft', toObject: () => ({ _id: 'curr1', programCode: 101, programName: 'BEED', version: '2026', status: 'Draft' }) };
      mockSession();
      Curriculum.findOne.mockResolvedValue(null);
      Curriculum.create.mockResolvedValue([createdDoc]);
      // Subject.find returns a chainable select().lean()
      Subject.find.mockReturnValue({
        select: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue([
            { _id: 'subj1', code: 'ENG101', title: 'English 1', units: 3, lecturePeriods: 3, labPeriods: 0, isActive: true, status: 'Active', prerequisiteSubjectIds: [] },
            { _id: 'subj2', code: 'MATH101', title: 'Math 1', units: 3, lecturePeriods: 3, labPeriods: 0, isActive: true, status: 'Active', prerequisiteSubjectIds: [] },
          ]),
        }),
      });
      CurriculumSubject.insertMany.mockResolvedValue([]);

      const req = mockReq({
        programCode: 101,
        version: '2026',
        subjects: [
          { subjectId: 'subj1', yearLevel: 1, semester: '1st', prerequisiteSubjectIds: [] },
          { subjectId: 'subj2', yearLevel: 1, semester: '1st', prerequisiteSubjectIds: ['subj1'] },
        ],
      });
      const res = mockRes();

      await CurriculumController.createCurriculum(req, res);

      expect(res.status).toHaveBeenCalledWith(201);
      expect(CurriculumSubject.insertMany).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ curriculumId: 'curr1', subjectId: 'subj1', courseNo: 'ENG101', descriptiveTitle: 'English 1', units: 3 }),
          expect.objectContaining({ curriculumId: 'curr1', subjectId: 'subj2', prerequisiteSubjectIds: ['subj1'] }),
        ]),
        expect.objectContaining({ session: expect.anything() })
      );
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: true, message: expect.stringContaining('2 subject') })
      );
    });

    test('rejects bulk creation when a subject is placed twice', async () => {
      Curriculum.findOne.mockResolvedValue(null);
      Subject.find.mockReturnValue({
        select: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue([
            { _id: 'subj1', code: 'ENG101', title: 'English 1', units: 3, lecturePeriods: 3, labPeriods: 0, isActive: true, status: 'Active', prerequisiteSubjectIds: [] },
          ]),
        }),
      });

      const req = mockReq({
        programCode: 101,
        version: '2026',
        subjects: [
          { subjectId: 'subj1', yearLevel: 1, semester: '1st' },
          { subjectId: 'subj1', yearLevel: 2, semester: '1st' },
        ],
      });
      const res = mockRes();

      await CurriculumController.createCurriculum(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(Curriculum.create).not.toHaveBeenCalled();
      expect(CurriculumSubject.insertMany).not.toHaveBeenCalled();
    });

    test('rejects bulk creation when a subject is its own prerequisite', async () => {
      Curriculum.findOne.mockResolvedValue(null);
      Subject.find.mockReturnValue({
        select: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue([
            { _id: 'subj1', code: 'ENG101', title: 'English 1', units: 3, lecturePeriods: 3, labPeriods: 0, isActive: true, status: 'Active', prerequisiteSubjectIds: [] },
          ]),
        }),
      });

      const req = mockReq({
        programCode: 101,
        version: '2026',
        subjects: [{ subjectId: 'subj1', yearLevel: 1, semester: '1st', prerequisiteSubjectIds: ['subj1'] }],
      });
      const res = mockRes();

      await CurriculumController.createCurriculum(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(Curriculum.create).not.toHaveBeenCalled();
    });

    test('rejects bulk creation when a referenced subject does not exist', async () => {
      Curriculum.findOne.mockResolvedValue(null);
      Subject.find.mockReturnValue({
        select: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue([
            { _id: 'subj1', code: 'ENG101', title: 'English 1', units: 3, lecturePeriods: 3, labPeriods: 0, isActive: true, status: 'Active', prerequisiteSubjectIds: [] },
          ]),
        }),
      });

      const req = mockReq({
        programCode: 101,
        version: '2026',
        subjects: [{ subjectId: 'subj1', yearLevel: 1, semester: '1st', prerequisiteSubjectIds: ['missing-subj'] }],
      });
      const res = mockRes();

      await CurriculumController.createCurriculum(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(Curriculum.create).not.toHaveBeenCalled();
    });

    test('rolls back curriculum creation when CurriculumSubject.insertMany fails (no partial curriculum remains)', async () => {
      // Atomicity: if placement creation fails AFTER the curriculum doc is
      // created, the transaction must roll back so no partial curriculum
      // is left behind. The controller should return 500 and the session
      // must be ended (cleaned up).
      const createdDoc = { _id: 'curr1', programCode: 101, programName: 'BEED', version: '2026', status: 'Draft', toObject: () => ({ _id: 'curr1' }) };
      const session = mockSession();
      Curriculum.findOne.mockResolvedValue(null);
      Curriculum.create.mockResolvedValue([createdDoc]);
      Subject.find.mockReturnValue({
        select: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue([
            { _id: 'subj1', code: 'ENG101', title: 'English 1', units: 3, lecturePeriods: 3, labPeriods: 0, isActive: true, status: 'Active', prerequisiteSubjectIds: [] },
          ]),
        }),
      });
      // Simulate a failure during placement creation (e.g. duplicate-key
      // from a concurrent write, or a validation error at the DB layer).
      CurriculumSubject.insertMany.mockRejectedValue(new Error('E11000 duplicate key'));

      const req = mockReq({
        programCode: 101,
        version: '2026',
        subjects: [{ subjectId: 'subj1', yearLevel: 1, semester: '1st' }],
      });
      const res = mockRes();

      await CurriculumController.createCurriculum(req, res);

      // The transaction callback threw, so the controller surfaces a 500
      // (not a 201 with a partial shell). The session is ended for cleanup.
      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: false }));
      expect(session.endSession).toHaveBeenCalled();
      // In a real MongoDB transaction the rollback would be automatic; here
      // we assert the controller's contract: it does NOT report success and
      // it does NOT return a curriculum with partial placements.
      expect(res.json).not.toHaveBeenCalledWith(
        expect.objectContaining({ success: true })
      );
    });

    test('seeds from Subject.prerequisiteSubjectIds when no explicit prerequisites are supplied', async () => {
      const createdDoc = { _id: 'curr1', programCode: 101, programName: 'BEED', version: '2026', status: 'Draft', toObject: () => ({ _id: 'curr1' }) };
      mockSession();
      Curriculum.findOne.mockResolvedValue(null);
      Curriculum.create.mockResolvedValue([createdDoc]);
      // subj2 has a default prerequisite of subj1 on the Subject model.
      Subject.find.mockReturnValue({
        select: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue([
            { _id: 'subj1', code: 'ENG101', title: 'English 1', units: 3, lecturePeriods: 3, labPeriods: 0, isActive: true, status: 'Active', prerequisiteSubjectIds: [] },
            { _id: 'subj2', code: 'MATH101', title: 'Math 1', units: 3, lecturePeriods: 3, labPeriods: 0, isActive: true, status: 'Active', prerequisiteSubjectIds: ['subj1'] },
          ]),
        }),
      });
      CurriculumSubject.insertMany.mockResolvedValue([]);

      const req = mockReq({
        programCode: 101,
        version: '2026',
        subjects: [{ subjectId: 'subj2', yearLevel: 1, semester: '1st' }],
      });
      const res = mockRes();

      await CurriculumController.createCurriculum(req, res);

      expect(res.status).toHaveBeenCalledWith(201);
      // The placement for subj2 should have been seeded with subj1 as prereq
      expect(CurriculumSubject.insertMany).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ subjectId: 'subj2', prerequisiteSubjectIds: ['subj1'] }),
        ]),
        expect.objectContaining({ session: expect.anything() })
      );
    });

    test('uses explicit prerequisites when supplied (does not fall back to Subject defaults)', async () => {
      const createdDoc = { _id: 'curr1', programCode: 101, programName: 'BEED', version: '2026', status: 'Draft', toObject: () => ({ _id: 'curr1' }) };
      mockSession();
      Curriculum.findOne.mockResolvedValue(null);
      Curriculum.create.mockResolvedValue([createdDoc]);
      // subj2 defaults to [subj1], but the placement explicitly supplies [subj3].
      Subject.find.mockReturnValue({
        select: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue([
            { _id: 'subj1', code: 'ENG101', title: 'English 1', units: 3, lecturePeriods: 3, labPeriods: 0, isActive: true, status: 'Active', prerequisiteSubjectIds: [] },
            { _id: 'subj2', code: 'MATH101', title: 'Math 1', units: 3, lecturePeriods: 3, labPeriods: 0, isActive: true, status: 'Active', prerequisiteSubjectIds: ['subj1'] },
            { _id: 'subj3', code: 'PHYS101', title: 'Physics 1', units: 3, lecturePeriods: 3, labPeriods: 0, isActive: true, status: 'Active', prerequisiteSubjectIds: [] },
          ]),
        }),
      });
      CurriculumSubject.insertMany.mockResolvedValue([]);

      const req = mockReq({
        programCode: 101,
        version: '2026',
        subjects: [{ subjectId: 'subj2', yearLevel: 1, semester: '1st', prerequisiteSubjectIds: ['subj3'] }],
      });
      const res = mockRes();

      await CurriculumController.createCurriculum(req, res);

      expect(res.status).toHaveBeenCalledWith(201);
      // Should use subj3 (explicit), NOT subj1 (default)
      expect(CurriculumSubject.insertMany).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ subjectId: 'subj2', prerequisiteSubjectIds: ['subj3'] }),
        ]),
        expect.objectContaining({ session: expect.anything() })
      );
    });

    test('rejects when a referenced prerequisite subject does not exist', async () => {
      Curriculum.findOne.mockResolvedValue(null);
      Subject.find.mockReturnValue({
        select: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue([
            { _id: 'subj1', code: 'ENG101', title: 'English 1', units: 3, lecturePeriods: 3, labPeriods: 0, isActive: true, status: 'Active', prerequisiteSubjectIds: [] },
          ]),
        }),
      });

      const req = mockReq({
        programCode: 101,
        version: '2026',
        subjects: [{ subjectId: 'subj1', yearLevel: 1, semester: '1st', prerequisiteSubjectIds: ['nonexistent-prereq'] }],
      });
      const res = mockRes();

      await CurriculumController.createCurriculum(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(Curriculum.create).not.toHaveBeenCalled();
    });

    test('creates an empty Draft curriculum when subjects[] is omitted (backward compatibility)', async () => {
      const createdDoc = { _id: 'curr1', programCode: 101, programName: 'BEED', version: '2026', status: 'Draft', toObject: () => ({ _id: 'curr1', programCode: 101, programName: 'BEED', version: '2026', status: 'Draft' }) };
      mockSession();
      Curriculum.findOne.mockResolvedValue(null);
      Curriculum.create.mockResolvedValue([createdDoc]);

      const req = mockReq({ programCode: 101, version: '2026' });
      const res = mockRes();

      await CurriculumController.createCurriculum(req, res);

      expect(res.status).toHaveBeenCalledWith(201);
      expect(CurriculumSubject.insertMany).not.toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: true })
      );
    });

    test('creates a curriculum with multiple subjects each having independent prerequisites', async () => {
      const createdDoc = { _id: 'curr1', programCode: 101, programName: 'BEED', version: '2026', status: 'Draft', toObject: () => ({ _id: 'curr1' }) };
      mockSession();
      Curriculum.findOne.mockResolvedValue(null);
      Curriculum.create.mockResolvedValue([createdDoc]);
      Subject.find.mockReturnValue({
        select: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue([
            { _id: 's1', code: 'MATH101', title: 'College Algebra', units: 3, lecturePeriods: 3, labPeriods: 0, isActive: true, status: 'Active', prerequisiteSubjectIds: [] },
            { _id: 's2', code: 'MATH102', title: 'Trigonometry', units: 3, lecturePeriods: 3, labPeriods: 0, isActive: true, status: 'Active', prerequisiteSubjectIds: [] },
            { _id: 's3', code: 'MATH201', title: 'Calculus I', units: 3, lecturePeriods: 3, labPeriods: 0, isActive: true, status: 'Active', prerequisiteSubjectIds: [] },
            { _id: 's4', code: 'MATH202', title: 'Calculus II', units: 3, lecturePeriods: 3, labPeriods: 0, isActive: true, status: 'Active', prerequisiteSubjectIds: [] },
          ]),
        }),
      });
      CurriculumSubject.insertMany.mockResolvedValue([]);

      const req = mockReq({
        programCode: 101,
        version: '2026',
        subjects: [
          { subjectId: 's1', yearLevel: 1, semester: '1st', prerequisiteSubjectIds: [] },
          { subjectId: 's2', yearLevel: 1, semester: '2nd', prerequisiteSubjectIds: ['s1'] },
          { subjectId: 's3', yearLevel: 2, semester: '1st', prerequisiteSubjectIds: ['s2'] },
          { subjectId: 's4', yearLevel: 2, semester: '2nd', prerequisiteSubjectIds: ['s3'] },
        ],
      });
      const res = mockRes();

      await CurriculumController.createCurriculum(req, res);

      expect(res.status).toHaveBeenCalledWith(201);
      // Each placement must have its OWN independent prerequisites
      const inserted = CurriculumSubject.insertMany.mock.calls[0][0];
      expect(inserted).toHaveLength(4);
      expect(inserted.find(p => p.subjectId === 's1').prerequisiteSubjectIds).toEqual([]);
      expect(inserted.find(p => p.subjectId === 's2').prerequisiteSubjectIds).toEqual(['s1']);
      expect(inserted.find(p => p.subjectId === 's3').prerequisiteSubjectIds).toEqual(['s2']);
      expect(inserted.find(p => p.subjectId === 's4').prerequisiteSubjectIds).toEqual(['s3']);
    });
  });

  describe('patchStatus', () => {
    test('rejects activation with no subjects', async () => {
      Curriculum.findById.mockResolvedValue({
        _id: 'curr1',
        programCode: 101,
        status: 'Draft',
        save: jest.fn(),
      });
      CurriculumSubject.countDocuments.mockResolvedValue(0);

      const req = mockReq({ status: 'Active' }, { id: 'curr1' });
      const res = mockRes();

      await CurriculumController.patchStatus(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: false, message: expect.stringContaining('no subjects') })
      );
    });

    test('demotes existing active curriculum to Legacy when activating new one', async () => {
      const existingActive = {
        _id: 'old-active',
        status: 'Active',
        save: jest.fn(),
        updatedBy: null,
      };
      const newCurriculum = {
        _id: 'curr1',
        programCode: 101,
        status: 'Draft',
        save: jest.fn(),
        updatedBy: null,
      };

      Curriculum.findById.mockResolvedValue(newCurriculum);
      CurriculumSubject.countDocuments.mockResolvedValue(5);
      Curriculum.findOne.mockResolvedValue(existingActive);

      const req = mockReq({ status: 'Active' }, { id: 'curr1' });
      const res = mockRes();

      await CurriculumController.patchStatus(req, res);

      expect(existingActive.status).toBe('Legacy');
      expect(existingActive.save).toHaveBeenCalled();
      expect(newCurriculum.status).toBe('Active');
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: true })
      );
    });

    test('rejects reactivation of Archived curriculum', async () => {
      Curriculum.findById.mockResolvedValue({
        _id: 'curr1',
        status: 'Archived',
        save: jest.fn(),
      });

      const req = mockReq({ status: 'Active' }, { id: 'curr1' });
      const res = mockRes();

      await CurriculumController.patchStatus(req, res);

      expect(res.status).toHaveBeenCalledWith(403);
    });
  });

  describe('deleteCurriculum', () => {
    test('rejects deletion when enrollments reference it', async () => {
      Enrollment.exists.mockResolvedValue(true);

      const req = mockReq({}, { id: 'curr1' });
      const res = mockRes();

      await CurriculumController.deleteCurriculum(req, res);

      expect(res.status).toHaveBeenCalledWith(409);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: false, message: expect.stringContaining('enrollment') })
      );
    });

    test('deletes curriculum and its subjects when no enrollments', async () => {
      Enrollment.exists.mockResolvedValue(false);
      Curriculum.findByIdAndDelete.mockResolvedValue({ _id: 'curr1' });
      CurriculumSubject.deleteMany.mockResolvedValue({ deletedCount: 5 });

      const req = mockReq({}, { id: 'curr1' });
      const res = mockRes();

      await CurriculumController.deleteCurriculum(req, res);

      expect(Curriculum.findByIdAndDelete).toHaveBeenCalledWith('curr1');
      expect(CurriculumSubject.deleteMany).toHaveBeenCalledWith({ curriculumId: 'curr1' });
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: true })
      );
    });
  });

  describe('duplicateCurriculum', () => {
    test('duplicates curriculum with subjects', async () => {
      const source = {
        _id: 'curr1',
        programCode: 101,
        programName: 'BEED',
        version: '2023',
        code: 'BEED-2023',
        description: 'Test desc',
      };
      const duplicate = {
        _id: 'curr2',
        programCode: 101,
        programName: 'BEED',
        version: '2024',
        status: 'Draft',
        name: 'BEED Curriculum 2024',
      };

      Curriculum.findById.mockResolvedValue(source);
      Curriculum.findOne.mockResolvedValue(null);
      Curriculum.create.mockResolvedValue(duplicate);
      CurriculumSubject.find.mockReturnValue({
        lean: jest.fn().mockResolvedValue([
          { subjectId: 'subj1', yearLevel: 1, semester: '1st', type: 'General', isRequired: true, prerequisiteSubjectIds: [], displayOrder: 0 },
          { subjectId: 'subj2', yearLevel: 1, semester: '1st', type: 'Major', isRequired: true, prerequisiteSubjectIds: [], displayOrder: 1 },
        ]),
      });
      CurriculumSubject.insertMany.mockResolvedValue([]);

      const req = mockReq({ version: '2024' }, { id: 'curr1' });
      const res = mockRes();

      await CurriculumController.duplicateCurriculum(req, res);

      expect(Curriculum.create).toHaveBeenCalled();
      expect(CurriculumSubject.insertMany).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ subjectId: 'subj1', yearLevel: 1 }),
          expect.objectContaining({ subjectId: 'subj2', yearLevel: 1 }),
        ])
      );
      expect(res.status).toHaveBeenCalledWith(201);
    });

    test('rejects duplicate with existing version', async () => {
      Curriculum.findById.mockResolvedValue({ _id: 'curr1', programCode: 101, version: '2023' });
      Curriculum.findOne.mockResolvedValue({ _id: 'existing', version: '2024' });

      const req = mockReq({ version: '2024' }, { id: 'curr1' });
      const res = mockRes();

      await CurriculumController.duplicateCurriculum(req, res);

      expect(res.status).toHaveBeenCalledWith(409);
    });
  });
});

describe('CurriculumSubjectController', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('addSubject', () => {
    test('adds subject to curriculum successfully', async () => {
      Curriculum.findById = mockFindByIdSelect({ _id: 'curr1', status: 'Draft', programCode: 101 });
      Subject.findById = mockFindByIdSelect({ _id: 'subj1', code: 'ENG101', title: 'English', units: 3, isActive: true });
      CurriculumSubject.findOne.mockResolvedValue(null);
      CurriculumSubject.create.mockResolvedValue({
        _id: 'cs1',
        curriculumId: 'curr1',
        subjectId: 'subj1',
        yearLevel: 1,
        semester: '1st',
        type: 'General',
        isRequired: true,
      });
      CurriculumSubject.findById.mockReturnValue({
        populate: jest.fn().mockReturnValue({
          populate: jest.fn().mockReturnValue({
            lean: jest.fn().mockResolvedValue({
              _id: 'cs1',
              curriculumId: 'curr1',
              subjectId: 'subj1',
              subject: { _id: 'subj1', code: 'ENG101', title: 'English', units: 3 },
              yearLevel: 1,
              semester: '1st',
              type: 'General',
              isRequired: true,
            }),
          }),
        }),
      });

      const req = mockReq({
        subjectId: 'subj1',
        yearLevel: 1,
        semester: '1st',
        type: 'General',
        isRequired: true,
      }, { id: 'curr1' });
      const res = mockRes();

      await CurriculumSubjectController.addSubject(req, res);

      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: true })
      );
    });

    test('rejects duplicate placement', async () => {
      Curriculum.findById = mockFindByIdSelect({ _id: 'curr1', status: 'Draft' });
      Subject.findById = mockFindByIdSelect({ _id: 'subj1', code: 'ENG101', title: 'English', units: 3, isActive: true });
      CurriculumSubject.findOne.mockResolvedValue({ _id: 'existing-cs' });

      const req = mockReq({ subjectId: 'subj1', yearLevel: 1, semester: '1st' }, { id: 'curr1' });
      const res = mockRes();

      await CurriculumSubjectController.addSubject(req, res);

      expect(res.status).toHaveBeenCalledWith(409);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: false, message: expect.stringContaining('already placed') })
      );
    });

    test('rejects adding to archived curriculum', async () => {
      Curriculum.findById = mockFindByIdSelect({ _id: 'curr1', status: 'Archived' });

      const req = mockReq({ subjectId: 'subj1', yearLevel: 1, semester: '1st' }, { id: 'curr1' });
      const res = mockRes();

      await CurriculumSubjectController.addSubject(req, res);

      expect(res.status).toHaveBeenCalledWith(403);
    });

    test('rejects inactive subject', async () => {
      Curriculum.findById = mockFindByIdSelect({ _id: 'curr1', status: 'Draft' });
      Subject.findById = mockFindByIdSelect({ _id: 'subj1', code: 'ENG101', title: 'English', units: 3, isActive: false });

      const req = mockReq({ subjectId: 'subj1', yearLevel: 1, semester: '1st' }, { id: 'curr1' });
      const res = mockRes();

      await CurriculumSubjectController.addSubject(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: false, message: expect.stringContaining('inactive') })
      );
    });

    test('rejects missing required fields', async () => {
      const req = mockReq({ subjectId: 'subj1' }, { id: 'curr1' });
      const res = mockRes();

      await CurriculumSubjectController.addSubject(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
    });
  });

  describe('removeSubject', () => {
    test('removes subject from non-archived curriculum', async () => {
      Curriculum.findById = mockFindByIdSelect({ _id: 'curr1', status: 'Active' });
      CurriculumSubject.findByIdAndDelete.mockResolvedValue({ _id: 'cs1', curriculumId: 'curr1' });

      const req = mockReq({}, { id: 'curr1', curriculumSubjectId: 'cs1' });
      const res = mockRes();

      await CurriculumSubjectController.removeSubject(req, res);

      expect(CurriculumSubject.findByIdAndDelete).toHaveBeenCalledWith('cs1');
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: true })
      );
    });

    test('rejects removal from archived curriculum', async () => {
      Curriculum.findById = mockFindByIdSelect({ _id: 'curr1', status: 'Archived' });

      const req = mockReq({}, { id: 'curr1', curriculumSubjectId: 'cs1' });
      const res = mockRes();

      await CurriculumSubjectController.removeSubject(req, res);

      expect(res.status).toHaveBeenCalledWith(403);
    });
  });

  describe('getStructure', () => {
    test('returns structured year/semester/subjects layout', async () => {
      Curriculum.findById.mockReturnValue({
        select: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue({
            _id: 'curr1',
            programCode: 101,
            programName: 'BEED',
            version: '2026',
            status: 'Active',
          }),
        }),
      });

      const mockPopulateChain = {
        populate: jest.fn().mockReturnThis(),
        sort: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue([
          {
            _id: 'cs1',
            curriculumId: 'curr1',
            subjectId: { _id: 'subj1', code: 'ENG101', title: 'English', units: 3 },
            yearLevel: 1,
            semester: '1st',
            type: 'General',
            isRequired: true,
            // Snapshot fields — getStructure sums these (cs.units), NOT
            // subjectId.units. Fixture must match the CurriculumSubject schema.
            courseNo: 'ENG101',
            descriptiveTitle: 'English',
            units: 3,
            lecturePeriods: 3,
            labPeriods: 0,
            prerequisiteSubjectIds: [],
          },
          {
            _id: 'cs2',
            curriculumId: 'curr1',
            subjectId: { _id: 'subj2', code: 'MATH101', title: 'Math', units: 3 },
            yearLevel: 1,
            semester: '1st',
            type: 'Major',
            isRequired: true,
            courseNo: 'MATH101',
            descriptiveTitle: 'Math',
            units: 3,
            lecturePeriods: 3,
            labPeriods: 0,
            prerequisiteSubjectIds: [],
          },
        ]),
      };
      CurriculumSubject.find.mockReturnValue(mockPopulateChain);

      const req = mockReq({}, { id: 'curr1' });
      const res = mockRes();

      await CurriculumSubjectController.getStructure(req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({
            curriculum: expect.objectContaining({ programCode: 101 }),
            years: expect.arrayContaining([
              expect.objectContaining({
                yearLevel: 1,
                semesters: expect.arrayContaining([
                  expect.objectContaining({ semester: '1st', totalUnits: 6 }),
                ]),
              }),
            ]),
            summary: expect.objectContaining({ totalSubjects: 2, totalUnits: 6 }),
          }),
        })
      );
    });

    test('returns 404 for missing curriculum', async () => {
      Curriculum.findById.mockReturnValue({
        select: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue(null),
        }),
      });

      const req = mockReq({}, { id: 'nonexistent' });
      const res = mockRes();

      await CurriculumSubjectController.getStructure(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
    });
  });
});
