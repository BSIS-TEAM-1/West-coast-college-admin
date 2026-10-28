const crypto = require('crypto');
const ReEnrollmentVerification = require('../models/ReEnrollmentVerification');
const SystemSetting = require('../models/SystemSetting');
const VerificationEmailService = require('./verificationEmailService');
const SmsApiPhService = require('./smsApiPhService');
const TextlocalSmsService = require('./textlocalSmsService');
const { DEFAULT_SCHOOL_YEAR, DEFAULT_SEMESTER } = require('../lib/academicTerm');

const ACADEMIC_TERM_KEY = 'academicTerm';
const SCHOOL_YEAR_PATTERN = /^\d{4}-\d{4}$/;
const SEMESTERS = ['1st', '2nd', 'Summer'];
const TERM_ORDER = { '1st': 0, '2nd': 1, Summer: 2 };
const CODE_TTL_MINUTES = 15;
const VERIFICATION_TTL_MINUTES = 30;
const MAX_ATTEMPTS = 5;

const emailService = new VerificationEmailService();
const smsApiPhService = new SmsApiPhService();
const textlocalSmsService = new TextlocalSmsService();

function getActiveSmsService() {
  const provider = String(process.env.PHONE_AUTH_PROVIDER || 'sms-api-ph').trim().toLowerCase();
  return provider === 'textlocal' ? textlocalSmsService : smsApiPhService;
}
const HASH_SECRET = String(
  process.env.RE_ENROLLMENT_CODE_SECRET
  || process.env.JWT_SECRET
  || 'wcc-admin-dev-secret-change-in-production'
);

function verificationError(message, statusCode = 400, reasonCode = 'RE_ENROLLMENT_VERIFICATION_ERROR', details = undefined) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.reasonCode = reasonCode;
  if (details) error.details = details;
  return error;
}

function termOrder(semester) {
  return Object.prototype.hasOwnProperty.call(TERM_ORDER, String(semester))
    ? TERM_ORDER[String(semester)]
    : -1;
}

function schoolYearStart(schoolYear) {
  const start = Number(String(schoolYear || '').split('-')[0]);
  return Number.isFinite(start) ? start : null;
}

/** True when (aYear, aSem) falls strictly after (bYear, bSem). */
function isLaterTerm(aYear, aSem, bYear, bSem) {
  const aStart = schoolYearStart(aYear);
  const bStart = schoolYearStart(bYear);
  if (aStart == null || bStart == null) return false;
  if (aStart !== bStart) return aStart > bStart;
  return termOrder(aSem) > termOrder(bSem);
}

function generateCode() {
  return crypto.randomInt(0, 1_000_000).toString().padStart(6, '0');
}

function hashCode({ code, studentId, schoolYear, semester }) {
  return crypto
    .createHmac('sha256', HASH_SECRET)
    .update(`${String(studentId)}:${String(schoolYear)}:${String(semester)}:${String(code)}`)
    .digest('hex');
}

function hashesMatch(expected, provided) {
  const expectedBuffer = Buffer.from(String(expected || ''), 'hex');
  const providedBuffer = Buffer.from(String(provided || ''), 'hex');
  if (expectedBuffer.length !== providedBuffer.length) return false;
  return crypto.timingSafeEqual(expectedBuffer, providedBuffer);
}

function maskEmail(email) {
  const value = String(email || '').trim();
  const atIndex = value.indexOf('@');
  if (atIndex <= 0) return value ? '***' : '';
  const local = value.slice(0, atIndex);
  const domain = value.slice(atIndex + 1);
  const visible = local.slice(0, Math.min(2, local.length));
  return `${visible}${'*'.repeat(Math.max(1, local.length - visible.length))}@${domain}`;
}

function maskPhone(phone) {
  const digits = String(phone || '').replace(/\D/g, '');
  if (!digits) return '';
  return `${'*'.repeat(Math.max(0, digits.length - 4))}${digits.slice(-4)}`;
}

