/**
 * Tests for Semester-Specific Certificate of Registration (COR).
 *
 * Verifies that:
 *  - 1st Semester COR displays only 1st Semester registered subjects.
 *  - 2nd Semester COR displays only 2nd Semester registered subjects.
 *  - Subjects from different semesters are never combined.
 *  - Dropped, removed, and DRP-marked subjects are excluded.
 *  - Retaken subjects only appear in the semester they are registered.
 *  - Duplicate subject rows within an enrollment are deduplicated.
 *  - Total units and lecture/lab breakdown reflect only the selected semester.
 *  - Historical CORs are preserved independently when other terms change.
 */

let objectIdCounter = 0;
class MockObjectId {
  constructor(val) {
    this.val = val || `00000000000000000000${++objectIdCounter}`.slice(-24);
  }
  toString() { return this.val; }
  valueOf() { return this.val; }
  static isValid() { return true; }
}

function MockSchema() {
  this.pre = jest.fn();
  this.post = jest.fn();
  this.index = jest.fn();
  this.virtual = jest.fn(() => ({ get: jest.fn() }));
  this.methods = {};
  this.statics = {};
}
MockSchema.Types = { ObjectId: MockObjectId, String, Number, Boolean, Date, Mixed: Object };

jest.mock('mongoose', () => ({
  Types: { ObjectId: MockObjectId },
  Schema: MockSchema,
  model: jest.fn(() => function MockModel() {})
}));

jest.mock('./models/Student', () => ({
  findById: jest.fn(),
  findOne: jest.fn()
}));

jest.mock('./models/Enrollment', () => ({
  findById: jest.fn(),
  findOne: jest.fn(),
  find: jest.fn()
}));

jest.mock('./models/StudentBlockAssignment', () => ({
  findOne: jest.fn(),
  find: jest.fn()
}));

jest.mock('./models/BlockSection', () => ({
  findById: jest.fn()
}));

jest.mock('./models/Curriculum', () => ({
  findActiveByProgram: jest.fn()
}));

jest.mock('./models/Admin', () => ({
  findById: jest.fn(),
  find: jest.fn()
}));

jest.mock('./models/AuditLog', () => ({
  create: jest.fn(async () => ({}))
}));

const Student = require('./models/Student');
const Enrollment = require('./models/Enrollment');
const StudentBlockAssignment = require('./models/StudentBlockAssignment');
const BlockSection = require('./models/BlockSection');
const Admin = require('./models/Admin');
const AuditLog = require('./models/AuditLog');
const StudentController = require('./controllers/studentController');
const CorPdfService = require('./services/corPdfService');

const chain = (value) => ({
  select: jest.fn().mockReturnThis(),
  sort: jest.fn().mockReturnThis(),
  populate: jest.fn().mockReturnThis(),
  lean: jest.fn(async () => value),
  then(resolve) { return Promise.resolve(value).then(resolve); }
});

function makeStudent(overrides = {}) {
  return {
    _id: new MockObjectId('student111111111111111111'),
    studentNumber: '202610198053',
    firstName: 'Lorenze',
    middleName: 'P',
    lastName: 'Prepotente',
    suffix: '',
    course: 101,
    yearLevel: 1,
    schoolYear: '2026-2027',
    semester: '2nd',
    gender: 'Male',
    birthDate: new Date('2004-05-15'),
    corStatus: 'Verified',
    registrationNumber: '2026999999',
    save: jest.fn(async () => {}),
    ...overrides
  };
}

