/**
 * Check backup counts for students across all backups.
 * Also check earliest backups and look for any with actual data.
 * Read-only.
 */

const mongoose = require('mongoose');
require('dotenv').config();

const MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI;

async function run() {
  await mongoose.connect(MONGO_URI);
  const db = mongoose.connection.db;

  const backupsCollection = db.collection('backups');

  // Get all backups sorted by date
  const allBackups = await backupsCollection.find({})
    .sort({ createdAt: 1 })
    .toArray();

  console.log(`Total backups: ${allBackups.length}\n`);

  // Check which backups have student counts > 0
  console.log('=== BACKUPS WITH STUDENT COUNTS ===\n');

  let foundStudentData = false;
  for (const backup of allBackups) {
    if (Array.isArray(backup.collections)) {
      for (const coll of backup.collections) {
        if (coll.name === 'students' && coll.count > 0) {
          foundStudentData = true;
          console.log(`Backup ${backup._id} (${backup.createdAt}): students count = ${coll.count}`);
          console.log(`  compressedPath: ${backup.compressedPath || 'N/A'}`);
          console.log(`  filePath: ${backup.filePath || 'N/A'}`);
          console.log(`  status: ${backup.status}`);
        }
      }
    } else if (typeof backup.collections === 'object') {
      const keys = Object.keys(backup.collections);
      for (const k of keys) {
        const coll = backup.collections[k];
        if (coll && coll.name === 'students' && coll.count > 0) {
          foundStudentData = true;
          console.log(`Backup ${backup._id} (${backup.createdAt}): students count = ${coll.count}`);
          console.log(`  compressedPath: ${backup.compressedPath || 'N/A'}`);
          console.log(`  filePath: ${backup.filePath || 'N/A'}`);
          console.log(`  status: ${backup.status}`);
        }
      }
    }
  }

  if (!foundStudentData) {
    console.log('No backups with student count > 0 found.');
  }
  console.log('');

  // Check earliest backup structure
  console.log('=== EARLIEST BACKUP ===\n');

  const earliest = allBackups[0];
  if (earliest) {
    console.log(`Backup: ${earliest._id} | ${earliest.createdAt}`);
    console.log(`  status: ${earliest.status}`);
    console.log(`  compressedPath: ${earliest.compressedPath || 'N/A'}`);
    console.log(`  filePath: ${earliest.filePath || 'N/A'}`);
    console.log(`  backupType: ${earliest.backupType || 'N/A'}`);
    console.log(`  documentCount: ${earliest.documentCount || 'N/A'}`);
    if (earliest.collections) {
      if (Array.isArray(earliest.collections)) {
        for (const coll of earliest.collections) {
          console.log(`  Collection: ${coll.name}, count: ${coll.count}`);
        }
      } else {
        for (const k of Object.keys(earliest.collections)) {
          const coll = earliest.collections[k];
          console.log(`  Collection [${k}]: ${coll?.name || 'N/A'}, count: ${coll?.count || 'N/A'}`);
        }
      }
    }
  }
  console.log('');

  // Check if any backup files exist on disk
  console.log('=== CHECK BACKUP FILES ON DISK ===\n');

  const fs = require('fs');
  const path = require('path');

  const backupDirs = [
    path.join(__dirname, '..', 'backups'),
    path.join(__dirname, '..', 'server', 'backups'),
    path.join(__dirname, '..', 'public', 'backups'),
  ];

  for (const dir of backupDirs) {
    if (fs.existsSync(dir)) {
      const files = fs.readdirSync(dir);
      console.log(`Directory ${dir}: ${files.length} files`);
      for (const f of files.slice(0, 10)) {
        const stat = fs.statSync(path.join(dir, f));
        console.log(`  ${f} (${stat.size} bytes, ${stat.mtime})`);
      }
    } else {
      console.log(`Directory ${dir}: does not exist`);
    }
  }
  console.log('');

  // Check if the backup model has a restore method
  console.log('=== CHECK BACKUP MODEL ===\n');

  const BackupModel = require('./models/Backup');
  if (BackupModel) {
    console.log('Backup model found');
    console.log('Schema paths:', Object.keys(BackupModel.schema.paths).join(', '));
  }
  console.log('');

  // === Check for applicants collection ===
  console.log('=== APPLICANTS COLLECTION ===\n');

  const applicantsCollection = db.collection('applicants');
  const applicantCount = await applicantsCollection.countDocuments();
  console.log(`Applicants count: ${applicantCount}`);

  if (applicantCount > 0) {
    const allApplicants = await applicantsCollection.find({}).toArray();
    for (const a of allApplicants) {
      console.log(`  _id: ${a._id}`);
      console.log(`    studentNumber: ${a.studentNumber || 'N/A'}`);
      console.log(`    name: ${a.firstName || ''} ${a.lastName || ''}`);
      console.log(`    course: ${a.course || 'N/A'}`);
      console.log(`    email: ${a.email || 'N/A'}`);
      console.log(`    status: ${a.status || 'N/A'}`);
      console.log(`    createdAt: ${a.createdAt || 'N/A'}`);
      console.log('');
    }
  }
  console.log('');

  // === Check SystemSettings for academic term info ===
  console.log('=== SYSTEM SETTINGS ===\n');

  const SystemSetting = require('./models/SystemSetting');
  const settings = await SystemSetting.find({}).lean();
  for (const s of settings) {
    console.log(`  key: ${s.key}, value: ${JSON.stringify(s.value).substring(0, 200)}`);
  }
  console.log('');

  // === Check AcademicPeriod collection ===
  console.log('=== ACADEMIC PERIODS ===\n');

  const AcademicPeriod = require('./models/AcademicPeriod');
  const periods = await AcademicPeriod.find({}).lean();
  console.log(`AcademicPeriods: ${periods.length}`);
  for (const p of periods) {
    console.log(`  _id: ${p._id}, schoolYear: ${p.schoolYear}, term: ${p.term}, status: ${p.status}`);
  }
  console.log('');

  // === Check Subjects for version field ===
  console.log('=== SUBJECTS ===\n');

  const Subject = require('./models/Subject');
  const subjects = await Subject.find({}).select('_id code title version programCode yearLevel semester').lean();
  console.log(`Subjects: ${subjects.length}`);
  for (const s of subjects.slice(0, 20)) {
    console.log(`  _id: ${s._id}, code: ${s.code}, title: ${s.title}, version: ${s.version || 'N/A'}, programCode: ${s.programCode || 'N/A'}`);
  }
  console.log('');

  await mongoose.disconnect();
  console.log('Done.');
}

run().catch(err => {
  console.error('Failed:', err);
  process.exit(1);
});
