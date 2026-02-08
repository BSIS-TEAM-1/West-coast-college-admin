const mongoose = require('mongoose');

// MongoDB connection string from .env file
const MONGODB_URI = 'mongodb+srv://WestCoastCollegeAdmin:WCC26@cluster0.sm99qsu.mongodb.net/wcc-admin?retryWrites=true&w=majority';

// Connect to MongoDB
mongoose.connect(MONGODB_URI)
  .then(() => console.log('Connected to MongoDB'))
  .catch(err => console.error('MongoDB connection error:', err));

// Get the Admin model
const Admin = require('./models/Admin');

async function checkAndFixRegistrarAccounts() {
  try {
    console.log('Checking registrar accounts...');
    
    // Find all accounts
    const allAccounts = await Admin.find({});
    console.log(`Total accounts found: ${allAccounts.length}`);
    
    // Show all accounts with their types
    for (const account of allAccounts) {
      console.log(`Username: ${account.username}, AccountType: ${account.accountType}, UID: ${account.uid}`);
    }
    
    // Find accounts with username containing 'registrar' but wrong accountType
    const registrarAccounts = await Admin.find({
      username: { $regex: /registrar/i }
    });
    
    console.log(`\nFound ${registrarAccounts.length} registrar accounts:`);
    
    for (const account of registrarAccounts) {
      console.log(`Updating ${account.username}: current accountType = ${account.accountType} -> setting to 'registrar'`);
      
      await Admin.updateOne(
        { _id: account._id },
        { $set: { accountType: 'registrar' } }
      );
    }
    
    console.log('\nFinal verification:');
    const updatedAccounts = await Admin.find({ username: { $regex: /registrar/i } });
    for (const account of updatedAccounts) {
      console.log(`Username: ${account.username}, AccountType: ${account.accountType}`);
    }
    
  } catch (error) {
    console.error('Error checking registrar accounts:', error);
  } finally {
    await mongoose.disconnect();
    process.exit(0);
  }
}

checkAndFixRegistrarAccounts();
