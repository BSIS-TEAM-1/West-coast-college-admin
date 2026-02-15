require('dotenv').config({ path: require('path').join(__dirname, '.env') });
require('mongoose').connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/wcc-admin', {
  useNewUrlParser: true,
  useUnifiedTopology: true
}).then(async () => {
  const Student = require('./server/models/Student');
  const students = await Student.find({}).limit(5);
  console.log('Sample students:');
  students.forEach(student => {
    console.log(`ID: ${student._id}, Section: "${student.section}", Course: ${student.course}, YearLevel: ${student.yearLevel}, Semester: ${student.semester}`);
  });
  process.exit(0);
}).catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
