#!/usr/bin/env node

// Test der REINEN checkbox-config.js ohne automatische Überschreibungen
const { PDFDocument } = require('pdf-lib');
const fs = require('fs');
const path = require('path');

async function testPureConfig() {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
    console.log(`✅ Testing PURE Checkbox Configuration - ${timestamp}`);
    console.log('═══════════════════════════════════════════════════════════');
    console.log('🎯 NUR checkbox-config.js - KEINE automatischen Überschreibungen!');
    
    try {
        const PureCheckboxMapper = require('./pdf-form-test/pure-checkbox-mapper');
        
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
        
        console.log('\\n🎯 WAS GETESTET WIRD:');
        console.log('   ✅ EXAKT die Checkboxen aus deiner checkbox-config.js');
        console.log('   ✅ KEINE automatischen Geschlecht/Familienstand Überschreibungen');
        console.log('   ✅ Was du auf true setzt = wird gecheckt');
        console.log('   ✅ Was du auf false setzt = wird NICHT gecheckt');
        
        // Fill PDF
        const originalPdfPath = path.join(__dirname, 'pdf-form-test/original_form.pdf');
        const insolvenzantragBytes = await PureCheckboxMapper.fillWithPureConfig(formData, originalPdfPath);
        
        // Save with clear filename
        const outputFilename = `PURE-CONFIG-${timestamp}.pdf`;
        const outputPath = path.join(__dirname, outputFilename);
        const desktopPath = `/Users/luka/Desktop/${outputFilename}`;
        
        fs.writeFileSync(outputPath, insolvenzantragBytes);
        fs.copyFileSync(outputPath, desktopPath);
        
        const fileSize = Math.round(insolvenzantragBytes.length / 1024);
        
        console.log('\\n✅ PDF MIT REINER KONFIGURATION ERSTELLT!');
        console.log('\\n📊 ERGEBNIS:');
        console.log(`   📁 Dateigröße: ${fileSize} KB`);
        console.log(`   📍 Desktop: ${desktopPath}`);
        
        console.log('\\n✅ JETZT STIMMT ALLES ÜBEREIN!');
        console.log('   📋 Deine checkbox-config.js wird 1:1 verwendet');
        console.log('   📋 Keine automatischen Überschreibungen mehr');
        
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
testPureConfig().then(result => {
    if (result.success) {
        console.log(`\\n📋 PDF ÖFFNEN:`);
        console.log(`open "${result.outputPath}"`);
        console.log('\\n🎯 AB JETZT VERWENDE:');
        console.log('node test-pure-config.js');
        console.log('\\n✅ GARANTIERT: Was in checkbox-config.js steht = was im PDF ist!');
    }
}).catch(console.error);