const mongoose = require('mongoose');
require('dotenv').config({ path: '../.env' });

async function dropEmailIndex() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    const db = mongoose.connection.db;
    await db.collection('students').dropIndex('email_1');
    console.log('Dropped email_1 index');

    await mongoose.disconnect();
    console.log('Disconnected');
  } catch (error) {
    console.error('Error:', error);
  }
}

dropEmailIndex();
