/**
 * Test DOCX to PDF conversion with LibreOffice
 */

const { convertDocxToPdf } = require('./services/documentConverter');
const path = require('path');
const fs = require('fs').promises;

async function testConversion() {
    console.log('\n🧪 Testing DOCX to PDF Conversion with LibreOffice\n');
    console.log('='.repeat(60));

    // Find a recent Nullplan document to test
    const documentsDir = path.join(__dirname, 'documents');
    const files = await fs.readdir(documentsDir);
    const nullplanDoc = files.find(f => f.includes('Nullplan') && f.endsWith('.docx'));

    if (!nullplanDoc) {
        console.error('❌ No Nullplan document found for testing');
        console.log('💡 Run test-nullplan-template.js first to generate a document');
        process.exit(1);
    }

    const docxPath = path.join(documentsDir, nullplanDoc);
    console.log(`\n📄 Testing conversion of: ${nullplanDoc}`);

    try {
        const pdfBytes = await convertDocxToPdf(docxPath);

        if (pdfBytes && pdfBytes.length > 0) {
            // Save test PDF
            const outputPath = path.join(documentsDir, nullplanDoc.replace('.docx', '_CONVERTED.pdf'));
            await fs.writeFile(outputPath, pdfBytes);

            console.log('\n✅ Conversion successful!');
            console.log(`📁 PDF saved: ${outputPath}`);
            console.log(`📊 Size: ${Math.round(pdfBytes.length / 1024)} KB`);

            console.log('\n💡 Open the PDF to verify formatting is preserved');
        } else {
            console.error('\n❌ Conversion returned empty buffer');
            process.exit(1);
        }

    } catch (error) {
        console.error('\n❌ Conversion failed:', error.message);
        console.error(error.stack);
        process.exit(1);
    }

    console.log('\n' + '='.repeat(60));
}

testConversion()
    .then(() => {
        console.log('\n✅ Test complete!\n');
        process.exit(0);
    })
    .catch((error) => {
        console.error('\n❌ Test failed:', error);
        process.exit(1);
    });