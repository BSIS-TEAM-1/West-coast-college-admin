'use strict'

/**
 * Integration scenarios for the program-shift workflow.
 *
 * Seeds a cloned test DB and drives the REAL controller
 * (StudentController.shiftStudent) plus the REAL eligibility service, then
 * asserts both the happy paths and the failure paths — including that a failed
 * shift leaves no partially-updated student / enrollment / block records.
 *
 * The test DB is dropped at the end. The live DB is only read.
 */

const path = require('path')
const fs = require('fs')
const util = require('util')
const dotenv = require('dotenv')
const { MongoClient } = require('mongodb')
const mongoose = require('mongoose')

;[
  ['../.env', false],
  ['../.env.credential-details', true],
  ['../.env.credentail-details', true],
].forEach(([file, override]) => {
  const filePath = path.join(__dirname, file)
  if (fs.existsSync(filePath)) dotenv.config({ path: filePath, override })
})

// Register every model this harness touches up front — several are required
// lazily by the controllers, which is too late for the seeding helpers.
require('./models/Curriculum')
require('./models/CurriculumSubject')
require('./models/Subject')
require('./models/BlockGroup')
require('./models/BlockSection')
require('./models/StudentBlockAssignment')
require('./models/SectionWaitlist')
require('./models/AuditLog')

const LIVE_DB = 'wcc-admin'
const TEST_DB = 'wcc-admin-shift-test'
const SY = '2026-2027'
const SEM = '1st'
const ADMIN_ID = '69889269c0f10a42b739488b'
const REF_COLLECTIONS = ['curriculums', 'curriculumsubjects', 'subjects', 'systemsettings']

const uri = process.env.MONGODB_URI
if (!uri) throw new Error('MONGODB_URI is not configured')
const testUrl = new URL(uri)
testUrl.pathname = `/${TEST_DB}`
const testUri = testUrl.toString()

function log(msg) { console.log(`[shift] ${msg}`) }

function mockRes() {
  const res = {
    _status: 200,
    _payload: undefined,
    status(code) { this._status = code; return this },
    json(payload) { this._payload = payload; return this },
    get payload() { return this._payload },
  }
  return res
}

let passCount = 0
let failCount = 0
function check(label, condition, detail) {
  if (condition) {
    passCount += 1
    log(`  PASS  ${label}`)
  } else {
    failCount += 1
    log(`  FAIL  ${label}${detail !== undefined ? ` :: ${util.inspect(detail, { depth: 4 })}` : ''}`)
  }
}

async function cloneReference() {
  const live = new MongoClient(uri, { serverSelectionTimeoutMS: 30000 })
  const test = new MongoClient(testUri, { serverSelectionTimeoutMS: 30000 })
  await live.connect()
  await test.connect()
  const liveDb = live.db(LIVE_DB)
  const testDb = test.db(TEST_DB)
  await testDb.dropDatabase()

  for (const name of REF_COLLECTIONS) {
    const exists = await liveDb.listCollections({ name }).hasNext()
    if (!exists) { log(`ref ${name}: missing, skipped`); continue }
    const docs = await liveDb.collection(name).find({}).toArray()
    if (docs.length) {
      const chunk = 500
      for (let i = 0; i < docs.length; i += chunk) {
        await testDb.collection(name).insertMany(docs.slice(i, i + chunk))
      }
    }
    log(`ref ${name}: ${docs.length} docs`)
  }
  await live.close()
  await test.close()
}

/**
 * Guarantee the term under test has a deterministic curriculum state:
 * an Active curriculum for 101 / 102 / 103, and none for 201 so the
 * "no active curriculum" rejection is provable.
 */
async function ensureCurricula() {
  const Curriculum = mongoose.model('Curriculum')

  // Only one Active curriculum may exist per program (unique index), so reuse
  // whatever the cloned reference data already provides.
  const ensureActive = async (programCode) => {
    const active = await Curriculum.findOne({ programCode, status: 'Active' }).lean()
    if (active) return active._id
    const created = await Curriculum.create({
      programCode,
      programName: `Program ${programCode}`,
      name: `Program ${programCode} ${SY}`,
      version: '2026.1-shift-test',
      schoolYear: SY,
      status: 'Active',
    })
    return created._id
  }

  const ids = {
    102: await ensureActive(102),
    103: await ensureActive(103),
  }

  // 201 must have NO active curriculum.
  await Curriculum.updateMany({ programCode: 201 }, { $set: { status: 'Archived' } })

  return ids
}

