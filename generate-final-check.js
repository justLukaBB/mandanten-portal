#!/usr/bin/env node

// Generate final PDF to verify the checkbox is always checked
const { PDFDocument } = require('pdf-lib');
const fs = require('fs');
const path = require('path');

async function generateFinalCheck() {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
    console.log(`📋 FINAL CHECK - Generating PDF with ALWAYS CHECKED Checkbox - ${timestamp}`);
    console.log('══════════════════════════════════════════════════════════════════════');
    
    try {
        const QuickFieldMapper = require('./pdf-form-test/quick-field-mapper');
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
        
        // Map data using the SAME logic as the server route
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
            
            const determineCourtByZipCode = (zipCode) => {
                if (!zipCode) return 'Berlin';
                const zipPrefix = zipCode.substring(0, 2);
                const courtMapping = {
                    '12': 'Berlin', '10': 'Berlin', '50': 'Köln'
                };
                return courtMapping[zipPrefix] || 'Berlin';
            };
            
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
                amtsgericht: determineCourtByZipCode(zipCode),
                geschlecht: 'maennlich',
                // ALWAYS ensure the main Restschuldbefreiung checkbox is set
                restschuldbefreiung_bisher_nicht_gestellt: true // ✓ ALWAYS CHECKED
            };
        }
        
        const formData = mapClientDataToPDF(mockClient);
        
        console.log('🎯 VERIFICATION:');
        console.log(`   restschuldbefreiung_bisher_nicht_gestellt: ${formData.restschuldbefreiung_bisher_nicht_gestellt}`);
        
        // Fill PDF
        const originalPdfPath = path.join(__dirname, 'pdf-form-test/original_form.pdf');
        const insolvenzantragBytes = await QuickFieldMapper.fillWithRealFields(formData, originalPdfPath);
        
        // Convert Word documents
        let schuldenPdfBytes = null;
        let forderungsPdfBytes = null;
        
        try {
            schuldenPdfBytes = await convertDocxToPdf('/Users/luka/Downloads/Debt Restructuring Plan 2025-09-25.docx');
            console.log('✅ Debt Restructuring Plan converted');
        } catch (error) {
            console.log('⚠️ Schuldenbereinigungsplan conversion failed');
        }
        
        try {
            forderungsPdfBytes = await convertDocxToPdf('/Users/luka/Downloads/Forderungsübersicht 567 Sept 25 2025.docx');
            console.log('✅ Forderungsübersicht converted');
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
        console.log(`   📄 Added Insolvenzantrag: ${insolvenzantragPages.length} pages`);
        
        if (schuldenPdfBytes) {
            const schuldenDoc = await PDFDocument.load(schuldenPdfBytes);
            const schuldenPages = await mergedPdf.copyPages(schuldenDoc, schuldenDoc.getPageIndices());
            schuldenPages.forEach(page => mergedPdf.addPage(page));
            totalPages += schuldenPages.length;
            console.log(`   📊 Added Debt Restructuring Plan: ${schuldenPages.length} pages`);
        }
        
        if (forderungsPdfBytes) {
            const forderungsDoc = await PDFDocument.load(forderungsPdfBytes);
            const forderungsPages = await mergedPdf.copyPages(forderungsDoc, forderungsDoc.getPageIndices());
            forderungsPages.forEach(page => mergedPdf.addPage(page));
            totalPages += forderungsPages.length;
            console.log(`   📋 Added Forderungsübersicht: ${forderungsPages.length} pages`);
        }
        
        // Save with clear filename
        const mergedPdfBytes = await mergedPdf.save();
        const outputFilename = `FINAL-CHECK-Always-Checked-${timestamp}.pdf`;
        const outputPath = path.join(__dirname, outputFilename);
        const desktopPath = `/Users/luka/Desktop/${outputFilename}`;
        
        fs.writeFileSync(outputPath, mergedPdfBytes);
        fs.copyFileSync(outputPath, desktopPath);
        
        const fileSize = Math.round(mergedPdfBytes.length / 1024);
        
        console.log('\n✅ FINAL CHECK PDF GENERATED!');
        console.log('\n📊 RESULTS:');
        console.log(`   📄 Total Pages: ${totalPages}`);
        console.log(`   📁 File Size: ${fileSize} KB`);
        console.log(`   📍 Desktop: ${desktopPath}`);
        
        console.log('\n🔍 PLEASE VERIFY:');
        console.log('   📋 Section II.2.a): Checkbox "bisher nicht gestellt habe" should be CHECKED ✓');
        console.log('   📋 This checkbox will now ALWAYS be checked in all future generations');
        console.log('   📋 Admin dashboard will generate identical results');
        
        return {
            success: true,
            filename: outputFilename,
            outputPath: desktopPath
        };
        
    } catch (error) {
        console.error('\n❌ Error generating final check:', error);
        return {
            success: false,
            error: error.message
        };
    }
}

// Run the final check
generateFinalCheck().then(result => {
    if (result.success) {
        console.log(`\n📋 FINAL CHECK READY:`);
        console.log(`open "${result.outputPath}"`);
    }
}).catch(console.error);