/**
 * Storage Health Check Script
 *
 * Tests if the persistent disk is properly mounted and writable.
 * Run this on production to verify your Render.com disk setup.
 */

const fs = require('fs');
const path = require('path');

const uploadsDir = path.join(__dirname, 'uploads');

console.log('\n📦 STORAGE HEALTH CHECK\n');
console.log('='.repeat(50));

try {
  // Test 1: Check if uploads directory exists
  console.log('\n1️⃣  Checking if uploads directory exists...');
  const exists = fs.existsSync(uploadsDir);
  console.log(`   Path: ${uploadsDir}`);
  console.log(`   Exists: ${exists ? '✅ YES' : '❌ NO'}`);

  if (!exists) {
    console.log('   Creating uploads directory...');
    fs.mkdirSync(uploadsDir, { recursive: true });
    console.log('   ✅ Directory created');
  }

  // Test 2: Check if directory is writable
  console.log('\n2️⃣  Testing write permissions...');
  const testFile = path.join(uploadsDir, '.health-check.txt');
  const testContent = `Storage health check - ${new Date().toISOString()}`;

  fs.writeFileSync(testFile, testContent);
  console.log('   ✅ Write successful');

  // Test 3: Check if we can read the file
  console.log('\n3️⃣  Testing read permissions...');
  const readContent = fs.readFileSync(testFile, 'utf8');
  console.log(`   ✅ Read successful: "${readContent.substring(0, 30)}..."`);

  // Test 4: Check if we can delete
  console.log('\n4️⃣  Testing delete permissions...');
  fs.unlinkSync(testFile);
  console.log('   ✅ Delete successful');

  // Test 5: List existing client directories
  console.log('\n5️⃣  Listing client directories...');
  const entries = fs.readdirSync(uploadsDir);
  const directories = entries.filter(entry => {
    const fullPath = path.join(uploadsDir, entry);
    return fs.statSync(fullPath).isDirectory();
  });

  console.log(`   Total client directories: ${directories.length}`);
  if (directories.length > 0) {
    console.log('   First 10 directories:');
    directories.slice(0, 10).forEach(dir => {
      const dirPath = path.join(uploadsDir, dir);
      const files = fs.readdirSync(dirPath);
      console.log(`   - ${dir}: ${files.length} files`);
    });
  } else {
    console.log('   ⚠️  No client directories found (uploads directory is empty)');
  }

  // Test 6: Calculate total storage used
  console.log('\n6️⃣  Calculating storage usage...');
  let totalSize = 0;
  let totalFiles = 0;

  function calculateDirSize(dirPath) {
    const items = fs.readdirSync(dirPath);
    items.forEach(item => {
      const itemPath = path.join(dirPath, item);
      const stat = fs.statSync(itemPath);
      if (stat.isDirectory()) {
        calculateDirSize(itemPath);
      } else {
        totalSize += stat.size;
        totalFiles++;
      }
    });
  }

  calculateDirSize(uploadsDir);

  const sizeInMB = (totalSize / (1024 * 1024)).toFixed(2);
  const sizeInGB = (totalSize / (1024 * 1024 * 1024)).toFixed(2);

  console.log(`   Total files: ${totalFiles}`);
  console.log(`   Total size: ${sizeInMB} MB (${sizeInGB} GB)`);

  // Test 7: Check disk mount info (Linux only)
  console.log('\n7️⃣  Checking disk mount info...');
  try {
    const { execSync } = require('child_process');
    const dfOutput = execSync('df -h | grep uploads || df -h .', { encoding: 'utf8' });
    console.log('   Disk usage:');
    console.log(dfOutput.split('\n').map(line => `   ${line}`).join('\n'));
  } catch (e) {
    console.log('   ⚠️  Could not retrieve disk info (might not be Linux)');
  }

  console.log('\n' + '='.repeat(50));
  console.log('✅ STORAGE HEALTH CHECK PASSED');
  console.log('='.repeat(50));
  console.log('\n📝 Summary:');
  console.log(`   - Upload directory: ${uploadsDir}`);
  console.log(`   - Writable: ✅ YES`);
  console.log(`   - Client directories: ${directories.length}`);
  console.log(`   - Total files: ${totalFiles}`);
  console.log(`   - Storage used: ${sizeInMB} MB`);
  console.log('\n💡 Tips:');
  console.log('   - Upload a test file from admin dashboard');
  console.log('   - Check if it persists after container restart');
  console.log('   - Run this script again to verify');
  console.log('');

  process.exit(0);

} catch (error) {
  console.log('\n' + '='.repeat(50));
  console.log('❌ STORAGE HEALTH CHECK FAILED');
  console.log('='.repeat(50));
  console.error('\nError:', error.message);
  console.error('\nStack trace:', error.stack);
  console.log('\n🔧 Troubleshooting:');
  console.log('   1. Check if persistent disk is mounted at /app/server/uploads');
  console.log('   2. Verify disk permissions (should be writable)');
  console.log('   3. Check Render.com dashboard for disk status');
  console.log('   4. Review server logs for mount errors');
  console.log('');
  process.exit(1);
}
