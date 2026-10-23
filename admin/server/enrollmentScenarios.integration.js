'use strict'

/**
 * Dynamic mock test: "Can we still enroll them?"
 *
 * Seeds a cloned test DB with:
 *   - multiple block sections across Years 1-4 (one program, plus a capacity-full
 *     section and a second program for shiftee testing)
 *   - students in real-world lifecycle states:
 *       * regular active        (baseline - must enroll)
 *       * dropped               (must be able to re-enroll)
 *       * returning / returnee  (must be able to enroll)
 *       * shiftee               (changed course - eligibility must report a reason)
 *
 * Every scenario runs through the REAL services/controllers:
 *   - blockEligibilityService.getEligibleBlocks  (what the picker shows)
 *   - blockController.assignStudent              (the transactional assign path)
 *
 * The test DB is dropped at the end. The live DB is only read (for reference
 * collections) and never written.
 */

const path = require('path')
const fs = require('fs')
const assert = require('assert')
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

const LIVE_DB = 'wcc-admin'
const TEST_DB = 'wcc-admin-enrollment-test'
const SY = '2026-2027'
const SEM = '1st'
const YEAR = 2026
const ADMIN_ID = '69889269c0f10a42b739488b'

// Reference collections cloned from live so curriculum resolution / auto
// subject population behave exactly as in production.
const REF_COLLECTIONS = ['curriculums', 'curriculumsubjects', 'subjects', 'systemsettings']

const uri = process.env.MONGODB_URI
if (!uri) throw new Error('MONGODB_URI is not configured')
const testUrl = new URL(uri)
testUrl.pathname = `/${TEST_DB}`
const testUri = testUrl.toString()

function log(msg) { console.log(`[scenario] ${msg}`) }

// ─── tiny mock req/res so we can drive the real controllers ───
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
    log(`  FAIL  ${label}${detail ? ` :: ${util.inspect(detail, { depth: 3 })}` : ''}`)
  }
}

// ─── clone reference collections ───
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

