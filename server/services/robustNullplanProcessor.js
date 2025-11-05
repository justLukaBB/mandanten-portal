const fs = require("fs");
const path = require("path");
const JSZip = require("jszip");
const { formatAddress } = require("../utils/addressFormatter");

/**
 * Robust Nullplan Template Processor
 * Uses exact XML patterns identified from template analysis
 */
class RobustNullplanProcessor {
    constructor() {
    this.templatePath = path.join(
      __dirname,
      "../templates/Nullplan_Text_Template.docx"
    );
    this.outputDir = path.join(__dirname, "../documents");
        
        // Create output directory if it doesn't exist
        if (!fs.existsSync(this.outputDir)) {
            fs.mkdirSync(this.outputDir, { recursive: true });
        }

        // Load exact template mapping from analysis
        this.templateMapping = {
            "Adresse des Creditors": {
        type: "xml-split",
        pattern:
          '&quot;Adresse</w:t></w:r><w:r><w:rPr><w:spacing w:val="-7"/></w:rPr><w:t> </w:t></w:r><w:r><w:rPr/><w:t>des</w:t></w:r><w:r><w:rPr><w:spacing w:val="-6"/></w:rPr><w:t> </w:t></w:r><w:r><w:rPr><w:spacing w:val="-2"/></w:rPr><w:t>Creditors&quot;',
            },
            "Aktenzeichen der Forderung": {
        type: "xml-split",
        pattern:
          '&quot;Aktenzeichen der</w:t></w:r><w:r><w:rPr><w:spacing w:val="40"/><w:sz w:val="22"/></w:rPr><w:t> </w:t></w:r><w:r><w:rPr><w:sz w:val="22"/></w:rPr><w:t>Forderung &quot;',
            },
            "Schuldsumme Insgesamt": {
        type: "xml-split",
        pattern:
          '&quot;Schuldsumme</w:t></w:r><w:r><w:rPr><w:spacing w:val="-3"/></w:rPr><w:t> </w:t></w:r><w:r><w:rPr/><w:t>Insgesamt&quot;',
            },
            "Heutiges Datum": {
        type: "xml-split",
        pattern:
          '&quot;Heutiges </w:t></w:r><w:r><w:rPr><w:spacing w:val="-2"/><w:sz w:val="20"/></w:rPr><w:t>Datum&quot;',
            },
            "Mandant Name": {
        type: "xml-split",
        pattern:
          '&quot;Mandant</w:t></w:r><w:r><w:rPr><w:spacing w:val="-1"/></w:rPr><w:t> </w:t></w:r><w:r><w:rPr/><w:t>Name&quot;',
            },
            "Datum in 14 Tagen": {
        type: "xml-split",
        pattern:
          '&quot;Datum</w:t></w:r><w:r><w:rPr><w:spacing w:val="-5"/></w:rPr><w:t> </w:t></w:r><w:r><w:rPr/><w:t>in</w:t></w:r><w:r><w:rPr><w:spacing w:val="-5"/></w:rPr><w:t> </w:t></w:r><w:r><w:rPr/><w:t>14</w:t></w:r><w:r><w:rPr><w:spacing w:val="-5"/></w:rPr><w:t> </w:t></w:r><w:r><w:rPr><w:spacing w:val="-2"/></w:rPr><w:t>Tagen&quot;',
            },
            "Name Mandant XML-1": {
        type: "xml-split",
        pattern:
          '&quot;Name</w:t></w:r><w:r><w:rPr><w:spacing w:val="-8"/><w:sz w:val="22"/></w:rPr><w:t> </w:t></w:r><w:r><w:rPr><w:sz w:val="22"/></w:rPr><w:t>Mandant&quot;',
            },
            "Name Mandant XML-2": {
        type: "xml-split",
        pattern:
          '&quot;Name</w:t></w:r><w:r><w:rPr><w:spacing w:val="-4"/></w:rPr><w:t> </w:t></w:r><w:r><w:rPr/><w:t>Mandant&quot;',
      },
        };

        // Simple variables that use standard quoted patterns
        this.simpleVariables = [
            "Name Mandant",
            "Forderungssumme", 
            "Quote des Gläubigers",
            "Forderungsnummer in der Forderungsliste",
            "Gläuibgeranzahl",
            "Einkommen",
            "Geburtstag",
            "Familienstand",
            "Datum in 3 Monaten",
            "Aktenzeichen",
      "Name des Gläubigers",
        ];
    }

    /**
     * Generate individual Nullplan letters for all creditors
     */
    async generateNullplanLettersForAllCreditors(clientData, allCreditors) {
        try {
      console.log(
        `📄 [ROBUST] Generating individual Nullplan letters for ${allCreditors.length} creditors...`
      );

            if (!fs.existsSync(this.templatePath)) {
                throw new Error(`Nullplan template not found: ${this.templatePath}`);
            }

            const results = [];
            
            // Calculate total debt for quota calculations
            const totalDebt = allCreditors.reduce((sum, creditor) => {
        return (
          sum +
          (creditor.debt_amount ||
            creditor.final_amount ||
            creditor.amount ||
            0)
        );
            }, 0);

            // Generate individual letter for each creditor
            for (let i = 0; i < allCreditors.length; i++) {
                const creditor = allCreditors[i];
                const creditorPosition = i + 1;
                
        console.log(
          `📝 [ROBUST] Processing creditor ${creditorPosition}/${
            allCreditors.length
          }: ${creditor.sender_name || creditor.name || creditor.creditor_name}`
        );
                
                const letterResult = await this.generateNullplanLetterForCreditor(
                    clientData, 
                    creditor, 
                    creditorPosition, 
                    allCreditors.length,
                    totalDebt
                );
                
                if (letterResult.success) {
                    results.push(letterResult);
                } else {
          console.error(
            `❌ [ROBUST] Failed to generate letter for ${
              creditor.sender_name || creditor.name || creditor.creditor_name
            }: ${letterResult.error}`
          );
        }
      }

      console.log(
        `✅ [ROBUST] Generated ${results.length}/${allCreditors.length} individual Nullplan letters`
      );

            return {
                success: true,
                documents: results,
                total_generated: results.length,
        total_creditors: allCreditors.length,
            };
        } catch (error) {
      console.error("❌ [ROBUST] Error generating Nullplan letters:", error);
            return {
                success: false,
                error: error.message,
        documents: [],
            };
        }
    }

