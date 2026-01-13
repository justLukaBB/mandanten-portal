const { Storage } = require('@google-cloud/storage');
const path = require('path');
const fs = require('fs');

const keyFilePath = path.join(process.cwd(), 'config/gcs-keys.json');
const uploadsDir = path.join(process.cwd(), 'uploads'); // Local fallback directory

// Ensure uploads directory exists for fallback
if (!fs.existsSync(uploadsDir)) {
  try {
    fs.mkdirSync(uploadsDir, { recursive: true });
    console.log('📂 Created local uploads directory');
  } catch (err) {
    console.error('❌ Failed to create uploads directory:', err);
  }
}

let storage;
let bucket;
let isGCSConfigured = false;
const bucketName = 'automation_scuric';

// Initialize GCS securely
// Try environment variables first (multiple formats), then file
if (process.env.GCS_KEY_BASE64) {
  try {
    console.log('🔑 Using GCS credentials from GCS_KEY_BASE64 environment variable');
    const decodedJson = Buffer.from(process.env.GCS_KEY_BASE64, 'base64').toString('utf-8');
    const credentials = JSON.parse(decodedJson);

    // Fix escaped newlines in private_key
    if (credentials.private_key) {
      credentials.private_key = credentials.private_key.replace(/\\n/g, '\n');
    }

    storage = new Storage({
      credentials: credentials,
      projectId: credentials.project_id
    });
    bucket = storage.bucket(bucketName);
    isGCSConfigured = true;
    console.log('✅ GCS Service Initialized (from GCS_KEY_BASE64)');
    console.log(`📧 Using service account: ${credentials.client_email}`);
  } catch (error) {
    console.error('⚠️ GCS Initialization failed (GCS_KEY_BASE64 exists but invalid):', error.message);
  }
} else if (process.env.GCS_CLIENT_EMAIL && process.env.GCS_PRIVATE_KEY) {
  try {
    console.log('🔑 Using GCS credentials from GCS_CLIENT_EMAIL and GCS_PRIVATE_KEY');
    const credentials = {
      client_email: process.env.GCS_CLIENT_EMAIL,
      private_key: process.env.GCS_PRIVATE_KEY.replace(/\\n/g, '\n'), // Handle escaped newlines
    };
    storage = new Storage({
      credentials: credentials,
      projectId: 'automationscuric' // Your project ID
    });
    bucket = storage.bucket(bucketName);
    isGCSConfigured = true;
    console.log('✅ GCS Service Initialized (from GCS_CLIENT_EMAIL/GCS_PRIVATE_KEY)');
    console.log(`📧 Using service account: ${credentials.client_email}`);
  } catch (error) {
    console.error('⚠️ GCS Initialization failed (GCS_CLIENT_EMAIL/GCS_PRIVATE_KEY exist but invalid):', error.message);
  }
} else if (process.env.GOOGLE_SERVICE_ACCOUNT_KEY) {
  try {
    console.log('🔑 Using GCS credentials from GOOGLE_SERVICE_ACCOUNT_KEY environment variable');
    const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY);
    storage = new Storage({
      credentials: credentials,
      projectId: credentials.project_id
    });
    bucket = storage.bucket(bucketName);
    isGCSConfigured = true;
    console.log('✅ GCS Service Initialized (from GOOGLE_SERVICE_ACCOUNT_KEY)');
    console.log(`📧 Using service account: ${credentials.client_email}`);
  } catch (error) {
    console.error('⚠️ GCS Initialization failed (GOOGLE_SERVICE_ACCOUNT_KEY exists but invalid):', error.message);
  }
} else if (fs.existsSync(keyFilePath)) {
  try {
    console.log('🔑 Using GCS credentials from file:', keyFilePath);
    storage = new Storage({
      keyFilename: keyFilePath,
    });
    bucket = storage.bucket(bucketName);
    isGCSConfigured = true;
    console.log('✅ GCS Service Initialized (from file)');
  } catch (error) {
    console.error('⚠️ GCS Initialization failed (key file exists but invalid):', error.message);
  }
} else {
  console.log('⚠️ GCS keys not found (no env var or file). Falling back to local storage (server/uploads).');
}

const uploadToGCS = (file) => {
  return new Promise((resolve, reject) => {
    // Generate unique filename
    const filename = Date.now() + '-' + file.originalname.replace(/\s+/g, '_');

    // FALLBACK: Local Storage
    if (!isGCSConfigured) {
      const localPath = path.join(uploadsDir, filename);
      console.log(`💾 GCS disabled. Saving locally to: ${localPath}`);

      fs.writeFile(localPath, file.buffer, (err) => {
        if (err) {
          return reject(new Error(`Failed to save file locally: ${err.message}`));
        }
        // Return the filename as the identity, which can be used to construct a local URL later if needed
        resolve(filename);
      });
      return;
    }

    // ORIGINAL: GCS Storage
    const blob = bucket.file(filename);
    const blobStream = blob.createWriteStream({
      resumable: false,
      metadata: {
        contentType: file.mimetype,
      },
    });

    blobStream.on('error', (err) => reject(err));
    blobStream.on('finish', () => {
      resolve(`https://storage.googleapis.com/${bucketName}/${blob.name}`);
    });

    blobStream.end(file.buffer);
  });
};

const getGCSFileStream = (filename) => {
  if (!isGCSConfigured) {
    // Remove full path if present in filename to avoid traversal issues, or simple join
    // Assuming filename is just the basename
    const cleanFilename = path.basename(filename);
    const localPath = path.join(uploadsDir, cleanFilename);
    const altLocalPath = path.join(uploadsDir, filename); // In case it wasn't cleaned

    if (fs.existsSync(localPath)) {
      return fs.createReadStream(localPath);
    } else if (fs.existsSync(altLocalPath)) {
      return fs.createReadStream(altLocalPath);
    } else {
      // Return a stream that emits an error immediately
      const { Readable } = require('stream');
      const errorStream = new Readable({
        read() {
          this.emit('error', new Error(`Local file not found: ${filename}`));
          this.push(null);
        }
      });
      return errorStream;
    }
  }
  return bucket.file(filename).createReadStream();
};

const getGCSFileBuffer = (filename) => {
  return new Promise((resolve, reject) => {
    if (!isGCSConfigured) {
      const cleanFilename = path.basename(filename);
      const localPath = path.join(uploadsDir, cleanFilename);

      fs.readFile(localPath, (err, data) => {
        if (err) reject(new Error(`Local file read error: ${err.message}`));
        else resolve(data);
      });
      return;
    }

    const file = bucket.file(filename);
    file.download((err, contents) => {
      if (err) {
        return reject(err);
      }
      resolve(contents);
    });
  });
};

module.exports = { uploadToGCS, getGCSFileStream, getGCSFileBuffer, bucket };
