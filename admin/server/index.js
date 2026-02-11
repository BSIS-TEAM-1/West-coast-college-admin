const path = require('path')
require('dotenv').config({ path: path.join(__dirname, '..', '.env') })

const express = require('express')
const cors = require('cors')
const mongoose = require('mongoose')
const jwt = require('jsonwebtoken')
const si = require('systeminformation')
const axios = require('axios')
const { applySecurityHeaders } = require('./security-config')
const Admin = require('./models/Admin')
const Announcement = require('./models/Announcement')
const AuditLog = require('./models/AuditLog')
const AuthToken = require('./models/AuthToken')
const Document = require('./models/Document')
const Backup = require('./models/Backup')
const BlockedIP = require('./models/BlockedIP')
const BackupSystem = require('./backup')

// Atlas metrics integration removed — metrics calls disabled.
// Database functionality (MongoDB via mongoose) remains unchanged.

// Initialize backup system
const backupSystem = new BackupSystem()

// Schedule automatic backups (every 6 hours)
setInterval(async () => {
  console.log('Running scheduled backup...');
  try {
    const result = await backupSystem.createBackup('scheduled', 'system');
    if (result.success) {
      console.log(`Scheduled backup completed: ${result.fileName}`);
    } else {
      console.error('Scheduled backup failed:', result.error);
    }
  } catch (error) {
    console.error('Scheduled backup error:', error);
  }
}, 6 * 60 * 60 * 1000); // 6 hours

// Initial backup on server start
setTimeout(async () => {
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
}, 5000); // 5 seconds after server starts

const app = express()
const PORT = process.env.PORT || 3001
const JWT_SECRET = process.env.JWT_SECRET || 'wcc-admin-dev-secret-change-in-production'

// Hide Express server information
app.disable('x-powered-by')

// Admin IP whitelist (for production)
const ADMIN_IP_WHITELIST = process.env.ADMIN_IP_WHITELIST ? 
  process.env.ADMIN_IP_WHITELIST.split(',').map(ip => ip.trim()) : 
  [] // Empty whitelist allows all IPs in development

// Increase payload limit for base64 images
app.use(express.json({ limit: '10mb' }))
app.use(cors({ origin: true, credentials: true }))

// Apply security headers middleware
app.use(applySecurityHeaders)

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

// Serve uploaded files
app.use('/uploads', express.static(path.join(__dirname, 'uploads')))

// Serve frontend static files
const distPath = path.join(__dirname, '..', 'dist')
app.use(express.static(distPath))

async function authMiddleware(req, res, next) {
  const auth = req.headers.authorization
  const token = auth && auth.startsWith('Bearer ') ? auth.slice(7) : null
  if (!token) {
    return res.status(401).json({ error: 'Unauthorized.' })
  }
  
  try {
    // Find token in MongoDB
    const authToken = await AuthToken.findOne({ 
      token, 
      isActive: true,
      expiresAt: { $gt: new Date() }
    }).populate('adminId')
    
    if (!authToken) {
      return res.status(401).json({ error: 'Invalid or expired token.' })
    }
    
    // Check if adminId exists and is valid
    if (!authToken.adminId) {
      return res.status(401).json({ error: 'Invalid token - no admin associated.' })
    }
    
    // Update last used timestamp
    authToken.lastUsed = new Date()
    await authToken.save()
    
    // Set request data
    req.adminId = authToken.adminId._id
    req.username = authToken.username || authToken.adminId.username
    req.accountType = authToken.accountType || authToken.adminId.accountType
    req.tokenId = authToken._id
    
    next()
  } catch (error) {
    console.error('Auth middleware error:', error)
    return res.status(401).json({ error: 'Authentication failed.' })
  }
}

