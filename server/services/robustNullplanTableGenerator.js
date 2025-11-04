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
      console.log(`🔄 [ROBUST] populateTableRows() - Processing ${creditorData.length} creditors`);
  
      // 💰 Calculate total debt for quota calculations
      const totalDebt = creditorData.reduce((sum, creditor) =>
        sum +
        (creditor.debt_amount ||
          creditor.final_amount ||
          creditor.original_amount ||
          creditor.amount ||
          creditor.claim_amount ||
          0), 0);
  
      // 🔍 Find the table in the XML
      const tableMatch = documentXml.match(/<w:tbl[^>]*>[\s\S]*?<\/w:tbl>/);
      if (!tableMatch) {
        console.error("❌ [ROBUST] Table not found in XML!");
        return documentXml;
      }
      const tableContent = tableMatch[0];
  
      // 🔍 Find all table rows
      const rowMatches = tableContent.match(/<w:tr[^>]*>[\s\S]*?<\/w:tr>/g);
      if (!rowMatches || rowMatches.length === 0) {
        console.error("❌ [ROBUST] No table rows found!");
        return documentXml;
      }
  
      // 🧩 Locate template row (with <w:t>1</w:t> in first cell)
      let templateRow = null;
      for (let i = 0; i < rowMatches.length; i++) {
        const firstCell = rowMatches[i].match(/<w:tc[^>]*>([\s\S]*?)<\/w:tc>/);
        if (firstCell && firstCell[1].includes("<w:t>1</w:t>")) {
          templateRow = rowMatches[i];
          console.log(`✅ [ROBUST] Found template row at index ${i}`);
          break;
        }
      }
      if (!templateRow) {
        console.error("❌ [ROBUST] Template row not found!");
        return documentXml;
      }
  
      // 🧱 Helper: Build fully valid Word cell XML (Word will render this)
      const buildCell = (width, text, align = "left") => {
        const safeText = (text || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
        return `
          <w:tc>
            <w:tcPr><w:tcW w:w="${width}" w:type="dxa"/></w:tcPr>
            <w:p>
              <w:pPr><w:jc w:val="${align}"/></w:pPr>
              <w:r><w:t xml:space="preserve">${safeText}</w:t></w:r>
            </w:p>
          </w:tc>`;
      };
  
      // 🧩 Extract first row cells for widths
      const cellMatches = templateRow.match(/<w:tc[^>]*>[\s\S]*?<\/w:tc>/g) || [];
      const colWidths = cellMatches.map(cell => {
        const match = cell.match(/w:w="(\d+)"/);
        return match ? match[1] : "2400";
      });
  
      // 🧾 Construct updated rows
      const updatedRows = creditorData.map((creditor, index) => {
        const rowNum = index + 1;
        const name = creditor.creditor_name || creditor.name || `Gläubiger ${rowNum}`;
        const amount = this.formatGermanCurrencyNoSymbol(
          creditor.debt_amount ||
          creditor.final_amount ||
          creditor.original_amount ||
          creditor.amount ||
          creditor.claim_amount ||
          0
        ) + " €";
        const quote = totalDebt ? ((creditor.debt_amount / totalDebt) * 100).toFixed(2).replace(".", ",") + " %" : "0,00 %";
  
        // 🧩 Build row with fully valid structure
        const rowXml = `
          <w:tr>
            ${buildCell(colWidths[0], rowNum.toString(), "center")}
            ${buildCell(colWidths[1], name, "left")}
            ${buildCell(colWidths[2], amount, "right")}
            ${buildCell(colWidths[3], quote, "right")}
          </w:tr>`;
        console.log(`✅ [ROBUST] Row ${rowNum} ready → ${name} | ${amount} | ${quote}`);
        return rowXml;
      });
  
      // 🧹 Replace old rows with new ones
      const cleanedTable = tableContent.replace(
        /<w:tr[^>]*>[\s\S]*?<\/w:tr>/g,
        updatedRows.join("\n")
      );
  
      const result = documentXml.replace(/<w:tbl[^>]*>[\s\S]*?<\/w:tbl>/, cleanedTable);
  
      // 🧾 Log verification
      const xmlPlain = result.replace(/<[^>]+>/g, "");
      creditorData.forEach((c, i) => {
        const nameFound = xmlPlain.includes(c.creditor_name);
        const amtFound = xmlPlain.includes(this.formatGermanCurrencyNoSymbol(c.debt_amount));
        console.log(`🔍 Verify Row ${i + 1}: Name ${nameFound ? "✅ FOUND" : "❌ MISSING"}, Amount ${amtFound ? "✅ FOUND" : "❌ MISSING"}`);
      });
  
      console.log(`✅ [ROBUST] Table populated with ${creditorData.length} rows (Word-visible version)`);
      return result;
    } catch (err) {
      console.error("❌ [ROBUST] Error populating table rows:", err);
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
