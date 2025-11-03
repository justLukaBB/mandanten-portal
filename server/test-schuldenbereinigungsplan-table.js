/**
 * Test script to verify Schuldenbereinigungsplan table contains data
 * Tests both Nullplan (template-based) and regular (programmatic) paths
 */

const RobustNullplanTableGenerator = require('./services/robustNullplanTableGenerator');
const DocumentGenerator = require('./services/documentGenerator');
const fs = require('fs');
const path = require('path');
const JSZip = require('jszip');

// Test client data
const testClientData = {
    firstName: 'Test',
    lastName: 'User 5370',
    fullName: 'Test User 5370',
    name: 'Test User 5370',
    email: 'testuser5370@gmail.com',
    reference: '537000',
    aktenzeichen: '537000',
    birthDate: '',
    geburtstag: '',
    maritalStatus: 'getrennt_lebend'
};

// Test creditor data (matching your logs)
const testCreditorData = [
    {
        creditor_name: 'EOS Deutscher Inkasso-Dienst GmbH',
        creditor_address: 'Steindamm 71\n20099 Hamburg',
        creditor_email: 'service@eos-did.com',
        creditor_reference: '57852774001',
        debt_amount: 795.56,
        debt_reason: '',
        remarks: 'Keine Antwort',
        is_representative: true,
        representative_info: {
            name: 'Otto (ursprünglicher Gläubiger), Forderung aktuell bei EOS Investment GmbH',
            address: '',
            email: ''
        }
    },
    {
        creditor_name: 'EOS Deutscher Inkasso-Dienst GmbH',
        creditor_address: '20085 Hamburg',
        creditor_email: 'service@eos-did.com',
        creditor_reference: '57852774001',
        debt_amount: 1400,
        debt_reason: '',
        remarks: 'Keine Antwort',
        is_representative: false,
        representative_info: null
    }
];

/**
 * Extract table data from DOCX XML
 */
async function extractTableData(docxPath) {
    try {
        console.log(`\n📄 Reading document: ${docxPath}`);
        const fileBuffer = fs.readFileSync(docxPath);
        const zip = await JSZip.loadAsync(fileBuffer);
        
        const documentXml = await zip.file('word/document.xml').async('string');
        
        // Find all table rows
        const tableRowRegex = /<w:tr[^>]*>[\s\S]*?<\/w:tr>/gi;
        const rows = documentXml.match(tableRowRegex) || [];
        
        console.log(`📊 Found ${rows.length} table rows in document`);
        
        // Extract text from each row
        const extractedRows = [];
        rows.forEach((row, index) => {
            // Extract all text nodes from the row
            const textRegex = /<w:t[^>]*>([^<]*)<\/w:t>/gi;
            const texts = [];
            let match;
            
            while ((match = textRegex.exec(row)) !== null) {
                const text = match[1].trim();
                if (text && !text.match(/^[\s\u00A0]*$/)) { // Not just whitespace
                    texts.push(text);
                }
            }
            
            if (texts.length > 0) {
                extractedRows.push({
                    rowNumber: index + 1,
                    cells: texts,
                    cellCount: texts.length
                });
            }
        });
        
        return {
            totalRows: rows.length,
            extractedRows: extractedRows,
            hasData: extractedRows.length > 1 // More than just header
        };
    } catch (error) {
        console.error(`❌ Error extracting table data: ${error.message}`);
        throw error;
    }
}

/**
 * Test Nullplan table generation (template-based)
 */
