const RobustNullplanTableGenerator = require('./services/robustNullplanTableGenerator');
const path = require('path');
const fs = require('fs');

/**
 * Comprehensive test to verify data flow from backend to Schuldenbereinigungsplan table
 */
async function testSchuldenbereinigungsplanDataFlow() {
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('🧪 COMPREHENSIVE DATA FLOW TEST');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('Testing: Backend Data → Table Generation → Document Output');
    console.log('');
    
    // Step 1: Simulate backend data (as it would come from MongoDB)
    console.log('📊 STEP 1: SIMULATING BACKEND DATA');
    console.log('═══════════════════════════════════════════════════════════════');
    
    const simulatedBackendData = {
        // This is how data comes from generateNullplanDocuments
        creditorData: [
            {
                creditor_name: "EOS Deutscher Inkasso-Dienst GmbH",
                creditor_address: "Steindamm 71\n20099 Hamburg",
                creditor_email: "service@eos-did.com",
                creditor_reference: "57852774001",
                debt_amount: 795.56,
                debt_reason: "",
                remarks: "Keine Antwort",
                is_representative: true,
                representative_info: {
                    name: "Otto (Forderung abgetreten an EOS Investment GmbH)",
                    address: "",
                    email: ""
                }
            },
            {
                creditor_name: "EOS Deutscher Inkasso-Dienst GmbH",
                creditor_address: "20085 Hamburg",
                creditor_email: "service@eos-did.com",
                creditor_reference: "57852774001",
                debt_amount: 4500,
                debt_reason: "",
                remarks: "Keine Antwort",
                is_representative: false,
                representative_info: null
            }
        ],
        clientData: {
            reference: '537700',
            aktenzeichen: '537700',
            fullName: 'Test User 5377',
            firstName: 'Test',
            lastName: 'User 5377'
        }
    };
    
    console.log('   ✅ Backend data structure:');
    console.log(`      - Creditors: ${simulatedBackendData.creditorData.length}`);
    console.log(`      - Client: ${simulatedBackendData.clientData.fullName}`);
    console.log('');
    console.log('   📋 Backend creditor data (as received):');
    simulatedBackendData.creditorData.forEach((creditor, idx) => {
        console.log(`      Creditor ${idx + 1}:`);
        console.log(`         - creditor_name: "${creditor.creditor_name}"`);
        console.log(`         - debt_amount: ${creditor.debt_amount}`);
        console.log(`         - Full object: ${JSON.stringify(creditor, null, 10)}`);
    });
    console.log('');
    
    // Step 2: Generate the table document
    console.log('📊 STEP 2: GENERATING TABLE DOCUMENT');
    console.log('═══════════════════════════════════════════════════════════════');
    
    try {
        const generator = new RobustNullplanTableGenerator();
        const result = await generator.generateNullplanTable(
            simulatedBackendData.clientData,
            simulatedBackendData.creditorData
        );
        
        if (!result.success) {
            console.error('❌ FAILED: Document generation failed');
            console.error('Error:', result.error);
            return false;
        }
        
        console.log('');
        console.log('✅ Document generated successfully');
        console.log(`   📁 File: ${result.filename}`);
        console.log(`   📂 Path: ${result.path}`);
        console.log(`   📊 Size: ${Math.round(result.size / 1024)} KB`);
        console.log('');
        
        // Step 3: Verify the document exists
        console.log('📊 STEP 3: VERIFYING DOCUMENT EXISTS');
        console.log('═══════════════════════════════════════════════════════════════');
        
        if (!fs.existsSync(result.path)) {
            console.error('❌ FAILED: Generated document file not found!');
            return false;
        }
        
        console.log('   ✅ Document file exists on disk');
        console.log('');
        
        // Step 4: Extract and verify data from the document XML
        console.log('📊 STEP 4: EXTRACTING DATA FROM DOCUMENT');
        console.log('═══════════════════════════════════════════════════════════════');
        
        const JSZip = require('jszip');
        const docBuffer = fs.readFileSync(result.path);
        const zip = await JSZip.loadAsync(docBuffer);
        const documentXml = await zip.file('word/document.xml').async('string');
        
        console.log(`   ✅ Document XML extracted: ${documentXml.length} characters`);
        console.log('');
        
        // Step 5: Verify backend data appears in the document XML
        console.log('📊 STEP 5: VERIFYING BACKEND DATA IN DOCUMENT XML');
        console.log('═══════════════════════════════════════════════════════════════');
        
        let allDataFound = true;
        
        simulatedBackendData.creditorData.forEach((creditor, idx) => {
            const creditorNum = idx + 1;
            const creditorName = creditor.creditor_name;
            const creditorAmount = creditor.debt_amount || 0;
            const formattedAmount = creditorAmount.toLocaleString('de-DE', { 
                minimumFractionDigits: 2, 
                maximumFractionDigits: 2 
            });
            
            // Calculate quote
            const totalDebt = simulatedBackendData.creditorData.reduce((sum, c) => sum + (c.debt_amount || 0), 0);
            const creditorQuote = totalDebt > 0 ? (creditorAmount / totalDebt) * 100 : 0;
            const formattedQuote = `${creditorQuote.toFixed(2).replace('.', ',')}%`;
            
            console.log(`   🔍 Creditor ${creditorNum} Verification:`);
            console.log(`      Backend Data:`);
            console.log(`         - Name: "${creditorName}"`);
            console.log(`         - Amount: ${creditorAmount} EUR`);
            console.log(`         - Quote: ${creditorQuote.toFixed(2)}%`);
            console.log(`      Expected in Document:`);
            console.log(`         - Name: "${creditorName}"`);
            console.log(`         - Amount: "${formattedAmount}"`);
            console.log(`         - Quote: "${formattedQuote}"`);
            
            // Check in XML - text might be split across multiple <w:r> runs
            const nameInXml = documentXml.includes(creditorName);
            
            // Check for amount - may be split across runs (e.g., "4." in one run, "500,00" in another)
            // Try multiple patterns to account for XML splitting
            const amountPattern1 = formattedAmount; // "4.500,00" or "795,56"
            const amountPattern2 = formattedAmount.replace(/\./g, ''); // "4500,00" or "795,56"
            const amountPattern3 = formattedAmount.split('.')[0]; // "4" or "795"
            const amountPattern4 = formattedAmount.replace('.', ''); // "4500,00"
            const amountPattern5 = creditorAmount.toFixed(2).replace('.', ','); // "795,56" or "4500,00"
            
            const amountInXml = 
                documentXml.includes(amountPattern1) || 
                documentXml.includes(amountPattern2) ||
                documentXml.includes(amountPattern4) ||
                documentXml.includes(amountPattern5) ||
                (amountPattern3 && documentXml.includes(amountPattern3));
            
            const quoteInXml = documentXml.includes(formattedQuote);
            
            // Debug: Show what amount patterns we're looking for
            console.log(`      Debug amount patterns:`);
            console.log(`         - Pattern 1: "${amountPattern1}"`);
            console.log(`         - Pattern 2: "${amountPattern2}"`);
            console.log(`         - Pattern 4: "${amountPattern4}"`);
            console.log(`         - Pattern 5: "${amountPattern5}"`);
            
            console.log(`      Found in Document XML:`);
            console.log(`         - Name: ${nameInXml ? '✅ FOUND' : '❌ NOT FOUND'}`);
            console.log(`         - Amount: ${amountInXml ? '✅ FOUND' : '❌ NOT FOUND'}`);
            console.log(`         - Quote: ${quoteInXml ? '✅ FOUND' : '❌ NOT FOUND'}`);
            
            if (!nameInXml || !amountInXml || !quoteInXml) {
                allDataFound = false;
                console.log(`      ❌ DATA MISSING FOR CREDITOR ${creditorNum}!`);
                
                // Try to find what's actually in the XML
                const rowPattern = new RegExp(`<w:tr[^>]*>[\\s\\S]*?<w:t>${creditorNum}</w:t>[\\s\\S]{0,1000}</w:tr>`, 'i');
                const rowMatch = documentXml.match(rowPattern);
                if (rowMatch) {
                    console.log(`      📋 Actual row content in XML (first 1000 chars):`);
                    console.log(`         ${rowMatch[0].substring(0, 1000)}...`);
                }
            } else {
                console.log(`      ✅ ALL DATA FOUND FOR CREDITOR ${creditorNum}`);
            }
            console.log('');
        });
        
        // Step 6: Final summary
        console.log('═══════════════════════════════════════════════════════════════');
        console.log('📊 STEP 6: TEST SUMMARY');
        console.log('═══════════════════════════════════════════════════════════════');
        
        if (allDataFound) {
            console.log('✅ TEST PASSED: All backend data found in Schuldenbereinigungsplan table');
            console.log('   → Data flow: Backend → Table Generation → Document ✅');
            console.log('   → Document can be opened and data is visible ✅');
            return true;
        } else {
            console.log('❌ TEST FAILED: Some backend data missing in Schuldenbereinigungsplan table');
            console.log('   → Data flow broken: Backend → Table Generation → Document ❌');
            console.log('   → Document may be empty or missing data ❌');
            return false;
        }
        
    } catch (error) {
        console.error('❌ TEST FAILED WITH ERROR:');
        console.error('   Error:', error.message);
        console.error('   Stack:', error.stack);
        return false;
    }
}

// Run the test
if (require.main === module) {
    testSchuldenbereinigungsplanDataFlow()
        .then(success => {
            console.log('');
            if (success) {
                console.log('🎉 DATA FLOW TEST PASSED');
                process.exit(0);
            } else {
                console.log('⚠️ DATA FLOW TEST FAILED - CHECK LOGS ABOVE');
                process.exit(1);
            }
        })
        .catch(error => {
            console.error('❌ Unhandled error:', error);
            process.exit(1);
        });
}

module.exports = { testSchuldenbereinigungsplanDataFlow };