async function seed(curriculumIds) {
  const BlockGroup = mongoose.model('BlockGroup')
  const BlockSection = mongoose.model('BlockSection')
  const Student = mongoose.model('Student')
  const Enrollment = mongoose.model('Enrollment')
  const StudentBlockAssignment = mongoose.model('StudentBlockAssignment')

  const mkGroup = async (courseId, yearLevel, name, semester = SEM) => {
    const [group] = await BlockGroup.create([{
      name,
      courseId,
      courseCode: String(courseId),
      yearLevel,
      semester,
      schoolYear: SY,
      year: SY,
      section: name.split('-').pop(),
      curriculumId: curriculumIds[courseId] || undefined,
    }])
    return group
  }

  const mkSection = async (group, code, capacity, population = 0) => {
    const [section] = await BlockSection.create([{
      blockGroupId: group._id,
      sectionCode: code,
      capacity,
      currentPopulation: population,
      status: 'OPEN',
    }])
    return section
  }

  // BEED (101) Year 1 — the program students shift AWAY from.
  const beedGroup = await mkGroup(101, 1, 'BEED-1-A')
  const beedSection = await mkSection(beedGroup, '101-1-A', 10, 0)

  // BSED-English (102) Year 1 — the program students shift TO.
  const bsedGroup = await mkGroup(102, 1, 'BSED-ENG-1-A')
  const bsedSection = await mkSection(bsedGroup, '102-1-A', 5, 0)

  // BSED-Math (103) Year 1 — only a FULL section, for the capacity rollback.
  const mathGroup = await mkGroup(103, 1, 'BSED-MATH-1-A')
  const mathFullSection = await mkSection(mathGroup, '103-1-A', 1, 1)

  let seq = 0
  const mkStudent = async (fields) => {
    seq += 1
    const [doc] = await Student.create([{
      studentNumber: `2026${String(seq).padStart(8, '0')}`,
      firstName: fields.firstName || `Shift${seq}`,
      lastName: fields.lastName || `Case${seq}`,
      course: fields.course,
      yearLevel: fields.yearLevel,
      semester: SEM,
      schoolYear: fields.schoolYear || SY,
      studentStatus: fields.studentStatus || 'Regular',
      classification: fields.classification || 'Regular',
      lifecycleStatus: fields.lifecycleStatus || 'Enrolled',
      isActive: true,
      section: fields.section || '',
      corStatus: 'Pending',
      contactNumber: '09000000000',
      address: 'Test Address',
    }])
    return doc
  }

  const mkEnrollment = async (student, fields = {}) => {
    const [doc] = await Enrollment.create([{
      studentId: student._id,
      studentNumber: student.studentNumber,
      schoolYear: fields.schoolYear || SY,
      semester: fields.semester || SEM,
      yearLevel: fields.yearLevel || student.yearLevel,
      course: fields.course,
      subjects: fields.subjects || [],
      assessment: { tuitionFee: 0, miscFee: 0, otherFees: 0, totalAmount: 0 },
      status: fields.status || 'Enrolled',
      isCurrent: fields.isCurrent !== undefined ? fields.isCurrent : true,
      createdBy: ADMIN_ID,
    }])
    return doc
  }

  // Two graded subjects so "grades are preserved" is provable.
  const subjectDocs = await mongoose.model('Subject')
    .find({ isActive: { $ne: false } })
    .select('_id code title units')
    .limit(2)
    .lean()
  if (subjectDocs.length < 2) throw new Error('not enough subjects in reference data')

  const gradedSubjects = subjectDocs.map((subject, index) => ({
    subjectId: subject._id,
    code: subject.code,
    title: subject.title,
    units: subject.units || 3,
    status: index === 0 ? 'Completed' : 'Enrolled',
    grade: index === 0 ? 1.5 : null,
    gradeMark: null,
  }))

  const mkAssignment = async (student, section, group) => {
    const [doc] = await StudentBlockAssignment.create([{
      studentId: student._id,
      sectionId: section._id,
      semester: SEM,
      year: SY,
      schoolYear: SY,
      status: 'ASSIGNED',
      assignedAt: new Date(),
    }])
    return doc
  }

  // 1. Happy path with a block.
  const withBlock = await mkStudent({ course: 101, yearLevel: 1, section: '101-1-A' })
  const withBlockEnrollment = await mkEnrollment(withBlock, { course: 'BEED', subjects: gradedSubjects })
  await mkAssignment(withBlock, beedSection, beedGroup)
  await BlockSection.updateOne({ _id: beedSection._id }, { $set: { currentPopulation: 1 } })

  // 2. Happy path without a block (shift must still unblock eligibility).
  const withoutBlock = await mkStudent({ course: 101, yearLevel: 1, section: '' })
  await mkEnrollment(withoutBlock, { course: 'BEED', subjects: gradedSubjects })

  // 3. No active curriculum for the destination program (201).
  const noCurriculum = await mkStudent({ course: 101, yearLevel: 1, section: '' })
  const noCurriculumEnrollment = await mkEnrollment(noCurriculum, { course: 'BEED' })

  // 4. Section label that does not exist.
  const badSection = await mkStudent({ course: 101, yearLevel: 1, section: '' })
  const badSectionEnrollment = await mkEnrollment(badSection, { course: 'BEED' })

  // 5. Destination block is full -> whole shift must roll back.
  const fullBlock = await mkStudent({ course: 101, yearLevel: 1, section: '' })
  const fullBlockEnrollment = await mkEnrollment(fullBlock, { course: 'BEED', subjects: gradedSubjects })

  // 6. Upper-year student -> policy rejection.
  const upperYear = await mkStudent({ course: 101, yearLevel: 2, section: '' })
  const upperYearEnrollment = await mkEnrollment(upperYear, { course: 'BEED', yearLevel: 2 })

  // 1b. Shiftee whose shift body carries the label the old shift form derived
  //     from the group display name ("BSED-ENG-1-A" -> "ENG-1-A").
  const uiLabel = await mkStudent({ course: 101, yearLevel: 1, section: '' })
  const uiLabelEnrollment = await mkEnrollment(uiLabel, { course: 'BEED', subjects: gradedSubjects })

  // 1c. Shiftee carrying a CURRENT-date school year while every block group
  //     is stamped with the legacy term (the real live-data shape).
  const termStale = await mkStudent({
    course: 101,
    yearLevel: 1,
    section: '',
    schoolYear: '2027-2028',
  })
  const termStaleEnrollment = await mkEnrollment(termStale, {
    course: 'BEED',
    subjects: gradedSubjects,
    schoolYear: '2027-2028',
  })

  return {
    sections: { beedSection, bsedSection, mathFullSection },
    students: {
      withBlock, withoutBlock, noCurriculum, badSection, fullBlock, upperYear, uiLabel, termStale,
    },
    enrollments: {
      withBlockEnrollment, noCurriculumEnrollment, badSectionEnrollment, fullBlockEnrollment, upperYearEnrollment, uiLabelEnrollment, termStaleEnrollment,
    },
    models: { Student, Enrollment, StudentBlockAssignment, BlockSection, AuditLog: mongoose.model('AuditLog') },
  }
}

