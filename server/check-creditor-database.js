const mongoose = require('mongoose');
require('dotenv').config();

const CreditorDatabase = require('./models/CreditorDatabase');

async function checkCreditorDatabase() {
  try {
    console.log('🔌 Connecting to MongoDB...');
    const mongoUri = process.env.MONGODB_URI || 'mongodb+srv://justlukax:HPa1Me6NfYtzyqcO@backoffice.t0t9u7e.mongodb.net/?retryWrites=true&w=majority&appName=Backoffice';
    await mongoose.connect(mongoUri);
    console.log('✅ Connected to MongoDB\n');

    // Count total creditors
    const totalCount = await CreditorDatabase.countDocuments();
    console.log(`📊 Total creditors in database: ${totalCount}`);

    if (totalCount === 0) {
      console.log('\n⚠️ No creditors found in the database!');
      console.log('💡 You need to import creditor data using the admin interface:');
      console.log('   1. Go to http://localhost:3000/admin/creditor-database');
      console.log('   2. Click "Import" button');
      console.log('   3. Upload an Excel/CSV file with creditor data');
    } else {
      // Show first 5 creditors
      console.log('\n📋 Sample creditors:');
      const sampleCreditors = await CreditorDatabase.find().limit(5).lean();
      sampleCreditors.forEach((creditor, index) => {
        console.log(`\n${index + 1}. ${creditor.creditor_name}`);
        console.log(`   Email: ${creditor.email}`);
        console.log(`   Address: ${creditor.address}`);
        console.log(`   Phone: ${creditor.phone || 'N/A'}`);
      });

      // Show more statistics
      const activeCount = await CreditorDatabase.countDocuments({ is_active: true });
      const withEmail = await CreditorDatabase.countDocuments({ email: { $exists: true, $ne: '' } });

      console.log(`\n📈 Statistics:`);
      console.log(`   Active creditors: ${activeCount}`);
      console.log(`   Creditors with email: ${withEmail}`);
    }

    await mongoose.disconnect();
    console.log('\n✅ Done');
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

checkCreditorDatabase();
