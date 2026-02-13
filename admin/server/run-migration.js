const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const migration = require('./migrations/001_create_security_scans_collection');

async function runMigration() {
  let mongoServer;
  
  try {
    // Connect to the database
    const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/wcc-admin';
    
    console.log('Connecting to MongoDB...');
    await mongoose.connect(uri, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    
    console.log('Running migration...');
    await migration.up();
    console.log('Migration completed successfully');
    
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  } finally {
    // Close the connection
    await mongoose.connection.close();
    
    if (mongoServer) {
      await mongoServer.stop();
    }
    
    console.log('Connection closed');
    process.exit(0);
  }
}

runMigration();
