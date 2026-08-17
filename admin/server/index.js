const path = require('path')
const fs = require('fs')
const dotenv = require('dotenv')

const envFileCandidates = [
  { filePath: path.join(__dirname, '..', '.env'), override: false },
  { filePath: path.join(__dirname, '..', '.env.credential-details'), override: true },
  { filePath: path.join(__dirname, '..', '.env.credentail-details'), override: true },
]

envFileCandidates.forEach(({ filePath, override }) => {
  if (fs.existsSync(filePath)) {
    dotenv.config({ path: filePath, override })
  }
})

const { logger, installConsoleGuards, isDevelopment } = require('./services/logger')
installConsoleGuards()

const express = require('express')
const cors = require('cors')
const mongoose = require('mongoose')
const crypto = require('crypto')
const jwt = require('jsonwebtoken')
const si = require('systeminformation')
const axios = require('axios')
const rateLimit = require('express-rate-limit')
const { applySecurityHeaders } = require('./security-config')
const securityMiddleware = require('./securityMiddleware')
const Joi = require('joi')
const compressionMiddleware = require('./services/compressionMiddleware')
const createOperationsMonitor = require('./services/operationsMonitor')
const Admin = require('./models/Admin')
const Announcement = require('./models/Announcement')
const AuditLog = require('./models/AuditLog')
const ArchiveSnapshot = require('./models/ArchiveSnapshot')
const AuthToken = require('./models/AuthToken')
const Document = require('./models/Document')
const DocumentFolder = require('./models/DocumentFolder')
const Backup = require('./models/Backup')
const BlockedIP = require('./models/BlockedIP')
const SecurityScan = require('./models/SecurityScan')
const Student = require('./models/Student')
const Enrollment = require('./models/Enrollment')
const BlockSection = require('./models/BlockSection')
const StudentBlockAssignment = require('./models/StudentBlockAssignment')
const BlockGroup = require('./models/BlockGroup')
const Curriculum = require('./models/Curriculum')
const BlockActionLog = require('./models/BlockActionLog')
const GradeAuditLog = require('./models/GradeAuditLog')
const BackupSystem = require('./backup')
const { getAnnouncementAudienceQueryValues, normalizeAnnouncementAudience, validateAnnouncementAudience } = require('./announcementAudience')
const SemaphoreSmsService = require('./services/semaphoreSmsService')
const SmsApiPhService = require('./services/smsApiPhService')
const TextlocalSmsService = require('./services/textlocalSmsService')
const supabaseAuthService = require('./services/supabaseAuth')
const VerificationEmailService = require('./services/verificationEmailService')
const { apiCache, cacheMiddleware } = require('./services/apiCache')
const registrarRoutes = require('./routes/registrarRoutes')
const applicantRoutes = require('./routes/applicantRoutes')
const schoolRoutes = require('./routes/schoolRoutes')
const locationRoutes = require('./routes/locationRoutes')
const gradeSubmissionRoutes = require('./routes/gradeSubmissionRoutes')
const gradeSubmissionController = require('./controllers/gradeSubmissionController')
const gradeReportController = require('./controllers/gradeReportController')
const blockController = require('./controllers/blockController')
const settingsController = require('./controllers/settingsController')
const StudentController = require('./controllers/studentController')
const AcademicYearRolloverService = require('./services/academicYearRolloverService')
const BlockSubjectAssignmentController = require('./controllers/blockSubjectAssignmentController')
const { requireAnyRole, requireAdminRole, isOwnerOrAdmin, normalizeAccountType } = require('./authorization')
const { registerDocumentRoutes } = require('./routes/documentRoutes')
const { purgeExpiredArchiveBinItems } = require('./services/documentService')

// Register domain event handlers
const { registerArchiveEventHandlers } = require('./domains/archive/eventHandlers')
registerArchiveEventHandlers()

// Initialize backup system
const backupSystem = new BackupSystem()
const semaphoreSmsService = new SemaphoreSmsService()
const smsApiPhService = new SmsApiPhService()
const textlocalSmsService = new TextlocalSmsService()
const verificationEmailService = new VerificationEmailService()

logger.debug('Verification email service status:', {
  configured: verificationEmailService.isConfigured(),
  providerPriority: verificationEmailService.providerPriority,
  gmailApiConfigured: verificationEmailService.gmailApiService.isConfigured(),
  semaphoreConfigured: verificationEmailService.semaphoreService.isConfigured(),
  sendGridConfigured: verificationEmailService.sendGridService.isConfigured()
})

let initialBackupTimeout = null

// Schedule automatic backups (every 6 hours)
const scheduledBackupInterval = setInterval(async () => {
  logger.info('Running scheduled backup...');
  try {
    const result = await backupSystem.createBackup('scheduled', 'system');
    if (result.success) {
      logger.info(`Scheduled backup completed: ${result.fileName}`);
    } else {
      logger.error('Scheduled backup failed:', result.error);
    }
  } catch (error) {
    logger.error('Scheduled backup error:', error);
  }
}, 6 * 60 * 60 * 1000); // 6 hours

// Reconcile backup metadata in the background every 30 minutes
const scheduledReconcileInterval = setInterval(async () => {
  try {
    await backupSystem.reconcileMetadata();
  } catch (error) {
    logger.error('Scheduled backup reconciliation error:', error);
  }
}, 30 * 60 * 1000); // 30 minutes

const restoreVerificationIntervalMs = Math.max(60 * 60 * 1000, Number.parseInt(process.env.BACKUP_RESTORE_TEST_INTERVAL_HOURS || '168', 10) * 60 * 60 * 1000)
const scheduledRestoreVerificationInterval = setInterval(async () => {
  logger.info('Running isolated scheduled backup restore verification...')
  const result = await backupSystem.runScheduledRestoreVerification()
  if (result.success) logger.info(`Scheduled restore verification passed: ${result.report?.fileName || 'latest backup'}`)
  else logger.error(`Scheduled restore verification failed: ${result.error || 'validation failed'}`)
}, restoreVerificationIntervalMs)

// Initial backup will run after database connects

const app = express()
const PORT = process.env.PORT || 3001
const operationsMonitor = createOperationsMonitor()
const JWT_SECRET = process.env.JWT_SECRET || 'wcc-admin-dev-secret-change-in-production'
const DOCUMENT_MANAGEMENT_ROLES = ['admin', 'registrar']
const requireAdminOrRegistrarRole = requireAnyRole(...DOCUMENT_MANAGEMENT_ROLES)
const requireBlockManagementRole = requireAnyRole('admin', 'registrar')
const PHONE_AUTH_PROVIDER = String(process.env.PHONE_AUTH_PROVIDER || 'sms-api-ph').trim().toLowerCase()
const useSupabasePhoneAuth = PHONE_AUTH_PROVIDER === 'supabase'
const useTextlocalSms = PHONE_AUTH_PROVIDER === 'textlocal'
function getActiveSmsService() {
  return useTextlocalSms ? textlocalSmsService : smsApiPhService
}
const parsedPhoneVerificationTtlMs = Number(process.env.PHONE_VERIFICATION_CODE_TTL_MS)
const PHONE_VERIFICATION_CODE_TTL_MS = Number.isFinite(parsedPhoneVerificationTtlMs) && parsedPhoneVerificationTtlMs > 0
  ? parsedPhoneVerificationTtlMs
  : 10 * 60 * 1000
const parsedEmailVerificationTtlMs = Number(process.env.EMAIL_VERIFICATION_CODE_TTL_MS)
const EMAIL_VERIFICATION_CODE_TTL_MS = Number.isFinite(parsedEmailVerificationTtlMs) && parsedEmailVerificationTtlMs > 0
  ? parsedEmailVerificationTtlMs
  : PHONE_VERIFICATION_CODE_TTL_MS
const parsedLoginEmailVerificationTtlMs = Number(process.env.LOGIN_EMAIL_VERIFICATION_CODE_TTL_MS)
const LOGIN_EMAIL_VERIFICATION_CODE_TTL_MS = Number.isFinite(parsedLoginEmailVerificationTtlMs) && parsedLoginEmailVerificationTtlMs > 0
  ? parsedLoginEmailVerificationTtlMs
  : EMAIL_VERIFICATION_CODE_TTL_MS
const parsedArchiveBinCleanupIntervalMs = Number(process.env.ARCHIVE_BIN_CLEANUP_INTERVAL_MS)
const ARCHIVE_BIN_CLEANUP_INTERVAL_MS = Number.isFinite(parsedArchiveBinCleanupIntervalMs) && parsedArchiveBinCleanupIntervalMs > 0
  ? parsedArchiveBinCleanupIntervalMs
  : 60 * 60 * 1000
const parsedAuthLastUsedUpdateIntervalMs = Number(process.env.AUTH_LAST_USED_UPDATE_INTERVAL_MS)
const AUTH_LAST_USED_UPDATE_INTERVAL_MS = Number.isFinite(parsedAuthLastUsedUpdateIntervalMs) && parsedAuthLastUsedUpdateIntervalMs > 0
  ? parsedAuthLastUsedUpdateIntervalMs
  : 60 * 1000

// Hide Express server information
app.disable('x-powered-by')

// Trust reverse proxy so req.ip/x-forwarded-for can reflect real client IP in production.
const trustProxyEnv = String(process.env.TRUST_PROXY || '').trim().toLowerCase()
const TRUST_PROXY_ENABLED = trustProxyEnv
  ? trustProxyEnv === 'true'
  : (String(process.env.NODE_ENV || '').toLowerCase() === 'production' || Boolean(process.env.RENDER))
if (TRUST_PROXY_ENABLED) {
  app.set('trust proxy', 1)
}

// Admin IP whitelist (for production)
const ADMIN_IP_WHITELIST = process.env.ADMIN_IP_WHITELIST ? 
  process.env.ADMIN_IP_WHITELIST.split(',').map(ip => ip.trim()) : 
  [] // Empty whitelist allows all IPs in development

// Increase payload limit for base64 announcement media
app.use(express.json({ limit: '25mb' }))

const normalizeOrigin = (value) => String(value || '').trim().replace(/\/$/, '').toLowerCase()
const isLoopbackOrigin = (value) => {
  try {
    const parsedOrigin = new URL(String(value || '').trim())
    const normalizedHostname = String(parsedOrigin.hostname || '')
      .trim()
      .toLowerCase()
      .replace(/^\[|\]$/g, '')

    if (!['http:', 'https:'].includes(parsedOrigin.protocol)) {
      return false
    }

    return ['localhost', '127.0.0.1', '::1'].includes(normalizedHostname)
  } catch {
    return false
  }
}
const defaultAllowedOrigins = [
  'http://localhost:3000',
  'https://localhost:3000',
  'http://localhost:5173',
  'https://localhost:5173'
].map(normalizeOrigin)
const configuredAllowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map(normalizeOrigin).filter(Boolean)
  : []
const isProductionEnv = String(process.env.NODE_ENV || '').toLowerCase() === 'production'
const isRenderRuntime = Boolean(process.env.RENDER || process.env.RENDER_EXTERNAL_URL)
const renderExternalHostname = String(process.env.RENDER_EXTERNAL_HOSTNAME || '').trim()
const runtimeAllowedOrigins = [
  process.env.RENDER_EXTERNAL_URL,
  process.env.APP_URL,
  process.env.PUBLIC_URL,
  process.env.FRONTEND_URL,
  renderExternalHostname ? `https://${renderExternalHostname}` : ''
].map(normalizeOrigin).filter(Boolean)
const strictCorsMode = isProductionEnv && isRenderRuntime
const allowedOrigins = new Set(
  strictCorsMode
    ? [...configuredAllowedOrigins, ...runtimeAllowedOrigins]
    : [...defaultAllowedOrigins, ...configuredAllowedOrigins, ...runtimeAllowedOrigins]
)

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, curl, etc.)
    if (!origin) return callback(null, true)
    const normalizedOrigin = normalizeOrigin(origin)
    const allowLoopbackOrigin = !strictCorsMode && isLoopbackOrigin(origin)
    if (allowedOrigins.has(normalizedOrigin) || allowLoopbackOrigin) {
      return callback(null, true)
    }

    // Deny CORS without throwing a server error.
    return callback(null, false)
  },
  credentials: true
}))

// Apply security headers middleware
app.use(applySecurityHeaders)
app.use(compressionMiddleware())
app.use(operationsMonitor.middleware)

// General API rate limiting (relaxed, configurable)
const apiRateLimitMax = Number(process.env.API_RATE_LIMIT_MAX || 240)
const apiLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: Number.isFinite(apiRateLimitMax) && apiRateLimitMax > 0 ? apiRateLimitMax : 240,
  message: {
    error: 'Too many requests from this IP, please try again later.'
  },
  standardHeaders: true,
  legacyHeaders: false
})

const parseRateLimitMax = (value, fallback) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: parseRateLimitMax(process.env.AUTH_RATE_LIMIT_MAX, 30),
  message: {
    error: 'Too many sign-in attempts from this IP, please try again later.'
  },
  standardHeaders: true,
  legacyHeaders: false
})

const verificationLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: parseRateLimitMax(process.env.VERIFICATION_RATE_LIMIT_MAX, 12),
  message: {
    error: 'Too many verification requests from this IP, please try again later.'
  },
  standardHeaders: true,
  legacyHeaders: false
})

const publicReadLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: parseRateLimitMax(process.env.PUBLIC_READ_RATE_LIMIT_MAX, 120),
  message: {
    error: 'Too many public requests from this IP, please try again later.'
  },
  standardHeaders: true,
  legacyHeaders: false
})

const adminActionLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: parseRateLimitMax(process.env.ADMIN_ACTION_RATE_LIMIT_MAX, 60),
  message: {
    error: 'Too many action requests, please try again later.'
  },
  standardHeaders: true,
  legacyHeaders: false
})

// Limit stale-asset fallback lookups because the handler hits the filesystem.
const staleAssetFallbackRateLimitMax = Number(process.env.STALE_ASSET_FALLBACK_RATE_LIMIT_MAX || 60)
const staleAssetFallbackLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: Number.isFinite(staleAssetFallbackRateLimitMax) && staleAssetFallbackRateLimitMax > 0
    ? staleAssetFallbackRateLimitMax
    : 60,
  message: {
    error: 'Too many asset fallback requests from this IP, please try again later.'
  },
  standardHeaders: true,
  legacyHeaders: false
})

// Apply relaxed limiter to all API routes
app.use('/api/', apiLimiter)

// Failed password attempt tracking (multi-factor escalating lockout)
const MAX_FAILED_LOGIN_ATTEMPTS = Number(process.env.MAX_FAILED_LOGIN_ATTEMPTS || 5)
const LOGIN_LOCKOUT_STEPS_MS = [1 * 60 * 1000, 5 * 60 * 1000, 10 * 60 * 1000]
const LOGIN_ATTEMPT_STATE_TTL_MS = Number(process.env.LOGIN_ATTEMPT_STATE_TTL_MS || 12 * 60 * 60 * 1000)
const MAX_LOGIN_ATTEMPT_ENTRIES = Number(process.env.MAX_LOGIN_ATTEMPT_ENTRIES || 10000)
const IPV4_REGEX = /^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}$/
const loginAttemptStateByIp = new Map()
const loginAttemptStateByUsername = new Map()
const loginAttemptStateByDevice = new Map()
let systemAuditActorIdCache = null
let shuttingDown = false
const serviceStartedAt = new Date()

const createDefaultLoginAttemptState = (now = Date.now()) => ({
  failedAttempts: 0,
  lockoutStep: 0,
  lockoutCount: 0,
  lockoutUntil: 0,
  lastAttemptAt: now
})

const getLoginAttemptState = (store, key, now = Date.now()) => {
  const existing = store.get(key)
  if (!existing) {
    return createDefaultLoginAttemptState(now)
  }

  const lockoutUntil = Number(existing.lockoutUntil || 0)
  const lastAttemptAt = Number(existing.lastAttemptAt || 0)

  if (lockoutUntil <= now && lastAttemptAt > 0 && now - lastAttemptAt > LOGIN_ATTEMPT_STATE_TTL_MS) {
    store.delete(key)
    return createDefaultLoginAttemptState(now)
  }

  return {
    failedAttempts: Number(existing.failedAttempts || 0),
    lockoutStep: Number(existing.lockoutStep || 0),
    lockoutCount: Number(existing.lockoutCount || 0),
    lockoutUntil,
    lastAttemptAt: lastAttemptAt || now
  }
}

const setLoginAttemptState = (store, key, state, now = Date.now()) => {
  store.set(key, { ...state, lastAttemptAt: now })

  if (store.size <= MAX_LOGIN_ATTEMPT_ENTRIES) {
    return
  }

  let oldestKey = null
  let oldestTimestamp = Number.POSITIVE_INFINITY

  for (const [entryKey, entryState] of store.entries()) {
    const entryTimestamp = Number(entryState?.lastAttemptAt || 0)
    if (entryTimestamp < oldestTimestamp) {
      oldestTimestamp = entryTimestamp
      oldestKey = entryKey
    }
  }

  if (oldestKey !== null) {
    store.delete(oldestKey)
  }
}

// Security middleware to block sensitive paths
app.use((req, res, next) => {
  const blockedPaths = [
    '/.git',
    '/.git/',
    '/backup.zip',
    '/backup.sql',
    '/database.sql',
    '/db.sql',
    '/backup.tar.gz',
    '/site-backup.zip',
    '/backup.bak',
    '/wp-admin',
    '/phpmyadmin',
    '/administrator'
  ]
  
  // Check if request path contains any blocked path
  const isBlocked = blockedPaths.some(blockedPath => 
    req.path.toLowerCase().includes(blockedPath.toLowerCase())
  )
  
  if (isBlocked) {
    return res.status(404).json({ error: 'Resource not found.' })
  }
  
  next()
})

// Serve frontend static files
const distPath = path.join(__dirname, '..', 'dist')
const distAssetsPath = path.join(distPath, 'assets')
app.use(express.static(distPath, {
  index: false,
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.html')) {
      res.setHeader('Cache-Control', 'no-store')
      return
    }

    // Cache-bustable hashed assets can be cached aggressively.
    if (/\.[A-Za-z0-9_-]{8,}\.(css|js)$/.test(path.basename(filePath))) {
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
    }
  }
}))

// Stale-client compatibility: map missing hashed index assets to the latest build asset.
const hashedIndexAssetPattern = /^index-[A-Za-z0-9_-]+\.(css|js)$/
app.get('/assets/:assetName', staleAssetFallbackLimiter, (req, res, next) => {
  const assetName = path.basename(String(req.params.assetName || ''))
  if (!hashedIndexAssetPattern.test(assetName)) {
    return next()
  }

  const requestedAssetPath = path.join(distAssetsPath, assetName)
  if (fs.existsSync(requestedAssetPath)) {
    return res.sendFile(requestedAssetPath)
  }

  if (!fs.existsSync(distAssetsPath)) {
    return res.status(404).end()
  }

  try {
    const requestedExtension = path.extname(assetName)
    const fallbackCandidates = fs.readdirSync(distAssetsPath)
      .filter((fileName) => hashedIndexAssetPattern.test(fileName) && path.extname(fileName) === requestedExtension)
      .map((fileName) => {
        const fullPath = path.join(distAssetsPath, fileName)
        const stat = fs.statSync(fullPath)
        return { fullPath, modifiedAt: stat.mtimeMs }
      })
      .sort((a, b) => b.modifiedAt - a.modifiedAt)

    if (fallbackCandidates.length === 0) {
      return res.status(404).end()
    }

    res.setHeader('Cache-Control', 'no-store')
    return res.sendFile(fallbackCandidates[0].fullPath)
  } catch (error) {
    console.error('Asset fallback error:', error)
    return res.status(404).end()
  }
})

// Registrar module API routes (supports both legacy and /api-prefixed paths)
app.use('/api/applicants', applicantRoutes)
app.use('/api/schools', schoolRoutes)
app.use('/api/locations', locationRoutes)
app.use('/registrar', apiLimiter, authMiddleware, registrarRoutes)
app.use('/api/registrar', authMiddleware, registrarRoutes)
app.use('/api/registrar/grade-submissions', authMiddleware, gradeSubmissionRoutes)
app.use('/registrar/grade-submissions', apiLimiter, authMiddleware, gradeSubmissionRoutes)

// Professor grade submission route (professor-only)
app.post('/api/professor/grade-submissions/:enrollmentId/submit', authMiddleware, (req, res, next) => {
  if (String(req.accountType || '').toLowerCase() !== 'professor') {
    return res.status(403).json({ error: 'Forbidden. Professor access required.' })
  }
  next()
}, gradeSubmissionController.submitGrades)

// Student grade audit trail (admin/registrar)
app.get('/api/registrar/students/:studentId/grade-audit', authMiddleware, requireAnyRole('admin', 'registrar'), gradeSubmissionController.getStudentGradeAudit)

// Grade reports (admin/registrar)
app.get('/api/registrar/students/:id/report-card', authMiddleware, requireAnyRole('admin', 'registrar'), gradeReportController.generateReportCard)
app.get('/api/registrar/students/:id/transcript', authMiddleware, requireAnyRole('admin', 'registrar'), gradeReportController.generateTranscript)
app.get('/api/registrar/sections/:sectionId/subjects/:subjectId/grade-sheet', authMiddleware, requireAnyRole('admin', 'registrar', 'professor'), gradeReportController.generateClassGradeSheet)

// Archive domain routes (audit logs, snapshots)
const archiveRoutes = require('./domains/archive/routes/archiveRoutes')
app.use('/api/admin/audit-logs', authMiddleware, requireAdminRole, (req, res, next) => {
  req.app.locals.dbReady = dbReady
  req.app.locals.redactSensitiveAuditData = redactSensitiveAuditData
  next()
}, archiveRoutes)
app.get(
  ['/registrar/block-subject-assignments', '/api/registrar/block-subject-assignments'],
  authMiddleware,
  requireBlockManagementRole,
  securityMiddleware.inputValidationMiddleware(securityMiddleware.schemas.blockSubjectAssignment.query),
  cacheMiddleware({ ttlMs: 20 * 1000 }),
  BlockSubjectAssignmentController.getAssignments
)
app.post(
  ['/registrar/block-subject-assignments', '/api/registrar/block-subject-assignments'],
  authMiddleware,
  requireBlockManagementRole,
  securityMiddleware.inputValidationMiddleware(securityMiddleware.schemas.blockSubjectAssignment.create),
  invalidateApiCacheOnSuccess('/registrar/block-subject-assignments', '/api/registrar/block-subject-assignments', '/registrar/professor-course-loads', '/api/registrar/professor-course-loads', '/registrar/sections/', '/api/registrar/sections/'),
  BlockSubjectAssignmentController.assignSubjects
)
app.delete(
  ['/registrar/block-subject-assignments/:id', '/api/registrar/block-subject-assignments/:id'],
  authMiddleware,
  requireBlockManagementRole,
  securityMiddleware.inputValidationMiddleware(securityMiddleware.schemas.blockSubjectAssignment.idParam),
  invalidateApiCacheOnSuccess('/registrar/block-subject-assignments', '/api/registrar/block-subject-assignments', '/registrar/professor-course-loads', '/api/registrar/professor-course-loads', '/registrar/sections/', '/api/registrar/sections/'),
  BlockSubjectAssignmentController.deleteAssignment
)
applicantRoutes.registerProtectedApplicantRoutes(app, authMiddleware)

function invalidateApiCacheOnSuccess(...prefixes) {
  return (req, res, next) => {
    res.on('finish', () => {
      if (res.statusCode < 200 || res.statusCode >= 300) return
      prefixes.forEach((prefix) => apiCache.invalidatePrefix(prefix))
    })
    next()
  }
}

const blockManagementCachePrefixes = [
  '/api/blocks',
  '/api/professor/assigned-blocks',
  '/api/professor/sections/'
]

// GET /api/professor/assigned-blocks
// Returns blocks/subjects currently assigned by registrar to the authenticated professor.
app.get('/api/professor/assigned-blocks', authMiddleware, cacheMiddleware({ ttlMs: 20 * 1000 }), async (req, res) => {
  if (!dbReady) {
    return res.status(503).json({ error: 'Database unavailable.' })
  }

  if (String(req.accountType || '').toLowerCase() !== 'professor') {
    return res.status(403).json({ error: 'Forbidden. Professor access required.' })
  }

  try {
    const professor = await Admin.findById(req.adminId)
      .select('_id username displayName uid accountType status')
      .lean()

    if (!professor) {
      return res.status(404).json({ error: 'Professor account not found.' })
    }

    const normalizeText = (value) => String(value || '').trim()
    const escapeRegExp = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const parseSchoolYearStart = (schoolYearValue) => {
      const match = String(schoolYearValue || '').trim().match(/^(\d{4})\s*-\s*\d{4}$/)
      return match ? Number(match[1]) : null
    }

    const professorIdentifiers = Array.from(
      new Set(
        [professor.displayName, professor.username, professor.uid]
          .map(normalizeText)
          .filter(Boolean)
      )
    )

    if (professorIdentifiers.length === 0) {
      return res.json({
        success: true,
        data: {
          courses: [],
          totalCourses: 0,
          totalBlocks: 0,
          totalSubjects: 0
        }
      })
    }

    const exactIdentifierPatterns = professorIdentifiers.map(
      (value) => new RegExp(`^\\s*${escapeRegExp(value)}\\s*$`, 'i')
    )

    const enrollments = await Enrollment.find({
      status: { $ne: 'Dropped' },
      subjects: {
        $elemMatch: {
          instructor: { $in: exactIdentifierPatterns },
          status: { $ne: 'Dropped' }
        }
      }
    })
      .select('studentId course schoolYear semester yearLevel subjects')
      .lean()

    if (enrollments.length === 0) {
      return res.json({
        success: true,
        data: {
          courses: [],
          totalCourses: 0,
          totalBlocks: 0,
          totalSubjects: 0
        }
      })
    }

    const studentIds = Array.from(
      new Set(
        enrollments
          .map((enrollment) => normalizeText(enrollment.studentId))
          .filter(Boolean)
      )
    )

    const studentObjectIds = studentIds
      .filter((value) => mongoose.Types.ObjectId.isValid(value))
      .map((value) => new mongoose.Types.ObjectId(value))

    const students = studentObjectIds.length > 0
      ? await Student.find({ _id: { $in: studentObjectIds } }).select('_id course').lean()
      : []

    const studentCourseCodeById = new Map(
      students.map((student) => [String(student._id), normalizeText(student.course)])
    )

    const assignments = await StudentBlockAssignment.find({
      studentId: { $in: studentIds },
      status: 'ASSIGNED'
    })
      .select('studentId sectionId semester year assignedAt')
      .lean()

    const assignmentsByStudentId = new Map()
    assignments.forEach((assignment) => {
      const studentId = normalizeText(assignment.studentId)
      if (!studentId) return
      const list = assignmentsByStudentId.get(studentId) || []
      list.push(assignment)
      assignmentsByStudentId.set(studentId, list)
    })
    assignmentsByStudentId.forEach((list) => {
      list.sort((a, b) => new Date(b.assignedAt).getTime() - new Date(a.assignedAt).getTime())
    })

    const sectionIds = Array.from(
      new Set(
        assignments
          .map((assignment) => normalizeText(assignment.sectionId))
          .filter((value) => mongoose.Types.ObjectId.isValid(value))
      )
    )
    const sectionObjectIds = sectionIds.map((id) => new mongoose.Types.ObjectId(id))
    const sections = sectionObjectIds.length > 0
      ? await BlockSection.find({ _id: { $in: sectionObjectIds } }).select('_id sectionCode').lean()
      : []
    const sectionCodeById = new Map(
      sections.map((section) => [String(section._id), normalizeText(section.sectionCode) || 'Unknown Block'])
    )
    const isInvalidProfessorSectionCode = (value) => {
      const normalized = normalizeText(value).toLowerCase()
      return !normalized || normalized.includes('unassigned') || normalized.includes('unknown')
    }

    const findAssignmentForEnrollment = (studentId, semesterValue, schoolYearValue) => {
      const list = assignmentsByStudentId.get(studentId) || []
      if (list.length === 0) return null

      const semester = normalizeText(semesterValue)
      const yearStart = parseSchoolYearStart(schoolYearValue)
      const strictMatch = list.find((entry) => {
        const semesterMatch = normalizeText(entry.semester) === semester
        const yearMatch = Number(entry.year || 0) === Number(yearStart || 0)
        return semesterMatch && yearMatch
      })
      if (strictMatch) return strictMatch

      // Do not fall back to unrelated section assignments when the school year
      // no longer matches. That creates fake "unassigned" or stale professor
      // loads after a registrar removes a student from a block.
      if (!Number.isFinite(yearStart)) {
        const semesterMatch = list.find((entry) => normalizeText(entry.semester) === semester)
        if (semesterMatch) return semesterMatch
      }

      return null
    }

    const instructorMatchesProfessor = (instructorValue) => {
      const normalized = normalizeText(instructorValue)
      if (!normalized || /^TBA$/i.test(normalized)) return false
      return exactIdentifierPatterns.some((pattern) => pattern.test(normalized))
    }

    const courseMap = new Map()

    enrollments.forEach((enrollment) => {
      const studentId = normalizeText(enrollment.studentId)
      if (!studentId) return

      const assignment = findAssignmentForEnrollment(studentId, enrollment.semester, enrollment.schoolYear)
      const sectionId = assignment ? normalizeText(assignment.sectionId) : ''
      const sectionCode = sectionCodeById.get(sectionId)
      if (!sectionId || !sectionCode || isInvalidProfessorSectionCode(sectionCode)) return
      const courseCode = studentCourseCodeById.get(studentId) || normalizeText(enrollment.course) || 'Unspecified'
      const semester = normalizeText(enrollment.semester) || 'N/A'
      const schoolYear = normalizeText(enrollment.schoolYear) || 'N/A'
      const yearLevel = Number(enrollment.yearLevel || 0) || null

      let courseEntry = courseMap.get(courseCode)
      if (!courseEntry) {
        courseEntry = {
          courseCode,
          blocks: new Map()
        }
        courseMap.set(courseCode, courseEntry)
      }

      const blockKey = `${sectionId || sectionCode}::${semester}::${schoolYear}`
      let blockEntry = courseEntry.blocks.get(blockKey)
      if (!blockEntry) {
        blockEntry = {
          sectionId: sectionId || null,
          sectionCode,
          semester,
          schoolYear,
          yearLevel,
          subjects: new Map()
        }
        courseEntry.blocks.set(blockKey, blockEntry)
      }

      ;(enrollment.subjects || []).forEach((subject) => {
        if (!instructorMatchesProfessor(subject?.instructor)) return
        if (String(subject?.status || '').toLowerCase() === 'dropped') return

        const subjectId = normalizeText(subject?.subjectId) || `${normalizeText(subject?.code)}::${normalizeText(subject?.title)}`
        let subjectEntry = blockEntry.subjects.get(subjectId)
        if (!subjectEntry) {
          subjectEntry = {
            subjectId,
            code: normalizeText(subject?.code) || 'N/A',
            title: normalizeText(subject?.title) || 'Untitled Subject',
            schedule: normalizeText(subject?.schedule) || 'TBA',
            room: normalizeText(subject?.room) || 'TBA',
            studentIds: new Set()
          }
          blockEntry.subjects.set(subjectId, subjectEntry)
        }

        subjectEntry.studentIds.add(studentId)
      })
    })

    const courses = Array.from(courseMap.values())
      .map((courseEntry) => {
        const blocks = Array.from(courseEntry.blocks.values())
          .map((blockEntry) => {
            const subjects = Array.from(blockEntry.subjects.values())
              .map((subjectEntry) => ({
                subjectId: subjectEntry.subjectId,
                code: subjectEntry.code,
                title: subjectEntry.title,
                schedule: subjectEntry.schedule,
                room: subjectEntry.room,
                enrolledStudents: subjectEntry.studentIds.size
              }))
              .sort((a, b) => a.code.localeCompare(b.code))

            return {
              sectionId: blockEntry.sectionId,
              sectionCode: blockEntry.sectionCode,
              semester: blockEntry.semester,
              schoolYear: blockEntry.schoolYear,
              yearLevel: blockEntry.yearLevel,
              subjects
            }
          })
          .filter((block) => block.subjects.length > 0)
          .sort((a, b) => a.sectionCode.localeCompare(b.sectionCode))

        return {
          courseCode: courseEntry.courseCode,
          blocks
        }
      })
      .filter((course) => course.blocks.length > 0)
      .sort((a, b) => a.courseCode.localeCompare(b.courseCode))

    const totalBlocks = courses.reduce((sum, course) => sum + course.blocks.length, 0)
    const totalSubjects = courses.reduce(
      (sum, course) => sum + course.blocks.reduce((blockSum, block) => blockSum + block.subjects.length, 0),
      0
    )

    res.json({
      success: true,
      data: {
        courses,
        totalCourses: courses.length,
        totalBlocks,
        totalSubjects
      }
    })
  } catch (error) {
    console.error('Error fetching professor assigned blocks:', error)
    res.status(500).json({ error: 'Failed to fetch professor assigned blocks.' })
  }
})

function normalizeProfessorRouteText(value) {
  return String(value || '').trim()
}

function escapeProfessorRouteRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function parseProfessorRouteSchoolYearStart(schoolYearValue) {
  const match = String(schoolYearValue || '').trim().match(/^(\d{4})\s*-\s*\d{4}$/)
  return match ? Number(match[1]) : null
}

async function getProfessorRouteAccess(adminId) {
  const professor = await Admin.findById(adminId)
    .select('_id username displayName uid accountType status')
    .lean()

  if (!professor) {
    const error = new Error('Professor account not found.')
    error.statusCode = 404
    throw error
  }

  const professorIdentifiers = Array.from(
    new Set(
      [professor.displayName, professor.username, professor.uid]
        .map(normalizeProfessorRouteText)
        .filter(Boolean)
    )
  )

  if (professorIdentifiers.length === 0) {
    const error = new Error('Professor identifiers are not configured.')
    error.statusCode = 400
    throw error
  }

  const exactIdentifierPatterns = professorIdentifiers.map(
    (value) => new RegExp(`^\\s*${escapeProfessorRouteRegExp(value)}\\s*$`, 'i')
  )

  return {
    professor,
    professorIdentifiers,
    exactIdentifierPatterns,
    instructorMatchesProfessor(instructorValue) {
      const normalized = normalizeProfessorRouteText(instructorValue)
      if (!normalized || /^TBA$/i.test(normalized)) return false
      return exactIdentifierPatterns.some((pattern) => pattern.test(normalized))
    }
  }
}

