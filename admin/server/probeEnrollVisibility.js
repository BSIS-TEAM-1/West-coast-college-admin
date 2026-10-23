/* TEMPORARY verification probe (not committed).
   Flips the throwaway probe student's enrollment status so both sides of the
   Enroll-button visibility rule can be verified in the UI.
   Usage: node probeEnrollVisibility.js --set <Status>   (Enrolled|Dropped)
          node probeEnrollVisibility.js --cleanup        (removes everything) */
const path = require('path')
require('dotenv').config({ path: path.join(__dirname, '..', '.env'), override: true })

const mongoose = require('mongoose')
require('./models/Student')
require('./models/Enrollment')

const Student = mongoose.model('Student')
const Enrollment = mongoose.model('Enrollment')
const MARKER = 'ZZPROBE'

async function cleanup() {
  const students = await Student.find({ lastName: MARKER }).lean()
  for (const student of students) {
    await Enrollment.deleteMany({ studentId: student._id })
    await Student.deleteOne({ _id: student._id })
    console.log('cleanup: removed', String(student._id))
  }
  console.log('cleanup done')
}

async function main() {
  await mongoose.connect(process.env.MONGODB_URI)

  if (process.argv.includes('--cleanup')) {
    await cleanup()
    await mongoose.disconnect()
    return
  }

  const statusArg = process.argv.indexOf('--set')
  if (statusArg === -1) {
    console.log('usage: --set <Status> | --cleanup')
    await mongoose.disconnect()
    return
  }

  const status = process.argv[statusArg + 1]
  const student = await Student.findOne({ lastName: MARKER }).lean()
  if (!student) {
    console.log('no probe student found')
    await mongoose.disconnect()
    return
  }

  const existing = await Enrollment.findOne({ studentId: student._id }).lean()
  if (existing) {
    await Enrollment.updateOne({ _id: existing._id }, { $set: { status } })
    console.log('probe updated ->', status)
  } else {
    await Enrollment.create({
      studentId: student._id,
      studentNumber: student.studentNumber,
      course: 'BEED',
      yearLevel: 1,
      schoolYear: student.schoolYear,
      semester: student.semester,
      status,
      isCurrent: true,
      createdBy: '69889269c0f10a42b739488b',
      assessment: { tuitionFee: 0, miscFee: 0, otherFees: 0, totalAmount: 0 },
      subjects: []
    })
    console.log('probe enrollment created ->', status)
  }

  console.log('expect:', status === 'Enrolled' ? 'Enroll HIDDEN' : 'Enroll VISIBLE')
  await mongoose.disconnect()
}

main().catch((error) => {
  console.error(error.message)
  process.exit(1)
})