// ─── seed mock blocks + students ───
async function seed() {
  const BlockGroup = mongoose.model('BlockGroup')
  const BlockSection = mongoose.model('BlockSection')
  const Student = mongoose.model('Student')
  const Enrollment = mongoose.model('Enrollment')
  const StudentBlockAssignment = mongoose.model('StudentBlockAssignment')

  const mkGroup = async (courseId, yearLevel, name) => {
    const [g] = await BlockGroup.create([{
      name,
      courseId,
      courseCode: String(courseId),
      yearLevel,
      semester: SEM,
      schoolYear: SY,
      year: SY,
      section: 'A',
    }])
    return g
  }
  const mkSection = async (group, code, capacity, population = 0) => {
    const [s] = await BlockSection.create([{
      blockGroupId: group._id,
      sectionCode: code,
      capacity,
      currentPopulation: population,
      status: 'OPEN',
    }])
    return s
  }

  // Blocks: BEED (101) Years 1-4. Year 1 has two sections (one will be filled).
  const g101y1 = await mkGroup(101, 1, 'BEED-1-A')
  const g101y2 = await mkGroup(101, 2, 'BEED-2-A')
  const g101y3 = await mkGroup(101, 3, 'BEED-3-A')
  const g101y4 = await mkGroup(101, 4, 'BEED-4-A')
  const sec_y1_open = await mkSection(g101y1, '101-1-A', 4, 0)
  const sec_y1_full = await mkSection(g101y1, '101-1-B', 1, 1) // already full
  const sec_y2 = await mkSection(g101y2, '101-2-A', 4, 0)
  const sec_y3 = await mkSection(g101y3, '101-3-A', 4, 0)
  const sec_y4 = await mkSection(g101y4, '101-4-A', 4, 0)

  // A second program block (BSED-English 102) for shiftee testing.
  const g102y1 = await mkGroup(102, 1, 'BSED-ENG-1-A')
  const sec_102_y1 = await mkSection(g102y1, '102-1-A', 4, 0)

  let seq = 0
  const mkStudent = async (fields) => {
    seq += 1
    const number = `2026${String(seq).padStart(8, '0')}` // 12 digits
    const [s] = await Student.create([{
      studentNumber: number,
      firstName: fields.firstName || `Test${seq}`,
      lastName: fields.lastName || `Scenario${seq}`,
      course: fields.course,
      yearLevel: fields.yearLevel,
      semester: SEM,
      schoolYear: SY,
      studentStatus: fields.studentStatus || 'Regular',
      classification: fields.classification || 'Regular',
      lifecycleStatus: fields.lifecycleStatus || 'Pending',
      enrollmentStatus: fields.enrollmentStatus || 'Not Enrolled',
      isActive: fields.isActive !== undefined ? fields.isActive : true,
      section: fields.section || '',
      corStatus: 'Pending',
      contactNumber: '09000000000',
      address: 'Test Address',
    }])
    return s
  }

  const mkEnrollment = async (student, fields) => {
    const [e] = await Enrollment.create([{
      studentId: student._id,
      studentNumber: student.studentNumber,
      schoolYear: fields.schoolYear || SY,
      semester: SEM,
      yearLevel: fields.yearLevel || student.yearLevel,
      course: fields.course,
      subjects: [],
      assessment: { tuitionFee: 0, miscFee: 0, otherFees: 0, totalAmount: 0 },
      status: fields.status,
      isCurrent: fields.isCurrent !== undefined ? fields.isCurrent : true,
      createdBy: ADMIN_ID,
    }])
    return e
  }

  // 1. Regular active student (baseline) - already has an Enrolled enrollment.
  const regular = await mkStudent({ course: 101, yearLevel: 1, lifecycleStatus: 'Enrolled', enrollmentStatus: 'Enrolled', studentStatus: 'Regular' })
  await mkEnrollment(regular, { course: 'BEED', status: 'Enrolled', isCurrent: true })

  // 2. Dropped student - dropped last term, wants to come back.
  const dropped = await mkStudent({ course: 101, yearLevel: 1, lifecycleStatus: 'Inactive', enrollmentStatus: 'Dropped', studentStatus: 'Irregular' })
  await mkEnrollment(dropped, { course: 'BEED', status: 'Dropped', isCurrent: true })

  // 3. Returning student - no current enrollment this term (had a locked one).
  const returning = await mkStudent({ course: 101, yearLevel: 2, lifecycleStatus: 'Not Enrolled', enrollmentStatus: 'Not Enrolled', studentStatus: 'Returnee', classification: 'Returning' })
  const [oldLocked] = await Enrollment.create([{
    studentId: returning._id,
    studentNumber: returning.studentNumber,
    schoolYear: '2025-2026',
    semester: '2nd',
    yearLevel: 2,
    course: 'BEED',
    subjects: [],
    assessment: { tuitionFee: 0, miscFee: 0, otherFees: 0, totalAmount: 0 },
    status: 'Completed',
    isCurrent: false,
    lockedAt: new Date('2025-07-01'),
    createdBy: ADMIN_ID,
  }])

  // 4. Shiftee - record course updated to BSED-English (102), but the LIVE
  //    enrollment still carries the OLD program (BEED / 101). Because that
  //    enrollment is live, eligibility treats it as authoritative and pins the
  //    student to BEED blocks until the stale enrollment is dropped.
  const shiftee = await mkStudent({ course: 102, yearLevel: 1, lifecycleStatus: 'Enrolled', enrollmentStatus: 'Enrolled', studentStatus: 'Transferee', classification: 'Transferee' })
  await mkEnrollment(shiftee, { course: 'BEED', status: 'Enrolled', isCurrent: true, yearLevel: 1 })

  // 5. Shiftee with NO enrollment at all (clean transfer) - should be eligible
  //    for their CURRENT course's block.
  const shifteeClean = await mkStudent({ course: 101, yearLevel: 1, lifecycleStatus: 'Pending', enrollmentStatus: 'Not Enrolled', studentStatus: 'Transferee', classification: 'Transferee' })

  // 6. Shiftee whose old-program enrollment was DROPPED. The drop makes the
  //    enrollment "unusable", so assign auto-creates a fresh enrollment from the
  //    student's CURRENT course (102 -> BSED) - they can then enroll into the
  //    BSED-English block.
  const shifteeDropped = await mkStudent({ course: 102, yearLevel: 1, lifecycleStatus: 'Inactive', enrollmentStatus: 'Dropped', studentStatus: 'Transferee', classification: 'Transferee' })
  await mkEnrollment(shifteeDropped, { course: 'BEED', status: 'Dropped', isCurrent: true, yearLevel: 1 })

  // ─── Year 3 (upper-year) students for block 101-3-A ───
  // 7. Regular Year 3 - active Enrolled enrollment, baseline for the Y3 block.
  const y3Regular = await mkStudent({ course: 101, yearLevel: 3, lifecycleStatus: 'Enrolled', enrollmentStatus: 'Enrolled', studentStatus: 'Regular' })
  await mkEnrollment(y3Regular, { course: 'BEED', status: 'Enrolled', isCurrent: true, yearLevel: 3 })

  // 8. Dropped Year 3 - dropped mid-year, wants to re-enter the Y3 block.
  const y3Dropped = await mkStudent({ course: 101, yearLevel: 3, lifecycleStatus: 'Inactive', enrollmentStatus: 'Dropped', studentStatus: 'Irregular' })
  await mkEnrollment(y3Dropped, { course: 'BEED', status: 'Dropped', isCurrent: true, yearLevel: 3 })

  // 9. Returning Year 3 - no current enrollment this term (locked prior record).
  const y3Returning = await mkStudent({ course: 101, yearLevel: 3, lifecycleStatus: 'Not Enrolled', enrollmentStatus: 'Not Enrolled', studentStatus: 'Returnee', classification: 'Returning' })
  await Enrollment.create([{
    studentId: y3Returning._id,
    studentNumber: y3Returning.studentNumber,
    schoolYear: '2025-2026',
    semester: '2nd',
    yearLevel: 3,
    course: 'BEED',
    subjects: [],
    assessment: { tuitionFee: 0, miscFee: 0, otherFees: 0, totalAmount: 0 },
    status: 'Completed',
    isCurrent: false,
    lockedAt: new Date('2025-07-01'),
    createdBy: ADMIN_ID,
  }])

  // 10. Irregular Year 3 - must still be assignable to the Y3 block.
  const y3Irregular = await mkStudent({ course: 101, yearLevel: 3, lifecycleStatus: 'Pending', enrollmentStatus: 'Not Enrolled', studentStatus: 'Irregular', classification: 'Irregular' })

  // ─── Year 4 (graduating) students for block 101-4-A ───
  // 11. Regular Year 4 - active Enrolled enrollment, baseline for the Y4 block.
  const y4Regular = await mkStudent({ course: 101, yearLevel: 4, lifecycleStatus: 'Enrolled', enrollmentStatus: 'Enrolled', studentStatus: 'Regular' })
  await mkEnrollment(y4Regular, { course: 'BEED', status: 'Enrolled', isCurrent: true, yearLevel: 4 })

  // 12. Dropped Year 4 - re-entering the graduating block.
  const y4Dropped = await mkStudent({ course: 101, yearLevel: 4, lifecycleStatus: 'Inactive', enrollmentStatus: 'Dropped', studentStatus: 'Irregular' })
  await mkEnrollment(y4Dropped, { course: 'BEED', status: 'Dropped', isCurrent: true, yearLevel: 4 })

  // 13. Returning Year 4 - took a term off, coming back to graduate.
  const y4Returning = await mkStudent({ course: 101, yearLevel: 4, lifecycleStatus: 'Not Enrolled', enrollmentStatus: 'Not Enrolled', studentStatus: 'Returnee', classification: 'Returning' })
  await Enrollment.create([{
    studentId: y4Returning._id,
    studentNumber: y4Returning.studentNumber,
    schoolYear: '2025-2026',
    semester: '2nd',
    yearLevel: 4,
    course: 'BEED',
    subjects: [],
    assessment: { tuitionFee: 0, miscFee: 0, otherFees: 0, totalAmount: 0 },
    status: 'Completed',
    isCurrent: false,
    lockedAt: new Date('2025-07-01'),
    createdBy: ADMIN_ID,
  }])

  // 14. Year 4 student in the WRONG block test target - Year 3 trying to jump up
  //     to the Year 4 block must be rejected with a year-level reason.
  const y3TooYoung = await mkStudent({ course: 101, yearLevel: 3, lifecycleStatus: 'Enrolled', enrollmentStatus: 'Enrolled', studentStatus: 'Regular' })
  await mkEnrollment(y3TooYoung, { course: 'BEED', status: 'Enrolled', isCurrent: true, yearLevel: 3 })

  return {
    sections: { sec_y1_open, sec_y1_full, sec_y2, sec_y3, sec_y4, sec_102_y1 },
    students: {
      regular, dropped, returning, shiftee, shifteeClean, shifteeDropped,
      y3Regular, y3Dropped, y3Returning, y3Irregular, y3TooYoung,
      y4Regular, y4Dropped, y4Returning,
    },
    models: { Student, Enrollment, StudentBlockAssignment, BlockSection },
    oldLockedId: oldLocked._id,
  }
}

