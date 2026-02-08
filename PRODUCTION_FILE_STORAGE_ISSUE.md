# Production File Storage Issue - Client 3000

## Problem Summary
All document operations (download, reprocess) are failing for client 3000 because the physical files don't exist on the server filesystem.

## Evidence from Logs
```
Client: test 5600 (3000)
Documents: 6
❌ File not found for reprocessing: Bildschirmfoto 2025-11-02 um 17.25.16.png
❌ File not found for reprocessing: Bildschirmfoto 2025-11-02 um 17.25.02.png
❌ File not found for reprocessing: Bildschirmfoto 2025-11-02 um 17.24.50.png
❌ File not found for reprocessing: Bildschirmfoto 2025-11-02 um 17.24.45.png
❌ File not found for reprocessing: Bildschirmfoto 2025-11-02 um 17.25.28.png
❌ File not found for reprocessing: Bildschirmfoto 2025-11-02 um 17.25.07.png

Total Documents: 6
✅ Success: 0
❌ Failed: 6
```

## Root Cause Analysis

### Why Files Are Missing:

1. **Docker Container Issue** (Most Likely):
   - Render.com uses ephemeral storage by default
   - Files uploaded to `/app/uploads/` are lost on container restart
   - No persistent volume configured for uploads

2. **Possible Causes**:
   - Container restarted → files deleted
   - Deployment without volume mount
   - Files uploaded to different instance
   - Manual deletion

## Diagnostic Steps

### 1. Check Production File System

SSH into production and run:
```bash
# Check if uploads directory exists
ls -la /app/uploads/3000/

# Count files in uploads
find /app/uploads/ -type f | wc -l

# List all client directories
ls -la /app/uploads/
```

### 2. Use Diagnostic Tool

Run the diagnostic script on production:
```bash
# Check specific client
node server/diagnose-missing-files.js 3000

# Scan all clients
node server/diagnose-missing-files.js --all
```

### 3. Check Database vs Filesystem

```bash
# Count documents in MongoDB
mongo
> use your_database
> db.clients.findOne({id: "3000"}).documents.length

# Count files on disk
ls -la /app/uploads/3000/ | wc -l
```

## Solutions

### ⚡ Immediate Fix: Re-upload Documents

**Option 1: From Admin Dashboard**
1. Go to client details page
2. Delete existing document records (they're just metadata)
3. Re-upload the files

**Option 2: Restore from Backup**
If you have backups of the uploads directory, restore them:
```bash
# Copy from backup
cp -r /backup/uploads/* /app/uploads/
```

### 🏗️ Long-term Fix: Persistent Storage

#### Option A: Render.com Persistent Disk

Add to `render.yaml`:
```yaml
services:
  - type: web
    name: mandanten-portal
    env: docker
    disk:
      name: mandanten-uploads
      mountPath: /app/uploads
      sizeGB: 10
```

#### Option B: Cloud Storage (Recommended)

Migrate to AWS S3, Google Cloud Storage, or similar:

**Benefits**:
- ✅ Files never lost on restart
- ✅ Better for distributed systems
- ✅ Automatic backups
- ✅ CDN integration

**Implementation** (AWS S3 example):
```javascript
// server/middleware/upload.js
const multer = require('multer');
const multerS3 = require('multer-s3');
const AWS = require('aws-sdk');

const s3 = new AWS.S3({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region: process.env.AWS_REGION
});

const upload = multer({
  storage: multerS3({
    s3: s3,
    bucket: process.env.S3_BUCKET_NAME,
    acl: 'private',
    key: function (req, file, cb) {
      const clientId = req.params.clientId;
      const filename = `${uuidv4()}${path.extname(file.originalname)}`;
      cb(null, `uploads/${clientId}/${filename}`);
    }
  })
});
```

### 🔄 Migration Plan

#### Phase 1: Add Persistent Disk (Quick)
1. Update `render.yaml` with disk configuration
2. Redeploy service
3. Re-upload missing files

#### Phase 2: Migrate to S3 (Recommended)
1. Set up S3 bucket
2. Update upload middleware
3. Update download endpoints
4. Migrate existing files
5. Test thoroughly
6. Deploy

## Render.com Specific Configuration

### Current Setup Issue
Render.com free/starter tiers use **ephemeral storage**:
- Files written to `/app/uploads/` are temporary
- Lost on every deploy or container restart
- Not suitable for user uploads

### Required Configuration

**render.yaml** (add this):
```yaml
services:
  - type: web
    name: mandanten-portal-backend
    env: docker
    # Add persistent disk
    disk:
      name: uploads-volume
      mountPath: /app/server/uploads
      sizeGB: 10  # Adjust based on needs
    plan: starter  # Requires paid plan
```

**Note**: Persistent disks require a **paid plan** on Render.com (not available on free tier).

## Testing Checklist

After implementing the fix:

- [ ] Upload a test document
- [ ] Restart the container
- [ ] Verify file still exists
- [ ] Download the document
- [ ] Reprocess the document
- [ ] Check with diagnostic tool
- [ ] Test with multiple clients

## Monitoring

Add health check for file storage:
```javascript
// server/routes/health.js
app.get('/health/storage', async (req, res) => {
  const uploadsDir = path.join(__dirname, '../uploads');

  try {
    // Check if directory exists
    const exists = fs.existsSync(uploadsDir);

    // Count files
    const fileCount = fs.readdirSync(uploadsDir).length;

    // Check if writable
    const testFile = path.join(uploadsDir, '.health-check');
    fs.writeFileSync(testFile, 'test');
    fs.unlinkSync(testFile);

    res.json({
      status: 'healthy',
      directory: uploadsDir,
      exists,
      fileCount,
      writable: true
    });
  } catch (error) {
    res.status(500).json({
      status: 'unhealthy',
      error: error.message
    });
  }
});
```

## Recommendations

### Priority Order:

1. **Immediate** (Today):
   - Add persistent disk to Render.com (requires paid plan)
   - Re-upload missing documents for client 3000
   - Verify files persist after container restart

2. **Short-term** (This Week):
   - Run diagnostic tool to identify all missing files
   - Create backup strategy
   - Document upload/storage process

3. **Long-term** (Next Sprint):
   - Migrate to S3/GCS for production reliability
   - Implement automatic backups
   - Add file existence validation on upload
   - Store file checksums in database

## Support Commands

```bash
# Check Render.com disk usage
render disk ls

# Check container logs
render logs -t web

# SSH into container (if available)
render shell

# Environment variables
render env list
```

## Cost Estimates

**Render.com Persistent Disk**:
- Starter plan: $7/month (includes disk)
- Disk: ~$0.25/GB/month

**AWS S3** (More cost-effective):
- Storage: $0.023/GB/month
- Data transfer: First 100GB free
- Estimated for 10GB: ~$0.23/month

**Recommendation**: Start with Render disk for simplicity, migrate to S3 for scale.

---

**Created**: November 25, 2025
**Status**: 🚨 Action Required - Files Missing
**Priority**: HIGH - Affects all document operations
