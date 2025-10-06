const PDFAnalyzer = require('./pdf-analyzer');
const path = require('path');

// HTML form field names from our current form
const htmlFieldNames = [
    'vorname_name',
    'strasse_hausnummer', 
    'plz_ort',
    'telefon_tags',
    'verfahrensbevollmaechtigter',
    'amtsgericht_ort',
    'restschuldbefreiung_ja',
    'restschuldbefreiung_nein',
    'antrag_nicht_gestellt',
    'antrag_bereits_gestellt',
    'restschuld_erteilt',
    'restschuld_versagt',
    'versagung_rechtskraeftig',
    'versagung_fahrlässig'
];

async function main() {
    try {
        const pdfPath = path.join(__dirname, 'original_form.pdf');
        
        console.log('🚀 Starting PDF Analysis...');
        console.log('📁 PDF File:', pdfPath);
        console.log('📝 HTML Fields to map:', htmlFieldNames.length);
        console.log('');
        
        const report = await PDFAnalyzer.createAnalysisReport(pdfPath, htmlFieldNames);
        
        console.log('');
        console.log('📊 ANALYSIS SUMMARY:');
        console.log('===================');
        console.log(`Pages: ${report.analysis.pageCount}`);
        console.log(`Has Form Fields: ${report.analysis.hasForm ? 'Yes' : 'No'}`);
        console.log(`Form Fields Found: ${report.analysis.formFields.length}`);
        
        if (report.fieldMapping) {
            console.log(`Mapped Fields: ${Object.keys(report.fieldMapping.mapping).length}`);
            console.log(`Unmapped HTML Fields: ${report.fieldMapping.unmappedHtmlFields.length}`);
            console.log(`Unmapped PDF Fields: ${report.fieldMapping.unmappedPdfFields.length}`);
        }
        
        console.log('');
        console.log('✅ Analysis complete! Check pdf-analysis-report.json for details.');
        
    } catch (error) {
        console.error('❌ Analysis failed:', error.message);
        process.exit(1);
    }
}

if (require.main === module) {
    main();
}

module.exports = main;