# File Not Found Error - Fix Documentation

## Issue Summary
Users were receiving "File not found" errors when attempting to download documents from the admin dashboard. The diagnostic investigation revealed that:

1. **Root Cause**: Document metadata exists in MongoDB, but actual files are missing from the filesystem
2. **Scope**: Client `1412_25` (Nico Oerder) has 14 documents in database, but 0 files on disk
3. **Data Corruption**: Documents have `type: unknown` instead of proper MIME types

## Diagnostic Findings

### Client: 1412_25 (Nico Oerder)
- **Database Records**: 14 documents
- **Files on Disk**: 0 documents
- **Upload Directories Checked**:
  - `/Users/luka.s/mandanten-portal/server/uploads/a13f149f-b8de-46c0-b787-a808b214ef55` ❌
  - `/Users/luka.s/mandanten-portal/server/uploads/1412_25` ❌

### Document Examples:
All documents missing, including:
- Bild_2025-11-20_203136917.png
- goldbach financial.jpeg
- Universum Inkasso.png
- PAIR Finance GmbH.png
- etc.

### Issue Pattern:
- Document ID in database: `5147c6b8-46e4-4d0e-a73a-b1dcdf2b1d56`
- Stored filename: `4b07e8b2-7399-46ec-a829-2ebc928df978.png`
- Actual filename: `Bild_2025-11-20_203136917.png`
- MIME type: `unknown` (should be `image/png`)
- File exists: ❌ None found

## Improvements Made

### 1. Enhanced File Path Resolution
**File**: `server/server.js` (lines 1299-1384)

**Before**:
- Only tried 4 paths
- Used incorrect extension detection (always defaulted to .pdf for unknown types)
- Limited error messages

**After**:
- Tries multiple extensions: png, jpg, jpeg, pdf, doc, docx
- Checks 3 base directories: clientId, aktenzeichen, client.id
- Tries document ID + all extensions
- Tries stored filename
- Tries document name
- **Total**: Up to 30+ possible paths checked

**New Extension Detection Logic**:
```javascript
// 1. Try to detect from MIME type
if (document.type && document.type !== 'unknown') {
  detectedExtension = document.type.split('/')[1];
}
// 2. Fallback: extract from filename
else if (document.filename || document.name) {
  const match = filename.match(/\.([a-zA-Z0-9]+)$/);
  detectedExtension = match[1].toLowerCase();
}
// 3. Fallback: default to pdf
```

### 2. Better Error Messages

**Before**:
```json
{
  "error": "File not found"
}
```

**After**:
```json
{
  "error": "File not found",
  "message": "The document file could not be found on the server. It may have been deleted or the upload may have failed.",
  "document_name": "Bild_2025-11-20_203136917.png",
  "document_id": "5147c6b8-46e4-4d0e-a73a-b1dcdf2b1d56",
  "suggestions": [
    "The file may need to be re-uploaded",
    "Check if the file exists in the uploads directory",
    "Contact support if the issue persists"
  ]
}
```

### 3. Enhanced Logging

**New logging output includes**:
- ✅ Success message when file is found: `✅ Found file at: /path/to/file`
- ❌ Detailed error message with document metadata
- 📊 Number of paths tried
- 📋 First 10 paths attempted (for debugging)

**Example log output**:
```
❌ File not found for document 5147c6b8-46e4-4d0e-a73a-b1dcdf2b1d56 (Bild_2025-11-20_203136917.png)
   Document metadata: {
     id: '5147c6b8-46e4-4d0e-a73a-b1dcdf2b1d56',
     name: 'Bild_2025-11-20_203136917.png',
     filename: '4b07e8b2-7399-46ec-a829-2ebc928df978.png',
     type: 'unknown'
   }
   Tried 33 paths (showing first 10):
     - /app/uploads/1412_25/5147c6b8-46e4-4d0e-a73a-b1dcdf2b1d56.png
     - /app/uploads/1412_25/5147c6b8-46e4-4d0e-a73a-b1dcdf2b1d56.pdf
     ...
```

### 4. Diagnostic Tool Created
**File**: `server/diagnose-missing-files.js`

**Usage**:
```bash
# Diagnose specific client
node server/diagnose-missing-files.js 1412_25

# Scan all clients
node server/diagnose-missing-files.js --all
```

**Features**:
- Checks database vs filesystem for all clients
- Shows missing file statistics
- Identifies clients with missing documents
- Displays document metadata and tried paths

## Why Files Are Missing

Based on the logs and investigation, possible reasons:

1. **Production Environment Mismatch**:
   - Files uploaded to production (`/app/uploads/`)
   - Local development has no files
   - This is expected behavior

2. **File Upload Failures** (if production):
   - Upload started but never completed
   - Multer middleware failed silently
   - Disk space issues
   - Permission issues

3. **File Deletion**:
   - Manual deletion
   - Cleanup script ran
   - Container restart without persistent storage

4. **MIME Type Detection Failure**:
   - Documents have `type: unknown`
   - Should have proper MIME types like `image/png`, `image/jpeg`
   - Suggests upload middleware issue

## Recommendations

### Immediate Actions:

1. **Check Production Environment**:
   ```bash
   # SSH into production server
   ls -la /app/uploads/1412_25/
   ```

2. **Verify Upload Middleware**:
   - Check `server/middleware/upload.js`
   - Ensure MIME type is being captured
   - Verify file storage is working

3. **Check Disk Space**:
   ```bash
   df -h
   ```

4. **Check Directory Permissions**:
   ```bash
   ls -la /app/uploads/
   ```

### Long-term Solutions:

1. **Add Upload Verification**:
   - Verify file exists after upload
   - Store file hash/checksum
   - Validate MIME type on upload

2. **Implement Health Checks**:
   - Periodic scan for missing files
   - Alert admins of discrepancies
   - Auto-cleanup orphaned database records

3. **Use Cloud Storage**:
   - AWS S3, Google Cloud Storage, etc.
   - Prevents file loss on container restart
   - Better for distributed systems

4. **Add File Recovery**:
   - Allow users to re-upload missing files
   - Link new upload to existing document record

5. **Fix MIME Type Detection**:
   ```javascript
   // In upload middleware
   filename: function (req, file, cb) {
     const doc = {
       id: uuidv4(),
       name: file.originalname,
       filename: `${uuidv4()}${path.extname(file.originalname)}`,
       type: file.mimetype, // ⬅️ Ensure this is set
       uploadedAt: new Date()
     };
     cb(null, doc.filename);
   }
   ```

## Testing the Fix

### Test Scenarios:

1. **Test with Missing File**:
   - Try to download document from client 1412_25
   - Should get user-friendly error message
   - Should log detailed debug info

2. **Test with Existing File**:
   - Upload a document
   - Download it immediately
   - Should work correctly

3. **Test with Multiple Extensions**:
   - Upload .png, .jpg, .pdf, .docx files
   - Download each type
   - Verify correct MIME types

4. **Check Logs**:
   - Monitor server logs
   - Verify detailed error messages appear
   - Confirm path resolution works

## Files Modified

1. `server/server.js` - Enhanced file path resolution and error handling
2. `server/diagnose-missing-files.js` - New diagnostic tool
3. `FILE_NOT_FOUND_FIX.md` - This documentation

## Deployment

No new dependencies added. Just restart the server:

```bash
cd server
npm start
```

---

**Created**: November 25, 2025
**Status**: ✅ Fix Implemented, Ready for Testing
**Priority**: HIGH - Affects user experience
