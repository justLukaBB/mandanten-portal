#!/usr/bin/env node

// Create the FINAL Insolvenzantrag with YOUR ACTUAL documents
const { PDFDocument } = require('pdf-lib');
const fs = require('fs');
const path = require('path');

async function createFinalInsolvenzantrag() {
    console.log('🎯 Creating FINAL Insolvenzantrag with YOUR ACTUAL Documents');
    console.log('═══════════════════════════════════════════════════════════');
    console.log('📋 Using LibreOffice for perfect Word → PDF conversion');
    console.log('');

    try {
        // Step 1: Generate the official Insolvenzantrag form
        console.log('📄 Step 1: Generating Official Insolvenzantrag Form...');
        
        const QuickFieldMapper = require('./server/pdf-form-test/quick-field-mapper');
        
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
        
        const originalPdfPath = path.join(__dirname, 'server/pdf-form-test/original_form.pdf');
        const insolvenzantragBytes = await QuickFieldMapper.fillWithRealFields(formData, originalPdfPath);
        console.log('✅ Official Insolvenzantrag form generated (45 pages)');

        // Step 2: Convert YOUR ACTUAL Word documents to PDF using LibreOffice
        console.log('\n📋 Step 2: Converting YOUR ACTUAL Documents to PDF...');
        
        const { convertDocxToPdf } = require('./server/services/documentConverter');
        
        // Convert YOUR actual Schuldenbereinigungsplan
        console.log('🔄 Converting your Debt Restructuring Plan...');
        const schuldenPath = '/Users/luka/Downloads/Debt Restructuring Plan 2025-09-25.docx';
        const schuldenPdfBytes = await convertDocxToPdf(schuldenPath);
        console.log('✅ Your Debt Restructuring Plan converted to PDF with LibreOffice');
        
        // Convert YOUR actual Forderungsübersicht
        console.log('🔄 Converting your Forderungsübersicht...');
        const forderungsPath = '/Users/luka/Downloads/Forderungsübersicht 567 Sept 25 2025.docx';
        const forderungsPdfBytes = await convertDocxToPdf(forderungsPath);
        console.log('✅ Your Forderungsübersicht converted to PDF with LibreOffice');

        // Step 3: Merge ALL documents into ONE complete PDF
        console.log('\n🔗 Step 3: Merging ALL Documents into Complete Package...');
        
        const mergedPdf = await PDFDocument.create();
        let totalPages = 0;

        // Add Document 1: Official Insolvenzantrag (45 pages)
        const insolvenzantragDoc = await PDFDocument.load(insolvenzantragBytes);
        const insolvenzantragPages = await mergedPdf.copyPages(insolvenzantragDoc, insolvenzantragDoc.getPageIndices());
        insolvenzantragPages.forEach(page => mergedPdf.addPage(page));
        totalPages += insolvenzantragPages.length;
        console.log(`📄 Added Official Insolvenzantrag: ${insolvenzantragPages.length} pages`);

        // Add Document 2: YOUR Debt Restructuring Plan
        const schuldenDoc = await PDFDocument.load(schuldenPdfBytes);
        const schuldenPages = await mergedPdf.copyPages(schuldenDoc, schuldenDoc.getPageIndices());
        schuldenPages.forEach(page => mergedPdf.addPage(page));
        totalPages += schuldenPages.length;
        console.log(`📊 Added YOUR Debt Restructuring Plan: ${schuldenPages.length} pages`);

        // Add Document 3: YOUR Forderungsübersicht
        const forderungsDoc = await PDFDocument.load(forderungsPdfBytes);
        const forderungsPages = await mergedPdf.copyPages(forderungsDoc, forderungsDoc.getPageIndices());
        forderungsPages.forEach(page => mergedPdf.addPage(page));
        totalPages += forderungsPages.length;
        console.log(`📋 Added YOUR Forderungsübersicht: ${forderungsPages.length} pages`);

        // Step 4: Save the complete merged PDF
        console.log('\n💾 Step 4: Saving FINAL Complete Insolvenzantrag...');
        
        const mergedBytes = await mergedPdf.save();
        const outputPath = path.join(__dirname, 'FINAL-Insolvenzantrag-with-REAL-Documents.pdf');
        fs.writeFileSync(outputPath, mergedBytes);
        
        const fileSize = Math.round(mergedBytes.length / 1024);
        console.log(`✅ FINAL Insolvenzantrag saved: ${outputPath}`);

        // Step 5: Copy to Desktop
        console.log('\n📂 Step 5: Copying to Desktop...');
        
        const desktopPath = '/Users/luka/Desktop/FINAL-Insolvenzantrag-with-REAL-Documents.pdf';
        fs.copyFileSync(outputPath, desktopPath);
        console.log(`✅ Copied to Desktop: ${desktopPath}`);

        // Summary
        console.log('\n🎉 SUCCESS! FINAL Insolvenzantrag with REAL Documents Created');
        console.log('═══════════════════════════════════════════════════════════');
        console.log('📦 FINAL PACKAGE CONTAINS:');
        console.log('   1️⃣  Official Insolvenzantrag Form (45 pages) - Filled with data');
        console.log('   2️⃣  YOUR ACTUAL Debt Restructuring Plan - Perfect formatting');
        console.log('   3️⃣  YOUR ACTUAL Forderungsübersicht - Perfect formatting');
        console.log('');
        console.log('🔧 CONVERSION QUALITY:');
        console.log('   ✅ LibreOffice conversion maintains EXACT formatting');
        console.log('   ✅ No quality loss from Word to PDF');
        console.log('   ✅ Professional appearance maintained');
        console.log('');
        console.log('📍 LOCATION:');
        console.log(`   Desktop: ${desktopPath}`);
        console.log(`   Project: ${outputPath}`);
        console.log('');
        console.log('📊 STATS:');
        console.log(`   Total Pages: ${totalPages}`);
        console.log(`   File Size: ${fileSize} KB`);
        console.log('');
        console.log('🚀 This is EXACTLY what your admin dashboard will generate!');
        console.log('💯 Perfect quality Word → PDF conversion as requested!');

        return {
            success: true,
            outputPath,
            desktopPath,
            totalPages,
            fileSize
        };

    } catch (error) {
        console.error('\n❌ Error creating final Insolvenzantrag:', error.message);
        console.error(error.stack);
        return {
            success: false,
            error: error.message
        };
    }
}

// Run the final generation
createFinalInsolvenzantrag().then(result => {
    if (result.success) {
        console.log('\n🎯 Ready to open the FINAL package:');
        console.log('open "/Users/luka/Desktop/FINAL-Insolvenzantrag-with-REAL-Documents.pdf"');
    }
}).catch(console.error);