'use strict'

/**
 * READ-ONLY diagnostic probe for the registrar shift-options dropdown.
 *
 * Prints the real field conventions the endpoint must match:
 *   - BlockGroup.semester / schoolYear / year / courseId / courseCode values
 *   - BlockSection.status / capacity / currentPopulation
 *   - Student.schoolYear / semester values (what the UI sends as schoolYear)
 *
 * No writes anywhere. Connection is closed at the end.
 */

const path = require('path')
const fs = require('fs')
const dotenv = require('dotenv')
const mongoose = require('mongoose')
require('../models/BlockGroup')
require('../models/BlockSection')
require('../models/Student')

;[
  ['../../.env', false],
  ['../../.env.credential-details', true],
  ['../../.env.credentail-details', true],
].forEach(([file, override]) => {
  const filePath = path.join(__dirname, file)
  if (fs.existsSync(filePath)) dotenv.config({ path: filePath, override })
})

const uri = process.env.MONGODB_URI
if (!uri) throw new Error('MONGODB_URI is not configured')

function log(msg) { console.log(`[probe] ${msg}`) }

async function main() {
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 30000 })
  const BlockGroup = mongoose.model('BlockGroup')
  const BlockSection = mongoose.model('BlockSection')
  const Student = mongoose.model('Student')

  const groups = await BlockGroup.find({}).lean()
  log(`BlockGroup count: ${groups.length}`)

  const summarize = (values) => {
    const counts = new Map()
    for (const value of values) {
      const key = `${typeof value}:${JSON.stringify(value ?? null)}`
      counts.set(key, (counts.get(key) || 0) + 1)
    }
    return Array.from(counts.entries())
      .map(([key, count]) => `    ${key} x${count}`)
      .join('\n')
  }

  log('BlockGroup.semester values:\n' + summarize(groups.map((g) => g.semester)))
  log('BlockGroup.schoolYear values:\n' + summarize(groups.map((g) => g.schoolYear)))
  log('BlockGroup.year values:\n' + summarize(groups.map((g) => g.year)))
  log('BlockGroup.courseId values:\n' + summarize(groups.map((g) => g.courseId)))
  log('BlockGroup.courseCode values:\n' + summarize(groups.map((g) => g.courseCode)))
  log('BlockGroup names (first 15): ' + JSON.stringify(groups.slice(0, 15).map((g) => g.name)))

  const sections = await BlockSection.find({}).lean()
  log(`BlockSection count: ${sections.length}`)
  log('BlockSection.status values:\n' + summarize(sections.map((s) => s.status)))
  log('BlockSection.capacity values:\n' + summarize(sections.map((s) => s.capacity)))
  log('BlockSection.sectionCode sample: ' + JSON.stringify(sections.slice(0, 15).map((s) => `${s.sectionCode} (${s.currentPopulation}/${s.capacity})`)))

  const students = await Student.find({ isActive: { $ne: false } })
    .limit(400)
    .select('schoolYear semester course yearLevel lifecycleStatus section')
    .lean()
  log(`Student sample count: ${students.length}`)
  log('Student.schoolYear values:\n' + summarize(students.map((s) => s.schoolYear)))
  log('Student.semester values:\n' + summarize(students.map((s) => s.semester)))
  log('Student.yearLevel values:\n' + summarize(students.map((s) => s.yearLevel)))

  // Simulate the REAL shift-options controller (read-only) for every term
  // case a registrar can hit.
  const blockController = require('../controllers/blockController')
  const callEndpoint = async (query) => {
    const res = {
      statusCode: 200,
      payload: undefined,
      status(code) { this.statusCode = code; return this },
      json(payload) { this.payload = payload; return this },
    }
    await blockController.getShiftSectionOptions({ query }, res)
    return { status: res.statusCode, payload: res.payload }
  }

  const buildQuery = (course, semester, schoolYear) => ({
    course: String(course),
    semester,
    ...(schoolYear ? { schoolYear } : {}),
  })

  const student2021 = students.find((s) => s.schoolYear === '2021-2022')
  const student2026 = students.find((s) => s.schoolYear === '2026-2027')

  for (const [label, student] of [['2021-2022 student', student2021], ['2026-2027 student', student2026]]) {
    if (!student) continue
    const reply = await callEndpoint(buildQuery(102, '1st', student.schoolYear))
    log(`${label} GET shift-options (course=102, semester=1st, schoolYear=${student.schoolYear}) ->`)
    log(`    status ${reply.status} payload ${JSON.stringify(reply.payload)}`)
  }

  for (const query of [
    buildQuery(102, '1st', ''),
    buildQuery(103, '2nd', '2021-2022'),
  ]) {
    const reply = await callEndpoint(query)
    log(`GET shift-options ${JSON.stringify(query)} -> status ${reply.status} payload ${JSON.stringify(reply.payload)}`)
  }

  await mongoose.disconnect()
  log('done (read-only)')
}

main().catch((error) => {
  console.error('[probe] failed:', error.message)
  process.exit(1)
})
