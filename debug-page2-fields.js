#!/usr/bin/env node

// Debug specific fields on page 2 of the Insolvenzantrag
const { PDFDocument } = require('pdf-lib');
const fs = require('fs');
const path = require('path');

async function debugPage2Fields() {
    console.log('🔍 Debugging Page 2 Fields - Checkboxes and Date Issues');
    console.log('════════════════════════════════════════════════════════');
    
    try {
        const QuickFieldMapper = require('./pdf-form-test/quick-field-mapper');
        
        // Test data
        const testFormData = {
            nachname: 'Mustermann',
            vorname: 'Max',
            strasse: 'Musterstraße',
            hausnummer: '123',
            plz: '12345',
            ort: 'Musterstadt',
            telefon: '+49 123 456789',
            email: 'max.mustermann@example.com',
            familienstand: 'verheiratet',
            kinder_anzahl: '2',
            berufsstatus: 'angestellt',
            amtsgericht: 'Berlin'
        };
        
        console.log('📋 Current Field Mapping Analysis:');
        const currentMapping = QuickFieldMapper.getUpdatedFieldMapping();
        
        console.log('\n🎯 ISSUE 1: City field has date instead of city');
        console.log('Looking for city-related fields...');
        
        Object.entries(currentMapping).forEach(([dataField, pdfField]) => {
            if (dataField.includes('ort') || dataField.includes('city') || dataField.includes('datum')) {
                console.log(`   ${dataField} → ${pdfField}`);
            }
        });
        
        console.log('\n🎯 ISSUE 2: "bisher nicht gestellt" checkbox not working');
        console.log('Looking for Restschuldbefreiung-related checkboxes...');
        
        Object.entries(currentMapping).forEach(([dataField, pdfField]) => {
            if (dataField.includes('restschuld') || dataField.includes('antrag') || dataField.includes('gestellt')) {
                console.log(`   ${dataField} → ${pdfField}`);
            }
        });
        
        console.log('\n📝 Let me fill a test form and show what we\'re setting:');
        
        // Create a simple test to see what values we're actually setting
        const originalPdfPath = path.join(__dirname, 'pdf-form-test/original_form.pdf');
        const existingPdfBytes = await fs.promises.readFile(originalPdfPath);
        const pdfDoc = await PDFDocument.load(existingPdfBytes);
        const form = pdfDoc.getForm();
        
        // Test filling with our current logic
        const completeData = { ...testFormData };
        
        // Add computed fields (from QuickFieldMapper logic)
        completeData.vorname_name = `${testFormData.nachname}, ${testFormData.vorname}`;
        completeData.nachname_pb = testFormData.nachname;
        completeData.vorname_pb = testFormData.vorname;
        completeData.strasse_pb = testFormData.strasse;
        completeData.hausnummer_pb = testFormData.hausnummer;
        completeData.plz_pb = testFormData.plz;
        completeData.ort_pb = testFormData.ort;
        completeData.telefon_pb = testFormData.telefon;
        
        // Current legal declaration logic
        completeData.standard_antrag_nicht_gestellt = true;   // ✓ "bisher nicht gestellt habe"
        completeData.standard_antrag_bereits_gestellt = false; // ✗ "bereits gestellt habe am"
        completeData.standard_restschuld_erteilt = false;     // ✗ "erteilt wurde am"
        completeData.standard_restschuld_versagt = false;     // ✗ "versagt wurde am"
        
        // Auto-generate dates
        const heute = new Date();
        const scheiterDatum = new Date(heute.getTime() + 14 * 24 * 60 * 60 * 1000);
        completeData.plan_datum = heute.toLocaleDateString('de-DE');
        completeData.scheiter_datum = scheiterDatum.toLocaleDateString('de-DE');
        completeData.bescheinigung_datum = heute.toLocaleDateString('de-DE');
        
        console.log('\n📊 Values we are setting:');
        console.log('City fields:');
        console.log(`   ort_pb: "${completeData.ort_pb}"`);
        console.log(`   ort: "${completeData.ort}"`);
        
        console.log('\nDate fields:');
        console.log(`   plan_datum: "${completeData.plan_datum}"`);
        console.log(`   scheiter_datum: "${completeData.scheiter_datum}"`);
        console.log(`   bescheinigung_datum: "${completeData.bescheinigung_datum}"`);
        
        console.log('\nLegal declaration checkboxes:');
        console.log(`   standard_antrag_nicht_gestellt: ${completeData.standard_antrag_nicht_gestellt}`);
        console.log(`   standard_antrag_bereits_gestellt: ${completeData.standard_antrag_bereits_gestellt}`);
        console.log(`   standard_restschuld_erteilt: ${completeData.standard_restschuld_erteilt}`);
        console.log(`   standard_restschuld_versagt: ${completeData.standard_restschuld_versagt}`);
        
        console.log('\n🔍 RECOMMENDATIONS:');
        console.log('1. Check if we\'re mixing up city and date fields');
        console.log('2. Verify checkbox mapping for "bisher nicht gestellt"');
        console.log('3. Make sure 2a checkbox is set and 2b is empty');
        
        return {
            currentMapping,
            testData: completeData
        };
        
    } catch (error) {
        console.error('❌ Error debugging page 2 fields:', error);
        throw error;
    }
}

// Run the debug
debugPage2Fields().then(result => {
    console.log('\n🎯 Debug analysis complete!');
}).catch(console.error);