const mongoose = require('mongoose')
const Enrollment = require('../models/Enrollment')

async function main() {
  await mongoose.connect(process.env.MONGODB_URI || 'mongodb+srv://WestCoastCollegeAdmin:WCC26@cluster0.sm99qsu.mongodb.net/wcc-admin?retryWrites=true&w=majority')

  const rows = await Enrollment.find({ 'subjects.submissionStatus': { $ne: 'Draft' }, _id: { $exists: true } })
    .select('studentNumber schoolYear semester gradeSubmission.status gradeSubmission.submittedAt gradeSubmission.verifiedAt gradeSubmission.publishedAt')
    .lean()
  if (rows.length === 0) console.log('(fallback query found none)')
  rows.forEach(en => console.log(' ', JSON.stringify({
    student: en.studentNumber,
    term: `${en.schoolYear} ${en.semester}`,
    avgStatus: en.gradeSubmission?.status,
    submittedAt: en.gradeSubmission?.submittedAt,
    verifiedAt: en.gradeSubmission?.verifiedAt,
    publishedAt: en.gradeSubmission?.publishedAt
  })))

  // which exact subject entries are non-draft
  const entries = await Enrollment.find({
    subjects: { $elemMatch: { submissionStatus: { $ne: 'Draft' } } }
  })
    .select('studentNumber subjects.code subjects.title subjects.submissionStatus subjects.grade subjects.rawScore subjects.gradeMark subjects.instructor')
    .lean()
  entries.forEach(en => {
    en.subjects.filter(s => s.submissionStatus !== 'Draft').forEach(s => {
      console.log(`  entry: ${en.studentNumber} | ${s.code} (${s.title}) | status=${s.submissionStatus} | grade=${s.grade ?? '-'} | raw=${s.rawScore ?? '-'} | mark=${s.gradeMark ?? '-'} | instructor=${s.instructor}`)
    })
  })

  await mongoose.connection.close()
}
main().catch(e => { console.error(e.message); process.exit(1) })
