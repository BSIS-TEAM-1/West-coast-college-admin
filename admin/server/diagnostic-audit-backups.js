/**
 * Re-query audit logs with correct field names from AuditLog model.
 * Also check backups more thoroughly.
 *
 * Read-only. Does NOT modify any records.
 */

const mongoose = require('mongoose');
require('dotenv').config();

const MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI;

async function run() {
  await mongoose.connect(MONGO_URI);
  const db = mongoose.connection.db;

  const AuditLog = require('./models/AuditLog');
  const Student = require('./models/Student');
  const Enrollment = require('./models/Enrollment');

  // === Audit logs for STUDENT DELETE actions ===
  console.log('=== STUDENT DELETE AUDIT LOGS ===\n');

  const deleteLogs = await AuditLog.find({
    action: 'DELETE',
    resourceType: 'STUDENT',
  }).sort({ createdAt: -1 }).limit(30).lean();
  console.log(`Student DELETE audit logs: ${deleteLogs.length}`);
  for (const log of deleteLogs) {
    console.log(`  ${log.createdAt} | ${log.action} | resourceType: ${log.resourceType} | resourceId: ${log.resourceId} | desc: ${log.description} | by: ${log.performedBy}`);
    if (log.oldValue) {
      console.log(`    oldValue: ${JSON.stringify(log.oldValue).substring(0, 300)}`);
    }
  }
  console.log('');

  // === Audit logs for all STUDENT actions ===
  console.log('=== ALL STUDENT AUDIT LOGS (last 30) ===\n');

  const studentLogs = await AuditLog.find({
    resourceType: 'STUDENT',
  }).sort({ createdAt: -1 }).limit(30).lean();
  console.log(`Total student audit logs (last 30): ${studentLogs.length}`);
  for (const log of studentLogs) {
    console.log(`  ${log.createdAt} | ${log.action} | resourceId: ${log.resourceId} | desc: ${log.description}`);
  }
  console.log('');

  // === Search audit logs for specific student IDs ===
  const orphanStudentIds = [
    '6992de9570953e5e5045da0b',
    '69954febb7be5a2a7ee6bd00',
  ];

  for (const sid of orphanStudentIds) {
    console.log(`=== AUDIT LOGS FOR STUDENT ID: ${sid} ===\n`);
    const logs = await AuditLog.find({
      resourceId: sid,
    }).sort({ createdAt: 1 }).limit(20).lean();
    console.log(`Audit logs: ${logs.length}`);
    for (const log of logs) {
      console.log(`  ${log.createdAt} | ${log.action} | ${log.description} | by: ${log.performedBy}`);
      if (log.oldValue) {
        const old = typeof log.oldValue === 'object' ? JSON.stringify(log.oldValue).substring(0, 500) : String(log.oldValue).substring(0, 500);
        console.log(`    oldValue: ${old}`);
      }
      if (log.newValue) {
        const newVal = typeof log.newValue === 'object' ? JSON.stringify(log.newValue).substring(0, 500) : String(log.newValue).substring(0, 500);
        console.log(`    newValue: ${newVal}`);
      }
    }
    console.log('');
  }

  // === Search audit logs by studentNumber in description ===
  console.log('=== AUDIT LOGS SEARCH BY STUDENT NUMBER IN DESCRIPTION ===\n');

  const studentNumbers = ['2024-BSBA-HRM-95392', '2024-BEED-28391', '202410128391'];
  for (const sn of studentNumbers) {
    const regex = new RegExp(sn, 'i');
    const logs = await AuditLog.find({
      $or: [
        { description: regex },
        { resourceName: regex },
      ]
    }).sort({ createdAt: 1 }).limit(10).lean();
    console.log(`StudentNumber '${sn}': ${logs.length} audit logs`);
    for (const log of logs) {
      console.log(`  ${log.createdAt} | ${log.action} | resourceId: ${log.resourceId} | desc: ${log.description}`);
    }
    console.log('');
  }

  // === Search audit logs for ENROLLMENT actions ===
  console.log('=== ENROLLMENT-RELATED AUDIT LOGS ===\n');

  const enrollmentLogs = await AuditLog.find({
    $or: [
      { resourceType: 'REGISTRATION' },
      { description: /enroll/i },
      { description: /enrollment/i },
    ]
  }).sort({ createdAt: -1 }).limit(20).lean();
  console.log(`Enrollment-related audit logs: ${enrollmentLogs.length}`);
  for (const log of enrollmentLogs) {
    console.log(`  ${log.createdAt} | ${log.action} | resourceType: ${log.resourceType} | resourceId: ${log.resourceId} | desc: ${log.description}`);
  }
  console.log('');

  // === Check backups collection structure ===
  console.log('=== BACKUPS COLLECTION STRUCTURE ===\n');

  const backupsCollection = db.collection('backups');
  const sampleBackup = await backupsCollection.findOne({});
  if (sampleBackup) {
    console.log('Sample backup keys:', Object.keys(sampleBackup));
    console.log('Sample backup _id:', sampleBackup._id);
    console.log('Sample backup createdAt:', sampleBackup.createdAt);
    // Check if backup has data.students
    if (sampleBackup.data) {
      console.log('backup.data keys:', Object.keys(sampleBackup.data));
    }
    if (sampleBackup.collections) {
      console.log('backup.collections keys:', Object.keys(sampleBackup.collections));
    }
    // Check for student data in first backup
    if (sampleBackup.data?.students) {
      console.log(`backup.data.students count: ${sampleBackup.data.students.length}`);
      if (sampleBackup.data.students.length > 0) {
        console.log('First student in backup:', JSON.stringify(sampleBackup.data.students[0]).substring(0, 300));
      }
    }
  }
  console.log('');

  // === Search ALL backups for orphan student IDs ===
  console.log('=== SEARCH ALL BACKUPS FOR ORPHAN STUDENT IDs ===\n');

  for (const sid of orphanStudentIds) {
    // Try different backup structures
    const backups1 = await backupsCollection.find({
      'data.students._id': sid
    }).sort({ createdAt: -1 }).limit(5).toArray();
    console.log(`Student ${sid} found in ${backups1.length} backups (data.students._id string match)`);

    // Also try with ObjectId
    const backups2 = await backupsCollection.find({
      'data.students': { $elemMatch: { _id: mongoose.Types.ObjectId(sid) } }
    }).sort({ createdAt: -1 }).limit(5).toArray();
    console.log(`Student ${sid} found in ${backups2.length} backups (ObjectId match)`);

    for (const backup of [...backups1, ...backups2]) {
      const students = backup.data?.students || [];
      const found = students.find(s => String(s._id) === sid);
      if (found) {
        console.log(`  Backup ${backup._id} (${backup.createdAt}):`);
        console.log(`    studentNumber: ${found.studentNumber}`);
        console.log(`    name: ${found.firstName} ${found.lastName}`);
        console.log(`    course: ${found.course}`);
        console.log(`    curriculumVersion: ${found.curriculumVersion || 'null'}`);
        console.log(`    isActive: ${found.isActive}`);
        console.log(`    studentStatus: ${found.studentStatus || 'N/A'}`);
      }
    }
    console.log('');
  }

  // === Search backups for student numbers ===
  console.log('=== SEARCH BACKUPS BY STUDENT NUMBER ===\n');

  for (const sn of studentNumbers) {
    const backups = await backupsCollection.find({
      'data.students.studentNumber': sn
    }).sort({ createdAt: -1 }).limit(5).toArray();
    console.log(`StudentNumber '${sn}' found in ${backups.length} backups`);
    for (const backup of backups) {
      const students = backup.data?.students || [];
      const found = students.find(s => s.studentNumber === sn);
      if (found) {
        console.log(`  Backup ${backup._id} (${backup.createdAt}):`);
        console.log(`    _id: ${found._id}`);
        console.log(`    name: ${found.firstName} ${found.lastName}`);
        console.log(`    course: ${found.course}`);
        console.log(`    curriculumVersion: ${found.curriculumVersion || 'null'}`);
        console.log(`    isActive: ${found.isActive}`);
      }
    }
    console.log('');
  }

  // === Check for any curriculum references in backups ===
  console.log('=== CHECK BACKUPS FOR CURRICULUM DATA ===\n');

  const allBackups = await backupsCollection.find({}).sort({ createdAt: -1 }).limit(5).toArray();
  for (const backup of allBackups) {
    const dataKeys = backup.data ? Object.keys(backup.data) : [];
    const hasCurriculum = dataKeys.some(k => k.toLowerCase().includes('curriculum'));
    console.log(`Backup ${backup._id} (${backup.createdAt}): data keys = ${dataKeys.join(', ')}, has curriculum = ${hasCurriculum}`);
    if (hasCurriculum) {
      const currKey = dataKeys.find(k => k.toLowerCase().includes('curriculum'));
      const currData = backup.data[currKey];
      console.log(`  ${currKey}: ${Array.isArray(currData) ? currData.length + ' records' : typeof currData}`);
      if (Array.isArray(currData) && currData.length > 0) {
        for (const c of currData) {
          console.log(`    _id: ${c._id}, programCode: ${c.programCode}, version: ${c.version}, status: ${c.status}`);
        }
      }
    }
  }
  console.log('');

  // === Check all audit logs for CREATE STUDENT with specific IDs ===
  console.log('=== CREATE STUDENT AUDIT LOGS (all) ===\n');

  const createLogs = await AuditLog.find({
    action: 'CREATE',
    resourceType: 'STUDENT',
  }).sort({ createdAt: 1 }).limit(30).lean();
  console.log(`CREATE STUDENT audit logs: ${createLogs.length}`);
  for (const log of createLogs) {
    console.log(`  ${log.createdAt} | resourceId: ${log.resourceId} | desc: ${log.description}`);
    if (log.newValue && typeof log.newValue === 'object') {
      const nv = log.newValue;
      console.log(`    studentNumber: ${nv.studentNumber || 'N/A'}, name: ${nv.firstName || ''} ${nv.lastName || ''}, course: ${nv.course || 'N/A'}`);
    }
  }
  console.log('');

  await mongoose.disconnect();
  console.log('Done.');
}

run().catch(err => {
  console.error('Failed:', err);
  process.exit(1);
});
