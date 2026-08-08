const path = require('path')
const fs = require('fs')
const dotenv = require('dotenv')
const mongoose = require('mongoose')

;[
  { filePath: path.join(__dirname, '..', '..', '.env'), override: false },
  { filePath: path.join(__dirname, '..', '.env'), override: true }
].forEach(({ filePath, override }) => {
  if (fs.existsSync(filePath)) dotenv.config({ path: filePath, override })
})

const BlockGroup = require('../models/BlockGroup')
const Student = require('../models/Student')

async function main() {
  await mongoose.connect(process.env.MONGODB_URI)

  const student = await Student.findOne({ studentNumber: /28391/ }).lean()
  console.log('Student:', student && {
    course: student.course,
    yearLevel: student.yearLevel,
    semester: student.semester,
    schoolYear: student.schoolYear
  })

  const groups = await BlockGroup.find().lean()
  console.log(`Total groups: ${groups.length}`)
  groups.forEach((g) => {
    console.log({
      name: g.name,
      courseId: g.courseId,
      courseCode: g.courseCode,
      yearLevel: g.yearLevel,
      semester: g.semester,
      schoolYear: g.schoolYear,
      year: g.year
    })
  })

  await mongoose.disconnect()
}

main().catch((err) => { console.error(err); process.exit(1) })