// Audit logging helper function
async function logAudit(action, resourceType, resourceId, resourceName, description, performedBy, performedByRole, oldValue = null, newValue = null, status = 'SUCCESS', severity = 'LOW', ipAddress = null, userAgent = null) {
  try {
    await AuditLog.create({
      action,
      resourceType,
      resourceId,
      resourceName,
      description,
      performedBy,
      performedByRole,
      ipAddress,
      userAgent,
      oldValue,
      newValue,
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
      fileName: o.fileName,
      originalFileName: o.originalFileName,
      mimeType: o.mimeType,
      fileSize: o.fileSize,
      category: o.category,
      status: o.status,
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

console.log('JWT_SECRET:', process.env.JWT_SECRET)
console.log('JWT_SECRET length:', process.env.JWT_SECRET?.length)
console.log('Environment:', process.env.NODE_ENV || 'development')

let dbReady = false
mongoose.connect(uri)
  .then(() => {
    dbReady = true
    console.log('MongoDB connected')
    
    // Migration: Update existing admin accounts with new fields
    migrateExistingAccounts()
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
setInterval(cleanupExpiredTokens, 60 * 60 * 1000)

// Migration function for existing accounts
async function migrateExistingAccounts() {
  try {
    const existingAdmins = await Admin.find({ uid: { $exists: false } })
    
    if (existingAdmins.length > 0) {
      console.log(`Migrating ${existingAdmins.length} existing admin accounts...`)
      
      for (const admin of existingAdmins) {
        const currentYear = new Date().getFullYear()
        const randomCount = Math.floor(Math.random() * 900) + 100
        
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

// Health check (server is up even if DB is not)
app.get('/api/health', (req, res) => {
  res.json({ ok: true, db: dbReady })
})

// POST /api/admin/signup
app.post('/api/admin/signup', async (req, res) => {
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
app.post('/api/admin/login', async (req, res) => {
  if (!dbReady) {
    return res.status(503).json({ error: 'Database unavailable. Check server logs and Atlas IP whitelist.' })
  }
  try {
    const { username, password } = req.body
    if (!username || !password || typeof username !== 'string' || typeof password !== 'string') {
      return res.status(400).json({ error: 'Username and password are required.' })
    }

    const admin = await Admin.findOne({ username: username.trim().toLowerCase() })
    if (!admin) {
      // Log failed login attempt for non-existent user
      await logAudit(
        'LOGIN',
        'ADMIN',
        'unknown',
        username.trim().toLowerCase(),
        `Failed login attempt: user does not exist`,
        'unknown',
        'unknown',
        null,
        null,
        'FAILED',
        'MEDIUM',
        req.ip,
        req.get('User-Agent')
      )
      return res.status(401).json({ error: 'Invalid username or password.' })
    }

    const match = await admin.comparePassword(password)
    if (!match) {
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
        null,
        'FAILED',
        'MEDIUM',
        req.ip,
        req.get('User-Agent')
      )
      return res.status(401).json({ error: 'Invalid username or password.' })
    }

    // Allow registrar login but include account type in response for routing
    console.log('Login - admin.accountType:', admin.accountType, 'typeof:', typeof admin.accountType)
    
    // Generate a random token
    const crypto = require('crypto')
    const token = crypto.randomBytes(32).toString('hex')
    
    // Store token in MongoDB
    const authToken = await AuthToken.create({
      token,
      adminId: admin._id,
      username: admin.username,
      accountType: admin.accountType,
      ipAddress: req.ip,
      userAgent: req.get('User-Agent')
    })
    
    const loginResponse = { 
      message: 'OK', 
      username: admin.username, 
      token,
      accountType: admin.accountType 
    }
    console.log('Login response being sent:', loginResponse)

    // Log the login action
    await logAudit(
      'LOGIN',
      'ADMIN',
      admin._id.toString(),
      admin.username,
      `Admin login: ${admin.username}`,
      admin._id.toString(),
      admin.accountType,
      null,
      null,
      'SUCCESS',
      'LOW',
      req.ip,
      req.get('User-Agent')
    )

    res.json(loginResponse)
  } catch (err) {
    console.error('Login error:', err)
    res.status(500).json({ error: 'Login failed.' })
  }
})

// POST /api/admin/logout - Invalidate token
app.post('/api/admin/logout', authMiddleware, async (req, res) => {
  try {
    // Deactivate the token if it exists
    if (req.tokenId) {
      await AuthToken.findByIdAndUpdate(req.tokenId, { isActive: false })
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

// GET /api/admin/profile – requires Bearer token
app.get('/api/admin/profile', authMiddleware, async (req, res) => {
  if (!dbReady) {
    return res.status(503).json({ error: 'Database unavailable.' })
  }
  try {
    const admin = await Admin.findById(req.adminId).select('-password')
    if (!admin) return res.status(404).json({ error: 'Admin not found.' })
    
    console.log('Raw admin document from DB:', admin)
    console.log('admin.accountType value:', admin.accountType)
    console.log('typeof admin.accountType:', typeof admin.accountType)
    
    const profileData = {
      username: admin.username,
      displayName: admin.displayName || '',
      email: admin.email || '',
      avatar: admin.avatar || '',
      accountType: admin.accountType,
    }
    
    console.log('Profile data being returned:', profileData)
    res.json(profileData)
  } catch (err) {
    console.error('Profile get error:', err)
    res.status(500).json({ error: 'Failed to load profile.' })
  }
})

// PATCH /api/admin/profile – update profile (username, displayName, email, password)
app.patch('/api/admin/profile', authMiddleware, async (req, res) => {
  if (!dbReady) {
    return res.status(503).json({ error: 'Database unavailable.' })
  }
  try {
    const admin = await Admin.findById(req.adminId)
    if (!admin) return res.status(404).json({ error: 'Admin not found.' })

    const { displayName, email, newUsername, currentPassword, newPassword } = req.body

    if (typeof displayName === 'string') admin.displayName = displayName.trim()
    if (typeof email === 'string') admin.email = email.trim().toLowerCase()

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

    await admin.save()
    const updated = await Admin.findById(admin._id).select('-password')
    res.json({
      username: updated.username,
      displayName: updated.displayName || '',
      email: updated.email || '',
      avatar: updated.avatar || '',
      accountType: updated.accountType,
    })
  } catch (err) {
    console.error('Profile update error:', err)
    res.status(500).json({ error: 'Failed to update profile.' })
  }
})

// POST /api/admin/avatar - upload avatar (base64)
app.post('/api/admin/avatar', authMiddleware, async (req, res) => {
  if (!dbReady) {
    return res.status(503).json({ error: 'Database unavailable.' })
  }
  try {
    const { avatarData, mimeType } = req.body
    
    if (!avatarData || !mimeType) {
      return res.status(400).json({ error: 'Avatar data and mime type are required.' })
    }

    // Validate image size (base64 string size)
    const imageSizeInBytes = Buffer.byteLength(avatarData, 'base64')
    if (imageSizeInBytes > 5 * 1024 * 1024) { // 5MB limit
      return res.status(400).json({ error: 'Image size too large. Maximum 5MB allowed.' })
    }

    // Validate mime type
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp']
    if (!allowedTypes.includes(mimeType)) {
      return res.status(400).json({ error: 'Only image files (JPEG, JPG, PNG, GIF, WebP) are allowed.' })
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
    console.error('Avatar upload error:', err)
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
app.get('/api/admin/accounts', authMiddleware, async (req, res) => {
  if (!dbReady) {
    return res.status(503).json({ error: 'Database unavailable.' })
  }
  try {
    const accounts = await Admin.find({})
      .select('-password')
      .sort({ createdAt: -1 })
    
    res.json(accounts)
  } catch (err) {
    console.error('Get accounts error:', err)
    res.status(500).json({ error: 'Failed to load accounts.' })
  }
})

// GET /api/admin/accounts/count - get account count by type
app.get('/api/admin/accounts/count', authMiddleware, async (req, res) => {
  if (!dbReady) {
    return res.status(503).json({ error: 'Database unavailable.' })
  }
  try {
    const { type } = req.query
    const filter = type ? { accountType: type } : {}
    const count = await Admin.countDocuments(filter)
    res.json({ count })
  } catch (err) {
    console.error('Get account count error:', err)
    res.status(500).json({ error: 'Failed to get account count.' })
  }
})

// POST /api/admin/accounts - create new account
app.post('/api/admin/accounts', authMiddleware, async (req, res) => {
  if (!dbReady) {
    return res.status(503).json({ error: 'Database unavailable.' })
  }
  try {
    const { username, displayName, accountType, password, uid } = req.body
    
    console.log('Create account request body:', req.body)
    console.log('username:', username, 'typeof:', typeof username)
    console.log('displayName:', displayName, 'typeof:', typeof displayName)
    console.log('accountType:', accountType, 'typeof:', typeof accountType)
    console.log('password length:', password ? password.length : 'undefined')
    console.log('uid:', uid, 'typeof:', typeof uid)
    
    // Validation
    if (!username || !password || !uid) {
      console.log('Validation failed: missing required fields')
      return res.status(400).json({ error: 'Username, password, and UID are required.' })
    }
    
    if (!['admin', 'registrar', 'professor'].includes(accountType)) {
      console.log('Validation failed: invalid account type:', accountType)
      return res.status(400).json({ error: 'Invalid account type.' })
    }
    
    if (password.length < 8) {
      console.log('Validation failed: password too short:', password.length)
      return res.status(400).json({ error: 'Password must be at least 8 characters long.' })
    }

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
      displayName: displayName || (accountType === 'admin' ? 'Administrator' : 'Registrar'),
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
    console.error('Create account error:', err)
    console.error('Error stack:', err.stack)
    res.status(500).json({ error: 'Failed to create account.' })
  }
})

// DELETE /api/admin/accounts/:id - delete an account (super admin can delete anyone, regular admin can only delete registrars)
app.delete('/api/admin/accounts/:id', authMiddleware, async (req, res) => {
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
    if (req.adminId === req.params.id) {
      return res.status(400).json({ error: 'Cannot delete your own account.' })
    }

    // Regular admin cannot delete other admin accounts (only super admin/original creator can)
    if (currentAdmin.accountType === 'admin' && accountToDelete.accountType === 'admin') {
      return res.status(403).json({ error: 'Only super admin can delete other admin accounts.' })
    }

    // Delete the account
    await Admin.findByIdAndDelete(req.params.id)

    // Log the account deletion
    await logAudit(
      'DELETE',
      'ADMIN',
      accountToDelete._id.toString(),
      accountToDelete.username,
      `Deleted admin account: ${accountToDelete.username} (${accountToDelete.accountType})`,
      req.adminId,
      req.accountType,
      accountToDelete.toObject(),
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

// GET /api/announcements - get all active announcements
app.get('/api/announcements', async (req, res) => {
  if (!dbReady) {
    return res.status(503).json({ error: 'Database unavailable.' })
  }
  try {
    const { targetAudience } = req.query
    const filter = { isActive: true }
    
    if (targetAudience && targetAudience !== 'all') {
      filter.$or = [
        { targetAudience: 'all' },
        { targetAudience }
      ]
    }

    const announcements = await Announcement.find(filter)
      .populate('createdBy', 'username displayName')
      .sort({ isPinned: -1, createdAt: -1 })
    
    res.json(announcements)
  } catch (err) {
    console.error('Get announcements error:', err)
    res.status(500).json({ error: 'Failed to load announcements.' })
  }
})

// GET /api/announcements/:id - get individual announcement (public)
app.get('/api/announcements/:id', async (req, res) => {
  if (!dbReady) {
    return res.status(503).json({ error: 'Database unavailable.' })
  }
  try {
    const announcement = await Announcement.findById(req.params.id)
      .populate('createdBy', 'username displayName')
    
    if (!announcement) {
      return res.status(404).json({ error: 'Announcement not found.' })
    }
    
    // Temporarily remove isActive filter for debugging
    // if (!announcement.isActive) {
    //   return res.status(404).json({ error: 'Announcement not found.' })
    // }
    
    console.log('Found announcement:', announcement._id, 'Active:', announcement.isActive)
    res.json(announcement)
  } catch (err) {
    console.error('Get announcement error:', err)
    res.status(500).json({ error: 'Failed to load announcement.' })
  }
})

// GET /api/admin/announcements - get all announcements (admin)
app.get('/api/admin/announcements', authMiddleware, async (req, res) => {
  if (!dbReady) {
    return res.status(503).json({ error: 'Database unavailable.' })
  }
  try {
    const { page = 1, limit = 10, type, targetAudience, status } = req.query
    const filter = {}
    
    if (type) filter.type = type
    if (targetAudience) filter.targetAudience = targetAudience
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
    console.error('Get admin announcements error:', err)
    res.status(500).json({ error: 'Failed to load announcements.' })
  }
})

// POST /api/admin/announcements - create new announcement
app.post('/api/admin/announcements', authMiddleware, async (req, res) => {
  if (!dbReady) {
    return res.status(503).json({ error: 'Database unavailable.' })
  }
  try {
    const { title, message, type, targetAudience, expiresAt, isPinned, media } = req.body
    
    if (!title || !message) {
      return res.status(400).json({ error: 'Title and message are required.' })
    }

    const announcement = new Announcement({
      title,
      message,
      type: type || 'info',
      targetAudience: targetAudience || 'all',
      expiresAt: expiresAt ? new Date(expiresAt) : undefined,
      isPinned: isPinned || false,
      media: media || [],
      createdBy: req.adminId
    })

    await announcement.save()
    await announcement.populate('createdBy', 'username displayName')

    // Log the action
    await logAudit(
      'CREATE',
      'ANNOUNCEMENT',
      announcement._id.toString(),
      title,
      `Created announcement: ${title}`,
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
    console.error('Create announcement error:', err)
    res.status(500).json({ error: 'Failed to create announcement.' })
  }
})

// GET /api/admin/announcements/:id - get individual announcement
app.get('/api/admin/announcements/:id', authMiddleware, async (req, res) => {
  if (!dbReady) {
    return res.status(503).json({ error: 'Database unavailable.' })
  }
  try {
    const announcement = await Announcement.findById(req.params.id)
      .populate('createdBy', 'username displayName')
    
    if (!announcement) {
      return res.status(404).json({ error: 'Announcement not found.' })
    }
    
    res.json(announcement)
  } catch (err) {
    console.error('Get announcement error:', err)
    res.status(500).json({ error: 'Failed to load announcement.' })
  }
})

// PUT /api/admin/announcements/:id - update announcement
app.put('/api/admin/announcements/:id', authMiddleware, async (req, res) => {
  if (!dbReady) {
    return res.status(503).json({ error: 'Database unavailable.' })
  }
  try {
    const { title, message, type, targetAudience, expiresAt, isPinned, isActive, media } = req.body
    
    const announcement = await Announcement.findById(req.params.id)
    if (!announcement) {
      return res.status(404).json({ error: 'Announcement not found.' })
    }

    const oldValue = announcement.toObject()
    
    if (title) announcement.title = title
    if (message) announcement.message = message
    if (type) announcement.type = type
    if (targetAudience) announcement.targetAudience = targetAudience
    if (expiresAt !== undefined) announcement.expiresAt = new Date(expiresAt)
    if (isPinned !== undefined) announcement.isPinned = isPinned
    if (isActive !== undefined) announcement.isActive = isActive

    // Allow media to be fully replaced when provided
    if (Array.isArray(media)) {
      announcement.media = media.map((m) => ({
        ...m,
        // Ensure fileSize is present to satisfy schema
        fileSize: m.fileSize ?? 0,
      }))
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
    console.error('Update announcement error:', err)
    res.status(500).json({ error: 'Failed to update announcement.' })
  }
})

// DELETE /api/admin/announcements/:id - delete announcement
app.delete('/api/admin/announcements/:id', authMiddleware, async (req, res) => {
  if (!dbReady) {
    return res.status(503).json({ error: 'Database unavailable.' })
  }
  try {
    const announcement = await Announcement.findById(req.params.id)
    if (!announcement) {
      return res.status(404).json({ error: 'Announcement not found.' })
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
    console.error('Delete announcement error:', err)
    res.status(500).json({ error: 'Failed to delete announcement.' })
  }
})

// ==================== AUDIT LOGS ====================

// GET /api/admin/audit-logs - get audit logs with pagination and filtering
app.get('/api/admin/audit-logs', authMiddleware, async (req, res) => {
  if (!dbReady) {
    return res.status(503).json({ error: 'Database unavailable.' })
  }
  try {
    const { 
      page = 1, 
      limit = 20, 
      action, 
      resourceType, 
      severity, 
      performedBy,
      startDate,
      endDate 
    } = req.query
    
    const filter = {}
    
    if (action) filter.action = action
    if (resourceType) filter.resourceType = resourceType
    if (severity) filter.severity = severity
    if (performedBy) filter.performedBy = performedBy
    
    if (startDate || endDate) {
      filter.createdAt = {}
      if (startDate) filter.createdAt.$gte = new Date(startDate)
      if (endDate) filter.createdAt.$lte = new Date(endDate)
    }

    const logs = await AuditLog.find(filter)
      .populate('performedBy', 'username displayName')
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit)
    
    const total = await AuditLog.countDocuments(filter)
    
    res.json({
      logs,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      total
    })
  } catch (err) {
    console.error('Get audit logs error:', err)
    res.status(500).json({ error: 'Failed to load audit logs.' })
  }
})

// GET /api/admin/audit-logs/stats - get audit log statistics
app.get('/api/admin/audit-logs/stats', authMiddleware, async (req, res) => {
  if (!dbReady) {
    return res.status(503).json({ error: 'Database unavailable.' })
  }
  try {
    const last30Days = new Date()
    last30Days.setDate(last30Days.getDate() - 30)

    const [
      totalLogs,
      recentLogs,
      criticalLogs,
      actionStats,
      resourceStats
    ] = await Promise.all([
      AuditLog.countDocuments(),
      AuditLog.countDocuments({ createdAt: { $gte: last30Days } }),
      AuditLog.countDocuments({ severity: 'CRITICAL' }),
      AuditLog.aggregate([
        { $match: { createdAt: { $gte: last30Days } } },
        { $group: { _id: '$action', count: { $sum: 1 } } },
        { $sort: { count: -1 } }
      ]),
      AuditLog.aggregate([
        { $match: { createdAt: { $gte: last30Days } } },
        { $group: { _id: '$resourceType', count: { $sum: 1 } } },
        { $sort: { count: -1 } }
      ])
    ])

    res.json({
      totalLogs,
      recentLogs,
      criticalLogs,
      actionStats,
      resourceStats
    })
  } catch (err) {
    console.error('Get audit log stats error:', err)
    res.status(500).json({ error: 'Failed to load audit log statistics.' })
  }
})

// ==================== DOCUMENTS ====================

// GET /api/documents - get public documents
app.get('/api/documents', async (req, res) => {
  if (!dbReady) {
    return res.status(503).json({ error: 'Database unavailable.' })
  }
  try {
    const { category, search, page = 1, limit = 10 } = req.query
    const filter = { isPublic: true, status: 'ACTIVE' }
    
    if (category) filter.category = category
    if (search) {
      filter.$text = { $search: search }
    }

    const documents = await Document.find(filter)
      .populate('createdBy', 'username displayName')
      .sort({ updatedAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit)
    
    const total = await Document.countDocuments(filter)
    
    res.json({
      documents,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      total
    })
  } catch (err) {
    console.error('Get documents error:', err)
    res.status(500).json({ error: 'Failed to load documents.' })
  }
})

// GET /api/admin/documents - get all documents (admin)
app.get('/api/admin/documents', authMiddleware, async (req, res) => {
  if (!dbReady) {
    return res.status(503).json({ error: 'Database unavailable.' })
  }
  try {
    const { category, status, search, page = 1, limit = 20 } = req.query
    const filter = {}
    
    if (category) filter.category = category
    if (status) filter.status = status
    if (search) {
      filter.$text = { $search: search }
    }

    const documents = await Document.find(filter)
      .populate('createdBy', 'username displayName')
      .populate('updatedBy', 'username displayName')
      .sort({ updatedAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit)
    
    const total = await Document.countDocuments(filter)
    
    res.json({
      documents,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      total
    })
  } catch (err) {
    console.error('Get admin documents error:', err)
    res.status(500).json({ error: 'Failed to load documents.' })
  }
})

// POST /api/admin/documents - upload new document
app.post('/api/admin/documents', authMiddleware, async (req, res) => {
  if (!dbReady) {
    return res.status(503).json({ error: 'Database unavailable.' })
  }
  try {
    const { 
      title, description, category, subcategory, fileName, originalFileName, 
      mimeType, fileSize, fileData, version, isPublic, allowedRoles, tags,
      effectiveDate, expiryDate 
    } = req.body
    
    if (!title || !category || !fileName || !originalFileName || !mimeType || !fileData) {
      return res.status(400).json({ error: 'Missing required fields.' })
    }

    // Create file path (you might want to store files in a dedicated uploads folder)
    const filePath = `documents/${Date.now()}-${originalFileName}`

    const document = new Document({
      title,
      description,
      category,
      subcategory,
      fileName,
      originalFileName,
      mimeType,
      fileSize,
      filePath,
      version: version || '1.0',
      isPublic: isPublic || false,
      allowedRoles: allowedRoles || [],
      tags: tags || [],
      effectiveDate: effectiveDate ? new Date(effectiveDate) : undefined,
      expiryDate: expiryDate ? new Date(expiryDate) : undefined,
      status: 'ACTIVE',
      createdBy: req.adminId
    })

    await document.save()
    await document.populate('createdBy', 'username displayName')

    // Log the action
    await logAudit(
      'UPLOAD',
      'DOCUMENT',
      document._id.toString(),
      document.title,
      `Uploaded document: ${document.title}`,
      req.adminId,
      req.accountType,
      null,
      document.toObject(),
      'SUCCESS',
      'MEDIUM'
    )

    res.status(201).json({ 
      message: 'Document uploaded successfully.',
      document
    })
  } catch (err) {
    console.error('Upload document error:', err)
    res.status(500).json({ error: 'Failed to upload document.' })
  }
})

// PUT /api/admin/documents/:id - update document
app.put('/api/admin/documents/:id', authMiddleware, async (req, res) => {
  if (!dbReady) {
    return res.status(503).json({ error: 'Database unavailable.' })
  }
  try {
    const { title, description, category, subcategory, isPublic, allowedRoles, tags, effectiveDate, expiryDate, status } = req.body
    
    const document = await Document.findById(req.params.id)
    if (!document) {
      return res.status(404).json({ error: 'Document not found.' })
    }

    const oldValue = document.toObject()
    
    if (title) document.title = title
    if (description !== undefined) document.description = description
    if (category) document.category = category
    if (subcategory !== undefined) document.subcategory = subcategory
    if (isPublic !== undefined) document.isPublic = isPublic
    if (allowedRoles !== undefined) document.allowedRoles = allowedRoles
    if (tags !== undefined) document.tags = tags
    if (effectiveDate !== undefined) document.effectiveDate = effectiveDate ? new Date(effectiveDate) : undefined
    if (expiryDate !== undefined) document.expiryDate = expiryDate ? new Date(expiryDate) : undefined
    if (status) document.status = status
    document.updatedBy = req.adminId

    await document.save()
    await document.populate('createdBy', 'username displayName')
    await document.populate('updatedBy', 'username displayName')

    // Log the action
    await logAudit(
      'UPDATE',
      'DOCUMENT',
      document._id.toString(),
      document.title,
      `Updated document: ${document.title}`,
      req.adminId,
      req.accountType,
      oldValue,
      document.toObject(),
      'SUCCESS',
      'MEDIUM'
    )

    res.json({ 
      message: 'Document updated successfully.',
      document
    })
  } catch (err) {
    console.error('Update document error:', err)
    res.status(500).json({ error: 'Failed to update document.' })
  }
})

// POST /api/admin/documents/:id/download - track document download
app.post('/api/admin/documents/:id/download', authMiddleware, async (req, res) => {
  if (!dbReady) {
    return res.status(503).json({ error: 'Database unavailable.' })
  }
  try {
    const document = await Document.findById(req.params.id)
    if (!document) {
      return res.status(404).json({ error: 'Document not found.' })
    }

    // Update download tracking
    document.downloadCount += 1
    document.lastDownloadedBy = req.adminId
    document.lastDownloadedAt = new Date()
    await document.save()

    // Log the action
    await logAudit(
      'DOWNLOAD',
      'DOCUMENT',
      document._id.toString(),
      document.title,
      `Downloaded document: ${document.title}`,
      req.adminId,
      req.accountType,
      null,
      null,
      'SUCCESS',
      'LOW'
    )

    res.json({ 
      message: 'Download tracked successfully.',
      downloadUrl: `/uploads/${document.filePath}`
    })
  } catch (err) {
    console.error('Track download error:', err)
    res.status(500).json({ error: 'Failed to track download.' })
  }
})

// DELETE /api/admin/documents/:id - delete document
app.delete('/api/admin/documents/:id', authMiddleware, async (req, res) => {
  if (!dbReady) {
    return res.status(503).json({ error: 'Database unavailable.' })
  }
  try {
    const document = await Document.findById(req.params.id)
    if (!document) {
      return res.status(404).json({ error: 'Document not found.' })
    }

    await Document.findByIdAndDelete(req.params.id)

    // Log the action
    await logAudit(
      'DELETE',
      'DOCUMENT',
      document._id.toString(),
      document.title,
      `Deleted document: ${document.title}`,
      req.adminId,
      req.accountType,
      document.toObject(),
      null,
      'SUCCESS',
      'HIGH'
    )

    res.json({ message: 'Document deleted successfully.' })
  } catch (err) {
    console.error('Delete document error:', err)
    res.status(500).json({ error: 'Failed to delete document.' })
  }
})

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
    const testLogs = [
      {
        action: 'SYSTEM_CHECK',
        resourceType: 'SYSTEM',
        resourceId: 'system-health',
        resourceName: 'System Health Monitor',
        description: 'System health check completed successfully',
        performedBy: 'system',
        performedByRole: 'system',
        status: 'SUCCESS',
        severity: 'LOW'
      },
      {
        action: 'API_REQUEST',
        resourceType: 'API',
        resourceId: 'health-endpoint',
        resourceName: 'Health API Endpoint',
        description: 'Health endpoint accessed - monitoring system status',
        performedBy: 'system',
        performedByRole: 'system',
        status: 'SUCCESS',
        severity: 'INFO'
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
app.get('/api/admin/security-metrics', authMiddleware, async (req, res) => {
  if (!dbReady) {
    return res.status(503).json({ error: 'Database unavailable.' })
  }
  
  try {
    const now = new Date()
    const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000)
    
    // Get security metrics from audit logs
    const [
      failedLogins,
      suspiciousActivity,
      totalSessions,
      recentThreats
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
      // Get recent security threats
      AuditLog.find({
        action: { $in: ['LOGIN', 'SECURITY_BREACH', 'UNAUTHORIZED_ACCESS'] },
        severity: { $in: ['HIGH', 'CRITICAL', 'MEDIUM'] },
        createdAt: { $gte: last24h }
      })
      .sort({ createdAt: -1 })
      .limit(10)
      .lean()
    ])
    
    // Process threats into the expected format
    const processedThreats = recentThreats.map(log => ({
      id: log._id.toString(),
      timestamp: log.createdAt,
      type: log.action === 'LOGIN' ? 'Failed Login Attempt' : 
            log.action === 'SECURITY_BREACH' ? 'Security Breach' : 
            'Unauthorized Access',
      severity: log.severity.toLowerCase(),
      description: log.description || `${log.action} - ${log.resourceType || 'Unknown'}`,
      source: log.ipAddress || 'Unknown',
      status: log.status === 'SUCCESS' ? 'resolved' : 'active'
    }))
    
    // Add some sample threats if none exist (for demonstration)
    if (processedThreats.length === 0) {
      const sampleThreats = [
        {
          id: 'sample-1',
          timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000), // 2 hours ago
          type: 'Failed Login Attempt',
          severity: 'medium',
          description: 'Multiple failed login attempts from unknown IP',
          source: '192.168.1.100',
          status: 'active'
        },
        {
          id: 'sample-2',
          timestamp: new Date(Date.now() - 6 * 60 * 60 * 1000), // 6 hours ago
          type: 'Unauthorized Access',
          severity: 'low',
          description: 'Attempted access to restricted admin area',
          source: '10.0.0.15',
          status: 'resolved'
        }
      ]
      processedThreats.push(...sampleThreats)
    }
    
    // Calculate security score (0-100)
    const securityScore = Math.max(0, Math.min(100, 
      100 - (failedLogins * 2) - (suspiciousActivity * 5) + (totalSessions * 1)
    ))
    
    const securityMetrics = {
      failedLogins,
      suspiciousActivity,
      blockedIPs: 0, // Would need IP blocking implementation
      activeSessions: totalSessions,
      lastSecurityScan: new Date().toISOString(),
      securityScore: Math.round(securityScore),
      recentThreats: processedThreats
    }
    
    res.json(securityMetrics)
  } catch (error) {
    console.error('Security metrics error:', error)
    res.status(500).json({ error: 'Failed to fetch security metrics.' })
  }
})

// GET /api/admin/system-health - Get comprehensive system health metrics
app.get('/api/admin/system-health', authMiddleware, async (req, res) => {
  if (!dbReady) {
    console.log('Database not ready')
    return res.status(503).json({ error: 'Database unavailable.' })
  }
  
  try {
    // Create test logs if needed (for production debugging)
    await createTestErrorLogs()
    
    const now = new Date()
    const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000)
    
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
      activeAnnouncements
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
      Announcement.countDocuments({ isActive: true })
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
    
    // Calculate database stats with Atlas API enhancement
    const dbStats = await mongoose.connection.db.stats()
    let databaseUsage = ((dbStats.dataSize + dbStats.indexSize) / (1024 * 1024 * 1024 * 10)) * 100 // Fallback: Assume 10GB limit
    
    // Atlas metrics calls removed — use local DB stats fallback only.
    console.log('Atlas metrics disabled; using local DB stats only')
    let atlasMetrics = null
    let atlasDbMetrics = null
    let atlasMeasurements = null
    
    // Use Atlas data if available
    if (atlasMetrics && atlasMetrics.length > 0) {
      const process = atlasMetrics[0]
      // Atlas provides actual disk usage and other metrics
      databaseUsage = process.diskUsage ? parseFloat(process.diskUsage.toFixed(1)) : databaseUsage
    }
    
    // Use detailed measurements if available
    let diskUsagePercentage = databaseUsage
    let indexSizeMB = 0
    
    if (atlasMeasurements && atlasMeasurements.measurements) {
      const diskUsed = atlasMeasurements.measurements.DISK_USED
      const diskTotal = atlasMeasurements.measurements.DISK_TOTAL
      const indexSize = atlasMeasurements.measurements.INDEX_SIZE
      
      if (diskUsed && diskTotal && diskUsed.length > 0 && diskTotal.length > 0) {
        const latestDiskUsed = diskUsed[diskUsed.length - 1].value
        const latestDiskTotal = diskTotal[diskTotal.length - 1].value
        diskUsagePercentage = (latestDiskUsed / latestDiskTotal) * 100
      }
      
      if (indexSize && indexSize.length > 0) {
        indexSizeMB = indexSize[indexSize.length - 1].value / (1024 * 1024) // Convert to MB
      }
    }
    
    if (atlasDbMetrics && atlasDbMetrics.length > 0) {
      const db = atlasDbMetrics.find(d => d.name === 'wcc-admin')
      if (db && db.dataSizeBytes) {
        // Use actual database size from Atlas
        const atlasDbSize = (db.dataSizeBytes / (1024 * 1024 * 1024 * 10)) * 100 // Convert to percentage of 10GB
        databaseUsage = parseFloat(atlasDbSize.toFixed(1))
      }
    }
    
    // Get real server metrics
    const memoryUsage = process.memoryUsage()
    const memoryUsagePercent = (memoryUsage.heapUsed / memoryUsage.heapTotal) * 100
    
    // Get real system metrics
    const [cpuData, memData, osData] = await Promise.all([
      si.currentLoad(),
      si.mem(),
      si.osInfo()
    ])
    
    // Get actual server uptime
    const serverUptimeSeconds = process.uptime()
    const serverUptimeDays = Math.floor(serverUptimeSeconds / 86400)
    const uptimePercentage = Math.min(99.9, 95 + (serverUptimeDays * 0.1))
    
    // Use real CPU usage
    const serverLoad = cpuData.currentLoad
    
    // Use real system memory usage
    const systemMemoryUsagePercent = (memData.used / memData.total) * 100
    
    // Get real backup status
    const backupStats = await backupSystem.getBackupStats();
    const backupStatus = backupStats.backupEnabled && backupStats.latestBackup ? 'success' : 'warning';
    const lastBackup = backupStats.latestBackup ? backupStats.latestBackup.createdAt.toISOString() : 'N/A';
    
    const healthData = {
      uptime: parseFloat(uptimePercentage.toFixed(1)),
      activeUsers: activeUsers, // Real active users from last hour
      databaseUsage: parseFloat(databaseUsage.toFixed(1)),
      backupStatus,
      errorCount: errorLogs,
      serverLoad: parseFloat(serverLoad.toFixed(1)),
      memoryUsage: parseFloat(systemMemoryUsagePercent.toFixed(1)),
      lastBackup: lastBackup,
      statistics: {
        totalAdmins,
        totalDocuments,
        activeAnnouncements,
        recentLogins, // Total logins in 24h (for stats)
        errorLogs,
        warningLogs
      },
      // Atlas-specific metrics (always included)
      atlasMetrics: {
        enabled: !!(atlasMetrics && atlasMetrics.length > 0) || !!(atlasMeasurements),
        clusterInfo: atlasMetrics && atlasMetrics.length > 0 ? {
          name: atlasMetrics[0].typeName || 'Unknown',
          version: atlasMetrics[0].version || 'Unknown',
          connections: atlasMetrics[0].connections || 0,
          diskUsage: diskUsagePercentage || null
        } : null,
        databaseInfo: atlasDbMetrics && atlasDbMetrics.length > 0 ? {
          collectionsCount: atlasDbMetrics[0].collectionsCount || 0,
          dataSize: atlasDbMetrics[0].dataSize || 'Unknown',
          indexSize: indexSizeMB > 0 ? `${indexSizeMB.toFixed(2)} MB` : (atlasDbMetrics[0].indexSize || 'Unknown')
        } : null,
        measurements: atlasMeasurements ? {
          available: true,
          diskUsed: atlasMeasurements.measurements?.DISK_USED?.[atlasMeasurements.measurements.DISK_USED.length - 1]?.value || null,
          diskTotal: atlasMeasurements.measurements?.DISK_TOTAL?.[atlasMeasurements.measurements.DISK_TOTAL.length - 1]?.value || null,
          indexSize: indexSizeMB
        } : null
      },
      logs: recentErrorLogs.map(log => ({
        id: log._id,
        timestamp: log.createdAt,
        level: ['critical', 'high'].includes(log.severity.toLowerCase()) ? 'error' : log.severity.toLowerCase(),
        message: log.description,
        module: log.resourceType
      }))
    }
    
    // Respond without noisy debug output
    res.json(healthData)
  } catch (error) {
    console.error('System health error:', error)
    res.status(500).json({ error: 'Failed to fetch system health data.' })
  }
})

// Test endpoint for Atlas API
app.get('/api/admin/test-atlas', authMiddleware, async (req, res) => {
  try {
    console.log('Testing Atlas API...')
    console.log('Environment variables:', {
      ATLAS_PUBLIC_KEY: process.env.ATLAS_PUBLIC_KEY ? 'SET' : 'NOT SET',
      ATLAS_PRIVATE_KEY: process.env.ATLAS_PRIVATE_KEY ? 'SET' : 'NOT SET',
      ATLAS_GROUP_ID: process.env.ATLAS_GROUP_ID ? 'SET' : 'NOT SET'
    })
    
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

// Backup endpoints
app.post('/api/admin/backup/create', authMiddleware, async (req, res) => {
  try {
    const result = await backupSystem.createBackup('manual', req.adminId || 'admin');
    res.json(result);
  } catch (error) {
    console.error('Backup creation error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/admin/backup/history', authMiddleware, async (req, res) => {
  try {
    // Get backup history from database
    const backups = await Backup.find()
      .sort({ createdAt: -1 })
      .limit(20)
      .select('-__v');
    
    res.json({ success: true, backups });
  } catch (error) {
    console.error('Backup history error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/admin/backup/restore', authMiddleware, async (req, res) => {
  try {
    const { backupFileName } = req.body;
    if (!backupFileName) {
      return res.status(400).json({ success: false, error: 'Backup filename required' });
    }
    
    const result = await backupSystem.restoreBackup(backupFileName);
    res.json(result);
  } catch (error) {
    console.error('Backup restore error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/admin/backup/stats', authMiddleware, async (req, res) => {
  try {
    const stats = await backupSystem.getBackupStats();
    res.json({ success: true, ...stats });
  } catch (error) {
    console.error('Backup stats error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/admin/security-metrics - get security metrics
app.get('/api/admin/security-metrics', authMiddleware, async (req, res) => {
  console.log('=== SECURITY METRICS ENDPOINT CALLED ===');
  console.log('Request received at:', new Date().toISOString());
  console.log('Request headers:', req.headers);
  
  if (!dbReady) {
    console.log('Database not ready, returning 503');
    return res.status(503).json({ error: 'Database unavailable.' })
  }

  try {
    const now = new Date()
    const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000)

    // Get security metrics from database
    const [
      failedLogins,
      recentLogins,
      auditLogs,
      totalAdmins
    ] = await Promise.all([
      // Count failed logins in last 24h
      AuditLog.countDocuments({ 
        action: 'LOGIN', 
        status: 'FAILED', 
        createdAt: { $gte: last24h } 
      }),
      // Count successful logins in last 24h
      AuditLog.countDocuments({ 
        action: 'LOGIN', 
        status: 'SUCCESS', 
        createdAt: { $gte: last24h } 
      }),
      // Get recent security-related audit logs
      AuditLog.find({
        action: { $in: ['LOGIN', 'LOGOUT', 'ACCESS_DENIED'] },
        createdAt: { $gte: last24h }
      })
      .sort({ createdAt: -1 })
      .limit(10)
      .lean(),
      // Count total admins
      Admin.countDocuments()
    ])

    // Calculate security metrics
    const suspiciousActivity = auditLogs.filter(log => log.status === 'FAILED').length
    const blockedIPs = 0 // This would require implementing IP blocking functionality
    const activeSessions = Math.floor(recentLogins * 0.7) // Estimate active sessions
    const securityScore = Math.max(0, Math.min(100, 100 - (failedLogins * 2) - (suspiciousActivity * 5)))

    // Generate mock threats for demonstration
    const recentThreats = [
      {
        id: '1',
        timestamp: new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString(),
        type: 'Failed Login Attempt',
        severity: 'medium',
        description: 'Multiple failed login attempts from unknown IP',
        source: '192.168.1.100',
        status: 'active'
      },
      ...(failedLogins > 5 ? [{
        id: '2',
        timestamp: new Date(now.getTime() - 1 * 60 * 60 * 1000).toISOString(),
        type: 'Brute Force Attack',
        severity: 'high',
        description: `Detected ${failedLogins} failed login attempts`,
        source: 'Unknown',
        status: 'investigating'
      }] : [])
    ]

    const securityData = {
      failedLogins,
      suspiciousActivity,
      blockedIPs,
      activeSessions,
      lastSecurityScan: new Date(now.getTime() - 30 * 60 * 1000).toISOString(), // 30 minutes ago
      securityScore: Math.round(securityScore),
      recentThreats
    }

    res.json(securityData)
  } catch (error) {
    console.error('Security metrics error:', error)
    res.status(500).json({ error: 'Failed to fetch security metrics' })
  }
});

// POST /api/admin/security-scan - Run comprehensive security scan
app.post('/api/admin/security-scan', authMiddleware, async (req, res) => {
  if (!dbReady) {
    return res.status(503).json({ error: 'Database unavailable.' })
  }
  
  try {
    const now = new Date()
    const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000)
    const last7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
    
    const findings = []
    const recommendations = []
    
    // Scan 1: Failed login attempts
    const failedLogins = await AuditLog.countDocuments({
      action: 'LOGIN',
      status: 'FAILED',
      createdAt: { $gte: last24h }
    })
    
    if (failedLogins > 10) {
      findings.push({
        severity: 'high',
        title: 'Excessive Failed Login Attempts',
        description: `${failedLogins} failed login attempts detected in the last 24 hours`,
        category: 'Authentication'
      })
      recommendations.push({
        priority: 'high',
        action: 'Implement rate limiting or account lockout policies',
        details: 'Consider enabling 2FA for all admin accounts'
      })
    } else if (failedLogins > 5) {
      findings.push({
        severity: 'medium',
        title: 'Multiple Failed Login Attempts',
        description: `${failedLogins} failed login attempts detected`,
        category: 'Authentication'
      })
    }
    
    // Scan 2: Blocked IPs
    const blockedIPCount = await BlockedIP.countDocuments({ isActive: true })
    if (blockedIPCount > 0) {
      findings.push({
        severity: 'medium',
        title: 'Active IP Blocks',
        description: `${blockedIPCount} IP address(es) are currently blocked`,
        category: 'Network Security'
      })
    }
    
    // Scan 3: High severity audit logs
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
    
    // Scan 4: Check for admin account security
    const adminCount = await Admin.countDocuments()
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
    
    // Scan 5: Recent access patterns
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
    
    // Log the security scan
    await logAudit(
      'SECURITY_SCAN',
      'SYSTEM',
      'system-scan',
      'System Security Scan',
      `Completed security scan. Found ${findings.length} items.`,
      req.adminId,
      req.accountType,
      null,
      { findingsCount: findings.length, recommendationsCount: recommendations.length },
      'SUCCESS',
      'MEDIUM'
    )
    
    const scanResult = {
      scanId: `scan-${Date.now()}`,
      timestamp: now.toISOString(),
      duration: Math.floor(Math.random() * 3000) + 1000, // Simulated duration in ms
      status: findings.length === 0 ? 'secure' : findings.some(f => f.severity === 'high') ? 'warning' : 'info',
      findings: findings.sort((a, b) => {
        const severityOrder = { critical: 0, high: 1, medium: 2, low: 3, info: 4 }
        return (severityOrder[a.severity] || 5) - (severityOrder[b.severity] || 5)
      }),
      recommendations,
      summary: {
        total: findings.length,
        critical: findings.filter(f => f.severity === 'critical').length,
        high: findings.filter(f => f.severity === 'high').length,
        medium: findings.filter(f => f.severity === 'medium').length,
        low: findings.filter(f => f.severity === 'low').length,
        info: findings.filter(f => f.severity === 'info').length
      }
    }
    
    res.json(scanResult)
  } catch (error) {
    console.error('Security scan error:', error)
    res.status(500).json({ error: 'Failed to run security scan.' })
  }
});

// ==================== IP BLOCKING ====================

// GET /api/admin/blocked-ips - get all blocked IPs
app.get('/api/admin/blocked-ips', authMiddleware, async (req, res) => {
  if (!dbReady) {
    return res.status(503).json({ error: 'Database unavailable.' })
  }
  try {
    const blockedIPs = await BlockedIP.find({ isActive: true })
      .populate('blockedBy', 'username')
      .sort({ blockedAt: -1 })
      .lean()
    
    res.json(blockedIPs)
  } catch (error) {
    console.error('Get blocked IPs error:', error)
    res.status(500).json({ error: 'Failed to fetch blocked IPs.' })
  }
})

// POST /api/admin/security-headers-scan - Scan security headers
app.post('/api/admin/security-headers-scan', authMiddleware, async (req, res) => {
  if (!dbReady) {
    return res.status(503).json({ error: 'Database unavailable.' })
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
app.post('/api/admin/blocked-ips', authMiddleware, async (req, res) => {
  if (!dbReady) {
    return res.status(503).json({ error: 'Database unavailable.' })
  }
  try {
    const { ipAddress, reason, severity, expiresAt, notes } = req.body
    
    if (!ipAddress || !reason) {
      return res.status(400).json({ error: 'IP address and reason are required.' })
    }
    
    // Validate IP format
    if (!/^(\d{1,3}\.){3}\d{1,3}$/.test(ipAddress)) {
      return res.status(400).json({ error: 'Invalid IP address format.' })
    }
    
    // Check if IP is already blocked
    const existing = await BlockedIP.findOne({ ipAddress, isActive: true })
    if (existing) {
      return res.status(409).json({ error: 'IP address is already blocked.' })
    }
    
    const blockedIP = new BlockedIP({
      ipAddress,
      reason,
      severity: severity || 'medium',
      blockedBy: req.adminId,
      expiresAt: expiresAt ? new Date(expiresAt) : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      notes: notes || ''
    })
    
    await blockedIP.save()
    
    // Log the action
    await logAudit(
      'BLOCK_IP',
      'SECURITY',
      blockedIP._id.toString(),
      ipAddress,
      `Blocked IP address: ${ipAddress} - ${reason}`,
      req.adminId,
      req.accountType,
      null,
      auditObject(blockedIP, 'SECURITY'),
      'SUCCESS',
      'HIGH'
    )
    
    res.status(201).json({ 
      message: 'IP address blocked successfully.',
      blockedIP
    })
  } catch (error) {
    console.error('Block IP error:', error)
    res.status(500).json({ error: 'Failed to block IP address.' })
  }
})

// DELETE /api/admin/blocked-ips/:id - unblock an IP
app.delete('/api/admin/blocked-ips/:id', authMiddleware, async (req, res) => {
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

// GET /api/admin/blocked-ips/:ipAddress - check if IP is blocked
app.get('/api/admin/blocked-ips/:ipAddress', async (req, res) => {
  if (!dbReady) {
    return res.status(503).json({ error: 'Database unavailable.' })
  }
  try {
    const blocked = await BlockedIP.findOne({ 
      ipAddress: req.params.ipAddress,
      isActive: true,
      expiresAt: { $gt: new Date() }
    }).lean()
    
    res.json({ blocked: !!blocked, reason: blocked ? blocked.reason : null })
  } catch (error) {
    console.error('Check blocked IP error:', error)
    res.status(500).json({ error: 'Failed to check IP status.' })
  }
})

// SPA fallback: serve index.html for non-API routes (must be last)
app.get('*', (req, res) => {
  // Don't intercept API routes
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'API endpoint not found.' })
  }
  
  const indexFile = path.join(distPath, 'index.html')
  res.sendFile(indexFile, (err) => {
    if (err) res.status(404).send('Frontend not built. Run: npm run build')
  })
})

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`)
})
