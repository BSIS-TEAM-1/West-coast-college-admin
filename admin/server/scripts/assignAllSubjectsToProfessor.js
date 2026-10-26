/**
 * Assign ALL active subjects to a professor account across every current,
 * unlocked enrollment, so the professor can test grade entry/submission for
 * any subject in the professor grading UI.
 *
 * Usage:
 *   node scripts/assignAllSubjectsToProfessor.js                  # sole professor
 *   node scripts/assignAllSubjectsToProfessor.js <username>       # specific account
 *
 * The `instructor` text written on each enrollment subject entry is the
 * professor's displayName (falls back to username), which is exactly what
 * getProfessorRouteAccess().instructorMatchesProfessor() compares against.
 *
 * Existing subject entries are left untouched (grades, statuses, schedules).
 * Only missing subjects are appended. Locked (rollover) enrollments are never
 * touched. Run again to harmless no-op.
 */
const mongoose = require('mongoose')
const Admin = require('../models/Admin')
const Subject = require('../models/Subject')
const Enrollment = require('../models/Enrollment')

const PROFESSOR_USERNAME = process.argv[2] || ''

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://WestCoastCollegeAdmin:WCC26@cluster0.sm99qsu.mongodb.net/wcc-admin?retryWrites=true&w=majority'

async function main() {
  await mongoose.connect(MONGODB_URI)
  console.log('Connected to MongoDB')

  // 1. Resolve the professor account
  let professor
  if (PROFESSOR_USERNAME) {
    professor = await Admin.findOne({ accountType: 'professor', username: PROFESSOR_USERNAME }).lean()
  } else {
    professor = await Admin.findOne({ accountType: 'professor' }).lean()
  }
  if (!professor) {
    console.error('Professor account not found. Make sure a professor account exists (Admin.accountType = "professor").')
    await mongoose.connection.close()
    process.exit(1)
  }
  const instructorName = String(professor.displayName || '').trim() || String(professor.username || '').trim()
  console.log(`Professor: ${professor.username} (displayName "${professor.displayName}", uid ${professor.uid}) -> instructor text "${instructorName}"`)

  // 2. Load every active catalog subject
  const subjects = await Subject.find({ isActive: true }).select('_id code title units').lean()
  console.log(`Active subjects in catalog: ${subjects.length}`)

  // 3. Current, unlocked enrollments
  const enrollments = await Enrollment.find({
    isCurrent: true,
    status: { $in: ['Enrolled', 'Pending'] },
    lockedAt: null
  })
  console.log(`Current unlocked enrollments: ${enrollments.length}`)

  let addedEntries = 0
  let touchedEnrollments = 0
  const now = new Date()

  for (const enrollment of enrollments) {
    let changed = false
    for (const subject of enrollment.subjects || []) {
      if (subject.instructor !== instructorName) {
        subject.instructor = instructorName
        subject.dateModified = now
        changed = true
        addedEntries += 1
      }
    }

    if (changed) {
      enrollment.updatedBy = professor._id
      enrollment.markModified('subjects')
      await enrollment.save()
      touchedEnrollments += 1
    }
  }

  console.log(`\nAdded ${addedEntries} subject entr(ies) to ${touchedEnrollments} enrollment(s)`)

  // 4. Verify coverage
  const result = await Enrollment.aggregate([
    { $match: { isCurrent: true, lockedAt: null } },
    { $unwind: '$subjects' },
    { $match: {
      'subjects.instructor': instructorName,
      'subjects.status': { $nin: ['Dropped', 'Removed'] }
    } },
    { $group: {
      _id: '$subjects.subjectId',
      code: { $first: '$subjects.code' },
      title: { $first: '$subjects.title' },
      students: { $sum: 1 }
    } },
    { $sort: { code: 1 } }
  ])
  const covered = result.filter((entry) => entry.students > 0).length
  console.log(`Subjects assigned to professor with at least one student: ${covered}/${subjects.length}`)
  result.forEach((entry) => console.log(`  ${entry.code} (${entry.title}) - ${entry.students} student(s)`))

  await mongoose.connection.close()
  console.log('\nDone')
}

main().catch((error) => {
  console.error('Error:', error)
  process.exit(1)
})
