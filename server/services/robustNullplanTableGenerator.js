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
            creditorData.forEach((creditor, index) => {
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
                const rowRegex = new RegExp(`(<w:tr[^>]*>[\\s\\S]*?<w:t>${creditorNum}</w:t>[\\s\\S]*?</w:tc>)(\\s*<w:tc[^>]*>[\\s\\S]*?</w:tc>)(\\s*<w:tc[^>]*>[\\s\\S]*?</w:tc>)(\\s*<w:tc[^>]*>[\\s\\S]*?</w:tc>)`, 'i');
                const rowMatch = result.match(rowRegex);
                
                let replaced = false;
                
                if (rowMatch) {
                    console.log(`   ✅ Found table row ${creditorNum}`);
                    console.log(`   📊 Attempting to replace content in cells 2, 3, and 4...`);
                    
                    // Extract the 3 data cells (indices 2, 3, 4 in match array)
                    let cell2 = rowMatch[2]; // Creditor name cell
                    let cell3 = rowMatch[3]; // Amount cell
                    let cell4 = rowMatch[4]; // Quote cell
                    
                    // Helper function to replace text content in all <w:t> nodes while preserving structure
                    const replaceTextInCell = (cellXml, newText) => {
                        // DIRECT APPROACH: Replace ALL placeholder text in the cell with our new text
                        // Handles "Test", "Test 1", "1", empty strings, etc.
                        
                        let replaced = cellXml;
                        let hasReplacement = false;
                        
                        // Step 1: Replace all <w:t> nodes that contain placeholder text
                        replaced = replaced.replace(/<w:t>([^<]*)<\/w:t>/g, (match, content) => {
                            const trimmedContent = content.trim();
                            // Check if this is placeholder text ("Test", "Test 1", number "1", empty, etc.)
                            if (/^Test\s*\d*$/i.test(trimmedContent) || /^\d+$/.test(trimmedContent) || trimmedContent === '') {
                                hasReplacement = true;
                                // Replace with our new text
                                return `<w:t>${newText}</w:t>`;
                            }
                            // Keep existing non-placeholder text
                            return match;
                        });
                        
                        // Step 2: If no replacement happened yet, try replacing in runs directly
                        if (!hasReplacement) {
                            replaced = replaced.replace(/<w:r([^>]*)>([\s\S]*?)(<w:t>)([^<]*)(<\/w:t>)([\s\S]*?)(<\/w:r>)/g, (match, rProps, before, tOpen, content, tClose, after, rClose) => {
                                const trimmedContent = content.trim();
                                // Check if placeholder
                                if (/^Test\s*\d*$/i.test(trimmedContent) || /^\d+$/.test(trimmedContent) || trimmedContent === '') {
                                    hasReplacement = true;
                                    return `<w:r${rProps}>${before}${tOpen}${newText}${tClose}${after}${rClose}`;
                                }
                                return match;
                            });
                        }
                        
                        // Step 3: If still no replacement, the cell might be completely empty
                        // Find empty <w:t></w:t> or <w:t> </w:t> and replace
                        if (!hasReplacement) {
                            replaced = replaced.replace(/<w:t>\s*<\/w:t>/g, `<w:t>${newText}</w:t>`);
                            if (replaced !== cellXml) {
                                hasReplacement = true;
                            }
                        }
                        
                        // Step 4: If still no replacement, find empty runs and add text
                        if (!hasReplacement && replaced.includes('<w:r')) {
                            replaced = replaced.replace(/(<w:r[^>]*>)([\s\S]*?)(<\/w:r>)/g, (match, rOpen, rContent, rClose) => {
                                // If run has no text nodes or only empty text, add our text
                                if (!rContent.includes('<w:t>') || /<w:t>\s*<\/w:t>/.test(rContent)) {
                                    hasReplacement = true;
                                    // Add text to the run
                                    return `${rOpen}${rContent.replace(/<w:t>\s*<\/w:t>|$/, `<w:t>${newText}</w:t>`)}${rClose}`;
                                }
                                return match;
                            });
                        }
                        
                        // Step 5: Last resort - find first paragraph and add text
                        if (!hasReplacement && replaced.includes('<w:p')) {
                            // Find first paragraph with runs
                            replaced = replaced.replace(/(<w:p[^>]*>)([\s\S]*?<w:r[^>]*>)([\s\S]*?)(<\/w:r>[\s\S]*?)(<\/w:p>)/, (match, pOpen, beforeRun, runContent, afterRun, pClose) => {
                                // If run content is empty or placeholder, replace it
                                if (!runContent.includes('<w:t>') || /<w:t>\s*<\/w:t>/.test(runContent) || /<w:t>Test/.test(runContent)) {
                                    hasReplacement = true;
                                    return `${pOpen}${beforeRun}<w:t>${newText}</w:t>${afterRun}${pClose}`;
                                }
                                return match;
                            });
                        }
                        
                        return replaced;
                    };
                    
                    // Replace cell 2: Creditor name
                    console.log(`   🔄 Replacing cell 2 (creditor name)...`);
                    console.log(`      Original cell preview: ${cell2.substring(0, 200)}...`);
                    const originalCell2 = cell2;
                    cell2 = replaceTextInCell(cell2, creditorName);
                    if (cell2 !== originalCell2) {
                        console.log(`   ✅ Cell 2 (creditor name) replaced: ${creditorName}`);
                        console.log(`      Replaced cell preview: ${cell2.substring(0, 200)}...`);
                    } else {
                        console.log(`   ⚠️ Cell 2 was NOT replaced! Original: ${cell2.substring(0, 200)}...`);
                    }
                    
                    // Replace cell 3: Amount
                    const formattedAmount = this.formatGermanCurrencyNoSymbol(creditorAmount);
                    console.log(`   🔄 Replacing cell 3 (amount)...`);
                    console.log(`      Original cell preview: ${cell3.substring(0, 200)}...`);
                    const originalCell3 = cell3;
                    cell3 = replaceTextInCell(cell3, formattedAmount);
                    if (cell3 !== originalCell3) {
                        console.log(`   ✅ Cell 3 (amount) replaced: ${formattedAmount}`);
                        console.log(`      Replaced cell preview: ${cell3.substring(0, 200)}...`);
                    } else {
                        console.log(`   ⚠️ Cell 3 was NOT replaced! Original: ${cell3.substring(0, 200)}...`);
                    }
                    
                    // Replace cell 4: Quote
                    const formattedQuote = `${creditorQuote.toFixed(2).replace('.', ',')}%`;
                    console.log(`   🔄 Replacing cell 4 (quote)...`);
                    console.log(`      Original cell preview: ${cell4.substring(0, 200)}...`);
                    const originalCell4 = cell4;
                    cell4 = replaceTextInCell(cell4, formattedQuote);
                    if (cell4 !== originalCell4) {
                        console.log(`   ✅ Cell 4 (quote) replaced: ${formattedQuote}`);
                        console.log(`      Replaced cell preview: ${cell4.substring(0, 200)}...`);
                    } else {
                        console.log(`   ⚠️ Cell 4 was NOT replaced! Original: ${cell4.substring(0, 200)}...`);
                    }
                    
                    // Verify cells were actually modified
                    const cell2Changed = cell2 !== rowMatch[2];
                    const cell3Changed = cell3 !== rowMatch[3];
                    const cell4Changed = cell4 !== rowMatch[4];
                    
                    console.log(`   📊 Cell modification status:`);
                    console.log(`      Cell 2 changed: ${cell2Changed ? '✅ YES' : '❌ NO'}`);
                    console.log(`      Cell 3 changed: ${cell3Changed ? '✅ YES' : '❌ NO'}`);
                    console.log(`      Cell 4 changed: ${cell4Changed ? '✅ YES' : '❌ NO'}`);
                    
                    // Verify new cells contain our text
                    console.log(`   📊 Verifying cell content:`);
                    console.log(`      Cell 2 contains "${creditorName}": ${cell2.includes(creditorName) ? '✅ YES' : '❌ NO'}`);
                    console.log(`      Cell 3 contains "${formattedAmount}": ${cell3.includes(formattedAmount) ? '✅ YES' : '❌ NO'}`);
                    console.log(`      Cell 4 contains "${formattedQuote}": ${cell4.includes(formattedQuote) ? '✅ YES' : '❌ NO'}`);
                    
                    // Reconstruct the row with replaced cells
                    const newRow = `${rowMatch[1]}${cell2}${cell3}${cell4}`;
                    console.log(`   🔄 Reconstructing row ${creditorNum}...`);
                    console.log(`      Original row length: ${rowMatch[0].length} chars`);
                    console.log(`      New row length: ${newRow.length} chars`);
                    
                    const beforeRowReplace = result;
                    result = result.replace(rowRegex, newRow);
                    const afterRowReplace = result;
                    
                    if (beforeRowReplace !== afterRowReplace) {
                        replaced = true;
                        console.log(`   ✅ Row ${creditorNum} replaced successfully with direct cell replacement`);
                        console.log(`   📊 Row replacement changed XML: ${beforeRowReplace.length} → ${afterRowReplace.length} characters`);
                        console.log(`   📊 All cells updated, XML structure preserved`);
                        
                        // Verify the replacement in the result
                        const resultContainsNewText = result.includes(creditorName) && result.includes(formattedAmount) && result.includes(formattedQuote);
                        console.log(`   ✅ Verified replacement in result XML: ${resultContainsNewText ? '✅ CONFIRMED' : '❌ NOT FOUND'}`);
                    } else {
                        console.log(`   ⚠️ Row ${creditorNum} replacement made NO CHANGE to XML!`);
                        console.log(`   🔍 Row regex: ${rowRegex}`);
                        console.log(`   🔍 Row match found: ${rowMatch ? 'YES' : 'NO'}`);
                        if (rowMatch) {
                            console.log(`   🔍 Row match length: ${rowMatch[0].length} chars`);
                            console.log(`   🔍 Row match preview: ${rowMatch[0].substring(0, 300)}...`);
                            console.log(`   🔍 New row preview: ${newRow.substring(0, 300)}...`);
                            console.log(`   🔍 Checking if row exists in result...`);
                            const rowExistsInResult = result.includes(rowMatch[0].substring(0, 100));
                            console.log(`      Row exists in result: ${rowExistsInResult ? 'YES' : 'NO'}`);
                        }
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
                const emptyRowPattern = new RegExp(`<w:tr[^>]*>[\\s\\S]*?<w:t>${i}<\\/w:t>[\\s\\S]*?<\\/w:tr>`, 'i');
                const beforeRemoval = result;
                result = result.replace(emptyRowPattern, '');
                if (beforeRemoval !== result) {
                    console.log(`   ✓ [ROBUST] Removed empty row ${i}`);
                } else {
                    console.log(`   ℹ️ Row ${i} not found (may have been removed already)`);
                }
            }
            
            console.log('');
            console.log('═══════════════════════════════════════════════════════════════');
            console.log(`✅ [ROBUST] COMPLETED POPULATING ${creditorData.length} CREDITOR ROWS`);
            console.log('═══════════════════════════════════════════════════════════════');
            console.log(`📊 Final XML length: ${result.length} characters`);
            console.log(`📊 Original XML length: ${documentXml.length} characters`);
            console.log(`📊 Difference: ${result.length - documentXml.length} characters`);
            console.log('');
            
            // VERIFICATION: Check if creditor data actually appears in the result
            console.log('🔍 [ROBUST] VERIFYING REPLACEMENT SUCCESS...');
            let verificationPassed = true;
            creditorData.forEach((creditor, idx) => {
                const creditorNum = idx + 1;
                const creditorName = creditor.creditor_name || creditor.name || creditor.sender_name || '';
                const creditorAmount = creditor.debt_amount || creditor.final_amount || creditor.amount || 0;
                const formattedAmount = this.formatGermanCurrencyNoSymbol(creditorAmount);
                
                const nameInResult = result.includes(creditorName);
                const amountInResult = result.includes(formattedAmount);
                
                console.log(`   Creditor ${creditorNum}:`);
                console.log(`      Name "${creditorName}" in result: ${nameInResult ? '✅ YES' : '❌ NO'}`);
                console.log(`      Amount "${formattedAmount}" in result: ${amountInResult ? '✅ YES' : '❌ NO'}`);
                
                if (!nameInResult || !amountInResult) {
                    verificationPassed = false;
                    console.log(`      ⚠️ CREDITOR ${creditorNum} DATA MISSING IN RESULT!`);
                }
            });
            
            if (verificationPassed) {
                console.log('✅ [ROBUST] VERIFICATION PASSED: All creditor data found in result XML');
            } else {
                console.log('❌ [ROBUST] VERIFICATION FAILED: Some creditor data missing in result XML');
                console.log('⚠️ [ROBUST] The replacement may not have worked correctly!');
            }
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