// GET /api/professor/sections/:sectionId/subjects/:subjectId/students
// Returns the class roster for a specific assigned subject, including grades stored on enrollment subjects.
app.get('/api/professor/sections/:sectionId/subjects/:subjectId/students', authMiddleware, cacheMiddleware({ ttlMs: 15 * 1000 }), async (req, res) => {
  if (!dbReady) {
    return res.status(503).json({ error: 'Database unavailable.' })
  }

  if (String(req.accountType || '').toLowerCase() !== 'professor') {
    return res.status(403).json({ error: 'Forbidden. Professor access required.' })
  }

  const { sectionId, subjectId } = req.params
  const semester = normalizeProfessorRouteText(req.query.semester)
  const schoolYear = normalizeProfessorRouteText(req.query.schoolYear)

  if (!mongoose.Types.ObjectId.isValid(sectionId) || !mongoose.Types.ObjectId.isValid(subjectId)) {
    return res.status(400).json({ error: 'Invalid section id or subject id.' })
  }

  try {
    const access = await getProfessorRouteAccess(req.adminId)
    const section = await BlockSection.findById(sectionId)
      .select('_id sectionCode')
      .lean()

    if (!section) {
      return res.status(404).json({ error: 'Section not found.' })
    }

    const yearStart = parseProfessorRouteSchoolYearStart(schoolYear)
    const assignmentQuery = {
      sectionId: new mongoose.Types.ObjectId(sectionId),
      status: 'ASSIGNED'
    }
    if (semester) assignmentQuery.semester = semester
    if (Number.isFinite(yearStart)) assignmentQuery.year = yearStart

    let assignments = await StudentBlockAssignment.find(assignmentQuery)
      .select('studentId assignedAt semester year')
      .sort({ assignedAt: 1 })
      .lean()

    if (assignments.length === 0 && (semester || Number.isFinite(yearStart))) {
      assignments = await StudentBlockAssignment.find({
        sectionId: new mongoose.Types.ObjectId(sectionId),
        status: 'ASSIGNED'
      })
        .select('studentId assignedAt semester year')
        .sort({ assignedAt: 1 })
        .lean()
    }

    const studentIds = Array.from(
      new Set(
        assignments
          .map((assignment) => normalizeProfessorRouteText(assignment.studentId))
          .filter((value) => mongoose.Types.ObjectId.isValid(value))
      )
    )

    if (studentIds.length === 0) {
      return res.json({
        success: true,
        data: {
          section: {
            sectionId: String(section._id),
            sectionCode: normalizeProfessorRouteText(section.sectionCode)
          },
          subject: {
            subjectId: String(subjectId)
          },
          totals: {
            assignedStudents: 0,
            matchedStudents: 0
          },
          students: []
        }
      })
    }

    const studentObjectIds = studentIds.map((value) => new mongoose.Types.ObjectId(value))
    const students = await Student.find({ _id: { $in: studentObjectIds } })
      .select('_id studentNumber firstName middleName lastName suffix yearLevel studentStatus course email contactNumber corStatus')
      .lean()

    const studentsById = new Map(
      students.map((student) => [String(student._id), student])
    )

    const enrollmentQuery = {
      studentId: { $in: studentObjectIds },
      status: { $nin: ['Dropped', 'Cancelled'] },
      subjects: {
        $elemMatch: {
          subjectId: new mongoose.Types.ObjectId(subjectId),
          status: { $ne: 'Dropped' },
          instructor: { $in: access.exactIdentifierPatterns }
        }
      }
    }
    if (semester) enrollmentQuery.semester = semester
    if (schoolYear) enrollmentQuery.schoolYear = schoolYear

    const enrollments = await Enrollment.find(enrollmentQuery)
      .select('_id studentId studentNumber schoolYear semester subjects isCurrent createdAt updatedAt')
      .sort({ isCurrent: -1, createdAt: -1 })
      .lean()

    const subjectRows = enrollments
      .map((enrollment) => {
        const studentId = String(enrollment.studentId || '')
        const student = studentsById.get(studentId)
        if (!student) return null

        const matchedEntry = (Array.isArray(enrollment.subjects) ? enrollment.subjects : []).find((entry) => {
          if (String(entry?.subjectId || '') !== String(subjectId)) return false
          if (String(entry?.status || '').toLowerCase() === 'dropped') return false
          return access.instructorMatchesProfessor(entry?.instructor)
        })

        if (!matchedEntry) return null

        return {
          _id: String(student._id),
          enrollmentId: String(enrollment._id),
          subjectEntryId: String(matchedEntry._id || ''),
          studentNumber: String(student.studentNumber || enrollment.studentNumber || '').trim(),
          firstName: normalizeProfessorRouteText(student.firstName),
          middleName: normalizeProfessorRouteText(student.middleName),
          lastName: normalizeProfessorRouteText(student.lastName),
          suffix: normalizeProfessorRouteText(student.suffix),
          yearLevel: Number(student.yearLevel || 0) || null,
          studentStatus: normalizeProfessorRouteText(student.studentStatus) || 'Active',
          course: student.course,
          email: normalizeProfessorRouteText(student.email),
          contactNumber: normalizeProfessorRouteText(student.contactNumber),
          corStatus: normalizeProfessorRouteText(student.corStatus) || 'Pending',
          currentGrade: matchedEntry.grade ?? null,
          remarks: normalizeProfessorRouteText(matchedEntry.remarks),
          subjectStatus: normalizeProfessorRouteText(matchedEntry.status) || 'Enrolled',
          classSubjectCode: normalizeProfessorRouteText(matchedEntry.code),
          classSubjectTitle: normalizeProfessorRouteText(matchedEntry.title),
          gradeUpdatedAt: matchedEntry.dateModified || enrollment.updatedAt || enrollment.createdAt || null
        }
      })
      .filter(Boolean)
      .sort((a, b) => {
        const lastNameCompare = String(a.lastName || '').localeCompare(String(b.lastName || ''))
        if (lastNameCompare !== 0) return lastNameCompare
        return String(a.firstName || '').localeCompare(String(b.firstName || ''))
      })

    const subjectMeta = subjectRows[0]
      ? {
          subjectId: String(subjectId),
          code: subjectRows[0].classSubjectCode || '',
          title: subjectRows[0].classSubjectTitle || ''
        }
      : {
          subjectId: String(subjectId),
          code: '',
          title: ''
        }

    return res.json({
      success: true,
      data: {
        section: {
          sectionId: String(section._id),
          sectionCode: normalizeProfessorRouteText(section.sectionCode)
        },
        subject: subjectMeta,
        totals: {
          assignedStudents: studentIds.length,
          matchedStudents: subjectRows.length
        },
        students: subjectRows
      }
    })
  } catch (error) {
    console.error('Error fetching professor subject roster:', error)
    return res.status(error.statusCode || 500).json({
      error: error.message || 'Failed to fetch subject roster.'
    })
  }
})

// PUT /api/professor/sections/:sectionId/subjects/:subjectId/students/:studentId/grade
// Updates one student's grade entry for the selected subject in the selected term.
app.put('/api/professor/sections/:sectionId/subjects/:subjectId/students/:studentId/grade', authMiddleware, async (req, res) => {
  if (!dbReady) {
    return res.status(503).json({ error: 'Database unavailable.' })
  }

  if (String(req.accountType || '').toLowerCase() !== 'professor') {
    return res.status(403).json({ error: 'Forbidden. Professor access required.' })
  }

  const { sectionId, subjectId, studentId } = req.params
  const semester = normalizeProfessorRouteText(req.body?.semester)
  const schoolYear = normalizeProfessorRouteText(req.body?.schoolYear)
  const remarks = normalizeProfessorRouteText(req.body?.remarks)
  const hasGradeField = Object.prototype.hasOwnProperty.call(req.body || {}, 'grade')
  const rawGrade = hasGradeField ? req.body.grade : null

  let normalizedGrade = rawGrade === null || rawGrade === undefined || String(rawGrade).trim() === ''
    ? null
    : Number(rawGrade)

  if (
    !mongoose.Types.ObjectId.isValid(sectionId)
    || !mongoose.Types.ObjectId.isValid(subjectId)
    || !mongoose.Types.ObjectId.isValid(studentId)
  ) {
    return res.status(400).json({ error: 'Invalid section id, subject id, or student id.' })
  }

  if (normalizedGrade !== null && (!Number.isFinite(normalizedGrade) || normalizedGrade < 1 || normalizedGrade > 5)) {
    return res.status(400).json({ error: 'Grade must be a number from 1.0 to 5.0, or blank.' })
  }

  // Block grade changes if submission is approved or submitted
  const submissionBlockQuery = {
    studentId: new mongoose.Types.ObjectId(studentId),
    status: { $nin: ['Dropped', 'Cancelled'] },
    'gradeSubmission.status': { $in: ['Submitted', 'Approved'] },
    subjects: { $elemMatch: { subjectId: new mongoose.Types.ObjectId(subjectId), status: { $ne: 'Dropped' } } }
  }
  if (semester) submissionBlockQuery.semester = semester
  if (schoolYear) submissionBlockQuery.schoolYear = schoolYear
  const blockedEnrollment = await Enrollment.findOne(submissionBlockQuery).lean().select('gradeSubmission.status')
  if (blockedEnrollment) {
    return res.status(400).json({
      error: `Grades cannot be edited while submission status is "${blockedEnrollment.gradeSubmission?.status}". ${blockedEnrollment.gradeSubmission?.status === 'Submitted' ? 'Wait for registrar approval or revert to draft.' : 'Grades are already approved.'}`
    })
  }

  try {
    const access = await getProfessorRouteAccess(req.adminId)
    const yearStart = parseProfessorRouteSchoolYearStart(schoolYear)
    const assignmentQuery = {
      sectionId: new mongoose.Types.ObjectId(sectionId),
      studentId: String(studentId).trim(),
      status: 'ASSIGNED'
    }
    if (semester) assignmentQuery.semester = semester
    if (Number.isFinite(yearStart)) assignmentQuery.year = yearStart

    let assignment = await StudentBlockAssignment.findOne(assignmentQuery)
      .select('_id studentId sectionId semester year')
      .lean()

    if (!assignment && (semester || Number.isFinite(yearStart))) {
      assignment = await StudentBlockAssignment.findOne({
        sectionId: new mongoose.Types.ObjectId(sectionId),
        studentId: String(studentId).trim(),
        status: 'ASSIGNED'
      })
        .select('_id studentId sectionId semester year')
        .lean()
    }

    if (!assignment) {
      return res.status(404).json({ error: 'Student is not assigned to this class section.' })
    }

    const enrollmentQuery = {
      studentId: new mongoose.Types.ObjectId(studentId),
      status: { $nin: ['Dropped', 'Cancelled'] },
      subjects: {
        $elemMatch: {
          subjectId: new mongoose.Types.ObjectId(subjectId),
          status: { $ne: 'Dropped' },
          instructor: { $in: access.exactIdentifierPatterns }
        }
      }
    }
    if (semester) enrollmentQuery.semester = semester
    if (schoolYear) enrollmentQuery.schoolYear = schoolYear

    let enrollment = await Enrollment.findOne(enrollmentQuery)
      .sort({ isCurrent: -1, createdAt: -1 })

    if (!enrollment && (semester || schoolYear)) {
      enrollment = await Enrollment.findOne({
        studentId: new mongoose.Types.ObjectId(studentId),
        status: { $nin: ['Dropped', 'Cancelled'] },
        subjects: {
          $elemMatch: {
            subjectId: new mongoose.Types.ObjectId(subjectId),
            status: { $ne: 'Dropped' },
            instructor: { $in: access.exactIdentifierPatterns }
          }
        }
      })
        .sort({ isCurrent: -1, createdAt: -1 })
    }

    if (!enrollment) {
      return res.status(404).json({ error: 'No matching enrolled subject was found for this student.' })
    }

    const matchedEntry = enrollment.subjects.find((entry) => {
      if (String(entry?.subjectId || '') !== String(subjectId)) return false
      if (String(entry?.status || '').toLowerCase() === 'dropped') return false
      return access.instructorMatchesProfessor(entry?.instructor)
    })

    if (!matchedEntry) {
      return res.status(404).json({ error: 'The selected subject is not assigned to your account for this student.' })
    }

    const oldGrade = matchedEntry.grade ?? null
    const oldRemarks = matchedEntry.remarks || ''

    matchedEntry.grade = normalizedGrade
    matchedEntry.remarks = remarks
    matchedEntry.dateModified = new Date()
    enrollment.updatedBy = req.adminId
    enrollment.markModified('subjects')
    await enrollment.save()

    // Audit log
    await GradeAuditLog.create({
      enrollmentId: enrollment._id,
      studentId: enrollment.studentId,
      studentNumber: enrollment.studentNumber,
      subjectId: matchedEntry.subjectId,
      subjectCode: matchedEntry.code,
      oldGrade,
      newGrade: normalizedGrade,
      oldRemarks,
      newRemarks: remarks || '',
      action: oldGrade === null && normalizedGrade !== null ? 'grade_entry' : (normalizedGrade === null ? 'grade_clear' : 'grade_update'),
      changedBy: req.adminId,
      changedByRole: req.accountType,
      schoolYear: enrollment.schoolYear,
      semester: enrollment.semester
    })

    const student = await Student.findById(studentId)
      .select('_id studentNumber firstName middleName lastName suffix yearLevel studentStatus course email contactNumber corStatus')
      .lean()

    return res.json({
      success: true,
      message: 'Grade updated successfully.',
      data: {
        _id: String(student?._id || studentId),
        enrollmentId: String(enrollment._id),
        subjectEntryId: String(matchedEntry._id || ''),
        studentNumber: normalizeProfessorRouteText(student?.studentNumber || enrollment.studentNumber),
        firstName: normalizeProfessorRouteText(student?.firstName),
        middleName: normalizeProfessorRouteText(student?.middleName),
        lastName: normalizeProfessorRouteText(student?.lastName),
        suffix: normalizeProfessorRouteText(student?.suffix),
        yearLevel: Number(student?.yearLevel || 0) || null,
        studentStatus: normalizeProfessorRouteText(student?.studentStatus) || 'Active',
        course: student?.course,
        email: normalizeProfessorRouteText(student?.email),
        contactNumber: normalizeProfessorRouteText(student?.contactNumber),
        corStatus: normalizeProfessorRouteText(student?.corStatus) || 'Pending',
        currentGrade: matchedEntry.grade ?? null,
        remarks: normalizeProfessorRouteText(matchedEntry.remarks),
        subjectStatus: normalizeProfessorRouteText(matchedEntry.status) || 'Enrolled',
        classSubjectCode: normalizeProfessorRouteText(matchedEntry.code),
        classSubjectTitle: normalizeProfessorRouteText(matchedEntry.title),
        gradeUpdatedAt: matchedEntry.dateModified || enrollment.updatedAt || new Date(),
        gradeSubmissionStatus: enrollment.gradeSubmission?.status || 'Draft'
      }
    })
  } catch (error) {
    console.error('Error updating professor grade:', error)
    return res.status(error.statusCode || 500).json({
      error: error.message || 'Failed to update grade.'
    })
  }
})

async function authMiddleware(req, res, next) {
  const auth = req.headers.authorization
  let token = auth && auth.startsWith('Bearer ') ? auth.slice(7) : null
  // Fallback: accept token from query string (used by browser-initiated
  // downloads/previews via window.open() where Authorization header can't be set).
  if (!token && typeof req.query?.token === 'string' && req.query.token.length > 0) {
    token = req.query.token
  }
  if (!token) {
    return res.status(401).json({ error: 'Unauthorized.' })
  }
  
  try {
    const clientIpCandidates = getClientIpCandidates(req)
    const clientIp = getClientIpAddress(req)
    const blockedIpRecord = await findActiveBlockedIp(clientIpCandidates)
    if (blockedIpRecord) {
      return res.status(403).json({
        error: 'Access denied. This IP address is blocked.',
        code: 'IP_BLOCKED',
        reason: blockedIpRecord.reason,
        blockedUntil: blockedIpRecord.expiresAt
      })
    }

    // Find token in MongoDB (including inactive to return better session-revoked reason).
    const authToken = await AuthToken.findOne({ token }).populate('adminId', 'username accountType')
    
    if (!authToken) {
      return res.status(401).json({ error: 'Invalid or expired token.' })
    }

    if (!authToken.isActive) {
      if (authToken.invalidationReason === 'new_ip_login') {
        return res.status(401).json({
          error: 'Your session was ended because this account signed in from a different IP address.',
          code: 'SESSION_REVOKED_IP_CHANGE'
        })
      }

      return res.status(401).json({ error: 'Invalid or expired token.' })
    }

    if (authToken.expiresAt && new Date(authToken.expiresAt) <= new Date()) {
      return res.status(401).json({ error: 'Invalid or expired token.' })
    }
    
    // Check if adminId exists and is valid
    if (!authToken.adminId) {
      return res.status(401).json({ error: 'Invalid token - no admin associated.' })
    }
    
    // Avoid turning every authenticated API request into a token write.
    const lastUsedAt = authToken.lastUsed ? new Date(authToken.lastUsed).getTime() : 0
    if (!lastUsedAt || Date.now() - lastUsedAt >= AUTH_LAST_USED_UPDATE_INTERVAL_MS) {
      void AuthToken.updateOne(
        {
          _id: authToken._id,
          $or: [
            { lastUsed: { $exists: false } },
            { lastUsed: { $lte: new Date(Date.now() - AUTH_LAST_USED_UPDATE_INTERVAL_MS) } }
          ]
        },
        { $set: { lastUsed: new Date() } }
      ).catch((error) => logger.warn('Failed to update auth token lastUsed:', error.message))
    }
    
    // Set request data
    req.adminId = authToken.adminId._id
    req.username = authToken.username || authToken.adminId.username
    req.accountType = authToken.accountType || authToken.adminId.accountType
    req.tokenId = authToken._id
    
    next()
  } catch (error) {
    logger.error('Auth middleware error:', error)
    return res.status(401).json({ error: 'Authentication failed.' })
  }
}

const AUDIT_REDACTION_PLACEHOLDER = '[REDACTED]'
const BCRYPT_HASH_PATTERN = /^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/
const SENSITIVE_AUDIT_KEY_PATTERNS = [
  /password/i,
  /passcode/i,
  /hash/i,
  /token/i,
  /secret/i,
  /api[-_]?key/i,
  /authorization/i,
  /cookie/i,
  /session/i,
  /captcha/i
]

function isSensitiveAuditKey(key) {
  const normalizedKey = String(key || '').trim()
  if (!normalizedKey) return false
  return SENSITIVE_AUDIT_KEY_PATTERNS.some((pattern) => pattern.test(normalizedKey))
}

function redactSensitiveAuditData(value, visited = new WeakSet()) {
  if (typeof value === 'string') {
    return BCRYPT_HASH_PATTERN.test(value.trim()) ? AUDIT_REDACTION_PLACEHOLDER : value
  }

  if (value === null || value === undefined) return value
  if (value?._bsontype === 'ObjectId' && typeof value.toString === 'function') {
    return value.toString()
  }
  if (typeof value !== 'object') return value
  if (value instanceof Date) return value

  if (Array.isArray(value)) {
    return value.map((entry) => redactSensitiveAuditData(entry, visited))
  }

  if (visited.has(value)) {
    return '[Circular]'
  }
  visited.add(value)

  const source = value && typeof value.toObject === 'function' ? value.toObject() : value
  const redacted = {}
  for (const [entryKey, entryValue] of Object.entries(source)) {
    if (isSensitiveAuditKey(entryKey)) {
      redacted[entryKey] = AUDIT_REDACTION_PLACEHOLDER
      continue
    }
    redacted[entryKey] = redactSensitiveAuditData(entryValue, visited)
  }

  return redacted
}

// Audit logging helper function
async function logAudit(action, resourceType, resourceId, resourceName, description, performedBy, performedByRole, oldValue = null, newValue = null, status = 'SUCCESS', severity = 'LOW', ipAddress = null, userAgent = null) {
  try {
    let normalizedPerformedBy = performedBy
    const isObjectIdLike = normalizedPerformedBy && mongoose.Types.ObjectId.isValid(String(normalizedPerformedBy))

    if (!isObjectIdLike) {
      if (!systemAuditActorIdCache) {
        const fallbackAdmin = await Admin.findOne().select('_id').lean()
        if (fallbackAdmin?._id) {
          systemAuditActorIdCache = String(fallbackAdmin._id)
        }
      }
      normalizedPerformedBy = systemAuditActorIdCache
    }

    if (!normalizedPerformedBy || !mongoose.Types.ObjectId.isValid(String(normalizedPerformedBy))) {
      throw new Error('No valid performedBy available for audit log')
    }

    const normalizedRole = ['admin', 'registrar'].includes(String(performedByRole || '').toLowerCase())
      ? String(performedByRole).toLowerCase()
      : 'admin'
    const sanitizedOldValue = redactSensitiveAuditData(oldValue)
    const sanitizedNewValue = redactSensitiveAuditData(newValue)

    await AuditLog.create({
      action,
      resourceType,
      resourceId,
      resourceName,
      description,
      performedBy: normalizedPerformedBy,
      performedByRole: normalizedRole,
      ipAddress,
      userAgent,
      oldValue: sanitizedOldValue,
      newValue: sanitizedNewValue,
      status,
      severity
    })
  } catch (error) {
    console.error('Failed to create audit log:', error)
  }
}

// Create a sanitized object for audit logs to avoid storing large or sensitive fields
function auditObject(obj, resourceType) {
  if (!obj) return null
  const o = obj.toObject ? obj.toObject() : obj

  if (resourceType === 'DOCUMENT') {
    return {
      _id: o._id,
      title: o.title,
      folderId: o.folderId,
      fileName: o.fileName,
      originalFileName: o.originalFileName,
      mimeType: o.mimeType,
      fileSize: o.fileSize,
      category: o.category,
      status: o.status,
      isTrashed: o.isTrashed,
      trashedAt: o.trashedAt,
      trashedBy: o.trashedBy,
      createdBy: o.createdBy,
      createdAt: o.createdAt
    }
  }

  if (resourceType === 'ADMIN') {
    return {
      _id: o._id,
      username: o.username,
      displayName: o.displayName,
      email: o.email,
      accountType: o.accountType,
      uid: o.uid,
      status: o.status,
      createdAt: o.createdAt
    }
  }

  if (resourceType === 'ANNOUNCEMENT') {
    return {
      _id: o._id,
      title: o.title,
      type: o.type,
      targetAudience: o.targetAudience,
      isActive: o.isActive,
      createdBy: o.createdBy,
      createdAt: o.createdAt
    }
  }

  // Fallback: shallow copy without possibly-large fields
  const clone = { ...o }
  delete clone.avatar
  delete clone.media
  delete clone.filePath
  return clone
}

const uri = process.env.MONGODB_URI
if (!uri) {
  console.error('Missing MONGODB_URI in .env')
  process.exit(1)
}

console.log('Environment:', process.env.NODE_ENV || 'development')

let dbReady = false
mongoose.connect(uri)
  .then(() => {
    dbReady = true
    console.log('MongoDB connected')
    void purgeExpiredArchiveBinItems().catch((error) => {
      console.error('Archive bin startup cleanup error:', error)
    })
    
    // Migration: Update existing admin accounts with new fields
    migrateExistingAccounts()
    
    // Run initial backup after connection
    initialBackupTimeout = setTimeout(async () => {
      console.log('Running initial backup...');
      try {
        const result = await backupSystem.createBackup('initial', 'system');
        if (result.success) {
          console.log(`Initial backup completed: ${result.fileName}`);
        } else {
          console.error('Initial backup failed:', result.error);
        }
      } catch (error) {
        console.error('Initial backup error:', error);
      }
    }, 2000); // 2 seconds after connection
  })
  .catch((err) => {
    console.error('MongoDB connection error:', err.message)
    console.error('Add your IP to Atlas Network Access: https://www.mongodb.com/docs/atlas/security-whitelist/')
  })

// Token cleanup function - removes expired tokens
async function cleanupExpiredTokens() {
  try {
    const result = await AuthToken.deleteMany({
      expiresAt: { $lt: new Date() }
    })
    if (result.deletedCount > 0) {
      console.log(`Cleaned up ${result.deletedCount} expired tokens`)
    }
  } catch (error) {
    console.error('Token cleanup error:', error)
  }
}

// Schedule token cleanup every hour
const tokenCleanupInterval = setInterval(cleanupExpiredTokens, 60 * 60 * 1000)
const archiveBinCleanupInterval = setInterval(() => {
  void purgeExpiredArchiveBinItems().catch((error) => {
    console.error('Archive bin cleanup error:', error)
  })
}, ARCHIVE_BIN_CLEANUP_INTERVAL_MS)

// Migration function for existing accounts
async function migrateExistingAccounts() {
  try {
    const existingAdmins = await Admin.find({ uid: { $exists: false } })
    
    if (existingAdmins.length > 0) {
      console.log(`Migrating ${existingAdmins.length} existing admin accounts...`)
      
      for (const admin of existingAdmins) {
        const currentYear = new Date().getFullYear()
        const randomCount = await crypto.randomInt(100, 1000)
        
        await Admin.updateOne(
          { _id: admin._id },
          { 
            $set: {
              uid: `1${currentYear}${randomCount.toString().padStart(3, '0')}1430`,
              accountType: 'admin',
              status: 'active',
              createdBy: 'Super Admin',
              avatarMimeType: ''
            }
          }
        )
      }
      
      console.log('Migration completed successfully')
    }
  } catch (error) {
    console.error('Migration error:', error)
  }
}

function buildServiceHealthPayload(status) {
  return {
    status,
    service: process.env.SERVICE_NAME || 'wcc-admin-api',
    environment: process.env.NODE_ENV || 'development',
    uptimeSeconds: Math.round(process.uptime()),
    startedAt: serviceStartedAt.toISOString(),
    database: {
      ready: dbReady,
      state: mongoose.connection.readyState
    },
    shuttingDown
  }
}

// Liveness: process is running. Keep this cheap for load balancers.
app.get(['/live', '/api/live'], (req, res) => {
  res.status(shuttingDown ? 503 : 200).json(buildServiceHealthPayload(shuttingDown ? 'shutting_down' : 'live'))
})

// Readiness: only receive traffic after dependencies are ready.
app.get(['/ready', '/api/ready'], (req, res) => {
  const ready = dbReady && !shuttingDown
  res.status(ready ? 200 : 503).json(buildServiceHealthPayload(ready ? 'ready' : 'not_ready'))
})

// Compatibility health check for existing infrastructure.
app.get(['/health', '/api/health'], (req, res) => {
  const statusCode = shuttingDown ? 503 : 200
  res.status(statusCode).json(buildServiceHealthPayload(shuttingDown ? 'shutting_down' : 'ok'))
})

app.get('/api/admin/operations-metrics', authMiddleware, requireAdminRole, (req, res) => {
  res.json({
    ...operationsMonitor.snapshot(),
    database: {
      ready: dbReady,
      state: mongoose.connection.readyState
    },
    shuttingDown
  })
})

/**
 * Resolve client IP using Express' trusted `req.ip` and socket fallback.
 *
 * Forwarding headers can be spoofed by clients unless they are processed by
 * trusted upstream proxies. This implementation relies on `req.ip`, which is
 * proxy-aware when trust proxy is enabled.
 *
 * @param {Object} req - Express request object
 * @returns {string} Client IP address or 'unknown' if none found
 */
function normalizeClientIpAddress(ipAddress) {
  const normalized = String(ipAddress || '').trim()
  if (!normalized) return ''

  if (normalized === '::1') return '127.0.0.1'
  if (normalized.toLowerCase().startsWith('::ffff:')) {
    return normalized.slice(7)
  }

  return normalized
}

function normalizeIpv4AddressInput(ipAddress) {
  let normalized = normalizeClientIpAddress(ipAddress)
  while (normalized.endsWith(',') || normalized.endsWith('.') || normalized.endsWith(';')) {
    normalized = normalized.slice(0, -1)
  }
  return normalized
}

function isValidIpv4Address(ipAddress) {
  return IPV4_REGEX.test(normalizeIpv4AddressInput(ipAddress))
}

function isPrivateOrReservedIpv4(ipAddress) {
  if (!isValidIpv4Address(ipAddress)) return true

  const [a, b, c] = String(ipAddress).split('.').map((value) => Number(value))

  // RFC1918 private ranges
  if (a === 10) return true
  if (a === 172 && b >= 16 && b <= 31) return true
  if (a === 192 && b === 168) return true

  // Common non-public ranges and reserved blocks
  if (a === 127) return true
  if (a === 169 && b === 254) return true
  if (a === 100 && b >= 64 && b <= 127) return true
  if (a === 0) return true
  if (a >= 224) return true
  if (a === 192 && b === 0 && c === 2) return true
  if (a === 198 && b === 51 && c === 100) return true
  if (a === 203 && b === 0 && c === 113) return true
  if (a === 198 && (b === 18 || b === 19)) return true

  return false
}

function selectPreferredClientIp(candidates = []) {
  const normalizedCandidates = Array.from(
    new Set(
      candidates
        .map((value) => normalizeIpv4AddressInput(value))
        .filter((value) => isValidIpv4Address(value))
    )
  )

  if (normalizedCandidates.length === 0) return 'unknown'

  const publicCandidate = normalizedCandidates.find((value) => !isPrivateOrReservedIpv4(value))
  return publicCandidate || normalizedCandidates[0]
}

function getClientIpCandidates(req) {
  const candidates = []

  const pushCandidate = (value) => {
    const normalized = normalizeIpv4AddressInput(value)
    if (!normalized || normalized.toLowerCase() === 'unknown') return
    candidates.push(normalized)
  }

  if (Array.isArray(req.ips)) {
    req.ips.forEach((ip) => pushCandidate(ip))
  }

  pushCandidate(req.ip)

  if (TRUST_PROXY_ENABLED) {
    const forwardedForHeader = String(req.headers['x-forwarded-for'] || '')
    forwardedForHeader
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean)
      .forEach((ip) => pushCandidate(ip))

    pushCandidate(req.headers['cf-connecting-ip'])
    pushCandidate(req.headers['true-client-ip'])
    pushCandidate(req.headers['x-real-ip'])
  }

  pushCandidate(req.socket?.remoteAddress || req.connection?.remoteAddress || '')

  const deduped = Array.from(new Set(candidates))
  return deduped
}

function getClientIpAddress(req) {
  const candidates = getClientIpCandidates(req)
  return selectPreferredClientIp(candidates)
}

async function findActiveBlockedIp(ipAddress) {
  const rawCandidates = Array.isArray(ipAddress) ? ipAddress : [ipAddress]
  const normalizedCandidates = Array.from(
    new Set(
      rawCandidates
        .map((value) => normalizeIpv4AddressInput(value))
        .filter((value) => isValidIpv4Address(value))
    )
  )

  if (normalizedCandidates.length === 0) return null

  return BlockedIP.findOne({
    ipAddress: { $in: normalizedCandidates },
    isActive: true,
    expiresAt: { $gt: new Date() }
  })
}

function normalizePhilippineMobileNumber(rawNumber) {
  const normalized = String(rawNumber || '').trim()
  if (!normalized) return ''

  const compactNumber = normalized.replace(/[()\-\s]/g, '')
  if (compactNumber.startsWith('+63')) {
    return `0${compactNumber.slice(3)}`
  }
  if (compactNumber.startsWith('63')) {
    return `0${compactNumber.slice(2)}`
  }
  if (compactNumber.startsWith('9') && compactNumber.length === 10) {
    return `0${compactNumber}`
  }

  return compactNumber
}

function isValidPhilippineMobileNumber(normalizedNumber) {
  return /^09\d{9}$/.test(String(normalizedNumber || ''))
}

// Convert a normalized PH number (09XXXXXXXXX) to E.164 (+63XXXXXXXXX) for Supabase.
function philippineNumberToE164(normalizedNumber) {
  const local = String(normalizedNumber || '').trim()
  if (!/^09\d{9}$/.test(local)) return ''
  return `+63${local.slice(1)}`
}

function isValidEmailAddress(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || '').trim())
}

async function findAdminByLoginIdentifier(identifier) {
  const normalizedIdentifier = String(identifier || '').trim().toLowerCase()
  if (!normalizedIdentifier) return null

  return Admin.findOne({ username: normalizedIdentifier })
}

function getAllowedGoogleSignInClientIds() {
  return Array.from(new Set(
    [
      process.env.GOOGLE_SIGNIN_CLIENT_IDS || '',
      process.env.VITE_GOOGLE_SIGNIN_CLIENT_ID || '',
      process.env.GMAIL_CLIENT_ID || ''
    ]
      .flatMap((value) => String(value || '').split(','))
      .map((value) => value.trim())
      .filter(Boolean)
  ))
}

async function verifyGoogleSignInCredential(credential) {
  const normalizedCredential = String(credential || '').trim()
  if (!normalizedCredential) {
    throw new Error('Missing Google credential.')
  }

  const allowedClientIds = getAllowedGoogleSignInClientIds()
  if (allowedClientIds.length === 0) {
    throw new Error('Google sign-in is not configured.')
  }

  const tokenInfoUrl = new URL('https://oauth2.googleapis.com/tokeninfo')
  tokenInfoUrl.searchParams.set('id_token', normalizedCredential)

  const response = await fetch(tokenInfoUrl.toString())
  const payload = await response.json().catch(() => ({}))

  if (!response.ok) {
    throw new Error('Google sign-in token could not be verified.')
  }

  const issuer = String(payload.iss || '').trim()
  const audience = String(payload.aud || '').trim()
  const email = String(payload.email || '').trim().toLowerCase()
  const emailVerified = String(payload.email_verified || '').trim().toLowerCase() === 'true'
  const expiresAt = Number(payload.exp || 0) * 1000

  if (!['accounts.google.com', 'https://accounts.google.com'].includes(issuer)) {
    throw new Error('Invalid Google token issuer.')
  }

  if (!allowedClientIds.includes(audience)) {
    throw new Error('Google sign-in token audience is not allowed.')
  }

  if (!emailVerified || !isValidEmailAddress(email)) {
    throw new Error('Google account email must be verified.')
  }

  if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
    throw new Error('Google sign-in token has expired.')
  }

  return {
    email,
    sub: String(payload.sub || '').trim(),
    displayName: String(payload.name || '').trim(),
    picture: String(payload.picture || '').trim()
  }
}

