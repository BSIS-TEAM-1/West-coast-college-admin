const path = require('path');
const dotenv = require('dotenv');
const mongoose = require('mongoose');

// Load environment variables
dotenv.config({ path: path.join(__dirname, '..', '..', '.env') });
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const Student = require('../models/Student');
const Applicant = require('../models/Applicant');
const Enrollment = require('../models/Enrollment');
const StudentBlockAssignment = require('../models/StudentBlockAssignment');
const BlockSection = require('../models/BlockSection');

async function main() {
  if (!process.env.MONGODB_URI) {
    throw new Error('MONGODB_URI is not defined in environment');
  }

  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected to MongoDB');

  // Find enrolled students
  const enrolledStudents = await Student.find({
    $or: [
      { lifecycleStatus: 'Enrolled' },
      { enrollmentStatus: 'Enrolled' }
    ]
  });

  console.log(`Found ${enrolledStudents.length} enrolled student(s)`);

  for (const student of enrolledStudents) {
    const email = student.email.trim().toLowerCase();
    const givenYear = student.yearLevel || 1;
    console.log(`Processing student: ${student.firstName} ${student.lastName} (${email}), Year Level: ${givenYear}`);

    // Check if applicant record already exists
    let applicant = await Applicant.findOne({ email });

    if (applicant) {
      console.log(`Updating existing applicant record ${applicant.applicantNumber}`);
      applicant.status = 'Submitted';
      applicant.requestedYearLevel = givenYear; // Do not change their year that is already given to them
      applicant.selectedCourse = Number(student.course) || applicant.selectedCourse || 101;
      applicant.registrarRemarks = '';
      applicant.reviewedBy = undefined;
      applicant.reviewedAt = undefined;
      await applicant.save();
    } else {
      console.log(`Creating new applicant record for ${email}`);
      applicant = await Applicant.create({
        applicantType: student.applicantType || (student.studentStatus === 'Transferee' ? 'Transferee' : 'New'),
        status: 'Submitted',
        firstName: student.firstName,
        middleName: student.middleName || '',
        lastName: student.lastName,
        suffix: student.suffix || '',
        email,
        phoneNumber: student.contactNumber || '',
        birthDate: student.birthDate,
        birthPlace: student.birthPlace || '',
        gender: student.gender || '',
        civilStatus: student.civilStatus || '',
        nationality: student.nationality || 'Filipino',
        religion: student.religion || '',
        currentAddress: student.address || '',
        permanentAddress: student.permanentAddress || student.address || '',
        currentLocation: student.currentLocation,
        permanentLocation: student.permanentLocation,
        fatherName: student.fatherName || '',
        motherName: student.motherName || '',
        guardianName: student.guardianName || '',
        guardianRelationship: student.guardianRelationship || '',
        guardianContactNumber: student.guardianContactNumber || '',
        emergencyContact: student.emergencyContact,
        academicDetails: student.academicDetails,
        selectedCourse: Number(student.course) || 101,
        requestedYearLevel: givenYear, // Do not change their year that is already given to them
        semester: student.semester || '1st',
        schoolYear: student.schoolYear
      });
    }

    // Remove block assignments for this student
    const assignments = await StudentBlockAssignment.find({ studentId: student._id });
    const sectionIds = [...new Set(assignments.map(a => a.sectionId.toString()))];
    await StudentBlockAssignment.deleteMany({ studentId: student._id });

    // Recompute currentPopulation for affected sections
    for (const sectionId of sectionIds) {
      const count = await StudentBlockAssignment.countDocuments({
        sectionId,
        status: 'ASSIGNED'
      });
      await BlockSection.findByIdAndUpdate(sectionId, { currentPopulation: count });
      console.log(`Updated section ${sectionId} population to ${count}`);
    }

    // Remove enrollments for this student
    await Enrollment.deleteMany({ studentId: student._id });

    // Remove student record
    await Student.findByIdAndDelete(student._id);

    console.log(`Successfully converted ${student.firstName} ${student.lastName} into applicant ${applicant.applicantNumber} with Year Level ${applicant.requestedYearLevel}`);
  }

  console.log('All enrolled students have been converted to applicants with their given year levels preserved.');
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error('Error in makeEnrolledStudentsApplicants:', err);
  process.exit(1);
});
