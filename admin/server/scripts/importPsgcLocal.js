const path = require('path')
const fs = require('fs')
const axios = require('axios')
const mongoose = require('mongoose')

const Region = require('../models/Region')
const Province = require('../models/Province')
const City = require('../models/City')
const Barangay = require('../models/Barangay')

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://WestCoastCollegeAdmin:WCC26@cluster0.sm99qsu.mongodb.net/wcc-admin?retryWrites=true&w=majority'

const BASE = 'https://psgc.cloud/api'
const PUBLIC_DIR = path.resolve(__dirname, '../../public')

async function fetchAll(url, params = {}) {
  const results = []
  let page = 1

  while (true) {
    const { data } = await axios.get(url, {
      params: { ...params, per_page: 1000, page },
      timeout: 60000
    })

    if (Array.isArray(data)) {
      return data
    }

    if (!data || !Array.isArray(data.data)) {
      console.warn('Unexpected response shape at', url, 'page', page)
      break
    }

    results.push(...data.data)

    if (data.meta?.last_page) {
      if (page >= data.meta.last_page) break
    } else if (data.data.length === 0) {
      break
    } else if (page > 1) {
      // No meta and second page is empty-ish? Stop after one page if no meta
      break
    }

    page++
  }

  return results
}

function loadPsgcJson(filename) {
  const filePath = path.join(PUBLIC_DIR, filename)
  if (!fs.existsSync(filePath) || fs.statSync(filePath).size < 5) {
    return null
  }
  let raw = fs.readFileSync(filePath, 'utf-8')
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

function savePsgcJson(filename, data) {
  const filePath = path.join(PUBLIC_DIR, filename)
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2))
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

async function getLocalOrFetchRegions() {
  let data = loadPsgcJson('regions.json')
  if (!data) {
    data = await fetchAll(`${BASE}/regions`)
    savePsgcJson('regions.json', data)
  }
  return data.map(r => ({
    code: r.code,
    name: r.name.trim()
  }))
}

async function getLocalOrFetchProvinces() {
  let data = loadPsgcJson('provinces.json')
  if (!data) {
    data = await fetchAll(`${BASE}/provinces`)
    savePsgcJson('provinces.json', data)
  }
  return data.map(p => ({
    code: p.code,
    regionCode: p.region_code || p.regionCode || regionCodeFrom(p.code),
    name: p.name.trim()
  }))
}

async function getLocalCitiesAndMunicipalities() {
  const cities = loadPsgcJson('cities.json') || []
  const municipalities = loadPsgcJson('municipalities.json') || []
  const all = [...cities, ...municipalities]
  return all.map(c => ({
    code: c.code,
    provinceCode: c.province_code || c.provinceCode || provinceCodeFrom(c.code),
    name: c.name.trim(),
    type: c.type === 'City' ? 'City' : 'Municipality',
    zipCode: String(c.zip_code || '').trim()
  }))
}

async function bulkUpsert(model, docs, idField = 'code') {
  for (let i = 0; i < docs.length; i += 5000) {
    const batch = docs.slice(i, i + 5000)
    await model.bulkWrite(batch.map(doc => ({
      updateOne: {
        filter: { [idField]: doc[idField] },
        update: { $set: doc },
        upsert: true
      }
    })))
  }
}

async function importPsgcLocal() {
  await mongoose.connect(MONGODB_URI)
  console.log('Connected to MongoDB')

  console.log('Importing regions...')
  const regionDocs = await getLocalOrFetchRegions()
  await bulkUpsert(Region, regionDocs)
  console.log(`Imported/updated ${regionDocs.length} regions`)

  console.log('Importing provinces...')
  const provinceDocs = await getLocalOrFetchProvinces()
  await bulkUpsert(Province, provinceDocs)
  console.log(`Imported/updated ${provinceDocs.length} provinces`)

  console.log('Importing cities/municipalities...')
  const cityDocs = await getLocalCitiesAndMunicipalities()
  await bulkUpsert(City, cityDocs)
  console.log(`Imported/updated ${cityDocs.length} cities/municipalities`)

  console.log('Importing barangays...')
  const barangayList = await fetchAll(`${BASE}/v1/barangays`).catch(err => {
    console.warn('Failed to fetch barangays:', err.message)
    return []
  })
  const barangayDocs = barangayList.map(b => ({
    code: b.psgc10DigitCode || b.code,
    cityCode: b.cityCode || b.city_code || b.municipalityCode || b.municipality_code || cityCodeFrom(b.psgc10DigitCode || b.code),
    name: (b.name || '').trim(),
    status: (b.status || b.oldName || '').trim()
  }))
  await bulkUpsert(Barangay, barangayDocs)
  console.log(`Imported/updated ${barangayDocs.length} barangays`)

  await mongoose.connection.close()
  console.log('Done')
}

importPsgcLocal().catch(err => {
  console.error(err)
  process.exit(1)
})