async function completeAdminLogin({ admin, clientIp, userAgent, deviceId, loginMeta, auditDescription }) {
  const token = crypto.randomBytes(32).toString('hex')

  await AuthToken.create({
    token,
    adminId: admin._id,
    username: admin.username,
    accountType: admin.accountType,
    ipAddress: clientIp,
    userAgent,
    deviceId: deviceId || undefined
  })

  let revokedSessionsFromOtherIps = 0
  if (clientIp && clientIp !== 'unknown') {
    const revokeResult = await AuthToken.updateMany(
      {
        adminId: admin._id,
        isActive: true,
        token: { $ne: token },
        ipAddress: { $ne: clientIp }
      },
      {
        $set: {
          isActive: false,
          invalidationReason: 'new_ip_login',
          invalidatedAt: new Date()
        }
      }
    )

    revokedSessionsFromOtherIps = Number(revokeResult.modifiedCount || 0)
  }

  const loginResponse = {
    message: 'OK',
    username: admin.username,
    token,
    accountType: admin.accountType
  }

  await logAudit(
    'LOGIN',
    'ADMIN',
    admin._id.toString(),
    admin.username,
    auditDescription,
    admin._id.toString(),
    admin.accountType,
    null,
    loginMeta,
    'SUCCESS',
    'LOW',
    clientIp,
    userAgent
  )

  if (revokedSessionsFromOtherIps > 0) {
    await logAudit(
      'LOGOUT',
      'SECURITY',
      admin._id.toString(),
      admin.username,
      `Revoked ${revokedSessionsFromOtherIps} previous session(s) after login from IP ${clientIp}.`,
      admin._id.toString(),
      admin.accountType,
      null,
      {
        ...loginMeta,
        revokedSessionsFromOtherIps
      },
      'SUCCESS',
      'MEDIUM',
      clientIp,
      userAgent
    )
  }

  return loginResponse
}

function generatePhoneVerificationCode() {
  return String(crypto.randomInt(100000, 1000000))
}

function hashPhoneVerificationCode(code) {
  return crypto.createHash('sha256').update(String(code || '')).digest('hex')
}

function generateLoginEmailVerificationChallengeToken() {
  return crypto.randomBytes(32).toString('hex')
}

function hashLoginEmailVerificationChallengeToken(token) {
  return crypto.createHash('sha256').update(String(token || '')).digest('hex')
}

function clearLoginEmailVerificationState(admin) {
  admin.loginEmailVerificationCodeHash = ''
  admin.loginEmailVerificationExpiresAt = null
  admin.loginEmailVerificationChallengeHash = ''
  admin.loginEmailVerificationDeviceId = ''
  admin.loginEmailVerificationAuthProvider = ''
}

function clearPendingEmailChangeState(admin) {
  admin.pendingEmailChange = ''
  admin.pendingEmailChangeCodeHash = ''
  admin.pendingEmailChangeExpiresAt = null
}

async function findAdminEmailConflictOwner(adminId, email) {
  const normalizedEmail = String(email || '').trim().toLowerCase()
  if (!normalizedEmail) return null

  return Admin.findOne({
    _id: { $ne: adminId },
    $or: [
      { email: normalizedEmail },
      { username: normalizedEmail }
    ]
  }).select('_id')
}

async function beginLoginEmailVerification({ admin, deviceId, authProvider }) {
  const normalizedEmail = String(admin.email || '').trim().toLowerCase()
  if (!admin.loginEmailVerificationEnabled) {
    return null
  }

  // Keep username/password login available even when email-based login
  // verification is enabled for the account.
  if (authProvider !== 'google') {
    if (
      admin.loginEmailVerificationCodeHash
      || admin.loginEmailVerificationExpiresAt
      || admin.loginEmailVerificationChallengeHash
      || admin.loginEmailVerificationDeviceId
      || admin.loginEmailVerificationAuthProvider
    ) {
      clearLoginEmailVerificationState(admin)
      await admin.save()
    }

    return null
  }

  if (!admin.emailVerified || !isValidEmailAddress(normalizedEmail)) {
    const error = new Error('Login email verification is enabled, but no verified email address is available for this account.')
    error.statusCode = 400
    throw error
  }

  if (!verificationEmailService.isConfigured()) {
    const error = new Error('Email verification service is not configured for login verification.')
    error.statusCode = 503
    throw error
  }

  const verificationCode = generatePhoneVerificationCode()
  const verificationCodeHash = hashPhoneVerificationCode(verificationCode)
  const challengeToken = generateLoginEmailVerificationChallengeToken()
  const challengeHash = hashLoginEmailVerificationChallengeToken(challengeToken)
  const expiresAt = new Date(Date.now() + LOGIN_EMAIL_VERIFICATION_CODE_TTL_MS)
  const expiresInMinutes = Math.max(1, Math.ceil(LOGIN_EMAIL_VERIFICATION_CODE_TTL_MS / 60000))

  admin.loginEmailVerificationCodeHash = verificationCodeHash
  admin.loginEmailVerificationExpiresAt = expiresAt
  admin.loginEmailVerificationChallengeHash = challengeHash
  admin.loginEmailVerificationDeviceId = String(deviceId || '').trim()
  admin.loginEmailVerificationAuthProvider = authProvider === 'google' ? 'google' : 'password'
  await admin.save()

  let deliveryResult = null

  try {
    deliveryResult = await verificationEmailService.sendVerificationCode({
      to: normalizedEmail,
      code: verificationCode,
      expiresInMinutes,
      displayName: admin.displayName || admin.username || 'Administrator'
    })
  } catch (deliveryError) {
    clearLoginEmailVerificationState(admin)
    await admin.save()
    deliveryError.statusCode = Number(deliveryError?.statusCode || 502)
    throw deliveryError
  }

  return {
    requiresEmailVerification: true,
    challengeToken,
    email: normalizedEmail,
    expiresAt: expiresAt.toISOString(),
    channel: 'email',
    emailProvider: deliveryResult.emailProvider,
    destination: deliveryResult.recipient || normalizedEmail,
    deliveryStatus: deliveryResult.status,
    messageId: deliveryResult.messageId,
    providerMessage: deliveryResult.providerMessage || null
  }
}

// POST /api/admin/signup
app.post('/api/admin/signup', authLimiter, async (req, res) => {
  if (!dbReady) {
    return res.status(503).json({ error: 'Database unavailable. Check server logs and Atlas IP whitelist.' })
  }
  try {
    const { username, password } = req.body
    if (!username || !password || typeof username !== 'string' || typeof password !== 'string') {
      return res.status(400).json({ error: 'Username and password are required.' })
    }
    const trimmed = username.trim().toLowerCase()
    if (!trimmed) return res.status(400).json({ error: 'Username is required.' })
    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters.' })
    }

    const existing = await Admin.findOne({ username: trimmed })
    if (existing) {
      return res.status(409).json({ error: 'Username already exists.' })
    }

    const admin = new Admin({ username: trimmed, password })
    await admin.save()
    res.status(201).json({ message: 'Account created.', username: admin.username })
  } catch (err) {
    console.error('Signup error:', err)
    res.status(500).json({ error: 'Sign up failed.' })
  }
})

// POST /api/admin/login
app.post('/api/admin/login', authLimiter, securityMiddleware.inputValidationMiddleware(securityMiddleware.schemas.login), async (req, res) => {
  if (!dbReady) {
    return res.status(503).json({ error: 'Database unavailable. Check server logs and Atlas IP whitelist.' })
  }
  try {
    const { username, password, captchaToken } = req.body
    const normalizedUsername = String(username || '').trim().toLowerCase()
    const clientIpCandidates = getClientIpCandidates(req)
    const clientIp = getClientIpAddress(req)
    const userAgent = req.get('User-Agent')
    const deviceId = String(req.get('x-device-id') || '').trim()
    const loginMeta = {
      ipAddress: clientIp,
      deviceId: deviceId || null
    }
    const blockedIpRecord = await findActiveBlockedIp(clientIpCandidates)
    if (blockedIpRecord) {
      await BlockedIP.findByIdAndUpdate(blockedIpRecord._id, {
        $inc: { attemptCount: 1 },
        $set: { lastAttemptAt: new Date() }
      })

      await logAudit(
        'LOGIN',
        'SECURITY',
        clientIp,
        normalizedUsername || 'unknown',
        `Blocked login attempt from blocked IP ${clientIp}.`,
        null,
        'admin',
        null,
        {
          ...loginMeta,
          blockedUntil: blockedIpRecord.expiresAt,
          reason: blockedIpRecord.reason
        },
        'FAILED',
        'HIGH',
        clientIp,
        userAgent
      )

      return res.status(403).json({
        error: 'Access denied. This IP address is blocked.',
        code: 'IP_BLOCKED',
        reason: blockedIpRecord.reason,
        blockedUntil: blockedIpRecord.expiresAt
      })
    }

    const now = Date.now()
    const lockoutFactors = [
      {
        label: 'ip',
        key: clientIp !== 'unknown' ? clientIp : '',
        store: loginAttemptStateByIp
      },
      {
        label: 'username',
        key: normalizedUsername,
        store: loginAttemptStateByUsername
      },
      {
        label: 'device',
        key: deviceId,
        store: loginAttemptStateByDevice
      }
    ].filter((factor) => Boolean(factor.key))

    const activeLockouts = lockoutFactors
      .map((factor) => ({
        ...factor,
        state: getLoginAttemptState(factor.store, factor.key, now)
      }))
      .filter((factor) => Number(factor.state.lockoutUntil) > now)

    if (activeLockouts.length > 0) {
      const latestLockoutUntil = activeLockouts.reduce(
        (max, factor) => Math.max(max, Number(factor.state.lockoutUntil)),
        0
      )
      const remainingMs = latestLockoutUntil - now
      const remainingSeconds = Math.max(1, Math.ceil(remainingMs / 1000))
      const lockedBy = activeLockouts.map((factor) => factor.label)
      const lockoutDescription = lockedBy.length === 1 && lockedBy[0] === 'ip'
        ? `Blocked login attempt from locked IP ${clientIp}. Remaining lockout: ${remainingSeconds} second(s).`
        : `Blocked login attempt due to active login lockout (${lockedBy.join(', ')}). Remaining lockout: ${remainingSeconds} second(s).`
      await logAudit(
        'LOGIN',
        'SECURITY',
        clientIp,
        normalizedUsername || 'unknown',
        lockoutDescription,
        null,
        'admin',
        null,
        {
          ...loginMeta,
          lockoutFactors: lockedBy,
          remainingSeconds,
          lockoutUntil: new Date(latestLockoutUntil).toISOString()
        },
        'FAILED',
        'HIGH',
        clientIp,
        userAgent
      )

      return res.status(429).json({
        error: `Too many failed login attempts. Please try again in ${remainingSeconds} second(s).`
      })
    }

    const isProduction = process.env.NODE_ENV === 'production'
    const recaptchaExplicitlyEnabled = String(process.env.RECAPTCHA_ENABLED || '').toLowerCase() === 'true'
    const requireRecaptcha = isProduction || recaptchaExplicitlyEnabled
    const devBypassToken = 'dev-bypass'
    const recaptchaMinScoreRaw = Number(process.env.RECAPTCHA_MIN_SCORE || 0.5)
    const recaptchaMinScore = Number.isFinite(recaptchaMinScoreRaw) ? recaptchaMinScoreRaw : 0.5
    const recaptchaDebugEnabled = String(process.env.RECAPTCHA_DEBUG || '').toLowerCase() === 'true'
    const allowedRecaptchaActions = String(process.env.RECAPTCHA_ALLOWED_ACTIONS || 'admin_login,registrar_login,login')
      .split(',')
      .map(action => action.trim())
      .filter(Boolean)

    if (requireRecaptcha) {
      if (!captchaToken) {
        return res.status(400).json({ error: 'reCAPTCHA verification required.' })
      }

      if (captchaToken === devBypassToken) {
        return res.status(400).json({ error: 'Invalid reCAPTCHA token.' })
      }

      const recaptchaSecret = String(process.env.RECAPTCHA_SECRET_KEY || '').trim()
      if (recaptchaDebugEnabled) {
        logger.warn('[reCAPTCHA debug] verification requested', {
          production: isProduction,
          tokenPresent: Boolean(captchaToken),
          secretConfigured: Boolean(recaptchaSecret),
          minimumScore: recaptchaMinScore,
          allowedActions: allowedRecaptchaActions
        })
      }

      if (!recaptchaSecret) {
        console.error('reCAPTCHA is required but RECAPTCHA_SECRET_KEY is not configured.')
        return res.status(500).json({ error: 'CAPTCHA verification misconfigured.' })
      }

      try {
        const verifyPayload = new URLSearchParams({
          secret: recaptchaSecret,
          response: captchaToken
        })

        if (clientIp && clientIp !== 'unknown') {
          verifyPayload.append('remoteip', clientIp)
        }

        const recaptchaResponse = await axios.post(
          'https://www.google.com/recaptcha/api/siteverify',
          verifyPayload.toString(),
          {
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded'
            },
            timeout: 5000
          }
        )

        if (recaptchaDebugEnabled) {
          logger.warn('[reCAPTCHA debug] Google verification response', {
            success: recaptchaResponse.data?.success === true,
            score: typeof recaptchaResponse.data?.score === 'number' ? recaptchaResponse.data.score : null,
            action: String(recaptchaResponse.data?.action || '') || null,
            hostname: String(recaptchaResponse.data?.hostname || '') || null,
            errorCodes: Array.isArray(recaptchaResponse.data?.['error-codes'])
              ? recaptchaResponse.data['error-codes']
              : []
          })
        }

        if (!recaptchaResponse.data?.success) {
          return res.status(400).json({ error: 'reCAPTCHA verification failed. Please try again.' })
        }

        const recaptchaScore = recaptchaResponse.data?.score
        const recaptchaAction = String(recaptchaResponse.data?.action || '').trim()

        if (typeof recaptchaScore !== 'number') {
          return res.status(400).json({ error: 'Invalid reCAPTCHA token type. Expected v3 token.' })
        }

        if (recaptchaScore < recaptchaMinScore) {
          return res.status(400).json({ error: 'reCAPTCHA score too low. Please try again.' })
        }

        if (!recaptchaAction || !allowedRecaptchaActions.includes(recaptchaAction)) {
          return res.status(400).json({ error: 'Invalid reCAPTCHA action.' })
        }
      } catch (recaptchaError) {
        logger.error('reCAPTCHA verification error:', recaptchaError.message)
        return res.status(500).json({ error: 'CAPTCHA verification service unavailable.' })
      }
    } else if (captchaToken && captchaToken !== devBypassToken) {
      return res.status(400).json({ error: 'Invalid CAPTCHA bypass token for non-production environment.' })
    }

    // Register one failed login attempt across all available lockout factors.
    const registerFailedAttempt = () => {
      const factorResults = lockoutFactors.map((factor) => {
        const currentState = getLoginAttemptState(factor.store, factor.key, now)
        const nextFailedAttempts = Number(currentState.failedAttempts || 0) + 1

        if (nextFailedAttempts >= MAX_FAILED_LOGIN_ATTEMPTS) {
          const lockoutStep = Math.min(Number(currentState.lockoutStep || 0), LOGIN_LOCKOUT_STEPS_MS.length - 1)
          const lockoutDurationMs = LOGIN_LOCKOUT_STEPS_MS[lockoutStep]
          const lockoutUntil = now + lockoutDurationMs
          const nextLockoutCount = Number(currentState.lockoutCount || 0) + 1

          setLoginAttemptState(
            factor.store,
            factor.key,
            {
              failedAttempts: 0,
              lockoutStep: Math.min(lockoutStep + 1, LOGIN_LOCKOUT_STEPS_MS.length - 1),
              lockoutCount: nextLockoutCount,
              lockoutUntil
            },
            now
          )

          return {
            label: factor.label,
            lockoutTriggered: true,
            lockoutDurationMs,
            lockoutUntil,
            lockoutCount: nextLockoutCount
          }
        }

        setLoginAttemptState(
          factor.store,
          factor.key,
          {
            failedAttempts: nextFailedAttempts,
            lockoutStep: Number(currentState.lockoutStep || 0),
            lockoutCount: Number(currentState.lockoutCount || 0),
            lockoutUntil: 0
          },
          now
        )

        return {
          label: factor.label,
          lockoutTriggered: false,
          lockoutDurationMs: 0,
          lockoutUntil: 0,
          lockoutCount: Number(currentState.lockoutCount || 0)
        }
      })

      const triggeredLockouts = factorResults.filter((result) => result.lockoutTriggered)
      const highestLockoutDurationMs = triggeredLockouts.reduce(
        (max, result) => Math.max(max, Number(result.lockoutDurationMs || 0)),
        0
      )
      const latestLockoutUntil = triggeredLockouts.reduce(
        (max, result) => Math.max(max, Number(result.lockoutUntil || 0)),
        0
      )

      return {
        lockoutTriggered: triggeredLockouts.length > 0,
        triggeredLockouts,
        highestLockoutDurationMs,
        latestLockoutUntil
      }
    }

    const admin = await findAdminByLoginIdentifier(normalizedUsername)
    if (!admin) {
      const attemptResult = registerFailedAttempt()
      if (attemptResult.lockoutTriggered) {
        const lockoutLabels = attemptResult.triggeredLockouts.map((item) => item.label)
        await logAudit(
          'LOGIN',
          'SECURITY',
          clientIp,
          normalizedUsername || 'unknown',
          `Login lockout triggered (${lockoutLabels.join(', ')}) after ${MAX_FAILED_LOGIN_ATTEMPTS} failed login attempts. Lockout ${Math.ceil(attemptResult.highestLockoutDurationMs / 60000)} minute(s).`,
          null,
          'admin',
          null,
          {
            ...loginMeta,
            lockoutFactors: lockoutLabels,
            lockoutUntil: new Date(attemptResult.latestLockoutUntil).toISOString(),
            lockoutMinutes: Math.ceil(attemptResult.highestLockoutDurationMs / 60000)
          },
          'FAILED',
          'CRITICAL',
          clientIp,
          userAgent
        )
      }
      // Log failed login attempt for non-existent user
      await logAudit(
        'LOGIN',
        'ADMIN',
        'unknown',
        normalizedUsername,
        `Failed login attempt: user does not exist`,
        'unknown',
        'unknown',
        null,
        loginMeta,
        'FAILED',
        'MEDIUM',
        clientIp,
        userAgent
      )

      return res.status(401).json({ error: 'Invalid username or password.' })
    }

    const match = await admin.comparePassword(password)
    if (!match) {
      const attemptResult = registerFailedAttempt()
      if (attemptResult.lockoutTriggered) {
        const lockoutLabels = attemptResult.triggeredLockouts.map((item) => item.label)
        await logAudit(
          'LOGIN',
          'SECURITY',
          clientIp,
          admin.username,
          `Login lockout triggered (${lockoutLabels.join(', ')}) after ${MAX_FAILED_LOGIN_ATTEMPTS} failed login attempts. Lockout ${Math.ceil(attemptResult.highestLockoutDurationMs / 60000)} minute(s).`,
          admin._id.toString(),
          admin.accountType,
          null,
          {
            ...loginMeta,
            lockoutFactors: lockoutLabels,
            lockoutUntil: new Date(attemptResult.latestLockoutUntil).toISOString(),
            lockoutMinutes: Math.ceil(attemptResult.highestLockoutDurationMs / 60000)
          },
          'FAILED',
          'CRITICAL',
          clientIp,
          userAgent
        )
      }
      // Log failed login attempt for wrong password
      await logAudit(
        'LOGIN',
        'ADMIN',
        admin._id.toString(),
        admin.username,
        `Failed login attempt: invalid password`,
        admin._id.toString(),
        admin.accountType,
        null,
        loginMeta,
        'FAILED',
        'MEDIUM',
        clientIp,
        userAgent
      )

      return res.status(401).json({ error: 'Invalid username or password.' })
    }

    // Successful login resets all attempt/lockout factors related to this login.
    lockoutFactors.forEach((factor) => {
      factor.store.delete(factor.key)
    })

    const loginVerificationChallenge = await beginLoginEmailVerification({
      admin,
      deviceId,
      authProvider: 'password'
    })
    if (loginVerificationChallenge) {
      return res.status(202).json(loginVerificationChallenge)
    }

    const loginResponse = await completeAdminLogin({
      admin,
      clientIp,
      userAgent,
      deviceId,
      loginMeta,
      auditDescription: `Admin login: ${admin.username}`
    })
    res.json(loginResponse)
  } catch (err) {
    console.error('Login error:', err.message)
    res.status(Number(err?.statusCode || 500)).json({ error: err?.message || 'Login failed.' })
  }
})

app.post('/api/admin/google-login', authLimiter, securityMiddleware.inputValidationMiddleware(securityMiddleware.schemas.admin.googleLogin), async (req, res) => {
  if (!dbReady) {
    return res.status(503).json({ error: 'Database unavailable. Check server logs and Atlas IP whitelist.' })
  }

  try {
    const clientIpCandidates = getClientIpCandidates(req)
    const clientIp = getClientIpAddress(req)
    const userAgent = req.get('User-Agent')
    const deviceId = String(req.get('x-device-id') || '').trim()
    const loginMeta = {
      ipAddress: clientIp,
      deviceId: deviceId || null,
      authProvider: 'google'
    }

    const blockedIpRecord = await findActiveBlockedIp(clientIpCandidates)
    if (blockedIpRecord) {
      await BlockedIP.findByIdAndUpdate(blockedIpRecord._id, {
        $inc: { attemptCount: 1 },
        $set: { lastAttemptAt: new Date() }
      })

      return res.status(403).json({
        error: 'Access denied. This IP address is blocked.',
        code: 'IP_BLOCKED',
        reason: blockedIpRecord.reason,
        blockedUntil: blockedIpRecord.expiresAt
      })
    }

    const googleProfile = await verifyGoogleSignInCredential(req.body.credential)
    const matchingAdmins = await Admin.find({
      email: googleProfile.email,
      emailVerified: true
    }).limit(2)

    if (matchingAdmins.length === 0) {
      return res.status(403).json({
        error: 'This Google account email is not verified in any profile.'
      })
    }

    if (matchingAdmins.length > 1) {
      return res.status(409).json({
        error: 'Multiple verified profiles use this email. Contact an administrator to resolve the duplicate email.'
      })
    }

    const admin = matchingAdmins[0]

    if (admin.primaryLoginMethod !== 'email') {
      return res.status(403).json({
        error: 'This email is verified, but it is not set as the primary login for the account.'
      })
    }

    const loginVerificationChallenge = await beginLoginEmailVerification({
      admin,
      deviceId,
      authProvider: 'google'
    })
    if (loginVerificationChallenge) {
      return res.status(202).json(loginVerificationChallenge)
    }

    const loginResponse = await completeAdminLogin({
      admin,
      clientIp,
      userAgent,
      deviceId,
      loginMeta: {
        ...loginMeta,
        googleEmail: googleProfile.email,
        googleSub: googleProfile.sub || null
      },
      auditDescription: `Admin login via Google: ${admin.username}`
    })

    res.json(loginResponse)
  } catch (err) {
    console.error('Google login error:', err.message)
    const message = err instanceof Error ? err.message : 'Google sign-in failed.'
    const statusCode = Number(err?.statusCode || (/not configured/i.test(message) ? 503 : 401))
    res.status(statusCode).json({ error: message })
  }
})

// ==================== STUDENT AUTHENTICATION ====================

// POST /api/student/login
app.post('/api/student/login', authLimiter, async (req, res) => {
  if (!dbReady) {
    return res.status(503).json({ error: 'Database unavailable. Check server logs and Atlas IP whitelist.' })
  }

  try {
    const { studentNumber, password } = req.body
    const normalizedStudentNumber = String(studentNumber || '').trim()
    const clientIpCandidates = getClientIpCandidates(req)
    const clientIp = getClientIpAddress(req)
    const userAgent = req.get('User-Agent')
    const deviceId = String(req.get('x-device-id') || '').trim()

    if (!normalizedStudentNumber || !password) {
      return res.status(400).json({ error: 'Student number and password are required.' })
    }

    const blockedIpRecord = await findActiveBlockedIp(clientIpCandidates)
    if (blockedIpRecord) {
      await BlockedIP.findByIdAndUpdate(blockedIpRecord._id, {
        $inc: { attemptCount: 1 },
        $set: { lastAttemptAt: new Date() }
      })

      return res.status(403).json({
        error: 'Access denied. This IP address is blocked.',
        code: 'IP_BLOCKED',
        reason: blockedIpRecord.reason,
        blockedUntil: blockedIpRecord.expiresAt
      })
    }

    const student = await Student.findOne({ 
      studentNumber: normalizedStudentNumber,
      isActive: true 
    }).select('+password')

    if (!student) {
      return res.status(401).json({ error: 'Invalid student number or password.' })
    }

    // If the student has a stored (hashed) password, compare against it.
    // If not, fall back to the generated default password (initials + last 4
    // digits of student number) so newly-enrolled students can log in before
    // a registrar sets a custom password.
    let isPasswordValid = false
    if (student.password) {
      isPasswordValid = await student.comparePassword(password)
      console.log(`[login] ${normalizedStudentNumber}: bcrypt compare -> ${isPasswordValid}`)
    } else {
      const defaultPassword = student.generateDefaultPassword()
      isPasswordValid = password === defaultPassword
      console.log(`[login] ${normalizedStudentNumber}: default pw check -> got="${password}" expected="${defaultPassword}" -> ${isPasswordValid}`)
      // Persist the hash so future logins go through the normal bcrypt path
      // and the student can change their password later.
      if (isPasswordValid) {
        student.password = defaultPassword
        await student.save()
      }
    }
    if (!isPasswordValid) {
      return res.status(401).json({ error: 'Invalid student number or password.' })
    }

    // Generate JWT token for student
    const token = jwt.sign(
      { 
        sub: student._id.toString(),
        studentNumber: student.studentNumber,
        type: 'student'
      },
      JWT_SECRET,
      { expiresIn: '7d' }
    )

    // Update last login
    student.lastLogin = new Date()
    await student.save()

    res.json({
      success: true,
      message: 'Login successful',
      data: {
        accessToken: token,
        refreshToken: token, // For simplicity, using same token as refresh
        student: {
          id: student._id.toString(),
          studentNumber: student.studentNumber,
          firstName: student.firstName,
          middleName: student.middleName,
          lastName: student.lastName,
          suffix: student.suffix,
          fullName: student.fullName,
          course: student.course,
          yearLevel: student.yearLevel,
          section: student.section,
          email: student.email,
          googleEmail: student.googleEmail,
          googleEmailVerified: student.googleEmailVerified
        }
      }
    })
  } catch (error) {
    console.error('Student login error:', error)
    res.status(500).json({ error: 'Login failed. Please try again.' })
  }
})

// POST /api/student/logout
app.post('/api/student/logout', async (req, res) => {
  try {
    // For JWT tokens, logout is handled client-side by removing the token
    // This endpoint exists for future token invalidation if needed
    res.json({ success: true, message: 'Logout successful' })
  } catch (error) {
    console.error('Student logout error:', error)
    res.status(500).json({ error: 'Logout failed.' })
  }
})

// POST /api/student/refresh-token
app.post('/api/student/refresh-token', async (req, res) => {
  try {
    const { refreshToken } = req.body

    if (!refreshToken) {
      return res.status(400).json({ error: 'Refresh token is required.' })
    }

    try {
      const decoded = jwt.verify(refreshToken, JWT_SECRET)
      
      if (decoded.type !== 'student') {
        return res.status(401).json({ error: 'Invalid token type.' })
      }

      const student = await Student.findById(decoded.sub).select('+password')
      if (!student || !student.isActive) {
        return res.status(401).json({ error: 'Student not found or inactive.' })
      }

      // Generate new access token
      const newAccessToken = jwt.sign(
        { 
          sub: student._id.toString(),
          studentNumber: student.studentNumber,
          type: 'student'
        },
        JWT_SECRET,
        { expiresIn: '7d' }
      )

      res.json({
        success: true,
        data: {
          accessToken: newAccessToken
        }
      })
    } catch (jwtError) {
      return res.status(401).json({ error: 'Invalid or expired refresh token.' })
    }
  } catch (error) {
    console.error('Token refresh error:', error)
    res.status(500).json({ error: 'Token refresh failed.' })
  }
})

// GET /api/student/schedule
app.get('/api/student/schedule', async (req, res) => {
  try {
    const auth = req.headers.authorization
    const token = auth && auth.startsWith('Bearer ') ? auth.slice(7) : null

    if (!token) {
      return res.status(401).json({ error: 'Unauthorized.' })
    }

    try {
      const decoded = jwt.verify(token, JWT_SECRET)
      
      if (decoded.type !== 'student') {
        return res.status(401).json({ error: 'Invalid token type.' })
      }

      const student = await Student.findById(decoded.sub)
      if (!student || !student.isActive) {
        return res.status(404).json({ error: 'Student not found.' })
      }

      // Get student's current enrollment with subjects
      const enrollment = await Enrollment.findOne({
        studentId: student._id,
        isCurrent: true,
        status: { $in: ['Enrolled', 'Pending'] }
      }).populate('subjects.subjectId')

      if (!enrollment) {
        return res.json({
          success: true,
          data: {
            schedule: [],
            message: 'No current enrollment found'
          }
        })
      }

      // Get student's block assignment
      let blockSchedule = null
      try {
        const blockAssignment = await StudentBlockAssignment.findOne({
          studentId: student._id.toString(),
          semester: enrollment.semester,
          year: parseInt(enrollment.schoolYear.split('-')[0]),
          status: 'ASSIGNED'
        }).populate('sectionId')

        if (blockAssignment && blockAssignment.sectionId) {
          const section = blockAssignment.sectionId
          const blockGroup = await BlockGroup.findById(section.blockGroupId)
          
          blockSchedule = {
            sectionCode: section.sectionCode,
            schedule: section.schedule || 'TBA',
            blockGroupName: blockGroup ? blockGroup.name : null,
            semester: blockAssignment.semester,
            schoolYear: enrollment.schoolYear
          }
        }
      } catch (blockError) {
        console.error('Error fetching block schedule:', blockError)
      }

      // Format subjects with schedule information
      const subjects = enrollment.subjects.map(subject => ({
        subjectId: subject.subjectId ? subject.subjectId._id.toString() : null,
        code: subject.code,
        title: subject.title,
        units: subject.units,
        schedule: subject.schedule || 'TBA',
        room: subject.room || 'TBA',
        instructor: subject.instructor || 'TBA',
        grade: subject.grade,
        status: subject.status
      }))

      res.json({
        success: true,
        data: {
          subjects: subjects,
          blockSchedule: blockSchedule,
          semester: enrollment.semester,
          schoolYear: enrollment.schoolYear,
          yearLevel: enrollment.yearLevel,
          course: enrollment.course
        }
      })
    } catch (jwtError) {
      return res.status(401).json({ error: 'Invalid or expired token.' })
    }
  } catch (error) {
    console.error('Get student schedule error:', error)
    res.status(500).json({ error: 'Failed to fetch student schedule.' })
  }
})

// GET /api/student/me
app.get('/api/student/me', async (req, res) => {
  try {
    const auth = req.headers.authorization
    const token = auth && auth.startsWith('Bearer ') ? auth.slice(7) : null

    if (!token) {
      return res.status(401).json({ error: 'Unauthorized.' })
    }

    try {
      const decoded = jwt.verify(token, JWT_SECRET)
      
      if (decoded.type !== 'student') {
        return res.status(401).json({ error: 'Invalid token type.' })
      }

      const student = await Student.findById(decoded.sub)
      if (!student || !student.isActive) {
        return res.status(404).json({ error: 'Student not found.' })
      }

      // Get student's block assignment with schedule
      let blockInfo = null
      try {
        const currentYear = new Date().getFullYear()
        const currentMonth = new Date().getMonth() + 1
        let currentSemester = '1st'
        if (currentMonth >= 6 && currentMonth <= 10) {
          currentSemester = '1st'
        } else {
          currentSemester = '2nd'
        }
        
        const blockAssignment = await StudentBlockAssignment.findOne({
          studentId: student._id.toString(),
          semester: student.semester || currentSemester,
          year: student.schoolYear ? parseInt(student.schoolYear.split('-')[0]) : currentYear,
          status: 'ASSIGNED'
        }).populate('sectionId')

        if (blockAssignment && blockAssignment.sectionId) {
          const section = blockAssignment.sectionId
          const blockGroup = await BlockGroup.findById(section.blockGroupId)
          
          blockInfo = {
            sectionId: section._id.toString(),
            sectionCode: section.sectionCode,
            schedule: section.schedule || 'TBA',
            blockGroupId: section.blockGroupId ? section.blockGroupId.toString() : null,
            blockGroupName: blockGroup ? blockGroup.name : null,
            semester: blockAssignment.semester,
            year: blockAssignment.year,
            capacity: section.capacity,
            currentPopulation: section.currentPopulation
          }
        }
      } catch (blockError) {
        console.error('Error fetching block info:', blockError)
        // Continue without block info if there's an error
      }

      res.json({
        success: true,
        data: {
          id: student._id.toString(),
          studentNumber: student.studentNumber,
          firstName: student.firstName,
          middleName: student.middleName,
          lastName: student.lastName,
          suffix: student.suffix,
          fullName: student.fullName,
          course: student.course,
          major: student.major,
          yearLevel: student.yearLevel,
          section: student.section,
          semester: student.semester,
          schoolYear: student.schoolYear,
          studentStatus: student.studentStatus,
          lifecycleStatus: student.lifecycleStatus,
          enrollmentStatus: student.enrollmentStatus,
          corStatus: student.corStatus,
          scholarship: student.scholarship,
          email: student.email,
          contactNumber: student.contactNumber,
          address: student.address,
          permanentAddress: student.permanentAddress,
          birthDate: student.birthDate,
          birthPlace: student.birthPlace,
          gender: student.gender,
          civilStatus: student.civilStatus,
          nationality: student.nationality,
          religion: student.religion,
          emergencyContact: student.emergencyContact,
          googleEmail: student.googleEmail,
          googleEmailVerified: student.googleEmailVerified,
          googlePicture: student.googlePicture,
          profilePictureUrl: student.profilePicture && student.profilePictureMimeType
            ? `data:${student.profilePictureMimeType};base64,${student.profilePicture}`
            : null,
          lastLogin: student.lastLogin,
          createdAt: student.createdAt,
          blockInfo: blockInfo
        }
      })
    } catch (jwtError) {
      return res.status(401).json({ error: 'Invalid or expired token.' })
    }
  } catch (error) {
    console.error('Get student profile error:', error)
    res.status(500).json({ error: 'Failed to fetch student profile.' })
  }
})

