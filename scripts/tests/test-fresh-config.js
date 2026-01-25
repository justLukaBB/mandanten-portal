#!/usr/bin/env node

// Test mit Cache-Clearing - lädt immer die neueste checkbox-config.js
const { PDFDocument } = require('pdf-lib');
const fs = require('fs');
const path = require('path');

async function testFreshConfig() {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
    console.log(`✅ Testing FRESH Checkbox Configuration - ${timestamp}`);
    console.log('═══════════════════════════════════════════════════════════');
    
    try {
        // WICHTIG: Cache leeren um neueste checkbox-config.js zu laden
        const configPath = path.resolve('./checkbox-config.js');
        delete require.cache[configPath];
        console.log(`🔄 Cache cleared for: ${configPath}`);
        
        const SimpleCheckboxMapper = require('./server/pdf-form-test/simple-checkbox-mapper');
        
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
                geschlecht: 'maennlich'
            };
        }
        
        const formData = mapClientDataToPDF(mockClient);
        
        console.log('🎯 FRISCHE CHECKBOX-KONFIGURATION:');
        console.log('   ✓ Cache geleert - lädt neueste checkbox-config.js');
        console.log('   ✓ Alle deine Änderungen sollten jetzt aktiv sein');
        
        // Fill PDF
        const originalPdfPath = path.join(__dirname, 'server/pdf-form-test/original_form.pdf');
        const insolvenzantragBytes = await SimpleCheckboxMapper.fillWithSimpleConfig(formData, originalPdfPath);
        
        // Save with clear filename
        const outputFilename = `FRESH-CONFIG-${timestamp}.pdf`;
        const outputPath = path.join(__dirname, outputFilename);
        const desktopPath = `/Users/luka/Desktop/${outputFilename}`;
        
        fs.writeFileSync(outputPath, insolvenzantragBytes);
        fs.copyFileSync(outputPath, desktopPath);
        
        const fileSize = Math.round(insolvenzantragBytes.length / 1024);
        
        console.log('\\n✅ PDF MIT FRISCHER KONFIGURATION ERSTELLT!');
        console.log('\\n📊 ERGEBNIS:');
        console.log(`   📁 Dateigröße: ${fileSize} KB`);
        console.log(`   📍 Desktop: ${desktopPath}`);
        
        console.log('\\n✅ DEINE ÄNDERUNGEN SIND JETZT AKTIV!');
        
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
testFreshConfig().then(result => {
    if (result.success) {
        console.log(`\\n📋 PDF ÖFFNEN:`);
        console.log(`open "${result.outputPath}"`);
        console.log('\\n🎯 VERWENDE AB JETZT:');
        console.log('node test-fresh-config.js');
        console.log('(Diese Version lädt immer die neueste Konfiguration!)');
    }
}).catch(console.error);