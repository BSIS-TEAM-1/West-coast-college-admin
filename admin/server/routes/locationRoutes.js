const express = require('express')
const rateLimit = require('express-rate-limit')
const Region = require('../models/Region')
const Province = require('../models/Province')
const City = require('../models/City')
const Barangay = require('../models/Barangay')

const router = express.Router()

const locationLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 300,
  message: 'Too many location requests from this IP, please try again later.'
})

function normalizeQuery(q) {
  return q ? q.trim() : ''
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

router.get('/regions', locationLimiter, async (req, res) => {
  try {
    const { q, limit = 50, page = 1 } = req.query
    const query = {}
    if (q) {
      query.name = { $regex: '^' + escapeRegex(q.trim()), $options: 'i' }
    }
    const skip = (Math.max(parseInt(page, 10), 1) - 1) * parseInt(limit, 10)
    const [regions, total] = await Promise.all([
      Region.find(query)
        .select('code name')
        .sort({ name: 1 })
        .skip(skip)
        .limit(Math.min(parseInt(limit, 10) || 50, 100))
        .lean(),
      Region.countDocuments(query)
    ])
    res.json({ data: regions, total })
  } catch (err) {
    console.error('Regions error:', err)
    res.status(500).json({ error: 'Failed to fetch regions' })
  }
})

router.get('/provinces', locationLimiter, async (req, res) => {
  try {
    const { region, q, limit = 100, page = 1 } = req.query
    const query = {}
    if (region) query.regionCode = region.trim()
    if (q) query.name = { $regex: '^' + escapeRegex(q.trim()), $options: 'i' }
    const skip = (Math.max(parseInt(page, 10), 1) - 1) * parseInt(limit, 10)
    const [provinces, total] = await Promise.all([
      Province.find(query)
        .select('code regionCode name')
        .sort({ name: 1 })
        .skip(skip)
        .limit(Math.min(parseInt(limit, 10) || 100, 1000))
        .lean(),
      Province.countDocuments(query)
    ])
    res.json({ data: provinces, total })
  } catch (err) {
    console.error('Provinces error:', err)
    res.status(500).json({ error: 'Failed to fetch provinces' })
  }
})

router.get('/cities', locationLimiter, async (req, res) => {
  try {
    const { province, q, limit = 100, page = 1 } = req.query
    const query = {}
    if (province) query.provinceCode = province.trim()
    if (q) query.name = { $regex: '^' + escapeRegex(q.trim()), $options: 'i' }
    const skip = (Math.max(parseInt(page, 10), 1) - 1) * parseInt(limit, 10)
    const [cities, total] = await Promise.all([
      City.find(query)
        .select('code provinceCode name type zipCode')
        .sort({ name: 1 })
        .skip(skip)
        .limit(Math.min(parseInt(limit, 10) || 100, 1000))
        .lean(),
      City.countDocuments(query)
    ])
    res.json({ data: cities, total })
  } catch (err) {
    console.error('Cities error:', err)
    res.status(500).json({ error: 'Failed to fetch cities' })
  }
})

router.get('/barangays', locationLimiter, async (req, res) => {
  try {
    const { city, q, limit = 100, page = 1 } = req.query
    const query = {}
    if (city) query.cityCode = city.trim()
    if (q) query.name = { $regex: '^' + escapeRegex(q.trim()), $options: 'i' }
    const skip = (Math.max(parseInt(page, 10), 1) - 1) * parseInt(limit, 10)
    const [barangays, total] = await Promise.all([
      Barangay.find(query)
        .select('code cityCode name status')
        .sort({ name: 1 })
        .skip(skip)
        .limit(Math.min(parseInt(limit, 10) || 100, 1000))
        .lean(),
      Barangay.countDocuments(query)
    ])
    res.json({ data: barangays, total })
  } catch (err) {
    console.error('Barangays error:', err)
    res.status(500).json({ error: 'Failed to fetch barangays' })
  }
})

module.exports = router