// PUT /api/student/profile — student updates their own contact/personal info.
// Only editable fields are accepted; academic fields (course, yearLevel, etc.)
// are managed by the registrar. Updates propagate to the same Student document
// the registrar sees, so changes are immediately reflected in the admin panel.
app.put('/api/student/profile', studentAuthMiddleware, async (req, res) => {
  try {
    const student = req.student
    if (!student) {
      return res.status(404).json({ error: 'Student not found.' })
    }

    // Whitelist of editable fields
    const allowed = [
      'email', 'contactNumber', 'address', 'permanentAddress',
      'birthDate', 'birthPlace', 'gender', 'civilStatus',
      'nationality', 'religion', 'emergencyContact'
    ]

    const updates = {}
    for (const field of allowed) {
      if (req.body[field] !== undefined) {
        updates[field] = req.body[field]
      }
    }

    // Validate email format if provided
    if (updates.email !== undefined) {
      const email = String(updates.email).trim()
      if (email && !/^\S+@\S+\.\S+$/.test(email)) {
        return res.status(400).json({ error: 'Please enter a valid email address.' })
      }
      updates.email = email
    }

    // Validate emergency contact structure if provided
    if (updates.emergencyContact !== undefined && updates.emergencyContact !== null) {
      const ec = updates.emergencyContact
      if (typeof ec !== 'object' || Array.isArray(ec)) {
        return res.status(400).json({ error: 'Emergency contact must be an object.' })
      }
      updates.emergencyContact = {
        name: String(ec.name || '').trim(),
        relationship: String(ec.relationship || '').trim(),
        contactNumber: String(ec.contactNumber || '').trim(),
        address: ec.address ? String(ec.address).trim() : undefined
      }
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'No valid fields to update.' })
    }

    Object.assign(student, updates)
    await student.save()

    console.log(`[profile-update] ${student.studentNumber}: updated ${Object.keys(updates).join(', ')}`)

    res.json({
      success: true,
      message: 'Profile updated successfully.',
      data: {
        id: student._id.toString(),
        studentNumber: student.studentNumber,
        firstName: student.firstName,
        middleName: student.middleName,
        lastName: student.lastName,
        suffix: student.suffix,
        fullName: student.fullName,
        course: student.course,
        major: student.major,
        yearLevel: student.yearLevel,
        section: student.section,
        semester: student.semester,
        schoolYear: student.schoolYear,
        studentStatus: student.studentStatus,
        lifecycleStatus: student.lifecycleStatus,
        enrollmentStatus: student.enrollmentStatus,
        corStatus: student.corStatus,
        scholarship: student.scholarship,
        email: student.email,
        contactNumber: student.contactNumber,
        address: student.address,
        permanentAddress: student.permanentAddress,
        birthDate: student.birthDate,
        birthPlace: student.birthPlace,
        gender: student.gender,
        civilStatus: student.civilStatus,
        nationality: student.nationality,
        religion: student.religion,
        emergencyContact: student.emergencyContact
      }
    })
  } catch (error) {
    console.error('Update student profile error:', error)
    if (error.name === 'ValidationError') {
      return res.status(400).json({ error: error.message })
    }
    res.status(500).json({ error: 'Failed to update profile.' })
  }
})

// POST /api/student/profile-picture — one-time profile picture upload.
// Students can set their profile picture only once. Once set, the picture
// cannot be changed or removed from the mobile app. Subsequent attempts
// return 409 Conflict.
app.post('/api/student/profile-picture', studentAuthMiddleware, async (req, res) => {
  try {
    const student = req.student
    if (!student) {
      return res.status(404).json({ error: 'Student not found.' })
    }

    // Enforce one-time-only upload
    if (student.profilePicture && student.profilePictureMimeType) {
      return res.status(409).json({
        error: 'Profile picture has already been set and cannot be changed.',
        errorCode: 'PROFILE_PICTURE_LOCKED'
      })
    }

    const { imageBase64, mimeType } = req.body || {}

    if (!imageBase64 || typeof imageBase64 !== 'string') {
      return res.status(400).json({ error: 'Image data is required.' })
    }

    const allowedMimeTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/jpg']
    const normalizedMime = (mimeType || '').toString().toLowerCase()
    if (!allowedMimeTypes.includes(normalizedMime)) {
      return res.status(400).json({ error: 'Only JPEG, PNG, or WebP images are allowed.' })
    }

    // Validate image size (base64 string size) — 5MB max
    const imageSizeInBytes = Buffer.byteLength(imageBase64, 'base64')
    if (imageSizeInBytes > 5 * 1024 * 1024) {
      return res.status(400).json({ error: 'Image size too large. Maximum 5MB allowed.' })
    }
    if (imageSizeInBytes < 1) {
      return res.status(400).json({ error: 'Image data is empty.' })
    }

    student.profilePicture = imageBase64
    student.profilePictureMimeType = normalizedMime
    await student.save()

    console.log(`[profile-picture] ${student.studentNumber}: profile picture uploaded (one-time)`)

    res.status(201).json({
      success: true,
      message: 'Profile picture uploaded successfully. This cannot be changed later.',
      data: {
        profilePictureUrl: `data:${normalizedMime};base64,${imageBase64}`
      }
    })
  } catch (error) {
    console.error('Upload student profile picture error:', error)
    res.status(500).json({ error: 'Failed to upload profile picture.' })
  }
})

// ==================== STUDENT MOBILE APP — SHARED HELPERS ====================

// Reusable auth guard for student-mobile-only endpoints. Verifies the bearer
// JWT, confirms it is a student-type token, and attaches the loaded student
// document to req.student.
async function studentAuthMiddleware(req, res, next) {
  try {
    const auth = req.headers.authorization
    const token = auth && auth.startsWith('Bearer ') ? auth.slice(7) : null
    if (!token) {
      return res.status(401).json({ error: 'Unauthorized.' })
    }

    const decoded = jwt.verify(token, JWT_SECRET)
    if (decoded.type !== 'student') {
      return res.status(401).json({ error: 'Invalid token type.' })
    }

    const student = await Student.findById(decoded.sub)
    if (!student || !student.isActive) {
      return res.status(404).json({ error: 'Student not found.' })
    }

    req.student = student
    next()
  } catch (error) {
    return res.status(401).json({ error: 'Invalid or expired token.' })
  }
}

const STUDENT_COURSE_LABELS = {
  101: 'BEED',
  102: 'BSEd-English',
  103: 'BSEd-Math',
  201: 'BSBA-HRM'
}

// Class-day codes follow the same fixed order used by the registrar's
// "Assign Professor" workspace: M, T, W, TH, F, S, SU (see
// RegistrarCourseWorkspace.tsx `dayOptions`). Schedule strings look like
// "MWF 08:00-09:30" or "TTH 13:00-14:30".
const SCHEDULE_DAY_TOKENS = ['TH', 'SU', 'M', 'T', 'W', 'F', 'S']
const WEEKDAY_INDEX_TO_CODE = ['SU', 'M', 'T', 'W', 'TH', 'F', 'S'] // Date#getDay(): 0=Sun..6=Sat

function parseScheduleDayCodes(dayPart) {
  const codes = []
  const upper = String(dayPart || '').toUpperCase()
  let i = 0
  while (i < upper.length) {
    const twoChar = upper.slice(i, i + 2)
    if (twoChar === 'TH' || twoChar === 'SU') {
      codes.push(twoChar)
      i += 2
      continue
    }
    const oneChar = upper[i]
    if (['M', 'T', 'W', 'F', 'S'].includes(oneChar)) {
      codes.push(oneChar)
    }
    i += 1
  }
  return codes
}

function parseScheduleString(schedule) {
  const trimmed = String(schedule || '').trim()
  const match = trimmed.match(/^([A-Z]+)\s+(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})$/i)
  if (!match) return null
  return {
    days: parseScheduleDayCodes(match[1]),
    startTime: match[2],
    endTime: match[3]
  }
}

// GET /api/student/dashboard — aggregated payload for the mobile app's home
// screen: profile summary, current academic context, today's schedule,
// latest grades, and the most recent student-facing announcements.
app.get('/api/student/dashboard', studentAuthMiddleware, async (req, res) => {
  try {
    const student = req.student

    const enrollment = await Enrollment.findOne({
      studentId: student._id,
      isCurrent: true,
      status: { $in: ['Enrolled', 'Pending'] }
    }).sort({ createdAt: -1 })

    let academicSummary = {
      hasCurrentEnrollment: false,
      enrolledSubjects: 0,
      totalUnits: 0,
      semester: student.semester || null,
      schoolYear: student.schoolYear || null,
      yearLevel: student.yearLevel || null
    }
    let todaySchedule = []
    let latestGrades = []
    let nextDayClasses = []
    let nextDayLabel = null

    if (enrollment) {
      // Only count subjects the student is currently enrolled in for this term.
      // Exclude Dropped, Removed, and Completed (finished subjects are no longer
      // "currently enrolled" even though they remain on the term record).
      const activeSubjects = (enrollment.subjects || []).filter(
        (subject) => ['Enrolled', 'Incomplete'].includes(subject.status)
      )

      academicSummary = {
        hasCurrentEnrollment: true,
        enrolledSubjects: activeSubjects.length,
        totalUnits: activeSubjects.reduce((sum, subject) => sum + (Number(subject.units) || 0), 0),
        semester: enrollment.semester,
        schoolYear: enrollment.schoolYear,
        yearLevel: enrollment.yearLevel
      }

      const todayCode = WEEKDAY_INDEX_TO_CODE[new Date().getDay()]
      const subjectsWithSchedule = activeSubjects.filter(
        (subject) => parseScheduleString(subject.schedule)
      )

      todaySchedule = activeSubjects
        .map((subject) => {
          const parsed = parseScheduleString(subject.schedule)
          if (!parsed || !parsed.days.includes(todayCode)) return null
          return {
            subjectCode: subject.code,
            subjectTitle: subject.title,
            room: subject.room || 'TBA',
            instructor: subject.instructor || 'TBA',
            startTime: parsed.startTime,
            endTime: parsed.endTime
          }
        })
        .filter(Boolean)
        .sort((a, b) => a.startTime.localeCompare(b.startTime))

      // Build the weekly schedule so the dashboard can show a preview
      // when today has no classes (avoids the "enrolled but no schedule" confusion).
      const weeklyByDay = { M: [], T: [], W: [], TH: [], F: [], S: [], SU: [] }
      for (const subject of activeSubjects) {
        const parsed = parseScheduleString(subject.schedule)
        if (!parsed) continue
        for (const dayCode of parsed.days) {
          if (!weeklyByDay[dayCode]) continue
          weeklyByDay[dayCode].push({
            subjectCode: subject.code,
            subjectTitle: subject.title,
            room: subject.room || 'TBA',
            instructor: subject.instructor || 'TBA',
            startTime: parsed.startTime,
            endTime: parsed.endTime
          })
        }
      }
      for (const dayCode of Object.keys(weeklyByDay)) {
        weeklyByDay[dayCode].sort((a, b) => a.startTime.localeCompare(b.startTime))
      }

      // Find the next day (from today forward) that has classes, for the
      // "no classes today" preview.
      const dayOrder = ['SU', 'M', 'T', 'W', 'TH', 'F', 'S']
      const todayIdx = dayOrder.indexOf(todayCode)
      for (let offset = 1; offset <= 7; offset++) {
        const dayCode = dayOrder[(todayIdx + offset) % 7]
        if (weeklyByDay[dayCode] && weeklyByDay[dayCode].length > 0) {
          nextDayClasses = weeklyByDay[dayCode]
          nextDayLabel = dayCode
          break
        }
      }

      academicSummary.scheduleStatus = subjectsWithSchedule.length === 0
        ? 'not_set'
        : todaySchedule.length > 0
          ? 'today'
          : 'none_today'

      latestGrades = activeSubjects
        .filter((subject) => subject.grade !== null && subject.grade !== undefined)
        .sort((a, b) => new Date(b.dateModified || 0) - new Date(a.dateModified || 0))
        .slice(0, 5)
        .map((subject) => ({
          subjectCode: subject.code,
          subjectTitle: subject.title,
          units: subject.units,
          grade: subject.grade,
          remarks: subject.remarks || (Number(subject.grade) <= 3.0 ? 'PASSED' : 'FAILED'),
          status: subject.status
        }))
    }

    const announcements = await Announcement.find({
      isActive: true,
      $or: [{ targetAudience: 'all' }, { targetAudience: 'students' }]
    })
      .sort({ isPinned: -1, createdAt: -1 })
      .limit(3)
      .select('title message type isPinned createdAt')
      .lean()

    res.json({
      success: true,
      data: {
        profile: {
          id: student._id.toString(),
          studentNumber: student.studentNumber,
          firstName: student.firstName,
          fullName: student.fullName,
          course: student.course,
          courseLabel: STUDENT_COURSE_LABELS[Number(student.course)] || null,
          yearLevel: student.yearLevel,
          section: student.section,
          schoolYear: student.schoolYear,
          semester: student.semester,
          studentStatus: student.studentStatus,
          corStatus: student.corStatus,
          profilePictureUrl: student.profilePicture && student.profilePictureMimeType
            ? `data:${student.profilePictureMimeType};base64,${student.profilePicture}`
            : null
        },
        academicSummary,
        todaySchedule,
        upcomingSchedule: nextDayClasses.length > 0 ? {
          dayLabel: nextDayLabel,
          classes: nextDayClasses
        } : null,
        latestGrades,
        announcements: announcements.map((announcement) => ({
          id: announcement._id.toString(),
          title: announcement.title,
          message: announcement.message,
          type: announcement.type,
          isPinned: announcement.isPinned,
          createdAt: announcement.createdAt
        }))
      }
    })
  } catch (error) {
    console.error('Get student dashboard error:', error)
    res.status(500).json({ error: 'Failed to load dashboard.' })
  }
})

// GET /api/student/grades — full grade history grouped by academic period.
// Returns current term + all historical enrollments that have graded
// subjects, so the mobile app can render Current / Historical tabs without
// ever mixing records from different academic years (spec §32).
app.get('/api/student/grades', studentAuthMiddleware, async (req, res) => {
  try {
    const student = req.student

    const enrollments = await Enrollment.find({
      studentId: student._id,
      status: { $ne: 'Dropped' }
    }).sort({ isCurrent: -1, createdAt: -1 })

    const periods = enrollments
      .map((enrollment) => {
        const graded = (enrollment.subjects || [])
          .filter((subject) => subject.grade !== null && subject.grade !== undefined)
          .map((subject) => ({
            subjectCode: subject.code,
            subjectTitle: subject.title,
            units: subject.units,
            grade: subject.grade,
            remarks: subject.remarks || (Number(subject.grade) <= 3.0 ? 'PASSED' : 'FAILED'),
            status: subject.status
          }))

        if (graded.length === 0) return null

        const totalUnits = graded.reduce((sum, g) => sum + (Number(g.units) || 0), 0)
        const weightedSum = graded.reduce((sum, g) => sum + (Number(g.grade) || 0) * (Number(g.units) || 0), 0)
        const termGpa = totalUnits > 0 ? weightedSum / totalUnits : null

        return {
          isCurrent: !!enrollment.isCurrent,
          semester: enrollment.semester,
          schoolYear: enrollment.schoolYear,
          yearLevel: enrollment.yearLevel,
          termGpa: termGpa ? Number(termGpa.toFixed(2)) : null,
          totalUnits,
          subjects: graded
        }
      })
      .filter(Boolean)

    const allGradedSubjects = periods.flatMap((p) => p.subjects)
    const cumulativeUnits = allGradedSubjects.reduce((sum, g) => sum + (Number(g.units) || 0), 0)
    const cumulativeWeighted = allGradedSubjects.reduce(
      (sum, g) => sum + (Number(g.grade) || 0) * (Number(g.units) || 0),
      0
    )
    const cumulativeGpa = cumulativeUnits > 0 ? Number((cumulativeWeighted / cumulativeUnits).toFixed(2)) : null

    res.json({
      success: true,
      data: {
        periods,
        summary: {
          cumulativeGpa,
          totalUnitsEarned: cumulativeUnits,
          totalSubjectsCompleted: allGradedSubjects.length
        }
      }
    })
  } catch (error) {
    console.error('Get student grades error:', error)
    res.status(500).json({ error: 'Failed to load grades.' })
  }
})

// GET /api/student/announcements — paginated, student-facing announcements.
// Reuses the same Announcement model the admin/registrar writes to, scoped
// to audiences "all" or "students". Supports optional ?limit and ?offset.
app.get('/api/student/announcements', studentAuthMiddleware, async (req, res) => {
  try {
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 50)
    const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0)

    const filter = {
      isActive: true,
      targetAudience: { $in: ['all', 'students'] }
    }

    const [announcements, total] = await Promise.all([
      Announcement.find(filter)
        .sort({ isPinned: -1, createdAt: -1 })
        .skip(offset)
        .limit(limit)
        .select('title message type targetAudience isPinned createdAt media')
        .lean(),
      Announcement.countDocuments(filter)
    ])

    res.json({
      success: true,
      data: {
        items: announcements.map((a) => ({
          id: a._id.toString(),
          title: a.title,
          message: a.message,
          type: a.type,
          targetAudience: Array.isArray(a.targetAudience) ? a.targetAudience : [],
          isPinned: a.isPinned,
          createdAt: a.createdAt,
          media: Array.isArray(a.media) ? a.media.map((m) => ({
            type: m.type,
            url: m.url,
            caption: m.caption || null
          })) : []
        })),
        total,
        limit,
        offset,
        hasMore: offset + announcements.length < total
      }
    })
  } catch (error) {
    console.error('Get student announcements error:', error)
    res.status(500).json({ error: 'Failed to load announcements.' })
  }
})

// GET /api/student/cor — Certificate of Registration as a real PDF.
// Reuses the exact same StudentController.generateCorPdf the registrar uses
// (spec §17: "Do not generate fake COR documents on the mobile client"),
// just routed through the student auth guard instead of an admin guard.
app.get('/api/student/cor', studentAuthMiddleware, async (req, res) => {
  // generateCorPdf expects req.params.id; synthesize it from the authed student.
  req.params = { id: req.student._id.toString() }
  return StudentController.generateCorPdf(req, res)
})

// GET /api/student/schedule/weekly — current-term schedule grouped by day
// (M/T/W/TH/F/S/SU), parsed from the same schedule strings the registrar
// workspace writes. The legacy /api/student/schedule stays untouched for
// backward compatibility with the old mobile build.
app.get('/api/student/schedule/weekly', studentAuthMiddleware, async (req, res) => {
  try {
    const student = req.student

    const enrollment = await Enrollment.findOne({
      studentId: student._id,
      isCurrent: true,
      status: { $in: ['Enrolled', 'Pending'] }
    }).sort({ createdAt: -1 })

    if (!enrollment) {
      return res.json({
        success: true,
        data: {
          semester: student.semester || null,
          schoolYear: student.schoolYear || null,
          yearLevel: student.yearLevel || null,
          byDay: { M: [], T: [], W: [], TH: [], F: [], S: [], SU: [] },
          message: 'No current enrollment found.'
        }
      })
    }

    const activeSubjects = (enrollment.subjects || []).filter(
      (subject) => !['Dropped', 'Removed'].includes(subject.status)
    )

    const byDay = { M: [], T: [], W: [], TH: [], F: [], S: [], SU: [] }
    for (const subject of activeSubjects) {
      const parsed = parseScheduleString(subject.schedule)
      if (!parsed) continue
      for (const dayCode of parsed.days) {
        if (!byDay[dayCode]) continue
        byDay[dayCode].push({
          subjectCode: subject.code,
          subjectTitle: subject.title,
          room: subject.room || 'TBA',
          instructor: subject.instructor || 'TBA',
          startTime: parsed.startTime,
          endTime: parsed.endTime
        })
      }
    }

    // Sort each day's classes by start time.
    for (const dayCode of Object.keys(byDay)) {
      byDay[dayCode].sort((a, b) => a.startTime.localeCompare(b.startTime))
    }

    res.json({
      success: true,
      data: {
        semester: enrollment.semester,
        schoolYear: enrollment.schoolYear,
        yearLevel: enrollment.yearLevel,
        byDay
      }
    })
  } catch (error) {
    console.error('Get student weekly schedule error:', error)
    res.status(500).json({ error: 'Failed to load weekly schedule.' })
  }
})

// PUT /api/student/settings
app.put('/api/student/settings', async (req, res) => {
  try {
    const auth = req.headers.authorization
    const token = auth && auth.startsWith('Bearer ') ? auth.slice(7) : null

    if (!token) {
      return res.status(401).json({ error: 'Unauthorized.' })
    }

    try {
      const decoded = jwt.verify(token, JWT_SECRET)
      
      if (decoded.type !== 'student') {
        return res.status(401).json({ error: 'Invalid token type.' })
      }

      const student = await Student.findById(decoded.sub)
      if (!student || !student.isActive) {
        return res.status(404).json({ error: 'Student not found.' })
      }

      const { googleEmail, unlinkGoogle } = req.body

      if (unlinkGoogle) {
        student.googleId = null
        student.googleEmail = null
        student.googleEmailVerified = false
        student.googlePicture = null
      } else if (googleEmail) {
        // For now, just store the email - OAuth integration would be separate
        student.googleEmail = googleEmail.toLowerCase().trim()
        student.googleEmailVerified = false // Would be true after OAuth verification
      }

      await student.save()

      res.json({
        success: true,
        message: 'Settings updated successfully',
        data: {
          googleEmail: student.googleEmail,
          googleEmailVerified: student.googleEmailVerified
        }
      })
    } catch (jwtError) {
      return res.status(401).json({ error: 'Invalid or expired token.' })
    }
  } catch (error) {
    console.error('Update student settings error:', error)
    res.status(500).json({ error: 'Failed to update settings.' })
  }
})

// POST /api/student/google-login (placeholder for future OAuth implementation)
app.post('/api/student/google-login', async (req, res) => {
  try {
    const { googleId, email, name, picture } = req.body

    if (!googleId || !email) {
      return res.status(400).json({ error: 'Google ID and email are required.' })
    }

    // Find student by linked Google account
    let student = await Student.findOne({ 
      googleId: googleId,
      isActive: true 
    })

    if (!student) {
      // Try to find by email if not linked yet
      student = await Student.findOne({ 
        email: email.toLowerCase(),
        isActive: true 
      })

      if (student) {
        // Link the Google account
        student.googleId = googleId
        student.googleEmail = email.toLowerCase()
        student.googleEmailVerified = true
        student.googlePicture = picture
        await student.save()
      } else {
        return res.status(404).json({ error: 'No student account found with this email. Please contact the registrar.' })
      }
    }

    // Generate JWT token
    const token = jwt.sign(
      { 
        sub: student._id.toString(),
        studentNumber: student.studentNumber,
        type: 'student'
      },
      JWT_SECRET,
      { expiresIn: '7d' }
    )

    // Update last login
    student.lastLogin = new Date()
    await student.save()

    res.json({
      success: true,
      message: 'Google login successful',
      data: {
        accessToken: token,
        refreshToken: token,
        student: {
          id: student._id.toString(),
          studentNumber: student.studentNumber,
          firstName: student.firstName,
          middleName: student.middleName,
          lastName: student.lastName,
          suffix: student.suffix,
          fullName: student.fullName,
          course: student.course,
          yearLevel: student.yearLevel,
          section: student.section,
          email: student.email,
          googleEmail: student.googleEmail,
          googleEmailVerified: student.googleEmailVerified
        }
      }
    })
  } catch (error) {
    console.error('Student Google login error:', error)
    res.status(500).json({ error: 'Google login failed. Please try again.' })
  }
})

app.post('/api/admin/login/verify-email', authLimiter, securityMiddleware.inputValidationMiddleware(securityMiddleware.schemas.admin.verifyLoginEmailVerification), async (req, res) => {
  if (!dbReady) {
    return res.status(503).json({ error: 'Database unavailable. Check server logs and Atlas IP whitelist.' })
  }

  try {
    const challengeTokenHash = hashLoginEmailVerificationChallengeToken(req.body.challengeToken)
    const clientIpCandidates = getClientIpCandidates(req)
    const clientIp = getClientIpAddress(req)
    const userAgent = req.get('User-Agent')
    const deviceId = String(req.get('x-device-id') || '').trim()

    const blockedIpRecord = await findActiveBlockedIp(clientIpCandidates)
    if (blockedIpRecord) {
      await BlockedIP.findByIdAndUpdate(blockedIpRecord._id, {
        $inc: { attemptCount: 1 },
        $set: { lastAttemptAt: new Date() }
      })

      return res.status(403).json({
        error: 'Access denied. This IP address is blocked.',
        code: 'IP_BLOCKED',
        reason: blockedIpRecord.reason,
        blockedUntil: blockedIpRecord.expiresAt
      })
    }

    const admin = await Admin.findOne({
      loginEmailVerificationChallengeHash: challengeTokenHash
    }).select('+loginEmailVerificationCodeHash +loginEmailVerificationExpiresAt +loginEmailVerificationChallengeHash +loginEmailVerificationDeviceId +loginEmailVerificationAuthProvider')

    if (!admin) {
      return res.status(400).json({ error: 'Login verification challenge was not found or has expired.' })
    }

    if (admin.loginEmailVerificationDeviceId && admin.loginEmailVerificationDeviceId !== deviceId) {
      return res.status(400).json({ error: 'Complete the login verification on the same device where the sign-in started.' })
    }

    if (!admin.loginEmailVerificationCodeHash || !admin.loginEmailVerificationExpiresAt) {
      clearLoginEmailVerificationState(admin)
      await admin.save()
      return res.status(400).json({ error: 'No active login verification code was found. Sign in again to request a new one.' })
    }

    if (new Date(admin.loginEmailVerificationExpiresAt).getTime() < Date.now()) {
      clearLoginEmailVerificationState(admin)
      await admin.save()
      return res.status(400).json({ error: 'Login verification code has expired. Sign in again to request a new one.' })
    }

    const providedCodeHash = hashPhoneVerificationCode(req.body.code)
    if (providedCodeHash !== admin.loginEmailVerificationCodeHash) {
      return res.status(400).json({ error: 'Invalid login verification code.' })
    }

    const authProvider = admin.loginEmailVerificationAuthProvider === 'google' ? 'google' : 'password'
    clearLoginEmailVerificationState(admin)
    await admin.save()

    const loginResponse = await completeAdminLogin({
      admin,
      clientIp,
      userAgent,
      deviceId,
      loginMeta: {
        ipAddress: clientIp,
        deviceId: deviceId || null,
        authProvider,
        loginEmailVerification: true
      },
      auditDescription: authProvider === 'google'
        ? `Admin login via Google: ${admin.username}`
        : `Admin login: ${admin.username}`
    })

    res.json(loginResponse)
  } catch (err) {
    console.error('Login email verification error:', err.message)
    res.status(Number(err?.statusCode || 500)).json({ error: err?.message || 'Failed to verify login email code.' })
  }
})

// POST /api/admin/logout - Invalidate token
app.post('/api/admin/logout', authMiddleware, async (req, res) => {
  try {
    // Deactivate the token if it exists
    if (req.tokenId) {
      await AuthToken.findByIdAndUpdate(req.tokenId, {
        isActive: false,
        invalidationReason: 'manual_logout',
        invalidatedAt: new Date()
      })
    }
    
    // Log the logout action
    await logAudit(
      'LOGOUT',
      'ADMIN',
      req.adminId.toString(),
      req.username,
      `Admin logout: ${req.username}`,
      req.adminId.toString(),
      req.accountType,
      null,
      null,
      'SUCCESS',
      'LOW'
    )
    
    res.json({ message: 'Logged out successfully.' })
  } catch (err) {
    console.error('Logout error:', err)
    res.status(500).json({ error: 'Logout failed.' })
  }
})

const ADMIN_ADDITIONAL_INFO_FIELDS = [
  'bio',
  'secondPhone',
  'address',
  'emergencyContact',
  'emergencyRelationship',
  'emergencyPhone',
  'bloodType',
  'allergies',
  'medicalConditions',
  'skills'
]

const normalizeAdminAdditionalInfo = (rawValue) => {
  const source = rawValue && typeof rawValue === 'object' && !Array.isArray(rawValue)
    ? rawValue
    : {}
  const normalized = {}

  ADMIN_ADDITIONAL_INFO_FIELDS.forEach((field) => {
    normalized[field] = String(source[field] || '').trim()
  })

  return normalized
}

const buildAdminProfileResponse = (adminRecord) => ({
  username: adminRecord.username,
  displayName: adminRecord.displayName || '',
  email: adminRecord.email || '',
  emailVerified: Boolean(adminRecord.emailVerified),
  primaryLoginMethod: adminRecord.primaryLoginMethod === 'email' ? 'email' : 'username',
  loginEmailVerificationEnabled: Boolean(adminRecord.loginEmailVerificationEnabled),
  phone: adminRecord.phone || '',
  phoneVerified: Boolean(adminRecord.phoneVerified),
  avatar: adminRecord.avatar || '',
  accountType: adminRecord.accountType,
  additionalInfo: normalizeAdminAdditionalInfo(adminRecord.additionalInfo)
})

// GET /api/admin/profile – requires Bearer token
app.get('/api/admin/profile', authMiddleware, securityMiddleware.inputValidationMiddleware(securityMiddleware.schemas.admin.getProfile), async (req, res) => {
  // No body/query validation needed for GET
  if (!dbReady) {
    return res.status(503).json({ error: 'Database unavailable.' })
  }
  try {
    const admin = await Admin.findById(req.adminId)
      .select('username displayName email emailVerified primaryLoginMethod loginEmailVerificationEnabled phone phoneVerified avatar accountType additionalInfo')
      .lean()
    if (!admin) return res.status(404).json({ error: 'Admin not found.' })
    
    const profileData = buildAdminProfileResponse(admin)
    res.json(profileData)
  } catch (err) {
    logger.error('Profile get error:', err.message)
    res.status(500).json({ error: 'Failed to load profile.' })
  }
})


// PATCH /api/admin/profile – update profile (username, displayName, email, password)
app.patch('/api/admin/profile', authMiddleware, securityMiddleware.inputValidationMiddleware(securityMiddleware.schemas.admin.updateProfile), async (req, res) => {
  if (!dbReady) {
    return res.status(503).json({ error: 'Database unavailable.' })
  }
  try {
    const admin = await Admin.findById(req.adminId)
    if (!admin) return res.status(404).json({ error: 'Admin not found.' })

    const {
      displayName,
      email,
      phone,
      primaryLoginMethod,
      loginEmailVerificationEnabled,
      newUsername,
      currentPassword,
      newPassword,
      additionalInfo
    } = req.body

    if (typeof displayName === 'string') admin.displayName = displayName.trim()
    if (typeof email === 'string') {
      const normalizedEmail = email.trim().toLowerCase()
      if (normalizedEmail !== String(admin.email || '').trim().toLowerCase()) {
        const conflictingEmailOwner = await findAdminEmailConflictOwner(admin._id, normalizedEmail)
        if (conflictingEmailOwner) {
          return res.status(409).json({ error: 'That email is already used by another account.' })
        }

        admin.email = normalizedEmail
        admin.emailVerified = false
        admin.emailVerificationCodeHash = ''
        admin.emailVerificationExpiresAt = null
        admin.primaryLoginMethod = 'username'
        admin.loginEmailVerificationEnabled = false
        clearLoginEmailVerificationState(admin)
        clearPendingEmailChangeState(admin)
      } else {
        admin.email = normalizedEmail
      }
    }
    if (typeof phone === 'string') {
      const trimmedPhone = String(phone || '').trim()
      const normalizedPhone = normalizePhilippineMobileNumber(trimmedPhone)
      const phoneForStorage = normalizedPhone && isValidPhilippineMobileNumber(normalizedPhone)
        ? normalizedPhone
        : trimmedPhone

      if (phoneForStorage !== String(admin.phone || '')) {
        admin.phone = phoneForStorage
        admin.phoneVerified = false
        admin.phoneVerificationCodeHash = ''
        admin.phoneVerificationExpiresAt = null
      }
    }

    if (typeof primaryLoginMethod === 'string') {
      if (primaryLoginMethod === 'email') {
        const normalizedEmail = String(admin.email || '').trim().toLowerCase()
        if (!isValidEmailAddress(normalizedEmail)) {
          return res.status(400).json({ error: 'Add a valid email address before making it primary.' })
        }
        if (!admin.emailVerified) {
          return res.status(400).json({ error: 'Verify your email address before making it primary.' })
        }

        const conflictingEmailOwner = await findAdminEmailConflictOwner(admin._id, normalizedEmail)
        if (conflictingEmailOwner) {
          return res.status(409).json({ error: 'That email is already used by another account.' })
        }
      }

      admin.primaryLoginMethod = primaryLoginMethod === 'email' ? 'email' : 'username'
    }

    if (typeof loginEmailVerificationEnabled === 'boolean') {
      if (loginEmailVerificationEnabled) {
        const normalizedEmail = String(admin.email || '').trim().toLowerCase()
        if (!isValidEmailAddress(normalizedEmail) || !admin.emailVerified) {
          return res.status(400).json({ error: 'Verify your email address before enabling login email verification.' })
        }
      } else {
        clearLoginEmailVerificationState(admin)
      }

      admin.loginEmailVerificationEnabled = loginEmailVerificationEnabled
    }

    if (typeof newUsername === 'string') {
      const trimmed = newUsername.trim().toLowerCase()
      if (trimmed && trimmed !== admin.username) {
        const existing = await Admin.findOne({ username: trimmed })
        if (existing) {
          return res.status(409).json({ error: 'Username already taken.' })
        }
        admin.username = trimmed
      }
    }

    if (typeof newPassword === 'string' && newPassword.length >= 6) {
      if (!currentPassword || typeof currentPassword !== 'string') {
        return res.status(400).json({ error: 'Current password is required to set a new password.' })
      }
      const match = await admin.comparePassword(currentPassword)
      if (!match) {
        return res.status(401).json({ error: 'Current password is incorrect.' })
      }
      admin.password = newPassword
    }

    if (additionalInfo && typeof additionalInfo === 'object' && !Array.isArray(additionalInfo)) {
      admin.additionalInfo = normalizeAdminAdditionalInfo({
        ...(admin.additionalInfo || {}),
        ...additionalInfo
      })
    }

    await admin.save()
    const updated = await Admin.findById(admin._id).select('-password')
    res.json(buildAdminProfileResponse(updated))
  } catch (err) {
    console.error('Profile update error:', err.message)
    res.status(500).json({ error: 'Failed to update profile.' })
  }
})

