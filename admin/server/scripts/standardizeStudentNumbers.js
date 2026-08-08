const mongoose = require('mongoose');
const Student = require('../models/Student');

const MONGODB_URI = 'mongodb+srv://WestCoastCollegeAdmin:WCC26@cluster0.sm99qsu.mongodb.net/wcc-admin?retryWrites=true&w=majority';

// Course code mapping to numeric values
const courseCodeMap = {
  'BEED': '101',
  'BSED-ENGLISH': '102',
  '103': '103',
  '102': '102',
  '201': '201',
};

function convertToNumeric(studentNumber) {
  const parts = studentNumber.split('-');
  
  if (parts.length >= 3) {
    // Format: Year-CourseCode-Number
    const year = parts[0];
    const courseCode = parts.slice(1, -1).join('-'); // Handle multi-part course codes like BSED-ENGLISH
    const studentNum = parts[parts.length - 1];
    
    const numericCourseCode = courseCodeMap[courseCode] || courseCode;
    
    return `${year}${numericCourseCode}${studentNum}`;
  } else if (parts.length === 2) {
    // Format: Year-Number (no course code?)
    const year = parts[0];
    const studentNum = parts[1];
    return `${year}${studentNum}`;
  }
  
  // Return as-is if format is unexpected
  return studentNumber;
}

mongoose.connect(MONGODB_URI)
  .then(async () => {
    console.log('Connected to database');
    
    const students = await Student.find({});
    
    console.log(`Found ${students.length} students`);
    
    const updates = [];
    const duplicates = new Map();
    
    for (const student of students) {
      const oldNumber = student.studentNumber;
      const newNumber = convertToNumeric(oldNumber);
      
      if (oldNumber === newNumber) {
        console.log(`✓ Already numeric: ${oldNumber}`);
        continue;
      }
      
      // Check for duplicates
      if (duplicates.has(newNumber)) {
        const existing = duplicates.get(newNumber);
        console.log(`⚠️  DUPLICATE: ${oldNumber} → ${newNumber} (conflicts with ${existing})`);
        continue;
      }
      
      duplicates.set(newNumber, oldNumber);
      updates.push({
        oldNumber,
        newNumber,
        student
      });
    }
    
    console.log(`\nNeed to update ${updates.length} student numbers`);
    
    if (updates.length === 0) {
      console.log('No updates needed');
      mongoose.disconnect();
      return;
    }
    
    // Show preview
    console.log('\nPreview of changes:');
    updates.forEach(u => {
      console.log(`  ${u.oldNumber} → ${u.newNumber}`);
    });
    
    // Confirm
    console.log('\nProceeding with updates...');
    
    let successCount = 0;
    let errorCount = 0;
    
    for (const update of updates) {
      try {
        // Check if new number already exists
        const existing = await Student.findOne({ studentNumber: update.newNumber });
        if (existing && existing._id.toString() !== update.student._id.toString()) {
          console.log(`⚠️  SKIPPED: ${update.oldNumber} → ${update.newNumber} (already exists)`);
          errorCount++;
          continue;
        }
        
        update.student.studentNumber = update.newNumber;
        await update.student.save();
        console.log(`✓ Updated: ${update.oldNumber} → ${update.newNumber}`);
        successCount++;
      } catch (err) {
        console.error(`✗ Error updating ${update.oldNumber}:`, err.message);
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
