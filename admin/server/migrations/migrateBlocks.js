const mongoose = require('mongoose');
const Student = require('../models/Student');
const BlockGroup = require('../models/BlockGroup');
const BlockSection = require('../models/BlockSection');
const StudentBlockAssignment = require('../models/StudentBlockAssignment');

async function migrateBlocks() {
  try {
    console.log('Starting block migration...');

    // Get all students
    const students = await Student.find({}).lean();
    console.log(`Found ${students.length} total students`);

    let studentsWithSections = 0;
    const sectionCounts = {};

    students.forEach(student => {
      if (student.section && student.section.trim()) {
        studentsWithSections++;
        sectionCounts[student.section] = (sectionCounts[student.section] || 0) + 1;
      }
    });

    console.log(`Students with non-empty sections: ${studentsWithSections}`);
    console.log('Section counts:', sectionCounts);

    // Only process if there are sections
    if (studentsWithSections === 0) {
      console.log('No students have sections set. Migration skipped.');
      return;
    }

    // Now process students with sections
    const studentsWithSectionData = students.filter(s => s.section && s.section.trim());

    const groupMap = new Map();
    const sectionMap = new Map();

    // Process each student
    for (const student of students) {
      const sectionCode = student.section;
      if (!sectionCode) continue;

      // Parse section code, assume format like "BSIT-1A"
      const match = sectionCode.match(/^(.+)-(\d+)([A-Z])$/);
      if (!match) {
        console.log(`Skipping invalid section code: ${sectionCode}`);
        continue;
      }

      const groupName = match[1] + '-' + match[2]; // e.g., "BSIT-1"
      const sectionLetter = match[3]; // e.g., "A"

      // Create or get block group
      let groupId = groupMap.get(groupName);
      if (!groupId) {
        let group = await BlockGroup.findOne({ name: groupName });
        if (!group) {
          group = await BlockGroup.create({
            name: groupName,
            semester: student.semester || '1st',
            year: parseInt(student.schoolYear?.split('-')[0]) || 2023,
            policies: {
              overcapPolicy: 'allow',
              maxOvercap: 5,
              allowCapacityIncrease: true,
              allowAutoSectionCreation: false
            }
          });
          console.log(`Created block group: ${groupName}`);
        }
        groupId = group._id;
        groupMap.set(groupName, groupId);
      }

      // Create or get block section
      const fullSectionCode = groupName + sectionLetter;
      let sectionId = sectionMap.get(fullSectionCode);
      if (!sectionId) {
        let section = await BlockSection.findOne({ sectionCode: fullSectionCode });
        if (!section) {
          section = await BlockSection.create({
            blockGroupId: groupId,
            sectionCode: fullSectionCode,
            capacity: 30, // Default capacity
            currentPopulation: 0, // Will update below
            status: 'OPEN',
            schedule: '' // Default empty
          });
          console.log(`Created block section: ${fullSectionCode}`);
        }
        sectionId = section._id;
        sectionMap.set(fullSectionCode, sectionId);
      }

      // Create student block assignment
      const existingAssignment = await StudentBlockAssignment.findOne({
        studentId: student._id,
        semester: student.semester,
        year: parseInt(student.schoolYear?.split('-')[0]) || 2023
      });

      if (!existingAssignment) {
        await StudentBlockAssignment.create({
          studentId: student._id,
          sectionId,
          semester: student.semester,
          year: parseInt(student.schoolYear?.split('-')[0]) || 2023,
          status: student.enrollmentStatus === 'Enrolled' ? 'ASSIGNED' : 'WAITLISTED'
        });

        // Update section population
        await BlockSection.findByIdAndUpdate(sectionId, { $inc: { currentPopulation: 1 } });
      }
    }

    console.log('Block migration completed successfully!');
    console.log(`Created ${groupMap.size} block groups and ${sectionMap.size} sections`);

  } catch (error) {
    console.error('Migration error:', error);
    throw error;
  }
}

module.exports = { migrateBlocks };

// If run directly
if (require.main === module) {
  require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });
  mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/wcc-admin', {
    useNewUrlParser: true,
    useUnifiedTopology: true
  }).then(() => {
    console.log('Connected to MongoDB');
    return migrateBlocks();
  }).then(() => {
    console.log('Migration complete');
    process.exit(0);
  }).catch((error) => {
    console.error('Migration failed:', error);
    process.exit(1);
  });
}