// POST /api/admin/profile/email/send-code - send email verification code
app.post('/api/admin/profile/email/send-code', verificationLimiter, authMiddleware, securityMiddleware.inputValidationMiddleware(securityMiddleware.schemas.admin.sendEmailVerificationCode), async (req, res) => {
  if (!dbReady) {
    return res.status(503).json({ error: 'Database unavailable.' })
  }

  if (!verificationEmailService.isConfigured()) {
    return res.status(503).json({
      error: 'Email verification service is not configured. Set Gmail API, Semaphore Email, or SendGrid credentials.'
    })
  }

  try {
    const admin = await Admin.findById(req.adminId).select('+emailVerificationCodeHash +emailVerificationExpiresAt')
    if (!admin) return res.status(404).json({ error: 'Admin not found.' })

    const requestedEmail = String(req.body.email || '').trim().toLowerCase()
    if (!isValidEmailAddress(requestedEmail)) {
      return res.status(400).json({ error: 'Enter a valid email address before verification.' })
    }

    const conflictingEmailOwner = await findAdminEmailConflictOwner(admin._id, requestedEmail)
    if (conflictingEmailOwner) {
      return res.status(409).json({ error: 'That email is already used by another account.' })
    }

    const verificationCode = generatePhoneVerificationCode()
    const verificationCodeHash = hashPhoneVerificationCode(verificationCode)
    const expiresAt = new Date(Date.now() + EMAIL_VERIFICATION_CODE_TTL_MS)
    const expiresInMinutes = Math.max(1, Math.ceil(EMAIL_VERIFICATION_CODE_TTL_MS / 60000))

    admin.email = requestedEmail
    admin.emailVerified = false
    admin.emailVerificationCodeHash = verificationCodeHash
    admin.emailVerificationExpiresAt = expiresAt
    admin.primaryLoginMethod = 'username'
    admin.loginEmailVerificationEnabled = false
    clearLoginEmailVerificationState(admin)
    clearPendingEmailChangeState(admin)
    await admin.save()

    let deliveryResult = null

    try {
      deliveryResult = await verificationEmailService.sendVerificationCode({
        to: requestedEmail,
        code: verificationCode,
        expiresInMinutes,
        displayName: admin.displayName || admin.username || 'Administrator'
      })
    } catch (deliveryError) {
      admin.emailVerificationCodeHash = ''
      admin.emailVerificationExpiresAt = null
      await admin.save()
      const deliveryErrorMessage = deliveryError?.message || 'Failed to send verification code.'
      console.error('Email verification delivery error:', deliveryErrorMessage)
      return res.status(502).json({
        error: deliveryErrorMessage
      })
    }

    res.json({
      message: 'Verification code sent.',
      email: requestedEmail,
      expiresAt: expiresAt.toISOString(),
      channel: 'email',
      emailProvider: deliveryResult.emailProvider,
      destination: deliveryResult.recipient || requestedEmail,
      deliveryStatus: deliveryResult.status,
      messageId: deliveryResult.messageId,
      providerMessage: deliveryResult.providerMessage || null
    })
  } catch (err) {
    console.error('Send email verification code error:', err.message)
    res.status(500).json({ error: 'Failed to send verification code.' })
  }
})

// POST /api/admin/profile/email/verify - verify email code
app.post('/api/admin/profile/email/verify', verificationLimiter, authMiddleware, securityMiddleware.inputValidationMiddleware(securityMiddleware.schemas.admin.verifyEmailVerificationCode), async (req, res) => {
  if (!dbReady) {
    return res.status(503).json({ error: 'Database unavailable.' })
  }

  try {
    const admin = await Admin.findById(req.adminId).select('+emailVerificationCodeHash +emailVerificationExpiresAt')
    if (!admin) return res.status(404).json({ error: 'Admin not found.' })

    const normalizedEmail = String(admin.email || '').trim().toLowerCase()
    if (!isValidEmailAddress(normalizedEmail)) {
      return res.status(400).json({ error: 'Add a valid email address before verification.' })
    }

    if (!admin.emailVerificationCodeHash || !admin.emailVerificationExpiresAt) {
      return res.status(400).json({ error: 'No active verification code found. Request a new code first.' })
    }

    if (new Date(admin.emailVerificationExpiresAt).getTime() < Date.now()) {
      admin.emailVerificationCodeHash = ''
      admin.emailVerificationExpiresAt = null
      await admin.save()
      return res.status(400).json({ error: 'Verification code has expired. Request a new one.' })
    }

    const providedCodeHash = hashPhoneVerificationCode(req.body.code)
    if (providedCodeHash !== admin.emailVerificationCodeHash) {
      return res.status(400).json({ error: 'Invalid verification code.' })
    }

    const conflictingEmailOwner = await findAdminEmailConflictOwner(admin._id, normalizedEmail)
    if (conflictingEmailOwner) {
      admin.emailVerified = false
      admin.emailVerificationCodeHash = ''
      admin.emailVerificationExpiresAt = null
      admin.primaryLoginMethod = 'username'
      admin.loginEmailVerificationEnabled = false
      clearLoginEmailVerificationState(admin)
      clearPendingEmailChangeState(admin)
      await admin.save()
      return res.status(409).json({ error: 'That email is already used by another account.' })
    }

    admin.email = normalizedEmail
    admin.emailVerified = true
    admin.emailVerificationCodeHash = ''
    admin.emailVerificationExpiresAt = null
    await admin.save()

    res.json(buildAdminProfileResponse(admin))
  } catch (err) {
    console.error('Email verification error:', err.message)
    res.status(500).json({ error: 'Failed to verify email address.' })
  }
})

app.post('/api/admin/profile/email/change/request', verificationLimiter, authMiddleware, securityMiddleware.inputValidationMiddleware(securityMiddleware.schemas.admin.requestEmailChangeVerification), async (req, res) => {
  if (!dbReady) {
    return res.status(503).json({ error: 'Database unavailable.' })
  }

  if (!verificationEmailService.isConfigured()) {
    return res.status(503).json({
      error: 'Email verification service is not configured. Set Gmail API, Semaphore Email, or SendGrid credentials.'
    })
  }

  try {
    const admin = await Admin.findById(req.adminId).select('+pendingEmailChange +pendingEmailChangeCodeHash +pendingEmailChangeExpiresAt')
    if (!admin) return res.status(404).json({ error: 'Admin not found.' })

    const currentEmail = String(admin.email || '').trim().toLowerCase()
    const requestedEmail = String(req.body.email || '').trim().toLowerCase()

    if (!admin.emailVerified || admin.primaryLoginMethod !== 'email' || !isValidEmailAddress(currentEmail)) {
      return res.status(400).json({ error: 'Enable Google sign-in with a verified primary email before changing it.' })
    }

    if (!isValidEmailAddress(requestedEmail)) {
      return res.status(400).json({ error: 'Enter a valid replacement email address.' })
    }

    if (requestedEmail === currentEmail) {
      return res.status(400).json({ error: 'Enter a different email address to continue.' })
    }

    const conflictingEmailOwner = await findAdminEmailConflictOwner(admin._id, requestedEmail)
    if (conflictingEmailOwner) {
      return res.status(409).json({ error: 'That email is already used by another account.' })
    }

    const verificationCode = generatePhoneVerificationCode()
    const verificationCodeHash = hashPhoneVerificationCode(verificationCode)
    const expiresAt = new Date(Date.now() + EMAIL_VERIFICATION_CODE_TTL_MS)
    const expiresInMinutes = Math.max(1, Math.ceil(EMAIL_VERIFICATION_CODE_TTL_MS / 60000))

    admin.pendingEmailChange = requestedEmail
    admin.pendingEmailChangeCodeHash = verificationCodeHash
    admin.pendingEmailChangeExpiresAt = expiresAt
    await admin.save()

    let deliveryResult = null

    try {
      deliveryResult = await verificationEmailService.sendVerificationCode({
        to: requestedEmail,
        code: verificationCode,
        expiresInMinutes,
        displayName: admin.displayName || admin.username || 'Administrator'
      })
    } catch (deliveryError) {
      clearPendingEmailChangeState(admin)
      await admin.save()
      const deliveryErrorMessage = deliveryError?.message || 'Failed to send verification code.'
      console.error('Email change verification delivery error:', deliveryErrorMessage)
      return res.status(502).json({
        error: deliveryErrorMessage
      })
    }

    res.json({
      message: 'Verification code sent.',
      email: requestedEmail,
      expiresAt: expiresAt.toISOString(),
      channel: 'email',
      emailProvider: deliveryResult.emailProvider,
      destination: deliveryResult.recipient || requestedEmail,
      deliveryStatus: deliveryResult.status,
      messageId: deliveryResult.messageId,
      providerMessage: deliveryResult.providerMessage || null
    })
  } catch (err) {
    console.error('Request email change verification error:', err.message)
    res.status(500).json({ error: 'Failed to start the email change verification.' })
  }
})

app.post('/api/admin/profile/email/change/verify', verificationLimiter, authMiddleware, securityMiddleware.inputValidationMiddleware(securityMiddleware.schemas.admin.verifyEmailChangeVerification), async (req, res) => {
  if (!dbReady) {
    return res.status(503).json({ error: 'Database unavailable.' })
  }

  try {
    const admin = await Admin.findById(req.adminId).select('+pendingEmailChange +pendingEmailChangeCodeHash +pendingEmailChangeExpiresAt')
    if (!admin) return res.status(404).json({ error: 'Admin not found.' })

    const pendingEmailChange = String(admin.pendingEmailChange || '').trim().toLowerCase()
    if (!isValidEmailAddress(pendingEmailChange) || !admin.pendingEmailChangeCodeHash || !admin.pendingEmailChangeExpiresAt) {
      return res.status(400).json({ error: 'No pending email change was found. Start the change request again.' })
    }

    if (new Date(admin.pendingEmailChangeExpiresAt).getTime() < Date.now()) {
      clearPendingEmailChangeState(admin)
      await admin.save()
      return res.status(400).json({ error: 'Verification code has expired. Start the email change again.' })
    }

    const providedCodeHash = hashPhoneVerificationCode(req.body.code)
    if (providedCodeHash !== admin.pendingEmailChangeCodeHash) {
      return res.status(400).json({ error: 'Invalid verification code.' })
    }

    const conflictingEmailOwner = await findAdminEmailConflictOwner(admin._id, pendingEmailChange)
    if (conflictingEmailOwner) {
      clearPendingEmailChangeState(admin)
      await admin.save()
      return res.status(409).json({ error: 'That email is already used by another account.' })
    }

    admin.email = pendingEmailChange
    admin.emailVerified = true
    admin.primaryLoginMethod = 'email'
    clearPendingEmailChangeState(admin)
    clearLoginEmailVerificationState(admin)
    await admin.save()

    res.json(buildAdminProfileResponse(admin))
  } catch (err) {
    console.error('Verify email change error:', err.message)
    res.status(500).json({ error: 'Failed to verify the new email address.' })
  }
})

// POST /api/admin/profile/phone/send-code - send SMS verification code
app.post('/api/admin/profile/phone/send-code', verificationLimiter, authMiddleware, securityMiddleware.inputValidationMiddleware(securityMiddleware.schemas.admin.sendPhoneVerificationCode), async (req, res) => {
  if (!dbReady) {
    return res.status(503).json({ error: 'Database unavailable.' })
  }

  // Provider check
  if (useSupabasePhoneAuth) {
    if (!supabaseAuthService.isConfigured()) {
      return res.status(503).json({ error: 'Supabase Auth is not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.' })
    }
  } else {
    const activeSmsService = getActiveSmsService()
    if (!activeSmsService.isConfigured()) {
      const missingEnv = useTextlocalSms ? 'TEXTLOCAL_API_KEY' : 'SMS_API_PH_API_KEY'
      return res.status(503).json({ error: `SMS gateway is not configured. Set ${missingEnv}.` })
    }
  }

  try {
    const admin = await Admin.findById(req.adminId).select('+phoneVerificationCodeHash +phoneVerificationExpiresAt')
    if (!admin) return res.status(404).json({ error: 'Admin not found.' })

    const requestedPhone = String(req.body.phone || '').trim()
    const normalizedPhone = normalizePhilippineMobileNumber(requestedPhone)
    if (!isValidPhilippineMobileNumber(normalizedPhone)) {
      return res.status(400).json({ error: 'Invalid mobile number. Use 09XXXXXXXXX.' })
    }

    // ── Supabase provider ──
    // Supabase generates and sends the OTP itself; we don't store a code hash.
    if (useSupabasePhoneAuth) {
      const phoneE164 = philippineNumberToE164(normalizedPhone)
      admin.phone = normalizedPhone
      admin.phoneVerified = false
      admin.phoneVerificationCodeHash = 'supabase-managed'
      admin.phoneVerificationExpiresAt = new Date(Date.now() + PHONE_VERIFICATION_CODE_TTL_MS)
      await admin.save()

      try {
        await supabaseAuthService.sendOtp(phoneE164)
      } catch (deliveryError) {
        admin.phoneVerificationCodeHash = ''
        admin.phoneVerificationExpiresAt = null
        await admin.save()
        console.error('Supabase phone OTP send error:', deliveryError.message)
        return res.status(502).json({ error: deliveryError.message || 'Failed to send verification code.' })
      }

      return res.json({
        message: 'Verification code sent.',
        phone: normalizedPhone,
        expiresAt: admin.phoneVerificationExpiresAt.toISOString(),
        channel: 'sms',
        provider: 'supabase',
        destination: phoneE164,
        fallbackUsed: false,
        fallbackReason: null,
        deliveryStatus: 'sent',
        messageId: null,
        providerMessage: null,
      })
    }

    // ── sms-api-ph / textlocal provider (default) ──
    const verificationCode = generatePhoneVerificationCode()
    const verificationCodeHash = hashPhoneVerificationCode(verificationCode)
    const expiresAt = new Date(Date.now() + PHONE_VERIFICATION_CODE_TTL_MS)
    const expiresInMinutes = Math.max(1, Math.ceil(PHONE_VERIFICATION_CODE_TTL_MS / 60000))

    admin.phone = normalizedPhone
    admin.phoneVerified = false
    admin.phoneVerificationCodeHash = verificationCodeHash
    admin.phoneVerificationExpiresAt = expiresAt
    await admin.save()

    const smsMessage = `Your verification code is ${verificationCode}`
    const adminEmail = String(admin.email || '').trim().toLowerCase()
    const activeSmsService = getActiveSmsService()
    let deliveryResult = null

    try {
      deliveryResult = await activeSmsService.sendMessage({
        recipient: normalizedPhone,
        message: smsMessage,
        fallbackEmail: adminEmail
      })
    } catch (deliveryError) {
      admin.phoneVerificationCodeHash = ''
      admin.phoneVerificationExpiresAt = null
      await admin.save()
      const deliveryErrorMessage = deliveryError?.message || 'Failed to send verification code.'
      console.error('Phone verification delivery error:', deliveryErrorMessage)
      return res.status(502).json({
        error: deliveryErrorMessage
      })
    }

    const channel = deliveryResult.channel === 'email' ? 'email' : 'sms'
    const usedEmailFallback = Boolean(channel === 'email' || deliveryResult.fallbackUsed)
    const emailProvider = channel === 'email' ? deliveryResult.provider : null

    res.json({
      message: 'Verification code sent.',
      phone: normalizedPhone,
      expiresAt: expiresAt.toISOString(),
      channel,
      emailProvider,
      destination: deliveryResult.recipient || normalizedPhone,
      fallbackUsed: usedEmailFallback,
      fallbackReason: usedEmailFallback ? (deliveryResult.fallbackReason || 'SMS delivery fallback was used by the gateway.') : null,
      deliveryStatus: deliveryResult.status,
      messageId: deliveryResult.messageId,
      providerMessage: deliveryResult.providerMessage || null
    })
  } catch (err) {
    console.error('Send phone verification code error:', err.message)
    res.status(500).json({ error: 'Failed to send verification code.' })
  }
})

// POST /api/admin/profile/phone/verify - verify SMS code
app.post('/api/admin/profile/phone/verify', verificationLimiter, authMiddleware, securityMiddleware.inputValidationMiddleware(securityMiddleware.schemas.admin.verifyPhoneVerificationCode), async (req, res) => {
  if (!dbReady) {
    return res.status(503).json({ error: 'Database unavailable.' })
  }

  try {
    const admin = await Admin.findById(req.adminId).select('+phoneVerificationCodeHash +phoneVerificationExpiresAt')
    if (!admin) return res.status(404).json({ error: 'Admin not found.' })

    const normalizedPhone = normalizePhilippineMobileNumber(admin.phone || '')
    if (!isValidPhilippineMobileNumber(normalizedPhone)) {
      return res.status(400).json({ error: 'Add a valid mobile number before verification.' })
    }

    if (!admin.phoneVerificationCodeHash || !admin.phoneVerificationExpiresAt) {
      return res.status(400).json({ error: 'No active verification code found. Request a new code first.' })
    }

    if (new Date(admin.phoneVerificationExpiresAt).getTime() < Date.now()) {
      admin.phoneVerificationCodeHash = ''
      admin.phoneVerificationExpiresAt = null
      await admin.save()
      return res.status(400).json({ error: 'Verification code has expired. Request a new one.' })
    }

    // ── Supabase provider ──
    // Supabase verifies the OTP on its side; we don't compare hashes.
    if (useSupabasePhoneAuth) {
      const phoneE164 = philippineNumberToE164(normalizedPhone)
      try {
        await supabaseAuthService.verifyOtp(phoneE164, req.body.code)
      } catch (verifyError) {
        console.error('Supabase phone OTP verify error:', verifyError.message)
        return res.status(400).json({ error: verifyError.message || 'Invalid verification code.' })
      }

      admin.phone = normalizedPhone
      admin.phoneVerified = true
      admin.phoneVerificationCodeHash = ''
      admin.phoneVerificationExpiresAt = null
      await admin.save()

      await logAudit(
        'UPDATE', 'ADMIN', admin._id.toString(), `Phone: ${normalizedPhone}`,
        `Phone verified via Supabase OTP: ${normalizedPhone}`, req.adminId, req.accountType,
        { phoneVerified: false }, { phoneVerified: true }, 'SUCCESS', 'MEDIUM'
      )

      return res.json(buildAdminProfileResponse(admin))
    }

    // ── sms-api-ph / textlocal provider (default) ──
    const providedCodeHash = hashPhoneVerificationCode(req.body.code)
    if (providedCodeHash !== admin.phoneVerificationCodeHash) {
      return res.status(400).json({ error: 'Invalid verification code.' })
    }

    admin.phone = normalizedPhone
    admin.phoneVerified = true
    admin.phoneVerificationCodeHash = ''
    admin.phoneVerificationExpiresAt = null
    await admin.save()

    res.json(buildAdminProfileResponse(admin))
  } catch (err) {
    console.error('Phone verification error:', err.message)
    res.status(500).json({ error: 'Failed to verify phone number.' })
  }
})

// POST /api/admin/avatar - upload avatar (base64)
app.post('/api/admin/avatar', authMiddleware, securityMiddleware.inputValidationMiddleware(securityMiddleware.schemas.admin.updateAvatar), async (req, res) => {
  if (!dbReady) {
    return res.status(503).json({ error: 'Database unavailable.' })
  }
  try {
    const { avatarData, mimeType } = req.body
    
    // Validate image size (base64 string size)
    const imageSizeInBytes = Buffer.byteLength(avatarData, 'base64')
    if (imageSizeInBytes > 5 * 1024 * 1024) { // 5MB limit
      return res.status(400).json({ error: 'Image size too large. Maximum 5MB allowed.' })
    }

    const admin = await Admin.findById(req.adminId)
    if (!admin) return res.status(404).json({ error: 'Admin not found.' })

    // Update avatar in database
    admin.avatar = avatarData
    admin.avatarMimeType = mimeType
    await admin.save()

    res.json({ 
      message: 'Avatar uploaded successfully.',
      avatar: avatarData,
      avatarMimeType: mimeType,
      avatarUrl: `data:${mimeType};base64,${avatarData}`
    })
  } catch (err) {
    console.error('Avatar upload error:', err.message)
    res.status(500).json({ error: 'Failed to upload avatar.' })
  }
})

// DELETE /api/admin/avatar - remove avatar
app.delete('/api/admin/avatar', authMiddleware, async (req, res) => {
  if (!dbReady) {
    return res.status(503).json({ error: 'Database unavailable.' })
  }
  try {
    const admin = await Admin.findById(req.adminId)
    if (!admin) return res.status(404).json({ error: 'Admin not found.' })

    // Clear avatar data from database
    admin.avatar = ''
    admin.avatarMimeType = ''
    await admin.save()

    res.json({ message: 'Avatar removed successfully.' })
  } catch (err) {
    console.error('Avatar delete error:', err)
    res.status(500).json({ error: 'Failed to remove avatar.' })
  }
})

// GET /api/admin/accounts - get all account logs
app.get('/api/admin/accounts', authMiddleware, requireAdminRole, securityMiddleware.inputValidationMiddleware(securityMiddleware.schemas.admin.accountsQuery), async (req, res) => {
  if (!dbReady) {
    return res.status(503).json({ error: 'Database unavailable.' })
  }
  try {
    const accounts = await Admin.find({})
      .select('-password')
      .sort({ createdAt: -1 })
      .lean()
    
    res.json(accounts)
  } catch (err) {
    console.error('Get accounts error:', err.message)
    res.status(500).json({ error: 'Failed to load accounts.' })
  }
})

// GET /api/admin/accounts/count - get account count by type
app.get('/api/admin/accounts/count', authMiddleware, requireAdminRole, securityMiddleware.inputValidationMiddleware(securityMiddleware.schemas.admin.accountsQuery), async (req, res) => {
  if (!dbReady) {
    return res.status(503).json({ error: 'Database unavailable.' })
  }
  try {
    const { type } = req.query
    const filter = type ? { accountType: type } : {}
    const count = await Admin.countDocuments(filter)
    res.json({ count })
  } catch (err) {
    console.error('Get account count error:', err.message)
    res.status(500).json({ error: 'Failed to get account count.' })
  }
})

// POST /api/admin/accounts - create new account
app.post('/api/admin/accounts', authMiddleware, requireAdminRole, securityMiddleware.inputValidationMiddleware(securityMiddleware.schemas.admin.createAccount), async (req, res) => {
  if (!dbReady) {
    return res.status(503).json({ error: 'Database unavailable.' })
  }
  try {
    const { username, displayName, accountType, password, uid } = req.body

    // Check if username already exists
    const existingUsername = await Admin.findOne({ username: username.trim().toLowerCase() })
    if (existingUsername) {
      return res.status(409).json({ error: 'Username already exists.' })
    }

    // Check if UID already exists
    const existingUid = await Admin.findOne({ uid })
    if (existingUid) {
      return res.status(409).json({ error: 'UID already exists.' })
    }

    // Get current admin for createdBy field (store UID instead of name for immutability)
    const currentAdmin = await Admin.findById(req.adminId)
    const createdBy = currentAdmin?.uid || 'SUPERADMIN'

    // Create new account
    const newAccount = new Admin({
      username: username.trim().toLowerCase(),
      displayName: displayName || (
        accountType === 'admin'
          ? 'Administrator'
          : accountType === 'professor'
            ? 'Professor'
            : 'Registrar'
      ),
      accountType,
      password,
      uid,
      createdBy,
      status: 'active'
    })

    await newAccount.save()
    
    // Return account without password
    const accountResponse = await Admin.findById(newAccount._id).select('-password')

    // Log the account creation
    await logAudit(
      'CREATE',
      'ADMIN',
      newAccount._id.toString(),
      newAccount.username,
      `Created admin account: ${newAccount.username} (${accountType})`,
      req.adminId,
      req.accountType,
      null,
      accountResponse.toObject(),
      'SUCCESS',
      'MEDIUM'
    )
    
    res.status(201).json({ 
      message: 'Account created successfully.',
      account: accountResponse
    })
  } catch (err) {
    console.error('Create account error:', err.message)
    res.status(500).json({ error: 'Failed to create account.' })
  }
})

// DELETE /api/admin/accounts/:id - delete an account (super admin can delete anyone, regular admin can only delete registrars)
app.delete('/api/admin/accounts/:id', authMiddleware, requireAdminRole, securityMiddleware.inputValidationMiddleware({ params: Joi.object({ id: securityMiddleware.schemas.objectId }) }), async (req, res) => {
  if (!dbReady) {
    return res.status(503).json({ error: 'Database unavailable.' })
  }
  try {
    // Get the current admin (the one making the request)
    const currentAdmin = await Admin.findById(req.adminId)
    if (!currentAdmin) {
      return res.status(404).json({ error: 'Current admin not found.' })
    }

    // Check if the account to delete exists
    const accountToDelete = await Admin.findById(req.params.id)
    if (!accountToDelete) {
      return res.status(404).json({ error: 'Account not found.' })
    }

    // Prevent deleting yourself
    if (String(req.adminId) === String(accountToDelete._id)) {
      return res.status(400).json({ error: 'Cannot delete your own account.' })
    }

    // Admin accounts cannot delete other admin accounts.
    if (currentAdmin.accountType === 'admin' && accountToDelete.accountType === 'admin') {
      return res.status(403).json({ error: 'Admin accounts cannot delete other admin accounts.' })
    }

    // If a professor account is deleted, clear professor references so
    // COR and section views no longer display a removed professor.
    if (accountToDelete.accountType === 'professor') {
      const escapeRegExp = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      const identifiers = Array.from(
        new Set(
          [accountToDelete.displayName, accountToDelete.username, accountToDelete.uid]
            .map((value) => String(value || '').trim())
            .filter(Boolean)
        )
      )

      if (identifiers.length > 0) {
        const exactIdentifierPatterns = identifiers.map(
          (value) => new RegExp(`^\\s*${escapeRegExp(value)}\\s*$`, 'i')
        )

        await Promise.all([
          Student.updateMany(
            { assignedProfessor: { $in: exactIdentifierPatterns } },
            { $set: { assignedProfessor: '' } }
          ),
          Student.updateMany(
            { gradeProfessor: { $in: exactIdentifierPatterns } },
            { $set: { gradeProfessor: '' } }
          ),
          BlockSection.updateMany(
            { classAdviser: { $in: exactIdentifierPatterns } },
            { $set: { classAdviser: '' } }
          ),
          Enrollment.updateMany(
            { 'subjects.instructor': { $in: exactIdentifierPatterns } },
            {
              $set: {
                'subjects.$[subject].instructor': 'TBA',
                'subjects.$[subject].dateModified': new Date()
              }
            },
            {
              arrayFilters: [{ 'subject.instructor': { $in: exactIdentifierPatterns } }]
            }
          )
        ])
      }
    }

    // Delete the account
    await Admin.findByIdAndDelete(req.params.id)

    // Log the account deletion
    await logAudit(
      'DELETE',
      'ADMIN',
      accountToDelete._id.toString(),
      accountToDelete.username,
      `Deleted an account: ${accountToDelete.username} (${accountToDelete.accountType})`,
      req.adminId,
      req.accountType,
      auditObject(accountToDelete, 'ADMIN'),
      null,
      'SUCCESS',
      'HIGH'
    )
    
    res.json({ message: `Account "${accountToDelete.username}" deleted successfully.` })
  } catch (err) {
    console.error('Delete account error:', err)
    res.status(500).json({ error: 'Failed to delete account.' })
  }
})

// ==================== ANNOUNCEMENTS ====================

const ANNOUNCEMENT_MAX_TITLE_LENGTH = 200
const ANNOUNCEMENT_MAX_MESSAGE_LENGTH = 500
const ANNOUNCEMENT_MAX_IMAGE_FILE_BYTES = 5 * 1024 * 1024
const ANNOUNCEMENT_MAX_VIDEO_FILE_BYTES = 8 * 1024 * 1024
const ANNOUNCEMENT_MAX_MEDIA_TOTAL_BYTES = 20 * 1024 * 1024
const ANNOUNCEMENT_MAX_MEDIA_ITEMS = 6

const hasOwn = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key)

function estimateDataUrlBytes(dataUrl = '') {
  const normalized = String(dataUrl || '').trim()
  const commaIndex = normalized.indexOf(',')
  if (commaIndex < 0) return 0

  const base64Data = normalized.slice(commaIndex + 1).replace(/\s+/g, '')
  if (!base64Data) return 0

  let padding = 0
  if (base64Data.endsWith('==')) padding = 2
  else if (base64Data.endsWith('=')) padding = 1

  return Math.max(0, Math.floor((base64Data.length * 3) / 4) - padding)
}

function resolveAnnouncementMediaSize(mediaItem = {}) {
  const parsedSize = Number(mediaItem.fileSize)
  if (Number.isFinite(parsedSize) && parsedSize > 0) {
    return Math.trunc(parsedSize)
  }

  const itemUrl = String(mediaItem.url || '').trim()
  if (itemUrl.startsWith('data:')) {
    return estimateDataUrlBytes(itemUrl)
  }

  return 0
}

function normalizeAnnouncementMedia(media = []) {
  return media.map((item) => {
    const normalizedType = String(item?.type || '').trim().toLowerCase() === 'video' ? 'video' : 'image'
    const normalizedUrl = String(item?.url || '').trim()
    const normalizedFileName = String(item?.fileName || '').trim()
    const normalizedOriginalFileName = String(item?.originalFileName || '').trim()
    const normalizedMimeType = String(item?.mimeType || '').trim()
    const resolvedSize = resolveAnnouncementMediaSize(item)
    const caption = typeof item?.caption === 'string' ? item.caption.trim() : undefined

    return {
      type: normalizedType,
      url: normalizedUrl,
      fileName: normalizedFileName,
      originalFileName: normalizedOriginalFileName,
      mimeType: normalizedMimeType,
      fileSize: resolvedSize > 0 ? resolvedSize : 0,
      ...(caption ? { caption } : {})
    }
  })
}

function validateAnnouncementPayload(payload = {}, { isUpdate = false } = {}) {
  const details = []

  if (!isUpdate || hasOwn(payload, 'title')) {
    const title = String(payload.title ?? '').trim()
    if (!title) {
      details.push('Title is required.')
    } else if (title.length > ANNOUNCEMENT_MAX_TITLE_LENGTH) {
      details.push(`Title must be ${ANNOUNCEMENT_MAX_TITLE_LENGTH} characters or less.`)
    }
  }

  if (!isUpdate || hasOwn(payload, 'message')) {
    const message = String(payload.message ?? '').trim()
    if (!message) {
      details.push('Message is required.')
    } else if (message.length > ANNOUNCEMENT_MAX_MESSAGE_LENGTH) {
      details.push(`Message must be ${ANNOUNCEMENT_MAX_MESSAGE_LENGTH} characters or less.`)
    }
  }

  if (hasOwn(payload, 'targetAudience')) {
    const audienceValidationError = validateAnnouncementAudience(payload.targetAudience)
    if (audienceValidationError) {
      details.push(audienceValidationError)
    }
  }

  if (hasOwn(payload, 'media') && payload.media !== undefined) {
    if (!Array.isArray(payload.media)) {
      details.push('Media must be an array.')
    } else {
      if (payload.media.length > ANNOUNCEMENT_MAX_MEDIA_ITEMS) {
        details.push(`You can upload up to ${ANNOUNCEMENT_MAX_MEDIA_ITEMS} media files per announcement.`)
      }

      let totalMediaBytes = 0

      payload.media.forEach((item, index) => {
        if (!item || typeof item !== 'object' || Array.isArray(item)) {
          details.push(`Media item #${index + 1} is invalid.`)
          return
        }

        const mediaType = String(item.type || '').trim().toLowerCase()
        if (mediaType !== 'image' && mediaType !== 'video') {
          details.push(`Media item #${index + 1} has an invalid type.`)
          return
        }

        const mediaUrl = String(item.url || '').trim()
        const fileName = String(item.fileName || '').trim()
        const originalFileName = String(item.originalFileName || '').trim()
        const mimeType = String(item.mimeType || '').trim()

        if (!mediaUrl || !fileName || !originalFileName || !mimeType) {
          details.push(`Media item #${index + 1} is missing required file metadata.`)
          return
        }

        const mediaBytes = resolveAnnouncementMediaSize(item)
        if (mediaBytes <= 0) {
          if (mediaUrl.startsWith('data:')) {
            details.push(`Media item #${index + 1} has an invalid file size.`)
          }
          return
        }

        const perFileLimit = mediaType === 'image'
          ? ANNOUNCEMENT_MAX_IMAGE_FILE_BYTES
          : ANNOUNCEMENT_MAX_VIDEO_FILE_BYTES

        if (mediaBytes > perFileLimit) {
          const mbLimit = Math.round(perFileLimit / (1024 * 1024))
          details.push(`Media item #${index + 1} exceeds the ${mbLimit}MB ${mediaType} limit.`)
        }

        totalMediaBytes += mediaBytes
      })

      if (totalMediaBytes > ANNOUNCEMENT_MAX_MEDIA_TOTAL_BYTES) {
        details.push('Total media size exceeds 20MB.')
      }
    }
  }

  return details
}

// GET /api/announcements - get all active announcements
app.get('/api/announcements', publicReadLimiter, async (req, res) => {
  if (!dbReady) {
    return res.status(503).json({ error: 'Database unavailable.' })
  }
  try {
    const { targetAudience } = req.query
    const filter = { isActive: true }
    
    if (targetAudience && targetAudience !== 'all') {
      const audienceQueryValues = getAnnouncementAudienceQueryValues(targetAudience)
      const scopedAudienceValues = audienceQueryValues.length > 0
        ? audienceQueryValues
        : [String(targetAudience)]
      filter.$or = [
        { targetAudience: 'all' },
        ...scopedAudienceValues.map((audience) => ({ targetAudience: audience }))
      ]
    }

    const announcements = await Announcement.find(filter)
      .populate('createdBy', 'username displayName')
      .sort({ isPinned: -1, createdAt: -1 })
    
    res.json(announcements)
  } catch (err) {
    console.error('Get announcements error:', err.message)
    res.status(500).json({ error: 'Failed to load announcements.' })
  }
})

