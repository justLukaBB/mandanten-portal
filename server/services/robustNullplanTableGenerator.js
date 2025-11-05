const fs = require("fs");
const path = require("path");
const JSZip = require("jszip");

/**
 * Robust Nullplan Table Generator
 * Uses exact XML patterns identified from template analysis
 */
class RobustNullplanTableGenerator {
  constructor() {
    this.templatePath = path.join(
      __dirname,
      "../templates/Nullplan_Table_Template_New.docx"
    );
    this.outputDir = path.join(__dirname, "../documents");

    // Create output directory if it doesn't exist
    if (!fs.existsSync(this.outputDir)) {
      fs.mkdirSync(this.outputDir, { recursive: true });
    }

    // Template mappings for literal text replacement
    // These are placeholder texts that should be in the template document
    this.templateMapping = {
      // Replace hardcoded date
      "16.10.2025": "TODAY_DATE",
      // Replace hardcoded start date
      "16.1.2026": "START_DATE",
    };
  }

  /**
   * Generate Nullplan quota table document using robust pattern matching
   */
  async generateNullplanTable(clientData, creditorData) {
    try {
      console.log(
        "═══════════════════════════════════════════════════════════════"
      );
      console.log("🚀 [ROBUST] TABLE GENERATION FUNCTION CALLED");
      console.log(
        "═══════════════════════════════════════════════════════════════"
      );
      console.log("📊 [ROBUST] Generating Nullplan quota table document...");
      console.log("");

      // LOG INPUT DATA
      console.log("📥 [ROBUST] INPUT DATA RECEIVED:");
      console.log("   📋 Client Data:");
      console.log(
        "      - aktenzeichen:",
        clientData?.aktenzeichen || clientData?.reference || "NOT PROVIDED"
      );
      console.log("      - fullName:", clientData?.fullName || "NOT PROVIDED");
      console.log(
        "      - firstName:",
        clientData?.firstName || "NOT PROVIDED"
      );
      console.log("      - lastName:", clientData?.lastName || "NOT PROVIDED");
      console.log(
        "      - Full clientData object:",
        JSON.stringify(clientData, null, 6)
      );
      console.log("");
      console.log("   👥 Creditor Data:");
      console.log("      - Number of creditors:", creditorData?.length || 0);
      if (creditorData && creditorData.length > 0) {
        creditorData.forEach((creditor, idx) => {
          console.log(`      - Creditor ${idx + 1}:`);
          console.log(
            "         * creditor_name:",
            creditor.creditor_name ||
              creditor.name ||
              creditor.sender_name ||
              "NOT PROVIDED"
          );
          console.log(
            "         * debt_amount:",
            creditor.debt_amount ||
              creditor.final_amount ||
              creditor.amount ||
              0
          );
          console.log(
            "         * Full creditor object:",
            JSON.stringify(creditor, null, 8)
          );
        });
      } else {
        console.log("      ⚠️ WARNING: No creditor data provided!");
      }
      console.log("");

      if (!fs.existsSync(this.templatePath)) {
        console.error(`❌ [ROBUST] Template not found: ${this.templatePath}`);
        throw new Error(
          `Nullplan table template not found: ${this.templatePath}`
        );
      }
      console.log(`✅ [ROBUST] Template file exists: ${this.templatePath}`);

      // Load the template
      console.log("📂 [ROBUST] Loading template file...");
      const templateBuffer = fs.readFileSync(this.templatePath);
      console.log(
        `   ✅ Template loaded: ${Math.round(templateBuffer.length / 1024)} KB`
      );

      console.log("📦 [ROBUST] Extracting ZIP archive...");
      const zip = await JSZip.loadAsync(templateBuffer);
      console.log("   ✅ ZIP archive extracted");

      console.log("📄 [ROBUST] Reading word/document.xml...");
      const documentXml = await zip.file("word/document.xml").async("string");
      console.log(
        `   ✅ Document XML loaded: ${documentXml.length} characters`
      );
      console.log(
        `   📊 XML preview (first 500 chars): ${documentXml.substring(
          0,
          500
        )}...`
      );
      console.log("");

      console.log("📄 [ROBUST] Template loaded, processing data...");

      // Calculate quotas and prepare replacements
      console.log("🔄 [ROBUST] Preparing table replacements...");
      const replacements = this.prepareTableReplacements(
        clientData,
        creditorData
      );

      console.log(
        `🔄 [ROBUST] Applying table replacements: ${
          Object.keys(replacements).length
        } variables`
      );

      // Replace variables in the document XML using robust pattern matching
      let processedXml = documentXml;
      let totalReplacements = 0;

      // Apply literal text replacements
      Object.entries(this.templateMapping).forEach(([oldText, placeholder]) => {
        if (processedXml.includes(`<w:t>${oldText}</w:t>`)) {
          let newText = "";
          switch (placeholder) {
            case "CLIENT_NAME":
              newText =
                clientData.fullName ||
                `${clientData.firstName || ""} ${
                  clientData.lastName || ""
                }`.trim() ||
                "Max Mustermann";
              break;
            case "TODAY_DATE":
              newText = new Date().toLocaleDateString("de-DE");
              break;
            case "START_DATE":
              const startDate = new Date();
              startDate.setMonth(startDate.getMonth() + 3);
              newText = startDate.toLocaleDateString("de-DE");
              break;
            default:
              newText = oldText;
          }
          processedXml = processedXml.replace(
            `<w:t>${oldText}</w:t>`,
            `<w:t>${newText}</w:t>`
          );
          console.log(
            `✅ [ROBUST] Literal text replaced: "${oldText}" → "${newText}"`
          );
          totalReplacements++;
        } else {
          // Silent skip - placeholder text may not exist in template (normal)
          // console.log(`⚠️ [ROBUST] Literal text not found: "${oldText}"`);
        }
      });

      console.log(`✅ [ROBUST] Total replacements made: ${totalReplacements}`);

      // Also replace simple quoted variables (for creditor data)
      Object.entries(replacements).forEach(([variable, value]) => {
        // Skip already processed XML-split patterns
        if (!this.templateMapping[variable]) {
          const quotedVariable = `&quot;${variable}&quot;`;
          if (processedXml.includes(quotedVariable)) {
            processedXml = processedXml.replace(
              new RegExp(this.escapeRegex(quotedVariable), "g"),
              value
            );
            console.log(`✅ [ROBUST] Simple variable replaced: "${variable}"`);
            totalReplacements++;
          }
        }
      });

      console.log(
        `✅ [ROBUST] Total replacements after simple variables: ${totalReplacements}`
      );
      console.log("");
      console.log(
        "═══════════════════════════════════════════════════════════════"
      );
      console.log("🔄 [ROBUST] STARTING TABLE ROW POPULATION");
      console.log(`📊 Creditors to process: ${creditorData.length}`);
      console.log(
        "═══════════════════════════════════════════════════════════════"
      );

      // Always populate table rows with creditor data for new template
      console.log("");
      console.log(
        "═══════════════════════════════════════════════════════════════"
      );
      console.log("🔄 [ROBUST] STARTING TABLE ROW POPULATION");
      console.log(
        "═══════════════════════════════════════════════════════════════"
      );
      console.log("");
      console.log("📊 [ROBUST] DATA BEFORE TABLE INSERTION:");
      console.log(
        "═══════════════════════════════════════════════════════════════"
      );
      console.log(`   👥 Number of creditors: ${creditorData?.length || 0}`);
      console.log("");

      if (creditorData && creditorData.length > 0) {
        console.log(
          "   📊#$$$###@@@@@ Creditor data before table insertion ok ok ok:",
          creditorData ? JSON.stringify(creditorData, null, 10) : "NO DATA"
        );
        creditorData.forEach((creditor, idx) => {
          const creditorNum = idx + 1;
          const creditorName =
            creditor.creditor_name ||
            creditor.name ||
            creditor.sender_name ||
            `Gläubiger ${creditorNum}`;
          const creditorAmount =
            creditor.debt_amount ||
            creditor.final_amount ||
            creditor.original_amount ||
            creditor.amount ||
            creditor.claim_amount ||
            0;
          const formattedAmount =
            this.formatGermanCurrencyNoSymbol(creditorAmount);

          console.log(`   📋 Creditor ${creditorNum} (BEFORE):`);
          console.log(`      ┌─ Raw Data:`);
          console.log(
            `      │  * creditor_name field: "${
              creditor.creditor_name || "NOT SET"
            }"`
          );
          console.log(`      │  * name field: "${creditor.name || "NOT SET"}"`);
          console.log(
            `      │  * sender_name field: "${
              creditor.sender_name || "NOT SET"
            }"`
          );
          console.log(
            `      │  * debt_amount field: ${creditor.debt_amount || "NOT SET"}`
          );
          console.log(
            `      │  * final_amount field: ${
              creditor.final_amount || "NOT SET"
            }`
          );
          console.log(
            `      │  * original_amount field: ${
              creditor.original_amount || "NOT SET"
            }`
          );
          console.log(
            `      │  * amount field: ${creditor.amount || "NOT SET"}`
          );
          console.log(
            `      │  * claim_amount field: ${
              creditor.claim_amount || "NOT SET"
            }`
          );
          console.log(`      └─ Extracted/Calculated:`);
          console.log(`         • Creditor Name: "${creditorName}"`);
          console.log(
            `         • Debt Amount: ${creditorAmount} EUR → "${formattedAmount}"`
          );
          console.log(
            `         • Full creditor object: ${JSON.stringify(
              creditor,
              null,
              10
            )}`
          );
          console.log("");
        });
      } else {
        console.log("   ⚠️ WARNING: No creditor data to insert into table!");
        console.log("");
      }

      console.log(
        `   📊 XML length before population: ${processedXml.length} characters`
      );
      console.log("");

      // Populate table rows
      console.log(
        `🔄 Calling populateTableRows() with ${creditorData.length} creditors...`
      );
      processedXml = this.populateTableRows(processedXml, creditorData);
      console.log(`✅ populateTableRows() completed`);

      console.log("");
      console.log(
        "═══════════════════════════════════════════════════════════════"
      );
      console.log("📊 [ROBUST] DATA AFTER TABLE INSERTION:");
      console.log(
        "═══════════════════════════════════════════════════════════════"
      );
      console.log(
        `   📊 XML length after population: ${processedXml.length} characters`
      );
      console.log(
        `   📊 XML length change: ${
          processedXml.length - documentXml.length
        } characters`
      );
      console.log("");

      // Verify what was actually inserted
      if (creditorData && creditorData.length > 0) {
        creditorData.forEach((creditor, idx) => {
          const creditorNum = idx + 1;
          const creditorName =
            creditor.creditor_name ||
            creditor.name ||
            creditor.sender_name ||
            `Gläubiger ${creditorNum}`;
          const creditorAmount =
            creditor.debt_amount ||
            creditor.final_amount ||
            creditor.original_amount ||
            creditor.amount ||
            creditor.claim_amount ||
            0;
          const formattedAmount =
            this.formatGermanCurrencyNoSymbol(creditorAmount);

          // Calculate quote for verification
          const totalDebt = creditorData.reduce((sum, c) => {
            return (
              sum +
              (c.debt_amount ||
                c.final_amount ||
                c.original_amount ||
                c.amount ||
                c.claim_amount ||
                0)
            );
          }, 0);
          const creditorQuote =
            totalDebt > 0 ? (creditorAmount / totalDebt) * 100 : 0;
          const formattedQuote = `${creditorQuote
            .toFixed(2)
            .replace(".", ",")}%`;

          const nameInResult = processedXml.includes(creditorName);
          const amountInResult = processedXml.includes(formattedAmount);
          const quoteInResult = processedXml.includes(formattedQuote);

          console.log(`   ✅ Creditor ${creditorNum} (AFTER - in XML):`);
          console.log(`      ┌─ Inserted Data:`);
          console.log(
            `      │  • Creditor Name: "${creditorName}" → ${
              nameInResult ? "✅ FOUND" : "❌ NOT FOUND"
            }`
          );
          console.log(
            `      │  • Debt Amount: "${formattedAmount}" → ${
              amountInResult ? "✅ FOUND" : "❌ NOT FOUND"
            }`
          );
          console.log(
            `      │  • Quote: "${formattedQuote}" → ${
              quoteInResult ? "✅ FOUND" : "❌ NOT FOUND"
            }`
          );
          console.log(
            `      └─ Verification: ${
              nameInResult && amountInResult && quoteInResult
                ? "✅ ALL DATA PRESENT"
                : "❌ SOME DATA MISSING"
            }`
          );
          console.log("");
        });
      }

      console.log("✅ [ROBUST] Table row population completed");
      console.log("");

      // Update the document XML in the zip
      console.log("💾 [ROBUST] Updating document XML in ZIP archive...");
      zip.file("word/document.xml", processedXml);
      console.log("   ✅ Document XML updated in ZIP");

      // Generate output
      console.log("📦 [ROBUST] Generating final DOCX file...");
      const outputBuffer = await zip.generateAsync({ type: "nodebuffer" });
      const filename = `Schuldenbereinigungsplan_${
        clientData?.aktenzeichen || clientData?.reference
      }_${new Date().toISOString().split("T")[0]}.docx`;
      const outputPath = path.join(this.outputDir, filename);

      console.log(`   📁 Output path: ${outputPath}`);
      fs.writeFileSync(outputPath, outputBuffer);
      console.log("   ✅ File written to disk");

      console.log("");
      console.log(
        "═══════════════════════════════════════════════════════════════"
      );
      console.log("✅ [ROBUST] Nullplan table document generated successfully");
      console.log(
        "═══════════════════════════════════════════════════════════════"
      );
      console.log(`📁 File: ${filename}`);
      console.log(`📊 Size: ${Math.round(outputBuffer.length / 1024)} KB`);
      console.log(`📂 Path: ${outputPath}`);
      console.log("");

      return {
        success: true,
        filename: filename,
        path: outputPath,
        size: outputBuffer.length,
      };
    } catch (error) {
      console.error(
        "❌ [ROBUST] Error generating Nullplan table:",
        error.message
      );
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Prepare all table replacements with robust data handling
   */
  prepareTableReplacements(clientData, creditorData) {
    console.log("📊 [ROBUST] prepareTableReplacements() called");
    console.log("   📥 Input clientData:", JSON.stringify(clientData, null, 6));
    console.log(
      "   📥 Input creditorData:",
      JSON.stringify(creditorData, null, 6)
    );

    // Calculate total debt
    console.log("💰 [ROBUST] Calculating total debt from creditors...");
    const totalDebt = creditorData.reduce((sum, creditor, idx) => {
      const debt =
        creditor.debt_amount || creditor.final_amount || creditor.amount || 0;
      console.log(`- Creditor ${idx + 1}: ${debt} EUR`);
      return sum + debt;
    }, 0);

    console.log(
      `💰 [ROBUST] Total debt calculated: ${this.formatGermanCurrency(
        totalDebt
      )} from ${creditorData.length} creditors`
    );

    // Client name
    const clientName =
      clientData.fullName ||
      `${clientData.firstName || ""} ${clientData.lastName || ""}`.trim() ||
      "Max Mustermann";
    console.log(`👤 [ROBUST] Client name extracted: "${clientName}"`);

    // Replacements for the new template - will be handled by populateTableRows
    const replacements = {};

    console.log("📋 [ROBUST] Table replacements prepared:");
    if (Object.keys(replacements).length === 0) {
      console.log(
        "   ℹ️ No variable replacements (will be handled by populateTableRows)"
      );
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
    return startDate.toLocaleDateString("de-DE");
  }

  /**
   * Format number as German currency without symbol
   */
  formatGermanCurrency(amount) {
    return (
      new Intl.NumberFormat("de-DE", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(amount) + " €"
    );
  }

  /**
   * Format number as German currency without symbol (for table cells)
   */
  formatGermanCurrencyNoSymbol(amount) {
    return new Intl.NumberFormat("de-DE", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  }

  /**
   * Populate table rows with creditor data dynamically
   * NEW APPROACH: Clone template row and fill first 4 columns only
   */
  populateTableRows(documentXml, creditorData) {
    try {
      console.log(
        `🔄 [ROBUST] populateTableRows() - Processing ${creditorData.length} creditors`
      );

      // Calculate total debt for quota calculations
      const totalDebt = creditorData.reduce((sum, creditor) => {
        return (
          sum +
          (creditor.debt_amount ||
            creditor.final_amount ||
            creditor.original_amount ||
            creditor.amount ||
            creditor.claim_amount ||
            0)
        );
      }, 0);

      // Find the table in the XML
      const tableMatch = documentXml.match(/<w:tbl[^>]*>([\s\S]*?)<\/w:tbl>/);
      if (!tableMatch) {
        console.error("❌ [ROBUST] Table not found in XML!");
        return documentXml;
      }

      const tableContent = tableMatch[0];

      // Find all table rows
      const rowMatches = tableContent.match(/<w:tr[^>]*>[\s\S]*?<\/w:tr>/g);
      if (!rowMatches || rowMatches.length === 0) {
        console.error("❌ [ROBUST] No table rows found!");
        return documentXml;
      }

      // Find template row (the one with "1" in the first cell)
      let templateRow = null;
      let templateRowIndex = -1;

      for (let i = 0; i < rowMatches.length; i++) {
        const row = rowMatches[i];
        // Check if this row contains "<w:t>1</w:t>" in the first cell
        // First cell should be within the first <w:tc>...</w:tc>
        const firstCellMatch = row.match(/<w:tc[^>]*>([\s\S]*?)<\/w:tc>/);
        if (firstCellMatch && firstCellMatch[1].includes("<w:t>1</w:t>")) {
          templateRow = row;
          templateRowIndex = i;
          console.log(`✅ [ROBUST] Found template row at index ${i}`);
          break;
        }
      }

      if (!templateRow) {
        console.error('❌ [ROBUST] Template row (with "1") not found!');
        return documentXml;
      }

  // ✅ FIXED: replaceCellText() that preserves design and ensures visible text
const replaceCellText = (cellXml, newText, cellIndex = -1) => {
    try {
      // For creditor name cells (cellIndex === 1), log the XML structure for debugging
      if (cellIndex === 1) {
        console.log(`\n📋 [ROBUST] Processing Gläubiger cell (cellIndex === 1)`);
        console.log(`   📥 Original text: "${newText}"`);
        console.log(`   📄 Original cell XML (first 500 chars):`);
        console.log(`   ${cellXml.substring(0, 500)}${cellXml.length > 500 ? '...' : ''}`);
        console.log(`   📄 Full cell XML length: ${cellXml.length} characters`);
      }
      
      // For creditor name cells (cellIndex === 1), optimize text to reduce unnecessary wrapping
      let processedText = newText;
      if (cellIndex === 1) {
        processedText = processedText.replace(/\u00AD/g, '-');
        processedText = processedText.replace(/\s+/g, ' ');
        processedText = processedText.trim();
        processedText = processedText.replace(/([a-zA-ZäöüßÄÖÜ])-([a-zA-ZäöüßÄÖÜ])/g, '$1\u2011$2');
        console.log(`   🔧 Processed text: "${processedText}"`);
      }
      
      const escapedText = processedText
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
  
      // Strategy: Find first <w:t> node and replace its content, remove other text runs
      // This preserves cell properties (w:tcPr) and paragraph properties (w:pPr)
      
      let result = cellXml;
      
      // For creditor name cells (cellIndex === 1), ensure cell width is properly set
      // This helps prevent unnecessary wrapping and empty space
      if (cellIndex === 1) {
        console.log(`   🔍 Analyzing cell structure...`);
        
        // Check if cell has w:tcPr (cell properties)
        const cellPrMatch = result.match(/<w:tcPr[^>]*>([\s\S]*?)<\/w:tcPr>/);
        if (cellPrMatch) {
          console.log(`   ✅ Found w:tcPr (cell properties):`);
          console.log(`      ${cellPrMatch[0].substring(0, 200)}${cellPrMatch[0].length > 200 ? '...' : ''}`);
          
          // Check for width settings
          const widthMatch = cellPrMatch[0].match(/w:tcW[^>]*>/);
          if (widthMatch) {
            console.log(`   ✅ Found w:tcW (cell width): ${widthMatch[0]}`);
          } else {
            console.log(`   ⚠️ No w:tcW found in cell properties`);
          }
        } else {
          console.log(`   ⚠️ No w:tcPr found, adding basic cell properties...`);
          // If no w:tcPr exists, add one to ensure proper cell formatting
          const cellStartMatch = result.match(/(<w:tc[^>]*>)/);
          if (cellStartMatch) {
            // Add basic cell properties after cell start tag
            result = result.replace(
              cellStartMatch[0],
              `${cellStartMatch[0]}<w:tcPr><w:tcW w:w="0" w:type="auto"/></w:tcPr>`
            );
            console.log(`   ✅ Added w:tcPr with auto width`);
          }
        }
        
        // Check for paragraph properties
        const pPrMatch = result.match(/<w:pPr[^>]*>([\s\S]*?)<\/w:pPr>/);
        if (pPrMatch) {
          console.log(`   ✅ Found w:pPr (paragraph properties):`);
          console.log(`      ${pPrMatch[0].substring(0, 200)}${pPrMatch[0].length > 200 ? '...' : ''}`);
          
          // Remove or reduce excessive right indentation that causes empty space
          let updatedPPr = pPrMatch[0];
          let needsUpdate = false;
          
          // Check and fix right indent
          // Match <w:ind> tag (handles both self-closing and with closing tag)
          const rightIndentMatch = updatedPPr.match(/<w:ind[^>]*w:right="(\d+)"[^>]*\/?>/);
          if (rightIndentMatch) {
            const rightIndentValue = parseInt(rightIndentMatch[1]);
            console.log(`   ⚠️ Found excessive right indent: ${rightIndentValue} twips`);
            
            if (rightIndentValue > 100) {
              // Replace the right indent value with 0 to allow full cell width usage
              // This handles both self-closing tags <w:ind w:right="2198"/> and regular tags
              updatedPPr = updatedPPr.replace(/w:right="\d+"/, 'w:right="0"');
              console.log(`   🔧 Removed excessive right indent (set to 0)`);
              needsUpdate = true;
            }
          }
          
          // Change justification from "right" to "left" for better text flow
          if (updatedPPr.includes('w:jc w:val="right"')) {
            updatedPPr = updatedPPr.replace(/w:jc w:val="right"/, 'w:jc w:val="left"');
            console.log(`   🔧 Changed justification from right to left`);
            needsUpdate = true;
          }
          
          // Apply the updated paragraph properties if changes were made
          if (needsUpdate) {
            result = result.replace(pPrMatch[0], updatedPPr);
            console.log(`   ✅ Updated paragraph properties applied`);
          }
        } else {
          console.log(`   ⚠️ No w:pPr found`);
        }
        
        // Check for text runs
        const textRuns = result.match(/<w:r[^>]*>[\s\S]*?<\/w:r>/g);
        if (textRuns) {
          console.log(`   ✅ Found ${textRuns.length} text run(s)`);
          textRuns.forEach((run, idx) => {
            console.log(`      Run ${idx + 1} (first 150 chars): ${run.substring(0, 150)}${run.length > 150 ? '...' : ''}`);
          });
        } else {
          console.log(`   ⚠️ No text runs found`);
        }
      }
      
      // Find all text runs in the cell
      const textRunMatches = result.match(/<w:r[^>]*>[\s\S]*?<\/w:r>/g) || [];
      
      if (textRunMatches.length > 0) {
        // Replace content of first text run, remove others
        const firstTextRun = textRunMatches[0];
        // Find the <w:t> node in first run
        const textNodeMatch = firstTextRun.match(/<w:t[^>]*>[\s\S]*?<\/w:t>/);
        if (textNodeMatch) {
          // Replace the text node content
          // Extract attributes from original text node
          const textNodeAttrs = textNodeMatch[0].match(/<w:t[^>]*>/);
          const attrs = textNodeAttrs ? textNodeAttrs[0].replace(/^<w:t/, "").replace(/>$/, "") : "";
          const newTextNode = `<w:t${attrs} xml:space="preserve">${escapedText}</w:t>`;
          const updatedFirstRun = firstTextRun.replace(textNodeMatch[0], newTextNode);
          
          // Replace first run with updated version, remove all other runs
          result = result.replace(firstTextRun, updatedFirstRun);
          // Remove remaining text runs
          for (let i = 1; i < textRunMatches.length; i++) {
            result = result.replace(textRunMatches[i], "");
          }
        } else {
          // No <w:t> in first run, add it
          const updatedFirstRun = firstTextRun.replace(
            /<\/w:r>/,
            `<w:t xml:space="preserve">${escapedText}</w:t></w:r>`
          );
          result = result.replace(firstTextRun, updatedFirstRun);
          // Remove remaining runs
          for (let i = 1; i < textRunMatches.length; i++) {
            result = result.replace(textRunMatches[i], "");
          }
        }
      } else if (result.includes("<w:p")) {
        // Paragraph exists but no text runs, add one
        const paragraphMatch = result.match(/<w:p[^>]*>/);
        if (paragraphMatch) {
          result = result.replace(
            paragraphMatch[0],
            `${paragraphMatch[0]}<w:r><w:t xml:space="preserve">${escapedText}</w:t></w:r>`
          );
        }
      } else {
        // No paragraph, create one
        const cellMatch = result.match(/(<w:tc[^>]*>)([\s\S]*?)(<\/w:tc>)/);
        if (cellMatch) {
          result = `${cellMatch[1]}<w:p><w:r><w:t xml:space="preserve">${escapedText}</w:t></w:r></w:p>${cellMatch[3]}`;
        }
      }
  
      // For creditor name cells (cellIndex === 1), log the final XML structure
      if (cellIndex === 1) {
        console.log(`   📤 Final cell XML (first 500 chars):`);
        console.log(`   ${result.substring(0, 500)}${result.length > 500 ? '...' : ''}`);
        console.log(`   📤 Final cell XML length: ${result.length} characters`);
        console.log(`   ✅ Cell processing complete\n`);
      }
  
      return result;
    } catch (err) {
      console.error("❌ [ROBUST] replaceCellText() error:", err.message);
      console.error("   Cell XML:", cellXml.substring(0, 200));
      console.error("   New Text:", newText);
      return cellXml;
    }
  };
  
    

      // Extract cells from template row
      const cellMatches = templateRow.match(/<w:tc[^>]*>[\s\S]*?<\/w:tc>/g);
      if (!cellMatches || cellMatches.length < 4) {
        console.error(
          `❌ [ROBUST] Template row has only ${
            cellMatches?.length || 0
          } cells, need at least 4!`
        );
        return documentXml;
      }

      // Update template row for first creditor, then clone for remaining creditors
      const updatedRows = [];

      creditorData.forEach((creditor, index) => {
        const rowNum = index + 1;
        const creditorName =
          creditor.creditor_name ||
          creditor.name ||
          creditor.sender_name ||
          `Gläubiger ${rowNum}`;
        const creditorAmount =
          creditor.debt_amount ||
          creditor.final_amount ||
          creditor.original_amount ||
          creditor.amount ||
          creditor.claim_amount ||
          0;
        const formattedAmount =
          this.formatGermanCurrencyNoSymbol(creditorAmount) + " €";
        const creditorQuote =
          totalDebt > 0 ? (creditorAmount / totalDebt) * 100 : 0;
        const formattedQuote = `${creditorQuote
          .toFixed(2)
          .replace(".", ",")}%`;

        // Clone template row and update first 4 cells
        let clonedRow = templateRow;

        // Update cells one by one - replace each cell in order to avoid conflicts
        const updatedCells = cellMatches.map((cell, cellIndex) => {
          if (cellIndex === 0) {
            return replaceCellText(cell, rowNum.toString(), cellIndex); // Column 1: Nr.
          } else if (cellIndex === 1) {
            return replaceCellText(cell, creditorName, cellIndex); // Column 2: Gläubiger
          } else if (cellIndex === 2) {
            return replaceCellText(cell, formattedAmount, cellIndex); // Column 3: Forderung
          } else if (cellIndex === 3) {
            return replaceCellText(cell, formattedQuote, cellIndex); // Column 4: Quote
          } else {
            return cell; // Keep other cells unchanged
          }
        });

        // Reconstruct row: row start + updated cells + row end
        const rowStartMatch = clonedRow.match(/^<w:tr[^>]*>/);
        const rowStart = rowStartMatch ? rowStartMatch[0] : "<w:tr>";

        // Reconstruct the row by replacing cells in order
        let reconstructedRow = rowStart;
        cellMatches.forEach((originalCell, idx) => {
          reconstructedRow += updatedCells[idx];
        });
        reconstructedRow += "</w:tr>";

        updatedRows.push(reconstructedRow);
        console.log(
          `✅ [ROBUST] Row ${rowNum} prepared: ${creditorName} - ${formattedAmount} - ${formattedQuote}`
        );
        
        // Debug: Verify the row contains the expected data
        // Check for both escaped and unescaped versions
        const escapedName = creditorName.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
        const nameInRow = reconstructedRow.includes(creditorName) || reconstructedRow.includes(escapedName);
        const amountInRow = reconstructedRow.includes(formattedAmount.replace(" €", "")) || reconstructedRow.includes(formattedAmount.replace(" €", "").replace(".", ","));
        const quoteInRow = reconstructedRow.includes(formattedQuote.replace("%", "")) || reconstructedRow.includes(formattedQuote.replace("%", "").replace(".", ","));
        console.log(
          `   🔍 [ROBUST] Row ${rowNum} verification: name=${nameInRow ? "✅" : "❌"}, amount=${amountInRow ? "✅" : "❌"}, quote=${quoteInRow ? "✅" : "❌"}`
        );
        if (!nameInRow || !amountInRow || !quoteInRow) {
          console.log(`   ⚠️ [ROBUST] Row ${rowNum} XML preview: ${reconstructedRow.substring(0, 800)}`);
          console.log(`   ⚠️ [ROBUST] Looking for: name="${creditorName}", amount="${formattedAmount.replace(" €", "")}", quote="${formattedQuote.replace("%", "")}"`);
        }
      });

      // Insert new rows after template row and remove old placeholder rows
      let result = documentXml;
      const tableStart = result.indexOf("<w:tbl");
      const tableEnd =
        result.indexOf("</w:tbl>", tableStart) + "</w:tbl>".length;

      // Extract table content
      const beforeTable = result.substring(0, tableStart);
      const tableFull = result.substring(tableStart, tableEnd);
      const afterTable = result.substring(tableEnd);

      // Find template row position in table
      const templateRowPos = tableFull.indexOf(templateRow);
      if (templateRowPos === -1) {
        console.error("❌ [ROBUST] Template row not found in table!");
        return documentXml;
      }

      // Find position after template row (we'll replace template row with first creditor row)
      const afterTemplateRow = templateRowPos + templateRow.length;

      // Replace template row with first updated row, then append remaining rows
      const beforeTemplateRow = tableFull.substring(0, templateRowPos);
      const afterTemplateRowContent = tableFull.substring(afterTemplateRow);

      // Build new table content: before template + updated rows (including replacement of template) + after template
      const newTableContent =
        beforeTemplateRow + updatedRows.join("") + afterTemplateRowContent;

      // Remove old placeholder rows (rows 2-8 that existed BEFORE our new rows)
      // IMPORTANT: Only remove placeholders that are in afterTemplateRowContent, not in our newly inserted rows
      let cleanedTable = newTableContent;
      
      // First, identify all rows in the afterTemplateRowContent section (old placeholders)
      const afterRows = afterTemplateRowContent.match(/<w:tr[^>]*>[\s\S]*?<\/w:tr>/g) || [];
      
      // Remove placeholder rows (2-8) only from the after section
      for (let i = 2; i <= 8; i++) {
        afterRows.forEach((row) => {
          // Check if this row contains the placeholder number in the first cell
          const firstCellMatch = row.match(/<w:tc[^>]*>([\s\S]*?)<\/w:tc>/);
          if (firstCellMatch && firstCellMatch[1].includes(`<w:t>${i}</w:t>`)) {
            // This is a placeholder row, remove it
            cleanedTable = cleanedTable.replace(row, "");
          }
        });
      }

      // Reconstruct final XML
      // ✅ Properly rewrap the cleaned content inside the original <w:tbl> tags
      const tableOpenTagMatch = tableFull.match(/<w:tbl[^>]*>/);
      const tableCloseTag = "</w:tbl>";
      const tableOpenTag = tableOpenTagMatch ? tableOpenTagMatch[0] : "<w:tbl>";

      const rebuiltTable = `${tableOpenTag}${cleanedTable}${tableCloseTag}`;

      // Replace the entire old table in the document with the rebuilt one
      result = result.replace(/<w:tbl[^>]*>[\s\S]*?<\/w:tbl>/, rebuiltTable);

      console.log(
        `✅ [ROBUST] Table populated with ${creditorData.length} creditor rows and reinserted correctly`
      );

      // Debug: Verify rows are in final XML
      creditorData.forEach((creditor, index) => {
        const rowNum = index + 1;
        const creditorName =
          creditor.creditor_name ||
          creditor.name ||
          creditor.sender_name ||
          `Gläubiger ${rowNum}`;
        const creditorAmount =
          creditor.debt_amount ||
          creditor.final_amount ||
          creditor.original_amount ||
          creditor.amount ||
          creditor.claim_amount ||
          0;
        const formattedAmount =
          this.formatGermanCurrencyNoSymbol(creditorAmount);
        const creditorQuote =
          totalDebt > 0 ? (creditorAmount / totalDebt) * 100 : 0;
        const formattedQuote = `${creditorQuote
          .toFixed(2)
          .replace(".", ",")}%`;

        // Check for both escaped and unescaped versions
        const escapedName = creditorName.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
        const nameInFinal = result.includes(creditorName) || result.includes(escapedName);
        const amountInFinal = result.includes(formattedAmount) || result.includes(formattedAmount.replace(".", ","));
        const quoteInFinal = result.includes(formattedQuote.replace("%", "")) || result.includes(formattedQuote.replace("%", "").replace(".", ","));

        console.log(
          `   🔍 [ROBUST] Final XML check Row ${rowNum}: name=${nameInFinal ? "✅" : "❌"}, amount=${amountInFinal ? "✅" : "❌"}, quote=${quoteInFinal ? "✅" : "❌"}`
        );
        
        if (!nameInFinal || !amountInFinal || !quoteInFinal) {
          // Extract table content for debugging
          const tableMatch = result.match(/<w:tbl[^>]*>[\s\S]*?<\/w:tbl>/);
          if (tableMatch) {
            const tableContent = tableMatch[0];
            console.log(`   ⚠️ [ROBUST] Table content preview (first 1000 chars): ${tableContent.substring(0, 1000)}`);
          }
        }
      });

      console.log(
        `✅ [ROBUST] Table populated with ${creditorData.length} creditor rows`
      );

      return result;
    } catch (error) {
      console.error("❌ [ROBUST] Error populating table rows:", error.message);
      console.error("   Stack:", error.stack);
      return documentXml;
    }
  }

  /**
   * Escape special regex characters
   */
  escapeRegex(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }
}

module.exports = RobustNullplanTableGenerator;
