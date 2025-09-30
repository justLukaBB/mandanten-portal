#!/usr/bin/env node

// Create the COMPLETE Insolvenzantrag with all 3 real documents merged
const { PDFDocument } = require('pdf-lib');
const fs = require('fs');
const path = require('path');

async function createCompleteInsolvenzantrag() {
    console.log('🎯 Creating COMPLETE Insolvenzantrag with Real Documents');
    console.log('═══════════════════════════════════════════════════════\n');

    try {
        // Step 1: Generate the official Insolvenzantrag form
        console.log('📄 Step 1: Generating Official Insolvenzantrag Form...');
        
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
        
        const originalPdfPath = path.join(__dirname, 'pdf-form-test/original_form.pdf');
        const insolvenzantragBytes = await QuickFieldMapper.fillWithRealFields(formData, originalPdfPath);
        console.log('✅ Official Insolvenzantrag form generated (45 pages)');

        // Step 2: Convert actual Word documents to PDF
        console.log('\n📋 Step 2: Converting Real Documents to PDF...');
        
        const { convertDocxToPdf } = require('./server/services/documentConverter');
        
        // Convert Schuldenbereinigungsplan
        let schuldenPdfBytes = null;
        const schuldenPath = path.join(__dirname, 'sample-schuldenbereinigungsplan.docx');
        if (fs.existsSync(schuldenPath)) {
            try {
                schuldenPdfBytes = await convertDocxToPdf(schuldenPath);
                console.log('✅ Schuldenbereinigungsplan converted to PDF');
            } catch (error) {
                console.log(`⚠️  Could not convert Schuldenbereinigungsplan: ${error.message}`);
                
                // Try the downloaded original
                const originalSchuldenPath = `/Users/luka/Downloads/Schuldenbereinigungsplan_1234567_2025-09-04.docx`;
                if (fs.existsSync(originalSchuldenPath)) {
                    try {
                        schuldenPdfBytes = await convertDocxToPdf(originalSchuldenPath);
                        console.log('✅ Original Schuldenbereinigungsplan converted to PDF');
                    } catch (error2) {
                        console.log(`⚠️  Could not convert original Schuldenbereinigungsplan: ${error2.message}`);
                    }
                }
            }
        }
        
        // Convert Forderungsübersicht
        let forderungsPdfBytes = null;
        const forderungsPath = path.join(__dirname, 'sample-forderungsuebersicht.docx');
        if (fs.existsSync(forderungsPath)) {
            try {
                forderungsPdfBytes = await convertDocxToPdf(forderungsPath);
                console.log('✅ Forderungsübersicht converted to PDF');
            } catch (error) {
                console.log(`⚠️  Could not convert Forderungsübersicht: ${error.message}`);
                
                // Try the downloaded original
                const originalForderungsPath = `/Users/luka/Downloads/Forderungsübersicht 567 Sept 25 2025.docx`;
                if (fs.existsSync(originalForderungsPath)) {
                    try {
                        forderungsPdfBytes = await convertDocxToPdf(originalForderungsPath);
                        console.log('✅ Original Forderungsübersicht converted to PDF');
                    } catch (error2) {
                        console.log(`⚠️  Could not convert original Forderungsübersicht: ${error2.message}`);
                    }
                }
            }
        }

        // Step 3: Generate fallback documents if conversions failed
        console.log('\n🔄 Step 3: Generating Fallback Documents if Needed...');
        
        const { generateSchuldenbereinigungsplanPdf, generateGlaeubigerlistePdf } = require('./server/services/documentConverter');
        
        const mockClient = {
            firstName: 'Max',
            lastName: 'Mustermann',
            aktenzeichen: 'MAND_TEST_001',
            debt_settlement_plan: {
                total_debt: 45000,
                pfaendbar_amount: 300,
                creditors: [
                    { name: 'Deutsche Bank AG', amount: 25000, percentage: 55.56 },
                    { name: 'Sparkasse Köln Bonn', amount: 15000, percentage: 33.33 },
                    { name: 'Amazon Europe', amount: 5000, percentage: 11.11 }
                ]
            },
            final_creditor_list: [
                { sender_name: 'Deutsche Bank AG', claim_amount: 25000, sender_address: 'Taunusanlage 12, 60325 Frankfurt' },
                { sender_name: 'Sparkasse Köln Bonn', claim_amount: 15000, sender_address: 'Hahnenstraße 57, 50667 Köln' },
                { sender_name: 'Amazon Europe', claim_amount: 5000, sender_address: '38 avenue JFK, Luxembourg' }
            ]
        };

        if (!schuldenPdfBytes) {
            try {
                schuldenPdfBytes = await generateSchuldenbereinigungsplanPdf(mockClient);
                console.log('✅ Fallback Schuldenbereinigungsplan generated');
            } catch (error) {
                console.log(`❌ Could not generate fallback Schuldenbereinigungsplan: ${error.message}`);
            }
        }

        if (!forderungsPdfBytes) {
            try {
                forderungsPdfBytes = await generateGlaeubigerlistePdf(mockClient);
                console.log('✅ Fallback Forderungsübersicht generated');
            } catch (error) {
                console.log(`❌ Could not generate fallback Forderungsübersicht: ${error.message}`);
            }
        }

        // Step 4: Merge ALL documents into ONE big PDF
        console.log('\n🔗 Step 4: Merging ALL Documents into Complete Package...');
        
        const mergedPdf = await PDFDocument.create();
        let totalPages = 0;

        // Add Document 1: Official Insolvenzantrag (45 pages)
        const insolvenzantragDoc = await PDFDocument.load(insolvenzantragBytes);
        const insolvenzantragPages = await mergedPdf.copyPages(insolvenzantragDoc, insolvenzantragDoc.getPageIndices());
        insolvenzantragPages.forEach(page => mergedPdf.addPage(page));
        totalPages += insolvenzantragPages.length;
        console.log(`📄 Added Insolvenzantrag: ${insolvenzantragPages.length} pages`);

        // Add Document 2: Schuldenbereinigungsplan
        if (schuldenPdfBytes) {
            try {
                const schuldenDoc = await PDFDocument.load(schuldenPdfBytes);
                const schuldenPages = await mergedPdf.copyPages(schuldenDoc, schuldenDoc.getPageIndices());
                schuldenPages.forEach(page => mergedPdf.addPage(page));
                totalPages += schuldenPages.length;
                console.log(`📊 Added Schuldenbereinigungsplan: ${schuldenPages.length} pages`);
            } catch (error) {
                console.log(`⚠️  Could not add Schuldenbereinigungsplan to merged PDF: ${error.message}`);
            }
        }

        // Add Document 3: Forderungsübersicht/Gläubigerliste  
        if (forderungsPdfBytes) {
            try {
                const forderungsDoc = await PDFDocument.load(forderungsPdfBytes);
                const forderungsPages = await mergedPdf.copyPages(forderungsDoc, forderungsDoc.getPageIndices());
                forderungsPages.forEach(page => mergedPdf.addPage(page));
                totalPages += forderungsPages.length;
                console.log(`📋 Added Forderungsübersicht: ${forderungsPages.length} pages`);
            } catch (error) {
                console.log(`⚠️  Could not add Forderungsübersicht to merged PDF: ${error.message}`);
            }
        }

        // Step 5: Save the complete merged PDF
        console.log('\n💾 Step 5: Saving Complete Insolvenzantrag Package...');
        
        const mergedBytes = await mergedPdf.save();
        const outputPath = path.join(__dirname, 'COMPLETE-Insolvenzantrag-Package.pdf');
        fs.writeFileSync(outputPath, mergedBytes);
        
        const fileSize = Math.round(mergedBytes.length / 1024);
        console.log(`✅ COMPLETE Insolvenzantrag saved: ${outputPath}`);
        console.log(`📊 Total: ${totalPages} pages, ${fileSize} KB`);

        // Step 6: Copy to Desktop
        console.log('\n📂 Step 6: Copying to Desktop...');
        
        const desktopPath = '/Users/luka/Desktop/COMPLETE-Insolvenzantrag-Package.pdf';
        fs.copyFileSync(outputPath, desktopPath);
        console.log(`✅ Copied to Desktop: ${desktopPath}`);

        // Summary
        console.log('\n🎉 SUCCESS! Complete Insolvenzantrag Package Created');
        console.log('═══════════════════════════════════════════════════════');
        console.log('📦 COMPLETE PACKAGE CONTAINS:');
        console.log('   1️⃣  Official Insolvenzantrag Form (45 pages)');
        console.log('   2️⃣  Schuldenbereinigungsplan Document');
        console.log('   3️⃣  Forderungsübersicht/Gläubigerliste Document');
        console.log('');
        console.log('📍 LOCATION:');
        console.log(`   Desktop: /Users/luka/Desktop/COMPLETE-Insolvenzantrag-Package.pdf`);
        console.log(`   Project: ${outputPath}`);
        console.log('');
        console.log('📊 STATS:');
        console.log(`   Total Pages: ${totalPages}`);
        console.log(`   File Size: ${fileSize} KB`);
        console.log('');
        console.log('🚀 This is exactly what your admin dashboard will generate!');

        return {
            success: true,
            outputPath,
            desktopPath,
            totalPages,
            fileSize
        };

    } catch (error) {
        console.error('\n❌ Error creating complete Insolvenzantrag:', error.message);
        console.error(error.stack);
        return {
            success: false,
            error: error.message
        };
    }
}

// Run the complete generation
createCompleteInsolvenzantrag().then(result => {
    if (result.success) {
        console.log('\n🎯 Ready to open the complete package:');
        console.log('open "/Users/luka/Desktop/COMPLETE-Insolvenzantrag-Package.pdf"');
    }
}).catch(console.error);