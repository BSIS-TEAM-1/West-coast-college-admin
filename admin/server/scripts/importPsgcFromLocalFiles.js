const path = require('path')
const fs = require('fs')
const axios = require('axios')
const mongoose = require('mongoose')

const Region = require('../models/Region')
const Province = require('../models/Province')
const City = require('../models/City')
const Barangay = require('../models/Barangay')

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://WestCoastCollegeAdmin:WCC26@cluster0.sm99qsu.mongodb.net/wcc-admin?retryWrites=true&w=majority'

const PUBLIC_DIR = path.resolve(__dirname, '../../public')
const BASE = 'https://psgc.cloud/api'

function loadJsonFile(filename) {
  const filePath = path.join(PUBLIC_DIR, filename)
  if (!fs.existsSync(filePath) || fs.statSync(filePath).size < 5) {
    return null
  }
  const buf = fs.readFileSync(filePath)
  let raw
  if (buf.length >= 2 && buf[0] === 0xFF && buf[1] === 0xFE) {
    raw = buf.toString('utf16le')
  } else if (buf.length >= 2 && buf[0] === 0xFE && buf[1] === 0xFF) {
    raw = buf.toString('utf16be')
  } else {
    raw = buf.toString('utf-8')
  }
  if (raw.charCodeAt(0) === 0xFEFF) {
    raw = raw.slice(1)
  }
  raw = raw.trim()
  if (!raw) return null
  const parsed = JSON.parse(raw)
  const list = Array.isArray(parsed) ? parsed : (parsed.value || parsed.data || null)
  if (!Array.isArray(list) || list.length === 0) return null
  return list
}

async function fetchJsonList(url) {
  const { data } = await axios.get(url, { timeout: 30000 })
  if (Array.isArray(data)) return data
  if (Array.isArray(data.data)) return data.data
  throw new Error(`Unexpected response from ${url}`)
}

function bulkUpsert(model, docs, idField = 'code') {
  const ops = docs.map(doc => ({
    updateOne: {
      filter: { [idField]: doc[idField] },
      update: { $set: doc },
      upsert: true
    }
  }))
  if (ops.length === 0) return Promise.resolve()
  return model.bulkWrite(ops)
}

function regionCodeFrom(code) {
  return code ? code.slice(0, 2) + '00000000' : ''
}

function provinceCodeFrom(code) {
  return code ? code.slice(0, 6) + '0000' : ''
}

function cityCodeFrom(code) {
  return code ? code.slice(0, 7) + '000' : ''
}

