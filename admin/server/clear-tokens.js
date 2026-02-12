const mongoose = require('mongoose');
require('dotenv').config();

mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/west-coast-college')
  .then(async () => {
    console.log('Connected to MongoDB');
    
    // Clear all existing tokens to force logout
    try {
      const AuthToken = mongoose.model('AuthToken');
      const result = await AuthToken.deleteMany({});
      console.log(`Cleared ${result.deletedCount} existing tokens from database`);
    } catch (error) {
      console.log('AuthToken collection may not exist, continuing...');
    }
    
    await mongoose.connection.close();
    console.log('Database connection closed');
  })
  .catch(console.error);
