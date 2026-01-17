const express = require('express');
const router = express.Router();
const multer = require('multer');
const { authenticateAdmin } = require('../middleware/auth');
const createAdminCreditorController = require('../controllers/adminCreditorController');

/**
 * Admin Creditor Database Router Factory
 */
module.exports = ({ Client, documentProcessor, safeClientUpdate }) => {
    // Instantiate controller with dependencies
    const adminCreditorController = createAdminCreditorController({
        Client,
        documentProcessor,
        safeClientUpdate
    });

    const upload = multer({ storage: multer.memoryStorage() });

    // GET / - list with search & pagination
    router.get('/', authenticateAdmin, adminCreditorController.listCreditors);

    // POST / - create
    router.post('/', authenticateAdmin, adminCreditorController.createCreditor);

    // PUT /:id - update
    router.put('/:id', authenticateAdmin, adminCreditorController.updateCreditor);

    // DELETE /:id
    router.delete('/:id', authenticateAdmin, adminCreditorController.deleteCreditor);

    // POST /import - FAST IMPORT
    router.post('/import', upload.single('file'), adminCreditorController.importCreditors);

    // GET /export - CSV export
    router.get('/export', authenticateAdmin, adminCreditorController.exportCreditors);

    // POST /process-documents - Process docs to creditors (Client context)
    // Route: /api/clients/:clientId/process-documents-to-creditors (in server.js)
    // If we map this router to /api/admin/creditors, we need a separate mount or sub-route.
    // server.js mounts this router? We'll see in cleanup phase.
    // The original inline route was /api/clients/:clientId/process-documents-to-creditors
    // If we put it here, the URL would depends on where this router is mounted.
    // If mounted at /api/admin/creditors, it becomes /api/admin/creditors/process-documents...
    // Let's explicitly add the full route if possible or decide on mount.
    // But routers are relative.
    // If we want to keep the URL `/api/clients/:clientId/...` we might need another router or mount point.
    // OR we put it here and change the frontend/client to point to /api/admin/creditors/client/:clientId/process...
    // OR we mount this router logic in `server.js` specifically for that route.
    // Let's add it as `router.post('/process-documents/:clientId', ...)` and mount properly later?
    // Actually, `admin-client-creditor.js` might have been better.
    // But since I'm here, I'll add the method. If I mount this router at /api/admin/creditors, I can access it via /api/admin/creditors/process-client/:clientId
    router.post('/process-client/:clientId', authenticateAdmin, adminCreditorController.processDocumentsToCreditors);

    return router;
};
