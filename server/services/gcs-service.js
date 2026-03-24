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
// PREFER GCS_CLIENT_EMAIL + GCS_PRIVATE_KEY (most reliable)
if (process.env.GCS_CLIENT_EMAIL && process.env.GCS_PRIVATE_KEY) {
  try {
    console.log('🔑 Using GCS credentials from GCS_CLIENT_EMAIL and GCS_PRIVATE_KEY');

    // Handle private key - it might have literal \n that need to be converted to actual newlines
    let privateKey = process.env.GCS_PRIVATE_KEY;

    // If the key doesn't start with the expected header, it might be base64 encoded
    if (!privateKey.startsWith('-----BEGIN')) {
      console.log('🔓 Private key appears to be encoded, attempting base64 decode...');
      try {
        privateKey = Buffer.from(privateKey, 'base64').toString('utf-8');
      } catch (decodeError) {
        console.log('⚠️ Base64 decode failed, using raw value');
      }
    }

    // Replace literal \n characters with actual newlines
    privateKey = privateKey.replace(/\\n/g, '\n');

    const credentials = {
      client_email: process.env.GCS_CLIENT_EMAIL,
      private_key: privateKey,
    };

    storage = new Storage({
      credentials: credentials,
      projectId: 'automationscuric'
    });
    bucket = storage.bucket(bucketName);
    isGCSConfigured = true;
    console.log('✅ GCS Service Initialized (from GCS_CLIENT_EMAIL/GCS_PRIVATE_KEY)');
    console.log(`📧 Using service account: ${credentials.client_email}`);
  } catch (error) {
    console.error('⚠️ GCS Initialization failed (GCS_CLIENT_EMAIL/GCS_PRIVATE_KEY exist but invalid):', error.message);
  }
} else if (process.env.GCS_KEY_BASE64) {
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

/**
 * Upload file to GCS with optional tenant prefix.
 * @param {Object} file - Multer file object
 * @param {Object} [options] - Optional tenant context
 * @param {string} [options.kanzleiId] - Tenant ID for path prefix
 * @param {string} [options.clientId] - Client ID for path prefix
 */
const uploadToGCS = (file, options = {}) => {
  return new Promise((resolve, reject) => {
    // Generate unique filename with tenant prefix
    const baseName = Date.now() + '-' + file.originalname.replace(/\s+/g, '_');
    let filename;
    if (options.kanzleiId && options.clientId) {
      filename = `${options.kanzleiId}/clients/${options.clientId}/${baseName}`;
    } else if (options.kanzleiId) {
      filename = `${options.kanzleiId}/${baseName}`;
    } else {
      filename = baseName; // Backwards-compatible flat path
    }

    console.log(`📤 Upload Request:`, {
      originalName: file.originalname,
      generatedFilename: filename,
      size: file.size,
      mimetype: file.mimetype,
      gcsConfigured: isGCSConfigured
    });

    // FALLBACK: Local Storage
    if (!isGCSConfigured) {
      const localPath = path.join(uploadsDir, filename);
      // Ensure subdirectories exist for tenant-prefixed paths
      const localDir = path.dirname(localPath);
      if (!fs.existsSync(localDir)) {
        fs.mkdirSync(localDir, { recursive: true });
      }
      console.log(`💾 GCS disabled. Saving locally to: ${localPath}`);

      // Support both disk storage (file.path) and memory storage (file.buffer)
      const saveLocal = file.path
        ? (cb) => fs.copyFile(file.path, localPath, cb)
        : (cb) => fs.writeFile(localPath, file.buffer, cb);

      saveLocal((err) => {
        if (err) {
          console.error(`❌ Local save failed for ${filename}:`, err.message);
          return reject(new Error(`Failed to save file locally: ${err.message}`));
        }
        console.log(`✅ File saved locally: ${filename}`);
        // Return the filename as the identity, which can be used to construct a local URL later if needed
        resolve(filename);
      });
      return;
    }

    // ORIGINAL: GCS Storage
    console.log(`☁️ Uploading to GCS bucket: ${bucketName}/${filename}`);
    const blob = bucket.file(filename);
    const blobStream = blob.createWriteStream({
      resumable: false,
      metadata: {
        contentType: file.mimetype,
      },
    });

    blobStream.on('error', (err) => {
      console.error(`❌ GCS upload failed for ${filename}:`, err.message);
      reject(err);
    });
    blobStream.on('finish', async () => {
      try {
        // Generate a signed URL that expires in 24 hours
        // FastAPI can download this without needing GCS credentials
        const [signedUrl] = await blob.getSignedUrl({
          version: 'v4',
          action: 'read',
          expires: Date.now() + 24 * 60 * 60 * 1000, // 24 hours
        });
        console.log(`✅ GCS upload complete: ${filename}`);
        console.log(`🔗 Generated signed URL (expires in 24h)`);
        resolve(signedUrl);
      } catch (error) {
        console.error(`⚠️ Failed to generate signed URL for ${filename}:`, error.message);
        // Fallback to public URL if signing fails
        const publicUrl = `https://storage.googleapis.com/${bucketName}/${blob.name}`;
        console.log(`🔗 Using public URL instead: ${publicUrl}`);
        resolve(publicUrl);
      }
    });

    // Support both disk storage (file.path) and memory storage (file.buffer)
    if (file.path) {
      fs.createReadStream(file.path).pipe(blobStream);
    } else {
      blobStream.end(file.buffer);
    }
  });
};

const getGCSFileStream = (filename) => {
  console.log(`📥 File stream request for: ${filename}`, {
    gcsConfigured: isGCSConfigured
  });

  if (!isGCSConfigured) {
    // Remove full path if present in filename to avoid traversal issues, or simple join
    // Assuming filename is just the basename
    const cleanFilename = path.basename(filename);
    const localPath = path.join(uploadsDir, cleanFilename);
    const altLocalPath = path.join(uploadsDir, filename); // In case it wasn't cleaned

    console.log(`🔍 Checking local storage:`, {
      cleanPath: localPath,
      altPath: altLocalPath,
      cleanExists: fs.existsSync(localPath),
      altExists: fs.existsSync(altLocalPath)
    });

    if (fs.existsSync(localPath)) {
      console.log(`✅ Found locally: ${localPath}`);
      return fs.createReadStream(localPath);
    } else if (fs.existsSync(altLocalPath)) {
      console.log(`✅ Found locally (alt path): ${altLocalPath}`);
      return fs.createReadStream(altLocalPath);
    } else {
      console.error(`❌ Local file not found: ${filename}`);
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

  // Extract base filename from signed URL (remove query parameters)
  // Ensure we handle both encoded and decoded filenames for local check
  const baseFilename = filename.split('?')[0];
  const decodedFilename = decodeURIComponent(baseFilename);

  // Prioritize Local File if it exists (Faster, and handles legacy/fallback files)
  const localPath = path.join(uploadsDir, decodedFilename);
  const altLocalPath = path.join(uploadsDir, baseFilename);

  if (fs.existsSync(localPath)) {
    console.log(`✅ Found locally (preferring local over GCS): ${localPath}`);
    return fs.createReadStream(localPath);
  } else if (fs.existsSync(altLocalPath)) {
    console.log(`✅ Found locally (preferring local over GCS - alt): ${altLocalPath}`);
    return fs.createReadStream(altLocalPath);
  }

  console.log(`☁️ Fetching from GCS: ${baseFilename}`);
  return bucket.file(baseFilename).createReadStream();
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

    // Extract base filename from signed URL (remove query parameters)
    const baseFilename = filename.split('?')[0];
    const file = bucket.file(baseFilename);
    file.download((err, contents) => {
      if (err) {
        return reject(err);
      }
      resolve(contents);
    });
  });
};

/**
 * Delete a file from GCS (or local fallback).
 * Accepts a filename, GCS path, or signed URL.
 * @param {string} filenameOrUrl - File identifier
 * @returns {Promise<boolean>} true if deleted, false if not found
 */
const deleteFromGCS = async (filenameOrUrl) => {
  if (!filenameOrUrl) return false;

  // Extract base filename from signed URL
  const baseFilename = filenameOrUrl.split('?')[0];
  // Strip GCS public URL prefix if present
  const gcsPrefix = `https://storage.googleapis.com/${bucketName}/`;
  const cleanFilename = baseFilename.startsWith(gcsPrefix)
    ? baseFilename.slice(gcsPrefix.length)
    : baseFilename;

  if (!isGCSConfigured) {
    // Local fallback: try to delete from uploads dir
    const localPath = path.join(uploadsDir, cleanFilename);
    if (fs.existsSync(localPath)) {
      fs.unlinkSync(localPath);
      return true;
    }
    return false;
  }

  try {
    const file = bucket.file(cleanFilename);
    const [exists] = await file.exists();
    if (exists) {
      await file.delete();
      return true;
    }
    return false;
  } catch (error) {
    console.error(`[GCS] Delete failed for ${cleanFilename}:`, error.message);
    return false;
  }
};

module.exports = { uploadToGCS, getGCSFileStream, getGCSFileBuffer, deleteFromGCS, bucket };
