/**
 * Re-query backups with correct structure (collections array).
 * Read-only.
 */

const mongoose = require('mongoose');
require('dotenv').config();

const MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI;

async function run() {
  await mongoose.connect(MONGO_URI);
  const db = mongoose.connection.db;

  const backupsCollection = db.collection('backups');

  // Inspect backup structure
  console.log('=== BACKUP STRUCTURE INSPECTION ===\n');

  const sampleBackup = await backupsCollection.findOne({});
  if (sampleBackup) {
    console.log('collections type:', typeof sampleBackup.collections);
    if (Array.isArray(sampleBackup.collections)) {
      console.log('collections length:', sampleBackup.collections.length);
      for (let i = 0; i < Math.min(sampleBackup.collections.length, 10); i++) {
        const coll = sampleBackup.collections[i];
        console.log(`  [${i}]: keys = ${Object.keys(coll || {}).join(', ')}`);
        if (coll && coll.name) {
          console.log(`    name: ${coll.name}, count: ${coll.count || coll.data?.length || 'N/A'}`);
        }
      }
    } else if (typeof sampleBackup.collections === 'object') {
      const keys = Object.keys(sampleBackup.collections);
      console.log('collections keys:', keys);
      for (const k of keys.slice(0, 10)) {
        const coll = sampleBackup.collections[k];
        console.log(`  [${k}]: ${JSON.stringify(coll).substring(0, 200)}`);
      }
    }
  }
  console.log('');

  // Get most recent backup and inspect its collections
  console.log('=== MOST RECENT BACKUP ===\n');

  const recentBackups = await backupsCollection.find({})
    .sort({ createdAt: -1 })
    .limit(3)
    .toArray();

  for (const backup of recentBackups) {
    console.log(`Backup: ${backup._id} | ${backup.createdAt} | status: ${backup.status}`);
    if (Array.isArray(backup.collections)) {
      for (const coll of backup.collections) {
        const collName = coll.name || coll.collectionName || 'unknown';
        const collData = coll.data || coll.documents || coll.records || [];
        const count = Array.isArray(collData) ? collData.length : (typeof collData === 'object' ? Object.keys(collData).length : 0);
        console.log(`  Collection: ${collName}, records: ${count}`);
        if (collName === 'students' && Array.isArray(collData)) {
          // Search for orphan student IDs
          const orphanIds = [
            '6992de9570953e5e5045da0b',
            '69954febb7be5a2a7ee6bd00',
          ];
          for (const sid of orphanIds) {
            const found = collData.find(s => String(s._id) === sid);
            if (found) {
              console.log(`    FOUND student ${sid}:`);
              console.log(`      studentNumber: ${found.studentNumber}`);
              console.log(`      name: ${found.firstName} ${found.lastName}`);
              console.log(`      course: ${found.course}`);
              console.log(`      curriculumVersion: ${found.curriculumVersion || 'null'}`);
              console.log(`      isActive: ${found.isActive}`);
              console.log(`      studentStatus: ${found.studentStatus || 'N/A'}`);
            }
          }
          // Search by student number
          const studentNumbers = ['2024-BSBA-HRM-95392', '2024-BEED-28391', '202410128391'];
          for (const sn of studentNumbers) {
            const found = collData.find(s => s.studentNumber === sn);
            if (found) {
              console.log(`    FOUND studentNumber ${sn}:`);
              console.log(`      _id: ${found._id}`);
              console.log(`      name: ${found.firstName} ${found.lastName}`);
              console.log(`      course: ${found.course}`);
              console.log(`      curriculumVersion: ${found.curriculumVersion || 'null'}`);
            }
          }
          // List all students
          console.log(`    All students in this backup:`);
          for (const s of collData) {
            console.log(`      _id: ${s._id}, sn: ${s.studentNumber}, name: ${s.firstName} ${s.lastName}, course: ${s.course}, isActive: ${s.isActive}`);
          }
        }
        if (collName === 'curriculums' && Array.isArray(collData)) {
          console.log(`    Curriculum records in this backup:`);
          for (const c of collData) {
            console.log(`      _id: ${c._id}, programCode: ${c.programCode}, version: ${c.version}, status: ${c.status}`);
          }
        }
      }
    }
    console.log('');
  }

  // === Search ALL backups for orphan student IDs ===
  console.log('=== SEARCH ALL BACKUPS FOR ORPHAN STUDENT IDs ===\n');

  const orphanIds = [
    '6992de9570953e5e5045da0b',
    '69954febb7be5a2a7ee6bd00',
  ];

  const allBackups = await backupsCollection.find({}).sort({ createdAt: -1 }).toArray();
  console.log(`Total backups: ${allBackups.length}`);

  for (const sid of orphanIds) {
    let found = false;
    for (const backup of allBackups) {
      if (Array.isArray(backup.collections)) {
        for (const coll of backup.collections) {
          const collData = coll.data || coll.documents || coll.records || [];
          if (Array.isArray(collData)) {
            const student = collData.find(s => String(s._id) === sid);
            if (student) {
              found = true;
              console.log(`FOUND student ${sid} in backup ${backup._id} (${backup.createdAt}):`);
              console.log(`  studentNumber: ${student.studentNumber}`);
              console.log(`  name: ${student.firstName} ${student.lastName}`);
              console.log(`  course: ${student.course}`);
              console.log(`  curriculumVersion: ${student.curriculumVersion || 'null'}`);
              console.log(`  isActive: ${student.isActive}`);
              console.log(`  studentStatus: ${student.studentStatus || 'N/A'}`);
            }
          }
        }
      }
    }
    if (!found) {
      console.log(`Student ${sid}: NOT FOUND in any backup`);
    }
    console.log('');
  }

  // === Search by student number across all backups ===
  console.log('=== SEARCH BY STUDENT NUMBER ACROSS ALL BACKUPS ===\n');

  const studentNumbers = ['2024-BSBA-HRM-95392', '2024-BEED-28391', '202410128391'];
  for (const sn of studentNumbers) {
    let found = false;
    for (const backup of allBackups) {
      if (Array.isArray(backup.collections)) {
        for (const coll of backup.collections) {
          const collName = coll.name || coll.collectionName || '';
          if (collName === 'students') {
            const collData = coll.data || coll.documents || coll.records || [];
            if (Array.isArray(collData)) {
              const student = collData.find(s => s.studentNumber === sn);
              if (student) {
                found = true;
                console.log(`FOUND studentNumber '${sn}' in backup ${backup._id} (${backup.createdAt}):`);
                console.log(`  _id: ${student._id}`);
                console.log(`  name: ${student.firstName} ${student.lastName}`);
                console.log(`  course: ${student.course}`);
                console.log(`  curriculumVersion: ${student.curriculumVersion || 'null'}`);
                console.log(`  isActive: ${student.isActive}`);
              }
            }
          }
        }
      }
    }
    if (!found) {
      console.log(`StudentNumber '${sn}': NOT FOUND in any backup`);
    }
    console.log('');
  }

  // === Check for curriculums in all backups ===
  console.log('=== CHECK ALL BACKUPS FOR CURRICULUM DATA ===\n');

  for (const backup of allBackups) {
    if (Array.isArray(backup.collections)) {
      for (const coll of backup.collections) {
        const collName = coll.name || coll.collectionName || '';
        if (collName.toLowerCase().includes('curriculum')) {
          const collData = coll.data || coll.documents || coll.records || [];
          console.log(`Backup ${backup._id} (${backup.createdAt}): collection '${collName}' has ${Array.isArray(collData) ? collData.length : 'unknown'} records`);
          if (Array.isArray(collData)) {
            for (const c of collData) {
              console.log(`  _id: ${c._id}, programCode: ${c.programCode}, version: ${c.version}, status: ${c.status}`);
            }
          }
        }
      }
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
