require('dotenv').config({ path: '../.env' });
const mongoose = require('mongoose');
const Student = require('./models/Student');

(async () => {
  await mongoose.connect(process.env.MONGODB_URI);
  const s = await Student.findOne({ studentNumber: '202610140200' }).select('+password');
  
  // Reset password to the default — the pre-save hook will hash it
  s.password = s.generateDefaultPassword();
  await s.save();
  
  // Now verify
  const s2 = await Student.findOne({ studentNumber: '202610140200' }).select('+password');
  const valid = await s2.comparePassword('rap0200');
  console.log('After reset - bcrypt compare rap0200:', valid);
  console.log('Password starts with $2:', s2.password?.startsWith('$2'));
  
  await mongoose.disconnect();
})();