function fullName(student) {
  return [student?.firstName, student?.middleName, student?.lastName, student?.suffix]
    .map((part) => String(part || '').trim())
    .filter(Boolean)
    .join(' ')
    || String(student?.studentNumber || 'Student');
}

async function getActiveTerm() {
  const setting = await SystemSetting.findOne({ key: ACADEMIC_TERM_KEY }).lean();
  const value = setting?.value || {};
  const schoolYear = SCHOOL_YEAR_PATTERN.test(String(value.schoolYear || ''))
    ? String(value.schoolYear)
    : DEFAULT_SCHOOL_YEAR;
  const semester = SEMESTERS.includes(String(value.semester || ''))
    ? String(value.semester)
    : DEFAULT_SEMESTER;
  return { schoolYear, semester };
}

/**
 * A target term is ready only once the active term has reached the same school
 * year. That makes the rollover gate explicit: enrolling for a future school
 * year is blocked until the rollover advances the active term to that year.
 * A past term is blocked too, so re-enrollment stays forward-only.
 */
function getRolloverReadiness({ schoolYear, semester, activeTerm }) {
  if (!SCHOOL_YEAR_PATTERN.test(String(schoolYear || ''))) {
    return {
      ready: false,
      reasonCode: 'INVALID_TARGET_TERM',
      message: 'Target school year must be in YYYY-YYYY format.',
    };
  }
  if (!SEMESTERS.includes(String(semester || ''))) {
    return {
      ready: false,
      reasonCode: 'INVALID_TARGET_TERM',
      message: `Target semester must be one of ${SEMESTERS.join(', ')}.`,
    };
  }
  if (!activeTerm?.schoolYear) {
    return {
      ready: false,
      reasonCode: 'ACTIVE_TERM_MISSING',
      message: 'The active academic term is not configured. Set it before enrolling students.',
    };
  }

  const targetStart = schoolYearStart(schoolYear);
  const activeStart = schoolYearStart(activeTerm.schoolYear);
  if (targetStart == null || activeStart == null) {
    return {
      ready: false,
      reasonCode: 'INVALID_TARGET_TERM',
      message: 'Could not compare the target and active school years.',
    };
  }

  if (targetStart > activeStart) {
    return {
      ready: false,
      reasonCode: 'ROLLOVER_REQUIRED',
      message: `School year ${activeTerm.schoolYear} has not been rolled over yet. Complete the rollover before enrolling students for ${schoolYear}.`,
    };
  }
  if (targetStart < activeStart) {
    return {
      ready: false,
      reasonCode: 'PAST_TERM',
      message: `${schoolYear} is already in the past. The active academic term is ${activeTerm.schoolYear} ${activeTerm.semester}.`,
    };
  }
  if (isLaterTerm(activeTerm.schoolYear, activeTerm.semester, schoolYear, semester)) {
    return {
      ready: false,
      reasonCode: 'PAST_TERM',
      message: `${schoolYear} ${semester} is before the active academic term (${activeTerm.schoolYear} ${activeTerm.semester}).`,
    };
  }

  return { ready: true, reasonCode: null, message: '' };
}

function serializeVerification(record, email, phone = '', { includeCode = false } = {}) {
  const now = Date.now();
  const maskedEmail = maskEmail(email);
  const maskedPhone = maskPhone(phone);
  if (!record) {
    return {
      status: 'none',
      maskedEmail,
      maskedPhone,
      sentVia: [],
      sentAt: null,
      codeExpiresAt: null,
      verifiedAt: null,
      verificationExpiresAt: null,
      inAppCode: null,
    };
  }

  const verificationLive = record.verifiedAt
    && record.verificationExpiresAt
    && new Date(record.verificationExpiresAt).getTime() > now
    && !record.consumedAt;
  const codeLive = record.codeExpiresAt && new Date(record.codeExpiresAt).getTime() > now;
  const status = verificationLive ? 'verified' : codeLive ? 'sent' : 'expired';
  const inAppCode = (includeCode && codeLive && !verificationLive && !record.consumedAt)
    ? (record.inAppCode || null)
    : null;

  return {
    status,
    maskedEmail,
    maskedPhone,
    sentVia: Array.isArray(record.sentVia) ? record.sentVia : [],
    sentAt: record.lastSentAt || null,
    codeExpiresAt: record.codeExpiresAt || null,
    verifiedAt: record.verifiedAt || null,
    verificationExpiresAt: record.verificationExpiresAt || null,
    inAppCode,
  };
}

