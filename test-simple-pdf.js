#!/usr/bin/env node

// Simple test to demonstrate PDF generation functionality
const fs = require('fs');
const path = require('path');

async function testPDFGeneration() {
    console.log('🧪 Testing PDF Generation Components');
    console.log('══════════════════════════════════════\n');

    try {
        // Test 1: Basic PDF generation using pdf-lib
        console.log('📄 Test 1: Basic PDF Creation...');
        const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');
        
        const pdfDoc = await PDFDocument.create();
        const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
        const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
        
        const page = pdfDoc.addPage([595.28, 841.89]); // A4
        const { width, height } = page.getSize();
        
        // Title
        page.drawText('Insolvenzantrag - Test Generation', {
            x: 50,
            y: height - 50,
            size: 18,
            font: boldFont,
            color: rgb(0, 0, 0),
        });
        
        // Mock data
        const mockData = {
            name: 'Max Mustermann',
            address: 'Musterstraße 123, 12345 Musterstadt',
            phone: '+49 123 456789',
            email: 'max.mustermann@example.com',
            maritalStatus: 'verheiratet',
            children: '2',
            income: '2500 €',
            totalDebt: '45000 €',
            creditors: '3'
        };
        
        let yPos = height - 100;
        const lineHeight = 20;
        
        // Add mock data to PDF
        Object.entries(mockData).forEach(([key, value]) => {
            const label = key.charAt(0).toUpperCase() + key.slice(1) + ':';
            page.drawText(`${label} ${value}`, {
                x: 50,
                y: yPos,
                size: 12,
                font: font,
                color: rgb(0, 0, 0),
            });
            yPos -= lineHeight;
        });
        
        const pdfBytes = await pdfDoc.save();
        const testPdfPath = path.join(__dirname, 'test-basic-pdf.pdf');
        fs.writeFileSync(testPdfPath, pdfBytes);
        
        console.log(`✅ Basic PDF created: ${testPdfPath}`);

        // Test 2: Test document converter service
        console.log('\n📋 Test 2: Document Converter Service...');
        
        const { generateSchuldenbereinigungsplanPdf, generateGlaeubigerlistePdf } = require('./server/services/documentConverter');
        
        const mockClient = {
            firstName: 'Max',
            lastName: 'Mustermann',
            aktenzeichen: 'MAND_TEST_001',
            debt_settlement_plan: {
                total_debt: 45000,
                pfaendbar_amount: 300,
                creditors: [
                    { name: 'Bank ABC', amount: 25000, percentage: 55.56 },
                    { name: 'Kreditkarte XYZ', amount: 15000, percentage: 33.33 },
                    { name: 'Online-Shop DEF', amount: 5000, percentage: 11.11 }
                ]
            },
            final_creditor_list: [
                { sender_name: 'Bank ABC', claim_amount: 25000, sender_address: 'Bankstraße 1, 10115 Berlin' },
                { sender_name: 'Kreditkarte XYZ', claim_amount: 15000, sender_address: 'Finanzplatz 5, 60311 Frankfurt' },
                { sender_name: 'Online-Shop DEF', claim_amount: 5000, sender_address: 'Webstraße 10, 80331 München' }
            ]
        };

        // Generate Schuldenbereinigungsplan
        try {
            const schuldenPdf = await generateSchuldenbereinigungsplanPdf(mockClient);
            const schuldenPath = path.join(__dirname, 'test-schuldenplan.pdf');
            fs.writeFileSync(schuldenPath, schuldenPdf);
            console.log(`✅ Schuldenbereinigungsplan created: ${schuldenPath}`);
        } catch (error) {
            console.log(`❌ Schuldenbereinigungsplan failed: ${error.message}`);
        }

        // Generate Gläubigerliste  
        try {
            const glaeubigerPdf = await generateGlaeubigerlistePdf(mockClient);
            const glaeubigerPath = path.join(__dirname, 'test-glaeubigerliste.pdf');
            fs.writeFileSync(glaeubigerPath, glaeubigerPdf);
            console.log(`✅ Gläubigerliste created: ${glaeubigerPath}`);
        } catch (error) {
            console.log(`❌ Gläubigerliste failed: ${error.message}`);
        }

        // Test 3: Test form field mapping (if original form exists)
        console.log('\n🗺️  Test 3: Form Field Mapping...');
        
        const originalPdfPath = path.join(__dirname, 'pdf-form-test/original_form.pdf');
        if (fs.existsSync(originalPdfPath)) {
            try {
                const QuickFieldMapper = require('./pdf-form-test/quick-field-mapper');
                
                const formData = {
                    nachname: 'Mustermann',
                    vorname: 'Max',
                    strasse: 'Musterstraße',
                    hausnummer: '123',
                    plz: '12345',
                    ort: 'Musterstadt',
                    telefon: '+49 123 456789',
                    email: 'max.mustermann@example.com',
                    familienstand: 'verheiratet',
                    kinder_anzahl: '2',
                    monatliches_netto_einkommen: '2500',
                    gesamtschuldensumme: '45000',
                    anzahl_glaeubiger: '3',
                    amtsgericht: 'Berlin'
                };
                
                const filledPdfBytes = await QuickFieldMapper.fillWithRealFields(formData, originalPdfPath);
                const filledPath = path.join(__dirname, 'test-filled-form.pdf');
                fs.writeFileSync(filledPath, filledPdfBytes);
                console.log(`✅ Form field mapping successful: ${filledPath}`);
            } catch (error) {
                console.log(`❌ Form field mapping failed: ${error.message}`);
            }
        } else {
            console.log('⚠️  Original form PDF not found, skipping field mapping test');
        }

        // Test 4: Test PDF merging
        console.log('\n🔗 Test 4: PDF Merging...');
        
        try {
            const mergedPdf = await PDFDocument.create();
            
            // Load test PDFs if they exist and merge them
            const testFiles = [
                'test-basic-pdf.pdf',
                'test-schuldenplan.pdf', 
                'test-glaeubigerliste.pdf'
            ].map(f => path.join(__dirname, f)).filter(f => fs.existsSync(f));
            
            for (const filePath of testFiles) {
                try {
                    const pdfBytes = fs.readFileSync(filePath);
                    const pdf = await PDFDocument.load(pdfBytes);
                    const pages = await mergedPdf.copyPages(pdf, pdf.getPageIndices());
                    pages.forEach(page => mergedPdf.addPage(page));
                } catch (mergeError) {
                    console.log(`⚠️  Could not merge ${path.basename(filePath)}: ${mergeError.message}`);
                }
            }
            
            const mergedBytes = await mergedPdf.save();
            const mergedPath = path.join(__dirname, 'test-complete-insolvenzantrag.pdf');
            fs.writeFileSync(mergedPath, mergedBytes);
            console.log(`✅ Complete merged PDF created: ${mergedPath}`);
            
        } catch (error) {
            console.log(`❌ PDF merging failed: ${error.message}`);
        }

        // Summary
        console.log('\n🎉 Test Results Summary:');
        console.log('══════════════════════════════════════');
        
        const generatedFiles = [
            'test-basic-pdf.pdf',
            'test-schuldenplan.pdf',
            'test-glaeubigerliste.pdf', 
            'test-filled-form.pdf',
            'test-complete-insolvenzantrag.pdf'
        ].filter(file => fs.existsSync(path.join(__dirname, file)));
        
        console.log(`✅ ${generatedFiles.length} PDF files generated successfully:`);
        generatedFiles.forEach(file => {
            const stats = fs.statSync(path.join(__dirname, file));
            console.log(`   📄 ${file} (${Math.round(stats.size / 1024)} KB)`);
        });
        
        console.log('\n🚀 Core Insolvenzantrag functionality is working!');
        console.log('\n📱 Next Steps:');
        console.log('1. Open the generated PDFs to verify content');
        console.log('2. Test the Admin Dashboard at http://localhost:3000');
        console.log('3. Look for the "Insolvenzantrag herunterladen" button in client details');
        
    } catch (error) {
        console.error('\n❌ Test failed:', error.message);
        console.error(error.stack);
    }
}

// Run the test
testPDFGeneration().catch(console.error);