const mongoose = require('mongoose');
require('dotenv').config({ path: '../.env' });

mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/wcc_college')
  .then(async () => {
    const Student = require('../models/Student');
    
    // Check some students to see their course assignments
    const students = await Student.find({})
      .select('studentNumber firstName lastName course')
      .limit(10)
      .lean();
    
    console.log('Sample students with their course assignments:');
    console.log(JSON.stringify(students, null, 2));
    
    // Count students by course
    const courseCounts = await Student.aggregate([
      {
        $group: {
          _id: '$course',
          count: { $sum: 1 }
        }
      }
    ]);
    
    console.log('\nStudent count by course:');
    console.log(JSON.stringify(courseCounts, null, 2));
    
    // Check for students without course
    const noCourseStudents = await Student.countDocuments({ course: { $exists: false } });
    console.log(`\nStudents without course field: ${noCourseStudents}`);
    
    await mongoose.disconnect();
  })
  .catch(err => {
    console.error('Error:', err);
    process.exit(1);
  });