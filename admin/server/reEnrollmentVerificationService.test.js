/**
 * Unit tests for the re-enrollment email challenge. The service must never
 * return the six-digit code, must block a future school year until rollover,
 * and must expire/consume its verification window.
 */

const mockSendVerificationCode = jest.fn();
const mockSendSms = jest.fn();

jest.mock('./services/smsApiPhService', () => jest.fn().mockImplementation(() => ({
  isConfigured: () => true,
  sendMessage: mockSendSms,
})));

jest.mock('./services/textlocalSmsService', () => jest.fn().mockImplementation(() => ({
  isConfigured: () => true,
  sendMessage: mockSendSms,
})));

jest.mock('./models/ReEnrollmentVerification', () => ({
  findOne: jest.fn(),
  findOneAndUpdate: jest.fn(),
  findByIdAndUpdate: jest.fn(),
  find: jest.fn(),
  updateOne: jest.fn(),
}));

jest.mock('./models/SystemSetting', () => ({
  findOne: jest.fn(),
}));

jest.mock('./services/verificationEmailService', () => (
  jest.fn().mockImplementation(() => ({
    isConfigured: () => true,
    sendVerificationCode: mockSendVerificationCode,
  }))
));

const ReEnrollmentVerification = require('./models/ReEnrollmentVerification');
const SystemSetting = require('./models/SystemSetting');
const service = require('./services/reEnrollmentVerificationService');

function activeTermSetting(value) {
  return {
    lean: jest.fn(async () => ({ value })),
  };
}

const student = {
  _id: '64b000000000000000000001',
  studentNumber: '2026-101-0001',
  firstName: 'Ana',
  lastName: 'Cruz',
  email: 'ana.cruz@example.com',
  contactNumber: '09171234567',
};

function recordFromSend(update, overrides = {}) {
  return {
    _id: '64b000000000000000000099',
    studentId: student._id,
    schoolYear: '2026-2027',
    semester: '2nd',
    codeHash: update.$set.codeHash,
    codeExpiresAt: update.$set.codeExpiresAt,
    attempts: 0,
    lastSentAt: update.$set.lastSentAt,
    sentVia: update.$set.sentVia,
    verifiedAt: null,
    verificationExpiresAt: null,
    consumedAt: null,
    ...overrides,
  };
}

