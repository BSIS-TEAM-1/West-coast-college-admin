const path = require('path')
require('dotenv').config({ path: path.join(__dirname, '..', '.env') })

const express = require('express')
const cors = require('cors')
const mongoose = require('mongoose')
const jwt = require('jsonwebtoken')
const Admin = require('./models/Admin')
const Announcement = require('./models/Announcement')
const AuditLog = require('./models/AuditLog')
const Document = require('./models/Document')

const app = express()
const PORT = process.env.PORT || 3001
const JWT_SECRET = process.env.JWT_SECRET || 'wcc-admin-dev-secret-change-in-production'

// Increase payload limit for base64 images
app.use(express.json({ limit: '10mb' }))
app.use(cors({ origin: true, credentials: true }))

// Serve uploaded files
app.use('/uploads', express.static(path.join(__dirname, 'uploads')))

// Serve frontend static files
const distPath = path.join(__dirname, '..', 'dist')
app.use(express.static(distPath))

function authMiddleware(req, res, next) {
  const auth = req.headers.authorization
  const token = auth && auth.startsWith('Bearer ') ? auth.slice(7) : null
  if (!token) {
    return res.status(401).json({ error: 'Unauthorized.' })
  }
  try {
    const payload = jwt.verify(token, JWT_SECRET)
    req.adminId = payload.id
    req.username = payload.username
    req.accountType = payload.accountType
    next()
  } catch {
    return res.status(401).json({ error: 'Unauthorized.' })
  }
}

// Audit logging helper function
async function logAudit(action, resourceType, resourceId, resourceName, description, performedBy, performedByRole, oldValue = null, newValue = null, status = 'SUCCESS', severity = 'LOW') {
  try {
    await AuditLog.create({
      action,
      resourceType,
      resourceId,
      resourceName,
      description,
      performedBy,
      performedByRole,
      ipAddress: null, // Could be extracted from req.ip
      userAgent: null, // Could be extracted from req.get('User-Agent')
      oldValue,
      newValue,
      status,
      severity
    })
  } catch (error) {
    console.error('Failed to create audit log:', error)
  }
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
      return res.status(401).json({ error: 'Invalid username or password.' })
    }

    const match = await admin.comparePassword(password)
    if (!match) {
      return res.status(401).json({ error: 'Invalid username or password.' })
    }

    // Allow registrar login but include account type in response for routing
    console.log('Login - admin.accountType:', admin.accountType, 'typeof:', typeof admin.accountType)
    const token = jwt.sign(
      { id: admin._id.toString(), username: admin.username, accountType: admin.accountType },
      JWT_SECRET,
      { expiresIn: '7d' }
    )
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
      'LOW'
    )

    res.json(loginResponse)
  } catch (err) {
    console.error('Login error:', err)
    res.status(500).json({ error: 'Login failed.' })
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
    
    // Validation
    if (!username || !password || !uid) {
      return res.status(400).json({ error: 'Username, password, and UID are required.' })
    }
    
    if (!['admin', 'registrar'].includes(accountType)) {
      return res.status(400).json({ error: 'Invalid account type.' })
    }
    
    if (password.length < 8) {
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
