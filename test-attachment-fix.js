#!/usr/bin/env node

// Test attachment checkboxes fix - uncheck last 6 and remove unwanted name
const { PDFDocument } = require('pdf-lib');
const fs = require('fs');
const path = require('path');

async function testAttachmentFix() {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
    console.log(`✅ Testing Attachment Fix - ${timestamp}`);
    console.log('════════════════════════════════════════════════════');
    
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
                // Main checkboxes
                restschuldbefreiung_antrag_stellen: true,         
                restschuldbefreiung_bisher_nicht_gestellt: true   
            };
        }
        
        const formData = mapClientDataToPDF(mockClient);
        
        console.log('🎯 TARGET FIXES:');
        console.log('   ✓ First 3 attachment checkboxes should be CHECKED');
        console.log('   ✗ Last 6 attachment checkboxes should be UNCHECKED');
        console.log('   ✗ No "Mustermann" should appear in Sonstige field');
        
        // Fill PDF
        const originalPdfPath = path.join(__dirname, 'pdf-form-test/original_form.pdf');
        const insolvenzantragBytes = await QuickFieldMapper.fillWithRealFields(formData, originalPdfPath);
        
        // Save with clear filename
        const outputFilename = `ATTACHMENT-FIX-${timestamp}.pdf`;
        const outputPath = path.join(__dirname, outputFilename);
        const desktopPath = `/Users/luka/Desktop/${outputFilename}`;
        
        fs.writeFileSync(outputPath, insolvenzantragBytes);
        fs.copyFileSync(outputPath, desktopPath);
        
        const fileSize = Math.round(insolvenzantragBytes.length / 1024);
        
        console.log('\\n✅ ATTACHMENT FIXES APPLIED!');
        console.log('\\n📊 RESULTS:');
        console.log(`   📁 File Size: ${fileSize} KB`);
        console.log(`   📍 Desktop: ${desktopPath}`);
        
        console.log('\\n🔍 PLEASE VERIFY:');
        console.log('   ✅ Only first 3 attachment checkboxes are checked');
        console.log('   ✅ Last 6 attachment checkboxes are UNCHECKED');
        console.log('   ✅ No unwanted text in "Sonstige" field');
        
        return {
            success: true,
            filename: outputFilename,
            outputPath: desktopPath
        };
        
    } catch (error) {
        console.error('\\n❌ Error testing attachment fix:', error);
        return {
            success: false,
            error: error.message
        };
    }
}

// Run the test
testAttachmentFix().then(result => {
    if (result.success) {
        console.log(`\\n📋 VERIFY ATTACHMENT FIXES:`);
        console.log(`open "${result.outputPath}"`);
    }
}).catch(console.error);