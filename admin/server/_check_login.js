require('dotenv').config({ path: '../.env' });
const mongoose = require('mongoose');
const Student = require('./models/Student');

(async () => {
  await mongoose.connect(process.env.MONGODB_URI);
  const student = await Student.findOne({ studentNumber: '202610140200' }).select('+password firstName middleName lastName studentNumber');
  console.log('Name:', student.firstName, student.middleName, student.lastName);
  console.log('Default password would be:', student.generateDefaultPassword());
  console.log('Has stored password:', !!student.password);

  // Try the default password
  const valid = await student.comparePassword(student.generateDefaultPassword());
  console.log('Default password valid:', valid);

  await mongoose.disconnect();
})();
