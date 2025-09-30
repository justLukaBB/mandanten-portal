#!/usr/bin/env node

/**
 * CHECKBOX DETECTIVE - Systematisch herausfinden welche Checkbox was ist
 * Wir testen einzelne Checkboxen um zu sehen wo sie erscheinen
 */

const { PDFDocument } = require('pdf-lib');
const fs = require('fs');
const path = require('path');

async function testSingleCheckbox(checkboxNumber) {
    try {
        console.log(`🔍 Testing Kontrollkästchen ${checkboxNumber}...`);
        
        const originalPdfPath = path.join(__dirname, 'pdf-form-test/original_form.pdf');
        const existingPdfBytes = await fs.readFileSync(originalPdfPath);
        const pdfDoc = await PDFDocument.load(existingPdfBytes);
        const form = pdfDoc.getForm();
        
        // NUR diese eine Checkbox aktivieren
        try {
            const checkbox = form.getCheckBox(`Kontrollkästchen ${checkboxNumber}`);
            checkbox.check();
            console.log(`  ✅ Successfully checked Kontrollkästchen ${checkboxNumber}`);
        } catch (error) {
            console.log(`  ⚠️  Kontrollkästchen ${checkboxNumber} not found`);
            return null;
        }
        
        // PDF speichern
        const filledPdfBytes = await pdfDoc.save();
        const outputFilename = `TEST-CHECKBOX-${checkboxNumber}.pdf`;
        const outputPath = path.join(__dirname, outputFilename);
        const desktopPath = `/Users/luka/Desktop/${outputFilename}`;
        
        fs.writeFileSync(outputPath, filledPdfBytes);
        fs.copyFileSync(outputPath, desktopPath);
        
        console.log(`  📍 Saved: ${desktopPath}`);
        return desktopPath;
        
    } catch (error) {
        console.error(`❌ Error testing checkbox ${checkboxNumber}:`, error.message);
        return null;
    }
}

async function testCheckboxRange(start, end) {
    console.log('🕵️ CHECKBOX DETECTIVE - Systematische Analyse');
    console.log('═══════════════════════════════════════════════════════════');
    console.log(`🎯 Testing Kontrollkästchen ${start} bis ${end}`);
    console.log();
    
    const results = [];
    
    for (let i = start; i <= end; i++) {
        const result = await testSingleCheckbox(i);
        if (result) {
            results.push({ number: i, file: result });
        }
        
        // Kurze Pause zwischen Tests
        await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    console.log();
    console.log('📊 ERGEBNISSE:');
    console.log('═══════════════════════════════════════════════════════════');
    results.forEach(result => {
        console.log(`  📋 Kontrollkästchen ${result.number}: ${result.file}`);
    });
    
    console.log();
    console.log('🔍 NÄCHSTE SCHRITTE:');
    console.log('1. Öffne die PDFs und schaue wo die Checkboxen erscheinen');
    console.log('2. Identifiziere welche Nummern zu Sektion II.2 gehören');
    console.log('3. Updatere das robust-insolvenz-mapper.js entsprechend');
    
    return results;
}

// Kommandozeilen-Parameter
const args = process.argv.slice(2);
if (args.length === 0) {
    console.log('📖 USAGE:');
    console.log('node checkbox-detective.js <start> <end>');
    console.log('');
    console.log('Beispiele:');
    console.log('node checkbox-detective.js 10 20    # Test Kontrollkästchen 10-20');
    console.log('node checkbox-detective.js 1 1      # Test nur Kontrollkästchen 1');
    process.exit(1);
}

const start = parseInt(args[0]);
const end = parseInt(args[1]) || start;

testCheckboxRange(start, end).catch(console.error);