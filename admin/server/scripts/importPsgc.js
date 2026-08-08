const axios = require('axios')
const mongoose = require('mongoose')

const Region = require('../models/Region')
const Province = require('../models/Province')
const City = require('../models/City')
const Barangay = require('../models/Barangay')

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://WestCoastCollegeAdmin:WCC26@cluster0.sm99qsu.mongodb.net/wcc-admin?retryWrites=true&w=majority'

const BASE = 'https://psgc.cloud/api/v1'

async function fetchAll(url, params = {}) {
  const results = []
  let page = 1
  let lastPage = null

  while (true) {
    const { data } = await axios.get(url, {
      params: { ...params, per_page: 1000, page },
      timeout: 30000
    })

    if (!data || !Array.isArray(data.data)) {
      console.warn('Unexpected response shape at', url, 'page', page)
      break
    }

    results.push(...data.data)

    if (data.meta?.last_page) {
      lastPage = data.meta.last_page
    }
    if (lastPage && page >= lastPage) break
    if (data.data.length === 0) break

    page++
  }

  return results
}

async function importPsgc() {
  await mongoose.connect(MONGODB_URI)
  console.log('Connected to MongoDB')

  console.log('Importing regions...')
  const regions = await fetchAll(`${BASE}/regions`)
  const regionDocs = regions.map(r => ({
    code: r.psgc10DigitCode || r.code,
    name: r.name
  }))
  await Region.bulkWrite(regionDocs.map(doc => ({
    updateOne: {
      filter: { code: doc.code },
      update: { $set: doc },
      upsert: true
    }
  })))
  console.log(`Imported/updated ${regions.length} regions`)

  console.log('Importing provinces...')
  const provinces = await fetchAll(`${BASE}/provinces`)
  const provinceDocs = provinces.map(p => ({
    code: p.psgc10DigitCode || p.code,
    regionCode: p.regionCode || p.region_code,
    name: p.name
  }))
  await Province.bulkWrite(provinceDocs.map(doc => ({
    updateOne: {
      filter: { code: doc.code },
      update: { $set: doc },
      upsert: true
    }
  })))
  console.log(`Imported/updated ${provinces.length} provinces`)

  console.log('Importing cities and municipalities...')
  const cities = await fetchAll(`${BASE}/cities-municipalities`)
  const cityDocs = cities.map(c => ({
    code: c.psgc10DigitCode || c.code,
    provinceCode: c.provinceCode || c.province_code,
    name: c.name,
    type: c.type === 'City' ? 'City' : 'Municipality',
    zipCode: c.zipCode || c.zip_code || ''
  }))
  for (let i = 0; i < cityDocs.length; i += 5000) {
    const batch = cityDocs.slice(i, i + 5000)
    await City.bulkWrite(batch.map(doc => ({
      updateOne: {
        filter: { code: doc.code },
        update: { $set: doc },
        upsert: true
      }
    })))
  }
  console.log(`Imported/updated ${cities.length} cities/municipalities`)

  console.log('Importing barangays...')
  const barangayDocs = []
  for (let i = 0; i < provinceDocs.length; i += 10) {
    const batch = provinceDocs.slice(i, i + 10)
    const requests = batch.map(province =>
      fetchAll(`${BASE}/provinces/${province.code}/barangays`).catch(err => {
        console.warn(`Failed to fetch barangays for province ${province.code}:`, err.message)
        return []
      })
    )
    const nested = await Promise.all(requests)
    for (const list of nested) {
      for (const b of list) {
        barangayDocs.push({
          code: b.psgc10DigitCode || b.code,
          cityCode: b.cityCode || b.city_code || b.municipalityCode || b.municipality_code || '',
          name: b.name,
          status: b.status || b.oldName || ''
        })
      }
    }
  }

  for (let i = 0; i < barangayDocs.length; i += 5000) {
    const batch = barangayDocs.slice(i, i + 5000)
    await Barangay.bulkWrite(batch.map(doc => ({
      updateOne: {
        filter: { code: doc.code },
        update: { $set: doc },
        upsert: true
      }
    })))
  }
  console.log(`Imported/updated ${barangayDocs.length} barangays`)

  await mongoose.connection.close()
  console.log('Done')
}

importPsgc().catch(err => {
  console.error(err)
  process.exit(1)
})
