const mongoose = require('mongoose')
const Barangay = require('../models/Barangay')

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://WestCoastCollegeAdmin:WCC26@cluster0.sm99qsu.mongodb.net/wcc-admin?retryWrites=true&w=majority'

async function fixBarangayCityCodes() {
  await mongoose.connect(MONGODB_URI)
  console.log('Connected to MongoDB')

  const batchSize = 5000
  let totalUpdated = 0
  let processed = 0
  const total = await Barangay.countDocuments()
  
  console.log(`Total barangays to process: ${total}`)

  let skip = 0
  while (skip < total) {
    const barangays = await Barangay.find()
      .select('code cityCode')
      .skip(skip)
      .limit(batchSize)
      .lean()

    const bulkOps = []
    for (const b of barangays) {
      const barangayCode = String(b.code).trim()
      // Barangay codes inherit their parent city/municipality code's prefix
      // (first 7 digits), then use a sequential 4-digit suffix starting at 0001.
      // The parent is exactly the first 7 digits + '000'.
      const cityCode = barangayCode.slice(0, 7) + '000'
      
      if (b.cityCode !== cityCode) {
        bulkOps.push({
          updateOne: {
            filter: { _id: b._id },
            update: { $set: { cityCode: cityCode } }
          }
        })
      }
    }

    if (bulkOps.length > 0) {
      await Barangay.bulkWrite(bulkOps)
      totalUpdated += bulkOps.length
    }

    processed += barangays.length
    skip += batchSize
    console.log(`Processed ${processed}/${total} barangays, updated ${totalUpdated}`)
  }

  console.log(`\nDone! Updated ${totalUpdated} barangays`)
  await mongoose.connection.close()
}

fixBarangayCityCodes().catch(err => {
  console.error('Error:', err)
  process.exit(1)
})
