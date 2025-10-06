const mammoth = require('mammoth');
const cheerio = require('cheerio');
const fs = require('fs').promises;

async function debugTableConversion() {
    try {
        console.log('🔍 Debugging table conversion...');
        
        // Find a recent creditor package document
        const documentsDir = '/Users/adeel/mandanten-portal/server/documents';
        const files = await fs.readdir(documentsDir);
        const docxFiles = files.filter(f => f.endsWith('.docx'));
        
        if (docxFiles.length === 0) {
            console.log('❌ No DOCX files found in documents directory');
            return;
        }
        
        const latestDocx = 'Forderungsuebersicht_12345_2025-10-02.docx';
        const docxPath = `${documentsDir}/${latestDocx}`;
        
        console.log(`📄 Testing with: ${latestDocx}`);
        
        // Read and convert DOCX
        const docxBuffer = await fs.readFile(docxPath);
        const result = await mammoth.convertToHtml({ buffer: docxBuffer });
        const html = result.value;
        
        console.log('📝 HTML length:', html.length);
        console.log('📝 HTML preview:', html.substring(0, 500));
        
        // Parse with cheerio
        const $ = cheerio.load(html);
        
        // Check for tables
        const tables = [];
        $('table').each((index, table) => {
            console.log(`\n📊 Found table ${index + 1}:`);
            const tableData = [];
            $(table).find('tr').each((rowIndex, row) => {
                const rowData = [];
                $(row).find('td, th').each((cellIndex, cell) => {
                    const cellText = $(cell).text().trim();
                    const isHeader = $(cell).is('th');
                    rowData.push({ text: cellText, isHeader });
                    console.log(`  Cell [${rowIndex}][${cellIndex}]: "${cellText}" (${isHeader ? 'header' : 'data'})`);
                });
                if (rowData.length > 0) {
                    tableData.push(rowData);
                }
            });
            if (tableData.length > 0) {
                tables.push(tableData);
            }
        });
        
        console.log(`\n📊 Total tables found: ${tables.length}`);
        
        if (tables.length === 0) {
            console.log('❌ No tables detected in the document');
            console.log('🔍 Looking for table-like structures...');
            
            // Check for other table indicators
            const tableIndicators = ['<tr>', '<td>', '<th>', 'table'];
            tableIndicators.forEach(indicator => {
                const count = (html.match(new RegExp(indicator, 'gi')) || []).length;
                console.log(`  ${indicator}: ${count} occurrences`);
            });
        }
        
    } catch (error) {
        console.error('❌ Error:', error.message);
    }
}

debugTableConversion();
