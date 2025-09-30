#!/usr/bin/env node

// Test Anlage 7A checkbox und Sonstige Feld check
const { PDFDocument } = require('pdf-lib');
const fs = require('fs');
const path = require('path');

async function testAnlage7A() {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
    console.log(`✅ Testing Anlage 7A + Sonstige Fix - ${timestamp}`);
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
        console.log('   ✓ Anlage 1, 2, 2A: GECHECKT');
        console.log('   ✓ Anlage 7A: GECHECKT (Musterplan)');
        console.log('   ✗ Andere Anlagen: NICHT GECHECKT');
        console.log('   ✗ "Sonstige" Feld: LEER (kein Datum)');
        
        // Fill PDF
        const originalPdfPath = path.join(__dirname, 'pdf-form-test/original_form.pdf');
        const insolvenzantragBytes = await QuickFieldMapper.fillWithRealFields(formData, originalPdfPath);
        
        // Save with clear filename
        const outputFilename = `ANLAGE-7A-FIX-${timestamp}.pdf`;
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
        console.log('   ✅ Anlage 7A (Musterplan) ist jetzt gecheckt');
        console.log('   ✅ Andere Anlagen sind nicht gecheckt');
        console.log('   ✅ "Sonstige" Feld hat kein Datum mehr');
        
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
testAnlage7A().then(result => {
    if (result.success) {
        console.log(`\\n📋 PDF ÖFFNEN:`);
        console.log(`open "${result.outputPath}"`);
    }
}).catch(console.error);