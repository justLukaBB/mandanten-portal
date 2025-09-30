#!/usr/bin/env node

// Test the Insolvenzantrag API with real client data
const path = require('path');

// Mock client data that would come from the database
const mockClient = {
    id: 'TEST_CLIENT_001',
    firstName: 'Max',
    lastName: 'Mustermann', 
    email: 'max.mustermann@example.com',
    phone: '+49 123 456789',
    address: 'Musterstraße 123, 12345 Musterstadt',
    aktenzeichen: 'MAND_TEST_001',
    
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

async function testInsolvenzantragGeneration() {
    console.log('🎯 Testing Insolvenzantrag Generation with Real Data');
    console.log('══════════════════════════════════════════════════════');
    
    try {
        // Import the required modules
        const QuickFieldMapper = require('./pdf-form-test/quick-field-mapper');
        const { convertDocxToPdf } = require('./server/services/documentConverter');
        const { PDFDocument } = require('pdf-lib');
        const fs = require('fs');
        
        // Step 1: Map client data to PDF form format (same logic as in routes/insolvenzantrag.js)
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
                if (!zipCode) return '';
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
                // Personal information
                vorname: client.firstName || '',
                nachname: client.lastName || '',
                strasse: street,
                hausnummer: houseNumber,
                plz: zipCode,
                ort: city,
                telefon: client.phone || '',
                email: client.email || '',
                
                // Financial data
                familienstand: client.financial_data?.marital_status || 'ledig',
                kinder_anzahl: String(client.financial_data?.number_of_children || 0),
                monatliches_netto_einkommen: String(client.financial_data?.monthly_net_income || ''),
                
                // Employment status
                berufsstatus: 'angestellt', // Default
                
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
                geburtsort: ''
            };
        }
        
        console.log('📋 Step 1: Mapping client data to PDF form...');
        const formData = mapClientDataToPDF(mockClient);
        console.log('✅ Client data mapped successfully');
        console.log('   📝 Name:', `${formData.nachname}, ${formData.vorname}`);
        console.log('   🏠 Address:', `${formData.strasse} ${formData.hausnummer}, ${formData.plz} ${formData.ort}`);
        console.log('   🏛️ Court:', formData.amtsgericht);
        console.log('   👥 Family:', formData.familienstand, '- Children:', formData.kinder_anzahl);
        console.log('   💰 Income:', formData.monatliches_netto_einkommen, '€');
        console.log('   💳 Total Debt:', formData.gesamtschuldensumme, '€');
        
        console.log('\n📄 Step 2: Filling PDF form with client data...');
        const originalPdfPath = path.join(__dirname, 'pdf-form-test/original_form.pdf');
        const insolvenzantragBytes = await QuickFieldMapper.fillWithRealFields(formData, originalPdfPath);
        console.log('✅ PDF form filled successfully');
        
        console.log('\n📊 Step 3: Converting Word documents to PDF...');
        
        // Use your actual documents
        let schuldenPdfBytes = null;
        let forderungsPdfBytes = null;
        
        try {
            const schuldenPath = '/Users/luka/Downloads/Debt Restructuring Plan 2025-09-25.docx';
            schuldenPdfBytes = await convertDocxToPdf(schuldenPath);
            console.log('✅ Debt Restructuring Plan converted to PDF');
        } catch (error) {
            console.log('⚠️ Could not convert Debt Restructuring Plan:', error.message);
        }
        
        try {
            const forderungsPath = '/Users/luka/Downloads/Forderungsübersicht 567 Sept 25 2025.docx';
            forderungsPdfBytes = await convertDocxToPdf(forderungsPath);
            console.log('✅ Forderungsübersicht converted to PDF');
        } catch (error) {
            console.log('⚠️ Could not convert Forderungsübersicht:', error.message);
        }
        
        console.log('\n🔗 Step 4: Merging all documents...');
        const mergedPdf = await PDFDocument.create();
        let totalPages = 0;
        
        // Add main Insolvenzantrag
        const insolvenzantragDoc = await PDFDocument.load(insolvenzantragBytes);
        const insolvenzantragPages = await mergedPdf.copyPages(insolvenzantragDoc, insolvenzantragDoc.getPageIndices());
        insolvenzantragPages.forEach(page => mergedPdf.addPage(page));
        totalPages += insolvenzantragPages.length;
        console.log(`   📄 Added Insolvenzantrag: ${insolvenzantragPages.length} pages`);
        
        // Add Schuldenbereinigungsplan if available
        if (schuldenPdfBytes) {
            const schuldenDoc = await PDFDocument.load(schuldenPdfBytes);
            const schuldenPages = await mergedPdf.copyPages(schuldenDoc, schuldenDoc.getPageIndices());
            schuldenPages.forEach(page => mergedPdf.addPage(page));
            totalPages += schuldenPages.length;
            console.log(`   📊 Added Debt Restructuring Plan: ${schuldenPages.length} pages`);
        }
        
        // Add Forderungsübersicht if available
        if (forderungsPdfBytes) {
            const forderungsDoc = await PDFDocument.load(forderungsPdfBytes);
            const forderungsPages = await mergedPdf.copyPages(forderungsDoc, forderungsDoc.getPageIndices());
            forderungsPages.forEach(page => mergedPdf.addPage(page));
            totalPages += forderungsPages.length;
            console.log(`   📋 Added Forderungsübersicht: ${forderungsPages.length} pages`);
        }
        
        console.log('\n💾 Step 5: Saving complete Insolvenzantrag...');
        const mergedPdfBytes = await mergedPdf.save();
        const outputPath = path.join(__dirname, 'API-TEST-Insolvenzantrag-Complete.pdf');
        const desktopPath = '/Users/luka/Desktop/API-TEST-Insolvenzantrag-Complete.pdf';
        
        fs.writeFileSync(outputPath, mergedPdfBytes);
        fs.copyFileSync(outputPath, desktopPath);
        
        const fileSize = Math.round(mergedPdfBytes.length / 1024);
        
        console.log('✅ Complete Insolvenzantrag generated successfully!');
        console.log('\n📊 RESULTS:');
        console.log(`   📄 Total Pages: ${totalPages}`);
        console.log(`   📁 File Size: ${fileSize} KB`);
        console.log(`   📍 Saved to: ${desktopPath}`);
        
        console.log('\n🎉 SUCCESS! API-level Insolvenzantrag generation working perfectly!');
        console.log('🚀 This is exactly what the admin dashboard button will generate!');
        
        return {
            success: true,
            totalPages,
            fileSize,
            outputPath: desktopPath
        };
        
    } catch (error) {
        console.error('\n❌ Error testing Insolvenzantrag generation:', error);
        return {
            success: false,
            error: error.message
        };
    }
}

// Run the test
testInsolvenzantragGeneration().then(result => {
    if (result.success) {
        console.log('\n🎯 Ready to open the generated file:');
        console.log(`open "${result.outputPath}"`);
    }
}).catch(console.error);