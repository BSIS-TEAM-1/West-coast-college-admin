const mongoose = require('mongoose');
const Student = require('../models/Student');
const fs = require('fs');

const MONGODB_URI = 'mongodb+srv://WestCoastCollegeAdmin:WCC26@cluster0.sm99qsu.mongodb.net/wcc-admin?retryWrites=true&w=majority';

mongoose.connect(MONGODB_URI)
  .then(async () => {
    console.log('Connected to database');
    
    const students = await Student.find({ isActive: true }).select('studentNumber firstName lastName fullName course yearLevel section').limit(50);
    
    console.log(`Found ${students.length} active students`);
    
    const studentData = students.map(s => ({
      studentNumber: s.studentNumber,
      name: s.fullName,
      course: s.course,
      yearLevel: s.yearLevel,
      section: s.section
    }));
    
    fs.writeFileSync('students_export.json', JSON.stringify(studentData, null, 2));
    console.log('✅ Exported to students_export.json');
    
    // Also print to console
    console.log('\nStudent List:');
    studentData.forEach(s => {
      console.log(`- ${s.studentNumber}: ${s.name}`);
    });
    
    mongoose.disconnect();
  })
  .catch(err => {
    console.error('Error:', err);
    process.exit(1);
  });
