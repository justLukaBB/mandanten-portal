#!/usr/bin/env node

/**
 * SEITE 3 CHECKBOX TESTER
 * Teste systematisch Checkboxen und schaue welche auf Seite 3 erscheinen
 */

const { PDFDocument } = require('pdf-lib');
const fs = require('fs');
const path = require('path');

async function testCheckboxOnPage3(checkboxNumber) {
    try {
        const originalPdfPath = path.join(__dirname, 'pdf-form-test/original_form.pdf');
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
            const checkbox = form.getCheckBox(`Kontrollkästchen ${checkboxNumber}`);
            checkbox.check();
            
            const filledPdfBytes = await pdfDoc.save();
            const testPath = `/Users/luka/Desktop/PAGE3-TEST-${checkboxNumber}.pdf`;
            fs.writeFileSync(testPath, filledPdfBytes);
            
            console.log(`✅ Kontrollkästchen ${checkboxNumber}: ${testPath}`);
            return testPath;
        } catch (error) {
            console.log(`⚠️  Kontrollkästchen ${checkboxNumber} not found`);
            return null;
        }
        
    } catch (error) {
        console.log(`❌ Error testing ${checkboxNumber}: ${error.message}`);
        return null;
    }
}

async function testRangeForPage3(start, end) {
    console.log('🔍 SEITE 3 CHECKBOX DETECTIVE');
    console.log('═══════════════════════════════════════════════════════════');
    console.log(`🎯 Testing Kontrollkästchen ${start}-${end} for Seite 3`);
    console.log('📋 Looking for: Anlage 3 - Abtretungserklärung nach § 287 Abs. 2 InsO');
    console.log();
    
    const results = [];
    
    for (let i = start; i <= end; i++) {
        const result = await testCheckboxOnPage3(i);
        if (result) {
            results.push({ number: i, file: result });
        }
        
        // Kurze Pause
        await new Promise(resolve => setTimeout(resolve, 50));
    }
    
    console.log();
    console.log('📊 ERGEBNISSE:');
    console.log('═══════════════════════════════════════════════════════════');
    results.forEach(result => {
        console.log(`📋 Kontrollkästchen ${result.number}: ${result.file}`);
    });
    
    console.log();
    console.log('🔍 NÄCHSTE SCHRITTE:');
    console.log('1. Öffne die PAGE3-TEST-XX.pdf Dateien');
    console.log('2. Gehe zu Seite 3');
    console.log('3. Schaue welche Checkbox bei "Anlage 3 - Abtretungserklärung" aktiviert ist');
    console.log('4. Das ist unsere gesuchte Checkbox-Nummer!');
    
    return results;
}

// Kommandozeilen-Parameter
const args = process.argv.slice(2);
const start = parseInt(args[0]) || 270;  // Default: höhere Nummern testen
const end = parseInt(args[1]) || 320;

testRangeForPage3(start, end).catch(console.error);