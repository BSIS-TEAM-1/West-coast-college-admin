/**
 * Read pending backup files to search for orphaned students.
 * Read-only.
 */

const fs = require('fs');
const path = require('path');

const files = [
  path.join(__dirname, 'backups', '.pending-bc2854ba-03aa-43e5-8bf9-758b25a9d21a.json'),
  path.join(__dirname, 'backups', '.pending-fa319b1f-72ec-4174-a7a3-11dffeddbb02.json'),
];

const orphanIds = [
  '6992de9570953e5e5045da0b',
  '69954febb7be5a2a7ee6bd00',
];

const studentNumbers = ['2024-BSBA-HRM-95392', '2024-BEED-28391', '202410128391'];

for (const file of files) {
  if (!fs.existsSync(file)) {
    console.log(`File not found: ${file}`);
    continue;
  }

  console.log(`\n=== Reading: ${path.basename(file)} (${fs.statSync(file).size} bytes) ===`);

  const raw = fs.readFileSync(file, 'utf8');
  const backup = JSON.parse(raw);

  // Find students
  let students = null;
  if (backup.collections && backup.collections.students) {
    students = backup.collections.students;
  } else if (backup.students) {
    students = backup.students;
  }

  if (students && Array.isArray(students)) {
    console.log(`Students in backup: ${students.length}`);

    // List all students
    for (const s of students) {
      console.log(`  _id: ${s._id}, sn: ${s.studentNumber}, name: ${s.firstName} ${s.lastName}, course: ${s.course}, isActive: ${s.isActive}`);
    }

    // Search for orphan IDs
    for (const sid of orphanIds) {
      const found = students.find(s => String(s._id) === sid);
      if (found) {
        console.log(`\n  FOUND orphan ${sid}:`);
        console.log(`    studentNumber: ${found.studentNumber}`);
        console.log(`    name: ${found.firstName} ${found.lastName}`);
        console.log(`    course: ${found.course}`);
        console.log(`    curriculumVersion: ${found.curriculumVersion || 'null'}`);
        console.log(`    isActive: ${found.isActive}`);
        console.log(`    studentStatus: ${found.studentStatus || 'N/A'}`);
        console.log(`    createdAt: ${found.createdAt}`);
      } else {
        console.log(`  Orphan ${sid}: NOT FOUND`);
      }
    }

    // Search by student number
    for (const sn of studentNumbers) {
      const found = students.find(s => s.studentNumber === sn);
      if (found) {
        console.log(`  FOUND studentNumber '${sn}': _id: ${found._id}, name: ${found.firstName} ${found.lastName}, course: ${found.course}`);
      } else {
        console.log(`  StudentNumber '${sn}': NOT FOUND`);
      }
    }
  } else {
    console.log('No students array found. Top-level keys:', Object.keys(backup));
    if (backup.collections) {
      console.log('collections keys:', Object.keys(backup.collections));
    }
  }

  // Check enrollments
  let enrollments = null;
  if (backup.collections && backup.collections.enrollments) {
    enrollments = backup.collections.enrollments;
  } else if (backup.enrollments) {
    enrollments = backup.enrollments;
  }

  if (enrollments && Array.isArray(enrollments)) {
    console.log(`\nEnrollments in backup: ${enrollments.length}`);
    for (const e of enrollments) {
      console.log(`  _id: ${e._id}, studentId: ${e.studentId}, studentNumber: ${e.studentNumber || 'N/A'}, course: ${e.course}, status: ${e.status}, curriculumId: ${e.curriculumId || 'null'}`);
    }
  }

  // Check curriculums
  let curriculums = null;
  if (backup.collections && backup.collections.curriculums) {
    curriculums = backup.collections.curriculums;
  } else if (backup.curriculums) {
    curriculums = backup.curriculums;
  }

  if (curriculums && Array.isArray(curriculums)) {
    console.log(`\nCurriculums in backup: ${curriculums.length}`);
    for (const c of curriculums) {
      console.log(`  _id: ${c._id}, programCode: ${c.programCode}, version: ${c.version}, status: ${c.status}`);
    }
  } else {
    console.log('\nNo curriculums in backup.');
  }
}