    /**
     * Generate Nullplan letter for a single creditor using robust pattern matching
     */
  async generateNullplanLetterForCreditor(
    clientData,
    creditor,
    creditorPosition,
    totalCreditors,
    totalDebt
  ) {
        try {
            // Load the template
            const templateBuffer = fs.readFileSync(this.templatePath);
            const zip = await JSZip.loadAsync(templateBuffer);
      const documentXml = await zip.file("word/document.xml").async("string");

            // Prepare creditor-specific replacements
            const replacements = this.prepareCreditorSpecificReplacements(
                clientData, 
                creditor, 
                creditorPosition, 
                totalCreditors, 
                totalDebt
            );
            
      console.log(
        `🔄 [ROBUST] Applying ${
          Object.keys(replacements).length
        } replacements for ${creditor.name || creditor.creditor_name}`
      );

      // Log all date-related replacements BEFORE XML processing
      console.log(
        "═══════════════════════════════════════════════════════════════"
      );
      console.log("📅 [ROBUST] DATE INFORMATION BEFORE XML PROCESSING:");
      console.log(
        "═══════════════════════════════════════════════════════════════"
      );
      const dateKeysBefore = [
        "Heutiges Datum",
        "Datum in 14 Tagen",
        "Datum in 3 Monaten",
        "Geburtstag",
      ];
      dateKeysBefore.forEach((key) => {
        if (replacements[key]) {
          console.log(`   📆 ${key}: "${replacements[key]}"`);
          console.log(`      - Type: ${typeof replacements[key]}`);
          console.log(`      - Length: ${replacements[key].length} characters`);
        }
      });
      console.log(
        "═══════════════════════════════════════════════════════════════"
      );

            // Apply replacements using robust pattern matching
            let processedXml = documentXml;
            let totalReplacements = 0;

            // 1. First handle XML-split patterns with exact matches
      console.log("🎯 [ROBUST] Processing XML-split patterns...");
            Object.entries(this.templateMapping).forEach(([variable, mapping]) => {
                if (replacements[variable]) {
                    const pattern = mapping.pattern;
          let replacementValue = replacements[variable];

          // Special handling for address: convert \n to Word XML line breaks
          if (variable === "Adresse des Creditors") {
            // Convert newlines to Word XML line breaks for proper formatting
            // formatAddress returns "Street\nPostalCode City" - convert \n to <w:br/>
            // This ensures proper postal address formatting in Word
            const originalAddress = replacementValue;
            replacementValue = replacementValue.replace(/\n/g, '<w:br/>');
            console.log(`   📍 [ROBUST] Address formatting:`);
            console.log(`      📥 Original: "${originalAddress.replace(/\n/g, '\\n')}"`);
            console.log(`      📤 With XML breaks: "${replacementValue.replace(/<w:br\/>/g, '\\n')}"`);
          }

          // Special logging for date variables
          if (variable.includes("Datum") || variable.includes("Geburtstag")) {
            console.log(
              `\n📅 [ROBUST] Processing date variable: "${variable}"`
            );
            console.log(`   📥 Replacement value: "${replacementValue}"`);
            console.log(`   📥 Value type: ${typeof replacementValue}`);
            console.log(`   📥 Value length: ${replacementValue.length}`);

            // Check if pattern exists in XML
            const patternExists = processedXml.includes(pattern);
            console.log(
              `   🔍 Pattern found in XML: ${
                patternExists ? "✅ YES" : "❌ NO"
              }`
            );

            if (patternExists) {
              // Find the pattern in XML and show context
              const patternIndex = processedXml.indexOf(pattern);
              const contextBefore = processedXml.substring(
                Math.max(0, patternIndex - 100),
                patternIndex
              );
              const contextAfter = processedXml.substring(
                patternIndex + pattern.length,
                Math.min(
                  processedXml.length,
                  patternIndex + pattern.length + 100
                )
              );
              console.log(
                `   📄 Context before pattern: ...${contextBefore.substring(
                  contextBefore.length - 50
                )}`
              );
              console.log(
                `   📄 Pattern to replace (first 100 chars): ${pattern.substring(
                  0,
                  100
                )}...`
              );
              console.log(
                `   📄 Context after pattern: ${contextAfter.substring(
                  0,
                  50
                )}...`
              );
            }
          }
                    
                    if (processedXml.includes(pattern)) {
            const beforeReplacement = processedXml.substring(
              processedXml.indexOf(pattern),
              processedXml.indexOf(pattern) + Math.min(200, pattern.length)
            );

            processedXml = processedXml.replace(pattern, replacementValue);

            // Log after replacement for date variables
            if (variable.includes("Datum") || variable.includes("Geburtstag")) {
              const afterReplacement = processedXml.substring(
                processedXml.indexOf(replacementValue),
                processedXml.indexOf(replacementValue) +
                  Math.min(200, replacementValue.length + 50)
              );
              console.log(
                `   ✅ After replacement (first 200 chars): ${afterReplacement.substring(
                  0,
                  200
                )}...`
              );
              console.log(`   ✅ Replacement successful!`);
            }

            console.log(
              `✅ [ROBUST] XML-split pattern replaced: "${variable}"`
            );
                        totalReplacements++;
                    } else {
            console.log(
              `⚠️ [ROBUST] XML-split pattern not found: "${variable}"`
            );
                        console.log(`   Expected pattern length: ${pattern.length}`);
                        console.log(`   Pattern start: ${pattern.substring(0, 50)}...`);
                    }
                }
            });

      // 2. Then handle simple quoted variables
      console.log("🎯 [ROBUST] Processing simple variables...");
      this.simpleVariables.forEach((variable) => {
        if (replacements[variable]) {
          const quotedVariable = `&quot;${variable}&quot;`;
          const replacementValue = replacements[variable];

          // Special logging for date variables
          if (variable.includes("Datum") || variable.includes("Geburtstag")) {
            console.log(
              `\n📅 [ROBUST] Processing date variable: "${variable}"`
            );
            console.log(`   📥 Replacement value: "${replacementValue}"`);
            console.log(`   📥 Quoted variable to find: "${quotedVariable}"`);
          }

          if (processedXml.includes(quotedVariable)) {
            // Find all occurrences
            const regex = new RegExp(this.escapeRegex(quotedVariable), "g");
            const matches = processedXml.match(regex);
            console.log(
              `   🔍 Found ${matches ? matches.length : 0} occurrence(s) in XML`
            );

            if (variable.includes("Datum") || variable.includes("Geburtstag")) {
              // Show context before replacement
              const firstMatchIndex = processedXml.indexOf(quotedVariable);
              if (firstMatchIndex !== -1) {
                const contextBefore = processedXml.substring(
                  Math.max(0, firstMatchIndex - 100),
                  firstMatchIndex
                );
                const contextAfter = processedXml.substring(
                  firstMatchIndex + quotedVariable.length,
                  Math.min(
                    processedXml.length,
                    firstMatchIndex + quotedVariable.length + 100
                  )
                );
                console.log(
                  `   📄 Context before: ...${contextBefore.substring(
                    contextBefore.length - 50
                  )}`
                );
                console.log(`   📄 Variable to replace: "${quotedVariable}"`);
                console.log(
                  `   📄 Context after: ${contextAfter.substring(0, 50)}...`
                );
              }
            }

            processedXml = processedXml.replace(regex, replacementValue);

            if (variable.includes("Datum") || variable.includes("Geburtstag")) {
              // Show context after replacement
              const afterIndex = processedXml.indexOf(replacementValue);
              if (afterIndex !== -1) {
                const contextAfter = processedXml.substring(
                  afterIndex,
                  Math.min(
                    processedXml.length,
                    afterIndex + replacementValue.length + 50
                  )
                );
                console.log(
                  `   ✅ After replacement: ${contextAfter.substring(
                    0,
                    150
                  )}...`
                );
                console.log(`   ✅ Replacement successful!`);
              }
            }

                        console.log(`✅ [ROBUST] Simple variable replaced: "${variable}"`);
                        totalReplacements++;
                    } else {
                        console.log(`⚠️ [ROBUST] Simple variable not found: "${variable}"`);
                    }
                }
            });
            
      console.log("🎯 [ROBUST] Fixing opening hours format...");
      const correctOpeningHours = "09.00 - 18.00 Uhr";
      let openingHoursFixed = false;

      // First, let's debug what's actually in the XML around Öffnungszeiten
      console.log("🔍 [ROBUST] Debugging opening hours in XML...");
      const offnungszeitenIndex = processedXml.indexOf("Öffnungszeiten");
      if (offnungszeitenIndex === -1) {
        // Try case-insensitive search
        const offnungszeitenRegex = /[Öö]ffnungszeiten/i;
        const match = processedXml.match(offnungszeitenRegex);
        if (match) {
          const foundIndex = processedXml.indexOf(match[0]);
          console.log(`   📍 Found "${match[0]}" at index ${foundIndex}`);
          const contextAround = processedXml.substring(
            Math.max(0, foundIndex - 200),
            Math.min(processedXml.length, foundIndex + 1000)
          );
          console.log(`   📄 Context around Öffnungszeiten (500 chars after): ${contextAround.substring(200, 700)}`);
        } else {
          console.log(`   ⚠️ "Öffnungszeiten" not found in XML (case-insensitive search)`);
        }
      } else {
        console.log(`   📍 Found "Öffnungszeiten" at index ${offnungszeitenIndex}`);
        const contextAround = processedXml.substring(
          Math.max(0, offnungszeitenIndex - 200),
          Math.min(processedXml.length, offnungszeitenIndex + 2000)
        );
        console.log(`   📄 Context around Öffnungszeiten (first 500 chars after): ${contextAround.substring(200, 700)}`);
        console.log(`   📄 Context around Öffnungszeiten (next 500 chars): ${contextAround.substring(700, 1200)}`);
        console.log(`   📄 Context around Öffnungszeiten (next 500 chars): ${contextAround.substring(1200, 1700)}`);
        
        // Extract all text content after "Mo. - Fr.:" to see what follows
        const moFrIndex = contextAround.indexOf("Mo.");
        if (moFrIndex !== -1) {
          const afterMoFr = contextAround.substring(moFrIndex, Math.min(moFrIndex + 1500, contextAround.length));
          console.log(`   📄 Full text after "Mo. - Fr.:" (1500 chars): ${afterMoFr}`);
          
          // Try to extract just the text content (remove XML tags)
          const textOnly = afterMoFr.replace(/<[^>]*>/g, '');
          console.log(`   📄 Text content only (after XML tags removed): "${textOnly.substring(0, 200)}"`);
        }
      }

      // Search for the malformed time pattern "0194.00" or "138.00" or split characters
      const malformedPatterns = [
        /0194\.00/gi,
        /138\.00/gi,
        /0\s*1\s*9\s*4/gi,
        /1\s*3\s*8/gi,
      ];
      
      let foundMalformed = false;
      malformedPatterns.forEach((pattern, idx) => {
        if (pattern.test(processedXml)) {
          const match = processedXml.match(pattern);
          if (match && match.length > 0) {
            const matchIndex = processedXml.indexOf(match[0]);
            console.log(`   🔍 Found malformed pattern ${idx + 1} ("${match[0]}") at index ${matchIndex}`);
            const context = processedXml.substring(
              Math.max(0, matchIndex - 100),
              Math.min(processedXml.length, matchIndex + 300)
            );
            console.log(`   📄 Context: ...${context}...`);
            foundMalformed = true;
          }
        }
      });

      if (!foundMalformed) {
        console.log(`   ⚠️ No malformed time patterns (0194, 138) found in XML`);
      }

      // Extract formatting from the first time character (the "0") to preserve design
      // This ensures we use the same formatting as the original time text
      let extractedFormatting = '<w:rPr><w:spacing w:val="-16"/><w:sz w:val="16"/></w:rPr>'; // Default based on logs
      const frIndex = processedXml.indexOf('<w:t>Fr.:</w:t></w:r>');
      if (frIndex !== -1) {
        // Find the first text run after "Fr.:" that contains a digit (the time characters start)
        const afterFr = processedXml.substring(frIndex + '<w:t>Fr.:</w:t></w:r>'.length);
        
        // Look for the first text run that contains "0" (the first time character)
        // Pattern: <w:r><w:rPr>...</w:rPr><w:t>0</w:t></w:r>
        const timeCharRunMatch = afterFr.match(/<w:r><w:rPr>([\s\S]*?)<\/w:rPr><w:t>[0O9]<\/w:t><\/w:r>/);
        if (timeCharRunMatch) {
          // Extract the rPr (run properties) from the first time character run
          extractedFormatting = `<w:rPr>${timeCharRunMatch[1]}</w:rPr>`;
          console.log(`   📐 Extracted formatting from first time character: ${extractedFormatting.substring(0, 150)}...`);
        } else {
          // Fallback: Find any run properties in the time content area (skip the space after "Fr.:")
          const allRuns = afterFr.match(/<w:r><w:rPr>([\s\S]*?)<\/w:rPr><w:t>[^<]*<\/w:t><\/w:r>/g);
          if (allRuns && allRuns.length > 0) {
            // Get the run that contains a digit (not the space)
            for (const run of allRuns) {
              if (run.match(/<w:t>[0-9O]/)) {
                const rPrMatch = run.match(/<w:r><w:rPr>([\s\S]*?)<\/w:rPr>/);
                if (rPrMatch) {
                  extractedFormatting = `<w:rPr>${rPrMatch[1]}</w:rPr>`;
                  console.log(`   📐 Extracted formatting from time character run: ${extractedFormatting.substring(0, 150)}...`);
                  break;
                }
              }
            }
          }
        }
      }

      // Try multiple pattern variations
      // Based on the XML structure: <w:t>Mo.</w:t></w:r><w:r>...<w:t> </w:t></w:r><w:r>...<w:t>-</w:t></w:r>...<w:t>Fr.:</w:t></w:r>...then time
      // The key is that "Fr.:" is in a text run that closes with </w:r>, so we need to match after that
      const openingHoursPatterns = [
        // Pattern 1: Match after "Fr.:" text node (which ends with </w:r>), then replace all following text runs until </w:p>
        // This preserves the XML structure by keeping "Fr.:" in its own text run and adding a new run for the time
        {
          name: "After Fr.: replace all text runs until paragraph end",
          pattern: /(<w:t[^>]*>Fr\.:<\/w:t><\/w:r>)([\s\S]*?)(<\/w:p>)/gi,
          replaceFn: (match, prefix, timeContent, closingTag) => {
            // prefix already includes </w:r> closing the "Fr.:" text run
            // Replace everything between "Fr.:</w:r>" and </w:p> with a single new text run
            // Use the extracted formatting to preserve the original design
            return prefix + `<w:r>${extractedFormatting}<w:t xml:space="preserve">${correctOpeningHours}</w:t></w:r>` + closingTag;
          }
        },
        // Pattern 2: Match "Mo." - "Fr.:" then replace everything until end of paragraph
        // This is more aggressive but should work if Pattern 1 doesn't
        {
          name: "Mo. - Fr.: replace all following text nodes until end of paragraph",
          pattern: /(<w:t[^>]*>Mo\.<\/w:t>[\s\S]*?<w:t[^>]*>[\s\-]*<\/w:t>[\s\S]*?<w:t[^>]*>Fr\.:<\/w:t><\/w:r>)([\s\S]*?)(<\/w:p>)/gi,
          replaceFn: (match, prefix, timeContent, closingTag) => {
            // prefix includes everything up to and including "Fr.:</w:r>"
            // Replace everything between "Fr.:</w:r>" and </w:p> with correct time
            // Use the extracted formatting to preserve the original design
            return prefix + `<w:r>${extractedFormatting}<w:t xml:space="preserve">${correctOpeningHours}</w:t></w:r>` + closingTag;
          }
        },
        // Pattern 3: Match after "Fr.:" text node, find any text nodes until "Uhr" or end of paragraph
        {
          name: "After Fr.: replace until Uhr or end of paragraph",
          pattern: /(<w:t[^>]*>Fr\.:<\/w:t><\/w:r>)([\s\S]*?)(<w:t[^>]*>Uhr[\s\S]*?<\/w:t>[\s\S]*?<\/w:p>|<\/w:p>)/gi,
          replaceFn: (match, prefix, timeContent, closingTag) => {
            // If we found "Uhr" in the closing, replace everything including Uhr
            if (closingTag.includes("Uhr")) {
              return prefix + `<w:r>${extractedFormatting}<w:t xml:space="preserve">${correctOpeningHours}</w:t></w:r></w:p>`;
            }
            return prefix + `<w:r>${extractedFormatting}<w:t xml:space="preserve">${correctOpeningHours}</w:t></w:r>` + closingTag;
          }
        },
        // Pattern 4: Match exact XML structure with split characters 0 1 9 4
        {
          name: "Mo. - Fr.: with split 0194 pattern",
          pattern: /(<w:t[^>]*>Mo\.<\/w:t>[\s\S]*?<w:t[^>]*>[\s\-]*<\/w:t>[\s\S]*?<w:t[^>]*>Fr\.:<\/w:t>[\s\S]*?)(<w:t[^>]*>[0O]<\/w:t>[\s\S]*?<w:t[^>]*>1<\/w:t>[\s\S]*?<w:t[^>]*>9<\/w:t>[\s\S]*?<w:t[^>]*>4<\/w:t>[\s\S]*?<w:t[^>]*>\.?<\/w:t>[\s\S]*?<w:t[^>]*>0*<\/w:t>[\s\S]*?<w:t[^>]*>[\s\-]*<\/w:t>[\s\S]*?<w:t[^>]*>[\s\-]*<\/w:t>[\s\S]*?<w:t[^>]*>1<\/w:t>[\s\S]*?<w:t[^>]*>3<\/w:t>[\s\S]*?<w:t[^>]*>8<\/w:t>[\s\S]*?<w:t[^>]*>\.?<\/w:t>[\s\S]*?<w:t[^>]*>0*<\/w:t>[\s\S]*?<w:t[^>]*>Uh[\s\S]*?r<\/w:t>[\s\S]*?<w:t[^>]*>r<\/w:t>)/gi,
        },
        // Pattern 5: Direct text "0194.00 - 138.00 Uhr"
        {
          name: "Direct text 0194.00 - 138.00",
          pattern: /(0194\.00\s*-\s*138\.00\s*Uhr)/gi,
        },
      ];

      for (const patternConfig of openingHoursPatterns) {
        const { name, pattern, replaceFn } = patternConfig;
        console.log(`   🔍 Trying pattern: "${name}"...`);
        
        if (pattern.test(processedXml)) {
          const match = processedXml.match(pattern);
          console.log(`   ✅ Pattern "${name}" matched! Found ${match ? match.length : 0} occurrence(s)`);
          
          if (replaceFn) {
            // Use custom replace function
            processedXml = processedXml.replace(pattern, replaceFn);
          } else {
            // Default replace - keep prefix if exists
            processedXml = processedXml.replace(
              pattern,
              (m, prefix = "", suffix = "") => {
                // If pattern has a prefix (like "Mo. - Fr.:"), keep it
                if (prefix && prefix.trim()) {
                  return prefix + `<w:r><w:t xml:space="preserve">${correctOpeningHours}</w:t></w:r>` + (suffix || "");
                } else {
                  // Otherwise just replace the malformed time
                  return `<w:r><w:t xml:space="preserve">${correctOpeningHours}</w:t></w:r>`;
                }
              }
            );
          }
          
          openingHoursFixed = true;
          console.log(`   ✅ [ROBUST] Opening hours fixed using pattern: "${name}"`);
          totalReplacements++;
          break;
        } else {
          console.log(`   ❌ Pattern "${name}" did not match`);
        }
      }

      // Final fallback: simple text replacement
      if (!openingHoursFixed) {
        console.log(`   🔍 Trying simple text fallback patterns...`);
        const textFallbacks = [
          /0194\.00[\s\S]*?138\.00[\s\S]*?Uhr/gi,
          /0\s*1\s*9\s*4[\s\S]*?1\s*3\s*8[\s\S]*?Uhr/gi,
        ];

        for (const fallbackPattern of textFallbacks) {
          if (fallbackPattern.test(processedXml)) {
            processedXml = processedXml.replace(fallbackPattern, correctOpeningHours);
            openingHoursFixed = true;
            console.log(`   ✅ [ROBUST] Opening hours fixed (fallback text pattern)`);
            totalReplacements++;
            break;
          }
        }
      }

      if (!openingHoursFixed) {
        console.log(
          `   ⚠️ [ROBUST] Opening hours pattern not found after trying all patterns`
        );
        console.log(`   💡 Suggestion: Check the template XML structure manually`);
      }

      // Log all date-related information AFTER XML processing
      console.log(
        "\n═══════════════════════════════════════════════════════════════"
      );
      console.log("📅 [ROBUST] DATE INFORMATION AFTER XML PROCESSING:");
      console.log(
        "═══════════════════════════════════════════════════════════════"
      );
      const dateKeysAfter = [
        "Heutiges Datum",
        "Datum in 14 Tagen",
        "Datum in 3 Monaten",
        "Geburtstag",
      ];
      dateKeysAfter.forEach((key) => {
        const replacementValue = replacements[key];
        if (replacementValue) {
          // Check if the date appears in the processed XML
          const appearsInXml = processedXml.includes(replacementValue);
          console.log(`\n   📆 ${key}: "${replacementValue}"`);
          console.log(
            `      - Found in processed XML: ${
              appearsInXml ? "✅ YES" : "❌ NO"
            }`
          );

          if (appearsInXml) {
            // Find where it appears and show context
            const index = processedXml.indexOf(replacementValue);
            const contextBefore = processedXml.substring(
              Math.max(0, index - 150),
              index
            );
            const contextAfter = processedXml.substring(
              index + replacementValue.length,
              Math.min(
                processedXml.length,
                index + replacementValue.length + 150
              )
            );
            console.log(
              `      - Context in XML (before): ...${contextBefore.substring(
                contextBefore.length - 80
              )}`
            );
            console.log(`      - Value in XML: "${replacementValue}"`);
            console.log(
              `      - Context in XML (after): ${contextAfter.substring(
                0,
                80
              )}...`
            );

            // Also check if it appears in XML text nodes
            const inTextNode =
              processedXml.includes(`<w:t>${replacementValue}</w:t>`) ||
              processedXml.includes(
                `<w:t xml:space="preserve">${replacementValue}</w:t>`
              ) ||
              processedXml.includes(`>${replacementValue}<`);
            console.log(
              `      - In proper XML text node: ${
                inTextNode ? "✅ YES" : "⚠️ CHECK MANUALLY"
              }`
            );

            // Check if it's properly wrapped in XML structure
            const xmlPattern = new RegExp(
              `<w:t[^>]*>${this.escapeRegex(replacementValue)}</w:t>`,
              "i"
            );
            const properlyWrapped = xmlPattern.test(processedXml);
            console.log(
              `      - Properly wrapped in <w:t> node: ${
                properlyWrapped ? "✅ YES" : "⚠️ NO"
              }`
            );
          } else {
            // Try to find similar patterns
            const datePattern = replacementValue.replace(/\./g, "\\.");
            const regexPattern = new RegExp(datePattern, "i");
            const similarMatch = processedXml.match(regexPattern);
            if (similarMatch) {
              console.log(
                `      - ⚠️ Found similar pattern: "${similarMatch[0]}"`
              );
            } else {
              console.log(
                `      - ❌ No similar pattern found - date may not have been replaced`
              );
            }
          }
        }
      });
      console.log(
        "═══════════════════════════════════════════════════════════════\n"
      );

            // Update the document XML in the zip
      console.log("💾 [ROBUST] Saving processed XML to ZIP archive...");
      zip.file("word/document.xml", processedXml);
      console.log("   ✅ XML saved to ZIP");

            // Generate output
      const outputBuffer = await zip.generateAsync({ type: "nodebuffer" });
            
            // Create creditor-specific filename using correct field priority
      const creditorNameForFile = (
        creditor.sender_name ||
        creditor.name ||
        creditor.creditor_name ||
        `Creditor_${creditorPosition}`
      ).replace(/[^a-zA-Z0-9\-_.]/g, "_");
            
            // Get creditor reference for filename uniqueness
      const creditorRef = (
        creditor.reference_number ||
                               creditor.creditor_reference || 
                               creditor.reference || 
                               creditor.aktenzeichen || 
        `REF_${creditorPosition}`
      ).replace(/[^a-zA-Z0-9\-_.]/g, "_");
            
            // Always include creditor position to ensure uniqueness
      const filename = `Nullplan_${
        clientData.reference || clientData.aktenzeichen
      }_${creditorNameForFile}_${creditorRef}_${creditorPosition}_${
        new Date().toISOString().split("T")[0]
      }.docx`;
            const outputPath = path.join(this.outputDir, filename);
            
            fs.writeFileSync(outputPath, outputBuffer);

      console.log(
        `✅ [ROBUST] Individual Nullplan letter generated: ${filename}`
      );

            return {
                success: true,
                filename: filename,
                path: outputPath,
                size: outputBuffer.length,
        creditor_name:
          creditor.sender_name ||
          creditor.name ||
          creditor.creditor_name ||
          `Creditor_${creditorPosition}`,
        creditor_id: creditor.id || creditorPosition,
      };
        } catch (error) {
      console.error(
        "❌ [ROBUST] Error generating Nullplan letter for creditor:",
        error
      );
            return {
                success: false,
                error: error.message,
        creditor_name:
          creditor.sender_name || creditor.name || creditor.creditor_name,
            };
        }
    }

