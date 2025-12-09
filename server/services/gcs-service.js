 const { Storage } = require('@google-cloud/storage');
// const path = require('path');

// const keyFilePath = path.join(process.cwd(), 'config/gcs-keys.json');

// const storage = new Storage({
//   keyFilename: keyFilePath,
// });

let credentials = {};

if (process.env.GCS_KEY_BASE64) {
  const decoded = Buffer.from(process.env.GCS_KEY_BASE64, 'base64').toString();
  credentials = JSON.parse(decoded);
}

console.log('credentials', credentials);
const storage = new Storage({
  projectId: credentials.project_id,
  credentials: {
    client_email: credentials.client_email,
    private_key: credentials.private_key,
  },
});

const bucketName = 'automation_scuric'; 
const bucket = storage.bucket(bucketName);

const uploadToGCS = (file) => {
  return new Promise((resolve, reject) => {
    const blob = bucket.file(Date.now() + '-' + file.originalname);
    const blobStream = blob.createWriteStream({
      resumable: false,
      metadata: {
        contentType: file.mimetype,
      },
    });

    blobStream.on('error', (err) => reject(err));
    blobStream.on('finish', () => {
      // Public URL
      // resolve(`https://storage.googleapis.com/${bucketName}/${blob.name}`);
      
      // Determine if we should return a public URL or just the name. 
      // For now, following the user's snippet:
      resolve(`https://storage.googleapis.com/${bucketName}/${blob.name}`);
    });

    blobStream.end(file.buffer);
  });
};

const getGCSFileStream = (filename) => {
  return bucket.file(filename).createReadStream();
};

const getGCSFileBuffer = (filename) => {
  return new Promise((resolve, reject) => {
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
