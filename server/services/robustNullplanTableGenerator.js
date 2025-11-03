const fs = require('fs');
const path = require('path');
const JSZip = require('jszip');

/**
 * Robust Nullplan Table Generator
 * Uses exact XML patterns identified from template analysis
 */
class RobustNullplanTableGenerator {
    constructor() {
        this.templatePath = path.join(__dirname, '../templates/Nullplan_Table_Template_New.docx');
        this.outputDir = path.join(__dirname, '../documents');
        
        // Create output directory if it doesn't exist
        if (!fs.existsSync(this.outputDir)) {
            fs.mkdirSync(this.outputDir, { recursive: true });
        }

        // Template mappings for literal text replacement
        this.templateMapping = {
            // Replace hardcoded client name
            "okla test": "CLIENT_NAME",
            // Replace hardcoded date
            "16.10.2025": "TODAY_DATE",
            // Replace hardcoded start date
            "16.1.2026": "START_DATE"
        };
    }

    /**
     * Generate Nullplan quota table document using robust pattern matching
     */
    async generateNullplanTable(clientData, creditorData) {
        try {
            console.log('═══════════════════════════════════════════════════════════════');
            console.log('🚀 [ROBUST] TABLE GENERATION FUNCTION CALLED');
            console.log('═══════════════════════════════════════════════════════════════');
            console.log('📊 [ROBUST] Generating Nullplan quota table document...');
            console.log('');
            
            // LOG INPUT DATA
            console.log('📥 [ROBUST] INPUT DATA RECEIVED:');
            console.log('   📋 Client Data:');
            console.log('      - aktenzeichen:', clientData?.aktenzeichen || clientData?.reference || 'NOT PROVIDED');
            console.log('      - fullName:', clientData?.fullName || 'NOT PROVIDED');
            console.log('      - firstName:', clientData?.firstName || 'NOT PROVIDED');
            console.log('      - lastName:', clientData?.lastName || 'NOT PROVIDED');
            console.log('      - Full clientData object:', JSON.stringify(clientData, null, 6));
            console.log('');
            console.log('   👥 Creditor Data:');
            console.log('      - Number of creditors:', creditorData?.length || 0);
            if (creditorData && creditorData.length > 0) {
                creditorData.forEach((creditor, idx) => {
                    console.log(`      - Creditor ${idx + 1}:`);
                    console.log('         * creditor_name:', creditor.creditor_name || creditor.name || creditor.sender_name || 'NOT PROVIDED');
                    console.log('         * debt_amount:', creditor.debt_amount || creditor.final_amount || creditor.amount || 0);
                    console.log('         * Full creditor object:', JSON.stringify(creditor, null, 8));
                });
            } else {
                console.log('      ⚠️ WARNING: No creditor data provided!');
            }
            console.log('');
            
            if (!fs.existsSync(this.templatePath)) {
                console.error(`❌ [ROBUST] Template not found: ${this.templatePath}`);
                throw new Error(`Nullplan table template not found: ${this.templatePath}`);
            }
            console.log(`✅ [ROBUST] Template file exists: ${this.templatePath}`);

            // Load the template
            console.log('📂 [ROBUST] Loading template file...');
            const templateBuffer = fs.readFileSync(this.templatePath);
            console.log(`   ✅ Template loaded: ${Math.round(templateBuffer.length / 1024)} KB`);
            
            console.log('📦 [ROBUST] Extracting ZIP archive...');
            const zip = await JSZip.loadAsync(templateBuffer);
            console.log('   ✅ ZIP archive extracted');
            
            console.log('📄 [ROBUST] Reading word/document.xml...');
            const documentXml = await zip.file('word/document.xml').async('string');
            console.log(`   ✅ Document XML loaded: ${documentXml.length} characters`);
            console.log(`   📊 XML preview (first 500 chars): ${documentXml.substring(0, 500)}...`);
            console.log('');

            console.log('📄 [ROBUST] Template loaded, processing data...');
            
            // Calculate quotas and prepare replacements
            console.log('🔄 [ROBUST] Preparing table replacements...');
            const replacements = this.prepareTableReplacements(clientData, creditorData);
            
            console.log(`🔄 [ROBUST] Applying table replacements: ${Object.keys(replacements).length} variables`);

            // Replace variables in the document XML using robust pattern matching
            let processedXml = documentXml;
            let totalReplacements = 0;

            // Apply literal text replacements
            Object.entries(this.templateMapping).forEach(([oldText, placeholder]) => {
                if (processedXml.includes(`<w:t>${oldText}</w:t>`)) {
                    let newText = '';
                    switch(placeholder) {
                        case 'CLIENT_NAME':
                            newText = clientData.fullName || `${clientData.firstName || ''} ${clientData.lastName || ''}`.trim() || 'Max Mustermann';
                            break;
                        case 'TODAY_DATE':
                            newText = new Date().toLocaleDateString('de-DE');
                            break;
                        case 'START_DATE':
                            const startDate = new Date();
                            startDate.setMonth(startDate.getMonth() + 3);
                            newText = startDate.toLocaleDateString('de-DE');
                            break;
                        default:
                            newText = oldText;
                    }
                    processedXml = processedXml.replace(`<w:t>${oldText}</w:t>`, `<w:t>${newText}</w:t>`);
                    console.log(`✅ [ROBUST] Literal text replaced: "${oldText}" → "${newText}"`);
                    totalReplacements++;
                } else {
                    console.log(`⚠️ [ROBUST] Literal text not found: "${oldText}"`);
                }
            });
            
            console.log(`✅ [ROBUST] Total replacements made: ${totalReplacements}`);
            
            // Also replace simple quoted variables (for creditor data)
            Object.entries(replacements).forEach(([variable, value]) => {
                // Skip already processed XML-split patterns
                if (!this.templateMapping[variable]) {
                    const quotedVariable = `&quot;${variable}&quot;`;
                    if (processedXml.includes(quotedVariable)) {
                        processedXml = processedXml.replace(new RegExp(this.escapeRegex(quotedVariable), 'g'), value);
                        console.log(`✅ [ROBUST] Simple variable replaced: "${variable}"`);
                        totalReplacements++;
                    }
                }
            });
            
            console.log(`✅ [ROBUST] Total replacements after simple variables: ${totalReplacements}`);
            
            // Always populate table rows with creditor data for new template
            console.log('');
            console.log('═══════════════════════════════════════════════════════════════');
            console.log('🔄 [ROBUST] STARTING TABLE ROW POPULATION');
            console.log('═══════════════════════════════════════════════════════════════');
            console.log('🔄 [ROBUST] Populating table rows with creditor data...');
            console.log(`   📊 XML length before population: ${processedXml.length} characters`);
            processedXml = this.populateTableRows(processedXml, creditorData);
            console.log(`   📊 XML length after population: ${processedXml.length} characters`);
            console.log('✅ [ROBUST] Table row population completed');
            console.log('');

            // Update the document XML in the zip
            console.log('💾 [ROBUST] Updating document XML in ZIP archive...');
            zip.file('word/document.xml', processedXml);
            console.log('   ✅ Document XML updated in ZIP');

            // Generate output
            console.log('📦 [ROBUST] Generating final DOCX file...');
            const outputBuffer = await zip.generateAsync({ type: 'nodebuffer' });
            const filename = `Schuldenbereinigungsplan_${clientData?.aktenzeichen || clientData?.reference}_${new Date().toISOString().split('T')[0]}.docx`;
            const outputPath = path.join(this.outputDir, filename);
            
            console.log(`   📁 Output path: ${outputPath}`);
            fs.writeFileSync(outputPath, outputBuffer);
            console.log('   ✅ File written to disk');

            console.log('');
            console.log('═══════════════════════════════════════════════════════════════');
            console.log('✅ [ROBUST] Nullplan table document generated successfully');
            console.log('═══════════════════════════════════════════════════════════════');
            console.log(`📁 File: ${filename}`);
            console.log(`📊 Size: ${Math.round(outputBuffer.length / 1024)} KB`);
            console.log(`📂 Path: ${outputPath}`);
            console.log('');

            return {
                success: true,
                filename: filename,
                path: outputPath,
                size: outputBuffer.length
            };

        } catch (error) {
            console.error('❌ [ROBUST] Error generating Nullplan table:', error.message);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Prepare all table replacements with robust data handling
     */
    prepareTableReplacements(clientData, creditorData) {
        console.log('📊 [ROBUST] prepareTableReplacements() called');
        console.log('   📥 Input clientData:', JSON.stringify(clientData, null, 6));
        console.log('   📥 Input creditorData:', JSON.stringify(creditorData, null, 6));
        
        // Calculate total debt
        console.log('💰 [ROBUST] Calculating total debt from creditors...');
        const totalDebt = creditorData.reduce((sum, creditor, idx) => {
            const debt = creditor.debt_amount || creditor.final_amount || creditor.amount || 0;
            console.log(`      - Creditor ${idx + 1}: ${debt} EUR`);
            return sum + debt;
        }, 0);

        console.log(`💰 [ROBUST] Total debt calculated: ${this.formatGermanCurrency(totalDebt)} from ${creditorData.length} creditors`);

        // Client name
        const clientName = clientData.fullName || `${clientData.firstName || ''} ${clientData.lastName || ''}`.trim() || 'Max Mustermann';
        console.log(`👤 [ROBUST] Client name extracted: "${clientName}"`);

        // Replacements for the new template - will be handled by populateTableRows
        const replacements = {};

        console.log('📋 [ROBUST] Table replacements prepared:');
        if (Object.keys(replacements).length === 0) {
            console.log('   ℹ️ No variable replacements (will be handled by populateTableRows)');
        } else {
        Object.entries(replacements).forEach(([key, value]) => {
            console.log(`   "${key}" → "${value}"`);
        });
        }

        return replacements;
    }

    /**
     * Calculate start date (3 months from now)
     */
    calculateStartDate() {
        const startDate = new Date();
        startDate.setMonth(startDate.getMonth() + 3);
        return startDate.toLocaleDateString('de-DE');
    }

    /**
     * Format number as German currency without symbol
     */
    formatGermanCurrency(amount) {
        return new Intl.NumberFormat('de-DE', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        }).format(amount) + ' €';
    }
    
    /**
     * Format number as German currency without symbol (for table cells)
     */
    formatGermanCurrencyNoSymbol(amount) {
        return new Intl.NumberFormat('de-DE', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        }).format(amount);
    }
    
