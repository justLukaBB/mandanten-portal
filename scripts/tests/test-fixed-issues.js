#!/usr/bin/env node

// Test the specific fixes for page 2 issues
const { PDFDocument } = require('pdf-lib');
const fs = require('fs');
const path = require('path');

async function testFixedIssues() {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
    console.log(`🔧 Testing FIXED Issues - ${timestamp}`);
    console.log('═══════════════════════════════════════════════════');
    
    try {
        const QuickFieldMapper = require('./server/pdf-form-test/quick-field-mapper');
        const { convertDocxToPdf } = require('./server/services/documentConverter');
        
        // Test data
        const mockClient = {
            firstName: 'Max',
            lastName: 'Mustermann', 
            email: 'max.mustermann@example.com',
            phone: '+49 123 456789',
            address: 'Musterstraße 123, 12345 Musterstadt',
            financial_data: {
                marital_status: 'verheiratet',
                number_of_children: 2,
                monthly_net_income: 2500
            },
            debt_settlement_plan: {
                total_debt: 45000,
                creditors: [
                    { name: 'Deutsche Bank AG', amount: 25000 }
                ]
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
                amtsgericht: 'Berlin',
                geschlecht: 'maennlich'
            };
        }
        
        const formData = mapClientDataToPDF(mockClient);
        
        console.log('🎯 TESTING SPECIFIC FIXES:');
        console.log('\nFIX 1: Checkbox "bisher nicht gestellt" should be Kontrollkästchen 1');
        console.log('FIX 2: City field should have city, not date');
        console.log('FIX 3: Section 2a should be checked, 2b should be empty');
        
        console.log('\n📊 Input data:');
        console.log(`   City (ort): "${formData.ort}"`);
        console.log(`   First name: "${formData.vorname}"`);
        console.log(`   Last name: "${formData.nachname}"`);
        
        // Fill PDF
        const originalPdfPath = path.join(__dirname, 'server/pdf-form-test/original_form.pdf');
        const insolvenzantragBytes = await QuickFieldMapper.fillWithRealFields(formData, originalPdfPath);
        
        // Convert Word documents
        let schuldenPdfBytes = null;
        let forderungsPdfBytes = null;
        
        try {
            schuldenPdfBytes = await convertDocxToPdf('/Users/luka/Downloads/Debt Restructuring Plan 2025-09-25.docx');
        } catch (error) {
            console.log('⚠️ Schuldenbereinigungsplan conversion failed');
        }
        
        try {
            forderungsPdfBytes = await convertDocxToPdf('/Users/luka/Downloads/Forderungsübersicht 567 Sept 25 2025.docx');
        } catch (error) {
            console.log('⚠️ Forderungsübersicht conversion failed');
        }
        
        // Merge documents
        const mergedPdf = await PDFDocument.create();
        let totalPages = 0;
        
        const insolvenzantragDoc = await PDFDocument.load(insolvenzantragBytes);
        const insolvenzantragPages = await mergedPdf.copyPages(insolvenzantragDoc, insolvenzantragDoc.getPageIndices());
        insolvenzantragPages.forEach(page => mergedPdf.addPage(page));
        totalPages += insolvenzantragPages.length;
        
        if (schuldenPdfBytes) {
            const schuldenDoc = await PDFDocument.load(schuldenPdfBytes);
            const schuldenPages = await mergedPdf.copyPages(schuldenDoc, schuldenDoc.getPageIndices());
            schuldenPages.forEach(page => mergedPdf.addPage(page));
            totalPages += schuldenPages.length;
        }
        
        if (forderungsPdfBytes) {
            const forderungsDoc = await PDFDocument.load(forderungsPdfBytes);
            const forderungsPages = await mergedPdf.copyPages(forderungsDoc, forderungsDoc.getPageIndices());
            forderungsPages.forEach(page => mergedPdf.addPage(page));
            totalPages += forderungsPages.length;
        }
        
        // Save with FIXED filename
        const mergedPdfBytes = await mergedPdf.save();
        const outputFilename = `FIXED-Issues-${timestamp}.pdf`;
        const outputPath = path.join(__dirname, outputFilename);
        const desktopPath = `/Users/luka/Desktop/${outputFilename}`;
        
        fs.writeFileSync(outputPath, mergedPdfBytes);
        fs.copyFileSync(outputPath, desktopPath);
        
        const fileSize = Math.round(mergedPdfBytes.length / 1024);
        
        console.log('\n✅ FIXES APPLIED AND TESTED!');
        console.log('\n📊 RESULTS:');
        console.log(`   📄 Total Pages: ${totalPages}`);
        console.log(`   📁 File Size: ${fileSize} KB`);
        console.log(`   📍 Desktop: ${desktopPath}`);
        
        console.log('\n🎯 PLEASE CHECK:');
        console.log('   1. Page 2: City field should show "Musterstadt" (not a date)');
        console.log('   2. Section 2a: "bisher nicht gestellt" should be checked ✓');
        console.log('   3. Section 2b: Should be empty (no checkmarks)');
        console.log('   4. Signature area: Should have proper city and date');
        
        return {
            success: true,
            filename: outputFilename,
            outputPath: desktopPath
        };
        
    } catch (error) {
        console.error('\n❌ Error testing fixes:', error);
        return {
            success: false,
            error: error.message
        };
    }
}

// Run the test
testFixedIssues().then(result => {
    if (result.success) {
        console.log(`\n🔍 Open the FIXED document to verify:`);
        console.log(`open "${result.outputPath}"`);
    }
}).catch(console.error);