describe('reEnrollmentVerificationService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    SystemSetting.findOne.mockReturnValue(activeTermSetting({ schoolYear: '2026-2027', semester: '1st' }));
    ReEnrollmentVerification.findOneAndUpdate.mockImplementation(async (_filter, update) => recordFromSend(update));
  });

  test('sends a 6-digit code to the student and never returns it', async () => {
    const result = await service.sendCode({
      student,
      schoolYear: '2026-2027',
      semester: '2nd',
      actorId: 'admin-1',
    });

    expect(mockSendVerificationCode).toHaveBeenCalledTimes(1);
    expect(mockSendSms).toHaveBeenCalledTimes(1);
    const emailArgs = mockSendVerificationCode.mock.calls[0][0];
    const smsArgs = mockSendSms.mock.calls[0][0];
    expect(emailArgs.to).toBe('ana.cruz@example.com');
    expect(emailArgs.code).toMatch(/^\d{6}$/);
    expect(smsArgs.recipient).toBe('09171234567');
    expect(smsArgs.message).toContain(emailArgs.code);

    const [, update] = ReEnrollmentVerification.findOneAndUpdate.mock.calls[0];
    expect(update.$set.codeHash).not.toContain(emailArgs.code);
    expect(update.$set.sentVia).toEqual(['email', 'sms']);
    expect(result.maskedEmail).toBe('an******@example.com');
    expect(result.maskedPhone).toBe('*******4567');
    expect(result.verification.status).toBe('sent');
    expect(result.verification.sentVia).toEqual(['email', 'sms']);
    expect(JSON.stringify(result)).not.toContain(emailArgs.code);
  });

  test('blocks a future school year until the rollover advances the active term', async () => {
    SystemSetting.findOne.mockReturnValue(activeTermSetting({ schoolYear: '2026-2027', semester: '2nd' }));

    await expect(service.sendCode({
      student,
      schoolYear: '2027-2028',
      semester: '1st',
    })).rejects.toMatchObject({
      statusCode: 409,
      reasonCode: 'ROLLOVER_REQUIRED',
    });

    expect(mockSendVerificationCode).not.toHaveBeenCalled();
    expect(mockSendSms).not.toHaveBeenCalled();
    expect(ReEnrollmentVerification.findOneAndUpdate).not.toHaveBeenCalled();
  });

  test('accepts the next semester inside the active school year', async () => {
    SystemSetting.findOne.mockReturnValue(activeTermSetting({ schoolYear: '2026-2027', semester: '1st' }));
    const readiness = service.getRolloverReadiness({
      schoolYear: '2026-2027',
      semester: '2nd',
      activeTerm: { schoolYear: '2026-2027', semester: '1st' },
    });
    expect(readiness.ready).toBe(true);
  });

  test('verifies the emailed code and opens a live enrollment window', async () => {
    const sendResult = await service.sendCode({
      student,
      schoolYear: '2026-2027',
      semester: '2nd',
    });
    const [, update] = ReEnrollmentVerification.findOneAndUpdate.mock.calls[0];
    const record = recordFromSend(update);
    ReEnrollmentVerification.findOne.mockResolvedValue(record);
    ReEnrollmentVerification.findByIdAndUpdate.mockImplementation(async (_id, updateSet) => ({
      ...record,
      ...updateSet.$set,
    }));

    const code = mockSendVerificationCode.mock.calls[0][0].code;
    const result = await service.verifyCode({
      studentId: student._id,
      schoolYear: '2026-2027',
      semester: '2nd',
      code,
      studentEmail: student.email,
    });

    expect(result.verification.status).toBe('verified');
    expect(result.verification.verificationExpiresAt).toBeTruthy();
    expect(sendResult.verification.status).toBe('sent');
  });

  test('increments attempts for a wrong code', async () => {
    const sendResult = await service.sendCode({
      student,
      schoolYear: '2026-2027',
      semester: '2nd',
    });
    const [, update] = ReEnrollmentVerification.findOneAndUpdate.mock.calls[0];
    const record = recordFromSend(update);
    ReEnrollmentVerification.findOne.mockResolvedValue(record);
    ReEnrollmentVerification.findByIdAndUpdate.mockResolvedValue({ ...record, attempts: 1 });

    await expect(service.verifyCode({
      studentId: student._id,
      schoolYear: '2026-2027',
      semester: '2nd',
      code: '000000',
      studentEmail: student.email,
    })).rejects.toMatchObject({
      statusCode: 400,
      reasonCode: 'INVALID_CODE',
      details: { attemptsRemaining: 4 },
    });

    expect(ReEnrollmentVerification.findByIdAndUpdate).toHaveBeenCalledWith(
      record._id,
      { $inc: { attempts: 1 } },
      { new: true }
    );
    expect(sendResult.verification.status).toBe('sent');
  });

  test('rejects a code that has already been consumed by an enrollment', async () => {
    const sendResult = await service.sendCode({
      student,
      schoolYear: '2026-2027',
      semester: '2nd',
    });
    const [, update] = ReEnrollmentVerification.findOneAndUpdate.mock.calls[0];
    const record = recordFromSend(update, {
      verifiedAt: new Date(),
      verificationExpiresAt: new Date(Date.now() + 30 * 60_000),
      consumedAt: new Date(),
    });
    ReEnrollmentVerification.findOne.mockResolvedValue(record);

    await expect(service.verifyCode({
      studentId: student._id,
      schoolYear: '2026-2027',
      semester: '2nd',
      code: '123456',
      studentEmail: student.email,
    })).rejects.toMatchObject({
      statusCode: 400,
      reasonCode: 'CODE_ALREADY_USED',
    });
    expect(sendResult.verification.status).toBe('sent');
  });

  test('rejects an expired code', async () => {
    const sendResult = await service.sendCode({
      student,
      schoolYear: '2026-2027',
      semester: '2nd',
    });
    const [, update] = ReEnrollmentVerification.findOneAndUpdate.mock.calls[0];
    const record = recordFromSend(update, {
      codeExpiresAt: new Date(Date.now() - 60_000),
    });
    ReEnrollmentVerification.findOne.mockResolvedValue(record);

    await expect(service.verifyCode({
      studentId: student._id,
      schoolYear: '2026-2027',
      semester: '2nd',
      code: '123456',
      studentEmail: student.email,
    })).rejects.toMatchObject({
      statusCode: 400,
      reasonCode: 'CODE_EXPIRED',
    });
    expect(sendResult.verification.status).toBe('sent');
  });
});