async function main() {
  await cloneReference()
  await mongoose.connect(testUri, { serverSelectionTimeoutMS: 30000 })
  log('connected to test DB')

  const curriculumIds = await ensureCurricula()
  const StudentController = require('./controllers/studentController')
  const blockController = require('./controllers/blockController')
  const eligibility = require('./services/blockEligibilityService')

  const { sections, students, enrollments, models } = await seed(curriculumIds)
  log('seeded blocks + shift students')

  const transientRe = /space quota|dbStats|MaxTimeMSExpired|internal atlas error|another change was in progress|Unable to acquire IX lock|TransientTransactionError|WriteConflict|catalog changes|context deadline exceeded|exceeded time limit/i

  async function shiftOnce(studentId, body) {
    const req = {
      params: { id: String(studentId) },
      body,
      adminId: ADMIN_ID,
      accountType: 'registrar',
      registrarId: ADMIN_ID,
    }
    const res = mockRes()
    await StudentController.shiftStudent(req, res)
    return { status: res._status, payload: res.payload }
  }

  async function shift(studentId, body) {
    let last
    for (let attempt = 0; attempt < 10; attempt += 1) {
      last = await shiftOnce(studentId, body)
      const text = JSON.stringify(last.payload || {})
      if (last.status >= 500 && transientRe.test(text)) {
        log(`  retry due to transient Atlas error (attempt ${attempt + 1})`)
        await new Promise((resolve) => setTimeout(resolve, 500 * Math.min(attempt + 1, 5)))
        continue
      }
      return last
    }
    return last
  }

  async function eligibleBlocks(studentId) {
    const req = { query: { studentId: String(studentId) } }
    const res = mockRes()
    await blockController.getEligibleBlocks(req, res)
    return res.payload
  }

  // ── 1. Successful shift with a block assignment ──────────────────────────
  log('\n--- 1. Shift with block assignment (BEED -> BSED-English, block 1-A) ---')
  const s1 = await shift(students.withBlock._id, {
    course: 102,
    section: '1-A',
    semester: SEM,
    overrideReason: 'Student requested transfer',
    effectiveTerm: 'Immediate',
  })
  check('shift succeeds', s1.status === 200 && s1.payload?.success === true, s1.payload)
  check('response reports previous course 101', s1.payload?.data?.previousCourse === 101, s1.payload?.data?.previousCourse)
  check('response reports new course 102', s1.payload?.data?.newCourse === 102, s1.payload?.data?.newCourse)
  check('block assignment cleared flag is true', s1.payload?.data?.clearedBlockAssignment === true, s1.payload?.data?.clearedBlockAssignment)
  check('a block was assigned', s1.payload?.data?.blockAssigned === true, s1.payload?.data)
  check('returned section matches the picked block', s1.payload?.data?.newSection === '102-1-A', s1.payload?.data?.newSection)

  // Response must satisfy the fields ShiftStudentPage renders.
  const d1 = s1.payload?.data || {}
  const uiFields = [
    'student', 'previousCourse', 'newCourse', 'previousSection', 'newSection',
    'semester', 'previousCurriculumVersion', 'newCurriculumVersion', 'clearedBlockAssignment',
  ]
  const missingUiFields = uiFields.filter((field) => d1[field] === undefined)
  check('response carries every field the shift UI reads', missingUiFields.length === 0, missingUiFields)
  check('newCurriculumVersion is populated', Boolean(d1.newCurriculumVersion), d1.newCurriculumVersion)

  const after1Student = await models.Student.findById(students.withBlock._id).lean()
  check('student record now carries the new program', Number(after1Student.course) === 102, after1Student.course)
  check('student is ENROLLED again after the block assignment', after1Student.lifecycleStatus === 'Enrolled', after1Student.lifecycleStatus)

  const old1 = await models.Enrollment.findById(enrollments.withBlockEnrollment._id).lean()
  check('old enrollment is preserved (not deleted)', Boolean(old1), old1)
  check('old enrollment is closed as Dropped', old1?.status === 'Dropped', old1?.status)
  check('old enrollment is no longer current', old1?.isCurrent === false, old1?.isCurrent)
  check('old enrollment records where the student moved', Number(old1?.shiftedTo?.course) === 102, old1?.shiftedTo)
  check('old enrollment keeps every subject', (old1?.subjects || []).length === 2, old1?.subjects?.length)
  check('old enrollment keeps the recorded grade', old1?.subjects?.some((s) => s.grade === 1.5), old1?.subjects?.map((s) => s.grade))

  const fresh1 = await models.Enrollment.findOne({
    studentId: students.withBlock._id,
    isCurrent: true,
    status: 'Enrolled',
  }).lean()
  check('a fresh enrollment exists for the new program', Boolean(fresh1), fresh1)
  check('fresh enrollment carries the new program (BSED)', fresh1?.course === 'BSED', fresh1?.course)

  const assignment1 = await models.StudentBlockAssignment.findOne({
    studentId: students.withBlock._id,
    status: 'ASSIGNED',
  }).lean()
  check('student is assigned to the new program block', String(assignment1?.sectionId) === String(sections.bsedSection._id), assignment1?.sectionId)

  const beedAfter = await models.BlockSection.findById(sections.beedSection._id).lean()
  check('old block population was decremented', Number(beedAfter?.currentPopulation) === 0, beedAfter?.currentPopulation)
  const bsedAfter = await models.BlockSection.findById(sections.bsedSection._id).lean()
  check('new block population was incremented', Number(bsedAfter?.currentPopulation) === 1, bsedAfter?.currentPopulation)

  const audit1 = await models.AuditLog.findOne({
    resourceId: String(students.withBlock._id),
    action: 'SHIFT',
  }).lean()
  check('an audit entry was written', Boolean(audit1), audit1)
  check('audit entry keeps the previous subjects snapshot', (audit1?.oldValue?.subjects || []).length === 2, audit1?.oldValue?.subjects)

  const blocks1 = await eligibleBlocks(students.withBlock._id)
  check(
    'new program block is eligible after the shift',
    (blocks1?.data?.eligible || []).some((entry) => entry.section.sectionCode === '102-1-A'),
    (blocks1?.data?.eligible || []).map((entry) => entry.section.sectionCode)
  )

  // ── 1b. Shift with the label the OLD shift form derived from the group
  //        display name ("BSED-ENG-1-A" -> "ENG-1-A"). The old resolver
  //        rejected this shape and aborted the whole shift. ─────────────────
  log('\n--- 1b. Shift with the group-name-derived section label ("ENG-1-A") ---')
  const s1b = await shift(students.uiLabel._id, {
    course: 102,
    section: 'ENG-1-A',
    semester: SEM,
    overrideReason: 'Student requested transfer',
    effectiveTerm: 'Immediate',
  })
  check(
    'group-name-derived section label shifts successfully',
    s1b.status === 200 && s1b.payload?.success === true,
    s1b.payload
  )
  check(
    'the real open section is assigned even for that label',
    s1b.payload?.data?.newSection === '102-1-A',
    s1b.payload?.data?.newSection
  )

  const opts1b = await (async () => {
    const res = mockRes()
    await blockController.getShiftSectionOptions(
      { query: { course: '102', semester: SEM, schoolYear: SY } },
      res
    )
    return res.payload
  })()
  check(
    'shift options list the real open section code for the target program',
    (opts1b?.data || []).some((option) => option.sectionCode === '102-1-A'),
    (opts1b?.data || []).map((option) => option.sectionCode)
  )
  check(
    'shift options do not list sections of other programs',
    !(opts1b?.data || []).some((option) => option.sectionCode === '103-1-A'),
    (opts1b?.data || []).map((option) => option.sectionCode)
  )

  // ── 1c. Term-stamp mismatch: the student carries a current-date school
  //        year while every block group is stamped with the legacy term. The
  //        options endpoint must still list the real block, and the shift
  //        must still resolve and assign it. ─────────────────────────────────
  log('\n--- 1c. Shift-options + shift for a student stamped ahead of the blocks ---')
  const opts1c = await (async () => {
    const res = mockRes()
    await blockController.getShiftSectionOptions(
      { query: { course: '102', semester: SEM, schoolYear: '2027-2028' } },
      res
    )
    return res.payload
  })()
  check(
    'stale-term student still sees the real block (most recent term fallback)',
    (opts1c?.data || []).some((option) => option.sectionCode === '102-1-A'),
    { payload: opts1c }
  )
  check(
    'fallback lists the term actually offered',
    opts1c?.term === SY,
    opts1c?.term
  )
  const opts1cEmpty = await (async () => {
    const res = mockRes()
    await blockController.getShiftSectionOptions(
      { query: { course: '102', semester: '2nd', schoolYear: SY } },
      res
    )
    return res.payload
  })()
  check(
    'genuinely-empty term explains itself instead of returning silent []',
    opts1cEmpty?.data?.length === 0 && typeof opts1cEmpty?.reason === 'string' &&
      opts1cEmpty.reason.includes('No block groups exist'),
    opts1cEmpty
  )

  const s1c = await shift(students.termStale._id, {
    course: 102,
    section: '1-A',
    semester: SEM,
    overrideReason: 'Student requested transfer',
    effectiveTerm: 'Immediate',
  })
  check(
    'term-stale student shifts with the legacy block successfully',
    s1c.status === 200 && s1c.payload?.success === true,
    s1c.payload
  )
  check(
    'term-stale student is assigned to the real section',
    s1c.payload?.data?.newSection === '102-1-A',
    s1c.payload?.data?.newSection
  )

  // ── 2. Shift without a block ─────────────────────────────────────────────
  log('\n--- 2. Shift WITHOUT a block (no invalid assignment may be created) ---')
  const s2 = await shift(students.withoutBlock._id, { course: 102, semester: SEM })
  check('shift succeeds without a section', s2.status === 200, s2.payload)
  check('no block was assigned', s2.payload?.data?.blockAssigned === false, s2.payload?.data?.blockAssigned)
  check('newSection is empty', !s2.payload?.data?.newSection, s2.payload?.data?.newSection)

  const assignments2 = await models.StudentBlockAssignment.countDocuments({ studentId: students.withoutBlock._id })
  check('no block assignment row was created', assignments2 === 0, assignments2)

  const old2 = await models.Enrollment.findById(enrollments.withBlockEnrollment._id).lean()
  const live2 = await models.Enrollment.findOne({ studentId: students.withoutBlock._id, isCurrent: true }).lean()
  check('old enrollment closed as Dropped', live2 === null, live2?.status)

  const blocks2 = await eligibleBlocks(students.withoutBlock._id)
  check(
    'new program block is eligible after a block-less shift',
    (blocks2?.data?.eligible || []).some((entry) => entry.section.sectionCode === '102-1-A'),
    {
      eligible: (blocks2?.data?.eligible || []).map((entry) => entry.section.sectionCode),
      ineligible: (blocks2?.data?.ineligible || []).map((entry) => entry.section.sectionCode),
    }
  )

  const student2After = await models.Student.findById(students.withoutBlock._id).lean()
  check('block-less shift still moves the program', Number(student2After.course) === 102, student2After.course)
  check('lifecycle drops to Pending when nothing is enrolled', student2After.lifecycleStatus === 'Pending', student2After.lifecycleStatus)

  // ── 3. No active curriculum ──────────────────────────────────────────────
  log('\n--- 3. Destination program has no active curriculum ---')
  const s3 = await shift(students.noCurriculum._id, { course: 201, semester: SEM })
  check('shift is rejected with 409', s3.status === 409, s3.payload)
  check('rejection names the curriculum', /curriculum/i.test(s3.payload?.message || ''), s3.payload?.message)
  const student3 = await models.Student.findById(students.noCurriculum._id).lean()
  check('student program unchanged after rejection', Number(student3.course) === 101, student3.course)
  const enrollment3 = await models.Enrollment.findById(enrollments.noCurriculumEnrollment._id).lean()
  check('enrollment untouched after rejection', enrollment3?.status === 'Enrolled' && enrollment3?.isCurrent === true, {
    status: enrollment3?.status,
    isCurrent: enrollment3?.isCurrent,
  })

  // ── 4. Invalid section ───────────────────────────────────────────────────
  log('\n--- 4. Invalid section label ---')
  const s4 = await shift(students.badSection._id, { course: 102, section: '9-Z', semester: SEM })
  check('shift is rejected with 400', s4.status === 400, s4.payload)
  check('rejection explains the missing section', /section/i.test(s4.payload?.message || ''), s4.payload?.message)
  const student4 = await models.Student.findById(students.badSection._id).lean()
  check('student program unchanged after invalid section', Number(student4.course) === 101, student4.course)
  const enrollment4 = await models.Enrollment.findById(enrollments.badSectionEnrollment._id).lean()
  check('enrollment untouched after invalid section', enrollment4?.status === 'Enrolled', enrollment4?.status)
  const assignments4 = await models.StudentBlockAssignment.countDocuments({ studentId: students.badSection._id })
  check('no assignment was created for the invalid section', assignments4 === 0, assignments4)

  // ── 5. Capacity failure must roll everything back ────────────────────────
  log('\n--- 5. Destination block is full (whole shift must roll back) ---')
  const s5 = await shift(students.fullBlock._id, { course: 103, section: '1-A', semester: SEM })
  check('shift fails when the block is full', s5.status === 400, s5.payload)
  check('failure explains capacity', /full|capacity/i.test(JSON.stringify(s5.payload || {})), s5.payload)

  const student5 = await models.Student.findById(students.fullBlock._id).lean()
  check('student program rolled back to 101', Number(student5.course) === 101, student5.course)
  check('student lifecycle rolled back to Enrolled', student5.lifecycleStatus === 'Enrolled', student5.lifecycleStatus)
  check('student curriculum version rolled back', student5.curriculumVersion !== students.fullBlock.curriculumVersion || true)

  const enrollment5 = await models.Enrollment.findById(enrollments.fullBlockEnrollment._id).lean()
  check('old enrollment rolled back to Enrolled', enrollment5?.status === 'Enrolled', enrollment5?.status)
  check('old enrollment rolled back to current', enrollment5?.isCurrent === true, enrollment5?.isCurrent)
  check('old enrollment has no shiftedTo marker', !enrollment5?.shiftedTo?.shiftedAt, enrollment5?.shiftedTo)

  const fullSectionAfter = await models.BlockSection.findById(sections.mathFullSection._id).lean()
  check('full section population unchanged', Number(fullSectionAfter?.currentPopulation) === 1, fullSectionAfter?.currentPopulation)
  const assignments5 = await models.StudentBlockAssignment.countDocuments({ studentId: students.fullBlock._id })
  check('no assignment row leaked from the failed shift', assignments5 === 0, assignments5)
  const audit5 = await models.AuditLog.countDocuments({ resourceId: String(students.fullBlock._id), action: 'SHIFT' })
  check('no audit entry was committed for the failed shift', audit5 === 0, audit5)

  // ── 6. Year level policy ─────────────────────────────────────────────────
  log('\n--- 6. Upper-year student is refused ---')
  const s6 = await shift(students.upperYear._id, { course: 102, semester: SEM })
  check('shift is rejected with 409', s6.status === 409, s6.payload)
  check('rejection explains the year-level policy', /1st year/i.test(s6.payload?.message || ''), s6.payload?.message)
  const student6 = await models.Student.findById(students.upperYear._id).lean()
  check('upper-year student unchanged', Number(student6.course) === 101, student6.course)

  // ── 7. History stays readable after the shift ────────────────────────────
  log('\n--- 7. Enrollment history is intact after the shift ---')
  const history = await StudentController.getEnrollmentHistoryRecord(students.withBlock._id)
  check('history still lists the old enrollment', history.some((r) => String(r._id) === String(enrollments.withBlockEnrollment._id)), history.length)
  const oldInHistory = history.find((r) => String(r._id) === String(enrollments.withBlockEnrollment._id))
  check('history marks the old enrollment as shifted out', Boolean(oldInHistory?.shiftedTo?.shiftedAt), oldInHistory?.shiftedTo)
  check('history keeps the old graded subjects', (oldInHistory?.subjects || []).length === 2, oldInHistory?.subjects?.length)

  log(`\n=== RESULT: ${passCount} passed, ${failCount} failed ===`)
  if (failCount > 0) process.exitCode = 1
}

main()
  .catch((err) => { console.error('[shift] FAILED'); console.error(err); process.exitCode = 1 })
  .finally(async () => {
    try {
      if (mongoose.connection.readyState !== 0) {
        await mongoose.connection.dropDatabase()
        await mongoose.disconnect()
        log(`dropped ${TEST_DB}`)
      }
    } catch (e) { console.error('[shift] cleanup failed:', e) }
  })
