const { PDFDocument } = require('pdf-lib');
const fs = require('fs').promises;

async function findMaritalStatusCheckboxes() {
    try {
        console.log('🔍 Analyzing PDF for marital status checkboxes...\n');

        const pdfPath = './server/pdf-form-test/original_form.pdf';
        const pdfBytes = await fs.readFile(pdfPath);
        const pdfDoc = await PDFDocument.load(pdfBytes);
        const form = pdfDoc.getForm();

        const fields = form.getFields();

        console.log(`Total fields found: ${fields.length}\n`);
        console.log('=' .repeat(80));
        console.log('ALL CHECKBOXES IN THE PDF:');
        console.log('=' .repeat(80));

        let checkboxCount = 0;
        const checkboxes = [];

        fields.forEach((field, index) => {
            const fieldName = field.getName();
            const fieldType = field.constructor.name;

            if (fieldType === 'PDFCheckBox') {
                checkboxCount++;
                const checkbox = form.getCheckBox(fieldName);
                const isChecked = checkbox.isChecked();

                checkboxes.push({
                    name: fieldName,
                    checked: isChecked,
                    index: checkboxCount
                });

                console.log(`${checkboxCount}. ${fieldName} - ${isChecked ? '☑' : '☐'} ${isChecked ? 'CHECKED' : 'unchecked'}`);
            }
        });

        console.log('\n' + '='.repeat(80));
        console.log(`Total checkboxes: ${checkboxCount}`);
        console.log('=' .repeat(80));

        // Now create a test PDF with each checkbox checked one by one
        // This will help identify which checkbox corresponds to which marital status
        console.log('\n🔬 Creating test PDFs with individual checkboxes checked...\n');

        // Test checkboxes around the range where marital status might be (40-60)
        const testRange = checkboxes.filter((cb, idx) => {
            const num = parseInt(cb.name.match(/\d+/)?.[0] || '0');
            return num >= 40 && num <= 60;
        });

        console.log(`Testing ${testRange.length} checkboxes in range 40-60 for marital status:`);
        console.log(testRange.map(cb => cb.name).join(', '));

        // Create individual test PDFs
        for (const checkbox of testRange) {
            const testPdfDoc = await PDFDocument.load(pdfBytes);
            const testForm = testPdfDoc.getForm();

            try {
                const testCheckbox = testForm.getCheckBox(checkbox.name);
                testCheckbox.check();

                const outputBytes = await testPdfDoc.save();
                const outputPath = `./test-checkbox-${checkbox.name}.pdf`;
                await fs.writeFile(outputPath, outputBytes);

                console.log(`✅ Created: test-checkbox-${checkbox.name}.pdf`);
            } catch (error) {
                console.log(`❌ Failed to test ${checkbox.name}: ${error.message}`);
            }
        }

        console.log('\n📋 INSTRUCTIONS:');
        console.log('=' .repeat(80));
        console.log('1. Open each test-checkbox-*.pdf file');
        console.log('2. Look for the marital status section (Familienstand)');
        console.log('3. Check which checkbox is marked for:');
        console.log('   - Ledig (single)');
        console.log('   - Verheiratet (married)');
        console.log('   - Geschieden (divorced)');
        console.log('   - Getrennt lebend (separated)');
        console.log('   - Verwitwet (widowed)');
        console.log('   - Lebenspartnerschaft (partnership)');
        console.log('4. Report back the checkbox numbers!');
        console.log('=' .repeat(80));

    } catch (error) {
        console.error('❌ Error:', error);
    }
}

findMaritalStatusCheckboxes();