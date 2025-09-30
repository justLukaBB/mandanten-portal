const { PDFDocument } = require('pdf-lib');
const fs = require('fs').promises;

async function findFamilienstandCheckboxes() {
    try {
        const pdfPath = './pdf-form-test/original_form.pdf';
        const pdfBytes = await fs.readFile(pdfPath);
        const pdfDoc = await PDFDocument.load(pdfBytes);
        const form = pdfDoc.getForm();

        const fields = form.getFields();

        console.log('🔍 Searching for Familienstand (Marital Status) checkboxes...\n');

        // Get all checkboxes
        const checkboxes = fields.filter(field => field.constructor.name === 'PDFCheckBox');
        console.log(`📋 Found ${checkboxes.length} total checkboxes in the PDF\n`);

        // Look for checkboxes around the familienstand area (typically field 40-60)
        console.log('Looking for checkboxes in typical familienstand range (Kontrollkästchen 40-60):\n');

        for (let i = 40; i <= 60; i++) {
            try {
                const checkbox = form.getCheckBox(`Kontrollkästchen ${i}`);
                console.log(`✅ Found: Kontrollkästchen ${i}`);
            } catch (e) {
                // Field doesn't exist or isn't a checkbox
            }
        }

        console.log('\n📝 Familienstand options in German:');
        console.log('   - ledig = single');
        console.log('   - verheiratet = married');
        console.log('   - geschieden = divorced');
        console.log('   - verwitwet = widowed');
        console.log('   - getrennt_lebend = separated');
        console.log('   - eingetragene Lebenspartnerschaft = registered partnership');

        console.log('\n💡 Based on typical PDF form layout, familienstand checkboxes are likely:');
        console.log('   Kontrollkästchen 46 = ledig (single)');
        console.log('   Kontrollkästchen 47 = verheiratet (married)');
        console.log('   Kontrollkästchen 48 = eingetragene Lebenspartnerschaft (registered partnership)');
        console.log('   Kontrollkästchen 49 = geschieden (divorced)');
        console.log('   Kontrollkästchen 50 = getrennt lebend (separated)');
        console.log('   Kontrollkästchen 51 = verwitwet (widowed)');

    } catch (error) {
        console.error('❌ Error:', error.message);
    }
}

findFamilienstandCheckboxes();