async function importPsgcFromLocalFiles() {
  await mongoose.connect(MONGODB_URI)
  console.log('Connected to MongoDB')

  const regions = loadJsonFile('regions.json')
  const provinces = loadJsonFile('provinces.json')

  if (!regions) {
    console.log('Fetching regions from API...')
    const fetched = await fetchJsonList(`${BASE}/regions`)
    if (fetched && fetched.length > 0) {
      fs.writeFileSync(path.join(PUBLIC_DIR, 'regions.json'), JSON.stringify(fetched, null, 2))
    }
    const regionDocs = fetched.map(r => ({ code: r.code, name: (r.name || '').trim() }))
    await bulkUpsert(Region, regionDocs)
    console.log(`Imported/updated ${regionDocs.length} regions`)
  } else {
    const regionDocs = regions.map(r => ({ code: r.code, name: (r.name || '').trim() }))
    await bulkUpsert(Region, regionDocs)
    console.log(`Imported/updated ${regionDocs.length} regions from local file`)
  }

  if (!provinces) {
    console.log('Fetching provinces from API...')
    const fetched = await fetchJsonList(`${BASE}/provinces`)
    if (fetched && fetched.length > 0) {
      fs.writeFileSync(path.join(PUBLIC_DIR, 'provinces.json'), JSON.stringify(fetched, null, 2))
    }
    const provinceDocs = fetched.map(p => ({
      code: p.code,
      regionCode: p.region_code || p.regionCode || regionCodeFrom(p.code),
      name: (p.name || '').trim()
    }))
    await bulkUpsert(Province, provinceDocs)
    console.log(`Imported/updated ${provinceDocs.length} provinces`)
  } else {
    const provinceDocs = provinces.map(p => ({
      code: p.code,
      regionCode: p.region_code || p.regionCode || regionCodeFrom(p.code),
      name: (p.name || '').trim()
    }))
    await bulkUpsert(Province, provinceDocs)
    console.log(`Imported/updated ${provinceDocs.length} provinces from local file`)
  }

  const cities = loadJsonFile('cities.json') || []
  const municipalities = loadJsonFile('municipalities.json') || []
  const localities = [...cities, ...municipalities]

  const cityDocs = localities.map(c => ({
    code: c.code,
    provinceCode: provinceCodeFrom(c.code),
    name: (c.name || '').trim(),
    type: (c.type === 'City' || c.type === 'city') ? 'City' : 'Municipality',
    zipCode: String(c.zip_code || c.zipCode || '').trim()
  }))

  for (let i = 0; i < cityDocs.length; i += 5000) {
    const batch = cityDocs.slice(i, i + 5000)
    await bulkUpsert(City, batch)
    console.log(`Imported cities batch ${Math.floor(i / 5000) + 1} (${batch.length})`)
  }
  console.log(`Imported/updated ${cityDocs.length} cities/municipalities`)

  const barangays = loadJsonFile('barangays.json')
  if (barangays) {
    const to10Digit = code9 => {
      const c = String(code9).padStart(9, '0')
      return c.slice(0, 2) + '0' + c.slice(2)
    }
    const cityCode6To10 = code6 => {
      const c = String(code6).padStart(6, '0')
      return to10Digit(c + '000')
    }

    const hasIsaacFormat = barangays.some(b => b.brgy_code && b.city_code)
    const hasPsgcFormat = barangays.some(b => b.code || b.psgc10DigitCode)
    let barangayDocs

    if (hasIsaacFormat) {
      barangayDocs = barangays.map(b => ({
        code: to10Digit(b.brgy_code),
        cityCode: cityCode6To10(b.city_code),
        name: (b.brgy_name || '').trim(),
        status: ''
      }))
    } else if (hasPsgcFormat) {
      barangayDocs = barangays.map(b => ({
        code: b.psgc10DigitCode || b.code,
        cityCode: b.cityCode || b.city_code || b.municipalityCode || b.municipality_code || cityCodeFrom(b.psgc10DigitCode || b.code),
        name: (b.name || '').trim(),
        status: (b.status || b.oldName || '').trim()
      }))
    } else {
      const muncityList = loadJsonFile('muncity.json') || []
      const munIdToCityCode = {}
      muncityList.forEach(mc => {
        const code9 = String(mc.code || mc.muncity_code || '').padStart(9, '0')
        munIdToCityCode[mc.muncity_id] = code9.slice(0, 2) + '0' + code9.slice(2)
      })
      barangayDocs = barangays.map(b => ({
        code: String(b.barangay_id),
        cityCode: munIdToCityCode[b.municipality_id || b.muncity_id] || '',
        name: (b.barangay_name || b.description || b.name || '').trim(),
        status: ''
      }))
    }

    for (let i = 0; i < barangayDocs.length; i += 5000) {
      const batch = barangayDocs.slice(i, i + 5000)
      await bulkUpsert(Barangay, batch)
      console.log(`Imported barangays batch ${Math.floor(i / 5000) + 1} (${batch.length})`)
    }
    console.log(`Imported/updated ${barangayDocs.length} barangays`)
  } else {
    console.log('No barangays.json found or empty. Skipping barangays.')
  }

  await mongoose.connection.close()
  console.log('Done')
}

importPsgcFromLocalFiles().catch(err => {
  console.error(err)
  process.exit(1)
})