    /**
     * Prepare creditor-specific variable replacements
     */
  prepareCreditorSpecificReplacements(
    clientData,
    creditor,
    creditorPosition,
    totalCreditors,
    totalDebt
  ) {
        // Extract creditor data
    const creditorAmount =
      creditor.debt_amount || creditor.final_amount || creditor.amount || 0;
    const creditorQuote =
      totalDebt > 0 ? (creditorAmount / totalDebt) * 100 : 0;
        
        // Get creditor name first (before processing address)
    const creditorName =
      creditor.sender_name ||
      creditor.name ||
      creditor.creditor_name ||
      `Creditor_${creditorPosition}`;

    console.log(`\n🔍 [ROBUST] Processing creditor address for: "${creditorName}"`);

        // Build creditor address using correct field mapping (sender_address is primary)
    let creditorAddress = "";

        // Helper function to remove creditor name from address
        const removeCreditorNameFromAddress = (address) => {
          if (!address || !creditorName) return address;
          
          const originalAddress = address;
          let cleaned = address.trim();
          
          console.log(`   📥 Original address: "${originalAddress.substring(0, 100)}${originalAddress.length > 100 ? '...' : ''}"`);
          
          // Remove creditor name if it appears at the start (with optional newline/comma)
          if (cleaned.startsWith(creditorName)) {
            cleaned = cleaned.substring(creditorName.length).trim();
            cleaned = cleaned.replace(/^[\n,\-]+/, '').trim();
            console.log(`   🔧 Removed creditor name from address (starts with name)`);
            console.log(`   📤 Cleaned address: "${cleaned.substring(0, 100)}${cleaned.length > 100 ? '...' : ''}"`);
            return cleaned;
          }
          
          // Remove creditor name if it appears on first line (before newline)
          const firstNewlineIndex = cleaned.indexOf('\n');
          if (firstNewlineIndex !== -1) {
            const firstLine = cleaned.substring(0, firstNewlineIndex).trim();
            if (firstLine === creditorName) {
              cleaned = cleaned.substring(firstNewlineIndex + 1).trim();
              cleaned = cleaned.replace(/^[\n,\-]+/, '').trim();
              console.log(`   🔧 Removed creditor name from address (first line)`);
              console.log(`   📤 Cleaned address: "${cleaned.substring(0, 100)}${cleaned.length > 100 ? '...' : ''}"`);
              return cleaned;
            }
          }
          
          // Remove creditor name if it appears anywhere at the start (with surrounding punctuation)
          const nameRegex = new RegExp(`^${this.escapeRegex(creditorName)}[\\s\\n,\\-]+`, 'i');
          if (nameRegex.test(cleaned)) {
            cleaned = cleaned.replace(nameRegex, '').trim();
            console.log(`   🔧 Removed creditor name from address (regex match)`);
            console.log(`   📤 Cleaned address: "${cleaned.substring(0, 100)}${cleaned.length > 100 ? '...' : ''}"`);
            return cleaned;
          }
          
          console.log(`   ✅ No creditor name found in address - keeping as-is`);
          return cleaned;
        };

        // Priority order based on actual database schema
        if (creditor.sender_address && creditor.sender_address.trim()) {
            let rawAddress = removeCreditorNameFromAddress(creditor.sender_address.trim());
            creditorAddress = formatAddress(rawAddress);
        } else if (creditor.address && creditor.address.trim()) {
            let rawAddress = removeCreditorNameFromAddress(creditor.address.trim());
            creditorAddress = formatAddress(rawAddress);
        } else if (creditor.creditor_address && creditor.creditor_address.trim()) {
            let rawAddress = removeCreditorNameFromAddress(creditor.creditor_address.trim());
            creditorAddress = formatAddress(rawAddress);
        } else {
            // Build from individual parts as fallback
            const parts = [];
            if (creditor.creditor_street || creditor.sender_street) {
                parts.push(creditor.creditor_street || creditor.sender_street);
            }
            if (creditor.creditor_postal_code || creditor.sender_postal_code) {
        const city = creditor.creditor_city || creditor.sender_city || "";
        parts.push(
          `${
            creditor.creditor_postal_code || creditor.sender_postal_code
          } ${city}`.trim()
        );
      }

      const builtAddress = parts.filter((p) => p && p.trim()).join(" ");
      creditorAddress = builtAddress ? formatAddress(builtAddress) : "";
        }

        // Final fallback
    if (!creditorAddress || creditorAddress === "," || creditorAddress === "") {
      creditorAddress = `Adresse nicht verfügbar`;
        }

        // Client name
    const clientName =
      clientData.fullName ||
      `${clientData.firstName || ""} ${clientData.lastName || ""}`.trim() ||
      "Max Mustermann";

        // Note: creditorName was already extracted above to check for duplicates in address

        // Get creditor-specific reference number (priority: reference_number > creditor_reference > fallback to client)
    const creditorReference =
      creditor.reference_number ||
                                creditor.creditor_reference || 
                                creditor.reference || 
                                `${clientData.reference || clientData.aktenzeichen}-${creditorPosition}`;

    // Prepare dates with detailed logging
    console.log(
      "\n═══════════════════════════════════════════════════════════════"
    );
    console.log("📅 [ROBUST] PREPARING DATE REPLACEMENTS:");
    console.log(
      "═══════════════════════════════════════════════════════════════"
    );

    const today = new Date();
    const todayFormatted = this.formatGermanDate(today);
    console.log(`\n📅 Today's date:`);
    console.log(`   📥 Raw Date object: ${today.toString()}`);
    console.log(`   📥 ISO string: ${today.toISOString()}`);
    console.log(`   📤 Formatted: "${todayFormatted}"`);

    const deadlineDate = this.calculateDeadlineDate();
    console.log(`\n📅 Deadline date (14 days):`);
    console.log(`   📤 Formatted: "${deadlineDate}"`);

    const dateIn3Months = this.calculateDateInMonths(3);
    console.log(`\n📅 Date in 3 months:`);
    console.log(`   📤 Formatted: "${dateIn3Months}"`);

    const birthDate =
      clientData.birthDate || clientData.geburtstag || "01.01.1980";
    console.log(`\n📅 Birth date:`);
    console.log(
      `   📥 Raw value: "${
        clientData.birthDate || clientData.geburtstag || "NOT PROVIDED"
      }"`
    );
    console.log(`   📤 Final value: "${birthDate}"`);
    console.log(
      "═══════════════════════════════════════════════════════════════\n"
    );

        const replacements = {
            // XML-split variables (exact mapping)
            "Adresse des Creditors": creditorAddress,
            "Aktenzeichen der Forderung": creditorReference,
            "Schuldsumme Insgesamt": this.formatGermanCurrency(totalDebt),
      "Heutiges Datum": todayFormatted,
            "Mandant Name": clientName,
      "Datum in 14 Tagen": deadlineDate,
            "Name Mandant XML-1": clientName,
            "Name Mandant XML-2": clientName,
            
            // Simple variables
            "Name Mandant": clientName,
      Forderungssumme: this.formatGermanCurrency(creditorAmount),
      "Quote des Gläubigers": `${creditorQuote.toFixed(2).replace(".", ",")}%`,
            "Forderungsnummer in der Forderungsliste": creditorPosition.toString(),
      Gläuibgeranzahl: totalCreditors.toString(),
      Einkommen: this.formatGermanCurrency(
        clientData.financial_data?.monthly_net_income ||
          clientData.monthlyNetIncome ||
          0
      ),
      Geburtstag: birthDate,
      Familienstand: this.getMaritalStatusText(
        clientData.maritalStatus || clientData.financial_data?.marital_status
      ),
      "Datum in 3 Monaten": dateIn3Months,
      Aktenzeichen: `${clientData.reference || clientData.aktenzeichen}`,
            "Name des Gläubigers": creditorName,
    };

    console.log("📋 [ROBUST] All date replacements stored:");
    console.log(`   "Heutiges Datum": "${replacements["Heutiges Datum"]}"`);
    console.log(
      `   "Datum in 14 Tagen": "${replacements["Datum in 14 Tagen"]}"`
    );
    console.log(
      `   "Datum in 3 Monaten": "${replacements["Datum in 3 Monaten"]}"`
    );
    console.log(`   "Geburtstag": "${replacements["Geburtstag"]}"`);
        
        console.log(`\n💼 [ROBUST] Creditor ${creditorPosition}: ${creditorName}`);
        console.log(`   📍 Final creditor address: "${creditorAddress}"`);
        console.log(`   💰 Amount: ${replacements["Forderungssumme"]}`);
        console.log(`   📊 Quote: ${replacements["Quote des Gläubigers"]}`);
        console.log(`   📝 Creditor name for replacement: "${creditorName}"`);
        console.log(`   📝 "Name des Gläubigers" replacement value: "${replacements["Name des Gläubigers"]}"`);

        return replacements;
    }

