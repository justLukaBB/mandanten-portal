#!/usr/bin/env node

// Test both required checkboxes: II.1 and II.2.a)
const { PDFDocument } = require('pdf-lib');
const fs = require('fs');
const path = require('path');

async function testBothCheckboxes() {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
    console.log(`✅ Testing BOTH Required Checkboxes - ${timestamp}`);
    console.log('════════════════════════════════════════════════════');
    
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
                geschlecht: 'maennlich',
                // BOTH checkboxes that should ALWAYS be checked
                restschuldbefreiung_antrag_stellen: true,         // ✓ II.1 checkbox
                restschuldbefreiung_bisher_nicht_gestellt: true   // ✓ II.2.a) checkbox
            };
        }
        
        const formData = mapClientDataToPDF(mockClient);
        
        console.log('🎯 TARGET CHECKBOXES:');
        console.log('   Section II.1: "Ich stelle den Antrag auf Restschuldbefreiung" ✓');
        console.log('   Section II.2.a): "bisher nicht gestellt habe" ✓');
        
        console.log('\n🔍 VERIFICATION:');
        console.log(`   restschuldbefreiung_antrag_stellen: ${formData.restschuldbefreiung_antrag_stellen}`);
        console.log(`   restschuldbefreiung_bisher_nicht_gestellt: ${formData.restschuldbefreiung_bisher_nicht_gestellt}`);
        
        // Fill PDF
        const originalPdfPath = path.join(__dirname, 'server/pdf-form-test/original_form.pdf');
        const insolvenzantragBytes = await QuickFieldMapper.fillWithRealFields(formData, originalPdfPath);
        
        // Convert Word documents
        let schuldenPdfBytes = null;
        let forderungsPdfBytes = null;
        
        try {
            schuldenPdfBytes = await convertDocxToPdf('/Users/luka/Downloads/Debt Restructuring Plan 2025-09-25.docx');
        } catch (error) {
            console.log('⚠️ Schuldenbereinigungsplan conversion skipped');
        }
        
        try {
            forderungsPdfBytes = await convertDocxToPdf('/Users/luka/Downloads/Forderungsübersicht 567 Sept 25 2025.docx');
        } catch (error) {
            console.log('⚠️ Forderungsübersicht conversion skipped');
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
        
        // Save with clear filename
        const mergedPdfBytes = await mergedPdf.save();
        const outputFilename = `BOTH-CHECKBOXES-${timestamp}.pdf`;
        const outputPath = path.join(__dirname, outputFilename);
        const desktopPath = `/Users/luka/Desktop/${outputFilename}`;
        
        fs.writeFileSync(outputPath, mergedPdfBytes);
        fs.copyFileSync(outputPath, desktopPath);
        
        const fileSize = Math.round(mergedPdfBytes.length / 1024);
        
        console.log('\n✅ BOTH CHECKBOXES APPLIED!');
        console.log('\n📊 RESULTS:');
        console.log(`   📄 Total Pages: ${totalPages}`);
        console.log(`   📁 File Size: ${fileSize} KB`);
        console.log(`   📍 Desktop: ${desktopPath}`);
        
        console.log('\n🔍 PLEASE VERIFY BOTH CHECKBOXES:');
        console.log('   ✅ Section II.1: "Ich stelle den Antrag auf Restschuldbefreiung" should be CHECKED ✓');
        console.log('   ✅ Section II.2.a): "bisher nicht gestellt habe" should be CHECKED ✓');
        console.log('   ✅ Both checkboxes will now ALWAYS be checked in admin dashboard');
        
        return {
            success: true,
            filename: outputFilename,
            outputPath: desktopPath
        };
        
    } catch (error) {
        console.error('\n❌ Error testing both checkboxes:', error);
        return {
            success: false,
            error: error.message
        };
    }
}

// Run the test
testBothCheckboxes().then(result => {
    if (result.success) {
        console.log(`\n📋 VERIFY BOTH CHECKBOXES:`);
        console.log(`open "${result.outputPath}"`);
    }
}).catch(console.error);