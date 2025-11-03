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
                
                // Strategy 2: Find the table row (<w:tr>) that contains this row number
                // Then within that row, find and replace "Test 1" patterns in the next 3 cells
                const rowStartPattern = new RegExp(`(<w:tr[^>]*>[\\s\\S]*?<w:t>${creditorNum}</w:t>[\\s\\S]*?)(</w:tc>\\s*</w:tc>\\s*<w:tc[^>]*>[\\s\\S]*?<w:t>)(Test\\s*</w:t>[\\s\\S]*?<w:t>\\d+</w:t>)([\\s\\S]*?</w:tc>\\s*<w:tc[^>]*>[\\s\\S]*?<w:t>)(Test\\s*</w:t>[\\s\\S]*?<w:t>\\d+</w:t>)([\\s\\S]*?</w:tc>\\s*<w:tc[^>]*>[\\s\\S]*?<w:t>)(Test\\s*</w:t>[\\s\\S]*?<w:t>\\d+</w:t>)`, 'gi');

                const beforeReplace = result;
                
                // Try multiple patterns - "Test 1", "Test 2", "Test N", or just empty cells
                const patterns = [
                    // Pattern 1: "Test 1" format (most specific)
                    new RegExp(`(<w:tr[^>]*>[\\s\\S]*?<w:t>${creditorNum}</w:t>[\\s\\S]*?</w:tc>\\s*<w:tc[^>]*>[\\s\\S]*?)(<w:t>Test\\s*</w:t>[\\s\\S]*?<w:t>1</w:t>)([\\s\\S]*?</w:tc>\\s*<w:tc[^>]*>[\\s\\S]*?)(<w:t>Test\\s*</w:t>[\\s\\S]*?<w:t>1</w:t>)([\\s\\S]*?</w:tc>\\s*<w:tc[^>]*>[\\s\\S]*?)(<w:t>Test\\s*</w:t>[\\s\\S]*?<w:t>1</w:t>)`, 'gi'),
                    // Pattern 2: "Test N" format (where N matches row number)
                    new RegExp(`(<w:tr[^>]*>[\\s\\S]*?<w:t>${creditorNum}</w:t>[\\s\\S]*?</w:tc>\\s*<w:tc[^>]*>[\\s\\S]*?)(<w:t>Test\\s*</w:t>[\\s\\S]*?<w:t>${creditorNum}</w:t>)([\\s\\S]*?</w:tc>\\s*<w:tc[^>]*>[\\s\\S]*?)(<w:t>Test\\s*</w:t>[\\s\\S]*?<w:t>${creditorNum}</w:t>)([\\s\\S]*?</w:tc>\\s*<w:tc[^>]*>[\\s\\S]*?)(<w:t>Test\\s*</w:t>[\\s\\S]*?<w:t>${creditorNum}</w:t>)`, 'gi'),
                    // Pattern 3: Just find empty cells after the row number
                    new RegExp(`(<w:tr[^>]*>[\\s\\S]*?<w:t>${creditorNum}</w:t>[\\s\\S]*?</w:tc>\\s*<w:tc[^>]*>[\\s\\S]*?)(<w:t></w:t>|<w:t>\\s*</w:t>)([\\s\\S]*?</w:tc>\\s*<w:tc[^>]*>[\\s\\S]*?)(<w:t></w:t>|<w:t>\\s*</w:t>)([\\s\\S]*?</w:tc>\\s*<w:tc[^>]*>[\\s\\S]*?)(<w:t></w:t>|<w:t>\\s*</w:t>)`, 'gi')
                ];
                
                console.log(`🔍 [ROBUST] Attempting pattern matching for row ${creditorNum}...`);
                console.log(`   Will try ${patterns.length} different patterns`);
                
                let replaced = false;
                for (let patternIndex = 0; patternIndex < patterns.length && !replaced; patternIndex++) {
                    const pattern = patterns[patternIndex];
                    console.log(`   🎯 Trying Pattern ${patternIndex + 1}/${patterns.length}...`);
                    console.log(`      Pattern regex: ${pattern}`);
                    
                    const match = result.match(pattern);
                    console.log(`      Match result: ${match ? 'FOUND' : 'NOT FOUND'}`);
                    
                    if (match && match[0]) {
                        console.log(`      ✅ Pattern ${patternIndex + 1} matched!`);
                        console.log(`      📊 Match preview (first 200 chars): ${match[0].substring(0, 200)}...`);
                        console.log(`      🔄 Replacing with creditor data...`);
                        
                        const replacementText = `$1<w:t>${creditorName}</w:t>$3<w:t>${this.formatGermanCurrencyNoSymbol(creditorAmount)}</w:t>$5<w:t>${creditorQuote.toFixed(2).replace('.', ',')}%</w:t>`;
                        console.log(`      📝 Replacement text preview: ${replacementText.substring(0, 200)}...`);
                        
                        const beforeReplace = result;
                        result = result.replace(pattern, replacementText);
                        const afterReplace = result;
                        
                        if (beforeReplace !== afterReplace) {
                            replaced = true;
                            console.log(`      ✅ Row ${creditorNum} replaced successfully`);
                            console.log(`      📊 XML changed: ${beforeReplace.length} → ${afterReplace.length} characters`);
                        } else {
                            console.log(`      ⚠️ Replacement made no change to XML!`);
                        }
                        break;
                    } else {
                        console.log(`      ❌ Pattern ${patternIndex + 1} did not match`);
                    }
                }
                
                if (!replaced) {
                    console.log(`   ⚠️ [ROBUST] None of the ${patterns.length} patterns matched for row ${creditorNum}`);
                }
                
                if (!replaced) {
                    // If no pattern matched, try a more aggressive approach: find the row and replace cell contents directly
                    console.log(`   ⚠️ [ROBUST] Standard patterns didn't match for row ${creditorNum}, trying direct cell replacement...`);
                    
                    // Find the entire table row that contains this row number
                    const rowRegex = new RegExp(`(<w:tr[^>]*>[\\s\\S]*?<w:t>${creditorNum}</w:t>[\\s\\S]*?)(</w:tc>\\s*<w:tc[^>]*>[\\s\\S]*?)(</w:tc>\\s*<w:tc[^>]*>[\\s\\S]*?)(</w:tc>\\s*<w:tc[^>]*>[\\s\\S]*?)(</w:tc>\\s*</w:tr>)`, 'i');
                    const rowMatch = result.match(rowRegex);
                    
                    if (rowMatch) {
                        console.log(`   📊 Found table row ${creditorNum}, attempting to replace cells 2, 3, and 4...`);
                        
                        // Split the row into cells - find all <w:tc>...</w:tc> segments
                        const cellRegex = /<w:tc[^>]*>([\s\S]*?)<\/w:tc>/gi;
                        const cells = [];
                        let cellMatch;
                        
                        // Find all cells in the matched row
                        while ((cellMatch = cellRegex.exec(rowMatch[0])) !== null) {
                            cells.push(cellMatch[0]); // Full cell XML
                        }
                        
                        if (cells.length >= 4) {
                            console.log(`   📋 Found ${cells.length} cells in row ${creditorNum}`);
                            
                            // Replace cells 2, 3, and 4 (index 1, 2, 3)
                            // Cell 2: Creditor name
                            const creditorNameXml = cells[1].replace(/<w:t>[^<]*<\/w:t>/gi, `<w:t>${creditorName}</w:t>`);
                            // If no <w:t> found, add it
                            if (!cells[1].includes('<w:t>')) {
                                const cellContent = cells[1].replace(/(<w:tc[^>]*>)([\s\S]*?)(<w:p[^>]*>[\s\S]*?<\/w:p>[\s\S]*?<\/w:tc>)/, `$1$2<w:p><w:r><w:t>${creditorName}</w:t></w:r></w:p>$3`);
                                cells[1] = cellContent;
                            } else {
                                cells[1] = creditorNameXml;
                            }
                            
                            // Cell 3: Amount
                            const amountXml = cells[2].replace(/<w:t>[^<]*<\/w:t>/gi, `<w:t>${this.formatGermanCurrencyNoSymbol(creditorAmount)}</w:t>`);
                            if (!cells[2].includes('<w:t>')) {
                                const cellContent = cells[2].replace(/(<w:tc[^>]*>)([\s\S]*?)(<w:p[^>]*>[\s\S]*?<\/w:p>[\s\S]*?<\/w:tc>)/, `$1$2<w:p><w:r><w:t>${this.formatGermanCurrencyNoSymbol(creditorAmount)}</w:t></w:r></w:p>$3`);
                                cells[2] = cellContent;
                            } else {
                                cells[2] = amountXml;
                            }
                            
                            // Cell 4: Quote
                            const quoteXml = cells[3].replace(/<w:t>[^<]*<\/w:t>/gi, `<w:t>${creditorQuote.toFixed(2).replace('.', ',')}%</w:t>`);
                            if (!cells[3].includes('<w:t>')) {
                                const cellContent = cells[3].replace(/(<w:tc[^>]*>)([\s\S]*?)(<w:p[^>]*>[\s\S]*?<\/w:p>[\s\S]*?<\/w:tc>)/, `$1$2<w:p><w:r><w:t>${creditorQuote.toFixed(2).replace('.', ',')}%</w:t></w:r></w:p>$3`);
                                cells[3] = cellContent;
                            } else {
                                cells[3] = quoteXml;
                            }
                            
                            // Reconstruct the row with replaced cells
                            const newRow = `<w:tr>${cells.join('')}</w:tr>`;
                            result = result.replace(rowRegex, newRow);
                            replaced = true;
                            console.log(`   ✅ Row ${creditorNum} replaced using direct cell replacement`);
                        } else {
                            console.log(`   ❌ Expected 4 cells but found ${cells.length}`);
                        }
                    } else {
                        console.log(`   ❌ Could not find table row structure for row ${creditorNum}`);
                    }
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