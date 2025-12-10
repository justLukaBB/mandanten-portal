const { Storage } = require('@google-cloud/storage');

const storage = new Storage({
  projectId: process.env.GCS_PROJECT_ID,
  credentials: {
    client_email: process.env.GCS_CLIENT_EMAIL,
    private_key: process.env.GCS_PRIVATE_KEY ? process.env.GCS_PRIVATE_KEY.replace(/\\n/g, '\n') : undefined,
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
