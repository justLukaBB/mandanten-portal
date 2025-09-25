const { PDFDocument } = require('pdf-lib');
const fs = require('fs').promises;
const path = require('path');

class PDFAnalyzer {
    /**
     * Analyze PDF structure and extract form field information
     */
    static async analyzePDF(pdfPath) {
        try {
            console.log('🔍 Analyzing PDF structure...');
            
            const existingPdfBytes = await fs.readFile(pdfPath);
            const pdfDoc = await PDFDocument.load(existingPdfBytes);
            
            const analysis = {
                pageCount: pdfDoc.getPageCount(),
                hasForm: false,
                formFields: [],
                pages: []
            };
            
            // Check if PDF has a form
            try {
                const form = pdfDoc.getForm();
                const fields = form.getFields();
                
                analysis.hasForm = fields.length > 0;
                
                console.log(`📋 Found ${fields.length} form fields`);
                
                fields.forEach((field, index) => {
                    const fieldInfo = {
                        index: index,
                        name: field.getName(),
                        type: field.constructor.name,
                        isRequired: false,
                        defaultValue: null
                    };
                    
                    // Get field-specific information
                    try {
                        if (field.constructor.name === 'PDFTextField') {
                            fieldInfo.defaultValue = field.getText();
                            fieldInfo.maxLength = field.getMaxLength();
                            fieldInfo.isMultiline = field.isMultiline();
                            fieldInfo.isRequired = field.isRequired();
                        } else if (field.constructor.name === 'PDFCheckBox') {
                            fieldInfo.isChecked = field.isChecked();
                            fieldInfo.isRequired = field.isRequired();
                        } else if (field.constructor.name === 'PDFRadioGroup') {
                            fieldInfo.options = field.getOptions();
                            fieldInfo.selectedOption = field.getSelected();
                        } else if (field.constructor.name === 'PDFDropdown') {
                            fieldInfo.options = field.getOptions();
                            fieldInfo.selectedOption = field.getSelected();
                        }
                    } catch (fieldError) {
                        console.warn(`⚠️  Could not get details for field ${fieldInfo.name}:`, fieldError.message);
                    }
                    
                    analysis.formFields.push(fieldInfo);
                    
                    console.log(`  [${index}] ${fieldInfo.name} (${fieldInfo.type})`);
                });
                
            } catch (formError) {
                console.log('ℹ️  PDF has no interactive form fields');
                analysis.hasForm = false;
            }
            
            // Analyze pages
            const pages = pdfDoc.getPages();
            pages.forEach((page, pageIndex) => {
                const { width, height } = page.getSize();
                analysis.pages.push({
                    index: pageIndex,
                    width: width,
                    height: height,
                    rotation: page.getRotation()
                });
                
                console.log(`📄 Page ${pageIndex + 1}: ${width} x ${height}`);
            });
            
            return analysis;
            
        } catch (error) {
            console.error('❌ Error analyzing PDF:', error);
            throw new Error('Failed to analyze PDF structure');
        }
    }
    
    /**
     * Generate a mapping suggestion between HTML form fields and PDF fields
     */
    static generateFieldMapping(analysis, htmlFieldNames) {
        const mapping = {};
        const unmappedHtmlFields = [...htmlFieldNames];
        const unmappedPdfFields = [...analysis.formFields];
        
        console.log('🔗 Generating field mapping...');
        
        // Try to match fields by name similarity
        htmlFieldNames.forEach(htmlField => {
            const htmlFieldLower = htmlField.toLowerCase();
            
            // Look for exact matches first
            let pdfField = unmappedPdfFields.find(pdf => 
                pdf.name.toLowerCase() === htmlFieldLower
            );
            
            // If no exact match, look for partial matches
            if (!pdfField) {
                pdfField = unmappedPdfFields.find(pdf => {
                    const pdfFieldLower = pdf.name.toLowerCase();
                    return pdfFieldLower.includes(htmlFieldLower) || 
                           htmlFieldLower.includes(pdfFieldLower);
                });
            }
            
            if (pdfField) {
                mapping[htmlField] = pdfField.name;
                unmappedHtmlFields.splice(unmappedHtmlFields.indexOf(htmlField), 1);
                unmappedPdfFields.splice(unmappedPdfFields.indexOf(pdfField), 1);
                console.log(`  ✅ ${htmlField} → ${pdfField.name}`);
            } else {
                console.log(`  ❌ No match found for: ${htmlField}`);
            }
        });
        
        return {
            mapping,
            unmappedHtmlFields,
            unmappedPdfFields: unmappedPdfFields.map(f => f.name)
        };
    }
    
    /**
     * Create a comprehensive report
     */
    static async createAnalysisReport(pdfPath, htmlFieldNames = []) {
        const analysis = await this.analyzePDF(pdfPath);
        const fieldMapping = htmlFieldNames.length > 0 
            ? this.generateFieldMapping(analysis, htmlFieldNames)
            : null;
            
        const report = {
            timestamp: new Date().toISOString(),
            pdfFile: path.basename(pdfPath),
            analysis,
            fieldMapping
        };
        
        // Save report to file
        const reportPath = path.join(path.dirname(pdfPath), 'pdf-analysis-report.json');
        await fs.writeFile(reportPath, JSON.stringify(report, null, 2));
        
        console.log(`📊 Analysis report saved to: ${reportPath}`);
        
        return report;
    }
}

module.exports = PDFAnalyzer;