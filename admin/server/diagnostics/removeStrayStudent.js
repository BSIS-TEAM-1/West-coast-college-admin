/** Stray student cleanup: inspect references for one student, then delete after a backup. */
require('dotenv').config({ path: '../.env' });
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');

const STUDENT_NUMBER = '202210175751';
const BACKUP_DIR = path.join(__dirname, '..', 'backups', `stray-student_${STUDENT_NUMBER}`);

const REF_CHECKS = [
  ['enrollments', (id) => ({ $or: [{ studentId: id }, { studentId: String(id) }] })],
  ['studentblockassignments', (id) => ({ $or: [{ studentId: id }, { studentId: String(id) }] })],
  ['documents', (id) => ({ studentId: String(id) })],
  ['sectionwaitlists', (id) => ({ studentId: String(id) })],
  ['gradeauditlogs', (id) => ({ studentId: String(id) })],
  ['gradechangerequests', (id) => ({ studentId: String(id) })],
  ['blockactionlogs', (id) => ({ studentId: String(id) })],
  ['archivesnapshots', () => null], // skipped (immutable history, checked by studentNumber only)
];

(async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    const db = mongoose.connection.db;

    const students = await db.collection('students').find({ studentNumber: STUDENT_NUMBER }).toArray();
    if (students.length === 0) {
      console.log('No student found with that number. Nothing to do.');
      await mongoose.disconnect();
      return;
    }
    const student = students[0];
    console.log('target student:', JSON.stringify({ id: String(student._id), name: [student.firstName, student.middleName, student.lastName].filter(Boolean).join(' '), schoolYear: student.schoolYear, yearLevel: student.yearLevel, lifecycle: student.lifecycleStatus }, null, 1));

    const id = student._id;
    // Immutable-history collections that only reference the number (kept as logs)
    const hist = await db.collection('archivesnapshots').countDocuments({
      $or: [{ 'data.graduates.studentNumber': STUDENT_NUMBER }, { 'data.grades.studentNumber': STUDENT_NUMBER }],
    });
    console.log('archive snapshot references (history, not touched):', hist);

    let totalRefs = 0;
    for (const [name, buildFilter] of REF_CHECKS) {
      const filter = buildFilter(id);
      if (!filter) continue;
      const count = await db.collection(name).countDocuments(filter);
      totalRefs += count;
      console.log(`${name}: ${count}`);
    }

    // ---- Backup the student + all references ----
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
    const backup = { students: [student] };
    for (const [name, buildFilter] of REF_CHECKS) {
      const filter = buildFilter(id);
      if (!filter) continue;
      backup[name] = await db.collection(name).find(filter).toArray();
    }
    fs.writeFileSync(
      path.join(BACKUP_DIR, 'stray-student-backup.json'),
      JSON.stringify(backup, (_k, v) => (v && v._bsontype === 'ObjectId' ? v.toString() : v), 2),
    );
    console.log(`backup written -> ${BACKUP_DIR}`);

    // ---- Delete ----
    const res = await db.collection('students').deleteOne({ _id: id });
    console.log(`students deleted: ${res.deletedCount}`);
    let deletedRefs = 0;
    for (const [name, buildFilter] of REF_CHECKS) {
      const filter = buildFilter(id);
      if (!filter) continue;
      const r = await db.collection(name).deleteMany(filter);
      if (r.deletedCount) { deletedRefs += r.deletedCount; console.log(`  deleted from ${name}: ${r.deletedCount}`); }
    }
    console.log(`\ndone: student removed, ${deletedRefs} dependent record(s) removed (all backed up first).`);

    const remaining = await db.collection('students').countDocuments({});
    console.log(`students now in database: ${remaining}`);
  } catch (err) {
    console.error('FAILED:', err.message);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect().catch(() => {});
  }
})();
