const mammoth = require('mammoth');
const cheerio = require('cheerio');
const fs = require('fs').promises;

async function testTableDetection() {
    try {
        console.log('🔍 Testing table detection...');
        
        // Test with a known DOCX file
        const docxPath = '/Users/adeel/mandanten-portal/server/documents/Ratenplan-Pfaendbares-Einkommen_12345_2025-10-02.docx';
        
        console.log(`📄 Testing with: ${docxPath}`);
        
        // Read and convert DOCX
        const docxBuffer = await fs.readFile(docxPath);
        const result = await mammoth.convertToHtml({ buffer: docxBuffer });
        const html = result.value;
        
        console.log('📝 HTML length:', html.length);
        console.log('📝 HTML preview:', html.substring(0, 1000));
        
        // Parse with cheerio
        const $ = cheerio.load(html);
        
        // Check for tables
        const tables = [];
        console.log('🔍 Looking for tables in HTML...');
        $('table').each((index, table) => {
            console.log(`📊 Found table ${index + 1}`);
            const tableData = [];
            $(table).find('tr').each((rowIndex, row) => {
                const rowData = [];
                $(row).find('td, th').each((cellIndex, cell) => {
                    const cellText = $(cell).text().trim();
                    // Check if this is a header row (first row) or if cell contains bold text
                    const isHeader = $(cell).is('th') || 
                                   rowIndex === 0 || 
                                   $(cell).find('strong, b').length > 0 ||
                                   $(cell).html().includes('<strong>') ||
                                   $(cell).html().includes('<b>');
                    rowData.push({ text: cellText, isHeader });
                });
                if (rowData.length > 0) {
                    tableData.push(rowData);
                }
            });
            if (tableData.length > 0) {
                tables.push(tableData);
                console.log(`✅ Table ${index + 1} has ${tableData.length} rows`);
            }
        });
        
        console.log(`📊 Total tables extracted: ${tables.length}`);
        
        if (tables.length > 0) {
            console.log('✅ Table detection is working!');
            console.log('📋 First table preview:');
            const firstTable = tables[0];
            firstTable.slice(0, 3).forEach((row, rowIndex) => {
                console.log(`  Row ${rowIndex}:`, row.map(cell => `"${cell.text}" (${cell.isHeader ? 'header' : 'data'})`).join(' | '));
            });
        } else {
            console.log('❌ No tables detected');
        }
        
    } catch (error) {
        console.error('❌ Error:', error.message);
    }
}

testTableDetection();
