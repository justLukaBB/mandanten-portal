#!/usr/bin/env node

// Test the checkbox fix for section II.2.a)
const { PDFDocument } = require('pdf-lib');
const fs = require('fs');
const path = require('path');

async function testCheckboxFix() {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
    console.log(`🎯 Testing Checkbox Fix - ${timestamp}`);
    console.log('════════════════════════════════════════════');
    
    try {
        const QuickFieldMapper = require('./server/pdf-form-test/quick-field-mapper');
        
        // Simple test data
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
                const addressParts = client.address.match(/^(.+?)\s+(\d+[a-zA-Z]?),?\s*(\d{5})\s+(.+)$/);
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
        
        console.log('🎯 TARGET: Section II.2.a) first checkbox should be checked');
        console.log('🎯 TARGET: No text in "bereits gestellt habe am" or "erteilt wurde am" fields');
        
        console.log('\n📊 Input data:');
        console.log(`   Name: "${formData.vorname} ${formData.nachname}"`);
        console.log(`   Email: "${formData.email}"`);
        console.log(`   City: "${formData.ort}"`);
        
        // Fill PDF - focus on just the main form
        const originalPdfPath = path.join(__dirname, 'server/pdf-form-test/original_form.pdf');
        const insolvenzantragBytes = await QuickFieldMapper.fillWithRealFields(formData, originalPdfPath);
        
        // Save just the main form for testing
        const outputFilename = `CHECKBOX-FIX-${timestamp}.pdf`;
        const outputPath = path.join(__dirname, outputFilename);
        const desktopPath = `/Users/luka/Desktop/${outputFilename}`;
        
        fs.writeFileSync(outputPath, insolvenzantragBytes);
        fs.copyFileSync(outputPath, desktopPath);
        
        const fileSize = Math.round(insolvenzantragBytes.length / 1024);
        
        console.log('\n✅ CHECKBOX FIX APPLIED!');
        console.log('\n📊 RESULTS:');
        console.log(`   📁 File Size: ${fileSize} KB`);
        console.log(`   📍 Desktop: ${desktopPath}`);
        
        console.log('\n🔍 PLEASE CHECK SECTION II.2.a):');
        console.log('   ✅ First checkbox "bisher nicht gestellt habe" should be CHECKED ✓');
        console.log('   ✅ Text field under "bereits gestellt habe am" should be EMPTY');
        console.log('   ✅ Text field under "erteilt wurde am" should be EMPTY');
        console.log('   ✅ No "Berlin" or email in wrong places');
        
        return {
            success: true,
            filename: outputFilename,
            outputPath: desktopPath
        };
        
    } catch (error) {
        console.error('\n❌ Error testing checkbox fix:', error);
        return {
            success: false,
            error: error.message
        };
    }
}

// Run the test
testCheckboxFix().then(result => {
    if (result.success) {
        console.log(`\n🎯 Open the FIXED document to verify checkbox:`);
        console.log(`open "${result.outputPath}"`);
    }
}).catch(console.error);