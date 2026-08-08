const path = require('path')
const mongoose = require('mongoose')
const xlsx = require('xlsx')
const School = require('../models/School')

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://WestCoastCollegeAdmin:WCC26@cluster0.sm99qsu.mongodb.net/wcc-admin?retryWrites=true&w=majority'
const XLSX_PATH = process.env.XLSX_PATH || path.resolve(__dirname, '../../public/SchoolsSHS.xlsx')

async function importSchools() {
  await mongoose.connect(MONGODB_URI)
  console.log('Connected to MongoDB')

  const workbook = xlsx.readFile(XLSX_PATH)
  const worksheet = workbook.Sheets[workbook.SheetNames[0]]
  const rows = xlsx.utils.sheet_to_json(worksheet, { header: 1, defval: '' })

  // Skip first 5 header rows, then map columns
  const dataRows = rows.slice(5)
  const mapped = dataRows
    .map((row) => {
      const rawName = String(row[3] ?? '').trim()
      const schoolIdMatch = rawName.match(/^(\d+)\s*/)
      const schoolId = schoolIdMatch ? schoolIdMatch[1] : ''
      const name = schoolIdMatch ? rawName.replace(/^\d+\s*/, '').trim() : rawName

      // Column 9 combines Urban/Rural classification and Subclassification, e.g. 'Partially UrbanDepED Managed'
      const rawUrbanRuralSub = String(row[9] ?? '').trim()
      const urbanMatch = rawUrbanRuralSub.match(/^(Partially Urban|Partially Rural|Urban|Rural)/)
      const urbanRuralClassification = urbanMatch ? urbanMatch[1] : ''
      const subclassification = urbanMatch ? rawUrbanRuralSub.replace(urbanMatch[1], '').trim() : rawUrbanRuralSub

      return {
        schoolId,
        name,
        region: String(row[0] ?? '').trim(),
        division: String(row[1] ?? '').trim(),
        district: String(row[2] ?? '').trim(),
        streetAddress: String(row[4] ?? '').trim(),
        municipality: String(row[5] ?? '').trim(),
        legislativeDistrict: String(row[6] ?? '').trim(),
        barangay: String(row[7] ?? '').trim(),
        sector: String(row[8] ?? '').trim(),
        urbanRuralClassification,
        subclassification,
        modifiedCurricularOffering: String(row[10] ?? '').trim()
      }
    })
    .filter((school) => school.name)

  console.log(`Parsed ${mapped.length} schools`)

  // Clear existing schools and re-import
  await School.deleteMany({})
  console.log('Cleared existing schools')

  const batchSize = 1000
  for (let i = 0; i < mapped.length; i += batchSize) {
    const batch = mapped.slice(i, i + batchSize)
    await School.insertMany(batch, { ordered: false })
    console.log(`Inserted ${Math.min(i + batchSize, mapped.length)} / ${mapped.length}`)
  }

  console.log('Import complete')
  await mongoose.connection.close()
  process.exit(0)
}

importSchools().catch((err) => {
  console.error(err)
  process.exit(1)
})
