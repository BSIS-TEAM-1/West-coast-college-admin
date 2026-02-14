const mongoose = require('mongoose');
require('dotenv').config();

// Import models
const { Student, Counter, Enrollment } = require('./20240213_create_student_tables');

// Database connection
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/wcc_admin';

async function runMigration() {
  console.log('Starting database migration...');
  
  try {
    // Connect to MongoDB
    await mongoose.connect(MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      useCreateIndex: true,
      useFindAndModify: false
    });
    console.log('Connected to MongoDB');

    // Create indexes for Student collection
    console.log('Creating indexes for Student collection...');
    await Student.createIndexes([
      { studentNumber: 1 }, // Unique index for student number
      { email: 1 }, // Unique index for email
      { lastName: 1, firstName: 1 }, // Compound index for name search
      { course: 1, yearLevel: 1, status: 1 } // For filtering students
    ]);
    console.log('Student indexes created');

    // Create indexes for Enrollment collection
    console.log('Creating indexes for Enrollment collection...');
    await Enrollment.createIndexes([
      { studentId: 1, schoolYear: 1, semester: 1 }, // For finding current enrollment
      { 'subjects.subjectId': 1 }, // For finding enrollments by subject
      { status: 1, 'subjects.status': 1 } // For filtering enrollments
    ]);
    console.log('Enrollment indexes created');

    // Initialize counters if they don't exist
    console.log('Initializing counters...');
    const courses = ['BSIT', 'BSCS', 'BSIS', 'BSCE', 'BSECE', 'BSEE', 'BSME', 'BSN', 'BSA', 'BSBA'];
    const currentYear = new Date().getFullYear();
    
    for (const course of courses) {
      await Counter.findOneAndUpdate(
        { _id: `student_${course}_${currentYear}` },
        { $setOnInsert: { seq: 0 } },
        { upsert: true }
      );
    }
    console.log('Counters initialized');

    console.log('Database migration completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }
}

// Run the migration
runMigration();
