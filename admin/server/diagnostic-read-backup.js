/**
 * Read the unencrypted backup JSON file to find orphaned students.
 * Read-only — does not modify any records.
 */

const fs = require('fs');
const path = require('path');

const backupFile = path.join(__dirname, 'backups', 'backup-2026-08-01T13-24-40-902Z.json');

if (!fs.existsSync(backupFile)) {
  console.log('Backup file not found:', backupFile);
  process.exit(1);
}

console.log('Reading backup file:', backupFile);
console.log('File size:', fs.statSync(backupFile).size, 'bytes');

// Read and parse
const raw = fs.readFileSync(backupFile, 'utf8');
const backup = JSON.parse(raw);

console.log('\nBackup top-level keys:', Object.keys(backup));

// Find students array
let students = null;
if (backup.students) students = backup.students;
else if (backup.data && backup.data.students) students = backup.data.students;
else if (backup.collections) {
  // Search collections array
  if (Array.isArray(backup.collections)) {
    const studentsColl = backup.collections.find(c => c.name === 'students');
    if (studentsColl) students = studentsColl.data || studentsColl.documents || studentsColl.records;
  } else {
    for (const k of Object.keys(backup.collections)) {
      const coll = backup.collections[k];
      if (coll && coll.name === 'students') {
        students = coll.data || coll.documents || coll.records;
      }
    }
  }
}

if (!students) {
  console.log('Students not found in backup. Searching all keys...');
  for (const key of Object.keys(backup)) {
    const val = backup[key];
    if (Array.isArray(val) && val.length > 0 && val[0] && val[0].studentNumber) {
      console.log(`Found students in key: ${key}, count: ${val.length}`);
      students = val;
      break;
    }
    if (val && typeof val === 'object' && !Array.isArray(val)) {
      for (const subKey of Object.keys(val)) {
        const subVal = val[subKey];
        if (Array.isArray(subVal) && subVal.length > 0 && subVal[0] && subVal[0].studentNumber) {
          console.log(`Found students in key: ${key}.${subKey}, count: ${subVal.length}`);
          students = subVal;
          break;
        }
      }
    }
  }
}

if (students && Array.isArray(students)) {
  console.log(`\nTotal students in backup: ${students.length}`);

  const orphanIds = [
    '6992de9570953e5e5045da0b',
    '69954febb7be5a2a7ee6bd00',
  ];

  for (const sid of orphanIds) {
    const found = students.find(s => String(s._id) === sid);
    if (found) {
      console.log(`\nFOUND orphan student ${sid}:`);
      console.log(`  studentNumber: ${found.studentNumber}`);
      console.log(`  name: ${found.firstName} ${found.lastName}`);
      console.log(`  course: ${found.course}`);
      console.log(`  curriculumVersion: ${found.curriculumVersion || 'null'}`);
      console.log(`  isActive: ${found.isActive}`);
      console.log(`  studentStatus: ${found.studentStatus || 'N/A'}`);
      console.log(`  yearLevel: ${found.yearLevel}`);
      console.log(`  schoolYear: ${found.schoolYear}`);
      console.log(`  semester: ${found.semester}`);
      console.log(`  createdAt: ${found.createdAt}`);
    } else {
      console.log(`\nOrphan student ${sid}: NOT FOUND in this backup`);
    }
  }

  // Search by student number
  const studentNumbers = ['2024-BSBA-HRM-95392', '2024-BEED-28391', '202410128391'];
  for (const sn of studentNumbers) {
    const found = students.find(s => s.studentNumber === sn);
    if (found) {
      console.log(`\nFOUND studentNumber '${sn}':`);
      console.log(`  _id: ${found._id}`);
      console.log(`  name: ${found.firstName} ${found.lastName}`);
      console.log(`  course: ${found.course}`);
      console.log(`  curriculumVersion: ${found.curriculumVersion || 'null'}`);
      console.log(`  isActive: ${found.isActive}`);
    } else {
      console.log(`\nStudentNumber '${sn}': NOT FOUND in this backup`);
    }
  }

  // List all students
  console.log('\n=== ALL STUDENTS IN BACKUP ===');
  for (const s of students) {
    console.log(`  _id: ${s._id}, sn: ${s.studentNumber}, name: ${s.firstName} ${s.lastName}, course: ${s.course}, isActive: ${s.isActive}, curriculumVersion: ${s.curriculumVersion || 'null'}`);
  }
} else {
  console.log('Could not find students array in backup.');
  // Print structure
  for (const key of Object.keys(backup)) {
    const val = backup[key];
    if (Array.isArray(val)) {
      console.log(`  ${key}: Array[${val.length}]`);
      if (val.length > 0) {
        console.log(`    first item keys: ${Object.keys(val[0] || {}).join(', ')}`);
      }
    } else if (typeof val === 'object' && val !== null) {
      console.log(`  ${key}: Object { ${Object.keys(val).slice(0, 10).join(', ')} }`);
    } else {
      console.log(`  ${key}: ${typeof val} = ${String(val).substring(0, 100)}`);
    }
  }
}

// Also check for curriculums in this backup
console.log('\n=== CHECK FOR CURRICULUMS IN BACKUP ===');
let curriculums = null;
if (backup.curriculums) curriculums = backup.curriculums;
else if (backup.data && backup.data.curriculums) curriculums = backup.data.curriculums;
else if (backup.collections) {
  if (Array.isArray(backup.collections)) {
    const currColl = backup.collections.find(c => c.name === 'curriculums');
    if (currColl) curriculums = currColl.data || currColl.documents || currColl.records;
  } else {
    for (const k of Object.keys(backup.collections)) {
      const coll = backup.collections[k];
      if (coll && coll.name === 'curriculums') {
        curriculums = coll.data || coll.documents || coll.records;
      }
    }
  }
}

if (curriculums && Array.isArray(curriculums)) {
  console.log(`Curriculums in backup: ${curriculums.length}`);
  for (const c of curriculums) {
    console.log(`  _id: ${c._id}, programCode: ${c.programCode}, version: ${c.version}, status: ${c.status}`);
  }
} else {
  console.log('No curriculums found in backup.');
}

// Check enrollments in backup
console.log('\n=== ENROLLMENTS IN BACKUP ===');
let enrollments = null;
if (backup.enrollments) enrollments = backup.enrollments;
else if (backup.data && backup.data.enrollments) enrollments = backup.data.enrollments;
else if (backup.collections) {
  if (Array.isArray(backup.collections)) {
    const enrColl = backup.collections.find(c => c.name === 'enrollments');
    if (enrColl) enrollments = enrColl.data || enrColl.documents || enrColl.records;
  } else {
    for (const k of Object.keys(backup.collections)) {
      const coll = backup.collections[k];
      if (coll && coll.name === 'enrollments') {
        enrollments = coll.data || coll.documents || coll.records;
      }
    }
  }
}

if (enrollments && Array.isArray(enrollments)) {
  console.log(`Enrollments in backup: ${enrollments.length}`);
  for (const e of enrollments) {
    console.log(`  _id: ${e._id}, studentId: ${e.studentId}, studentNumber: ${e.studentNumber || 'N/A'}, course: ${e.course}, status: ${e.status}`);
  }
} else {
  console.log('No enrollments found in backup.');
}
