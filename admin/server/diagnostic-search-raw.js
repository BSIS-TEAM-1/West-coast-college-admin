/**
 * Search for specific student IDs and student numbers in the Aug 9 pending backup.
 * Read-only.
 */

const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, 'backups', '.pending-fa319b1f-72ec-4174-a7a3-11dffeddbb02.json');
const raw = fs.readFileSync(file, 'utf8');

// Search for orphan student IDs
const orphanIds = [
  '6992de9570953e5e5045da0b',
  '69954febb7be5a2a7ee6bd00',
];

for (const sid of orphanIds) {
  const index = raw.indexOf(sid);
  if (index >= 0) {
    console.log(`\nFOUND "${sid}" at position ${index}`);
    // Extract surrounding context (the student object)
    const start = Math.max(0, raw.lastIndexOf('{', index));
    let depth = 0;
    let end = start;
    let inStr = false;
    let esc = false;
    for (let i = start; i < raw.length; i++) {
      const ch = raw[i];
      if (esc) { esc = false; continue; }
      if (ch === '\\') { esc = true; continue; }
      if (ch === '"') { inStr = !inStr; continue; }
      if (inStr) continue;
      if (ch === '{') depth++;
      if (ch === '}') { depth--; if (depth === 0) { end = i + 1; break; } }
    }
    const objStr = raw.substring(start, end);
    try {
      const obj = JSON.parse(objStr);
      console.log('Parsed object:');
      console.log(`  _id: ${obj._id}`);
      console.log(`  studentNumber: ${obj.studentNumber || 'N/A'}`);
      console.log(`  name: ${obj.firstName || ''} ${obj.lastName || ''}`);
      console.log(`  course: ${obj.course}`);
      console.log(`  curriculumVersion: ${obj.curriculumVersion || 'null'}`);
      console.log(`  isActive: ${obj.isActive}`);
      console.log(`  studentStatus: ${obj.studentStatus || 'N/A'}`);
      console.log(`  yearLevel: ${obj.yearLevel}`);
      console.log(`  schoolYear: ${obj.schoolYear}`);
      console.log(`  semester: ${obj.semester}`);
      console.log(`  createdAt: ${obj.createdAt}`);
    } catch (e) {
      console.log('Failed to parse, raw context:');
      console.log(objStr.substring(0, 500));
    }
  } else {
    console.log(`\n"${sid}" NOT FOUND in file`);
  }
}

// Search for student numbers
const studentNumbers = ['2024-BSBA-HRM-95392', '2024-BEED-28391', '202410128391'];
for (const sn of studentNumbers) {
  const index = raw.indexOf(sn);
  if (index >= 0) {
    console.log(`\nFOUND studentNumber "${sn}" at position ${index}`);
    // Get context
    const contextStart = Math.max(0, index - 200);
    const contextEnd = Math.min(raw.length, index + 200);
    console.log('Context:', raw.substring(contextStart, contextEnd));
  } else {
    console.log(`\nstudentNumber "${sn}" NOT FOUND in file`);
  }
}

// Also search in the Aug 1 backup for student 6992de95
const file2 = path.join(__dirname, 'backups', 'backup-2026-08-01T13-24-40-902Z.json');
const raw2 = fs.readFileSync(file2, 'utf8');

for (const sid of orphanIds) {
  const index = raw2.indexOf(sid);
  if (index >= 0) {
    console.log(`\nFOUND "${sid}" in Aug 1 backup at position ${index}`);
    const start = Math.max(0, raw2.lastIndexOf('{', index));
    let depth = 0;
    let end = start;
    let inStr = false;
    let esc = false;
    for (let i = start; i < raw2.length; i++) {
      const ch = raw2[i];
      if (esc) { esc = false; continue; }
      if (ch === '\\') { esc = true; continue; }
      if (ch === '"') { inStr = !inStr; continue; }
      if (inStr) continue;
      if (ch === '{') depth++;
      if (ch === '}') { depth--; if (depth === 0) { end = i + 1; break; } }
    }
    const objStr = raw2.substring(start, end);
    try {
      const obj = JSON.parse(objStr);
      console.log('Parsed object:');
      console.log(`  _id: ${obj._id}`);
      console.log(`  studentNumber: ${obj.studentNumber || 'N/A'}`);
      console.log(`  name: ${obj.firstName || ''} ${obj.lastName || ''}`);
      console.log(`  course: ${obj.course}`);
      console.log(`  isActive: ${obj.isActive}`);
    } catch (e) {
      console.log('Failed to parse, showing context:');
      console.log(objStr.substring(0, 500));
    }
  } else {
    console.log(`\n"${sid}" NOT FOUND in Aug 1 backup`);
  }
}

// Search for 2024-BSBA-HRM in Aug 1 backup
for (const sn of studentNumbers) {
  const index = raw2.indexOf(sn);
  if (index >= 0) {
    console.log(`\nFOUND studentNumber "${sn}" in Aug 1 backup at position ${index}`);
    const contextStart = Math.max(0, index - 200);
    const contextEnd = Math.min(raw2.length, index + 200);
    console.log('Context:', raw2.substring(contextStart, contextEnd));
  } else {
    console.log(`\nstudentNumber "${sn}" NOT FOUND in Aug 1 backup`);
  }
}
