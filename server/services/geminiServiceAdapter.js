const axios = require('axios');
const fs = require('fs-extra');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

class GeminiServiceAdapter {
    constructor() {
        this.baseUrl = process.env.PYTHON_SERVICE_URL || 'http://localhost:8000';
        this.tempDir = path.join(__dirname, '../../uploads/temp_gemini');
        fs.ensureDirSync(this.tempDir);
        console.log(`GeminiServiceAdapter initialized. Service URL: ${this.baseUrl}`);
        console.log(`Temp directory: ${this.tempDir}`);
    }

    /**
     * Process a document using the local Python FastAPI service (Gemini).
     * 
     * @param {string|Buffer} input - File path or buffer
     * @param {string} originalName - Original filename
     * @returns {Promise<Object>} - The extracted data consistent with DocumentProcessor structure
     */
    async processDocument(input, originalName) {
        let tempFilePath = null;
        try {
            console.log(`=== GEMINI SERVICE PROCESSING START ===`);
            console.log(`Processing: ${originalName}`);

            // 1. Prepare file on disk (Python needs a local path)
            if (Buffer.isBuffer(input)) {
                const uniqueName = `${uuidv4()}_${originalName.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
                tempFilePath = path.join(this.tempDir, uniqueName);
                console.log(`Writing buffer to temp file: ${tempFilePath}`);
                await fs.writeFile(tempFilePath, input);
            } else {
                // Assume it's already a path
                if (!fs.existsSync(input)) {
                    throw new Error(`File not found: ${input}`);
                }
                tempFilePath = input;
                console.log(`Using existing file path: ${tempFilePath}`);
            }

            // 2. Submit Job to Python Service
            // Note: "local_path" is non-standard in the public schema but implemented in processing.py for testing
            // We rely on the internal logic found in processing.py:177
            const payload = {
                client_id: "node_adapter_" + Date.now(),
                files: [
                    {
                        filename: originalName,
                        local_path: tempFilePath,
                        mime_type: this.getMimeType(originalName)
                    }
                ],
                webhook_url: "" // We will poll for results
            };

            console.log('Creating job at Python service...');
            const createRes = await axios.post(`${this.baseUrl}/processing/jobs`, payload);
            const jobId = createRes.data.job_id;
            console.log(`Job Created: ${jobId}`);

            // 3. Poll for Completion
            const result = await this.pollForCompletion(jobId);

            // 4. Transform Result
            const documentResult = result.results[0]; // We assume 1 file per call

            if (documentResult.status === 'error') {
                throw new Error(documentResult.error || 'Unknown processing error');
            }

            console.log('Gemini processing complete.');

            // 5. Cleanup (if we created a temp file)
            if (Buffer.isBuffer(input) && tempFilePath && await fs.pathExists(tempFilePath)) {
                // await fs.unlink(tempFilePath); // Optional: keep for debug?
            }

            return this.transformToNodeFormat(documentResult, originalName);

        } catch (error) {
            console.error('Gemini Adapter Error:', error.message);
            if (error.response) {
                console.error('Response data:', error.response.data);
            }
            throw error;
        }
    }

    async pollForCompletion(jobId, intervalMs = 1000, timeoutMs = 60000) {
        const startTime = Date.now();
        while (Date.now() - startTime < timeoutMs) {
            try {
                const statusRes = await axios.get(`${this.baseUrl}/processing/jobs/${jobId}/status`);
                const status = statusRes.data.status;

                if (status === 'completed' || status === 'failed' || status === 'partial_success') {
                    // Fetch full results
                    const resultRes = await axios.get(`${this.baseUrl}/processing/jobs/${jobId}/results`);
                    return resultRes.data;
                }

                console.log(`Job ${jobId} status: ${status}... waiting`);
                await new Promise(resolve => setTimeout(resolve, intervalMs));
            } catch (err) {
                console.warn(`Polling error for job ${jobId}: ${err.message}`);
                // Retry anyway
                await new Promise(resolve => setTimeout(resolve, intervalMs));
            }
        }
        throw new Error(`Job ${jobId} timed out after ${timeoutMs}ms`);
    }

    getMimeType(filename) {
        const ext = path.extname(filename).toLowerCase();
        switch (ext) {
            case '.pdf': return 'application/pdf';
            case '.png': return 'image/png';
            case '.jpg':
            case '.jpeg': return 'image/jpeg';
            default: return 'application/octet-stream';
        }
    }

    transformToNodeFormat(pyResult, originalName) {
        // Map Python result to Node.js / Google Doc AI structure
        const extractedData = {
            processing_status: 'completed',
            is_creditor_document: pyResult.is_creditor_document,
            confidence: pyResult.confidence || 0,
            manual_review_required: pyResult.manual_review_required,
            reasoning: pyResult.manual_review_reason,
            raw_text: "Processed by Gemini 2.5 Flash",
            document_metadata: {
                original_name: originalName,
                processing_method: 'gemini_local_adapter',
                processed_at: new Date().toISOString()
            }
        };

        // Normalize creditor data
        // Python returns 'creditor_data' inside 'extracted_data'
        // or sometimes at top level depending on version?
        // processing.py logs: ed['creditor_data']

        if (pyResult.extracted_data && pyResult.extracted_data.creditor_data) {
            extractedData.creditor_data = pyResult.extracted_data.creditor_data;
        } else {
            // Fallback for older format?
            extractedData.creditor_data = pyResult.extracted_data || {};
        }

        return extractedData;
    }
}

module.exports = GeminiServiceAdapter;
