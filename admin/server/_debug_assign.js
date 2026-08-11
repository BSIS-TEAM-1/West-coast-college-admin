require('dotenv').config();
const mongoose = require('mongoose');
const MONGO_URI = process.env.MONGODB_URI || 'mongodb+srv://WestCoastCollegeAdmin:WCC26@cluster0.sm99qsu.mongodb.net/wcc-admin?retryWrites=true&w=majority';

mongoose.connect(MONGO_URI).then(async () => {
  const BlockGroup = require('./models/BlockGroup');
  const Student = require('./models/Student');

  // Check the BEED block groups
  const groups = await BlockGroup.find({ courseId: 101 }).lean();
  console.log('=== BEED Block Groups ===');
  groups.forEach(g => {
    console.log(JSON.stringify({
      name: g.name,
      courseId: g.courseId,
      curriculumId: g.curriculumId,
      yearLevel: g.yearLevel,
      semester: g.semester,
      schoolYear: g.schoolYear
    }));
  });

  // Check the student
  const student = await Student.findOne({ studentNumber: '202610140200' }).select('studentNumber course yearLevel semester schoolYear curriculumVersion studentStatus classification').lean();
  console.log('\n=== Student ===');
  console.log(JSON.stringify(student, null, 2));

  // Now simulate the eligibility check
  const BlockSection = require('./models/BlockSection');
  const Curriculum = require('./models/Curriculum');
  const AcademicPeriod = require('./models/AcademicPeriod');
  const blockEligibilityService = require('./services/blockEligibilityService');

  const Enrollment = require('./models/Enrollment');
  const enrollment = await blockEligibilityService.findActiveEnrollment(
    String(student._id),
    student.schoolYear,
    student.semester
  );
  console.log('\n=== Enrollment found ===');
  console.log(enrollment ? JSON.stringify({ _id: enrollment._id, status: enrollment.status, schoolYear: enrollment.schoolYear }) : 'NONE');

  const activePeriod = await AcademicPeriod.findOne({ status: 'Active' }).lean();
  console.log('\n=== Active Period ===');
  console.log(activePeriod ? JSON.stringify({ status: activePeriod.status, schoolYear: activePeriod.schoolYear }) : 'NONE');

  // Test eligibility for each BEED section
  for (const g of groups) {
    const sections = await BlockSection.find({ blockGroupId: g._id, status: 'OPEN' }).lean();
    for (const sec of sections) {
      let curriculumDoc = null;
      if (g.curriculumId) {
        curriculumDoc = await Curriculum.findById(g.curriculumId).select('version programCode programName status').lean();
      }

      const result = blockEligibilityService.evaluateStudentEligibility(
        enrollment,
        student,
        g,
        sec,
        null,
        curriculumDoc,
        activePeriod,
        { allowAutoEnroll: true }
      );
      console.log(`\n=== ${g.name} / ${sec.sectionCode} ===`);
      console.log('Eligible:', result.eligible);
      console.log('Reasons:', result.reasons);
      console.log('Checks:', JSON.stringify(result.checks));
    }
  }

  process.exit(0);
}).catch(e => { console.error(e); process.exit(1); });
