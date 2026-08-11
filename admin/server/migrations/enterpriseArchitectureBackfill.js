/**
 * Migration: Academic Periods, Curriculum Versioning, and Subject Versioning
 *
 * This script:
 * 1. Creates AcademicPeriod records from existing schoolYear/semester data in SystemSetting
 * 2. Creates default Curriculum records for each program (101, 102, 103, 201)
 * 3. Assigns all existing students to the default curriculum version
 * 4. Sets version: 1 on all existing subjects
 *
 * Usage: node server/migrations/enterpriseArchitectureBackfill.js
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });
const mongoose = require('mongoose');

const MONGODB_URI = process.env.MONGODB_URI || process.env.DB_URI || 'mongodb://localhost:27017/wcc';

async function run() {
  console.log('Connecting to database...');
  await mongoose.connect(MONGODB_URI);
  console.log('Connected.\n');

  const SystemSetting = require('../models/SystemSetting');
  const AcademicPeriod = require('../models/AcademicPeriod');
  const Curriculum = require('../models/Curriculum');
  const Subject = require('../models/Subject');
  const Student = require('../models/Student');

  // ---- Step 1: Create AcademicPeriod records from SystemSetting ----
  console.log('Step 1: Academic Periods');
  const academicTerm = await SystemSetting.findOne({ key: 'academicTerm' });
  const currentSchoolYear = academicTerm?.value?.schoolYear;
  const currentSemester = academicTerm?.value?.semester || '1st';

  if (currentSchoolYear) {
    const existing = await AcademicPeriod.findOne({ schoolYear: currentSchoolYear, term: currentSemester });
    if (!existing) {
      await AcademicPeriod.create({
        schoolYear: currentSchoolYear,
        term: currentSemester,
        termType: 'Semester',
        status: 'Active',
      });
      console.log(`  Created Active AcademicPeriod: ${currentSchoolYear} - ${currentSemester}`);
    } else {
      console.log(`  AcademicPeriod already exists: ${currentSchoolYear} - ${currentSemester}`);
    }
  } else {
    console.log('  No academicTerm found in SystemSetting, skipping.');
  }

  // ---- Step 2: Create default Curriculum records ----
  console.log('\nStep 2: Curriculum Records');
  const PROGRAMS = [
    { code: 101, name: 'BEED' },
    { code: 102, name: 'BSED' },
    { code: 103, name: 'BSED' },
    { code: 201, name: 'BSBA' },
  ];
  const defaultVersion = String(new Date().getFullYear());

  for (const prog of PROGRAMS) {
    const existing = await Curriculum.findOne({ programCode: prog.code, version: defaultVersion });
    if (!existing) {
      await Curriculum.create({
        programCode: prog.code,
        programName: prog.name,
        version: defaultVersion,
        status: 'Active',
        effectiveSchoolYear: currentSchoolYear || undefined,
      });
      console.log(`  Created Curriculum: ${prog.name} v${defaultVersion}`);
    } else {
      console.log(`  Curriculum already exists: ${prog.name} v${defaultVersion}`);
    }
  }

  // ---- Step 3: Assign students to default curriculum version ----
  console.log('\nStep 3: Assign students to curriculum version');
  const studentsWithoutCurriculum = await Student.countDocuments({ curriculumVersion: null });
  if (studentsWithoutCurriculum > 0) {
    const result = await Student.updateMany(
      { curriculumVersion: null },
      { $set: { curriculumVersion: defaultVersion } }
    );
    console.log(`  Assigned ${result.modifiedCount} students to curriculum v${defaultVersion}`);
  } else {
    console.log('  All students already have a curriculum version.');
  }

  // ---- Step 4: Set version: 1 on existing subjects ----
  console.log('\nStep 4: Subject versioning');
  const subjectsWithoutVersion = await Subject.countDocuments({ version: { $exists: false } });
  if (subjectsWithoutVersion > 0) {
    const result = await Subject.updateMany(
      { version: { $exists: false } },
      { $set: { version: 1 } }
    );
    console.log(`  Set version=1 on ${result.modifiedCount} subjects`);
  } else {
    console.log('  All subjects already have a version field.');
  }

  console.log('\nMigration complete.');
  await mongoose.disconnect();
  process.exit(0);
}

run().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
