#!/usr/bin/env node

// Test der neuen einfachen Checkbox-Konfiguration
const { PDFDocument } = require('pdf-lib');
const fs = require('fs');
const path = require('path');

async function testSimpleConfig() {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
    console.log(`✅ Testing Simple Checkbox Configuration - ${timestamp}`);
    console.log('═══════════════════════════════════════════════════════════');
    
    try {
        const SimpleCheckboxMapper = require('./pdf-form-test/simple-checkbox-mapper');
        
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
        
        console.log('🎯 EINFACHE CHECKBOX-KONFIGURATION:');
        console.log('   ✓ Alle Checkboxen basierend auf checkbox-config.js');
        console.log('   ✓ Du kannst beliebige Checkboxen in der Datei ändern');
        console.log('   ✓ Automatische Werte für Geschlecht, Familienstand, etc.');
        
        // Fill PDF
        const originalPdfPath = path.join(__dirname, 'pdf-form-test/original_form.pdf');
        const insolvenzantragBytes = await SimpleCheckboxMapper.fillWithSimpleConfig(formData, originalPdfPath);
        
        // Save with clear filename
        const outputFilename = `SIMPLE-CONFIG-${timestamp}.pdf`;
        const outputPath = path.join(__dirname, outputFilename);
        const desktopPath = `/Users/luka/Desktop/${outputFilename}`;
        
        fs.writeFileSync(outputPath, insolvenzantragBytes);
        fs.copyFileSync(outputPath, desktopPath);
        
        const fileSize = Math.round(insolvenzantragBytes.length / 1024);
        
        console.log('\\n✅ PDF MIT EINFACHER KONFIGURATION ERSTELLT!');
        console.log('\\n📊 ERGEBNIS:');
        console.log(`   📁 Dateigröße: ${fileSize} KB`);
        console.log(`   📍 Desktop: ${desktopPath}`);
        
        console.log('\\n🔧 ANPASSUNGEN:');
        console.log('   📝 Öffne: checkbox-config.js');
        console.log('   ✏️  Ändere beliebige Checkbox von false auf true');
        console.log('   🔄 Führe diesen Test erneut aus');
        
        console.log('\\n📋 WICHTIGE CHECKBOXEN BEREITS GESETZT:');
        console.log('   ✅ Kontrollkästchen 1: Restschuldbefreiungsantrag');
        console.log('   ✅ Kontrollkästchen 11: "bisher nicht gestellt habe"');
        console.log('   ✅ Kontrollkästchen 2,3,4: Anlagen 1,2,2A');
        console.log('   ✅ Kontrollkästchen 20: Anlage 7A (Musterplan)');
        
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
testSimpleConfig().then(result => {
    if (result.success) {
        console.log(`\\n📋 PDF ÖFFNEN:`);
        console.log(`open "${result.outputPath}"`);
        console.log('\\n🎯 NÄCHSTE SCHRITTE:');
        console.log('1. Prüfe das PDF');
        console.log('2. Öffne checkbox-config.js');
        console.log('3. Ändere true/false Werte nach deinen Wünschen');
        console.log('4. Führe Test erneut aus');
    }
}).catch(console.error);