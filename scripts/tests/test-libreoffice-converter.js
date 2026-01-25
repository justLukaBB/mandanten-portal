const { convertDocxToPdf, isLibreOfficeAvailable, getLibreOfficeVersion } = require('./server/services/docxToPdf');
const path = require('path');

async function testLibreOfficeConverter() {
    try {
        console.log('🔍 Testing LibreOffice converter...');
        
        // Check if LibreOffice is available
        const isAvailable = await isLibreOfficeAvailable();
        console.log(`📊 LibreOffice available: ${isAvailable}`);
        
        if (isAvailable) {
            const version = await getLibreOfficeVersion();
            console.log(`📊 LibreOffice version: ${version}`);
        }
        
        // Test with a known DOCX file
        const inputPath = '/Users/adeel/mandanten-portal/server/documents/Forderungsuebersicht_12345_2025-10-02.docx';
        const outputDir = '/Users/adeel/mandanten-portal/test-output';
        
        console.log(`📄 Testing conversion: ${path.basename(inputPath)}`);
        console.log(`📁 Output directory: ${outputDir}`);
        
        // Convert the file
        const pdfPath = await convertDocxToPdf(inputPath, outputDir);
        
        console.log(`✅ Conversion successful!`);
        console.log(`📄 Generated PDF: ${pdfPath}`);
        
        // Check file size
        const fs = require('fs').promises;
        const stats = await fs.stat(pdfPath);
        console.log(`📊 File size: ${(stats.size / 1024).toFixed(2)} KB`);
        
    } catch (error) {
        console.error('❌ Test failed:', error.message);
    }
}

testLibreOfficeConverter();