    /**
     * Get German marital status text
     */
    getMaritalStatusText(status) {
        const statusMap = {
      verheiratet: "verheiratet",
      ledig: "ledig",
      geschieden: "geschieden",
      verwitwet: "verwitwet",
      getrennt_lebend: "getrennt lebend",
      married: "verheiratet",
      single: "ledig",
      divorced: "geschieden",
      widowed: "verwitwet",
    };
    return statusMap[status] || "ledig";
  }

  /**
   * Format date in German format with 2-digit day and month (dd.mm.yyyy)
   * Matches format used in firstRoundDocumentGenerator.js
   */
  formatGermanDate(date) {
    if (!date || !(date instanceof Date) || isNaN(date.getTime())) {
      console.error(
        `❌ [ROBUST] Invalid date provided to formatGermanDate: ${date}`
      );
      return "01.01.2025"; // Fallback
    }

    const formatted = date.toLocaleDateString("de-DE", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });

    console.log(`📅 [ROBUST] formatGermanDate() called:`);
    console.log(`   📥 Input date: ${date.toISOString()}`);
    console.log(`   📥 Input date object: ${date.toString()}`);
    console.log(`   📤 Formatted result: "${formatted}"`);
    console.log(`   📊 Result length: ${formatted.length} characters`);
    console.log(
      `   📊 Result format check: ${
        /^\d{2}\.\d{2}\.\d{4}$/.test(formatted)
          ? "✅ Valid format (dd.mm.yyyy)"
          : "❌ Invalid format"
      }`
    );

    return formatted;
    }

    /**
     * Calculate deadline date (2 weeks from now)
     */
    calculateDeadlineDate() {
        const deadline = new Date();
        deadline.setDate(deadline.getDate() + 14);
    return this.formatGermanDate(deadline);
    }

    /**
     * Calculate date in specified number of months
     */
    calculateDateInMonths(months) {
        const futureDate = new Date();
        futureDate.setMonth(futureDate.getMonth() + months);
    return this.formatGermanDate(futureDate);
    }

    /**
     * Format number as German currency
     */
    formatGermanCurrency(amount) {
    return new Intl.NumberFormat("de-DE", {
            minimumFractionDigits: 2,
      maximumFractionDigits: 2,
        }).format(amount);
    }

    /**
     * Escape special regex characters
     */
    escapeRegex(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    }
}

module.exports = RobustNullplanProcessor;
