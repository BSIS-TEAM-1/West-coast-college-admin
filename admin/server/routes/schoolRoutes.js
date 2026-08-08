const express = require('express')
const rateLimit = require('express-rate-limit')
const School = require('../models/School')

const router = express.Router()

const schoolSearchLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 120,
  message: 'Too many school search requests from this IP, please try again later.'
})

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

router.get('/search', schoolSearchLimiter, async (req, res) => {
  try {
    const { q, region, division, municipality, limit = 10 } = req.query

    if (!q || typeof q !== 'string' || q.trim().length < 2) {
      return res.json({ schools: [] })
    }

    const searchLimit = Math.min(parseInt(limit, 10) || 10, 50)
    const term = q.trim()
    // Anchored prefix regex uses the name index
    const query = { name: { $regex: '^' + escapeRegex(term), $options: 'i' } }

    if (region) query.region = { $regex: '^' + escapeRegex(region.trim()), $options: 'i' }
    if (division) query.division = { $regex: '^' + escapeRegex(division.trim()), $options: 'i' }
    if (municipality) query.municipality = { $regex: '^' + escapeRegex(municipality.trim()), $options: 'i' }

    const schools = await School.find(query)
      .select('name region division municipality district barangay sector')
      .limit(searchLimit)
      .lean()

    res.json({ schools })
  } catch (err) {
    console.error('School search error:', err)
    res.status(500).json({ error: 'Failed to search schools' })
  }
})

module.exports = router
