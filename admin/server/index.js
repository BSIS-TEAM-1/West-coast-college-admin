const path = require('path')
require('dotenv').config({ path: path.join(__dirname, '..', '.env') })

const express = require('express')
const cors = require('cors')
const mongoose = require('mongoose')
const jwt = require('jsonwebtoken')
const Admin = require('./models/Admin')

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

const uri = process.env.MONGODB_URI
if (!uri) {
  console.error('Missing MONGODB_URI in .env')
  process.exit(1)
}

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
    
    res.json({ message: `Account "${accountToDelete.username}" deleted successfully.` })
  } catch (err) {
    console.error('Delete account error:', err)
    res.status(500).json({ error: 'Failed to delete account.' })
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
