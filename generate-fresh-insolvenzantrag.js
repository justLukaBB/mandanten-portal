#!/usr/bin/env node

// Generate a completely FRESH Insolvenzantrag with timestamp to avoid caching issues
const { PDFDocument } = require('pdf-lib');
const fs = require('fs');
const path = require('path');

async function generateFreshInsolvenzantrag() {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
    console.log(`🆕 Generating FRESH Insolvenzantrag - ${timestamp}`);
    console.log('════════════════════════════════════════════════════════');
    
    try {
        // Import the required modules
        const QuickFieldMapper = require('./server/pdf-form-test/quick-field-mapper');
        const { convertDocxToPdf } = require('./server/services/documentConverter');
        
        // Step 1: Clean client data (no weird characters or numbers)
        console.log('📋 Step 1: Preparing CLEAN client data...');
        
        function mapClientDataToPDF(client) {
            // Parse address
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
            
            // Determine court by ZIP code
            const determineCourtByZipCode = (zipCode) => {
                if (!zipCode) return 'Berlin';
                const zipPrefix = zipCode.substring(0, 2);
                const courtMapping = {
                    '44': 'Bochum', '45': 'Essen', '46': 'Dortmund',
                    '40': 'Düsseldorf', '41': 'Düsseldorf',
                    '50': 'Köln', '51': 'Köln',
                    '80': 'München', '81': 'München',
                    '70': 'Stuttgart', '71': 'Stuttgart',
                    '10': 'Berlin', '11': 'Berlin', '12': 'Berlin',
                    '20': 'Hamburg', '21': 'Hamburg', '22': 'Hamburg'
                };
                return courtMapping[zipPrefix] || 'Berlin';
            };
            
            return {
                // Personal information - CLEAN DATA ONLY
                vorname: String(client.firstName || '').trim(),
                nachname: String(client.lastName || '').trim(),
                strasse: String(street).trim(),
                hausnummer: String(houseNumber).trim(),
                plz: String(zipCode).trim(),
                ort: String(city).trim(),
                telefon: String(client.phone || '').trim(),
                email: String(client.email || '').trim(),
                
                // Financial data
                familienstand: String(client.financial_data?.marital_status || 'ledig').trim(),
                kinder_anzahl: String(client.financial_data?.number_of_children || 0),
                monatliches_netto_einkommen: String(client.financial_data?.monthly_net_income || ''),
                
                // Employment status
                berufsstatus: 'angestellt',
                
                // Debt information
                gesamtschuldensumme: String(client.debt_settlement_plan?.total_debt || 0),
                anzahl_glaeubiger: String(client.debt_settlement_plan?.creditors?.length || 0),
                
                // Court
                amtsgericht: determineCourtByZipCode(zipCode),
                
                // Legal representation
                hat_anwalt: false,
                anwalt_name: '',
                
                // Missing fields
                geburtsdatum: '',
                geburtsort: '',
                
                // Gender
                geschlecht: 'maennlich'
            };
        }
        
        // Clean mock client data
        const mockClient = {
            id: 'FRESH_TEST_001',
            firstName: 'Max',
            lastName: 'Mustermann', 
            email: 'max.mustermann@example.com',
            phone: '+49 123 456789',
            address: 'Musterstraße 123, 12345 Musterstadt',
            aktenzeichen: 'FRESH_MAND_001',
            
            financial_data: {
                client_form_filled: true,
                marital_status: 'verheiratet',
                number_of_children: 2,
                monthly_net_income: 2500,
                garnishable_amount: 300
            },
            
            debt_settlement_plan: {
                total_debt: 45000,
                creditors: [
                    { name: 'Deutsche Bank AG', amount: 25000, percentage: 55.56 },
                    { name: 'Sparkasse Köln Bonn', amount: 15000, percentage: 33.33 },
                    { name: 'Amazon Europe', amount: 5000, percentage: 11.11 }
                ]
            },
            
            final_creditor_list: [
                { 
                    sender_name: 'Deutsche Bank AG', 
                    claim_amount: 25000, 
                    sender_address: 'Taunusanlage 12, 60325 Frankfurt' 
                },
                { 
                    sender_name: 'Sparkasse Köln Bonn', 
                    claim_amount: 15000, 
                    sender_address: 'Hahnenstraße 57, 50667 Köln' 
                },
                { 
                    sender_name: 'Amazon Europe', 
                    claim_amount: 5000, 
                    sender_address: '38 avenue JFK, Luxembourg' 
                }
            ]
        };
        
        console.log('✅ Clean client data prepared');
        console.log('   📝 First Name:', mockClient.firstName);
        console.log('   📝 Last Name:', mockClient.lastName);
        console.log('   📝 Email:', mockClient.email);
        console.log('   📝 Phone:', mockClient.phone);
        console.log('   📝 Address:', mockClient.address);
        
        // Step 2: Map data and log what we're sending
        console.log('\n📄 Step 2: Mapping data for PDF form...');
        const formData = mapClientDataToPDF(mockClient);
        
        console.log('📋 Data being sent to PDF:');
        console.log('   vorname:', `"${formData.vorname}"`);
        console.log('   nachname:', `"${formData.nachname}"`);
        console.log('   email:', `"${formData.email}"`);
        console.log('   telefon:', `"${formData.telefon}"`);
        console.log('   strasse:', `"${formData.strasse}"`);
        console.log('   hausnummer:', `"${formData.hausnummer}"`);
        console.log('   plz:', `"${formData.plz}"`);
        console.log('   ort:', `"${formData.ort}"`);
        
        // Step 3: Fill PDF form
        console.log('\n📝 Step 3: Filling PDF form with clean data...');
        const originalPdfPath = path.join(__dirname, 'server/pdf-form-test/original_form.pdf');
        const insolvenzantragBytes = await QuickFieldMapper.fillWithRealFields(formData, originalPdfPath);
        console.log('✅ PDF form filled successfully');
        
        // Step 4: Convert Word documents
        console.log('\n📊 Step 4: Converting Word documents to PDF...');
        
        let schuldenPdfBytes = null;
        let forderungsPdfBytes = null;
        
        try {
            const schuldenPath = '/Users/luka/Downloads/Debt Restructuring Plan 2025-09-25.docx';
            schuldenPdfBytes = await convertDocxToPdf(schuldenPath);
            console.log('✅ Debt Restructuring Plan converted');
        } catch (error) {
            console.log('⚠️ Could not convert Debt Restructuring Plan:', error.message);
        }
        
        try {
            const forderungsPath = '/Users/luka/Downloads/Forderungsübersicht 567 Sept 25 2025.docx';
            forderungsPdfBytes = await convertDocxToPdf(forderungsPath);
            console.log('✅ Forderungsübersicht converted');
        } catch (error) {
            console.log('⚠️ Could not convert Forderungsübersicht:', error.message);
        }
        
        // Step 5: Merge documents
        console.log('\n🔗 Step 5: Merging all documents...');
        const mergedPdf = await PDFDocument.create();
        let totalPages = 0;
        
        // Add main Insolvenzantrag
        const insolvenzantragDoc = await PDFDocument.load(insolvenzantragBytes);
        const insolvenzantragPages = await mergedPdf.copyPages(insolvenzantragDoc, insolvenzantragDoc.getPageIndices());
        insolvenzantragPages.forEach(page => mergedPdf.addPage(page));
        totalPages += insolvenzantragPages.length;
        console.log(`   📄 Added Insolvenzantrag: ${insolvenzantragPages.length} pages`);
        
        // Add other documents
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
        
        // Step 6: Save with unique filename
        console.log('\n💾 Step 6: Saving FRESH document...');
        const mergedPdfBytes = await mergedPdf.save();
        
        // Use timestamp in filename to avoid any caching issues
        const outputFilename = `FRESH-Insolvenzantrag-${timestamp}.pdf`;
        const outputPath = path.join(__dirname, outputFilename);
        const desktopPath = `/Users/luka/Desktop/${outputFilename}`;
        
        fs.writeFileSync(outputPath, mergedPdfBytes);
        fs.copyFileSync(outputPath, desktopPath);
        
        const fileSize = Math.round(mergedPdfBytes.length / 1024);
        
        console.log('✅ FRESH Insolvenzantrag generated successfully!');
        console.log('\n📊 RESULTS:');
        console.log(`   📄 Total Pages: ${totalPages}`);
        console.log(`   📁 File Size: ${fileSize} KB`);
        console.log(`   📍 Desktop: ${desktopPath}`);
        console.log(`   📍 Project: ${outputPath}`);
        
        console.log('\n🎉 SUCCESS! Completely FRESH document with no caching issues!');
        console.log(`🔍 Please check: ${outputFilename}`);
        
        return {
            success: true,
            totalPages,
            fileSize,
            outputPath: desktopPath,
            filename: outputFilename
        };
        
    } catch (error) {
        console.error('\n❌ Error generating fresh Insolvenzantrag:', error);
        return {
            success: false,
            error: error.message
        };
    }
}

// Run the fresh generation
generateFreshInsolvenzantrag().then(result => {
    if (result.success) {
        console.log(`\n🎯 Ready to open the FRESH document:`);
        console.log(`open "${result.outputPath}"`);
    }
}).catch(console.error);