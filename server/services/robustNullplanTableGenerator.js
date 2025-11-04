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
const replaceCellText = (cellXml, newText) => {
    try {
      // Keep original cell design (w:tcPr, borders, shading, etc.)
      let result = cellXml;
  
      // Replace encoded brackets if any
      result = result.replace(/&lt;/g, "<").replace(/&gt;/g, ">");
  
      // Look for an existing <w:t> node (normal Word text node)
      if (result.includes("<w:t")) {
        // Replace only the text inside first <w:t>…</w:t>
        result = result.replace(/<w:t[^>]*>[\s\S]*?<\/w:t>/, `<w:t xml:space="preserve">${newText}</w:t>`);
      } else if (result.includes("<w:p")) {
        // If <w:p> exists but <w:t> missing, insert text inside paragraph
        result = result.replace(/(<w:p[^>]*>)/, `$1<w:r><w:t xml:space="preserve">${newText}</w:t></w:r>`);
      } else {
        // If cell has no paragraph at all, create one cleanly
        result = result.replace(
          /(<w:tc[^>]*>)([\s\S]*?)(<\/w:tc>)/,
          `$1<w:p><w:r><w:t xml:space="preserve">${newText}</w:t></w:r></w:p>$3`
        );
      }
  
      return result;
    } catch (err) {
      console.error("❌ [ROBUST] replaceCellText() error:", err.message);
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
          .replace(".", ",")} %`;

        // Clone template row and update first 4 cells
        let clonedRow = templateRow;

        // Update cells one by one - replace each cell in order to avoid conflicts
        const updatedCells = cellMatches.map((cell, cellIndex) => {
          if (cellIndex === 0) {
            return replaceCellText(cell, rowNum.toString()); // Column 1: Nr.
          } else if (cellIndex === 1) {
            return replaceCellText(cell, creditorName); // Column 2: Gläubiger
          } else if (cellIndex === 2) {
            return replaceCellText(cell, formattedAmount); // Column 3: Forderung
          } else if (cellIndex === 3) {
            return replaceCellText(cell, formattedQuote); // Column 4: Quote
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

      // Remove old placeholder rows (rows 2-8 that aren't our new rows)
      // Remove rows with "2", "3", etc. that are placeholders
      let cleanedTable = newTableContent;
      for (let i = 2; i <= 8; i++) {
        // Find placeholder rows with this number
        const placeholderPattern = new RegExp(
          `<w:tr[^>]*>[\\s\\S]*?<w:t>${i}<\\/w:t>[\\s\\S]*?<\\/w:tr>`,
          "g"
        );
        cleanedTable = cleanedTable.replace(placeholderPattern, "");
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