async function main() {
  await cloneReference()
  await mongoose.connect(testUri, { serverSelectionTimeoutMS: 30000 })
  log('connected to test DB')

  const blockController = require('./controllers/blockController')
  const eligibility = require('./services/blockEligibilityService')

  const { sections, students, models } = await seed()
  log('seeded mock blocks (Years 1-4) + scenario students')

  // ─── Helper: drive the real assignStudent controller ───
  // Atlas shared tier occasionally throws transient errors (code-8000 dbStats
  // timeout, IX-lock acquisition, TransientTransactionError). Retry those so the
  // test measures our logic, not the flaky shared-tier plumbing.
  async function assignOnce(studentId, sectionId) {
    const req = { body: { studentId: String(studentId), sectionId: String(sectionId), semester: SEM, year: YEAR }, registrarId: ADMIN_ID, adminId: ADMIN_ID }
    const res = mockRes()
    await blockController.assignStudent(req, res)
    return { status: res._status, payload: res.payload }
  }
  async function assign(studentId, sectionId) {
    let last
    const transientRe = /space quota|dbStats|MaxTimeMSExpired|internal atlas error|another change was in progress|Unable to acquire IX lock|TransientTransactionError/i
    for (let attempt = 0; attempt < 5; attempt++) {
      last = await assignOnce(studentId, sectionId)
      const msg = JSON.stringify(last.payload || {})
      if (last.status >= 500 && transientRe.test(msg)) {
        await new Promise((r) => setTimeout(r, 500 * (attempt + 1)))
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

  log('\n--- 1. Regular active student (baseline) ---')
  {
    const list = await eligibleBlocks(students.regular._id)
    check('getEligibleBlocks returns success', list && list.success === true, list)
    const elig = list?.data?.eligible || []
    const inelig = list?.data?.ineligible || []
    check('Year 1 open section is eligible', elig.some(e => e.section.sectionCode === '101-1-A'), { elig: elig.map(e => e.section.sectionCode) })
    check('Year 2 block is NOT eligible (wrong year)', !elig.some(e => e.section.sectionCode === '101-2-A'))
    check('BSED block is NOT eligible (wrong program)', !elig.some(e => e.section.sectionCode === '102-1-A'))

    const r = await assign(students.regular._id, sections.sec_y2._id)
    check('assign to Year 2 block is rejected (year mismatch)', r.status === 400 && /year level/i.test((r.payload?.reasons || []).join(' ')), r)

    const r2 = await assign(students.regular._id, sections.sec_y1_open._id)
    check('assign to Year 1 open section succeeds', r2.status === 200 && r2.payload?.status === 'ASSIGNED', r2)
    check('assignment finalizes to Enrolled', r2.payload?.enrolled === true, r2)
  }

  log('\n--- 2. Dropped student re-enrolling ---')
  {
    const r = await assign(students.dropped._id, sections.sec_y1_open._id)
    check('dropped student can be assigned', r.status === 200 && r.payload?.status === 'ASSIGNED', r)
    check('a fresh enrollment was created + finalized', r.payload?.enrolled === true, r)
    const after = await models.Student.findById(students.dropped._id).lean()
    check('lifecycle moved to Enrolled', after?.lifecycleStatus === 'Enrolled', after)
  }

  log('\n--- 3. Returning / returnee student ---')
  {
    const r = await assign(students.returning._id, sections.sec_y2._id)
    check('returning student (no current enrollment) can be assigned', r.status === 200 && r.payload?.status === 'ASSIGNED', r)
    check('enrollment finalized', r.payload?.enrolled === true, r)
    const after = await models.Student.findById(students.returning._id).lean()
    check('lifecycle moved to Enrolled', after?.lifecycleStatus === 'Enrolled', after)
  }

  log('\n--- 4. Shiftee with LIVE old-program enrollment (record=102, enrollment=BEED) ---')
  {
    // The student's record course was updated to 102 (BSED-English), but their
    // live Enrolled enrollment still says BEED. Eligibility treats the live
    // enrollment as authoritative, so the NEW program's block is flagged until
    // the stale enrollment is dropped.
    const list = await eligibleBlocks(students.shiftee._id)
    check('getEligibleBlocks returns success', list && list.success === true, list)
    const elig = list?.data?.eligible || []
    const inelig = list?.data?.ineligible || []
    const flagged = inelig.find(e => e.section.sectionCode === '102-1-A')
    check('NEW program (BSED) block is NOT eligible while old enrollment is live', !elig.some(e => e.section.sectionCode === '102-1-A'), { elig: elig.map(e => e.section.sectionCode) })
    check('ineligible entry carries an actionable program reason', flagged && /program|course/i.test((flagged.reasons || []).join(' ')), flagged)

    const r = await assign(students.shiftee._id, sections.sec_102_y1._id)
    check('assign to NEW program block is rejected with a program reason', r.status === 400 && /program|course/i.test((r.payload?.reasons || []).join(' ')), r)
  }

  log('\n--- 5. Shiftee with NO enrollment (clean transfer) ---')
  {
    const list = await eligibleBlocks(students.shifteeClean._id)
    check('getEligibleBlocks returns success', list && list.success === true, list)
    const elig = list?.data?.eligible || []
    check('BEED Year 1 block is eligible', elig.some(e => e.section.sectionCode === '101-1-A'), { elig: elig.map(e => e.section.sectionCode) })

    const r = await assign(students.shifteeClean._id, sections.sec_y1_open._id)
    check('clean shiftee can be assigned', r.status === 200 && r.payload?.status === 'ASSIGNED', r)
    check('enrollment finalized', r.payload?.enrolled === true, r)
  }

  log('\n--- 5b. Shiftee whose OLD-program enrollment is DROPPED ---')
  {
    // The stale BEED enrollment is Dropped, so it is "unusable": assign creates a
    // fresh enrollment from the student's CURRENT course (102 -> BSED) and the
    // student can enroll into the NEW program's block.
    const r = await assign(students.shifteeDropped._id, sections.sec_102_y1._id)
    check('dropped-old shiftee can enroll in NEW program block', r.status === 200 && r.payload?.status === 'ASSIGNED', r)
    check('enrollment finalized', r.payload?.enrolled === true, r)
    const after = await models.Student.findById(students.shifteeDropped._id).lean()
    check('lifecycle moved to Enrolled', after?.lifecycleStatus === 'Enrolled', after)
    const fresh = await models.Enrollment.findOne({ studentId: students.shifteeDropped._id, isCurrent: true }).lean()
    check('fresh enrollment carries the NEW course (BSED)', fresh && fresh.course === 'BSED', fresh && fresh.course)
  }

  log('\n--- 5c. Year 3 students enrolling into the Y3 block (101-3-A) ---')
  {
    // Baseline: active Year 3 student.
    const r1 = await assign(students.y3Regular._id, sections.sec_y3._id)
    check('regular Year 3 can be assigned to Y3 block', r1.status === 200 && r1.payload?.status === 'ASSIGNED', r1)
    check('enrollment finalized', r1.payload?.enrolled === true, r1)

    // Dropped Year 3 re-entering.
    const r2 = await assign(students.y3Dropped._id, sections.sec_y3._id)
    check('dropped Year 3 can re-enter the Y3 block', r2.status === 200 && r2.payload?.status === 'ASSIGNED', r2)

    // Returning Year 3 (no current enrollment).
    const r3 = await assign(students.y3Returning._id, sections.sec_y3._id)
    check('returning Year 3 can be assigned to Y3 block', r3.status === 200 && r3.payload?.status === 'ASSIGNED', r3)

    // Irregular Year 3.
    const r4 = await assign(students.y3Irregular._id, sections.sec_y3._id)
    check('irregular Year 3 can be assigned to Y3 block', r4.status === 200 && r4.payload?.status === 'ASSIGNED', r4)

    const after = await models.Student.find({ _id: { $in: [students.y3Regular._id, students.y3Dropped._id, students.y3Returning._id, students.y3Irregular._id] } }).lean()
    check('all Year 3 students reached Enrolled', after.every(s => s.lifecycleStatus === 'Enrolled'), after.map(s => s.lifecycleStatus))

    // A Year 3 student must not slip into the Year 4 block.
    const rBad = await assign(students.y3TooYoung._id, sections.sec_y4._id)
    check('Year 3 student is rejected from the Year 4 block', rBad.status === 400 && /year level/i.test((rBad.payload?.reasons || []).join(' ')), rBad)
  }

  log('\n--- 5d. Year 4 students enrolling into the Y4 block (101-4-A) ---')
  {
    const r1 = await assign(students.y4Regular._id, sections.sec_y4._id)
    check('regular Year 4 can be assigned to Y4 block', r1.status === 200 && r1.payload?.status === 'ASSIGNED', r1)
    check('enrollment finalized', r1.payload?.enrolled === true, r1)

    const r2 = await assign(students.y4Dropped._id, sections.sec_y4._id)
    check('dropped Year 4 can re-enter the Y4 block', r2.status === 200 && r2.payload?.status === 'ASSIGNED', r2)

    const r3 = await assign(students.y4Returning._id, sections.sec_y4._id)
    check('returning Year 4 can be assigned to Y4 block', r3.status === 200 && r3.payload?.status === 'ASSIGNED', r3)

    const after = await models.Student.find({ _id: { $in: [students.y4Regular._id, students.y4Dropped._id, students.y4Returning._id] } }).lean()
    check('all Year 4 students reached Enrolled', after.every(s => s.lifecycleStatus === 'Enrolled'), after.map(s => s.lifecycleStatus))

    // Section population reflects the real assignments (3 students).
    const secDoc = await models.BlockSection.findById(sections.sec_y4._id).lean()
    check('Y4 section population is 3', secDoc && secDoc.currentPopulation === 3, secDoc && secDoc.currentPopulation)
  }

  log('\n--- 6. Capacity is a hard stop (full section) ---')
  {
    const list = await eligibleBlocks(students.regular._id)
    const inelig = list?.data?.ineligible || []
    const full = inelig.find(e => e.section.sectionCode === '101-1-B')
    check('full section is reported ineligible', !!full, inelig.map(e => e.section.sectionCode))
    check('full section reason mentions capacity/full', full && /full|capacity/i.test((full.reasons || []).join(' ')), full)

    const r = await assign(students.regular._id, sections.sec_y1_full._id)
    check('assign to full section is rejected', r.status === 400, r)
  }

  log('\n--- 7. Idempotent same-section retry ---')
  {
    // regular is already assigned to 101-1-A from scenario 1.
    const r = await assign(students.regular._id, sections.sec_y1_open._id)
    check('retrying the same section reports success (no duplicate error)', r.status === 200 && r.payload?.alreadyAssigned === true, r)
  }

  log(`\n=== RESULT: ${passCount} passed, ${failCount} failed ===`)
  if (failCount > 0) process.exitCode = 1
}

main()
  .catch((err) => { console.error('[scenario] FAILED'); console.error(err); process.exitCode = 1 })
  .finally(async () => {
    try {
      if (mongoose.connection.readyState !== 0) {
        await mongoose.connection.dropDatabase()
        await mongoose.disconnect()
        log(`dropped ${TEST_DB}`)
      }
    } catch (e) { console.error('[scenario] cleanup failed:', e) }
  })