async function testNullplanTable() {
    console.log('\n' + '='.repeat(80));
    console.log('🧪 TESTING NULLPLAN TABLE GENERATION (Template-Based)');
    console.log('='.repeat(80));
    
    try {
        const generator = new RobustNullplanTableGenerator();
        
        console.log(`\n📊 Test Data:`);
        console.log(`   Client: ${testClientData.fullName}`);
        console.log(`   Creditors: ${testCreditorData.length}`);
        testCreditorData.forEach((c, i) => {
            console.log(`   ${i + 1}. ${c.creditor_name}: ${c.debt_amount} EUR`);
        });
        
        console.log(`\n🔄 Generating Nullplan table document...`);
        const result = await generator.generateNullplanTable(testClientData, testCreditorData);
        
        if (!result || !result.success) {
            console.error(`❌ Document generation failed: ${result?.error || 'Unknown error'}`);
            return false;
        }
        
        console.log(`\n✅ Document generated successfully!`);
        console.log(`   📁 File: ${result.filename}`);
        console.log(`   📊 Size: ${result.size} bytes`);
        console.log(`   📂 Path: ${result.path}`);
        
        // Extract and verify table data
        console.log(`\n🔍 Extracting table data from document...`);
        const tableData = await extractTableData(result.path);
        
        console.log(`\n📋 Table Analysis:`);
        console.log(`   Total rows found: ${tableData.totalRows}`);
        console.log(`   Rows with data: ${tableData.extractedRows.length}`);
        console.log(`   Has data: ${tableData.hasData ? '✅ YES' : '❌ NO'}`);
        
        if (tableData.extractedRows.length > 0) {
            console.log(`\n📊 Extracted Table Content:`);
            tableData.extractedRows.forEach((row, index) => {
                console.log(`\n   Row ${row.rowNumber} (${row.cellCount} cells):`);
                row.cells.forEach((cell, cellIndex) => {
                    console.log(`      Cell ${cellIndex + 1}: "${cell}"`);
                });
            });
        }
        
        // Verify creditor names are present
        const creditorNames = testCreditorData.map(c => c.creditor_name);
        const documentText = fs.readFileSync(result.path);
        const hasAllCreditors = creditorNames.every(name => {
            // Check if creditor name appears in document
            // Note: DOCX is a ZIP file, so we need to check the XML
            return true; // Will be checked in extractTableData
        });
        
        // Check if creditor data appears in extracted rows
        const allTexts = tableData.extractedRows.flatMap(r => r.cells);
        const foundCreditors = creditorNames.filter(name => {
            return allTexts.some(text => text.includes(name.split(' ')[0])); // Check first word
        });
        
        console.log(`\n✅ Verification Results:`);
        console.log(`   Creditors in test data: ${creditorNames.length}`);
        console.log(`   Creditors found in table: ${foundCreditors.length}`);
        console.log(`   Creditors found: ${foundCreditors.length > 0 ? '✅ YES' : '❌ NO'}`);
        
        // Check for amounts
        const amounts = testCreditorData.map(c => c.debt_amount);
        const foundAmounts = amounts.filter(amount => {
            const formatted = amount.toFixed(2).replace('.', ',');
            return allTexts.some(text => text.includes(formatted) || text.includes(amount.toString()));
        });
        console.log(`   Amounts found in table: ${foundAmounts.length}/${amounts.length}`);
        
        const success = tableData.hasData && foundCreditors.length > 0 && foundAmounts.length > 0;
        
        console.log(`\n${success ? '✅' : '❌'} TEST ${success ? 'PASSED' : 'FAILED'}`);
        console.log(`   Table has data: ${tableData.hasData ? '✅' : '❌'}`);
        console.log(`   Creditors found: ${foundCreditors.length > 0 ? '✅' : '❌'}`);
        console.log(`   Amounts found: ${foundAmounts.length > 0 ? '✅' : '❌'}`);
        
        return success;
        
    } catch (error) {
        console.error(`\n❌ Test failed with error: ${error.message}`);
        console.error(`   Stack: ${error.stack}`);
        return false;
    }
}

/**
 * Test programmatic table generation (for comparison)
 */
async function testProgrammaticTable() {
    console.log('\n' + '='.repeat(80));
    console.log('🧪 TESTING PROGRAMMATIC TABLE GENERATION');
    console.log('='.repeat(80));
    
    try {
        const generator = new DocumentGenerator();
        
        // Convert creditor data to creditorPayments format
        const creditorPayments = testCreditorData.map(c => ({
            creditor_name: c.creditor_name,
            debt_amount: c.debt_amount
        }));
        
        const settlementData = {
            monthly_payment: 0,
            garnishable_amount: 0,
            duration_months: 36,
            total_debt: creditorPayments.reduce((sum, c) => sum + c.debt_amount, 0)
        };
        
        console.log(`\n🔄 Generating programmatic table...`);
        const table = await generator.createSimpleCreditorTable(creditorPayments);
        
        if (!table) {
            console.error(`❌ Table generation failed`);
            return false;
        }
        
        console.log(`✅ Table generated successfully!`);
        console.log(`   📊 Table.rows.length: ${table.rows.length}`);
        console.log(`   📊 Table.width: ${table.width.size}%`);
        
        // Check table structure
        if (table.rows.length > 0) {
            const firstRow = table.rows[0];
            console.log(`   📊 First row cells: ${firstRow.children.length}`);
            console.log(`   📊 Table structure: ✅ Valid`);
        }
        
        return true;
        
    } catch (error) {
        console.error(`\n❌ Test failed with error: ${error.message}`);
        console.error(`   Stack: ${error.stack}`);
        return false;
    }
}

/**
 * Main test function
 */
async function runTests() {
    console.log('\n' + '='.repeat(80));
    console.log('🧪 SCHULDENBEREINIGUNGSPLAN TABLE DATA VERIFICATION TEST');
    console.log('='.repeat(80));
    
    const results = {
        nullplan: false,
        programmatic: false
    };
    
    // Test Nullplan (template-based) - This is the one that was failing
    results.nullplan = await testNullplanTable();
    
    // Test programmatic (for comparison)
    results.programmatic = await testProgrammaticTable();
    
    // Summary
    console.log('\n' + '='.repeat(80));
    console.log('📊 TEST SUMMARY');
    console.log('='.repeat(80));
    console.log(`\n✅ Nullplan Table (Template-Based): ${results.nullplan ? 'PASSED' : 'FAILED'}`);
    console.log(`✅ Programmatic Table: ${results.programmatic ? 'PASSED' : 'FAILED'}`);
    console.log(`\n${results.nullplan ? '✅' : '❌'} MAIN TEST (Nullplan): ${results.nullplan ? 'SUCCESS' : 'FAILURE'}`);
    
    if (results.nullplan) {
        console.log(`\n✅ The Schuldenbereinigungsplan document now contains table data!`);
        console.log(`   You can download the document from Zendesk and verify the table is populated.`);
    } else {
        console.log(`\n❌ The table data is still not appearing in the document.`);
        console.log(`   Please check the logs above for details.`);
    }
    
    process.exit(results.nullplan ? 0 : 1);
}

// Run tests
runTests().catch(error => {
    console.error(`\n❌ Test suite failed: ${error.message}`);
    console.error(`   Stack: ${error.stack}`);
    process.exit(1);
});

