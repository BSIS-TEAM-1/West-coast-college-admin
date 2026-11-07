/**
 * Applicant and Student are separate documents linked only by email. The
 * applicant approval copies the name across once, so correcting a name on the
 * student left the applicant queue showing the old spelling. These tests pin
 * the sync: name fields propagate, nothing else does, and a non-name edit
 * leaves the applicant untouched.
 */

jest.mock('./models/Student', () => ({
  findById: jest.fn(),
  findByIdAndUpdate: jest.fn(),
}));
jest.mock('./models/Applicant', () => ({
  findOne: jest.fn(),
  updateOne: jest.fn(),
}));
jest.mock('./models/AuditLog', () => ({ create: jest.fn() }));
jest.mock('./services/schoolYearLockService', () => ({ assertSchoolYearWritable: jest.fn() }));
jest.mock('./services/enrollmentGuard', () => ({ assertEnrolledRequirements: jest.fn() }));
jest.mock('./services/apiCache', () => ({ apiCache: { invalidatePrefix: jest.fn() } }));

const Student = require('./models/Student');
const Applicant = require('./models/Applicant');
const AuditLog = require('./models/AuditLog');
const { apiCache } = require('./services/apiCache');
const StudentController = require('./controllers/studentController');

function chain(value) {
  const result = {};
  for (const method of ['select', 'sort', 'session', 'populate']) {
    result[method] = jest.fn(() => result);
  }
  result.then = (onFulfilled, onRejected) => Promise.resolve(value).then(onFulfilled, onRejected);
  result.catch = (onRejected) => Promise.resolve(value).catch(onRejected);
  return result;
}

function withToObject(record) {
  return { ...record, toObject: () => ({ ...record }) };
}

const STUDENT = withToObject({
  _id: 'student-1',
  studentNumber: '2026-101-52211',
  firstName: 'Josh',
  middleName: 'Carinan',
  lastName: 'Carinan',
  suffix: '',
  email: 'lnfp2023-9707-52211@bicol-u.edu.ph',
  course: 101,
  yearLevel: 1,
  studentStatus: 'Regular',
  corStatus: 'Pending',
  lifecycleStatus: 'Pending',
  schoolYear: '2026-2027',
});

function mockApplicant(overrides = {}) {
  const applicant = {
    _id: 'applicant-1',
    firstName: 'Josh',
    middleName: 'Carinan',
    lastName: 'Carinan',
    suffix: '',
    phoneNumber: '09171234567',
    ...overrides,
  };
  Applicant.findOne.mockReturnValue(chain(applicant));
  return applicant;
}

