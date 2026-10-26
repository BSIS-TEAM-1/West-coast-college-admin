const path = require('path')
const xlsx = require('xlsx')
const mongoose = require('mongoose')

const Region = require('../models/Region')
const Province = require('../models/Province')
const City = require('../models/City')
const Barangay = require('../models/Barangay')

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://WestCoastCollegeAdmin:WCC26@cluster0.sm99qsu.mongodb.net/wcc-admin?retryWrites=true&w=majority'

const EXCEL_FILE = path.resolve(__dirname, '../../public/PSGC-3Q-2026-Publication-Datafile.xlsx')

async function importPsgcFromExcel() {
  await mongoose.connect(MONGODB_URI)
  console.log('Connected to MongoDB')

  console.log('Reading Excel file:', EXCEL_FILE)
  const workbook = xlsx.readFile(EXCEL_FILE)
  const sheetNames = workbook.SheetNames
  console.log('Sheets found:', sheetNames)

  // Process the PSGC sheet
  const psgcSheet = workbook.Sheets['PSGC']
  if (!psgcSheet) {
    console.error('PSGC sheet not found')
    await mongoose.connection.close()
    return
  }

  const data = xlsx.utils.sheet_to_json(psgcSheet)
  console.log(`Found ${data.length} rows in PSGC sheet`)

  // Separate by geographic level
  const regions = []
  const provinces = []
  const cities = []
  const barangays = []

  for (const row of data) {
    const level = row['Geographic Level'] || row['Geographic Level\r\n'] || ''
    const code = String(row['10-digit PSGC'] || row['10-digit PSGC\r\n'] || '').trim()
    const name = row['Name'] || ''
    const corrCode = String(row['Correspondence Code'] || row['Correspondence Code\r\n'] || '').trim()

    if (!code || !name) continue
    // Guard against notes/overflow rows leaking into the sheet: only genuine
    // 10-digit codes are processed.
    if (!/^\d{10}$/.test(code)) {
      console.warn(`Skipping malformed/non-PSGC row starting with: "${code.slice(0, 30)}"`)
      continue
    }

    const normalizedLevel = String(level).trim().toLowerCase()

    // The PSA Geographic Level column is the authoritative classifier.
    // Code structure is used as fallback for rows with an empty/unknown level.
    //   Region codes:                  end with 00000000 (8 zeros)
    //   Province-like codes:           end with 00000    (5 zeros) -- provinces,
    //     but also HUC/ICC city codes; only the level label tells them apart
    //   City/Municipality codes:       end with 000      (3 zeros, not 5)
    //   Barangay codes:                do NOT end with 000
    const isRegionCode = code.slice(-8) === '00000000'
    const isProvinceStyle = isRegionCode || code.slice(-5) === '00000'

    let kind
    if (normalizedLevel === 'reg') kind = 'region'
    else if (normalizedLevel === 'prov') kind = 'province'
    else if (['city', 'mun', 'submun'].includes(normalizedLevel)) kind = 'city'
    else if (['bgy', 'brgy', 'barangay'].includes(normalizedLevel)) kind = 'barangay'
    else {
      // Empty or unrecognized label -- fall back to code structure.
      kind = isRegionCode ? 'region' : isProvinceStyle ? 'province' : 'city'
    }

    if (kind === 'region') {
      regions.push({ code: code, name: String(name).trim() })
    } else if (kind === 'province') {
      // Region linkage comes from the province's own code prefix. The
      // correspondence code uses the OLD 9-digit PSGC numbering and may point
      // to superseded regions (e.g. ARMM 15 for BARMM 19, Region VI/VII codes
      // for provinces that moved to NIR 18), so it must NOT be used here.
      provinces.push({
        code: code,
        name: String(name).trim(),
        regionCode: code.slice(0, 2) + '00000000',
        corrCode: corrCode
      })
    } else if (kind === 'city') {
      const type = normalizedLevel === 'city' ? 'City' : normalizedLevel === 'submun' ? 'SubMun' : 'Municipality'
      cities.push({
        code: code,
        name: String(name).trim(),
        provinceCode: '',
        type: type,
        zipCode: '',
        corrCode: corrCode
      })
    } else {
      // Barangay codes inherit their parent city/municipality code's prefix
      // (first 7 digits), then use a sequential 4-digit suffix starting at 0001.
      // The parent is exactly the first 7 digits + '000' -- do not assume the
      // prefix extends deeper, and do not create parent codes that don't exist.
      const cityCode = code.slice(0, 7) + '000'
      barangays.push({
        code: code,
        name: String(name).trim(),
        cityCode: cityCode,
        status: ''
      })
    }
  }

  console.log(`\nFound ${regions.length} regions`)
  console.log(`Found ${provinces.length} provinces`)
  console.log(`Found ${cities.length} cities/municipalities`)
  console.log(`Found ${barangays.length} barangays`)

  // Link each city/municipality to its parent province.
  //
  // Regular LGUs (codes ending in exactly 3 zeros): the mother province is the
  //   ancestor code formed by the first 5 digits + '000'.
  // Province-style city codes (HUC/ICC, ending in 5 zeros): their mother
  //   province is recorded in the correspondence code using the OLD 9-digit
  //   PSGC numbering (old province = corr's first 4 digits + '00000'). Map
  //   through the provinces' own correspondence codes.
  // LGUs with no mother province row in the dataset (the NCR HUCs, and
  //   municipalities directly under a region such as Pateros) are presented
  //   by PSA as standalone entries, so they become their own province-level
  //   row to remain reachable in the region -> province -> city cascade.
  //   Only codes that actually exist in the dataset are used -- none are
  //   invented for missing ancestors.
  const provByCorr = new Map(provinces.filter(p => p.corrCode).map(p => [p.corrCode, p.code]))
  const provinceBase = new Set(provinces.map(p => p.code))
  const pseudoProvinces = []
  const cityCodeSet = new Set(cities.map(ci => ci.code))

  // Pass 1 -- HUC/ICC-style cities (codes ending in 5 zeros): resolve the
  // mother province through the correspondence code's OLD 9-digit provincial
  // numbering (old province = corr's first 4 digits + '00000').
  for (const city of cities) {
    const c = city.code
    if (c.slice(-5) === '00000') {
      const motherOld = (city.corrCode || '').slice(0, 4) + '00000'
      const mother = provByCorr.get(motherOld)
      if (mother) {
        city.provinceCode = mother
      } else {
        city.provinceCode = c
        pseudoProvinces.push({
          code: c,
          name: city.name,
          regionCode: c.slice(0, 2) + '00000000'
        })
      }
    }
  }

  // Pass 2 -- regular LGUs (codes ending in exactly 3 zeros): the mother
  // province is the ancestor code formed by the first 5 digits + '000'. It
  // must exist among the dataset provinces, including the HUC/ICC entries
  // added in pass 1 (e.g. Manila's municipal districts hang off the City of
  // Manila's own province-level code).
  const allProvinceCodes = new Set([...provinceBase, ...pseudoProvinces.map(p => p.code)])
  for (const city of cities) {
    const c = city.code
    if (city.provinceCode !== '') continue
    const mother = c.slice(0, 5) + '00000'
    if (allProvinceCodes.has(mother)) {
      city.provinceCode = mother
    } else {
      // LGUs directly under a region (e.g. Pateros in NCR) have no
      // province-level ancestor row in the dataset. Never invent an
      // ancestor code: the LGU is its own province-level entry instead.
      city.provinceCode = c
      pseudoProvinces.push({
        code: c,
        name: city.name,
        regionCode: c.slice(0, 2) + '00000000'
      })
    }
  }
  if (pseudoProvinces.length > 0) {
    console.log(`Added ${pseudoProvinces.length} HUC/ICC entries to provinces (no mother province, e.g. NCR cities)`)
  }

  // Verify every city/municipality links to a province that exists in the
  // dataset. Never invent province codes.
  const provinceCodeSet = new Set(provinces.concat(pseudoProvinces).map(p => p.code))
  const unlinkedCities = cities.filter(ci => !provinceCodeSet.has(ci.provinceCode) && ci.provinceCode !== '')
  if (unlinkedCities.length > 0) {
    console.warn(`\nWARNING: ${unlinkedCities.length} cities/municipalities reference a province code not present in the dataset. Examples:`)
    unlinkedCities.slice(0, 10).forEach(ci => console.warn(`  ${ci.code} (${ci.name}) -> province ${ci.provinceCode}`))
  } else {
    console.log('All cities/municipalities matched to an existing province code.')
  }

  // Strip the helper column before writing
  provinces.forEach(p => { delete p.corrCode })
  cities.forEach(ci => { delete ci.corrCode })
  const allProvinceDocs = provinces.concat(pseudoProvinces)

  // Verify every barangay links to a city/municipality that exists in the
  // dataset (shared prefix + geographic level). Never invent parent codes.
  const orphanBarangays = barangays.filter(b => !cityCodeSet.has(b.cityCode))
  if (orphanBarangays.length > 0) {
    console.warn(`\nWARNING: ${orphanBarangays.length} barangays reference a city/municipality code not present in the dataset. Examples:`)
    orphanBarangays.slice(0, 10).forEach(b => console.warn(`  ${b.code} (${b.name}) -> parent ${b.cityCode}`))
  } else {
    console.log('All barangays matched to an existing parent city/municipality code.')
  }

  // The dataset is authoritative: remove any rows previously imported from
  // other sources or misclassifications that are no longer present in the
  // file (e.g. cities that are actually provinces, or stale old-format codes).
  await syncDelete(Region, regions)
  await syncDelete(Province, allProvinceDocs)
  await syncDelete(City, cities)
  await syncDelete(Barangay, barangays)

  // Import each type
  if (regions.length > 0) {
    await bulkUpsert(Region, regions)
    console.log(`Imported/updated ${regions.length} regions`)
  }

  if (allProvinceDocs.length > 0) {
    await bulkUpsert(Province, allProvinceDocs)
    console.log(`Imported/updated ${allProvinceDocs.length} provinces`)
  }

  if (cities.length > 0) {
    await bulkUpsert(City, cities)
    console.log(`Imported/updated ${cities.length} cities/municipalities`)
  }

  if (barangays.length > 0) {
    await bulkUpsert(Barangay, barangays)
    console.log(`Imported/updated ${barangays.length} barangays`)
  }

  await mongoose.connection.close()
  console.log('\nDone')
}

// The dataset is authoritative: rows previously imported from other sources or
// old misclassifications that are no longer present in the file are removed.
async function syncDelete(model, docs, idField = 'code') {
  const codes = docs.map(d => d[idField])
  const result = await model.deleteMany({ [idField]: { $nin: codes } })
  if (result.deletedCount > 0) {
    console.log(`Removed ${result.deletedCount} stale row(s) from ${model.collection.name}`)
  }
}

async function bulkUpsert(model, docs, idField = 'code') {
  const batchSize = 5000
  for (let i = 0; i < docs.length; i += batchSize) {
    const batch = docs.slice(i, i + batchSize)
    await model.bulkWrite(batch.map(doc => ({
      updateOne: {
        filter: { [idField]: doc[idField] },
        update: { $set: doc },
        upsert: true
      }
    })))
  }
}

importPsgcFromExcel().catch(err => {
  console.error('Error:', err)
  process.exit(1)
})
