const mongoose = require('mongoose');
const SecurityScan = require('../models/SecurityScan');

async function up() {
  console.log('Creating SecurityScan collection and indexes...');
  
  // This will create the collection if it doesn't exist
  await SecurityScan.createCollection();
  
  // Create indexes
  await SecurityScan.ensureIndexes();
  
  console.log('SecurityScan collection and indexes created successfully');
}

async function down() {
  console.log('Dropping SecurityScan collection...');
  await mongoose.connection.dropCollection('securityscans');
  console.log('SecurityScan collection dropped');
}

// Export both up and down functions
module.exports = { up, down };
