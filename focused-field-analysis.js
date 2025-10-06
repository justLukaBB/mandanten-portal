#!/usr/bin/env node

// More focused analysis of first few pages field mappings
const { PDFDocument } = require('pdf-lib');
const fs = require('fs');
const path = require('path');

async function focusedFieldAnalysis() {
    console.log('🎯 Focused Analysis of First Pages Field Mappings');
    console.log('═════════════════════════════════════════════════');
    
    try {
        const pdfPath = path.join(__dirname, 'server/pdf-form-test/original_form.pdf');
        const existingPdfBytes = await fs.promises.readFile(pdfPath);
        const pdfDoc = await PDFDocument.load(existingPdfBytes);
        const form = pdfDoc.getForm();
        
        const fields = form.getFields();
        const fieldNames = fields.map(f => f.getName());
        
        console.log('🔍 CHECKING CURRENT MAPPINGS AGAINST ACTUAL PDF:');
        console.log('─────────────────────────────────────────────────');
        
        const QuickFieldMapper = require('./server/pdf-form-test/quick-field-mapper');
        const currentMapping = QuickFieldMapper.getUpdatedFieldMapping();
        
        const workingMappings = [];
        const brokenMappings = [];
        
        Object.entries(currentMapping).forEach(([dataField, pdfFieldName]) => {
            if (fieldNames.includes(pdfFieldName)) {
                workingMappings.push({ dataField, pdfFieldName });
                console.log(`✅ ${dataField} → ${pdfFieldName}`);
            } else {
                brokenMappings.push({ dataField, pdfFieldName });
                console.log(`❌ ${dataField} → ${pdfFieldName} (NOT FOUND)`);
            }
        });
        
        console.log('\n📊 SUMMARY:');
        console.log(`   ✅ Working mappings: ${workingMappings.length}`);
        console.log(`   ❌ Broken mappings: ${brokenMappings.length}`);
        
        if (brokenMappings.length > 0) {
            console.log('\n🔧 FIXING RECOMMENDATIONS:');
            console.log('────────────────────────');
            
            // Show first 50 available fields for reference
            console.log('\n📋 First 50 available fields for remapping:');
            fieldNames.slice(0, 50).forEach((name, index) => {
                const field = fields.find(f => f.getName() === name);
                const type = field.constructor.name === 'PDFTextField' ? 'TEXT' : 'CHECKBOX';
                console.log(`${index + 1}. ${name} (${type})`);
            });
            
            console.log('\n⚠️ BROKEN MAPPINGS TO FIX:');
            brokenMappings.forEach(({ dataField, pdfFieldName }) => {
                console.log(`   ${dataField}: '${pdfFieldName}' → Need to find correct field`);
            });
        }
        
        console.log('\n✅ WORKING MAPPINGS (KEEP THESE):');
        workingMappings.forEach(({ dataField, pdfFieldName }) => {
            console.log(`   ${dataField}: '${pdfFieldName}'`);
        });
        
        return {
            workingCount: workingMappings.length,
            brokenCount: brokenMappings.length,
            workingMappings,
            brokenMappings
        };
        
    } catch (error) {
        console.error('❌ Error in focused analysis:', error);
        throw error;
    }
}

// Run the focused analysis
focusedFieldAnalysis().then(result => {
    console.log('\n🎯 Analysis complete! Fix the broken mappings above.');
}).catch(console.error);