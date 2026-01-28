const multer = require('multer');
const path = require('path');
const fs = require('fs-extra');
const { v4: uuidv4 } = require('uuid');
const config = require('../config');


// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, '../uploads');
fs.ensureDirSync(uploadsDir);

// Configure multer for file uploads
// Changed to memory storage for GCS upload
const storage = multer.memoryStorage();

// Legacy disk storage - disabled
/*
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        const clientId = req.params.clientId || 'default';
        const clientDir = path.join(uploadsDir, clientId);
        fs.ensureDirSync(clientDir);
        cb(null, clientDir);
    },
    filename: function (req, file, cb) {
        const uniqueId = uuidv4();
        const extension = path.extname(file.originalname);
        const filename = `${uniqueId}${extension}`;
        cb(null, filename);
    }
});
*/

const fileFilter = (req, file, cb) => {
    // Accept only specific file types
    const allowedTypes = [
        'application/pdf',
        'image/jpeg',
        'image/jpg',
        'image/png',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ];

    if (allowedTypes.includes(file.mimetype)) {
        cb(null, true);
    } else {
        cb(new Error('Dateityp nicht unterstützt. Erlaubte Formate: PDF, JPG, PNG, DOC, DOCX'), false);
    }
};

const upload = multer({
    storage: storage,
    limits: {
        fileSize: config.MAX_FILE_SIZE
    },
    fileFilter: fileFilter
});

/**
 * Upload Timeout Middleware
 * Sets a timeout for upload requests to prevent hanging connections
 * @param {number} timeoutMs - Timeout in milliseconds (default: 5 minutes)
 */
const uploadTimeout = (timeoutMs = 300000) => {
    return (req, res, next) => {
        // Store original timeout for logging
        const originalTimeout = req.socket.timeout;

        console.log(`⏱️  Upload timeout middleware: Setting timeout to ${timeoutMs}ms (was ${originalTimeout}ms)`);

        // Set request timeout
        req.setTimeout(timeoutMs, () => {
            console.error(`❌ Upload timeout: Request exceeded ${timeoutMs}ms`, {
                method: req.method,
                url: req.originalUrl,
                contentLength: req.headers['content-length'],
                contentType: req.headers['content-type'],
                clientId: req.params?.clientId
            });

            if (!res.headersSent) {
                res.status(408).json({
                    error: 'Upload timeout - Die Anfrage dauerte zu lange',
                    code: 'REQUEST_TIMEOUT',
                    timeout: timeoutMs,
                    hint: 'Versuchen Sie, weniger oder kleinere Dateien gleichzeitig hochzuladen'
                });
            }
        });

        // Also set response timeout
        res.setTimeout(timeoutMs, () => {
            console.error(`❌ Response timeout: Response exceeded ${timeoutMs}ms`);
        });

        next();
    };
};

module.exports = {
    upload,
    uploadsDir,
    uploadTimeout
}