async function sendCode({ student, schoolYear, semester, actorId = null, returnCode = false }) {
  const email = String(student?.email || '').trim().toLowerCase();
  const phone = String(student?.contactNumber || '').trim();
  const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  const validPhone = /^\+?\d{10,15}$/.test(phone.replace(/[\s-]/g, ''));

  const activeTerm = await getActiveTerm();
  const readiness = getRolloverReadiness({ schoolYear, semester, activeTerm });
  if (!readiness.ready) {
    throw verificationError(readiness.message, 409, readiness.reasonCode);
  }
  const code = generateCode();
  const now = new Date();
  const codeExpiresAt = new Date(now.getTime() + CODE_TTL_MINUTES * 60 * 1000);
  const codeHash = hashCode({
    code,
    studentId: student._id,
    schoolYear,
    semester,
  });

  const deliveries = [];
  if (validEmail && emailService.isConfigured()) {
    deliveries.push({
      channel: 'email',
      send: () => emailService.sendVerificationCode({
        to: email,
        code,
        expiresInMinutes: CODE_TTL_MINUTES,
        displayName: fullName(student),
        subject: `Your West Coast College re-enrollment verification code for ${semester} ${schoolYear}`,
        purposeText: `re-enrollment verification code for ${semester} ${schoolYear}`,
      }),
    });
  }

  const smsService = getActiveSmsService();
  if (validPhone && smsService && typeof smsService.isConfigured === 'function' && smsService.isConfigured()) {
    deliveries.push({
      channel: 'sms',
      send: () => smsService.sendMessage({
        recipient: phone,
        message: `Your West Coast College re-enrollment verification code for ${semester} ${schoolYear} is ${code}. Valid for ${CODE_TTL_MINUTES} minutes.`,
      }),
    });
  }

  const deliveryResults = await Promise.allSettled(deliveries.map(({ send }) => send()));
  const sentVia = [];
  for (let i = 0; i < deliveryResults.length; i++) {
    if (deliveryResults[i].status === 'fulfilled') {
      sentVia.push(deliveries[i].channel);
    }
  }

  if (sentVia.length === 0) {
    sentVia.push('app');
  }

  const record = await ReEnrollmentVerification.findOneAndUpdate(
    { studentId: student._id, schoolYear, semester },
    {
      $set: {
        codeHash,
        codeExpiresAt,
        inAppCode: code,
        attempts: 0,
        lastSentAt: now,
        sentVia,
        requestedBy: actorId || null,
        verifiedAt: null,
        verificationExpiresAt: null,
        consumedAt: null,
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  const response = {
    record,
    maskedEmail: maskEmail(email),
    maskedPhone: maskPhone(phone),
    expiresAt: codeExpiresAt,
    verification: serializeVerification(record, email, phone, { includeCode: returnCode }),
  };
  
  if (returnCode) {
    response.code = code;
    response.inAppCode = code;
  }
  
  return response;
}

async function verifyCode({ studentId, schoolYear, semester, code, studentEmail = '', studentPhone = '' }) {
  const normalizedCode = String(code || '').trim();
  if (!/^\d{6}$/.test(normalizedCode)) {
    throw verificationError('Enter the 6-digit verification code sent to the student.', 400, 'INVALID_CODE_FORMAT');
  }

  const record = await ReEnrollmentVerification.findOne({ studentId, schoolYear, semester });
  if (!record) {
    throw verificationError(
      'No re-enrollment verification code was sent for this student and term. Send a new code first.',
      400,
      'CODE_NOT_FOUND'
    );
  }

  if (record.consumedAt) {
    throw verificationError(
      'This re-enrollment code was already used. Send a new code if the student needs another enrollment.',
      400,
      'CODE_ALREADY_USED'
    );
  }

  const now = new Date();
  if (record.verifiedAt && record.verificationExpiresAt && record.verificationExpiresAt > now) {
    return {
      record,
      verification: serializeVerification(record, studentEmail, studentPhone),
    };
  }
  if (!record.codeExpiresAt || record.codeExpiresAt <= now) {
    throw verificationError(
      'The re-enrollment verification code has expired. Send a new code to the student.',
      400,
      'CODE_EXPIRED'
    );
  }
  if (Number(record.attempts || 0) >= MAX_ATTEMPTS) {
    throw verificationError(
      'Too many incorrect code attempts. Send a new code to the student.',
      429,
      'TOO_MANY_ATTEMPTS'
    );
  }

  const providedHash = hashCode({ code: normalizedCode, studentId, schoolYear, semester });
  if (!hashesMatch(record.codeHash, providedHash)) {
    const updated = await ReEnrollmentVerification.findByIdAndUpdate(
      record._id,
      { $inc: { attempts: 1 } },
      { new: true }
    );
    const attemptsRemaining = Math.max(0, MAX_ATTEMPTS - Number(updated?.attempts || record.attempts + 1));
    throw verificationError(
      attemptsRemaining > 0
        ? `Incorrect code. ${attemptsRemaining} attempt${attemptsRemaining === 1 ? '' : 's'} remaining.`
        : 'Incorrect code. Too many attempts. Send a new code to the student.',
      400,
      'INVALID_CODE',
      { attemptsRemaining }
    );
  }

  const verificationExpiresAt = new Date(now.getTime() + VERIFICATION_TTL_MINUTES * 60 * 1000);
  const updated = await ReEnrollmentVerification.findByIdAndUpdate(
    record._id,
    {
      $set: {
        verifiedAt: now,
        verificationExpiresAt,
        inAppCode: null,
        attempts: 0,
        lastSentAt: record.lastSentAt || now,
      },
    },
    { new: true }
  );

  return {
    record: updated,
    verification: serializeVerification(updated, studentEmail, studentPhone),
  };
}

async function getVerificationsForStudents({ studentIds, schoolYear, semester }) {
  if (!Array.isArray(studentIds) || !studentIds.length) return new Map();
  const records = await ReEnrollmentVerification.find({
    studentId: { $in: studentIds },
    schoolYear,
    semester,
  }).lean();

  const byStudent = new Map();
  for (const record of records) {
    byStudent.set(String(record.studentId), record);
  }
  return byStudent;
}

async function findVerifiedEnrollment({ studentId, schoolYear, semester, session = null }) {
  const query = ReEnrollmentVerification.findOne({
    studentId,
    schoolYear,
    semester,
    verifiedAt: { $ne: null },
    verificationExpiresAt: { $gt: new Date() },
    consumedAt: null,
  });
  if (session) query.session(session);
  return query;
}

async function consumeVerification({ id, session }) {
  const query = ReEnrollmentVerification.updateOne(
    { _id: id, consumedAt: null },
    { $set: { consumedAt: new Date(), inAppCode: null } }
  );
  if (session) query.session(session);
  return query;
}

module.exports = {
  CODE_TTL_MINUTES,
  VERIFICATION_TTL_MINUTES,
  MAX_ATTEMPTS,
  getActiveTerm,
  getRolloverReadiness,
  maskEmail,
  maskPhone,
  serializeVerification,
  sendCode,
  verifyCode,
  getVerificationsForStudents,
  findVerifiedEnrollment,
  consumeVerification,
};
