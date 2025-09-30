#!/usr/bin/env node

// Test nur Section II.2.a) gecheckt, II.2.b) und II.2.c) LEER
const { PDFDocument } = require('pdf-lib');
const fs = require('fs');
const path = require('path');

async function testSectionIIOnly() {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
    console.log(`✅ Testing Section II.2 - Nur A gecheckt - ${timestamp}`);
    console.log('═══════════════════════════════════════════════════════════');
    
    try {
        const QuickFieldMapper = require('./pdf-form-test/quick-field-mapper');
        
        // Test data
        const mockClient = {
            firstName: 'Max',
            lastName: 'Mustermann', 
            email: 'max.mustermann@example.com',
            phone: '+49 123 456789',
            address: 'Musterstraße 123, 12345 Musterstadt',
            financial_data: {
                marital_status: 'verheiratet',
                number_of_children: 2
            }
        };
        
        // Map data
        function mapClientDataToPDF(client) {
            let street = '', houseNumber = '', zipCode = '', city = '';
            if (client.address) {
                const addressParts = client.address.match(/^(.+?)\\s+(\\d+[a-zA-Z]?),?\\s*(\\d{5})\\s+(.+)$/);
                if (addressParts) {
                    street = addressParts[1];
                    houseNumber = addressParts[2];
                    zipCode = addressParts[3];
                    city = addressParts[4];
                }
            }
            
            return {
                vorname: client.firstName,
                nachname: client.lastName,
                strasse: street,
                hausnummer: houseNumber,
                plz: zipCode,
                ort: city,
                telefon: client.phone,
                email: client.email,
                familienstand: client.financial_data?.marital_status || 'ledig',
                kinder_anzahl: String(client.financial_data?.number_of_children || 0),
                berufsstatus: 'angestellt',
                geschlecht: 'maennlich',
                // Hauptcheckboxen
                restschuldbefreiung_antrag_stellen: true,         
                restschuldbefreiung_bisher_nicht_gestellt: true   
            };
        }
        
        const formData = mapClientDataToPDF(mockClient);
        
        console.log('🎯 ZIEL:');
        console.log('   ✓ Section II.1: "Ich stelle den Antrag auf Restschuldbefreiung" - GECHECKT');
        console.log('   ✓ Section II.2.a): "bisher nicht gestellt habe" - GECHECKT');  
        console.log('   ✗ Section II.2.b): KEINE Checkboxen gecheckt');
        console.log('   ✗ Section II.2.c): KEINE Checkboxen gecheckt');
        
        // Fill PDF
        const originalPdfPath = path.join(__dirname, 'pdf-form-test/original_form.pdf');
        const insolvenzantragBytes = await QuickFieldMapper.fillWithRealFields(formData, originalPdfPath);
        
        // Save with clear filename
        const outputFilename = `SECTION-II-ONLY-A-${timestamp}.pdf`;
        const outputPath = path.join(__dirname, outputFilename);
        const desktopPath = `/Users/luka/Desktop/${outputFilename}`;
        
        fs.writeFileSync(outputPath, insolvenzantragBytes);
        fs.copyFileSync(outputPath, desktopPath);
        
        const fileSize = Math.round(insolvenzantragBytes.length / 1024);
        
        console.log('\\n✅ PDF ERSTELLT!');
        console.log('\\n📊 ERGEBNIS:');
        console.log(`   📁 Dateigröße: ${fileSize} KB`);
        console.log(`   📍 Desktop: ${desktopPath}`);
        
        console.log('\\n🔍 BITTE PRÜFEN:');
        console.log('   ✅ Section II.2.a): Nur "bisher nicht gestellt habe" ist gecheckt');
        console.log('   ✅ Section II.2.b): KOMPLETT LEER (keine Checkboxen)');
        console.log('   ✅ Section II.2.c): KOMPLETT LEER (keine Checkboxen)');
        
        return {
            success: true,
            filename: outputFilename,
            outputPath: desktopPath
        };
        
    } catch (error) {
        console.error('\\n❌ Fehler beim Test:', error);
        return {
            success: false,
            error: error.message
        };
    }
}

// Test ausführen
testSectionIIOnly().then(result => {
    if (result.success) {
        console.log(`\\n📋 PDF ÖFFNEN:`);
        console.log(`open "${result.outputPath}"`);
    }
}).catch(console.error);