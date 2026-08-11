/**
 * Read the Aug 9 pending backup file (69MB) - search for students.
 * This file may be incomplete but let's try to extract student data.
 * Read-only.
 */

const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, 'backups', '.pending-fa319b1f-72ec-4174-a7a3-11dffeddbb02.json');

if (!fs.existsSync(file)) {
  console.log('File not found');
  process.exit(1);
}

const raw = fs.readFileSync(file, 'utf8');

// Try to find the students array by searching for a pattern
const studentsMatch = raw.match(/"students"\s*:\s*\[/);
if (!studentsMatch) {
  console.log('No "students" array found in file');
  // Check what collections exist
  const collectionsMatch = raw.match(/"collections"\s*:\s*\{/);
  if (collectionsMatch) {
    console.log('Found "collections" object');
    // Find collection names
    const nameMatches = [...raw.matchAll(/"name"\s*:\s*"(\w+)"/g)];
    console.log('Collection names found:', nameMatches.map(m => m[1]).join(', '));
  }
  process.exit(0);
}

console.log('Found "students" array starting at position:', studentsMatch.index);

// Extract a chunk around the students array
const start = studentsMatch.index;
// Find the matching closing bracket
let depth = 0;
let inString = false;
let escape = false;
let end = start;

for (let i = start + raw[studentsMatch.index].length; i < raw.length; i++) {
  const ch = raw[i];
  if (escape) { escape = false; continue; }
  if (ch === '\\') { escape = true; continue; }
  if (ch === '"') { inString = !inString; continue; }
  if (inString) continue;
  if (ch === '[') depth++;
  if (ch === ']') {
    depth--;
    if (depth === 0) { end = i + 1; break; }
  }
}

const studentsJson = raw.substring(start + '"students":'.length, end);
console.log('Students JSON length:', studentsJson.length);

try {
  const students = JSON.parse(studentsJson);
  console.log(`Total students: ${students.length}`);

  const orphanIds = [
    '6992de9570953e5e5045da0b',
    '69954febb7be5a2a7ee6bd00',
  ];

  for (const sid of orphanIds) {
    const found = students.find(s => String(s._id) === sid);
    if (found) {
      console.log(`\nFOUND orphan ${sid}:`);
      console.log(`  studentNumber: ${found.studentNumber}`);
      console.log(`  name: ${found.firstName} ${found.lastName}`);
      console.log(`  course: ${found.course}`);
      console.log(`  curriculumVersion: ${found.curriculumVersion || 'null'}`);
      console.log(`  isActive: ${found.isActive}`);
      console.log(`  studentStatus: ${found.studentStatus || 'N/A'}`);
      console.log(`  createdAt: ${found.createdAt}`);
    } else {
      console.log(`Orphan ${sid}: NOT FOUND`);
    }
  }

  // List all students
  console.log('\n=== ALL STUDENTS ===');
  for (const s of students) {
    console.log(`  _id: ${s._id}, sn: ${s.studentNumber}, name: ${s.firstName} ${s.lastName}, course: ${s.course}, isActive: ${s.isActive}, curriculumVersion: ${s.curriculumVersion || 'null'}`);
  }
} catch (e) {
  console.log('Failed to parse students JSON:', e.message);
  // Try to extract individual student objects
  console.log('Attempting to extract student _id values...');
  const idMatches = [...studentsJson.matchAll(/"_id"\s*:\s*"(6[0-9a-f]+)"/g)];
  console.log(`Found ${idMatches.length} student _id values:`);
  for (const m of idMatches) {
    console.log(`  ${m[1]}`);
  }
}

// Also search for curriculums
const currMatch = raw.match(/"curriculums"\s*:\s*\[/);
if (currMatch) {
  console.log('\nFound "curriculums" array at position:', currMatch.index);
  // Try to extract
  let cDepth = 0;
  let cInString = false;
  let cEscape = false;
  let cEnd = currMatch.index;
  for (let i = currMatch.index + raw[currMatch.index].length; i < raw.length; i++) {
    const ch = raw[i];
    if (cEscape) { cEscape = false; continue; }
    if (ch === '\\') { cEscape = true; continue; }
    if (ch === '"') { cInString = !cInString; continue; }
    if (cInString) continue;
    if (ch === '[') cDepth++;
    if (ch === ']') { cDepth--; if (cDepth === 0) { cEnd = i + 1; break; } }
  }
  const currJson = raw.substring(currMatch.index + '"curriculums":'.length, cEnd);
  try {
    const curriculums = JSON.parse(currJson);
    console.log(`Curriculums: ${curriculums.length}`);
    for (const c of curriculums) {
      console.log(`  _id: ${c._id}, programCode: ${c.programCode}, version: ${c.version}, status: ${c.status}`);
    }
  } catch (e) {
    console.log('Failed to parse curriculums:', e.message);
  }
} else {
  console.log('\nNo "curriculums" array found');
}

// Also search for enrollments
const enrMatch = raw.match(/"enrollments"\s*:\s*\[/);
if (enrMatch) {
  console.log('\nFound "enrollments" array at position:', enrMatch.index);
  let eDepth = 0;
  let eInString = false;
  let eEscape = false;
  let eEnd = enrMatch.index;
  for (let i = enrMatch.index + raw[enrMatch.index].length; i < raw.length; i++) {
    const ch = raw[i];
    if (eEscape) { eEscape = false; continue; }
    if (ch === '\\') { eEscape = true; continue; }
    if (ch === '"') { eInString = !eInString; continue; }
    if (eInString) continue;
    if (ch === '[') eDepth++;
    if (ch === ']') { eDepth--; if (eDepth === 0) { eEnd = i + 1; break; } }
  }
  const enrJson = raw.substring(enrMatch.index + '"enrollments":'.length, eEnd);
  try {
    const enrollments = JSON.parse(enrJson);
    console.log(`Enrollments: ${enrollments.length}`);
    for (const e of enrollments) {
      console.log(`  _id: ${e._id}, studentId: ${e.studentId}, studentNumber: ${e.studentNumber || 'N/A'}, course: ${e.course}, status: ${e.status}, curriculumId: ${e.curriculumId || 'null'}`);
    }
  } catch (e) {
    console.log('Failed to parse enrollments:', e.message);
  }
} else {
  console.log('\nNo "enrollments" array found');
}