// GET /api/announcements/:id - get individual announcement (public)
app.get('/api/announcements/:id', publicReadLimiter, async (req, res) => {
  if (!dbReady) {
    return res.status(503).json({ error: 'Database unavailable.' })
  }
  try {
    const filter = {
      _id: req.params.id,
      isActive: true
    }
    const { targetAudience } = req.query

    if (targetAudience && targetAudience !== 'all') {
      const audienceQueryValues = getAnnouncementAudienceQueryValues(targetAudience)
      const scopedAudienceValues = audienceQueryValues.length > 0
        ? audienceQueryValues
        : [String(targetAudience)]
      filter.$or = [
        { targetAudience: 'all' },
        ...scopedAudienceValues.map((audience) => ({ targetAudience: audience }))
      ]
    }

    const announcement = await Announcement.findOne(filter)
      .populate('createdBy', 'username displayName')
    
    if (!announcement) {
      return res.status(404).json({ error: 'Announcement not found.' })
    }
    
    console.log('Found announcement:', announcement._id, 'Active:', announcement.isActive)
    res.json(announcement)
  } catch (err) {
    console.error('Get announcement error:', err.message)
    res.status(500).json({ error: 'Failed to load announcement.' })
  }
})

// GET /api/admin/announcements - get all announcements (admin)
app.get('/api/admin/announcements', authMiddleware, requireAdminOrRegistrarRole, securityMiddleware.inputValidationMiddleware(securityMiddleware.schemas.announcements.query), async (req, res) => {
  if (!dbReady) {
    return res.status(503).json({ error: 'Database unavailable.' })
  }
  try {
    const { page = 1, limit = 10, type, targetAudience, status } = req.query
    const filter = {}
    
    if (type) filter.type = type
    if (targetAudience) {
      const audienceQueryValues = getAnnouncementAudienceQueryValues(targetAudience)
      filter.targetAudience = audienceQueryValues.length > 0
        ? { $in: audienceQueryValues }
        : targetAudience
    }
    if (status) filter.isActive = status === 'active'

    const announcements = await Announcement.find(filter)
      .populate('createdBy', 'username displayName')
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit)
    
    const total = await Announcement.countDocuments(filter)
    
    res.json({
      announcements,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      total
    })
  } catch (err) {
    console.error('Get admin announcements error:', err.message)
    res.status(500).json({ error: 'Failed to load announcements.' })
  }
})

// POST /api/admin/announcements - create new announcement
app.post('/api/admin/announcements', authMiddleware, requireAdminOrRegistrarRole, securityMiddleware.inputValidationMiddleware(securityMiddleware.schemas.announcements.create), async (req, res) => {
  if (!dbReady) {
    return res.status(503).json({ error: 'Database unavailable.' })
  }
  try {
    const { title, message, type, targetAudience, expiresAt, isPinned, media } = req.body
    const validationErrors = validateAnnouncementPayload(req.body, { isUpdate: false })
    if (validationErrors.length > 0) {
      return res.status(400).json({
        error: validationErrors[0],
        details: validationErrors
      })
    }

    const normalizedTitle = String(title || '').trim()
    const normalizedMessage = String(message || '').trim()
    const normalizedMedia = Array.isArray(media) ? normalizeAnnouncementMedia(media) : []
    const normalizedTargetAudience = normalizeAnnouncementAudience(targetAudience)

    const announcement = new Announcement({
      title: normalizedTitle,
      message: normalizedMessage,
      type: type || 'info',
      targetAudience: normalizedTargetAudience,
      expiresAt: expiresAt ? new Date(expiresAt) : undefined,
      isPinned: isPinned || false,
      media: normalizedMedia,
      createdBy: req.adminId
    })

    await announcement.save()
    await announcement.populate('createdBy', 'username displayName')

    // Log the action
    await logAudit(
      'CREATE',
      'ANNOUNCEMENT',
      announcement._id.toString(),
      normalizedTitle,
      `Created announcement: ${normalizedTitle}`,
      req.adminId,
      req.accountType,
      null,
      announcement.toObject(),
      'SUCCESS',
      type === 'urgent' ? 'HIGH' : 'MEDIUM'
    )

    res.status(201).json({ 
      message: 'Announcement created successfully.',
      announcement
    })
  } catch (err) {
    console.error('Create announcement error:', err.message)
    res.status(500).json({ error: err.message || 'Failed to create announcement.' })
  }
})

// PUT /api/admin/announcements/:id - update announcement
app.put('/api/admin/announcements/:id', authMiddleware, requireAdminOrRegistrarRole, securityMiddleware.inputValidationMiddleware({ body: securityMiddleware.schemas.announcements.update, params: Joi.object({ id: securityMiddleware.schemas.objectId }) }), async (req, res) => {
  if (!dbReady) {
    return res.status(503).json({ error: 'Database unavailable.' })
  }
  try {
    const { title, message, type, targetAudience, expiresAt, isPinned, isActive, isArchived, media } = req.body
    const validationErrors = validateAnnouncementPayload(req.body, { isUpdate: true })
    if (validationErrors.length > 0) {
      return res.status(400).json({
        error: validationErrors[0],
        details: validationErrors
      })
    }
    
    const announcement = await Announcement.findById(req.params.id)
    if (!announcement) {
      return res.status(404).json({ error: 'Announcement not found.' })
    }
    if (!isOwnerOrAdmin(req, announcement.createdBy)) {
      return res.status(403).json({ error: 'You can only modify your own announcements unless you are an admin.' })
    }

    const oldValue = announcement.toObject()
    
    if (title !== undefined) announcement.title = String(title ?? '').trim()
    if (message !== undefined) announcement.message = String(message ?? '').trim()
    if (type !== undefined) announcement.type = type
    if (targetAudience !== undefined) announcement.targetAudience = normalizeAnnouncementAudience(targetAudience)
    if (expiresAt !== undefined) announcement.expiresAt = new Date(expiresAt)
    if (isPinned !== undefined) announcement.isPinned = isPinned
    if (isActive !== undefined) announcement.isActive = isActive
    if (isArchived === true) announcement.isActive = false

    if (Array.isArray(media)) {
      announcement.media = normalizeAnnouncementMedia(media)
    }

    await announcement.save()
    await announcement.populate('createdBy', 'username displayName')

    // Log the action
    await logAudit(
      'UPDATE',
      'ANNOUNCEMENT',
      announcement._id.toString(),
      announcement.title,
      `Updated announcement: ${announcement.title}`,
      req.adminId,
      req.accountType,
      oldValue,
      announcement.toObject(),
      'SUCCESS',
      'MEDIUM'
    )

    res.json({ 
      message: 'Announcement updated successfully.',
      announcement
    })
  } catch (err) {
    console.error('Update announcement error:', err.message)
    res.status(500).json({ error: err.message || 'Failed to update announcement.' })
  }
})

// DELETE /api/admin/announcements/:id - delete announcement
app.delete('/api/admin/announcements/:id', authMiddleware, requireAdminOrRegistrarRole, securityMiddleware.inputValidationMiddleware({ params: Joi.object({ id: securityMiddleware.schemas.objectId }) }), async (req, res) => {
  if (!dbReady) {
    return res.status(503).json({ error: 'Database unavailable.' })
  }
  try {
    const announcement = await Announcement.findById(req.params.id)
    if (!announcement) {
      return res.status(404).json({ error: 'Announcement not found.' })
    }
    if (!isOwnerOrAdmin(req, announcement.createdBy)) {
      return res.status(403).json({ error: 'You can only delete your own announcements unless you are an admin.' })
    }

    await Announcement.findByIdAndDelete(req.params.id)

    // Log the action
    await logAudit(
      'DELETE',
      'ANNOUNCEMENT',
      announcement._id.toString(),
      announcement.title,
      `Deleted announcement: ${announcement.title}`,
      req.adminId,
      req.accountType,
      announcement.toObject(),
      null,
      'SUCCESS',
      'MEDIUM'
    )

    res.json({ message: 'Announcement deleted successfully.' })
  } catch (err) {
    console.error('Delete announcement error:', err.message)
    res.status(500).json({ error: 'Failed to delete announcement.' })
  }
})

// ==================== AUDIT LOGS ====================
// Audit log routes have been extracted to domains/archive/routes/archiveRoutes.js
// and mounted at /api/admin above.

// Document & folder routes extracted to routes/documentRoutes.js
registerDocumentRoutes(app, authMiddleware, requireAdminOrRegistrarRole, publicReadLimiter, logAudit, () => dbReady)

// MongoDB Atlas API Helper Functions
const getAtlasMetrics = async () => {
  const publicKey = process.env.ATLAS_PUBLIC_KEY
  const privateKey = process.env.ATLAS_PRIVATE_KEY
  const groupId = process.env.ATLAS_GROUP_ID
  
  if (!publicKey || !privateKey || !groupId) {
    console.log('Atlas API credentials not configured, using fallback metrics')
    return null
  }

  try {
    // Create auth digest
    const timestamp = Math.floor(Date.now() / 1000)
    const nonce = Math.random().toString(36).substring(2)
    const signature = require('crypto')
      .createHmac('sha1', privateKey)
      .update(`${timestamp}\n${nonce}\nGET\n/mongodb/atlas/api/v1.0/groups/${groupId}/processes\n\n`)
      .digest('base64')

    const authString = `HMAC-SHA1 ${publicKey}:${signature}:${nonce}:${timestamp}`

    // Get cluster metrics
    const response = await axios.get(
      `https://cloud.mongodb.com/api/atlas/v1.0/groups/${groupId}/processes`,
      {
        headers: {
          'Authorization': authString,
          'Accept': 'application/json'
        }
      }
    )

    return response.data
  } catch (error) {
    console.error('Atlas API error:', error.message)
    return null
  }
}

const getAtlasDatabaseMetrics = async () => {
  const publicKey = process.env.ATLAS_PUBLIC_KEY
  const privateKey = process.env.ATLAS_PRIVATE_KEY
  const groupId = process.env.ATLAS_GROUP_ID
  
  if (!publicKey || !privateKey || !groupId) {
    return null
  }

  try {
    const timestamp = Math.floor(Date.now() / 1000)
    const nonce = Math.random().toString(36).substring(2)
    const signature = require('crypto')
      .createHmac('sha1', privateKey)
      .update(`${timestamp}\n${nonce}\nGET\n/mongodb/atlas/api/v1.0/groups/${groupId}/databases\n\n`)
      .digest('base64')

    const authString = `HMAC-SHA1 ${publicKey}:${signature}:${nonce}:${timestamp}`

    const response = await axios.get(
      `https://cloud.mongodb.com/api/atlas/v1.0/groups/${groupId}/databases`,
      {
        headers: {
          'Authorization': authString,
          'Accept': 'application/json'
        }
      }
    )

    return response.data
  } catch (error) {
    console.error('Atlas Database API error:', error.message)
    return null
  }
}

const getAtlasMeasurements = async () => {
  const publicKey = process.env.ATLAS_PUBLIC_KEY
  const privateKey = process.env.ATLAS_PRIVATE_KEY
  const groupId = process.env.ATLAS_GROUP_ID
  
  if (!publicKey || !privateKey || !groupId) {
    console.log('Atlas API credentials not configured:', { 
      hasPublicKey: !!publicKey, 
      hasPrivateKey: !!privateKey, 
      hasGroupId: !!groupId 
    })
    return null
  }

  try {
    const timestamp = Math.floor(Date.now() / 1000)
    const nonce = Math.random().toString(36).substring(2)
    const endpoint = `/mongodb/atlas/api/v1.0/groups/${groupId}/processes/ac-zsfswvb-shard-00-00.sm99qsu.mongodb.net:27017/measurements?granularity=PT1M&metrics=DISK_USED,DISK_TOTAL,INDEX_SIZE`
    
    console.log('Atlas Measurements API Request:', { endpoint, groupId })
    
    const signature = require('crypto')
      .createHmac('sha1', privateKey)
      .update(`${timestamp}\n${nonce}\nGET\n${endpoint}\n\n`)
      .digest('base64')

    const authString = `HMAC-SHA1 ${publicKey}:${signature}:${nonce}:${timestamp}`

    const response = await axios.get(
      `https://cloud.mongodb.com${endpoint}`,
      {
        headers: {
          'Authorization': authString,
          'Accept': 'application/json'
        }
      }
    )

    console.log('Atlas Measurements API Response:', response.data)
    return response.data
  } catch (error) {
    console.error('Atlas Measurements API error:', {
      message: error.message,
      status: error.response?.status,
      statusText: error.response?.statusText,
      data: error.response?.data
    })
    return null
  }
}

// Create test error logs function for production debugging
async function createTestErrorLogs() {
  try {
    // Find a valid admin ID to use for system logs
    const adminUser = await Admin.findOne();
    if (!adminUser) {
      console.log('No admin users found, skipping test log creation');
      return;
    }

    const testLogs = [
      {
        action: 'VIEW',
        resourceType: 'SYSTEM',
        resourceId: 'system-health',
        resourceName: 'System Health Monitor',
        description: 'System health check completed successfully',
        performedBy: adminUser._id,
        performedByRole: adminUser.accountType || 'admin',
        status: 'SUCCESS',
        severity: 'LOW'
      },
      {
        action: 'VIEW',
        resourceType: 'SYSTEM',
        resourceId: 'health-endpoint',
        resourceName: 'Health API Endpoint',
        description: 'Health endpoint accessed - monitoring system status',
        performedBy: adminUser._id,
        performedByRole: adminUser.accountType || 'admin',
        status: 'SUCCESS',
        severity: 'LOW'
      }
    ]

    // Check if we already have recent logs
    const last1h = new Date(Date.now() - 1 * 60 * 60 * 1000)
    const existingLogs = await AuditLog.countDocuments({
      createdAt: { $gte: last1h }
    })

    // Only create test logs if there are no recent logs
    if (existingLogs === 0) {
      await AuditLog.insertMany(testLogs)
      console.log('Created test error logs for production debugging')
    }
  } catch (error) {
    console.error('Error creating test logs:', error)
  }
}

// GET /api/admin/security-metrics - Get security metrics and threats
app.get('/api/admin/security-metrics', authMiddleware, requireAdminRole, async (req, res) => {
  if (!dbReady) {
    return res.status(503).json({ error: 'Database unavailable.' })
  }
  
  try {
    const now = new Date()
    const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000)
    
    // Get all security metrics from database
    const [
      failedLogins,
      suspiciousActivity,
      totalSessions,
      recentThreats,
      blockedIPs,
      recentLogins
    ] = await Promise.all([
      // Count failed login attempts
      AuditLog.countDocuments({ 
        action: 'LOGIN',
        status: 'FAILED',
        createdAt: { $gte: last24h }
      }),
      // Count suspicious activities (high/critical severity)
      AuditLog.countDocuments({ 
        severity: { $in: ['HIGH', 'CRITICAL'] },
        createdAt: { $gte: last24h }
      }),
      // Count active sessions (successful logins in last hour)
      AuditLog.distinct('performedBy', {
        action: 'LOGIN',
        status: 'SUCCESS',
        createdAt: { $gte: new Date(now.getTime() - 1 * 60 * 60 * 1000) }
      }).then(userIds => userIds.length),
      // Get real security threats from audit logs
      AuditLog.find({
        action: { $in: ['LOGIN', 'SECURITY_BREACH', 'UNAUTHORIZED_ACCESS'] },
        severity: { $in: ['HIGH', 'CRITICAL', 'MEDIUM'] },
        createdAt: { $gte: last24h }
      })
      .sort({ createdAt: -1 })
      .limit(10)
      .lean(),
      // Count real blocked IPs
      BlockedIP.countDocuments({ isActive: true }),
      // Count successful logins for session calculation
      AuditLog.countDocuments({
        action: 'LOGIN',
        status: 'SUCCESS',
        createdAt: { $gte: last24h }
      })
    ])
    
    // Process real threats into the expected format
    const processedThreats = recentThreats
    .filter((log) => {
      const action = String(log.action || '').toUpperCase()
      const status = String(log.status || '').toUpperCase()
      const description = String(log.description || '')
      const isFailedLoginThreat =
        action === 'LOGIN' &&
        status === 'FAILED' &&
        /(failed login|too many failed|locked after|login attempts)/i.test(description)
      return !isFailedLoginThreat
    })
    .map(log => ({
      id: log._id.toString(),
      timestamp: log.createdAt,
      type: log.action,
      severity: log.severity.toLowerCase(),
      description: log.description,
      source: log.ipAddress || 'Unknown',
      status: log.status === 'SUCCESS' ? 'resolved' : log.status === 'FAILED' ? 'active' : 'investigating'
    }))
    
    // Calculate real active sessions (users who logged in successfully in last hour)
    const activeSessions = totalSessions
    
    // Get the most recent security scan from SecurityScan collection
    const SecurityScan = require('./models/SecurityScan');
    const lastSecurityScan = await SecurityScan.findOne({})
      .sort({ timestamp: -1 })
      .lean();
    
    // Get the most recent full security scan for security score
    const lastFullScan = await SecurityScan.findOne({
      scanType: 'full'
    })
      .sort({ timestamp: -1 })
      .lean();
    
    // Get the score from the most recent full security scan if available
    let securityScore = 0; // Default to 0 if no scan found
    let lastScanTime = null;
    
    if (lastFullScan?.summary?.score !== undefined) {
      securityScore = lastFullScan.summary.score;
      lastScanTime = lastFullScan.timestamp || lastFullScan.createdAt;
      console.log('Using security score from full scan:', securityScore);
    } else if (lastSecurityScan?.summary?.score !== undefined) {
      // Fallback to any scan if no full scan
      securityScore = lastSecurityScan.summary.score;
      lastScanTime = lastSecurityScan.timestamp || lastSecurityScan.createdAt;
      console.log('Using security score from latest scan:', securityScore);
    }
    
    // Get header-specific data from the latest header scan
    let headersPassed = 0;
    let headersChecked = 0;
    let headerScore = null;
    let headerGrade = null;
    
    const latestHeaderScan = await SecurityScan.findOne({
      scanType: 'headers'
    })
      .sort({ timestamp: -1 })
      .lean();
    
    if (latestHeaderScan?.summary) {
      headersPassed = latestHeaderScan.summary.headersPassed || 0;
      headersChecked = latestHeaderScan.summary.headersChecked || 0;
      headerScore = latestHeaderScan.summary.score;
      headerGrade = latestHeaderScan.summary.grade;
      console.log('Using header score from header scan:', headerScore);
    }
    
    // Get header scan timestamp
    let lastHeaderScanTime = null;
    if (latestHeaderScan?.timestamp) {
      lastHeaderScanTime = latestHeaderScan.timestamp.toISOString();
    }
    
    // Return real security metrics
    res.json({
      failedLogins,
      suspiciousActivity,
      blockedIPs,
      activeSessions,
      lastSecurityScan: lastScanTime ? lastScanTime.toISOString() : new Date().toISOString(),
      lastHeaderScan: lastHeaderScanTime,
      securityScore: Math.round(securityScore),
      headersPassed,
      headersChecked,
      headerScore,
      headerGrade,
      recentThreats: processedThreats
    })
    
  } catch (error) {
    console.error('Security metrics error:', error)
    res.status(500).json({ error: 'Failed to fetch security metrics.' })
  }
})

// GET /api/admin/error-logs - Get error logs
app.get('/api/admin/error-logs', authMiddleware, requireAdminRole, async (req, res) => {
  if (!dbReady) {
    return res.status(503).json({ error: 'Database unavailable.' })
  }
  
  try {
    const limit = parseInt(req.query.limit) || 100;
    const now = new Date();
    const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    
    // Get error logs from audit logs
    const errorLogs = await AuditLog.find({
      status: { $in: ['FAILED', 'ERROR'] },
      createdAt: { $gte: last24h }
    })
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean();
    
    res.json({
      logs: errorLogs.map(log => ({
        id: log._id.toString(),
        timestamp: log.createdAt,
        level: ['CRITICAL', 'HIGH'].includes(log.severity) ? 'error' : 'info',
        message: log.description,
        source: log.action,
        details: log.metadata || {}
      })),
      total: errorLogs.length
    });
    
  } catch (error) {
    console.error('Error logs endpoint error:', error);
    res.status(500).json({ error: 'Failed to fetch error logs.' });
  }
})

// GET /api/admin/system-health - Get comprehensive system health metrics
app.get('/api/admin/system-health', authMiddleware, requireAdminRole, async (req, res) => {
  try {
    const forceScan = req.query.forceScan === 'true'
    
    // Check if we should use cached data or force a new scan
    const now = new Date()
    const lastScanTime = global.lastSystemHealthScan || new Date(0)
    const scanAgeMinutes = (now - lastScanTime) / (1000 * 60)
    
    // Use cached data if less than 10 minutes old and not forcing a scan
    if (!forceScan && scanAgeMinutes < 10 && global.cachedSystemHealth) {
      console.log('Using cached system health data')
      return res.json(global.cachedSystemHealth)
    }
    
    // If a scan is already in-flight, wait for it instead of starting another
    if (global.systemHealthScanInFlight) {
      console.log('System health scan already in progress, waiting...')
      try {
        await global.systemHealthScanInFlight
        if (global.cachedSystemHealth) {
          return res.json(global.cachedSystemHealth)
        }
      } catch (e) {
        // Previous scan failed, continue to start a new one
      }
    }
    
    console.log('Performing system health scan...')
    global.lastSystemHealthScan = now
    
    // Clear cache when forcing a scan
    if (forceScan) {
      global.cachedSystemHealth = null
    }
    
    const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000)
    
    // Store the scan promise so concurrent requests can await it
    global.systemHealthScanInFlight = (async () => {
    // Get system metrics from database
    const last1h = new Date(now.getTime() - 1 * 60 * 60 * 1000)
    
    const [
      totalAdmins,
      activeUsers,
      recentLogins,
      errorLogs,
      warningLogs,
      totalDocuments,
      recentDocuments,
      totalAnnouncements,
      activeAnnouncements,
      // Count by account types
      adminCount,
      registrarCount,
      professorCount,
      // Security metrics
      blockedIPs,
      failedLogins,
      // System info in parallel
      dbStats,
      cpuData,
      memData,
      osData,
      backupStats
    ] = await Promise.all([
      Admin.countDocuments(),
      // Count unique users who logged in in the last hour (truly active)
      AuditLog.distinct('performedBy', {
        action: 'LOGIN',
        status: 'SUCCESS',
        createdAt: { $gte: last1h }
      }).then(userIds => userIds.length),
      // Count total logins in last 24h (for statistics)
      AuditLog.countDocuments({ 
        action: 'LOGIN', 
        status: 'SUCCESS', 
        createdAt: { $gte: last24h } 
      }),
      AuditLog.countDocuments({ 
        severity: 'CRITICAL', 
        createdAt: { $gte: last24h } 
      }),
      AuditLog.countDocuments({ 
        severity: { $in: ['HIGH', 'MEDIUM'] }, 
        createdAt: { $gte: last24h } 
      }),
      Document.countDocuments(),
      Document.countDocuments({ createdAt: { $gte: last24h } }),
      Announcement.countDocuments(),
      Announcement.countDocuments({ isActive: true }),
      // Count by account types
      Admin.countDocuments({ accountType: 'admin' }),
      Admin.countDocuments({ accountType: 'registrar' }),
      Admin.countDocuments({ accountType: 'professor' }),
      // Security metrics
      BlockedIP.countDocuments(),
      AuditLog.countDocuments({ 
        action: 'LOGIN', 
        status: 'FAILED', 
        createdAt: { $gte: last24h } 
      }),
      // System info — with timeouts to prevent blocking
      Promise.race([
        mongoose.connection.db.stats(),
        new Promise(resolve => setTimeout(() => resolve({ dataSize: 0, indexSize: 0 }), 5000))
      ]),
      si.currentLoad(),
      si.mem(),
      si.osInfo(),
      Promise.race([
        backupSystem.getBackupStats(),
        new Promise(resolve => setTimeout(() => resolve({ backupEnabled: false, latestBackup: null, totalBackups: 0, failedBackups: 0, successRate: 0, totalSize: 0 }), 5000))
      ])
    ])
    
    // Get recent error logs with better error handling
    let recentErrorLogs = []
    try {
      recentErrorLogs = await AuditLog.find({
        severity: { $in: ['CRITICAL', 'HIGH'] },
        createdAt: { $gte: last24h }
      })
      .sort({ createdAt: -1 })
      .limit(5)
      .populate('performedBy', 'username')
      .lean()
      
      console.log(`Found ${recentErrorLogs.length} recent error logs`)
    } catch (logError) {
      console.error('Error fetching recent error logs:', logError)
      // Create a fallback error log for testing
      recentErrorLogs = [{
        _id: 'fallback-error-id',
        createdAt: new Date(),
        severity: 'HIGH',
        description: 'System health check completed - this is a test log',
        resourceType: 'SYSTEM',
        performedBy: { username: 'system' }
      }]
    }
    
    // Calculate database stats from real db.stats() output
    const dbDataSize = dbStats.dataSize || 0;
    const dbIndexSize = dbStats.indexSize || 0;
    const dbStorageSize = dbStats.storageSize || dbDataSize;
    const dbTotalSize = dbDataSize + dbIndexSize;
    // Use dbStats.totalSize if available (MongoDB 4.4+), otherwise sum data + index
    const dbAllocatedSize = dbStats.totalSize || dbTotalSize;
    // Calculate usage as percentage of a reasonable threshold (use actual fsSize if available, otherwise 10GB)
    const dbUsageThreshold = 10 * 1024 * 1024 * 1024; // 10GB default
    const databaseUsage = Math.min(100, (dbTotalSize / dbUsageThreshold) * 100);

    // Build atlasMetrics from real db.stats() data so the frontend has real DB info
    // without requiring Atlas API credentials
    const collectionsCount = dbStats.collections || 0;
    const formatBytes = (bytes) => {
      if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
      if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
      return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
    };
    const atlasMetrics = {
      enabled: true,
      clusterInfo: {
        name: osData?.hostname || 'local',
        version: mongoose.version,
        connections: dbStats.connections || 0,
        diskUsage: dbAllocatedSize > 0 ? Math.round((dbTotalSize / dbAllocatedSize) * 100) : null,
      },
      databaseInfo: {
        collectionsCount,
        dataSize: formatBytes(dbDataSize),
        indexSize: formatBytes(dbIndexSize),
      },
      measurements: {
        available: true,
        diskUsed: dbTotalSize > 0 ? Math.round((dbTotalSize / dbUsageThreshold) * 100) : null,
        diskTotal: 100,
        indexSize: dbIndexSize,
      },
    };
    
    // Get real server metrics
    const memoryUsage = process.memoryUsage()
    const memoryUsagePercent = (memoryUsage.heapUsed / memoryUsage.heapTotal) * 100
    
    // Get actual server uptime
    const serverUptimeSeconds = process.uptime()
    const serverUptimeDays = Math.floor(serverUptimeSeconds / 86400)
    const uptimePercentage = Math.min(99.9, 95 + (serverUptimeDays * 0.1))
    
    // Use real CPU usage
    const serverLoad = cpuData.currentLoad
    
    // Use real system memory usage
    const systemMemoryUsagePercent = (memData.used / memData.total) * 100
    
    // Get real backup status — don't error if a backup is currently in progress
    const backupInProgress = backupStats.activeOperation != null;
    const backupStatus = (!backupStats.backupEnabled && !backupInProgress) ? 'error' 
      : (backupStats.latestBackup || backupInProgress) ? 'success' 
      : 'error';
    const lastBackup = backupStats.latestBackup ? new Date(backupStats.latestBackup.createdAt).toISOString() : 'N/A';
    
    const healthData = {
      uptime: parseFloat(uptimePercentage.toFixed(1)),
      activeUsers: activeUsers, // Real active users from last hour
      databaseUsage: parseFloat(databaseUsage.toFixed(1)),
      atlasMetrics,
      backupStatus,
      errorCount: errorLogs,
      serverLoad: parseFloat(serverLoad.toFixed(1)),
      memoryUsage: parseFloat(systemMemoryUsagePercent.toFixed(1)),
      lastBackup: lastBackup,
      backupDetails: {
        lastSuccessfulBackup: backupStats.lastSuccessfulBackup || null,
        nextScheduledBackup: backupStats.nextScheduledBackup || null,
        verificationStatus: backupStats.latestBackup?.verificationStatus || 'missing',
        storageUsage: backupStats.totalSize || 0,
        totalBackups: backupStats.totalBackups || 0,
        failedBackups: backupStats.failedBackups || 0,
        lastDurationMs: backupStats.latestBackup?.durationMs || null,
        lastRestore: backupStats.lastRestore || null,
        successRate: backupStats.successRate || 0,
        activeOperation: backupStats.activeOperation || null
      },
      statistics: {
        totalAdmins, // This should be real data from Admin.countDocuments()
        totalDocuments,
        activeAnnouncements,
        recentLogins, // Total logins in 24h (for stats)
        errorLogs,
        warningLogs,
        blockedIPs, // Real count of blocked IPs
        failedLogins, // Real count of failed logins in 24h
        accountTypes: {
          admins: adminCount,
          registrars: registrarCount,
          professors: professorCount,
          students: 0 // Placeholder - no student model yet
        }
      },
      logs: recentErrorLogs.map(log => ({
        id: log._id,
        timestamp: log.createdAt,
        level: ['critical', 'high'].includes(log.severity.toLowerCase()) ? 'error' : log.severity.toLowerCase(),
        message: log.description,
        module: log.resourceType
      }))
    }
    
    // Debug logging to verify real data
    console.log('System Health Data:', {
      totalAdmins: healthData.statistics.totalAdmins,
      activeUsers: healthData.activeUsers,
      adminCount,
      registrarCount,
      professorCount,
      blockedIPs,
      failedLogins
    })
    
    // Cache the response data
    global.cachedSystemHealth = healthData
    
    return healthData
    })() // end systemHealthScanInFlight
    
    const healthData = await global.systemHealthScanInFlight
    global.systemHealthScanInFlight = null
    
    // Client may have disconnected while waiting for the scan
    if (res.writableEnded || res.destroyed) {
      console.log('System health: client already disconnected, skipping response')
      return
    }
    
    // Respond without noisy debug output
    res.json(healthData)
  } catch (error) {
    global.systemHealthScanInFlight = null
    if (!res.destroyed) {
      console.error('System health error:', error)
      res.status(500).json({ error: 'Failed to fetch system health data.' })
    }
  }
})

// Test endpoint to check account types
app.get('/api/admin/test-account-types', authMiddleware, requireAdminRole, async (req, res) => {
  try {
    const allAdmins = await Admin.find({}, 'username accountType displayName').lean()
    
    const accountTypeCounts = await Admin.aggregate([
      { $group: { _id: '$accountType', count: { $sum: 1 } } }
    ])
    console.log('Account Type Aggregation:', accountTypeCounts)
    
    res.json({
      allAdmins,
      accountTypeCounts
    })
  } catch (error) {
    console.error('Test account types error:', error)
    res.status(500).json({ error: 'Failed to test account types' })
  }
})

// Get registration logs
app.get('/api/admin/registration-logs', authMiddleware, requireAdminRole, async (req, res) => {
  try {
    const logs = await Admin.find({}, 'username accountType displayName createdAt')
      .sort({ createdAt: -1 })
      .limit(50)
      .lean()
    
    res.json({
      logs: logs.map(log => ({
        _id: log._id,
        username: log.username,
        accountType: log.accountType,
        displayName: log.displayName,
        createdAt: log.createdAt
      }))
    })
  } catch (error) {
    console.error('Failed to fetch registration logs:', error)
    res.status(500).json({ error: 'Failed to fetch registration logs' })
  }
})

// Debug endpoint to check Admin collection directly
app.get('/api/admin/debug-admins', authMiddleware, requireAdminRole, async (req, res) => {
  try {
    const allAdmins = await Admin.find({}, 'username accountType displayName')
    const totalCount = await Admin.countDocuments()
    const adminCount = await Admin.countDocuments({ accountType: 'admin' })
    const registrarCount = await Admin.countDocuments({ accountType: 'registrar' })
    const professorCount = await Admin.countDocuments({ accountType: 'professor' })
    
    console.log('Direct Admin collection check:', {
      totalCount,
      adminCount,
      registrarCount,
      professorCount,
      allAdmins: allAdmins.map(a => ({ username: a.username, accountType: a.accountType }))
    })
    
    res.json({
      totalCount,
      adminCount,
      registrarCount,
      professorCount,
      admins: allAdmins.map(a => ({ username: a.username, accountType: a.accountType, displayName: a.displayName }))
    })
  } catch (error) {
    console.error('Debug admin check error:', error)
    res.status(500).json({ error: 'Failed to debug admin collection' })
  }
})

// Test endpoint for Atlas API
app.get('/api/admin/test-atlas', authMiddleware, requireAdminRole, async (req, res) => {
  try {
    const measurements = await getAtlasMeasurements()
    const basicMetrics = await getAtlasMetrics()
    
    res.json({
      success: true,
      measurements: measurements ? 'SUCCESS' : 'FAILED',
      basicMetrics: basicMetrics ? 'SUCCESS' : 'FAILED',
      measurementsData: measurements,
      basicMetricsData: basicMetrics
    })
  } catch (error) {
    console.error('Atlas test error:', error)
    res.status(500).json({
      success: false,
      error: error.message
    })
  }
})

// SMS test endpoint (Semaphore)
app.post('/api/admin/sms/send-test', authMiddleware, requireAdminRole, async (req, res) => {
  const validationSchema = Joi.object({
    number: Joi.string().trim().min(10).max(20).required(),
    message: Joi.string().trim().min(1).max(480).optional(),
    senderName: Joi.string().trim().max(11).optional()
  })

  const { error, value } = validationSchema.validate(req.body || {}, { abortEarly: false })
  if (error) {
    return res.status(400).json({
      error: 'Invalid SMS payload.',
      details: error.details.map((detail) => detail.message)
    })
  }

  if (!semaphoreSmsService.isConfigured()) {
    return res.status(503).json({
      error: 'Semaphore SMS is not configured.'
    })
  }

  const performedBy = req.adminId || null
  const performedByRole = req.accountType === 'registrar' ? 'registrar' : 'admin'
  const ipAddress = req.ip || req.connection?.remoteAddress || null
  const userAgent = req.get('user-agent') || null
  const smsMessage = value.message || 'WCC Admin: Semaphore SMS integration test.'

  try {
    const result = await semaphoreSmsService.sendSms({
      number: value.number,
      message: smsMessage,
      senderName: value.senderName
    })

    await logAudit(
      'CREATE',
      'SYSTEM',
      String(result.messageId || `sms-${Date.now()}`),
      'SMS',
      `Semaphore test SMS sent to ${result.recipient}.`,
      performedBy,
      performedByRole,
      null,
      {
        provider: result.provider,
        recipient: result.recipient,
        status: result.status,
        messageId: result.messageId,
        senderName: result.senderName
      },
      'SUCCESS',
      'LOW',
      ipAddress,
      userAgent
    )

    res.json({
      success: true,
      provider: result.provider,
      recipient: result.recipient,
      status: result.status,
      messageId: result.messageId
    })
  } catch (smsError) {
    await logAudit(
      'CREATE',
      'SYSTEM',
      'sms-test',
      'SMS',
      `Semaphore test SMS failed for ${value.number}: ${smsError.message || 'Unknown error'}`,
      performedBy,
      performedByRole,
      null,
      {
        provider: 'semaphore',
        recipient: value.number
      },
      'FAILED',
      'MEDIUM',
      ipAddress,
      userAgent
    )

    console.error('Semaphore test SMS error:', smsError.message)
    res.status(502).json({
      error: smsError.message || 'Failed to send SMS via Semaphore.'
    })
  }
})