describe('Semester-Specific Certificate of Registration (COR)', () => {
  const enrollment1stId = new MockObjectId('enr1111111111111111111111');
  const enrollment2ndId = new MockObjectId('enr2222222222222222222222');

  const subjects1stSem = [
    {
      _id: new MockObjectId(),
      subjectId: new MockObjectId(),
      code: 'ENG101',
      title: 'English Communication 1',
      units: 3,
      lectureUnits: 3,
      labUnits: 0,
      status: 'Enrolled',
      instructor: 'Prof. Smith',
      schedule: 'MTH 09:00-10:30 @ Room 101'
    },
    {
      _id: new MockObjectId(),
      subjectId: new MockObjectId(),
      code: 'MATH101',
      title: 'College Algebra',
      units: 3,
      lectureUnits: 3,
      labUnits: 0,
      status: 'Dropped', // officially dropped
      instructor: 'Prof. Davis',
      schedule: 'TF 10:30-12:00 @ Room 102'
    },
    {
      _id: new MockObjectId(),
      subjectId: new MockObjectId(),
      code: 'CS101',
      title: 'Intro to Computing Lab',
      units: 3,
      lectureUnits: 2,
      labUnits: 1,
      status: 'Enrolled',
      instructor: 'Prof. Alan',
      schedule: 'W 13:00-16:00 @ Lab 1'
    }
  ];

  const subjects2ndSem = [
    {
      _id: new MockObjectId(),
      subjectId: new MockObjectId(),
      code: 'ENG102',
      title: 'English Communication 2',
      units: 3,
      lectureUnits: 3,
      labUnits: 0,
      status: 'Enrolled',
      instructor: 'Prof. Smith',
      schedule: 'TF 09:00-10:30 @ Room 201'
    },
    {
      _id: new MockObjectId(),
      subjectId: new MockObjectId(),
      code: 'MATH101', // retake in 2nd semester
      title: 'College Algebra',
      units: 3,
      lectureUnits: 3,
      labUnits: 0,
      status: 'Enrolled',
      instructor: 'Prof. Euler',
      schedule: 'MTH 13:00-14:30 @ Room 202'
    },
    {
      _id: new MockObjectId(),
      subjectId: new MockObjectId(),
      code: 'GE102',
      title: 'Mathematics in the Modern World',
      units: 3,
      lectureUnits: 3,
      labUnits: 0,
      status: 'Enrolled',
      instructor: 'Prof. Gauss',
      schedule: 'W 08:00-11:00 @ Room 203'
    }
  ];

  const enrollment1st = {
    _id: enrollment1stId,
    studentId: 'student111111111111111111',
    schoolYear: '2026-2027',
    semester: '1st',
    yearLevel: 1,
    status: 'Completed',
    subjects: subjects1stSem,
    isCurrent: false,
    curriculumId: { name: 'BEED Curriculum', version: 2024 },
    markModified: jest.fn(),
    save: jest.fn(async () => {})
  };

  const enrollment2nd = {
    _id: enrollment2ndId,
    studentId: 'student111111111111111111',
    schoolYear: '2026-2027',
    semester: '2nd',
    yearLevel: 1,
    status: 'Enrolled',
    subjects: subjects2ndSem,
    isCurrent: true,
    curriculumId: { name: 'BEED Curriculum', version: 2024 },
    markModified: jest.fn(),
    save: jest.fn(async () => {})
  };

  beforeEach(() => {
    jest.clearAllMocks();
    Admin.find.mockReturnValue(chain([]));
    Admin.findById.mockReturnValue(chain({ displayName: "Registrar Jane Doe" }));
    StudentBlockAssignment.findOne.mockReturnValue(chain({ sectionId: 'sec101' }));
    BlockSection.findById.mockReturnValue(chain({ sectionCode: 'BEED-1A', name: 'BEED 1-A' }));
  });

  test('1. First Semester COR contains only 1st Semester registered subjects and excludes dropped subjects', async () => {
    const student = makeStudent();
    Enrollment.findOne.mockImplementation((query) => {
      if (query.semester === '1st') return chain(enrollment1st);
      if (query.semester === '2nd') return chain(enrollment2nd);
      return chain(null);
    });

    const corData = await StudentController.buildCorViewModel(student, {
      schoolYear: '2026-2027',
      semester: '1st'
    });

    expect(corData.student.semester).toBe('1st');
    expect(corData.student.schoolYear).toBe('2026-2027');
    
    // Only ENG101 and CS101 (MATH101 is dropped in 1st sem)
    const codes = corData.subjects.map((s) => s.code);
    expect(codes).toEqual(['ENG101', 'CS101']);
    expect(codes).not.toContain('ENG102');
    expect(codes).not.toContain('GE102');
    expect(codes).not.toContain('MATH101'); // dropped

    expect(corData.totals.subjects).toBe(2);
    expect(corData.totals.units).toBe(6);
    expect(corData.totals.lecture).toBe(5);
    expect(corData.totals.lab).toBe(1);
  });

  test('2. Second Semester COR contains only 2nd Semester registered subjects', async () => {
    const student = makeStudent();
    Enrollment.findOne.mockImplementation((query) => {
      if (query.semester === '1st') return chain(enrollment1st);
      if (query.semester === '2nd') return chain(enrollment2nd);
      return chain(null);
    });

    const corData = await StudentController.buildCorViewModel(student, {
      schoolYear: '2026-2027',
      semester: '2nd'
    });

    expect(corData.student.semester).toBe('2nd');
    expect(corData.student.schoolYear).toBe('2026-2027');

    const codes = corData.subjects.map((s) => s.code);
    expect(codes).toEqual(['ENG102', 'MATH101', 'GE102']);
    expect(codes).not.toContain('CS101'); // 1st sem only

    expect(corData.totals.subjects).toBe(3);
    expect(corData.totals.units).toBe(9);
  });

  test('3. Never combines First and Second Semester subjects into one COR (no "1st-2nd Sem")', async () => {
    const student = makeStudent();
    Enrollment.findOne.mockImplementation((query) => {
      if (query.semester === '1st') return chain(enrollment1st);
      if (query.semester === '2nd' || query.isCurrent) return chain(enrollment2nd);
      return chain(null);
    });

    const cor1st = await StudentController.buildCorViewModel(student, { semester: '1st' });
    const cor2nd = await StudentController.buildCorViewModel(student, { semester: '2nd' });

    expect(cor1st.student.semester).not.toBe('1st-2nd Sem');
    expect(cor2nd.student.semester).not.toBe('1st-2nd Sem');
    expect(cor1st.student.semester).toBe('1st');
    expect(cor2nd.student.semester).toBe('2nd');

    // Verify 1st sem COR does not contain 2nd sem exclusive subjects
    expect(cor1st.subjects.map((s) => s.code)).not.toContain('ENG102');
    // Verify 2nd sem COR does not contain 1st sem exclusive subjects
    expect(cor2nd.subjects.map((s) => s.code)).not.toContain('CS101');
  });

  test('4. Retaken subject appears only in the semester it was actually registered', async () => {
    const student = makeStudent();
    Enrollment.findOne.mockImplementation((query) => {
      if (query.semester === '1st') return chain(enrollment1st);
      if (query.semester === '2nd') return chain(enrollment2nd);
      return chain(null);
    });

    const cor1st = await StudentController.buildCorViewModel(student, { semester: '1st' });
    const cor2nd = await StudentController.buildCorViewModel(student, { semester: '2nd' });

    // MATH101 was dropped in 1st sem, retaken in 2nd sem
    expect(cor1st.subjects.map((s) => s.code)).not.toContain('MATH101');
    expect(cor2nd.subjects.map((s) => s.code)).toContain('MATH101');
  });

  test('5. Deduplicates duplicate subject entries within an enrollment record', async () => {
    const duplicateSubjects = [
      ...subjects2ndSem,
      { ...subjects2ndSem[0], _id: new MockObjectId() } // duplicate ENG102
    ];
    const enrWithDuplicates = { ...enrollment2nd, subjects: duplicateSubjects };
    
    Enrollment.findOne.mockReturnValue(chain(enrWithDuplicates));

    const corData = await StudentController.buildCorViewModel(makeStudent(), { semester: '2nd' });
    const eng102Count = corData.subjects.filter((s) => s.code === 'ENG102').length;
    expect(eng102Count).toBe(1);
    expect(corData.totals.subjects).toBe(3);
  });

  test('6. Resolves specific enrollment by enrollmentId', async () => {
    const student = makeStudent();
    Enrollment.findOne.mockImplementation((query) => {
      if (String(query._id) === String(enrollment1stId)) return chain(enrollment1st);
      return chain(null);
    });

    const corData = await StudentController.buildCorViewModel(student, {
      enrollmentId: enrollment1stId.toString()
    });

    expect(corData.enrollmentId).toBe(enrollment1stId.toString());
    expect(corData.student.semester).toBe('1st');
    expect(corData.subjects.map((s) => s.code)).toEqual(['ENG101', 'CS101']);
  });

  test('7. Throws 404 when requested term has no enrollment record', async () => {
    const student = makeStudent();
    Enrollment.findOne.mockReturnValue(chain(null));

    await expect(
      StudentController.buildCorViewModel(student, {
        schoolYear: '2024-2025',
        semester: 'Summer'
      })
    ).rejects.toThrow(/No official enrollment record found/);
  });

  test('8. Generating 2nd semester COR does not alter 1st semester enrollment or data (Historical preservation)', async () => {
    const student = makeStudent();
    Enrollment.findOne.mockImplementation((query) => {
      if (query.semester === '1st') return chain(enrollment1st);
      if (query.semester === '2nd') return chain(enrollment2nd);
      return chain(null);
    });

    // Generate 1st sem COR
    const cor1st = await StudentController.buildCorViewModel(student, { semester: '1st' });
    
    // Simulate updating 2nd sem subjects
    const modified2nd = {
      ...enrollment2nd,
      subjects: [
        ...subjects2ndSem,
        {
          _id: new MockObjectId(),
          subjectId: new MockObjectId(),
          code: 'NEW201',
          title: 'Advanced Seminar',
          units: 3,
          status: 'Enrolled'
        }
      ]
    };

    Enrollment.findOne.mockImplementation((query) => {
      if (query.semester === '1st') return chain(enrollment1st);
      if (query.semester === '2nd') return chain(modified2nd);
      return chain(null);
    });

    const cor2nd = await StudentController.buildCorViewModel(student, { semester: '2nd' });
    const cor1stAgain = await StudentController.buildCorViewModel(student, { semester: '1st' });

    // 2nd semester has new subject
    expect(cor2nd.subjects.map((s) => s.code)).toContain('NEW201');
    // 1st semester COR remains completely identical and untouched
    expect(cor1stAgain.subjects.map((s) => s.code)).toEqual(cor1st.subjects.map((s) => s.code));
    expect(cor1stAgain.totals.units).toBe(cor1st.totals.units);
  });

  test('9. Generates valid PDF buffer with PDFKit', async () => {
    Enrollment.findOne.mockReturnValue(chain(enrollment2nd));
    const corData = await StudentController.buildCorViewModel(makeStudent(), { semester: '2nd' });

    const pdfBuffer = await CorPdfService.generate(corData);
    expect(pdfBuffer).toBeInstanceOf(Buffer);
    expect(pdfBuffer.length).toBeGreaterThan(1000);
    // PDF magic number header
    expect(pdfBuffer.slice(0, 5).toString()).toBe('%PDF-');
  });

  test('10. generateCorPdf handler returns JSON when format=json is requested', async () => {
    const student = makeStudent();
    Student.findById.mockResolvedValue(student);
    Enrollment.findOne.mockReturnValue(chain(enrollment2nd));

    const req = {
      params: { id: student._id.toString() },
      query: { semester: '2nd', format: 'json' },
      headers: {}
    };

    const res = {
      json: jest.fn(),
      status: jest.fn().mockReturnThis()
    };

    await StudentController.generateCorPdf(req, res);

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        data: expect.objectContaining({
          student: expect.objectContaining({ semester: '2nd', schoolYear: '2026-2027' })
        })
      })
    );
  });

  test('11. Formats subject class block labels properly (not in raw code format)', () => {
    const helpers = CorPdfService.helpers;

    // Test formatClassBlockLabel
    expect(helpers.formatClassBlockLabel('101-1-A')).toBe('BEED-1A');
    expect(helpers.formatClassBlockLabel('101-1-A', 'BEED')).toBe('BEED-1A');
    expect(helpers.formatClassBlockLabel('102-1-A')).toBe('BSEd-English-1A');
    expect(helpers.formatClassBlockLabel('103-1-A')).toBe('BSEd-Math-1A');
    expect(helpers.formatClassBlockLabel('201-1-A')).toBe('BSBA-HRM-1A');
    expect(helpers.formatClassBlockLabel('BEED-2A')).toBe('BEED-2A');

    // Test buildSubjectRow formats raw code format '101-1-A' into 'BEED-1A'
    const subjectRow1 = helpers.buildSubjectRow(
      { code: 'ENG101', title: 'English Communication', units: 3, sectionCode: '101-1-A' },
      'BEED-1A'
    );
    expect(subjectRow1.block).toBe('BEED-1A');

    const subjectRow2 = helpers.buildSubjectRow(
      { code: 'MATH101', title: 'College Algebra', units: 3, sectionCode: '101-1-A' },
      'BEED-1A'
    );
    expect(subjectRow2.block).toBe('BEED-1A');

    const subjectRow3 = helpers.buildSubjectRow(
      { code: 'BEED201', title: 'Foundations of Early Childhood Education', units: 3, sectionCode: 'BEED-2A' },
      'BEED-2A'
    );
    expect(subjectRow3.block).toBe('BEED-2A');
  });
});
