const { PDFDocument } = require('pdf-lib');
const fs = require('fs').promises;

async function interactiveCheckboxFinder() {
    try {
        console.log('🔍 Interaktive Checkbox-Suche für Familienstand...\n');

        const pdfPath = './pdf-form-test/original_form.pdf';
        const pdfBytes = await fs.readFile(pdfPath);
        const pdfDoc = await PDFDocument.load(pdfBytes);
        const form = pdfDoc.getForm();

        // Get all fields
        const fields = form.getFields();

        // Find checkboxes in the likely range for familienstand (40-60)
        const checkboxRange = [];

        fields.forEach((field) => {
            const fieldName = field.getName();
            const fieldType = field.constructor.name;

            if (fieldType === 'PDFCheckBox') {
                // Extract number from checkbox name
                const match = fieldName.match(/Kontrollkästchen (\d+[a-z]?)/);
                if (match) {
                    const num = match[1];
                    const numericPart = parseInt(num);

                    // Focus on range 40-65 (likely area for familienstand)
                    if (numericPart >= 40 && numericPart <= 65) {
                        checkboxRange.push({
                            name: fieldName,
                            number: num
                        });
                    }
                }
            }
        });

        console.log('📋 Checkboxen im Bereich 40-65 (wahrscheinlich Familienstand):');
        console.log('='.repeat(80));
        checkboxRange.forEach((cb, idx) => {
            console.log(`${idx + 1}. ${cb.name}`);
        });
        console.log('='.repeat(80));
        console.log(`\nGefunden: ${checkboxRange.length} Checkboxen\n`);

        // Now create ONE comprehensive test PDF with multiple checkboxes marked
        // This will help identify patterns
        console.log('🎯 Erstelle Test-PDF mit ALLEN Checkboxen im Bereich markiert...\n');

        const testPdfDoc = await PDFDocument.load(pdfBytes);
        const testForm = testPdfDoc.getForm();

        let checkedCount = 0;
        checkboxRange.forEach((cb) => {
            try {
                const checkbox = testForm.getCheckBox(cb.name);
                checkbox.check();
                checkedCount++;
            } catch (error) {
                console.log(`❌ Fehler bei ${cb.name}: ${error.message}`);
            }
        });

        const outputBytes = await testPdfDoc.save();
        await fs.writeFile('./test-ALL-checkboxes-40-65.pdf', outputBytes);

        console.log(`✅ Test-PDF erstellt: test-ALL-checkboxes-40-65.pdf`);
        console.log(`✅ ${checkedCount} Checkboxen markiert\n`);

        // Also create a clean reference to manually check
        console.log('📖 MANUELLE ANLEITUNG:');
        console.log('='.repeat(80));
        console.log('1. Öffne die Original-PDF: pdf-form-test/original_form.pdf');
        console.log('2. Suche nach "Familienstand" oder "10. " (Section 10)');
        console.log('3. Schau dir die Checkbox-Optionen an:');
        console.log('   - ledig');
        console.log('   - verheiratet');
        console.log('   - geschieden');
        console.log('   - getrennt lebend');
        console.log('   - verwitwet');
        console.log('   - eingetragene Lebenspartnerschaft');
        console.log('4. Öffne dann: test-ALL-checkboxes-40-65.pdf');
        console.log('5. Vergleiche: Welche Checkboxen sind jetzt markiert?');
        console.log('6. Zähle von oben nach unten, welche Position die Checkbox hat');
        console.log('='.repeat(80));

        // Create individual PDFs for easier identification
        console.log('\n🔬 Erstelle einzelne Test-PDFs für jeden Checkpoint...\n');

        // Test every 6th checkbox to narrow down
        const testPoints = [46, 47, 48, 49, 50, 51, 52, 53, 54, 55, 56, 57, 58, 59, 60];

        for (const num of testPoints) {
            const checkboxName = `Kontrollkästchen ${num}`;

            try {
                const individualPdfDoc = await PDFDocument.load(pdfBytes);
                const individualForm = individualPdfDoc.getForm();

                const checkbox = individualForm.getCheckBox(checkboxName);
                checkbox.check();

                const individualBytes = await individualPdfDoc.save();
                await fs.writeFile(`./marital-test-${num}.pdf`, individualBytes);

                console.log(`✅ Erstellt: marital-test-${num}.pdf (${checkboxName} markiert)`);
            } catch (error) {
                console.log(`⚠️  Übersprungen: ${checkboxName}`);
            }
        }

        console.log('\n📌 NÄCHSTE SCHRITTE:');
        console.log('='.repeat(80));
        console.log('Öffne diese PDFs und prüfe die Familienstand-Sektion:');
        console.log('  - marital-test-46.pdf bis marital-test-60.pdf');
        console.log('');
        console.log('Sage mir dann, welche Datei welchen Status zeigt:');
        console.log('  Beispiel: "marital-test-47.pdf zeigt ledig markiert"');
        console.log('='.repeat(80));

    } catch (error) {
        console.error('❌ Fehler:', error);
    }
}

interactiveCheckboxFinder();