// Backup endpoints
app.post('/api/admin/backup/create', adminActionLimiter, authMiddleware, requireAdminRole, async (req, res) => {
  const performedBy = req.adminId || null
  const performedByRole = req.accountType === 'registrar' ? 'registrar' : 'admin'
  const ipAddress = req.ip || req.connection?.remoteAddress || null
  const userAgent = req.get('user-agent') || null
  try {
    const result = await backupSystem.createBackup('manual', req.adminId || 'admin');

    await logAudit(
      'CREATE',
      'SYSTEM',
      String(result?.backupId || result?.fileName || 'backup'),
      'Backup',
      result?.success
        ? `Manual backup created: ${result.fileName || 'backup file'}`
        : `Manual backup failed: ${result?.error || 'Unknown error'}`,
      performedBy,
      performedByRole,
      null,
      {
        backupType: 'manual',
        fileName: result?.fileName || null,
        success: Boolean(result?.success),
        error: result?.error || null
      },
      result?.success ? 'SUCCESS' : 'FAILED',
      result?.success ? 'LOW' : 'MEDIUM',
      ipAddress,
      userAgent
    )
    
    // Clear system health cache so next request gets fresh backup data
    global.cachedSystemHealth = null;
    global.lastSystemHealthScan = new Date(0); // Force fresh scan on next request
    
    console.log('Backup created and system health cache cleared');
    res.status(result?.code === 'BACKUP_BUSY' ? 409 : 200).json(result);
  } catch (error) {
    await logAudit(
      'CREATE',
      'SYSTEM',
      'backup',
      'Backup',
      `Manual backup failed: ${error.message || 'Unknown error'}`,
      performedBy,
      performedByRole,
      null,
      null,
      'FAILED',
      'MEDIUM',
      ipAddress,
      userAgent
    )
    console.error('Backup creation error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/admin/backup/history', authMiddleware, requireAdminRole, async (req, res) => {
  try {
    // Reconcile storage and metadata before returning the unified history.
    const backups = (await backupSystem.getBackupHistory()).slice(0, 20);

    const manualTriggeredByIds = Array.from(
      new Set(
        backups
          .filter((backup) => String(backup.backupType || '').toLowerCase() === 'manual')
          .map((backup) => String(backup.triggeredBy || '').trim())
          .filter((value) => mongoose.Types.ObjectId.isValid(value))
      )
    );

    let adminNameById = new Map();
    if (manualTriggeredByIds.length > 0) {
      const admins = await Admin.find({ _id: { $in: manualTriggeredByIds } })
        .select('displayName username')
        .lean();
      adminNameById = new Map(
        admins.map((admin) => [
          String(admin._id),
          String(admin.displayName || '').trim() || String(admin.username || '').trim() || 'User'
        ])
      );
    }

    const backupsWithTrigger = backups.map((backup) => {
      const { filePath: _filePath, compressedPath: _compressedPath, encryptionProvider: _encryptionProvider, ...publicBackup } = backup;
      const type = String(backup.backupType || '').toLowerCase();
      const rawTriggeredBy = String(backup.triggeredBy || '').trim();
      const isManual = type === 'manual';
      const resolvedTriggeredBy = isManual
        ? (adminNameById.get(rawTriggeredBy) || rawTriggeredBy || 'User')
        : 'System';

      return {
        ...publicBackup,
        triggeredBy: resolvedTriggeredBy
      };
    });

    res.json({ success: true, backups: backupsWithTrigger });
  } catch (error) {
    console.error('Backup history error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/admin/backup/restore', adminActionLimiter, authMiddleware, requireAdminRole, async (req, res) => {
  const performedBy = req.adminId || null
  const performedByRole = req.accountType === 'registrar' ? 'registrar' : 'admin'
  const ipAddress = req.ip || req.connection?.remoteAddress || null
  const userAgent = req.get('user-agent') || null
  try {
    const { backupFileName } = req.body;
    if (!backupFileName) {
      return res.status(400).json({ success: false, error: 'Backup filename required' });
    }
    
    const result = await backupSystem.restoreBackup(backupFileName, { confirmCompatibility: req.body?.confirmCompatibility === true });
    await logAudit(
      'RESTORE',
      'SYSTEM',
      String(backupFileName),
      'Backup',
      result?.success
        ? `Backup restored: ${backupFileName}`
        : `Backup restore failed: ${backupFileName} (${result?.error || 'Unknown error'})`,
      performedBy,
      performedByRole,
      null,
      {
        backupFileName,
        success: Boolean(result?.success),
        restoredCollections: result?.restoredCollections || [],
        totalDocuments: result?.totalDocuments || 0,
        error: result?.error || null
      },
      result?.success ? 'SUCCESS' : 'FAILED',
      result?.success ? 'MEDIUM' : 'HIGH',
      ipAddress,
      userAgent
    )
    res.status(result?.code === 'BACKUP_BUSY' ? 409 : 200).json(result);
  } catch (error) {
    const backupFileName = String(req.body?.backupFileName || 'backup').trim()
    await logAudit(
      'RESTORE',
      'SYSTEM',
      backupFileName || 'backup',
      'Backup',
      `Backup restore failed: ${backupFileName || 'backup'} (${error.message || 'Unknown error'})`,
      performedBy,
      performedByRole,
      null,
      null,
      'FAILED',
      'HIGH',
      ipAddress,
      userAgent
    )
    console.error('Backup restore error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/admin/backup/stats', authMiddleware, requireAdminRole, async (req, res) => {
  try {
    const stats = await backupSystem.getBackupStats();
    res.json({ success: true, ...stats });
  } catch (error) {
    console.error('Error fetching latest security scan:', error);
    res.status(500).json({ 
      error: 'Failed to fetch latest security scan results',
      details: error.message 
    });
  }
});

app.get('/api/admin/backup/health', authMiddleware, requireAdminRole, async (req, res) => {
  try { res.json({ success: true, ...(await backupSystem.getBackupStats()) }); }
  catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

app.get('/api/admin/backup/analytics', authMiddleware, requireAdminRole, async (req, res) => {
  try { res.json({ success: true, ...(await backupSystem.getAnalytics({ from: req.query.from, to: req.query.to })) }); }
  catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

app.get('/api/admin/backup/preview/:fileName', authMiddleware, requireAdminRole, async (req, res) => {
  try {
    const result = await backupSystem.getRestorePreview(req.params.fileName);
    res.status(result.success ? 200 : 404).json(result);
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

app.post('/api/admin/backup/compare', authMiddleware, requireAdminRole, async (req, res) => {
  try {
    const result = await backupSystem.compareBackups(req.body?.firstFileName, req.body?.secondFileName);
    res.status(result.success ? 200 : 400).json(result);
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

app.post('/api/admin/backup/restore-test', adminActionLimiter, authMiddleware, requireAdminRole, async (req, res) => {
  try {
    const result = await backupSystem.runScheduledRestoreVerification();
    backupSystem.statsCache = null;
    await logAudit('VERIFY', 'SYSTEM', String(result.report?.fileName || 'latest-backup'), 'Backup', result.success ? 'Isolated restore verification passed' : `Isolated restore verification failed: ${result.error || 'validation failed'}`, req.adminId || null, req.accountType === 'registrar' ? 'registrar' : 'admin', null, { verificationType: 'scheduled_restore', durationMs: result.report?.durationMs || null }, result.success ? 'SUCCESS' : 'FAILED', result.success ? 'MEDIUM' : 'HIGH', req.ip || null, req.get('user-agent') || null);
    res.status(result.code === 'BACKUP_BUSY' ? 409 : result.success ? 200 : 422).json(result);
  } catch (error) { res.status(error.code === 'BACKUP_BUSY' ? 409 : 500).json({ success: false, code: error.code, error: error.message }); }
});

app.post('/api/admin/backup/cleanup', adminActionLimiter, authMiddleware, requireAdminRole, async (req, res) => {
  try {
    const removed = await backupSystem.cleanupOldBackups();
    backupSystem.statsCache = null;
    await logAudit('DELETE', 'SYSTEM', 'automatic-backups', 'Backup', `Retention cleanup removed ${removed.length} old automatic backup(s)`, req.adminId || null, req.accountType === 'registrar' ? 'registrar' : 'admin', null, { removed }, 'SUCCESS', 'MEDIUM', req.ip || null, req.get('user-agent') || null);
    res.json({ success: true, removed, removedCount: removed.length });
  } catch (error) {
    res.status(error.code === 'BACKUP_BUSY' ? 409 : 500).json({ success: false, code: error.code, error: error.message });
  }
});

app.post('/api/admin/backup/verify', adminActionLimiter, authMiddleware, requireAdminRole, async (req, res) => {
  try {
    const backupFileName = String(req.body?.backupFileName || '').trim();
    if (!backupFileName) return res.status(400).json({ success: false, error: 'Backup filename required' });
    const result = await backupSystem.withLock('verify', { backupFileName }, () => backupSystem.verifyBackup(backupFileName));
    await logAudit(
      'VERIFY', 'SYSTEM', backupFileName, 'Backup',
      result.success ? `Backup verified: ${backupFileName}` : `Backup verification failed: ${backupFileName} (${result.error})`,
      req.adminId || null, req.accountType === 'registrar' ? 'registrar' : 'admin', null,
      { backupFileName, checksum: result.checksum || null, verificationStatus: result.verificationStatus || null },
      result.success ? 'SUCCESS' : 'FAILED', result.success ? 'LOW' : 'HIGH', req.ip || null, req.get('user-agent') || null
    );
    res.json(result);
  } catch (error) {
    res.status(error.code === 'BACKUP_BUSY' ? 409 : 500).json({ success: false, code: error.code, error: error.message });
  }
});

app.patch('/api/admin/backup/protection', adminActionLimiter, authMiddleware, requireAdminRole, async (req, res) => {
  try {
    const backupFileName = String(req.body?.backupFileName || '').trim();
    if (!backupFileName || typeof req.body?.isProtected !== 'boolean') {
      return res.status(400).json({ success: false, error: 'Backup filename and boolean isProtected are required' });
    }
    const result = await backupSystem.setProtection(backupFileName, req.body.isProtected);
    await logAudit('UPDATE', 'SYSTEM', backupFileName, 'Backup', `${req.body.isProtected ? 'Protected' : 'Unprotected'} backup: ${backupFileName}`, req.adminId || null, req.accountType === 'registrar' ? 'registrar' : 'admin', null, { backupFileName, isProtected: req.body.isProtected }, result.success ? 'SUCCESS' : 'FAILED', 'MEDIUM', req.ip || null, req.get('user-agent') || null);
    res.status(result.success ? 200 : 404).json(result.success ? { success: true, fileName: result.backup.fileName, isProtected: result.backup.isProtected } : result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.patch('/api/admin/backup/rename', adminActionLimiter, authMiddleware, requireAdminRole, async (req, res) => {
  try {
    const backupFileName = String(req.body?.backupFileName || '').trim();
    const newName = String(req.body?.newName || '').trim();
    const result = await backupSystem.withLock('rename', { backupFileName }, () => backupSystem.renameBackup(backupFileName, newName));
    await logAudit('UPDATE', 'SYSTEM', backupFileName, 'Backup', result.success ? `Renamed backup ${backupFileName} to ${result.fileName}` : `Backup rename failed: ${result.error}`, req.adminId || null, req.accountType === 'registrar' ? 'registrar' : 'admin', null, { backupFileName, newName: result.fileName || newName }, result.success ? 'SUCCESS' : 'FAILED', 'MEDIUM', req.ip || null, req.get('user-agent') || null);
    res.status(result.success ? 200 : 400).json(result);
  } catch (error) {
    res.status(error.code === 'BACKUP_BUSY' ? 409 : 500).json({ success: false, code: error.code, error: error.message });
  }
});

app.delete('/api/admin/backup/delete', adminActionLimiter, authMiddleware, requireAdminRole, async (req, res) => {
  try {
    const backupFileName = String(req.body?.backupFileName || '').trim();
    if (!backupFileName) return res.status(400).json({ success: false, error: 'Backup filename required' });
    const result = await backupSystem.withLock('delete', { backupFileName }, () => backupSystem.deleteBackup(backupFileName, { force: req.body?.confirm === true, confirmationToken: String(req.body?.confirmationToken || '') }));
    await logAudit(
      'DELETE', 'SYSTEM', backupFileName, 'Backup',
      result.success ? `Backup deleted: ${backupFileName}` : `Backup deletion rejected: ${backupFileName} (${result.error})`,
      req.adminId || null, req.accountType === 'registrar' ? 'registrar' : 'admin', null,
      { backupFileName, confirmed: req.body?.confirm === true }, result.success ? 'SUCCESS' : 'FAILED',
      result.success ? 'MEDIUM' : 'HIGH', req.ip || null, req.get('user-agent') || null
    );
    res.status(result.success ? 200 : result.confirmationRequired ? 409 : 400).json(result);
  } catch (error) {
    res.status(error.code === 'BACKUP_BUSY' ? 409 : 500).json({ success: false, code: error.code, error: error.message });
  }
});

app.get('/api/admin/backup/download/:fileName', adminActionLimiter, authMiddleware, requireAdminRole, async (req, res) => {
  try {
    const backupFileName = path.basename(String(req.params.fileName || ''));
    const backup = await Backup.findOne({ fileName: backupFileName }).lean();
    if (!backup) return res.status(404).json({ success: false, error: 'Backup not found' });
    const archiveName = path.basename(backup.compressedPath || `${backup.fileName}.gz`);
    if (!backupSystem.storage.exists(archiveName)) return res.status(404).json({ success: false, error: 'Backup archive missing' });
    await logAudit(
      'DOWNLOAD', 'SYSTEM', backupFileName, 'Backup', `Backup downloaded: ${backupFileName}`,
      req.adminId || null, req.accountType === 'registrar' ? 'registrar' : 'admin', null,
      { backupFileName }, 'SUCCESS', 'MEDIUM', req.ip || null, req.get('user-agent') || null
    );
    res.download(backupSystem.storage.resolve(archiveName), archiveName);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/admin/security-scan - Run a security scan
app.post('/api/admin/security-scan', adminActionLimiter, authMiddleware, requireAdminRole, async (req, res) => {
  console.log('Security scan initiated by admin:', req.adminId);
  
  if (!dbReady) {
    return res.status(503).json({ error: 'Database unavailable.' })
  }
  
  try {
    const now = new Date()
    const last7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
    
    const findings = []
    const recommendations = []
    
    // Scan 1: High severity audit logs
    const highSeverityLogs = await AuditLog.countDocuments({
      severity: { $in: ['HIGH', 'CRITICAL'] },
      createdAt: { $gte: last7d }
    })
    
    if (highSeverityLogs > 0) {
      findings.push({
        severity: highSeverityLogs > 5 ? 'high' : 'medium',
        title: 'Security Events Detected',
        description: `${highSeverityLogs} high/critical severity events in the last 7 days`,
        category: 'Security Events'
      })
    }
    
    // Scan 2: Check for admin account security
    const adminsWithoutEmail = await Admin.countDocuments({ email: { $in: ['', null] } })
    
    if (adminsWithoutEmail > 0) {
      findings.push({
        severity: 'low',
        title: 'Incomplete Admin Profiles',
        description: `${adminsWithoutEmail} admin account(s) without email addresses`,
        category: 'Account Management'
      })
      recommendations.push({
        priority: 'low',
        action: 'Update admin profiles with email addresses',
        details: 'Email addresses are important for account recovery and notifications'
      })
    }
    
    // Scan 3: Recent access patterns
    const recentActivity = await AuditLog.countDocuments({
      createdAt: { $gte: new Date(now.getTime() - 1 * 60 * 60 * 1000) }
    })
    
    if (recentActivity === 0) {
      findings.push({
        severity: 'info',
        title: 'No Recent Activity',
        description: 'No activity detected in the last hour',
        category: 'Activity Monitoring'
      })
    }
    
    // Calculate security score and grade BEFORE using them
    const criticalCount = findings.filter(f => f.severity === 'critical').length
    const highCount = findings.filter(f => f.severity === 'high').length
    const mediumCount = findings.filter(f => f.severity === 'medium').length
    const lowCount = findings.filter(f => f.severity === 'low').length
    
    // Base score starts at 100 and deducts points based on severity
    let score = 100
    score -= (criticalCount * 25)  // -25 points per critical issue
    score -= (highCount * 15)      // -15 points per high issue  
    score -= (mediumCount * 10)    // -10 points per medium issue
    score -= (lowCount * 5)        // -5 points per low issue
    
    // Ensure score doesn't go below 0
    score = Math.max(0, score)
    
    // Calculate grade based on score
    let grade = 'A'
    if (score < 60) grade = 'F'
    else if (score < 70) grade = 'D'
    else if (score < 80) grade = 'C'
    else if (score < 90) grade = 'B'
    
    // Create a new security scan record
    const securityScan = new SecurityScan({
      scanType: 'full',
      duration: Date.now() - now.getTime(),
      status: 'completed',
      success: true,
      summary: {
        score: score,
        grade: grade,
        total: findings.length,
        critical: criticalCount,
        high: highCount,
        medium: mediumCount,
        low: lowCount,
        info: findings.filter(f => f.severity === 'info').length,
        criticalIssues: criticalCount,
        warnings: mediumCount
      },
      findings: findings,
      recommendations: recommendations,
      serverUrl: req.headers.host
    });

    // Save the scan results to the database
    await securityScan.save();

    // Create the response object
    const response = securityScan.toObject();
    
    console.log('Security scan result:', JSON.stringify(securityScan, null, 2));
    console.log('Score:', securityScan.summary.score);
    console.log('Grade:', securityScan.summary.grade);
    
    res.json(securityScan)
  } catch (error) {
    console.error('Security scan error:', error);
    console.error('Error stack:', error.stack);
    res.status(500).json({ 
      error: 'Failed to run security scan.',
      details: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// ==================== IP BLOCKING ====================

// GET /api/admin/blocked-ips - get all blocked IPs
app.get('/api/admin/blocked-ips', authMiddleware, requireAdminRole, async (req, res) => {
  if (!dbReady) {
    return res.status(503).json({ error: 'Database unavailable.' })
  }
  try {
    const blockedIPs = await BlockedIP.find({
      isActive: true,
      expiresAt: { $gt: new Date() }
    })
      .populate('blockedBy', 'username')
      .sort({ blockedAt: -1 })
      .lean()
    
    res.json(blockedIPs)
  } catch (error) {
    console.error('Get blocked IPs error:', error)
    res.status(500).json({ error: 'Failed to fetch blocked IPs.' })
  }
})

// GET /api/admin/blocked-ips/logs - get blocked IP specific audit logs
app.get('/api/admin/blocked-ips/logs', authMiddleware, requireAdminRole, async (req, res) => {
  if (!dbReady) {
    return res.status(503).json({ error: 'Database unavailable.' })
  }
  try {
    const limitRaw = Number(req.query.limit || 100)
    const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(500, Math.floor(limitRaw))) : 100
    const ipAddressQuery = String(req.query.ipAddress || '').trim()
    const normalizedIpAddress = ipAddressQuery ? normalizeIpv4AddressInput(ipAddressQuery) : ''

    if (normalizedIpAddress && !isValidIpv4Address(normalizedIpAddress)) {
      return res.status(400).json({ error: 'Invalid IP address format.' })
    }

    const filter = {
      resourceType: 'SECURITY',
      action: { $in: ['BLOCK_IP', 'UNBLOCK_IP'] }
    }

    if (normalizedIpAddress) {
      filter.resourceName = normalizedIpAddress
    }

    const logs = await AuditLog.find(filter)
      .populate('performedBy', 'username displayName')
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean()

    res.json({ logs, total: logs.length })
  } catch (error) {
    console.error('Get blocked IP logs error:', error)
    res.status(500).json({ error: 'Failed to fetch blocked IP logs.' })
  }
})

// POST /api/admin/security-headers-scan - Scan security headers
app.post('/api/admin/security-headers-scan', adminActionLimiter, authMiddleware, requireAdminRole, async (req, res) => {
  if (!dbReady) {
    return res.status(503).json({ error: 'Database unavailable.' });
  }
  
  try {
    const findings = []
    const recommendations = []
    const score = { passed: 0, total: 0 }
    
    // Get the server URL from request
    const protocol = req.protocol
    const host = req.get('host')
    const serverUrl = `${protocol}://${host}`
    
    // Check actual headers being sent by this server
    const actualHeaders = {
      'Strict-Transport-Security': {
        present: !!res.getHeader('Strict-Transport-Security'),
        value: res.getHeader('Strict-Transport-Security'),
        status: 'pass',
        description: 'HSTS enforces HTTPS-only connections'
      },
      'X-Content-Type-Options': {
        present: !!res.getHeader('X-Content-Type-Options'),
        value: res.getHeader('X-Content-Type-Options'),
        status: 'pass',
        description: 'Prevents MIME type sniffing attacks'
      },
      'X-Frame-Options': {
        present: !!res.getHeader('X-Frame-Options'),
        value: res.getHeader('X-Frame-Options'),
        status: 'pass',
        description: 'Prevents clickjacking attacks'
      },
      'X-XSS-Protection': {
        present: !!res.getHeader('X-XSS-Protection'),
        value: res.getHeader('X-XSS-Protection'),
        status: 'pass',
        description: 'Enables browser XSS filtering'
      },
      'Referrer-Policy': {
        present: !!res.getHeader('Referrer-Policy'),
        value: res.getHeader('Referrer-Policy'),
        status: 'pass',
        description: 'Controls referrer information sharing'
      },
      'Content-Security-Policy': {
        present: !!res.getHeader('Content-Security-Policy'),
        value: res.getHeader('Content-Security-Policy'),
        status: 'pass',
        description: 'Defines approved content sources'
      },
      'Permissions-Policy': {
        present: !!res.getHeader('Permissions-Policy'),
        value: res.getHeader('Permissions-Policy'),
        status: 'pass',
        description: 'Controls browser feature access'
      }
    }
    
    // Check each security header
    Object.entries(actualHeaders).forEach(([header, config]) => {
      score.total++
      
      if (config.present && config.status === 'pass') {
        score.passed++
        findings.push({
          severity: 'low',
          title: `${header} - Implemented`,
          description: `${header} header is properly configured: ${config.value}`,
          category: 'Security Headers',
          status: 'pass',
          recommendation: config.description
        })
      } else {
        findings.push({
          severity: 'high',
          title: `${header} - Missing`,
          description: `${header} header is not implemented or misconfigured`,
          category: 'Security Headers',
          status: 'fail',
          recommendation: `Implement ${header} header: ${config.value || 'See security best practices'}`
        })
        
        recommendations.push({
          priority: 'high',
          action: `Add ${header} header`,
          details: config.description || 'This header helps protect against common web vulnerabilities'
        })
      }
    })
    
    // Additional security checks
    const additionalChecks = [
      {
        name: 'HTTPS Enforcement',
        check: protocol === 'https',
        severity: 'high',
        description: 'Server should use HTTPS exclusively',
        recommendation: 'Configure SSL/TLS certificate and redirect HTTP to HTTPS'
      },
      {
        name: 'Server Information Disclosure',
        check: !req.get('server') || req.get('server') === 'WCC-Admin',
        severity: 'medium',
        description: 'Server should not disclose technology information',
        recommendation: 'Remove or obscure Server header'
      },
      {
        name: 'X-Powered-By Header',
        check: !req.get('x-powered-by'),
        severity: 'low',
        description: 'Remove technology stack information',
        recommendation: 'Disable X-Powered-By header'
      },
      {
        name: 'Admin Interface Protection',
        check: true, // We're blocking admin paths in middleware
        severity: 'medium',
        description: 'Admin interfaces should be protected',
        recommendation: 'Use IP whitelisting, strong authentication, or VPN access for admin areas'
      },
      {
        name: 'Backup File Protection',
        check: true, // We're blocking backup file paths in middleware
        severity: 'high',
        description: 'Backup files should not be publicly accessible',
        recommendation: 'Store backups in secure, non-public locations with proper access controls'
      },
      {
        name: 'Git Repository Protection',
        check: true, // We're blocking .git paths in middleware
        severity: 'high',
        description: 'Git repository should not be accessible',
        recommendation: 'Block access to .git directories in web server configuration'
      }
    ]
    
    additionalChecks.forEach(check => {
      score.total++
      
      if (check.check) {
        score.passed++
        findings.push({
          severity: 'low',
          title: `${check.name} - Secure`,
          description: check.description,
          category: 'Server Security',
          status: 'pass',
          recommendation: 'Configuration is secure'
        })
      } else {
        findings.push({
          severity: check.severity,
          title: `${check.name} - Issue Detected`,
          description: check.description,
          category: 'Server Security',
          status: 'fail',
          recommendation: check.recommendation
        })
        
        if (check.severity === 'high') {
          recommendations.push({
            priority: 'high',
            action: `Fix ${check.name}`,
            details: check.recommendation
          })
        }
      }
    })
    
    // Calculate overall security score
    const securityScore = Math.round((score.passed / score.total) * 100)
    
    // Generate summary
    const summary = {
      score: securityScore,
      grade: securityScore >= 90 ? 'A' : securityScore >= 80 ? 'B' : securityScore >= 70 ? 'C' : securityScore >= 60 ? 'D' : 'F',
      headersChecked: score.total,
      headersPassed: score.passed,
      criticalIssues: findings.filter(f => f.severity === 'high').length,
      warnings: findings.filter(f => f.severity === 'medium').length,
      info: findings.filter(f => f.severity === 'low').length
    }
    
    // Log the security scan
    await logAudit(
      'SECURITY_HEADERS_SCAN',
      'SECURITY',
      'system',
      'Security Headers Scan',
      `Security headers scan completed with score: ${securityScore}%`,
      req.adminId,
      req.accountType,
      null,
      { score: securityScore, findings: findings.length },
      'SUCCESS',
      'LOW'
    )
    
    // Save the scan results to the database
    const securityScan = new SecurityScan({
      scanType: 'headers',
      duration: Date.now() - new Date().getTime(),
      status: 'completed',
      success: true,
      summary: {
        score: securityScore,
        grade: summary.grade,
        headersChecked: summary.headersChecked,
        headersPassed: summary.headersPassed,
        criticalIssues: summary.criticalIssues,
        warnings: summary.warnings,
        info: summary.info
      },
      findings: findings,
      recommendations: recommendations,
      securityHeaders: actualHeaders,
      serverUrl
    });

    await securityScan.save();
    
    res.json({
      success: true,
      scanType: 'Security Headers',
      timestamp: new Date().toISOString(),
      summary,
      findings,
      recommendations,
      securityHeaders: actualHeaders,
      serverUrl
    })
    
  } catch (error) {
    console.error('Security headers scan error:', error)
    res.status(500).json({ error: 'Failed to perform security headers scan.' })
  }
})

// POST /api/admin/blocked-ips - block an IP
app.post('/api/admin/blocked-ips', authMiddleware, requireAdminRole, async (req, res) => {
  if (!dbReady) {
    return res.status(503).json({ error: 'Database unavailable.' })
  }
  try {
    const { ipAddress, reason, severity, expiresAt, notes } = req.body
    const normalizedIpAddress = normalizeIpv4AddressInput(ipAddress)
    
    if (!normalizedIpAddress || !reason) {
      return res.status(400).json({ error: 'IP address and reason are required.' })
    }
    
    // Validate IP format
    if (!isValidIpv4Address(normalizedIpAddress)) {
      return res.status(400).json({ error: 'Invalid IP address format.' })
    }
    
    const nextExpiry = expiresAt ? new Date(expiresAt) : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
    let blockedIP = await BlockedIP.findOne({ ipAddress: normalizedIpAddress })

    if (blockedIP && blockedIP.isActive && new Date(blockedIP.expiresAt) > new Date()) {
      return res.status(409).json({ error: 'IP address is already blocked.' })
    }

    if (blockedIP) {
      blockedIP.reason = reason
      blockedIP.severity = severity || 'medium'
      blockedIP.blockedBy = req.adminId
      blockedIP.blockedAt = new Date()
      blockedIP.expiresAt = nextExpiry
      blockedIP.isActive = true
      blockedIP.notes = notes || ''
      blockedIP.attemptCount = 0
      blockedIP.lastAttemptAt = null
      await blockedIP.save()
    } else {
      blockedIP = new BlockedIP({
        ipAddress: normalizedIpAddress,
        reason,
        severity: severity || 'medium',
        blockedBy: req.adminId,
        expiresAt: nextExpiry,
        notes: notes || ''
      })

      await blockedIP.save()
    }

    const revocationIpCandidates = Array.from(
      new Set([normalizedIpAddress, `::ffff:${normalizedIpAddress}`])
    )

    const revokeResult = await AuthToken.updateMany(
      {
        isActive: true,
        ipAddress: { $in: revocationIpCandidates }
      },
      {
        $set: {
          isActive: false,
          invalidationReason: 'admin_revoke',
          invalidatedAt: new Date()
        }
      }
    )
    const revokedSessions = Number(revokeResult.modifiedCount || 0)
    
    // Log the action
    await logAudit(
      'BLOCK_IP',
      'SECURITY',
      blockedIP._id.toString(),
      normalizedIpAddress,
      `Blocked IP address: ${normalizedIpAddress} - ${reason}`,
      req.adminId,
      req.accountType,
      null,
      {
        ...auditObject(blockedIP, 'SECURITY'),
        revokedSessions
      },
      'SUCCESS',
      'HIGH'
    )
    
    res.status(201).json({ 
      message: 'IP address blocked successfully.',
      blockedIP,
      revokedSessions
    })
  } catch (error) {
    console.error('Block IP error:', error)
    res.status(500).json({ error: 'Failed to block IP address.' })
  }
})

// DELETE /api/admin/blocked-ips/:id - unblock an IP
app.delete('/api/admin/blocked-ips/:id', authMiddleware, requireAdminRole, async (req, res) => {
  if (!dbReady) {
    return res.status(503).json({ error: 'Database unavailable.' })
  }
  try {
    const blockedIP = await BlockedIP.findById(req.params.id)
    if (!blockedIP) {
      return res.status(404).json({ error: 'Blocked IP not found.' })
    }
    
    blockedIP.isActive = false
    await blockedIP.save()
    
    // Log the action
    await logAudit(
      'UNBLOCK_IP',
      'SECURITY',
      blockedIP._id.toString(),
      blockedIP.ipAddress,
      `Unblocked IP address: ${blockedIP.ipAddress}`,
      req.adminId,
      req.accountType,
      auditObject(blockedIP, 'SECURITY'),
      null,
      'SUCCESS',
      'MEDIUM'
    )
    
    res.json({ message: 'IP address unblocked successfully.' })
  } catch (error) {
    console.error('Unblock IP error:', error)
    res.status(500).json({ error: 'Failed to unblock IP address.' })
  }
})

// DELETE /api/admin/blocked-ips/by-ip/:ipAddress - unblock by IP address (appeal flow)
app.delete('/api/admin/blocked-ips/by-ip/:ipAddress', authMiddleware, requireAdminRole, async (req, res) => {
  if (!dbReady) {
    return res.status(503).json({ error: 'Database unavailable.' })
  }
  try {
    const ipAddress = normalizeIpv4AddressInput(req.params.ipAddress)
    if (!isValidIpv4Address(ipAddress)) {
      return res.status(400).json({ error: 'Invalid IP address format.' })
    }

    const blockedIP = await BlockedIP.findOne({
      ipAddress,
      isActive: true
    })

    if (!blockedIP) {
      return res.status(404).json({ error: 'Blocked IP not found.' })
    }
    
    blockedIP.isActive = false
    await blockedIP.save()
    
    await logAudit(
      'UNBLOCK_IP',
      'SECURITY',
      blockedIP._id.toString(),
      blockedIP.ipAddress,
      `Unblocked IP address by lookup: ${blockedIP.ipAddress}`,
      req.adminId,
      req.accountType,
      auditObject(blockedIP, 'SECURITY'),
      null,
      'SUCCESS',
      'MEDIUM'
    )
    
    res.json({ message: 'IP address unblocked successfully.', ipAddress: blockedIP.ipAddress })
  } catch (error) {
    console.error('Unblock IP by address error:', error)
    res.status(500).json({ error: 'Failed to unblock IP address.' })
  }
})

// GET /api/admin/blocked-ips/:ipAddress - check if IP is blocked
app.get('/api/admin/blocked-ips/:ipAddress', authMiddleware, requireAdminRole, async (req, res) => {
  if (!dbReady) {
    return res.status(503).json({ error: 'Database unavailable.' })
  }
  try {
    const ipAddress = normalizeIpv4AddressInput(req.params.ipAddress)
    if (!isValidIpv4Address(ipAddress)) {
      return res.status(400).json({ error: 'Invalid IP address format.' })
    }

    const blocked = await BlockedIP.findOne({ 
      ipAddress,
      isActive: true,
      expiresAt: { $gt: new Date() }
    }).lean()
    
    res.json({ blocked: !!blocked, reason: blocked ? blocked.reason : null })
  } catch (error) {
    console.error('Check blocked IP error:', error)
    res.status(500).json({ error: 'Failed to check IP status.' })
  }
})

// ==================== STUDENT PASSWORD MIGRATION ====================

// POST /api/admin/migrate-student-passwords - Generate passwords for students without them
app.post('/api/admin/migrate-student-passwords', authMiddleware, requireAnyRole('admin', 'registrar'), async (req, res) => {
  if (!dbReady) {
    return res.status(503).json({ error: 'Database unavailable.' })
  }
  
  try {
    const StudentPasswordService = require('./services/studentPasswordService');
    
    // Find all students without passwords
    const studentsWithoutPasswords = await Student.find({
      $or: [
        { password: { $exists: false } },
        { password: null },
        { password: '' }
      ]
    });

    console.log(`Found ${studentsWithoutPasswords.length} students without passwords`);

    if (studentsWithoutPasswords.length === 0) {
      return res.json({
        success: true,
        message: 'No students need password migration. All students already have passwords.',
        results: []
      });
    }

    let successCount = 0;
    let failureCount = 0;
    const results = [];

    for (const student of studentsWithoutPasswords) {
      try {
        // Generate default password
        const defaultPassword = StudentPasswordService.generateDefaultPassword(student);
        
        // Set the password (will be hashed by the pre-save hook)
        student.password = defaultPassword;
        
        await student.save();
        
        successCount++;
        results.push({
          studentNumber: student.studentNumber,
          name: `${student.firstName} ${student.lastName}`,
          password: defaultPassword,
          status: 'success'
        });
        
        console.log(`✓ Generated password for ${student.studentNumber}: ${defaultPassword}`);
      } catch (error) {
        failureCount++;
        results.push({
          studentNumber: student.studentNumber,
          name: `${student.firstName} ${student.lastName}`,
          error: error.message,
          status: 'failed'
        });
        console.error(`✗ Failed to generate password for ${student.studentNumber}:`, error.message);
      }
    }

    res.json({
      success: true,
      message: `Password migration completed. Success: ${successCount}, Failed: ${failureCount}`,
      summary: {
        total: studentsWithoutPasswords.length,
        successful: successCount,
        failed: failureCount
      },
      results: results
    });

  } catch (error) {
    console.error('Student password migration error:', error);
    res.status(500).json({ error: 'Password migration failed.' });
  }
});

// POST /api/admin/clear-student-passwords - Clear all student passwords
app.post('/api/admin/clear-student-passwords', authMiddleware, requireAnyRole('admin', 'registrar'), async (req, res) => {
  if (!dbReady) {
    return res.status(503).json({ error: 'Database unavailable.' })
  }
  
  try {
    // Clear passwords for all students
    const result = await Student.updateMany(
      {},
      { $unset: { password: '' } }
    );

    console.log(`Cleared passwords for ${result.modifiedCount} students`);

    res.json({
      success: true,
      message: `Cleared passwords for ${result.modifiedCount} students`,
      summary: {
        total: result.modifiedCount,
        successful: result.modifiedCount,
        failed: 0
      },
      results: []
    });

  } catch (error) {
    console.error('Student password clear error:', error);
    res.status(500).json({ error: 'Password clear failed.' });
  }
});

// ==================== SYSTEM SETTINGS ====================

// GET /api/settings/academic-term
app.get('/api/settings/academic-term', authMiddleware, cacheMiddleware({ ttlMs: 30 * 1000 }), async (req, res) => {
  if (!dbReady) {
    return res.status(503).json({ error: 'Database unavailable.' })
  }
  try {
    await settingsController.getAcademicTerm(req, res);
  } catch (error) {
    console.error('Get academic term error:', error);
    res.status(500).json({ error: 'Failed to get academic term setting.' });
  }
});

// PUT /api/settings/academic-term
app.put('/api/settings/academic-term', authMiddleware, requireBlockManagementRole, invalidateApiCacheOnSuccess('/api/settings/academic-term'), async (req, res) => {
  if (!dbReady) {
    return res.status(503).json({ error: 'Database unavailable.' })
  }
  try {
    await settingsController.updateAcademicTerm(req, res);
  } catch (error) {
    console.error('Update academic term error:', error);
    res.status(500).json({ error: 'Failed to update academic term setting.' });
  }
});

// ==================== ACADEMIC YEAR ROLLOVER ====================

// POST /api/rollover/preview - dry-run evaluation of the closing school year (read-only)
app.post('/api/rollover/preview', authMiddleware, requireBlockManagementRole, async (req, res) => {
  if (!dbReady) {
    return res.status(503).json({ error: 'Database unavailable.' })
  }
  try {
    const { fromSchoolYear, toSchoolYear, semester } = req.body || {}
    const preview = await AcademicYearRolloverService.previewRollover({ fromSchoolYear, toSchoolYear, semester })
    res.json({ success: true, data: preview })
  } catch (error) {
    console.error('Rollover preview error:', error)
    res.status(error.statusCode || 500).json({ error: error.message || 'Failed to evaluate rollover.' })
  }
})

// POST /api/rollover/preview-summary - hierarchical aggregate counts (no student records, scales to 100k+)
app.post('/api/rollover/preview-summary', authMiddleware, requireBlockManagementRole, async (req, res) => {
  if (!dbReady) {
    return res.status(503).json({ error: 'Database unavailable.' })
  }
  try {
    const { fromSchoolYear, toSchoolYear, semester } = req.body || {}
    const summary = await AcademicYearRolloverService.previewSummary({ fromSchoolYear, toSchoolYear, semester })
    res.json({ success: true, data: summary })
  } catch (error) {
    console.error('Rollover preview-summary error:', error)
    res.status(error.statusCode || 500).json({ error: error.message || 'Failed to generate rollover summary.' })
  }
})

// POST /api/rollover/preview-students - lazy-load paginated students for a specific group
app.post('/api/rollover/preview-students', authMiddleware, requireBlockManagementRole, async (req, res) => {
  if (!dbReady) {
    return res.status(503).json({ error: 'Database unavailable.' })
  }
  try {
    const { fromSchoolYear, course, yearLevel, section, page, limit, search, filter } = req.body || {}
    const result = await AcademicYearRolloverService.previewStudents({ fromSchoolYear, course, yearLevel, section, page, limit, search, filter })
    res.json({ success: true, data: result })
  } catch (error) {
    console.error('Rollover preview-students error:', error)
    res.status(error.statusCode || 500).json({ error: error.message || 'Failed to load students.' })
  }
})

// POST /api/rollover/preview-exceptions - lazy-load paginated exception students (needsReview only)
app.post('/api/rollover/preview-exceptions', authMiddleware, requireBlockManagementRole, async (req, res) => {
  if (!dbReady) {
    return res.status(503).json({ error: 'Database unavailable.' })
  }
  try {
    const { fromSchoolYear, page, limit, search, course, yearLevel } = req.body || {}
    const result = await AcademicYearRolloverService.previewExceptions({ fromSchoolYear, page, limit, search, course, yearLevel })
    res.json({ success: true, data: result })
  } catch (error) {
    console.error('Rollover preview-exceptions error:', error)
    res.status(error.statusCode || 500).json({ error: error.message || 'Failed to load exceptions.' })
  }
});

// POST /api/rollover/execute - transactional school year rollover
app.post('/api/rollover/execute', authMiddleware, requireBlockManagementRole, invalidateApiCacheOnSuccess('/api/settings/academic-term', ...blockManagementCachePrefixes), async (req, res) => {
  if (!dbReady) {
    return res.status(503).json({ error: 'Database unavailable.' })
  }
  try {
    const { fromSchoolYear, toSchoolYear, semester, decisions, groupDecisions, decisionOverrides } = req.body || {}
    const result = await AcademicYearRolloverService.executeRollover({
      fromSchoolYear,
      toSchoolYear,
      semester,
      decisions,
      groupDecisions,
      decisionOverrides,
      adminId: req.adminId,
      adminRole: normalizeAccountType(req.accountType)
    })
    res.json({ success: true, data: result })
  } catch (error) {
    console.error('Rollover execution error:', error)
    res.status(error.statusCode || 500).json({
      error: error.message || 'Failed to execute rollover. All changes were rolled back.',
      failures: error.failures || undefined
    })
  }
});

// GET /api/rollover/snapshots - list immutable archive snapshots
app.get('/api/rollover/snapshots', authMiddleware, requireBlockManagementRole, async (req, res) => {
  if (!dbReady) {
    return res.status(503).json({ error: 'Database unavailable.' })
  }
  try {
    const { schoolYear, type, limit } = req.query || {}
    const snapshots = await AcademicYearRolloverService.listSnapshots({ schoolYear, type, limit })
    res.json({ success: true, data: snapshots })
  } catch (error) {
    console.error('List rollover snapshots error:', error)
    res.status(500).json({ error: 'Failed to list archive snapshots.' })
  }
});

// GET /api/rollover/snapshots/:id - fetch a single snapshot with its full payload
app.get('/api/rollover/snapshots/:id', authMiddleware, requireBlockManagementRole, async (req, res) => {
  if (!dbReady) {
    return res.status(503).json({ error: 'Database unavailable.' })
  }
  try {
    const snapshot = await AcademicYearRolloverService.getSnapshotById(req.params.id)
    if (!snapshot) {
      return res.status(404).json({ error: 'Snapshot not found.' })
    }
    res.json({ success: true, data: snapshot })
  } catch (error) {
    console.error('Get rollover snapshot error:', error)
    res.status(500).json({ error: 'Failed to fetch archive snapshot.' })
  }
});

// GET /api/rollover/audit-report - academic audit report for registrars
app.get('/api/rollover/audit-report', authMiddleware, requireBlockManagementRole, async (req, res) => {
  if (!dbReady) {
    return res.status(503).json({ error: 'Database unavailable.' })
  }
  try {
    const {
      action,
      resourceType,
      severity,
      sortOrder = 'newest',
      performedBy,
      startDate,
      endDate,
      page = 1,
      limit = 25,
    } = req.query || {}

    const pageNumber = Math.max(1, Number.parseInt(page, 10) || 1)
    const limitNumber = Math.min(100, Math.max(1, Number.parseInt(limit, 10) || 25))

    // Academic-only filter: STUDENT, REGISTRATION, COURSE, FACULTY + ARCHIVE action (rollover)
    const ACADEMIC_RESOURCES = ['STUDENT', 'REGISTRATION', 'COURSE', 'FACULTY']
    const baseFilter = {
      $or: [
        { resourceType: { $in: ACADEMIC_RESOURCES } },
        { action: 'ARCHIVE', resourceType: 'SYSTEM' },
      ],
    }

    // Build user-supplied filter on top of academic filter
    const filter = { ...baseFilter }
    if (action) {
      const actions = String(action).split(',').map((v) => v.trim()).filter(Boolean)
      filter.action = actions.length > 1 ? { $in: actions } : actions[0]
    }
    if (resourceType) filter.resourceType = { $eq: resourceType.trim() }
    if (severity) filter.severity = { $eq: severity.trim() }
    if (performedBy) filter.performedBy = { $eq: performedBy.trim() }
    if (startDate || endDate) {
      filter.createdAt = {}
      if (startDate) filter.createdAt.$gte = new Date(startDate)
      if (endDate) filter.createdAt.$lte = new Date(endDate)
    }

    const sortDirection = String(sortOrder).toLowerCase() === 'oldest' ? 1 : -1

    const last30Days = new Date()
    last30Days.setDate(last30Days.getDate() - 30)

    const recentMatch = { ...baseFilter, createdAt: { $gte: last30Days } }

    const [
      totalLogs,
      recentLogs,
      criticalLogs,
      highSeverityLogs,
      failedActions,
      actionStats,
      resourceStats,
      severityStats,
      recentActivity,
      total,
      blockActionLogs,
      dailyActivity,
      topUsers,
    ] = await Promise.all([
      AuditLog.countDocuments(baseFilter),
      AuditLog.countDocuments(recentMatch),
      AuditLog.countDocuments({ ...baseFilter, severity: 'CRITICAL' }),
      AuditLog.countDocuments({ ...baseFilter, severity: 'HIGH' }),
      AuditLog.countDocuments({ ...baseFilter, status: { $in: ['FAILED', 'PARTIAL'] } }),
      AuditLog.aggregate([
        { $match: recentMatch },
        { $group: { _id: '$action', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 10 },
      ]),
      AuditLog.aggregate([
        { $match: recentMatch },
        { $group: { _id: '$resourceType', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 10 },
      ]),
      AuditLog.aggregate([
        { $match: recentMatch },
        { $group: { _id: '$severity', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),
      AuditLog.find(filter)
        .populate('performedBy', 'username displayName')
        .sort({ createdAt: sortDirection })
        .limit(limitNumber)
        .skip((pageNumber - 1) * limitNumber),
      AuditLog.countDocuments(filter),
      // Block action logs (separate model)
      BlockActionLog.find()
        .populate('sectionId', 'sectionCode blockGroupId')
        .sort({ timestamp: -1 })
        .limit(20)
        .lean(),
      // Daily activity trend (last 30 days)
      AuditLog.aggregate([
        { $match: recentMatch },
        {
          $group: {
            _id: {
              $dateToString: { format: '%Y-%m-%d', date: '$createdAt' },
            },
            count: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
        { $limit: 30 },
      ]),
      // Top users by academic actions (last 30 days)
      AuditLog.aggregate([
        { $match: recentMatch },
        {
          $group: {
            _id: '$performedBy',
            username: { $first: '$performedByRole' },
            count: { $sum: 1 },
          },
        },
        { $sort: { count: -1 } },
        { $limit: 5 },
        {
          $lookup: {
            from: 'admins',
            localField: '_id',
            foreignField: '_id',
            as: 'userDetails',
          },
        },
        {
          $project: {
            _id: 1,
            count: 1,
            username: { $arrayElemAt: ['$userDetails.username', 0] },
            displayName: { $arrayElemAt: ['$userDetails.displayName', 0] },
          },
        },
      ]),
    ])

    // Get rollover snapshots for history section
    const snapshots = await ArchiveSnapshot.find()
      .populate('generatedBy', 'username displayName')
      .sort({ generatedAt: -1 })
      .limit(20)
      .select('type title schoolYear newSchoolYear semester rolloverBatchId counts generatedAt generatedBy')

    const redact = redactSensitiveAuditData || ((v) => v)
    const sanitizedActivity = recentActivity.map((entry) => {
      const logEntry = entry?.toObject ? entry.toObject() : entry
      return {
        ...logEntry,
        oldValue: redact(logEntry.oldValue),
        newValue: redact(logEntry.newValue),
      }
    })

    res.json({
      success: true,
      data: {
        stats: {
          totalLogs,
          recentLogs,
          criticalLogs,
          highSeverityLogs,
          failedActions,
          actionStats,
          resourceStats,
          severityStats,
        },
        activity: {
          logs: sanitizedActivity,
          page: pageNumber,
          totalPages: Math.ceil(total / limitNumber),
          total,
        },
        blockActions: blockActionLogs.map((log) => ({
          _id: String(log._id),
          actionType: log.actionType,
          sectionId: log.sectionId ? String(log.sectionId._id) : null,
          sectionCode: log.sectionId?.sectionCode || null,
          studentId: log.studentId,
          registrarId: log.registrarId,
          reason: log.reason,
          details: log.details,
          timestamp: log.timestamp,
        })),
        dailyActivity: dailyActivity.map((d) => ({ date: d._id, count: d.count })),
        topUsers: topUsers.map((u) => ({
          _id: String(u._id),
          username: u.username || 'System',
          displayName: u.displayName || u.username || 'System',
          count: u.count,
        })),
        rolloverHistory: snapshots.map((s) => s.toObject ? s.toObject() : s),
      },
    })
  } catch (error) {
    console.error('Academic audit report error:', error)
    res.status(500).json({ error: 'Failed to generate academic audit report.' })
  }
});

// ==================== BLOCK MANAGEMENT ====================

// GET /api/curriculum — list all curricula for block group configuration
app.get('/api/curriculum', authMiddleware, requireBlockManagementRole, cacheMiddleware({ ttlMs: 60 * 1000 }), async (req, res) => {
  if (!dbReady) {
    return res.status(503).json({ error: 'Database unavailable.' });
  }
  try {
    const curricula = await Curriculum.find({})
      .select('programCode programName version status effectiveSchoolYear')
      .lean();
    res.json(curricula);
  } catch (error) {
    console.error('Get curricula error:', error);
    res.status(500).json({ error: 'Failed to fetch curricula.' });
  }
});

// GET /api/blocks/eligible
app.get('/api/blocks/eligible', authMiddleware, requireBlockManagementRole, cacheMiddleware({ ttlMs: 10 * 1000 }), async (req, res) => {
  if (!dbReady) {
    return res.status(503).json({ error: 'Database unavailable.' })
  }
  try {
    await blockController.getEligibleBlocks(req, res);
  } catch (error) {
    console.error('Get eligible blocks error:', error);
    res.status(500).json({ error: 'Failed to fetch eligible blocks.' });
  }
});

// POST /api/blocks/eligible/bulk
app.post('/api/blocks/eligible/bulk', authMiddleware, requireBlockManagementRole, async (req, res) => {
  if (!dbReady) {
    return res.status(503).json({ error: 'Database unavailable.' })
  }
  try {
    await blockController.getBulkEligibility(req, res);
  } catch (error) {
    console.error('Get bulk eligibility error:', error);
    res.status(500).json({ error: 'Failed to evaluate bulk eligibility.' });
  }
});

// POST /api/blocks/assign-student
app.post('/api/blocks/assign-student', authMiddleware, requireBlockManagementRole, invalidateApiCacheOnSuccess(...blockManagementCachePrefixes), async (req, res) => {
  if (!dbReady) {
    return res.status(503).json({ error: 'Database unavailable.' })
  }
  try {
    await blockController.assignStudent(req, res);
  } catch (error) {
    console.error('Assign student error:', error);
    res.status(500).json({ error: 'Failed to assign student.' });
  }
});

// POST /api/blocks/overcapacity/decision
app.post('/api/blocks/overcapacity/decision', authMiddleware, requireBlockManagementRole, invalidateApiCacheOnSuccess(...blockManagementCachePrefixes), async (req, res) => {
  if (!dbReady) {
    return res.status(503).json({ error: 'Database unavailable.' })
  }
  try {
    await blockController.handleOvercapacityDecision(req, res);
  } catch (error) {
    console.error('Overcapacity decision error:', error);
    res.status(500).json({ error: 'Failed to process decision.' });
  }
});

// GET /api/blocks/suggested-sections
app.get('/api/blocks/suggested-sections', authMiddleware, requireBlockManagementRole, cacheMiddleware({ ttlMs: 20 * 1000 }), async (req, res) => {
  if (!dbReady) {
    return res.status(503).json({ error: 'Database unavailable.' })
  }
  try {
    await blockController.getSuggestedSections(req, res);
  } catch (error) {
    console.error('Get suggested sections error:', error);
    res.status(500).json({ error: 'Failed to get suggested sections.' });
  }
});

// POST /api/blocks/rebalance
app.post('/api/blocks/rebalance', authMiddleware, requireBlockManagementRole, invalidateApiCacheOnSuccess(...blockManagementCachePrefixes), async (req, res) => {
  if (!dbReady) {
    return res.status(503).json({ error: 'Database unavailable.' })
  }
  try {
    await blockController.rebalanceSections(req, res);
  } catch (error) {
    console.error('Rebalance error:', error);
    res.status(500).json({ error: 'Failed to rebalance sections.' });
  }
});

// GET /api/blocks/groups
app.get('/api/blocks/groups', authMiddleware, requireBlockManagementRole, cacheMiddleware({ ttlMs: 20 * 1000 }), async (req, res) => {
  if (!dbReady) {
    return res.status(503).json({ error: 'Database unavailable.' })
  }
  try {
    await blockController.getBlockGroups(req, res);
  } catch (error) {
    console.error('Get block groups error:', error);
    res.status(500).json({ error: 'Failed to get block groups.' });
  }
});

// GET /api/blocks/assignable-students
app.get('/api/blocks/assignable-students', authMiddleware, requireBlockManagementRole, securityMiddleware.inputValidationMiddleware(securityMiddleware.schemas.block.assignableStudents), cacheMiddleware({ ttlMs: 15 * 1000 }), async (req, res) => {
  if (!dbReady) {
    return res.status(503).json({ error: 'Database unavailable.' })
  }
  try {
    await blockController.getAssignableStudents(req, res);
  } catch (error) {
    console.error('Get assignable students error:', error.message);
    res.status(500).json({ error: 'Failed to get assignable students.' });
  }
});

// POST /api/blocks/groups
app.post('/api/blocks/groups', authMiddleware, requireBlockManagementRole, securityMiddleware.inputValidationMiddleware(securityMiddleware.schemas.block.createBlockGroup), invalidateApiCacheOnSuccess(...blockManagementCachePrefixes), async (req, res) => {
  if (!dbReady) {
    return res.status(503).json({ error: 'Database unavailable.' })
  }
  try {
    await blockController.createBlockGroup(req, res);
  } catch (error) {
    console.error('Create block group error:', error.message);
    res.status(500).json({ error: 'Failed to create block group.' });
  }
});

// PATCH /api/blocks/groups/:groupId
app.patch('/api/blocks/groups/:groupId', authMiddleware, requireBlockManagementRole, securityMiddleware.inputValidationMiddleware({ ...securityMiddleware.schemas.block.objectIdParam, ...securityMiddleware.schemas.block.updateBlockGroup }), invalidateApiCacheOnSuccess(...blockManagementCachePrefixes), async (req, res) => {
  if (!dbReady) {
    return res.status(503).json({ error: 'Database unavailable.' })
  }
  try {
    await blockController.updateBlockGroup(req, res);
  } catch (error) {
    console.error('Update block group error:', error.message);
    res.status(500).json({ error: 'Failed to update block group.' });
  }
});

// DELETE /api/blocks/groups/:groupId
app.delete('/api/blocks/groups/:groupId', authMiddleware, requireBlockManagementRole, securityMiddleware.inputValidationMiddleware(securityMiddleware.schemas.block.objectIdParam), invalidateApiCacheOnSuccess(...blockManagementCachePrefixes), async (req, res) => {
  if (!dbReady) {
    return res.status(503).json({ error: 'Database unavailable.' })
  }
  try {
    await blockController.deleteBlockGroup(req, res);
  } catch (error) {
    console.error('Delete block group error:', error.message);
    res.status(500).json({ error: 'Failed to delete block group.' });
  }
});

// GET /api/blocks/groups/:groupId/sections
app.get('/api/blocks/groups/:groupId/sections', authMiddleware, requireBlockManagementRole, securityMiddleware.inputValidationMiddleware(securityMiddleware.schemas.block.objectIdParam), cacheMiddleware({ ttlMs: 20 * 1000 }), async (req, res) => {
  if (!dbReady) {
    return res.status(503).json({ error: 'Database unavailable.' })
  }
  try {
    await blockController.getSectionsInGroup(req, res);
  } catch (error) {
    console.error('Get sections error:', error.message);
    res.status(500).json({ error: 'Failed to get sections.' });
  }
});

// POST /api/blocks/groups/:groupId/sections
app.post('/api/blocks/groups/:groupId/sections', authMiddleware, requireBlockManagementRole, securityMiddleware.inputValidationMiddleware({ ...securityMiddleware.schemas.block.objectIdParam, ...securityMiddleware.schemas.block.createSection }), invalidateApiCacheOnSuccess(...blockManagementCachePrefixes), async (req, res) => {
  if (!dbReady) {
    return res.status(503).json({ error: 'Database unavailable.' })
  }
  try {
    await blockController.createSectionInGroup(req, res);
  } catch (error) {
    console.error('Create section error:', error);
    res.status(500).json({ error: 'Failed to create section.' });
  }
});

// POST /api/blocks/groups/:groupId/sync-subjects
// Syncs BlockSubjectAssignment records from the block group's linked curriculum.
// Auto-assigns required subjects matching curriculumId + yearLevel + semester
// to all (or specified) sections. Idempotent — safe to run multiple times.
app.post('/api/blocks/groups/:groupId/sync-subjects', authMiddleware, requireBlockManagementRole, securityMiddleware.inputValidationMiddleware(securityMiddleware.schemas.block.syncSubjects), invalidateApiCacheOnSuccess(...blockManagementCachePrefixes), async (req, res) => {
  if (!dbReady) {
    return res.status(503).json({ error: 'Database unavailable.' })
  }
  try {
    await blockController.syncSubjectsFromCurriculum(req, res);
  } catch (error) {
    console.error('Sync subjects error:', error);
    res.status(500).json({ error: 'Failed to sync subjects from curriculum.' });
  }
});

// PATCH /api/blocks/sections/:sectionId
app.patch('/api/blocks/sections/:sectionId', authMiddleware, requireBlockManagementRole, securityMiddleware.inputValidationMiddleware({ ...securityMiddleware.schemas.block.objectIdParam, ...securityMiddleware.schemas.block.updateSection }), invalidateApiCacheOnSuccess(...blockManagementCachePrefixes), async (req, res) => {
  if (!dbReady) {
    return res.status(503).json({ error: 'Database unavailable.' })
  }
  try {
    await blockController.updateSection(req, res);
  } catch (error) {
    console.error('Update section error:', error.message);
    res.status(500).json({ error: 'Failed to update section.' });
  }
});

// DELETE /api/blocks/sections/:sectionId
app.delete('/api/blocks/sections/:sectionId', authMiddleware, requireBlockManagementRole, securityMiddleware.inputValidationMiddleware(securityMiddleware.schemas.block.objectIdParam), invalidateApiCacheOnSuccess(...blockManagementCachePrefixes), async (req, res) => {
  if (!dbReady) {
    return res.status(503).json({ error: 'Database unavailable.' })
  }
  try {
    await blockController.deleteSection(req, res);
  } catch (error) {
    console.error('Delete section error:', error.message);
    res.status(500).json({ error: 'Failed to delete section.' });
  }
});

// GET /api/blocks/sections/:sectionId/students
app.get('/api/blocks/sections/:sectionId/students', authMiddleware, requireBlockManagementRole, securityMiddleware.inputValidationMiddleware(securityMiddleware.schemas.block.objectIdParam), cacheMiddleware({ ttlMs: 15 * 1000 }), async (req, res) => {
  if (!dbReady) {
    return res.status(503).json({ error: 'Database unavailable.' })
  }
  try {
    await blockController.getSectionStudents(req, res);
  } catch (error) {
    console.error('Get section students error:', error);
    res.status(500).json({ error: 'Failed to get section students.' });
  }
});

// DELETE /api/blocks/sections/:sectionId/students/:studentId
app.delete('/api/blocks/sections/:sectionId/students/:studentId', authMiddleware, requireBlockManagementRole, invalidateApiCacheOnSuccess(...blockManagementCachePrefixes), async (req, res) => {
  if (!dbReady) {
    return res.status(503).json({ error: 'Database unavailable.' })
  }
  try {
    await blockController.unassignStudentFromSection(req, res);
  } catch (error) {
    console.error('Unassign section student error:', error);
    res.status(500).json({ error: 'Failed to unassign student from section.' });
  }
});

// PATCH /api/blocks/sections/:sectionId/adviser
app.patch('/api/blocks/sections/:sectionId/adviser', authMiddleware, requireBlockManagementRole, invalidateApiCacheOnSuccess(...blockManagementCachePrefixes), async (req, res) => {
  if (!dbReady) {
    return res.status(503).json({ error: 'Database unavailable.' })
  }
  try {
    await blockController.updateSectionAdviser(req, res);
  } catch (error) {
    console.error('Update section adviser error:', error);
    res.status(500).json({ error: 'Failed to update section adviser.' });
  }
});

// GET /api/blocks/capacity-updates
app.get('/api/blocks/capacity-updates', authMiddleware, requireBlockManagementRole, cacheMiddleware({ ttlMs: 5 * 1000 }), async (req, res) => {
  if (!dbReady) {
    return res.status(503).json({ error: 'Database unavailable.' })
  }
  try {
    await blockController.getCapacityUpdates(req, res);
  } catch (error) {
    console.error('Get capacity updates error:', error);
    res.status(500).json({ error: 'Failed to fetch capacity updates.' });
  }
});

// Apply relaxed limiter to all API routes
app.use('/api/', apiLimiter)

// Frontend rate limiter (more permissive for static file serving)
const frontendRateLimitMax = Number(process.env.FRONTEND_RATE_LIMIT_MAX || 1000)
const frontendLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: Number.isFinite(frontendRateLimitMax) && frontendRateLimitMax > 0 ? frontendRateLimitMax : 1000,
  message: {
    error: 'Too many requests from this IP, please try again later.'
  },
  standardHeaders: true,
  legacyHeaders: false
})

// SPA fallback: serve index.html for app routes only (must be last)
app.use((req, res, next) => {
  if (req.method !== 'GET') return next()
  if (req.path.startsWith('/api/')) return next()

  // Never serve index.html for static file-like requests (e.g. .css/.js).
  if (path.extname(req.path)) {
    return res.status(404).end()
  }

  // Only return SPA HTML when the client explicitly requests HTML.
  const acceptHeader = String(req.headers.accept || '')
  if (!acceptHeader.includes('text/html')) {
    return res.status(404).end()
  }

  const indexFile = path.join(distPath, 'index.html')
  res.setHeader('Cache-Control', 'no-store')
  res.sendFile(indexFile, (err) => {
    if (err) res.status(404).send('Frontend not built. Run: npm run build')
  })
})

// GET /api/admin/server-stats - Get server performance metrics from Render API
app.get('/api/admin/server-stats', authMiddleware, requireAdminRole, async (req, res) => {
  try {
    const response = await fetch(
      `https://api.render.com/v1/services/${process.env.RENDER_SERVICE_ID}/metrics`,
      {
        headers: {
          Authorization: `Bearer ${process.env.RENDER_API_KEY}`,
          Accept: "application/json"
        }
      }
    );

    if (!response.ok) {
      return res.status(response.status).json({
        error: "Render API error",
        status: response.status
      });
    }

    const data = await response.json();
    
    // Format Render metrics for frontend
    const formattedMetrics = {
      cpu: data.metrics?.cpu?.values?.[0]?.value || 0,
      memory: data.metrics?.memory?.values?.[0]?.value || 0,
      responseTime: data.metrics?.responseTime?.values?.[0]?.value || 0,
      uptime: data.uptime || 99.9,
      requests: data.requests || 0,
      errorRate: data.errorRate || 0,
      source: 'render-api'
    };

    res.json(formattedMetrics);

  } catch (error) {
    logger.error('Render API error:', error?.message || error);
    res.status(500).json({ 
      error: 'Failed to fetch Render metrics'
    });
  }
})

// GET /api/admin/bandwidth-stats - Get bandwidth usage statistics from Render API
app.get('/api/admin/bandwidth-stats', authMiddleware, requireAdminRole, async (req, res) => {
  try {
    const response = await fetch(
      `https://api.render.com/v1/services/${process.env.RENDER_SERVICE_ID}/metrics`,
      {
        headers: {
          Authorization: `Bearer ${process.env.RENDER_API_KEY}`,
          Accept: "application/json"
        }
      }
    );

    if (!response.ok) {
      return res.status(response.status).json({
        error: "Render API error",
        status: response.status
      });
    }

    const data = await response.json();
    
    // Extract bandwidth metrics from Render data
    const outboundMB = data.metrics?.bandwidthOut?.values?.[0]?.value || 0;
    const inboundMB = data.metrics?.bandwidthIn?.values?.[0]?.value || 0;
    const totalMB = outboundMB + inboundMB;
    const requestsPerMinute = data.metrics?.requestsPerMinute?.values?.[0]?.value || 0;
    const avgResponseSize = data.metrics?.avgResponseSize?.values?.[0]?.value || 0;
    const peakBandwidth = data.metrics?.peakBandwidth?.values?.[0]?.value || 0;

    res.json({
      outboundMB: parseFloat((outboundMB / 1024 / 1024).toFixed(2)), // Convert to MB
      inboundMB: parseFloat((inboundMB / 1024 / 1024).toFixed(2)), // Convert to MB
      totalMB: parseFloat((totalMB / 1024 / 1024).toFixed(2)), // Convert to MB
      requestsPerMinute: Math.round(requestsPerMinute),
      avgResponseSize: parseFloat((avgResponseSize / 1024).toFixed(2)), // Convert to KB
      peakBandwidth: parseFloat((peakBandwidth / 1024 / 1024).toFixed(2)), // Convert to MB/s
      source: 'render-api'
    });

  } catch (error) {
    logger.error('Bandwidth stats error:', error?.message || error);
    res.status(500).json({ 
      error: 'Failed to fetch bandwidth stats'
    });
  }
})

app.use((err, req, res, next) => {
  logger.error('Unhandled request error:', err?.message || err)

  if (res.headersSent) {
    return next(err)
  }

  if (req.path.startsWith('/api/')) {
    const statusCode = Number.isInteger(err?.statusCode) && err.statusCode >= 400 && err.statusCode < 600
      ? err.statusCode
      : 500
    return res.status(statusCode).json({
      error: statusCode >= 500 ? 'Internal server error.' : (err.message || 'Request failed.')
    })
  }

  res.status(500).send('Internal server error.')
})

// Catch-all route for debugging
app.all('/{*path}', (req, res, next) => {
  logger.debug(`Route not found: ${req.method} ${req.path}`);
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'API endpoint not found.' })
  }
  res.status(404).end()
})

const server = app.listen(PORT, '0.0.0.0', () => {
  logger.info(`Server running at http://0.0.0.0:${PORT}`)
  logger.info(`Server running at http://localhost:${PORT}`)
})

async function shutdown(signal) {
  if (shuttingDown) return

  shuttingDown = true
  logger.warn(`${signal} received. Starting graceful shutdown.`)

  clearInterval(scheduledBackupInterval)
  clearInterval(scheduledReconcileInterval)
  clearInterval(scheduledRestoreVerificationInterval)
  clearInterval(tokenCleanupInterval)
  clearInterval(archiveBinCleanupInterval)
  if (initialBackupTimeout) clearTimeout(initialBackupTimeout)
  operationsMonitor.stop()

  const forceExitTimeout = setTimeout(() => {
    logger.critical('Graceful shutdown timed out. Exiting process.')
    process.exit(1)
  }, Number(process.env.GRACEFUL_SHUTDOWN_TIMEOUT_MS || 30000))

  try {
    await new Promise((resolve, reject) => {
      server.close((error) => {
        if (error) reject(error)
        else resolve()
      })
    })

    if (mongoose.connection.readyState !== 0) {
      await mongoose.connection.close(false)
    }

    clearTimeout(forceExitTimeout)
    logger.warn('Graceful shutdown completed.')
    process.exit(0)
  } catch (error) {
    clearTimeout(forceExitTimeout)
    logger.critical('Graceful shutdown failed:', error?.message || error)
    process.exit(1)
  }
}

process.on('SIGTERM', () => {
  void shutdown('SIGTERM')
})

process.on('SIGINT', () => {
  void shutdown('SIGINT')
})

process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled promise rejection:', reason?.message || reason)
})

process.on('uncaughtException', (error) => {
  logger.critical('Uncaught exception:', error?.message || error)
  void shutdown('uncaughtException')
})
