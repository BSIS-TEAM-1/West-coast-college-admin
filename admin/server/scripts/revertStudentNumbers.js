const mongoose = require('mongoose');
const Student = require('../models/Student');

const MONGODB_URI = 'mongodb+srv://WestCoastCollegeAdmin:WCC26@cluster0.sm99qsu.mongodb.net/wcc-admin?retryWrites=true&w=majority';

// Original student numbers before conversion
const originalNumbers = {
  '202484690': '2024-BEED-84690',
  '202428391': '2024-BEED-28391',
  '202559006': '2025-BSED-ENGLISH-59006',
  '202420375': '2024-BSED-ENGLISH-20375',
  '202610351827': '2026-103-51827',
  '202610220298': '2026-102-20298',
  '202610292847': '2026-102-92847',
  '202620192455': '2026-201-92455',
  '202620145474': '2026-201-45474',
  '202610344340': '2026-103-44340',
};

mongoose.connect(MONGODB_URI)
  .then(async () => {
    console.log('Connected to database');
    
    let successCount = 0;
    let errorCount = 0;
    
    for (const [currentNumber, originalNumber] of Object.entries(originalNumbers)) {
      try {
        const student = await Student.findOne({ studentNumber: currentNumber });
        if (student) {
          student.studentNumber = originalNumber;
          await student.save();
          console.log(`✓ Reverted: ${currentNumber} → ${originalNumber}`);
          successCount++;
        }
      } catch (err) {
        console.error(`✗ Error reverting ${currentNumber}:`, err.message);
        errorCount++;
      }
    }
    
    console.log(`\n✅ Success: ${successCount}`);
    console.log(`❌ Errors: ${errorCount}`);
    
    mongoose.disconnect();
  })
  .catch(err => {
    console.error('Error:', err);
    process.exit(1);
  });