describe('syncApplicantNameRecord', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Applicant.updateOne.mockResolvedValue({ modifiedCount: 1 });
  });

  test('propagates a corrected last name to the applicant', async () => {
    mockApplicant();

    const synced = await StudentController.syncApplicantNameRecord(
      { ...STUDENT, lastName: 'Carinan-Cruz' },
      STUDENT
    );

    expect(synced).toBe(true);
    expect(Applicant.updateOne).toHaveBeenCalledWith(
      { _id: 'applicant-1' },
      { $set: { lastName: 'Carinan-Cruz' } }
    );
    expect(apiCache.invalidatePrefix).toHaveBeenCalledWith('/api/registrar/applicants');
  });

  test('writes every name field that differs, and only those', async () => {
    mockApplicant({ firstName: 'Joshua', middleName: 'C', lastName: 'Karinan' });

    await StudentController.syncApplicantNameRecord(STUDENT, {
      ...STUDENT,
      firstName: 'Joshua',
      middleName: 'C',
      lastName: 'Karinan',
    });

    expect(Applicant.updateOne).toHaveBeenCalledWith(
      { _id: 'applicant-1' },
      { $set: { firstName: 'Josh', middleName: 'Carinan', lastName: 'Carinan' } }
    );
  });

  test('does nothing when the name did not change', async () => {
    const synced = await StudentController.syncApplicantNameRecord(STUDENT, STUDENT);

    expect(synced).toBe(false);
    expect(Applicant.findOne).not.toHaveBeenCalled();
    expect(Applicant.updateOne).not.toHaveBeenCalled();
  });

  test('clears middle name and suffix instead of storing empty strings', async () => {
    mockApplicant({ suffix: 'Jr.' });

    await StudentController.syncApplicantNameRecord(
      { ...STUDENT, middleName: '', suffix: '' },
      { ...STUDENT, suffix: 'Jr.' }
    );

    expect(Applicant.updateOne).toHaveBeenCalledWith(
      { _id: 'applicant-1' },
      { $unset: { middleName: '', suffix: '' } }
    );
  });

  test('never blanks the required first/last name on the applicant', async () => {
    mockApplicant({ firstName: 'Someone' });

    await StudentController.syncApplicantNameRecord({ ...STUDENT, firstName: '' }, {
      ...STUDENT,
      firstName: 'Someone',
    });

    expect(Applicant.updateOne).not.toHaveBeenCalled();
  });

  test('finds the applicant through the previous email when the email was edited too', async () => {
    mockApplicant();

    await StudentController.syncApplicantNameRecord(
      { ...STUDENT, lastName: 'Cruz', email: 'josh.cruz@example.com' },
      STUDENT
    );

    expect(Applicant.findOne).toHaveBeenCalledWith({
      email: { $in: ['lnfp2023-9707-52211@bicol-u.edu.ph', 'josh.cruz@example.com'] },
    });
  });

  test('returns false when no applicant matches the student', async () => {
    Applicant.findOne.mockReturnValue(chain(null));

    const synced = await StudentController.syncApplicantNameRecord(
      { ...STUDENT, lastName: 'Cruz' },
      STUDENT
    );

    expect(synced).toBe(false);
    expect(Applicant.updateOne).not.toHaveBeenCalled();
  });

  test('is a no-op when the applicant already has the new name', async () => {
    mockApplicant({ lastName: 'Cruz' });

    const synced = await StudentController.syncApplicantNameRecord(
      { ...STUDENT, lastName: 'Cruz' },
      STUDENT
    );

    expect(synced).toBe(false);
    expect(Applicant.updateOne).not.toHaveBeenCalled();
  });
});

describe('updateStudent wiring', () => {
  const updated = withToObject({ ...STUDENT, lastName: 'Cruz' });

  function mockResponse() {
    const res = {};
    res.status = jest.fn(() => res);
    res.json = jest.fn(() => res);
    return res;
  }

  beforeEach(() => {
    jest.clearAllMocks();
    AuditLog.create.mockResolvedValue({});
    Applicant.updateOne.mockResolvedValue({ modifiedCount: 1 });
    Student.findById
      .mockResolvedValueOnce(STUDENT)
      .mockResolvedValueOnce(updated);
    jest.spyOn(StudentController, 'updateStudentRecord').mockResolvedValue(updated);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('renames the applicant when the student name is edited', async () => {
    mockApplicant();

    const res = mockResponse();
    await StudentController.updateStudent(
      { params: { id: 'student-1' }, body: { lastName: 'Cruz' }, adminId: 'registrar-1', accountType: 'registrar' },
      res
    );

    expect(Applicant.updateOne).toHaveBeenCalledWith(
      { _id: 'applicant-1' },
      { $set: { lastName: 'Cruz' } }
    );
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true, applicantNameSynced: true }));
  });

  test('leaves the applicant alone when no name field is edited', async () => {
    StudentController.updateStudentRecord.mockResolvedValue(withToObject({ ...STUDENT, contactNumber: '09991234567' }));
    Student.findById.mockReset();
    Student.findById
      .mockResolvedValueOnce(STUDENT)
      .mockResolvedValueOnce(withToObject({ ...STUDENT, contactNumber: '09991234567' }));

    const res = mockResponse();
    await StudentController.updateStudent(
      { params: { id: 'student-1' }, body: { contactNumber: '09991234567' }, adminId: 'registrar-1', accountType: 'registrar' },
      res
    );

    expect(Applicant.findOne).not.toHaveBeenCalled();
    expect(Applicant.updateOne).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true, applicantNameSynced: false }));
  });
});
