#!/usr/bin/env node

// Analyze the PDF form fields to verify correct mapping
const { PDFDocument } = require('pdf-lib');
const fs = require('fs');
const path = require('path');

async function analyzePdfFields() {
    console.log('🔍 Analyzing PDF Form Fields for Correct Mapping');
    console.log('════════════════════════════════════════════════');
    
    try {
        const pdfPath = path.join(__dirname, 'pdf-form-test/original_form.pdf');
        const existingPdfBytes = await fs.promises.readFile(pdfPath);
        const pdfDoc = await PDFDocument.load(existingPdfBytes);
        const form = pdfDoc.getForm();
        
        const fields = form.getFields();
        console.log(`📋 Total form fields found: ${fields.length}\n`);
        
        console.log('📝 TEXT FIELDS:');
        console.log('───────────────');
        fields.forEach((field, index) => {
            if (field.constructor.name === 'PDFTextField') {
                console.log(`${index + 1}. ${field.getName()} (PDFTextField)`);
            }
        });
        
        console.log('\n✅ CHECKBOXES:');
        console.log('──────────────');
        fields.forEach((field, index) => {
            if (field.constructor.name === 'PDFCheckBox') {
                console.log(`${index + 1}. ${field.getName()} (PDFCheckBox)`);
            }
        });
        
        console.log('\n🎯 CURRENT MAPPING ANALYSIS:');
        console.log('───────────────────────────');
        
        const QuickFieldMapper = require('./pdf-form-test/quick-field-mapper');
        const currentMapping = QuickFieldMapper.getUpdatedFieldMapping();
        
        console.log('\n❌ CHECKING FOR MAPPING ERRORS:');
        console.log('──────────────────────────────');
        
        const fieldNames = fields.map(f => f.getName());
        let errorCount = 0;
        
        Object.entries(currentMapping).forEach(([dataField, pdfFieldName]) => {
            if (!fieldNames.includes(pdfFieldName)) {
                console.log(`❌ ERROR: "${pdfFieldName}" (mapped to ${dataField}) NOT FOUND in PDF`);
                errorCount++;
            } else {
                console.log(`✅ OK: "${pdfFieldName}" (${dataField}) exists`);
            }
        });
        
        console.log(`\n📊 SUMMARY:`);
        console.log(`   Total mappings: ${Object.keys(currentMapping).length}`);
        console.log(`   Valid mappings: ${Object.keys(currentMapping).length - errorCount}`);
        console.log(`   Invalid mappings: ${errorCount}`);
        
        if (errorCount > 0) {
            console.log('\n⚠️ RECOMMENDATION: Fix invalid field mappings before using!');
        } else {
            console.log('\n🎉 All field mappings are valid!');
        }
        
        // Show available unmapped fields
        console.log('\n📋 AVAILABLE UNMAPPED FIELDS:');
        console.log('────────────────────────────');
        const mappedFields = Object.values(currentMapping);
        const unmappedFields = fieldNames.filter(name => !mappedFields.includes(name));
        
        unmappedFields.forEach((fieldName, index) => {
            const field = fields.find(f => f.getName() === fieldName);
            console.log(`${index + 1}. ${fieldName} (${field.constructor.name})`);
        });
        
        return {
            totalFields: fields.length,
            totalMappings: Object.keys(currentMapping).length,
            validMappings: Object.keys(currentMapping).length - errorCount,
            invalidMappings: errorCount,
            unmappedFields: unmappedFields.length
        };
        
    } catch (error) {
        console.error('❌ Error analyzing PDF fields:', error);
        throw error;
    }
}

// Run the analysis
analyzePdfFields().then(result => {
    console.log('\n🔍 Analysis complete!');
}).catch(console.error);