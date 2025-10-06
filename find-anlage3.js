#!/usr/bin/env node

/**
 * ANLAGE 3 FINDER - Systematisch alle Checkboxen testen
 * und schauen welche zu Anlage 3 gehört
 */

const { PDFDocument } = require('pdf-lib');
const fs = require('fs');
const path = require('path');

async function createCleanPdf() {
    console.log('📋 Creating CLEAN PDF (no checkboxes checked)...');
    
    const originalPdfPath = path.join(__dirname, 'server/pdf-form-test/original_form.pdf');
    const existingPdfBytes = await fs.readFileSync(originalPdfPath);
    const pdfDoc = await PDFDocument.load(existingPdfBytes);
    const form = pdfDoc.getForm();
    
    // Alle Checkboxen explizit auf unchecked setzen
    const fields = form.getFields();
    fields.forEach(field => {
        if (field.constructor.name === 'PDFCheckBox') {
            try {
                field.uncheck();
                console.log(`  ❌ Unchecked: ${field.getName()}`);
            } catch (error) {
                console.log(`  ⚠️  Could not uncheck: ${field.getName()}`);
            }
        }
    });
    
    const filledPdfBytes = await pdfDoc.save();
    const cleanPath = '/Users/luka/Desktop/CLEAN-PDF-NO-CHECKBOXES.pdf';
    fs.writeFileSync(cleanPath, filledPdfBytes);
    
    console.log(`✅ Clean PDF saved: ${cleanPath}`);
    return cleanPath;
}

async function testCheckboxInAnlagenSection(start, end) {
    console.log(`🔍 Testing checkboxes ${start}-${end} in Anlagen section...`);
    
    for (let i = start; i <= end; i++) {
        try {
            const originalPdfPath = path.join(__dirname, 'server/pdf-form-test/original_form.pdf');
            const existingPdfBytes = await fs.readFileSync(originalPdfPath);
            const pdfDoc = await PDFDocument.load(existingPdfBytes);
            const form = pdfDoc.getForm();
            
            // Alle Checkboxen unchecken
            const fields = form.getFields();
            fields.forEach(field => {
                if (field.constructor.name === 'PDFCheckBox') {
                    try {
                        field.uncheck();
                    } catch (error) {
                        // ignore
                    }
                }
            });
            
            // Nur diese eine Checkbox aktivieren
            try {
                const checkbox = form.getCheckBox(`Kontrollkästchen ${i}`);
                checkbox.check();
                
                const filledPdfBytes = await pdfDoc.save();
                const testPath = `/Users/luka/Desktop/ISOLATED-CHECKBOX-${i}.pdf`;
                fs.writeFileSync(testPath, filledPdfBytes);
                
                console.log(`  ✅ Kontrollkästchen ${i}: ${testPath}`);
            } catch (error) {
                console.log(`  ⚠️  Kontrollkästchen ${i} not found`);
            }
            
        } catch (error) {
            console.log(`  ❌ Error testing ${i}: ${error.message}`);
        }
    }
}

async function main() {
    console.log('🕵️ ANLAGE 3 DETECTIVE');
    console.log('═══════════════════════════════════════════════════════════');
    
    // 1. Sauberes PDF erstellen
    await createCleanPdf();
    
    console.log('\n🔍 PHASE 2: Testing specific ranges for Anlage 3...');
    
    // 2. Weitere Bereiche testen
    await testCheckboxInAnlagenSection(51, 100);
    
    console.log('\n📋 NÄCHSTE SCHRITTE:');
    console.log('1. Öffne CLEAN-PDF-NO-CHECKBOXES.pdf');
    console.log('2. Schaue wo "Anlage 3" standardmäßig steht');
    console.log('3. Vergleiche mit den ISOLATED-CHECKBOX-XX.pdf files');
    console.log('4. Finde welche Nummer zu Anlage 3 gehört');
}

main().catch(console.error);