    /**
     * Populate table rows with creditor data dynamically
     * IMPROVED: Better pattern matching and more reliable replacement
     */
    populateTableRows(documentXml, creditorData) {
        try {
            console.log('');
            console.log('═══════════════════════════════════════════════════════════════');
            console.log('🔄 [ROBUST] populateTableRows() FUNCTION CALLED');
            console.log('═══════════════════════════════════════════════════════════════');
            
            // LOG INPUT
            console.log('📥 [ROBUST] INPUT TO populateTableRows:');
            console.log(`   📄 XML length: ${documentXml.length} characters`);
            console.log(`   👥 Creditor data count: ${creditorData?.length || 0}`);
            console.log('   📋 Creditor data details:');
            creditorData.forEach((creditor, idx) => {
                console.log(`      Creditor ${idx + 1}:`);
                console.log(`         - creditor_name: ${creditor.creditor_name || creditor.name || creditor.sender_name || 'NOT FOUND'}`);
                console.log(`         - debt_amount: ${creditor.debt_amount || creditor.final_amount || creditor.amount || 0}`);
                console.log(`         - Full object: ${JSON.stringify(creditor, null, 8)}`);
            });
            console.log('');
            
            // Calculate total debt for quotas
            console.log('💰 [ROBUST] Calculating total debt for quota calculations...');
            const totalDebt = creditorData.reduce((sum, creditor, idx) => {
                const debt = creditor.debt_amount || creditor.final_amount || creditor.amount || 0;
                console.log(`   Creditor ${idx + 1}: ${debt} EUR (running total: ${sum + debt})`);
                return sum + debt;
            }, 0);
            console.log(`   ✅ Total debt: ${totalDebt} EUR`);
            console.log('');
            
            let result = documentXml;
            
            console.log(`📊 [ROBUST] Starting to populate ${creditorData.length} rows...`);
            console.log(`   📄 Working XML length: ${result.length} characters`);
            
            // First, let's find all table rows and see their structure
            console.log('🔍 [ROBUST] Searching for table rows in XML...');
            const tableRowMatches = result.match(/<w:tr[^>]*>[\s\S]*?<\/w:tr>/g);
            console.log(`📋 [ROBUST] Found ${tableRowMatches?.length || 0} table rows in template`);
            if (tableRowMatches && tableRowMatches.length > 0) {
                console.log('   📊 First row preview (first 300 chars):');
                console.log(`      ${tableRowMatches[0].substring(0, 300)}...`);
            }
            console.log('');
            
            // Replace placeholder text "Test 1" (or "Test 2", "Test 3", etc.) with actual creditor data
            // Process in REVERSE order to avoid conflicts when replacing
            const creditorsReverse = [...creditorData].reverse();
            creditorsReverse.forEach((creditor, reverseIndex) => {
                const index = creditorData.length - 1 - reverseIndex;
                const creditorNum = index + 1;
                
                console.log('');
                console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
                console.log(`🔄 [ROBUST] PROCESSING ROW ${creditorNum} / ${creditorData.length}`);
                console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
                
                // Extract creditor data
                console.log(`📋 [ROBUST] Extracting data for row ${creditorNum}:`);
                console.log(`   Raw creditor object: ${JSON.stringify(creditor, null, 6)}`);
                
                const creditorName = creditor.creditor_name || creditor.name || creditor.sender_name || `Gläubiger ${creditorNum}`;
                const creditorAmount = creditor.debt_amount || creditor.final_amount || creditor.amount || 0;
                const creditorQuote = totalDebt > 0 ? (creditorAmount / totalDebt) * 100 : 0;
                
                console.log(`   ✅ Extracted values:`);
                console.log(`      - creditor_name: "${creditorName}"`);
                console.log(`      - debt_amount: ${creditorAmount} EUR`);
                console.log(`      - quote: ${creditorQuote.toFixed(2)}% (${creditorAmount} / ${totalDebt} * 100)`);
                console.log(`      - formatted_amount: "${this.formatGermanCurrencyNoSymbol(creditorAmount)}"`);
                console.log(`      - formatted_quote: "${creditorQuote.toFixed(2).replace('.', ',')}%"`);
                
                console.log(`🔄 [ROBUST] Processing row ${creditorNum}: ${creditorName} (${this.formatGermanCurrencyNoSymbol(creditorAmount)}, ${creditorQuote.toFixed(2).replace('.', ',')}%)`);
                
                // Strategy 1: Find the row that contains the row number (first cell)
                // Look for pattern: <w:t>N</w:t> where N is the row number
                const rowNumberPattern = `<w:t>${creditorNum}</w:t>`;
                
                console.log(`🔍 [ROBUST] Searching for row number pattern: "${rowNumberPattern}"`);
                const rowNumberFound = result.includes(rowNumberPattern);
                console.log(`   ${rowNumberFound ? '✅' : '❌'} Row number ${creditorNum} ${rowNumberFound ? 'FOUND' : 'NOT FOUND'} in document`);
                
                if (!rowNumberFound) {
                    console.log(`   ❌ Row number ${creditorNum} not found in document! Skipping this row.`);
                    console.log(`   🔍 Checking for alternative patterns...`);
                    // Check for row number in different formats
                    const altPatterns = [
                        `<w:t>${creditorNum.toString().padStart(2, '0')}</w:t>`,
                        `<w:t xml:space="preserve">${creditorNum}</w:t>`,
                        `>${creditorNum}<`
                    ];
                    altPatterns.forEach((pattern, idx) => {
                        const found = result.includes(pattern);
                        console.log(`      Pattern ${idx + 1} "${pattern}": ${found ? 'FOUND' : 'NOT FOUND'}`);
                    });
                    return;
                }
                
                // PRIMARY APPROACH: Direct cell replacement - preserves XML structure
                // Find the row and replace text content in each cell while keeping <w:r> and <w:p> structure
                console.log(`🔍 [ROBUST] Starting direct cell-by-cell replacement for row ${creditorNum}...`);
                
                // Find the entire table row that contains this row number
                // The row number must be in the FIRST cell, not just anywhere in the row
                // Match data rows (those that likely have "Test" in them) but not header row
                // Strategy: Match row with number, but ensure it's not the header by checking it doesn't have "Nr." AND has "Test" or is a data row
                const rowRegex = new RegExp(`(<w:tr[^>]*>[\\s\\S]*?<w:tc[^>]*>[\\s\\S]*?<w:t>${creditorNum}</w:t>[\\s\\S]*?</w:tc>)(\\s*<w:tc[^>]*>[\\s\\S]*?</w:tc>)(\\s*<w:tc[^>]*>[\\s\\S]*?</w:tc>)(\\s*<w:tc[^>]*>[\\s\\S]*?</w:tc>)`, 'i');
                let rowMatch = result.match(rowRegex);
                
                // Filter out header row - check if match contains "Nr."
                if (rowMatch && rowMatch[0].includes('<w:t>Nr.</w:t>')) {
                    // Try to find another match - look for the NEXT occurrence
                    const afterFirstMatch = result.substring((rowMatch.index || 0) + rowMatch[0].length);
                    const nextMatch = afterFirstMatch.match(rowRegex);
                    if (nextMatch) {
                        // Adjust index to account for the part we skipped
                        const adjustedMatch = nextMatch;
                        adjustedMatch.index = (rowMatch.index || 0) + rowMatch[0].length + (nextMatch.index || 0);
                        rowMatch = adjustedMatch;
                    } else {
                        rowMatch = null; // No valid data row found
                    }
                }
                
                let replaced = false;
                
                if (rowMatch) {
                    console.log(`   ✅ Found table row ${creditorNum}`);
                    console.log(`   📊 Attempting to replace content in cells 2, 3, and 4...`);
                    
                    // Extract the 3 data cells (indices 2, 3, 4 in match array)
                    let cell2 = rowMatch[2]; // Creditor name cell
                    let cell3 = rowMatch[3]; // Amount cell
                    let cell4 = rowMatch[4]; // Quote cell
                    
                    // Helper function to replace ALL text content in a cell with new text
                    const replaceTextInCell = (cellXml, newText) => {
                        // Strategy: Find all <w:r> runs in the cell and replace them with a single run containing our text
                        
                        // Extract the first run's properties (if any) for formatting consistency
                        const firstRunMatch = cellXml.match(/<w:r([^>]*)>/);
                        const runProps = firstRunMatch ? firstRunMatch[1] : '';
                        
                        // Find all paragraphs in the cell
                        const paragraphRegex = /(<w:p[^>]*>)([\s\S]*?)(<\/w:p>)/g;
                        let replaced = cellXml;
                        let paragraphFound = false;
                        
                        // Process each paragraph
                        replaced = replaced.replace(paragraphRegex, (match, pOpen, pContent, pClose) => {
                            paragraphFound = true;
                            
                            // Extract paragraph properties (pPr) - keep them intact
                            const pPrMatch = pContent.match(/(<w:pPr[^>]*>[\s\S]*?<\/w:pPr>)/);
                            const pPr = pPrMatch ? pPrMatch[1] : '';
                            
                            // Remove all existing runs from paragraph content
                            // Keep only the paragraph properties and any other non-run content
                            const runsRemoved = pContent.replace(/<w:r[^>]*>[\s\S]*?<\/w:r>/g, '');
                            // Remove pPr if it was duplicated
                            const cleanedContent = runsRemoved.replace(pPr, '').replace(/^\s+|\s+$/g, '');
                            
                            // Create new single run with our text
                            const newRun = `<w:r${runProps}><w:t>${newText}</w:t></w:r>`;
                            
                            // Reconstruct paragraph: pOpen + pPr + newRun + pClose
                            return `${pOpen}${pPr}${newRun}${pClose}`;
                        });
                        
                        // If no paragraphs found, try simple text replacement
                        if (!paragraphFound) {
                            // Replace all <w:t> content
                            replaced = cellXml.replace(/<w:t>([^<]*)<\/w:t>/g, `<w:t>${newText}</w:t>`);
                        }
                        
                        return replaced;
                    };
                    
                    // Replace cell 2: Creditor name
                    const originalCell2 = cell2;
                    cell2 = replaceTextInCell(cell2, creditorName);
                    if (cell2 !== originalCell2) {
                        console.log(`   ✅ Cell 2 (creditor name) replaced: ${creditorName}`);
                    }
                    
                    // Replace cell 3: Amount
                    const formattedAmount = this.formatGermanCurrencyNoSymbol(creditorAmount);
                    const originalCell3 = cell3;
                    cell3 = replaceTextInCell(cell3, formattedAmount);
                    if (cell3 !== originalCell3) {
                        console.log(`   ✅ Cell 3 (amount) replaced: ${formattedAmount}`);
                    }
                    
                    // Replace cell 4: Quote
                    const formattedQuote = `${creditorQuote.toFixed(2).replace('.', ',')}%`;
                    const originalCell4 = cell4;
                    cell4 = replaceTextInCell(cell4, formattedQuote);
                    if (cell4 !== originalCell4) {
                        console.log(`   ✅ Cell 4 (quote) replaced: ${formattedQuote}`);
                    }
                    
                    // Reconstruct the row with replaced cells
                    const newRow = `${rowMatch[1]}${cell2}${cell3}${cell4}`;
                const beforeReplace = result;
                    
                    // Replace the specific row using the matched groups
                    // Use String.replace with the exact match to ensure proper replacement
                    // Escape special regex characters in the original row match
                    const originalRowMatch = rowMatch[0];
                    const escapedMatch = originalRowMatch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                    const specificRowRegex = new RegExp(escapedMatch, 'i');
                    
                    let replaceCount = 0;
                    result = result.replace(specificRowRegex, (match) => {
                        if (replaceCount === 0 && match.includes(`<w:t>${creditorNum}</w:t>`)) {
                            replaceCount++;
                            console.log(`   🔄 Replacing row ${creditorNum} (exact match)`);
                            console.log(`   📊 Original row length: ${match.length}`);
                            console.log(`   📊 New row length: ${newRow.length}`);
                            return newRow;
                        }
                        return match;
                    });
                    
                    // Verify the exact replacement happened
                    const stillHasOriginal = result.includes('Test ') && result.includes(`<w:t>${creditorNum}</w:t>`);
                    if (stillHasOriginal) {
                        console.warn(`   ⚠️ WARNING: Row ${creditorNum} still contains placeholder after replacement!`);
                        // Try one more time with a more aggressive approach
                        const moreSpecificRegex = new RegExp(`(<w:tr[^>]*>)([\\s\\S]*?<w:t>${creditorNum}</w:t>[\\s\\S]*?</w:tc>)([\\s\\S]*?<w:tc[^>]*>[\\s\\S]*?Test[\\s\\S]*?</w:tc>)([\\s\\S]*?<w:tc[^>]*>[\\s\\S]*?Test[\\s\\S]*?</w:tc>)([\\s\\S]*?<w:tc[^>]*>[\\s\\S]*?Test[\\s\\S]*?</w:tc>)`, 'i');
                        const retryMatch = result.match(moreSpecificRegex);
                        if (retryMatch) {
                            const retryRow = `${retryMatch[1]}${retryMatch[2]}${cell2}${cell3}${cell4}`;
                            result = result.replace(moreSpecificRegex, retryRow);
                            console.log(`   🔄 Retry replacement attempted for row ${creditorNum}`);
                        }
                    }
                    
                    // Verify the replacement actually happened
                    const replacementWorked = beforeReplace !== result && replaceCount > 0;
                    const hasNewData = result.includes(creditorName) || result.includes(formattedAmount) || result.includes(formattedQuote);
                    
                    if (replacementWorked) {
                        replaced = true;
                        console.log(`   ✅ Row ${creditorNum} replaced successfully with direct cell replacement`);
                        console.log(`   📊 XML changed: ${beforeReplace.length} → ${result.length} characters`);
                        console.log(`   📊 New data present: ${hasNewData ? '✅ YES' : '❌ NO'}`);
                        if (!hasNewData) {
                            console.warn(`   ⚠️ WARNING: Replacement happened but new data not found in XML!`);
                            console.warn(`   ⚠️ Checking for: "${creditorName}", "${formattedAmount}", "${formattedQuote}"`);
                        }
                    } else {
                        console.error(`   ❌ ERROR: Row replacement failed - XML unchanged or wrong row matched!`);
                        console.log(`   📊 Regex matched: ${!!rowMatch}`);
                        console.log(`   📊 Replacement count: ${replaceCount}`);
                        console.log(`   📊 Original row length: ${rowMatch ? rowMatch[0].length : 'N/A'}`);
                        console.log(`   📊 New row length: ${newRow.length}`);
                    }
                } else {
                    console.log(`   ❌ Could not find table row structure for row ${creditorNum}`);
                }
            });
            
            console.log('');
            console.log('═══════════════════════════════════════════════════════════════');
            console.log('🧹 [ROBUST] CLEANING UP EMPTY ROWS');
            console.log('═══════════════════════════════════════════════════════════════');
            
            // Remove rows that weren't populated (rows beyond the number of creditors)
            const rowsToRemove = Math.max(0, 8 - creditorData.length);
            console.log(`📊 [ROBUST] Will remove ${rowsToRemove} empty rows (rows ${creditorData.length + 1} to 8)`);
            
            for (let i = creditorData.length + 1; i <= 8; i++) {
                // Only remove rows that still contain placeholder text ("Test 1")
                // Don't remove rows that have been populated with actual data
                const emptyRowPattern = new RegExp(`<w:tr[^>]*>[\\s\\S]*?<w:t>${i}<\\/w:t>[\\s\\S]*?Test[\\s\\S]*?<\\/w:tr>`, 'i');
                const beforeRemoval = result;
                result = result.replace(emptyRowPattern, '');
                if (beforeRemoval !== result) {
                    console.log(`   ✓ [ROBUST] Removed empty row ${i}`);
                } else {
                    console.log(`   ℹ️ Row ${i} not found or already contains data (may have been removed already)`);
                }
            }
            
            // Final verification: Check that populated rows are still present
            console.log('');
            console.log('🔍 [ROBUST] Final verification after cleanup...');
            creditorData.forEach((creditor, idx) => {
                const rowNum = idx + 1;
                const name = creditor.creditor_name || creditor.name || creditor.sender_name || '';
                const amount = creditor.debt_amount || creditor.final_amount || creditor.amount || 0;
                const formattedAmount = this.formatGermanCurrencyNoSymbol(amount);
                
                // Check if row number is still present
                const hasRowNum = result.includes(`<w:t>${rowNum}</w:t>`);
                const hasName = result.includes(name);
                const hasAmount = result.includes(formattedAmount) || result.includes(amount.toString());
                
                // Find the actual row in XML
                const rowMatch = result.match(new RegExp(`<w:tr[^>]*>[\\s\\S]*?<w:t>${rowNum}</w:t>[\\s\\S]*?</w:tr>`, 'i'));
                const rowStillExists = !!rowMatch;
                const rowHasTest = rowMatch && rowMatch[0].includes('Test');
                
                console.log(`   Row ${rowNum}:`);
                console.log(`      Row number found: ${hasRowNum ? '✅' : '❌'}`);
                console.log(`      Row exists in XML: ${rowStillExists ? '✅' : '❌'}`);
                console.log(`      Name found: ${hasName ? '✅' : '❌'}`);
                console.log(`      Amount found: ${hasAmount ? '✅' : '❌'}`);
                if (rowMatch) {
                    console.log(`      Row contains "Test": ${rowHasTest ? '⚠️ YES (still has placeholder!)' : '✅ NO (placeholder replaced)'}`);
                }
            });
            
            console.log('');
            console.log('═══════════════════════════════════════════════════════════════');
            console.log(`✅ [ROBUST] COMPLETED POPULATING ${creditorData.length} CREDITOR ROWS`);
            console.log('═══════════════════════════════════════════════════════════════');
            console.log(`📊 Final XML length: ${result.length} characters`);
            console.log(`📊 Original XML length: ${documentXml.length} characters`);
            console.log(`📊 Difference: ${result.length - documentXml.length} characters`);
            
            // Verify creditor data is present in the final XML
            console.log('');
            console.log('🔍 [ROBUST] Verifying creditor data in final XML...');
            creditorData.forEach((creditor, idx) => {
                const name = creditor.creditor_name || creditor.name || creditor.sender_name || '';
                const amount = creditor.debt_amount || creditor.final_amount || creditor.amount || 0;
                const formattedAmount = this.formatGermanCurrencyNoSymbol(amount);
                const hasName = result.includes(name);
                const hasAmount = result.includes(formattedAmount) || result.includes(amount.toString());
                console.log(`   Creditor ${idx + 1} (${name.substring(0, 30)}...):`);
                console.log(`      Name found: ${hasName ? '✅ YES' : '❌ NO'}`);
                console.log(`      Amount found: ${hasAmount ? '✅ YES' : '❌ NO'}`);
            });
            console.log('');
            
            return result;
            
        } catch (error) {
            console.error('❌ [ROBUST] Error populating table rows:', error.message);
            console.error('   Stack:', error.stack);
            return documentXml;
        }
    }
    
    /**
     * Escape special regex characters
     */
    escapeRegex(string) {
        return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }
}

module.exports = RobustNullplanTableGenerator;