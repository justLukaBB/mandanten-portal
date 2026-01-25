const fs = require("fs").promises;
const path = require("path");
const Docxtemplater = require("docxtemplater");
const PizZip = require("pizzip");
const { formatAddress } = require("../utils/addressFormatter");

/**
 * First Round Document Generator
 * Generates individual DOCX files for each creditor using the template
 */
class FirstRoundDocumentGenerator {
  constructor() {
    this.templatePath = path.join(__dirname, "../templates/1.Schreiben-Aktuell.docx");
    this.outputDir = path.join(__dirname, "../generated_documents/first_round");
  }

  /**
   * Generate DOCX files for all creditors
   */
  async generateCreditorDocuments(clientData, creditors, client) {
    try {
      console.log(
        `📄 Generating first round documents for ${creditors.length} creditors...`
      );

      // Ensure output directory exists
      await this.ensureOutputDirectory();

      const results = [];
      const errors = [];

      for (let i = 0; i < creditors.length; i++) {
        const creditor = creditors[i];
        console.log(
          `   Processing ${i + 1}/${creditors.length}: ${creditor.creditor_name || creditor.sender_name
          }`
        );

        // Find matching document by reference_number
        const matchedDoc = client.documents?.find(
          (doc) =>
            doc.extracted_data?.creditor_data?.reference_number &&
            doc.extracted_data.creditor_data.reference_number === creditor.reference_number
        );

        // If found, and creditor has no actual_creditor, copy it from the document
        if (
          (!creditor.actual_creditor || creditor.actual_creditor.trim() === '') &&
          matchedDoc?.extracted_data?.creditor_data?.actual_creditor
        ) {
          creditor.actual_creditor = matchedDoc.extracted_data.creditor_data.actual_creditor;
        }

        try {
          const result = await this.generateSingleCreditorDocument(
            clientData,
            creditor
          );
          results.push(result);
        } catch (error) {
          console.error(
            `❌ Failed to generate document for ${creditor.creditor_name || creditor.sender_name
            }: ${error.message}`
          );
          errors.push({
            creditor: creditor.creditor_name || creditor.sender_name,
            error: error.message,
          });
        }
      }

      console.log(
        `✅ Generated ${results.length}/${creditors.length} documents successfully`
      );
      if (errors.length > 0) {
        console.log(`❌ ${errors.length} documents failed to generate`);
      }

      return {
        success: true,
        documents: results,
        errors: errors,
        total_generated: results.length,
        total_failed: errors.length,
      };
    } catch (error) {
      console.error(`❌ Error in generateCreditorDocuments: ${error.message}`);
      return {
        success: false,
        error: error.message,
        documents: [],
        errors: [],
      };
    }
  }

  /**
   * Generate a single DOCX document for one creditor
   */
  async generateSingleCreditorDocument(clientData, creditor) {
    try {
      // Read the template file
      const templateContent = await fs.readFile(this.templatePath);
      const zip = new PizZip(templateContent);
      const doc = new Docxtemplater(zip, {
        paragraphLoop: true,
        linebreaks: true,
        delimiters: {
          start: '"',
          end: '"',
        },
      });

      // Prepare the data for replacement
      const templateData = this.prepareTemplateData(clientData, creditor);

      // Debug: Log template data
      console.log('🔍 Template Data for creditor:', creditor.sender_name || creditor.creditor_name);
      console.log('   Template variables:', Object.keys(templateData));
      console.log('   Values:', {
        'Adresse des Creditors': templateData['Adresse des Creditors']?.substring(0, 50),
        'Creditor': templateData['Creditor'],
        'Aktenzeichen des Credtiors': templateData['Aktenzeichen des Credtiors'],
        'Name': templateData['Name'],
        'Geburtstag': templateData['Geburtstag'],
        'Adresse': templateData['Adresse']?.substring(0, 50),
        'Aktenzeichen des Mandanten': templateData['Aktenzeichen des Mandanten'],
        'heutiges Datum': templateData['heutiges Datum'],
        'Datum in 14 Tagen': templateData['Datum in 14 Tagen']
      });

      // Render the document with the data
      try {
        doc.render(templateData);
        console.log('✅ Document rendered successfully');
      } catch (renderError) {
        console.error('❌ Error rendering document:', renderError.message);
        if (renderError.properties) {
          console.error('   Missing variables:', renderError.properties);
        }
        throw renderError;
      }

      // Fix German hyphenation issues in the rendered document
      this.fixDocumentHyphenation(doc);

      // Fix excessive spacing issues in the rendered document
      this.fixDocumentSpacing(doc);

      // Generate the output buffer
      const outputBuffer = doc.getZip().generate({
        type: "nodebuffer",
        compression: "DEFLATE",
      });

      // Generate filename
      const creditorName = (
        creditor.creditor_name ||
        creditor.sender_name ||
        "UnknownCreditor"
      )
        .replace(/[^a-zA-Z0-9äöüßÄÖÜ\s-]/g, "") // Remove special characters
        .replace(/\s+/g, "_") // Replace spaces with underscores
        .substring(0, 50); // Limit length

      const filename = `${clientData.reference}_${creditorName}_Erstschreiben.docx`;
      const outputPath = path.join(this.outputDir, filename);

      // Save the file
      await fs.writeFile(outputPath, outputBuffer);

      const stats = await fs.stat(outputPath);

      return {
        success: true,
        creditor_name: creditor.creditor_name || creditor.sender_name,
        creditor_id: creditor.id,
        filename: filename,
        path: outputPath,
        size: stats.size,
        generated_at: new Date().toISOString(),
      };
    } catch (error) {
      console.error(
        `❌ Error generating document for creditor: ${error.message}`
      );
      throw error;
    }
  }

  /**
   * Fix German hyphenation issues in the rendered Word document
   */
  fixDocumentHyphenation(doc) {
    try {
      // Get the document XML
      const zip = doc.getZip();
      let documentXml = zip.files["word/document.xml"].asText();

      // Define hyphenation fixes
      const hyphenationFixes = {
        "Eini-gungsversuchs": "Einigungsversuchs",
        "Eini- gungsversuchs": "Einigungsversuchs",
        "Eini-\ngungsversuchs": "Einigungsversuchs",
        "Eini- \ngungsversuchs": "Einigungsversuchs",
        "die-sem": "diesem",
        "die- sem": "diesem",
        "Da-ten": "Daten",
        "Da- ten": "Daten",
        "gebe-ten": "gebeten",
        "gebe- ten": "gebeten",
        "Ange-le-genheit": "Angelegenheit",
        "Ange- le- genheit": "Angelegenheit",
        "Her-ausrechnung": "Herausrechnung",
        "Her- ausrechnung": "Herausrechnung",
        "Vollstreckungsmaß-nahmen": "Vollstreckungsmaßnahmen",
        "Vollstreckungsmaß- nahmen": "Vollstreckungsmaßnahmen",
        "Verbraucherinsolvenz-verfahrens": "Verbraucherinsolvenzverfahrens",
        "Verbraucherinsolvenz- verfahrens": "Verbraucherinsolvenzverfahrens",
        "Schuldnerin/Der": "Schuldnerin/den",
        "Schuldner/in": "Schuldner/die Schuldnerin",
      };

      for (const [broken, fixed] of Object.entries(hyphenationFixes)) {
        const regex = new RegExp(broken.replace(/[-\s]/g, "[-\\s]*"), "gi");
        documentXml = documentXml.replace(regex, fixed);
      }
      console.log('   🔍 Fixing "Eini-" hyphenation across XML elements...');

      // First, let's find and log the exact XML structure around "Eini-"
      const einiMatches = documentXml.match(/Eini-[^<]*<\/w:t>/gi);
      if (einiMatches && einiMatches.length > 0) {
        console.log(
          `   📍 Found ${einiMatches.length} instance(s) of "Eini-" in XML`
        );
        einiMatches.forEach((match, idx) => {
          console.log(`      Instance ${idx + 1}: "${match}"`);
        });
      }

      const einiContextMatches = documentXml.match(
        /Eini-[^<]*<\/w:t><\/w:r>[\s\S]{0,200}/gi
      );
      if (einiContextMatches && einiContextMatches.length > 0) {
        einiContextMatches.forEach((match, idx) => {
          console.log(
            `   📄 Context ${idx + 1
            } (first 200 chars after "Eini-"): "${match.substring(0, 200)}"`
          );
        });
      }

      let fixesApplied = 0;
      const beforeAll = documentXml;
      const pattern1 =
        /(<w:t[^>]*>)Eini-(\s*<\/w:t><\/w:r>[\s\S]*?<w:r[^>]*><w:t[^>]*>)gungsversuchs([^<]*)/gi;
      documentXml = documentXml.replace(pattern1, (match, p1, p2, p3) => {
        console.log(
          `   🔧 Pattern 1 matched: Found "Eini-" followed by "gungsversuchs"`
        );
        console.log(`      Match: "${match.substring(0, 150)}..."`);
        console.log(`      p1 (opening tag): "${p1}"`);
        console.log(`      p2 (middle XML): "${p2.substring(0, 100)}..."`);
        console.log(`      p3 (after gungsversuchs): "${p3}"`);
        fixesApplied++;
        return p1 + "Einigungsversuchs" + p2 + p3;
      });

      // Pattern 2: "Eini-" with space(s) inside the text element
      // This handles: <w:t>Eini- </w:t> (space before closing tag)
      const pattern2 =
        /(<w:t[^>]*>)Eini-\s+(\s*<\/w:t><\/w:r>[\s\S]*?<w:r[^>]*><w:t[^>]*>)gungsversuchs([^<]*)/gi;
      documentXml = documentXml.replace(pattern2, (match, p1, p2, p3) => {
        console.log(
          `   🔧 Pattern 2 matched: Found "Eini- " (with space) followed by "gungsversuchs"`
        );
        fixesApplied++;
        return p1 + "Einigungsversuchs" + p2 + p3;
      });

      const pattern3 =
        /(<w:t[^>]*>)Eini-(\s*<\/w:t><\/w:r>[\s\S]*?<w:r[^>]*><w:t[^>]*>)gungsversuchs<\/w:t>/gi;
      documentXml = documentXml.replace(pattern3, (match, p1, p2) => {
        console.log(
          `   🔧 Pattern 3 matched: Found "Eini-" followed by "gungsversuchs" at end of run`
        );
        fixesApplied++;
        return p1 + "Einigungsversuchs" + p2 + "</w:t>";
      });

      const pattern4 =
        /(<w:t[^>]*>)Eini-(\s*&nbsp;?\s*<\/w:t><\/w:r>[\s\S]*?<w:r[^>]*><w:t[^>]*>)gungsversuchs([^<]*)/gi;
      documentXml = documentXml.replace(pattern4, (match, p1, p2, p3) => {
        console.log(
          `   🔧 Pattern 4 matched: Found "Eini-" with space entity followed by "gungsversuchs"`
        );
        fixesApplied++;
        return p1 + "Einigungsversuchs" + p2.replace(/&nbsp;?\s*/g, "") + p3;
      });

      // Pattern 5: More aggressive - find "Eini-" anywhere, then look for "gungsversuchs" nearby
      // This is a fallback to catch any cases we might have missed (handles any XML structure)
      const before5 = documentXml;
      documentXml = documentXml.replace(
        /(<w:t[^>]*>)Eini-(\s*<\/w:t><\/w:r>[\s\S]{0,500}?<w:r[^>]*><w:t[^>]*>)gungsversuchs([^<]*)/gi,
        (match, p1, p2, p3) => {
          console.log(
            `   🔧 Pattern 5 matched: Found "Eini-" and "gungsversuchs" (fallback pattern)`
          );
          fixesApplied++;
          return p1 + "Einigungsversuchs" + p2 + p3;
        }
      );
      // Only count if it actually changed something
      if (documentXml === before5 && fixesApplied === 0) {
        // No patterns matched yet, try one more time with a simpler approach
        const simpleMatch = documentXml.match(
          /Eini-[\s\S]{0,1000}?gungsversuchs/gi
        );
        if (simpleMatch) {
          console.log(
            `   🔍 Found "Eini-" and "gungsversuchs" in same area, attempting simple fix...`
          );
          documentXml = documentXml.replace(
            /Eini-([\s\S]{0,1000}?)gungsversuchs/gi,
            "Einigungsversuchs$1"
          );
          fixesApplied++;
        }
      }

      if (fixesApplied > 0) {
        console.log(
          `   ✅ Fixed "Eini-" hyphenation - merged ${fixesApplied} instance(s) into "Einigungsversuchs"`
        );
      } else {
        console.log(
          '   ℹ️ No "Eini-" hyphenation issues found across XML elements'
        );
        // Log what we found for debugging
        if (einiMatches && einiMatches.length > 0) {
          console.log(
            '   ⚠️ "Eini-" found but could not find "gungsversuchs" to merge with'
          );
        }
      }

      // Update the document XML
      zip.file("word/document.xml", documentXml);

      console.log("✅ Fixed German hyphenation issues in document");
    } catch (error) {
      console.error(
        "⚠️ Warning: Could not fix hyphenation issues:",
        error.message
      );
      // Don't throw error - document generation should continue
    }
  }

  /**
   * Fix excessive spacing issues in the rendered Word document
   * Specifically targets spacing after "Sehr geehrte Damen und Herren,"
   */
  fixDocumentSpacing(doc) {
    try {
      // Get the document XML
      const zip = doc.getZip();
      let documentXml = zip.files["word/document.xml"].asText();

      // Find all paragraphs in the document
      const paragraphRegex = /<w:p[^>]*>([\s\S]*?)<\/w:p>/g;
      const paragraphs = [];
      let match;

      while ((match = paragraphRegex.exec(documentXml)) !== null) {
        paragraphs.push({
          fullMatch: match[0],
          content: match[1],
          index: match.index,
        });
      }

      // Find the paragraph containing "Sehr geehrte Damen und Herren,"
      let salutationParagraphIndex = -1;
      for (let i = 0; i < paragraphs.length; i++) {
        const paraContent = paragraphs[i].content;
        // Extract text content from XML
        const textMatches = paraContent.match(/<w:t[^>]*>([^<]*)<\/w:t>/g);
        if (textMatches) {
          const fullText = textMatches
            .map((m) => {
              const textMatch = m.match(/<w:t[^>]*>([^<]*)<\/w:t>/);
              return textMatch ? textMatch[1] : "";
            })
            .join("");

          if (fullText.includes("Sehr geehrte Damen und Herren")) {
            salutationParagraphIndex = i;
            break;
          }
        }
      }

      if (salutationParagraphIndex === -1) {
        return;
      }

      let spacingFixed = false;
      const replacements = [];

      const salutationPara = paragraphs[salutationParagraphIndex];
      const salutationPPrMatch = salutationPara.fullMatch.match(
        /<w:pPr[^>]*>([\s\S]*?)<\/w:pPr>/
      );

      if (salutationPPrMatch) {
        const salutationPPrContent = salutationPPrMatch[1];

        // Check for w:after spacing in salutation paragraph
        const salutationAfterMatch =
          salutationPPrContent.match(/w:after="(\d+)"/);
        const salutationBeforeMatch =
          salutationPPrContent.match(/w:before="(\d+)"/);

        if (salutationAfterMatch) {
          const afterValue = parseInt(salutationAfterMatch[1]);
          // Remove ANY w:after spacing from salutation (should be 0)
          let updatedSalutationXml = salutationPara.fullMatch;

          // Check if spacing tag has other attributes
          const spacingTagMatch =
            salutationPPrContent.match(/<w:spacing[^>]*>/);
          if (spacingTagMatch) {
            const spacingTag = spacingTagMatch[0];
            // Remove w:after attribute
            let updatedSpacingTag = spacingTag.replace(/\s*w:after="\d+"/, "");
            // If spacing tag only had w:after, remove the entire tag
            if (
              updatedSpacingTag === "<w:spacing>" ||
              updatedSpacingTag === "<w:spacing/>"
            ) {
              // Remove the entire spacing tag
              updatedSalutationXml = updatedSalutationXml.replace(
                /<w:spacing[^>]*\/?>/,
                ""
              );
            } else {
              // Replace the spacing tag with updated version
              updatedSalutationXml = updatedSalutationXml.replace(
                spacingTag,
                updatedSpacingTag
              );
            }
          } else {
            // Fallback: just remove w:after attribute
            updatedSalutationXml = updatedSalutationXml.replace(
              /\s*w:after="\d+"/,
              ""
            );
          }

          replacements.push({
            original: salutationPara.fullMatch,
            updated: updatedSalutationXml,
          });
          spacingFixed = true;
        } else {
        }

      } else {
      }

      // Find the actual body text paragraph (not contact info or sidebar text)
      // Look for paragraphs containing body text indicators like "wird von uns", "geb. am", "test user", client name patterns
      let bodyParagraphIndex = -1;
      const contactInfoKeywords = [
        "Telefon",
        "Telefax",
        "e-Mail",
        "Öffnungszeiten",
        "Bankverbindungen",
        "Aktenzeichen",
        "BLZ",
        "Konto-Nr",
        "Deutsche Bank",
      ];
      const sidebarKeywords = [
        "Bei Schriftverkehr",
        "unbedingt angeben",
        "Schriftverkehr und Zahlungen",
      ];
      // Strong indicators - these should be prioritized
      const strongBodyTextKeywords = [
        "test user",
        "geb. am",
        "wohnhaft",
        "wird von uns",
      ];
      const mediumBodyTextKeywords = [
        "Einigungsversuchs",
        "Verbraucherinsolvenzverfahrens",
        "geb.",
        "wohnhaft",
      ];
      for (let i = salutationParagraphIndex + 1; i < paragraphs.length; i++) {
        const para = paragraphs[i];
        const paraXml = para.fullMatch;

        // Extract text content
        const textMatches = paraXml.match(/<w:t[^>]*>([^<]*)<\/w:t>/g);
        const fullText = textMatches
          ? textMatches
            .map((m) => {
              const textMatch = m.match(/<w:t[^>]*>([^<]*)<\/w:t>/);
              return textMatch ? textMatch[1] : "";
            })
            .join("")
          : "";

        // Skip if it's contact info, sidebar text, or empty
        const isContactInfo = contactInfoKeywords.some((keyword) =>
          fullText.includes(keyword)
        );
        const isSidebarText = sidebarKeywords.some((keyword) =>
          fullText.includes(keyword)
        );
        const isEmpty = !fullText.trim() || fullText.trim().length < 3;

        if (!isContactInfo && !isSidebarText && !isEmpty) {
          // Check for strong body text indicators first (highest priority)
          const hasStrongIndicator = strongBodyTextKeywords.some((keyword) =>
            fullText.includes(keyword)
          );
          const hasMediumIndicator = mediumBodyTextKeywords.some((keyword) =>
            fullText.includes(keyword)
          );

          // Check if it looks like body text
          // Priority 1: Has strong indicators (test user, geb. am, wohnhaft, wird von uns)
          // Priority 2: Has medium indicators and is reasonably long
          // Priority 3: Very long paragraph that's not just numbers
          const isBodyText =
            hasStrongIndicator ||
            (hasMediumIndicator && fullText.length > 30) ||
            (fullText.length > 80 &&
              !fullText.match(/^\d+$/) &&
              !fullText.startsWith("("));

          if (isBodyText) {
            bodyParagraphIndex = i;
            break;
          }
        } else {
          if (isSidebarText) {
            console.log(
              `   ⏭️ Skipping sidebar text at index ${i}: "${fullText.substring(
                0,
                50
              )}..."`
            );
          }
        }
      }

      // If we found the body paragraph, move the salutation to be directly before it
      if (
        bodyParagraphIndex !== -1 &&
        bodyParagraphIndex > salutationParagraphIndex
      ) {

        const salutationPara = paragraphs[salutationParagraphIndex];
        const bodyPara = paragraphs[bodyParagraphIndex];

        // Get the salutation XML
        let salutationXml = salutationPara.fullMatch;

        // Ensure salutation has proper spacing and left alignment (not indented like sidebar)
        // First, check if it has pPr
        let salutationPPr = salutationXml.match(
          /<w:pPr[^>]*>([\s\S]*?)<\/w:pPr>/
        );
        if (salutationPPr) {
          const pPrContent = salutationPPr[1];
          let updatedPPrContent = pPrContent;

          // Remove left indentation to ensure it's left-aligned (not in sidebar)
          updatedPPrContent = updatedPPrContent.replace(
            /<w:ind[^>]*w:left="\d+"[^>]*\/?>/g,
            ""
          );
          updatedPPrContent = updatedPPrContent.replace(/w:left="\d+"/g, "");

          // Remove ANY w:after spacing from salutation (should be 0 for no extra spacing)
          updatedPPrContent = updatedPPrContent.replace(
            /\s*w:after="\d+"/g,
            ""
          );

          // Check if spacing tag exists and remove it if it's now empty
          const spacingTagMatch = updatedPPrContent.match(
            /<w:spacing([^>]*?)(\/?)>/
          );
          if (spacingTagMatch) {
            let spacingAttrs = spacingTagMatch[1].trim();
            // Remove w:after if it still exists
            spacingAttrs = spacingAttrs.replace(/\s*w:after="\d+"/g, "");
            // If spacing tag is now empty or only has whitespace, remove it entirely
            if (!spacingAttrs.trim() || spacingAttrs.trim() === "") {
              // Remove the entire spacing tag
              updatedPPrContent = updatedPPrContent.replace(
                /<w:spacing[^>]*?\/?>/,
                ""
              );
            } else {
              // Keep the spacing tag but without w:after
              updatedPPrContent = updatedPPrContent.replace(
                /<w:spacing[^>]*?\/?>/,
                `<w:spacing ${spacingAttrs.trim()}>`
              );
            }
          }
          // Do NOT add any spacing tag - we want NO spacing after salutation

          // Ensure left alignment (remove any right alignment)
          updatedPPrContent = updatedPPrContent.replace(
            /<w:jc[^>]*w:val="right"[^>]*\/?>/g,
            ""
          );
          updatedPPrContent = updatedPPrContent.replace(
            /w:jc[^>]*w:val="right"/g,
            ""
          );

          // Replace the pPr in salutation
          salutationXml = salutationXml.replace(
            salutationPPr[0],
            `<w:pPr>${updatedPPrContent}</w:pPr>`
          );
        } else {
          // No pPr exists, add one WITHOUT spacing (we want no extra spacing after salutation)
          salutationXml = salutationXml.replace(
            /<w:p>/,
            '<w:p><w:pPr></w:pPr>'
          );
        }


        // Also reduce w:before spacing on body paragraph if it exists (before moving salutation)
        const bodyParaXml = bodyPara.fullMatch;
        let updatedBodyParaXml = bodyParaXml;
        const bodyPPrMatch = bodyParaXml.match(
          /<w:pPr[^>]*>([\s\S]*?)<\/w:pPr>/
        );

        if (bodyPPrMatch) {
          const bodyPPrContent = bodyPPrMatch[1];
          const bodyBeforeMatch = bodyPPrContent.match(/w:before="(\d+)"/);
          if (bodyBeforeMatch) {
            const beforeValue = parseInt(bodyBeforeMatch[1]);
            console.log(
              `   ⚠️ Body paragraph has w:before="${beforeValue}" twips`
            );
            if (beforeValue > 100) {
              console.log(
                `   🔧 Reducing w:before spacing on body paragraph (${beforeValue} twips -> 0)`
              );
              updatedBodyParaXml = updatedBodyParaXml.replace(
                /w:before="\d+"/,
                'w:before="0"'
              );
            }
          }
        }

        // Remove the old salutation paragraph from its current position
        documentXml = documentXml.replace(salutationPara.fullMatch, "");

        // Insert the new salutation paragraph before the body paragraph (use updated body XML if it was modified)
        const bodyParaToUse =
          updatedBodyParaXml !== bodyParaXml ? updatedBodyParaXml : bodyParaXml;
        documentXml = documentXml.replace(
          bodyParaXml,
          salutationXml + bodyParaToUse
        );

        spacingFixed = true;
      } else {
        // Fallback: just fix spacing issues without moving
        if (bodyParagraphIndex === -1) {
          const paragraphsToCheck = Math.min(
            10,
            paragraphs.length - salutationParagraphIndex - 1
          );
          for (let i = 1; i <= paragraphsToCheck; i++) {
            const paraIndex = salutationParagraphIndex + i;
            if (paraIndex >= paragraphs.length) break;

            const para = paragraphs[paraIndex];
            const paraXml = para.fullMatch;
            let updatedParaXml = paraXml;

            // Extract text to see what paragraph this is
            const textMatches = paraXml.match(/<w:t[^>]*>([^<]*)<\/w:t>/g);
            const fullText = textMatches
              ? textMatches
                .map((m) => {
                  const textMatch = m.match(/<w:t[^>]*>([^<]*)<\/w:t>/);
                  return textMatch ? textMatch[1] : "";
                })
                .join("")
              : "";

            console.log(
              `   📄 Paragraph ${paraIndex} (first 100 chars): "${fullText.substring(
                0,
                100
              )}..."`
            );

            // Check for paragraph properties with spacing
            const pPrMatch = paraXml.match(/<w:pPr[^>]*>([\s\S]*?)<\/w:pPr>/);

            if (pPrMatch) {
              const pPrContent = pPrMatch[1];
              const beforeMatch = pPrContent.match(/w:before="(\d+)"/);

              if (beforeMatch) {
                const beforeValue = parseInt(beforeMatch[1]);
                // Lower threshold - anything over 100 twips is excessive
                if (beforeValue > 100) {
                  updatedParaXml = updatedParaXml.replace(
                    /w:before="\d+"/,
                    'w:before="0"'
                  );
                  replacements.push({
                    original: paraXml,
                    updated: updatedParaXml,
                  });
                  spacingFixed = true;
                }
              }
            }
          }
        }
      }

      // Remove empty paragraphs immediately after salutation if they exist
      if (salutationParagraphIndex + 1 < paragraphs.length) {
        const nextPara = paragraphs[salutationParagraphIndex + 1];
        const nextParaTextMatches = nextPara.content.match(
          /<w:t[^>]*>([^<]*)<\/w:t>/g
        );
        const nextParaText = nextParaTextMatches
          ? nextParaTextMatches
            .map((m) => {
              const textMatch = m.match(/<w:t[^>]*>([^<]*)<\/w:t>/);
              return textMatch ? textMatch[1] : "";
            })
            .join("")
          : "";

        // Check if it's an empty paragraph (only whitespace or very short)
        if (!nextParaText.trim() || nextParaText.trim().length < 3) {
          replacements.push({
            original: nextPara.fullMatch,
            updated: "", // Remove empty paragraph
          });
          spacingFixed = true;
        }
      }


      // Apply all replacements to document XML (if any were collected)
      if (replacements.length > 0) {
        for (const replacement of replacements) {
          if (replacement.updated === "") {
            // Remove empty paragraph
            documentXml = documentXml.replace(replacement.original, "");
          } else {
            // Replace paragraph with updated version
            documentXml = documentXml.replace(
              replacement.original,
              replacement.updated
            );
          }
        }
      }

      // Remove excessive spacing between ALL body paragraphs
      // Skip contact info and sidebar paragraphs - only fix body text paragraphs
      const skipKeywords = [
        "Telefon", "Telefax", "e-Mail", "Öffnungszeiten",
        "Bankverbindungen", "Aktenzeichen", "BLZ", "Konto-Nr",
        "Deutsche Bank", "Bei Schriftverkehr"
      ];
      let bodySpacingFixed = false;
      let fixCount = 0;

      // First, collect ALL paragraphs (not just body paragraphs) to find adjacent paragraphs
      const allParagraphsRegex = /<w:p[^>]*>([\s\S]*?)<\/w:p>/g;
      let paraMatch;
      const allParagraphs = [];
      const bodyParagraphs = [];

      // Reset regex
      allParagraphsRegex.lastIndex = 0;

      // First pass: collect ALL paragraphs
      while ((paraMatch = allParagraphsRegex.exec(documentXml)) !== null) {
        const match = paraMatch[0];
        const textMatches = match.match(/<w:t[^>]*>([^<]*)<\/w:t>/g);
        const fullText = textMatches
          ? textMatches
            .map((m) => {
              const textMatch = m.match(/<w:t[^>]*>([^<]*)<\/w:t>/);
              return textMatch ? textMatch[1] : "";
            })
            .join("")
          : "";

        allParagraphs.push({
          original: match,
          text: fullText,
          index: allParagraphs.length
        });

        const isSkipPara = skipKeywords.some((keyword) =>
          fullText.includes(keyword)
        );
        const isEmpty = !fullText.trim() || fullText.trim().length < 3;

        // Only process body text paragraphs for the main fix
        if (!isSkipPara && !isEmpty && fullText.length > 10) {
          bodyParagraphs.push({
            original: match,
            text: fullText.substring(0, 100),
            index: bodyParagraphs.length
          });
        }
      }

      // Find the paragraph before "test user...strebt eine Schuldenbereinigung" and fix spacing
      for (let i = 0; i < allParagraphs.length; i++) {
        const para = allParagraphs[i];
        if (para.text.includes("test user") && para.text.includes("strebt eine Schuldenbereinigung")) {
          // Found the target paragraph, look backwards to find the actual content paragraph
          // Skip empty paragraphs and find "Eine entsprechende Vollmacht liegt bei"
          let foundPrevPara = false;
          for (let j = i - 1; j >= 0 && j >= i - 5; j--) {
            const prevPara = allParagraphs[j];
            const prevText = prevPara.text.trim();

            // Skip empty paragraphs
            if (!prevText || prevText.length < 3) {
              // Remove empty paragraph
              console.log(`\n   🗑️ Removing empty paragraph at index ${j}`);
              documentXml = documentXml.replace(prevPara.original, "");
              continue;
            }

            // Check if this is the paragraph we're looking for
            if (prevText.includes("Eine entsprechende Vollmacht liegt bei") ||
              prevText.includes("Vollmacht liegt bei") ||
              prevText.length > 20) {
              console.log(`\n   🔍 Found paragraph before "test user...": "${prevText.substring(0, 80)}..."`);
              console.log(`      Full XML: ${prevPara.original}`);

              // Check if previous paragraph has w:after spacing
              const prevPPrMatch = prevPara.original.match(/<w:pPr[^>]*>([\s\S]*?)<\/w:pPr>/);
              if (prevPPrMatch) {
                const prevAfterMatch = prevPPrMatch[1].match(/w:after="(\d+)"/);
                if (prevAfterMatch) {
                  console.log(`      ⚠️ Previous paragraph has w:after="${prevAfterMatch[1]}" twips - REMOVING`);

                  // Remove w:after from previous paragraph
                  let updatedPrev = prevPara.original;
                  const prevSpacingMatch = prevPPrMatch[1].match(/<w:spacing([^>]*?)(\/?)>/);
                  if (prevSpacingMatch) {
                    let spacingTag = prevSpacingMatch[0];
                    spacingTag = spacingTag.replace(/w:after="\d+"/g, 'w:after="0"');
                    if (!/w:after=/.test(spacingTag)) {
                      const isSelfClosing = prevSpacingMatch[2] === '/';
                      if (isSelfClosing) {
                        spacingTag = spacingTag.replace(/<w:spacing([^>]*?)\/>/, '<w:spacing w:after="0"$1/>');
                      } else {
                        spacingTag = spacingTag.replace(/<w:spacing([^>]*?)>/, '<w:spacing w:after="0"$1>');
                      }
                    }
                    let updatedPPrContent = prevPPrMatch[1].replace(prevSpacingMatch[0], spacingTag);
                    updatedPrev = updatedPrev.replace(prevPPrMatch[0], `<w:pPr>${updatedPPrContent}</w:pPr>`);
                  } else {
                    // No spacing tag, add one with w:after="0"
                    let updatedPPrContent = '<w:spacing w:after="0"/>' + prevPPrMatch[1];
                    updatedPrev = updatedPrev.replace(prevPPrMatch[0], `<w:pPr>${updatedPPrContent}</w:pPr>`);
                  }

                  // Apply the fix to document XML
                  documentXml = documentXml.replace(prevPara.original, updatedPrev);
                  console.log(`      ✅ Removed w:after spacing from previous paragraph`);
                } else {
                  // No w:after, but add one with w:after="0" to ensure no spacing
                  let updatedPrev = prevPara.original;
                  let updatedPPrContent = '<w:spacing w:after="0"/>' + prevPPrMatch[1];
                  updatedPrev = updatedPrev.replace(prevPPrMatch[0], `<w:pPr>${updatedPPrContent}</w:pPr>`);
                  documentXml = documentXml.replace(prevPara.original, updatedPrev);
                  console.log(`      ✅ Added w:after="0" to previous paragraph to ensure no spacing`);
                }
              } else {
                // No pPr, add one with w:after="0"
                let updatedPrev = prevPara.original.replace(/<w:p>/, '<w:p><w:pPr><w:spacing w:after="0"/></w:pPr>');
                documentXml = documentXml.replace(prevPara.original, updatedPrev);
                console.log(`      ✅ Added pPr with w:after="0" to previous paragraph`);
              }

              foundPrevPara = true;
              break;
            }
          }

          if (!foundPrevPara) {
            console.log(`\n   ⚠️ Could not find content paragraph before "test user..."`);
          }
          break;
        }
      }

      // Find and fix spacing between "Einigungsversuches mit den Gläubigern." and "Hierzu benötigen wir zunächst einen"
      let einigungsversuchesParaIndex = -1;
      let hierzuParaIndex = -1;

      for (let i = 0; i < allParagraphs.length; i++) {
        const para = allParagraphs[i];
        const paraText = para.text.trim();

        // Find paragraph ending with "Einigungsversuches mit den Gläubigern."
        if (paraText.includes("Einigungsversuches mit den Gläubigern") && einigungsversuchesParaIndex === -1) {
          einigungsversuchesParaIndex = i;
          console.log(`\n   🔍 FOUND: Paragraph ending with "Einigungsversuches mit den Gläubigern." (index ${i})`);
          console.log(`      Text: "${paraText.substring(Math.max(0, paraText.length - 80))}"`);
          console.log(`      Full XML: ${para.original}`);
        }

        // Find paragraph starting with "Hierzu benötigen wir zunächst einen"
        if (paraText.includes("Hierzu benötigen wir zunächst einen") && hierzuParaIndex === -1) {
          hierzuParaIndex = i;
          console.log(`\n   🔍 FOUND: Paragraph starting with "Hierzu benötigen wir zunächst einen" (index ${i})`);
          console.log(`      Text: "${paraText.substring(0, 80)}..."`);
          console.log(`      Full XML: ${para.original}`);
        }
      }

      // Fix spacing between these two paragraphs
      if (einigungsversuchesParaIndex !== -1 && hierzuParaIndex !== -1) {
        const einigungsPara = allParagraphs[einigungsversuchesParaIndex];
        const hierzuPara = allParagraphs[hierzuParaIndex];

        console.log(`\n   🔧 FIXING SPACING between paragraph ${einigungsversuchesParaIndex} and ${hierzuParaIndex}`);

        // Remove empty paragraphs between them
        for (let j = einigungsversuchesParaIndex + 1; j < hierzuParaIndex; j++) {
          const emptyPara = allParagraphs[j];
          if (!emptyPara.text.trim() || emptyPara.text.trim().length < 3) {
            console.log(`   🗑️ Removing empty paragraph at index ${j}`);
            documentXml = documentXml.replace(emptyPara.original, "");
          }
        }

        // Fix w:after on "Einigungsversuches mit den Gläubigern." paragraph
        const einigungsPPrMatch = einigungsPara.original.match(/<w:pPr[^>]*>([\s\S]*?)<\/w:pPr>/);
        if (einigungsPPrMatch) {
          const einigungsAfterMatch = einigungsPPrMatch[1].match(/w:after="(\d+)"/);
          if (einigungsAfterMatch) {
            console.log(`   ⚠️ "Einigungsversuches..." paragraph has w:after="${einigungsAfterMatch[1]}" twips`);
          } else {
            console.log(`   ✅ "Einigungsversuches..." paragraph has no w:after spacing`);
          }

          // Always set w:after="0" to ensure no spacing
          let updatedEinigungs = einigungsPara.original;
          const einigungsSpacingMatch = einigungsPPrMatch[1].match(/<w:spacing([^>]*?)(\/?)>/);
          if (einigungsSpacingMatch) {
            let spacingTag = einigungsSpacingMatch[0];
            spacingTag = spacingTag.replace(/w:after="\d+"/g, 'w:after="0"');
            if (!/w:after=/.test(spacingTag)) {
              const isSelfClosing = einigungsSpacingMatch[2] === '/';
              if (isSelfClosing) {
                spacingTag = spacingTag.replace(/<w:spacing([^>]*?)\/>/, '<w:spacing w:after="0"$1/>');
              } else {
                spacingTag = spacingTag.replace(/<w:spacing([^>]*?)>/, '<w:spacing w:after="0"$1>');
              }
            }
            let updatedPPrContent = einigungsPPrMatch[1].replace(einigungsSpacingMatch[0], spacingTag);
            updatedEinigungs = updatedEinigungs.replace(einigungsPPrMatch[0], `<w:pPr>${updatedPPrContent}</w:pPr>`);
          } else {
            let updatedPPrContent = '<w:spacing w:after="0"/>' + einigungsPPrMatch[1];
            updatedEinigungs = updatedEinigungs.replace(einigungsPPrMatch[0], `<w:pPr>${updatedPPrContent}</w:pPr>`);
          }
          documentXml = documentXml.replace(einigungsPara.original, updatedEinigungs);
          console.log(`   ✅ Set w:after="0" on "Einigungsversuches..." paragraph`);
        } else {
          let updatedEinigungs = einigungsPara.original.replace(/<w:p>/, '<w:p><w:pPr><w:spacing w:after="0"/></w:pPr>');
          documentXml = documentXml.replace(einigungsPara.original, updatedEinigungs);
          console.log(`   ✅ Added pPr with w:after="0" to "Einigungsversuches..." paragraph`);
        }

        // Fix w:before on "Hierzu benötigen wir zunächst einen" paragraph
        const hierzuPPrMatch = hierzuPara.original.match(/<w:pPr[^>]*>([\s\S]*?)<\/w:pPr>/);
        if (hierzuPPrMatch) {
          const hierzuBeforeMatch = hierzuPPrMatch[1].match(/w:before="(\d+)"/);
          if (hierzuBeforeMatch) {
            console.log(`   ⚠️ "Hierzu benötigen wir..." paragraph has w:before="${hierzuBeforeMatch[1]}" twips`);
          } else {
            console.log(`   ✅ "Hierzu benötigen wir..." paragraph has no w:before spacing`);
          }

          // Always set w:before="0" to ensure no spacing
          let updatedHierzu = hierzuPara.original;
          const hierzuSpacingMatch = hierzuPPrMatch[1].match(/<w:spacing([^>]*?)(\/?)>/);
          if (hierzuSpacingMatch) {
            let spacingTag = hierzuSpacingMatch[0];
            spacingTag = spacingTag.replace(/w:before="\d+"/g, 'w:before="0"');
            if (!/w:before=/.test(spacingTag)) {
              const isSelfClosing = hierzuSpacingMatch[2] === '/';
              if (isSelfClosing) {
                spacingTag = spacingTag.replace(/<w:spacing([^>]*?)\/>/, '<w:spacing w:before="0"$1/>');
              } else {
                spacingTag = spacingTag.replace(/<w:spacing([^>]*?)>/, '<w:spacing w:before="0"$1>');
              }
            }
            let updatedPPrContent = hierzuPPrMatch[1].replace(hierzuSpacingMatch[0], spacingTag);
            updatedHierzu = updatedHierzu.replace(hierzuPPrMatch[0], `<w:pPr>${updatedPPrContent}</w:pPr>`);
          } else {
            let updatedPPrContent = '<w:spacing w:before="0"/>' + hierzuPPrMatch[1];
            updatedHierzu = updatedHierzu.replace(hierzuPPrMatch[0], `<w:pPr>${updatedPPrContent}</w:pPr>`);
          }
          documentXml = documentXml.replace(hierzuPara.original, updatedHierzu);
          console.log(`   ✅ Set w:before="0" on "Hierzu benötigen wir..." paragraph`);
        } else {
          let updatedHierzu = hierzuPara.original.replace(/<w:p>/, '<w:p><w:pPr><w:spacing w:before="0"/></w:pPr>');
          documentXml = documentXml.replace(hierzuPara.original, updatedHierzu);
          console.log(`   ✅ Added pPr with w:before="0" to "Hierzu benötigen wir..." paragraph`);
        }
      } else {
        if (einigungsversuchesParaIndex === -1) {
          console.log(`\n   ⚠️ Could not find paragraph ending with "Einigungsversuches mit den Gläubigern."`);
        }
        if (hierzuParaIndex === -1) {
          console.log(`\n   ⚠️ Could not find paragraph starting with "Hierzu benötigen wir zunächst einen"`);
        }
      }

      // Log XML for specific paragraphs BEFORE fixing
      bodyParagraphs.forEach((para, idx) => {
        // Check for "Eine entsprechende Vollmacht liegt bei."
        if (para.text.includes("Eine entsprechende Vollmacht liegt bei")) {
          console.log(`\n   🔍 BEFORE FIX - Paragraph "${para.text.substring(0, 50)}...":`);
          console.log(`      Full XML: ${para.original}`);

          const pPrMatch = para.original.match(/<w:pPr[^>]*>([\s\S]*?)<\/w:pPr>/);
          if (pPrMatch) {
            const beforeMatch = pPrMatch[1].match(/w:before="(\d+)"/);
            const afterMatch = pPrMatch[1].match(/w:after="(\d+)"/);
            if (beforeMatch) console.log(`      ⚠️ w:before="${beforeMatch[1]}" twips`);
            if (afterMatch) console.log(`      ⚠️ w:after="${afterMatch[1]}" twips`);
            if (!beforeMatch && !afterMatch) console.log(`      ✅ No spacing attributes (no spacing)`);
          } else {
            console.log(`      ✅ No pPr found (no spacing)`);
          }
        }

        if (para.text.includes("test user") && para.text.includes("strebt eine Schuldenbereinigung")) {
          console.log(`\n   🔍 BEFORE FIX - Paragraph "${para.text.substring(0, 50)}...":`);
          console.log(`      Full XML: ${para.original}`);

          const pPrMatch = para.original.match(/<w:pPr[^>]*>([\s\S]*?)<\/w:pPr>/);
          if (pPrMatch) {
            const beforeMatch = pPrMatch[1].match(/w:before="(\d+)"/);
            const afterMatch = pPrMatch[1].match(/w:after="(\d+)"/);
            if (beforeMatch) console.log(`      ⚠️ w:before="${beforeMatch[1]}" twips`);
            if (afterMatch) console.log(`      ⚠️ w:after="${afterMatch[1]}" twips`);
            if (!beforeMatch && !afterMatch) console.log(`      ✅ No spacing attributes (no spacing)`);
          } else {
            console.log(`      ✅ No pPr found (no spacing)`);
          }
        }

        if (para.text.includes("Hierzu benötigen wir zunächst")) {
          console.log(`\n   🔍 BEFORE FIX - Paragraph "${para.text.substring(0, 50)}...":`);
          console.log(`      Full XML: ${para.original}`);

          const pPrMatch = para.original.match(/<w:pPr[^>]*>([\s\S]*?)<\/w:pPr>/);
          if (pPrMatch) {
            const beforeMatch = pPrMatch[1].match(/w:before="(\d+)"/);
            const afterMatch = pPrMatch[1].match(/w:after="(\d+)"/);
            if (beforeMatch) console.log(`      ⚠️ w:before="${beforeMatch[1]}" twips`);
            if (afterMatch) console.log(`      ⚠️ w:after="${afterMatch[1]}" twips`);
            if (!beforeMatch && !afterMatch) console.log(`      ✅ No spacing attributes (no spacing)`);
          } else {
            console.log(`      ✅ No pPr found (no spacing)`);
          }
        }
      });

      const bodySpacingReplacements = [];

      bodyParagraphs.forEach((para) => {
        let updated = para.original;
        const originalMatch = para.original;
        let needsUpdate = false;

        // Check if paragraph has pPr
        const hasPPr = /<w:pPr[^>]*>/.test(updated);

        if (hasPPr) {
          // If pPr exists, check for spacing and set to 0
          const pPrMatch = updated.match(/<w:pPr[^>]*>([\s\S]*?)<\/w:pPr>/);
          if (pPrMatch) {
            let pPrContent = pPrMatch[1];
            const originalPPrContent = pPrContent;

            // Check if spacing tag exists - ONLY modify if it exists
            const spacingMatch = pPrContent.match(/<w:spacing([^>]*?)(\/?)>/);
            if (spacingMatch) {
              // Spacing tag exists - update w:before and w:after to 0
              let spacingTag = spacingMatch[0];
              const originalSpacingTag = spacingTag;
              const isSelfClosing = spacingMatch[2] === '/';

              // Replace existing w:before and w:after with "0"
              spacingTag = spacingTag.replace(/w:before="\d+"/g, 'w:before="0"');
              spacingTag = spacingTag.replace(/w:after="\d+"/g, 'w:after="0"');

              // If spacing tag doesn't have w:before, add it
              if (!/w:before=/.test(spacingTag)) {
                if (isSelfClosing) {
                  spacingTag = spacingTag.replace(/<w:spacing([^>]*?)\/>/, '<w:spacing w:before="0"$1/>');
                } else {
                  spacingTag = spacingTag.replace(/<w:spacing([^>]*?)>/, '<w:spacing w:before="0"$1>');
                }
              }
              // If spacing tag doesn't have w:after, add it
              if (!/w:after=/.test(spacingTag)) {
                if (isSelfClosing) {
                  spacingTag = spacingTag.replace(/<w:spacing([^>]*?)\/>/, '<w:spacing w:after="0"$1/>');
                } else {
                  spacingTag = spacingTag.replace(/<w:spacing([^>]*?)>/, '<w:spacing w:after="0"$1>');
                }
              }

              // Only update if spacing tag changed
              if (spacingTag !== originalSpacingTag) {
                // Replace the spacing tag in pPrContent
                pPrContent = pPrContent.replace(originalSpacingTag, spacingTag);

                if (pPrContent !== originalPPrContent) {
                  updated = updated.replace(pPrMatch[0], `<w:pPr>${pPrContent}</w:pPr>`);
                  needsUpdate = true;
                }
              }
            } else {
              // No spacing tag exists - add one with w:before="0" w:after="0" to ensure no spacing
              pPrContent = '<w:spacing w:before="0" w:after="0"/>' + pPrContent;
              updated = updated.replace(pPrMatch[0], `<w:pPr>${pPrContent}</w:pPr>`);
              needsUpdate = true;
            }
          }
        } else {
          // No pPr exists - add one with spacing=0 to ensure no spacing
          const paraStartMatch = updated.match(/^<w:p([^>]*)>/);
          if (paraStartMatch) {
            const paraAttrs = paraStartMatch[1];
            updated = updated.replace(/^<w:p[^>]*>/, `<w:p${paraAttrs}><w:pPr><w:spacing w:before="0" w:after="0"/></w:pPr>`);
            needsUpdate = true;
          }
        }

        // Also replace any w:before or w:after anywhere else in the paragraph (outside pPr)
        // This is safe as it only modifies existing attributes
        if (/w:before="\d+"/.test(updated)) {
          updated = updated.replace(/w:before="\d+"/g, 'w:before="0"');
          needsUpdate = true;
        }
        if (/w:after="\d+"/.test(updated)) {
          updated = updated.replace(/w:after="\d+"/g, 'w:after="0"');
          needsUpdate = true;
        }

        if (needsUpdate && updated !== originalMatch) {
          bodySpacingReplacements.push({
            original: originalMatch,
            updated: updated,
            text: para.text
          });
          fixCount++;
          bodySpacingFixed = true;

          // Log AFTER fix for specific paragraphs
          if (para.text.includes("Eine entsprechende Vollmacht liegt bei")) {
            console.log(`\n   ✅ AFTER FIX - Paragraph "${para.text.substring(0, 50)}...":`);
            console.log(`      Updated XML: ${updated}`);
            const pPrMatch = updated.match(/<w:pPr[^>]*>([\s\S]*?)<\/w:pPr>/);
            if (pPrMatch) {
              const beforeMatch = pPrMatch[1].match(/w:before="(\d+)"/);
              const afterMatch = pPrMatch[1].match(/w:after="(\d+)"/);
              if (beforeMatch) console.log(`      ✅ w:before="${beforeMatch[1]}" twips`);
              if (afterMatch) console.log(`      ✅ w:after="${afterMatch[1]}" twips`);
              if (!beforeMatch && !afterMatch) console.log(`      ✅ No spacing attributes`);
            }
          }

          if (para.text.includes("test user") && para.text.includes("strebt eine Schuldenbereinigung")) {
            console.log(`\n   ✅ AFTER FIX - Paragraph "${para.text.substring(0, 50)}...":`);
            console.log(`      Updated XML: ${updated}`);
            const pPrMatch = updated.match(/<w:pPr[^>]*>([\s\S]*?)<\/w:pPr>/);
            if (pPrMatch) {
              const beforeMatch = pPrMatch[1].match(/w:before="(\d+)"/);
              const afterMatch = pPrMatch[1].match(/w:after="(\d+)"/);
              if (beforeMatch) console.log(`      ✅ w:before="${beforeMatch[1]}" twips`);
              if (afterMatch) console.log(`      ✅ w:after="${afterMatch[1]}" twips`);
              if (!beforeMatch && !afterMatch) console.log(`      ✅ No spacing attributes`);
            }
          }

          if (para.text.includes("Hierzu benötigen wir zunächst")) {
            console.log(`\n   ✅ AFTER FIX - Paragraph "${para.text.substring(0, 50)}...":`);
            console.log(`      Updated XML: ${updated}`);
            const pPrMatch = updated.match(/<w:pPr[^>]*>([\s\S]*?)<\/w:pPr>/);
            if (pPrMatch) {
              const beforeMatch = pPrMatch[1].match(/w:before="(\d+)"/);
              const afterMatch = pPrMatch[1].match(/w:after="(\d+)"/);
              if (beforeMatch) console.log(`      ✅ w:before="${beforeMatch[1]}" twips`);
              if (afterMatch) console.log(`      ✅ w:after="${afterMatch[1]}" twips`);
              if (!beforeMatch && !afterMatch) console.log(`      ✅ No spacing attributes`);
            }
          }
        }
      });

      // Apply all replacements to document XML (in reverse order to avoid index issues)
      if (bodySpacingReplacements.length > 0) {
        // Apply in reverse order to avoid index shifting issues
        for (let i = bodySpacingReplacements.length - 1; i >= 0; i--) {
          const replacement = bodySpacingReplacements[i];
          // Use exact match to avoid corrupting XML
          const beforeReplace = documentXml;
          documentXml = documentXml.replace(replacement.original, replacement.updated);
          // Verify replacement worked
          if (documentXml === beforeReplace) {
            console.log(`   ⚠️ Warning: Replacement failed for: "${replacement.text.substring(0, 50)}..."`);
          }
        }
        console.log(`   ✅ Applied ${bodySpacingReplacements.length} spacing fixes`);
        spacingFixed = true;
      }

      // Update the document XML if any changes were made
      if (spacingFixed || replacements.length > 0 || bodySpacingFixed) {
        zip.file("word/document.xml", documentXml);
        console.log(
          "✅ Fixed spacing issues and repositioned salutation in document"
        );
      } else {
        console.log("ℹ️ No spacing issues found or changes needed");
      }
    } catch (error) {
      console.error("⚠️ Warning: Could not fix spacing issues:", error.message);
      console.error("   Error stack:", error.stack);
    }
  }

  /**
   * Parse and format client address for proper line breaks
   */
  formatClientAddress(clientData) {
    // Priority 1: Use structured address fields if available
    if (clientData.street && clientData.zipCode && clientData.city) {
      const streetLine = clientData.houseNumber
        ? `${clientData.street} ${clientData.houseNumber}`
        : clientData.street;
      const address = `${streetLine} ${clientData.zipCode} ${clientData.city}`;
      return formatAddress(address);
    }

    // Priority 2: Use address string
    const address = clientData.address;
    if (!address) {
      return "Adresse nicht verfügbar";
    }

    // Use the shared formatAddress utility
    return formatAddress(address);
  }

  /**
   * Format creditor address using the same logic as client address
   */
  formatCreditorAddress(creditor) {
    const address =
      creditor.creditor_address ||
      creditor.address ||
      creditor.sender_address ||
      null;

    if (!address) {
      return "Adresse nicht verfügbar";
    }

    return formatAddress(address);
  }

  /**
   * Prepare template data for Word document
   */
  prepareTemplateData(clientData, creditor) {
    const today = new Date();
    const responseDate = new Date();
    responseDate.setDate(today.getDate() + 14); // 14 days from today

    const formatGermanDate = (date) => {
      return date.toLocaleDateString("de-DE", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      });
    };

    return {
      // Creditor information
      // "Adresse des Creditors": this.formatCreditorAddress(creditor),
      "Adresse des Creditors": `${creditor.sender_name ? creditor.sender_name + '\n' : ''}${this.formatCreditorAddress(creditor)}`,

      Creditor:
        creditor.actual_creditor ||
        creditor.sender_name ||
        "Unbekannter Gläubiger",

      "Aktenzeichen des Credtiors":
        creditor.reference_number ||
        creditor.creditor_reference ||
        creditor.reference ||
        creditor.aktenzeichen ||
        "Nicht verfügbar",

      // Client information
      Name: clientData.name,
      Geburtstag:
        clientData.birthdate || clientData.dateOfBirth || "Nicht verfügbar",
      Adresse: this.formatClientAddress(clientData),
      "Aktenzeichen des Mandanten": clientData.reference,

      // Dates
      "heutiges Datum": formatGermanDate(today),
      "Datum in 14 Tagen": formatGermanDate(responseDate),
    };
  }

  /**
   * Ensure output directory exists
   */
  async ensureOutputDirectory() {
    try {
      await fs.access(this.outputDir);
    } catch (error) {
      // Directory doesn't exist, create it
      await fs.mkdir(this.outputDir, { recursive: true });
      console.log(`📁 Created output directory: ${this.outputDir}`);
    }
  }

  /**
   * Clean up old generated files (optional utility method)
   */
  async cleanupOldFiles(olderThanDays = 30) {
    try {
      const files = await fs.readdir(this.outputDir);
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

      let deletedCount = 0;
      for (const file of files) {
        const filePath = path.join(this.outputDir, file);
        const stats = await fs.stat(filePath);

        if (stats.mtime < cutoffDate) {
          await fs.unlink(filePath);
          deletedCount++;
        }
      }

      if (deletedCount > 0) {
        console.log(`🗑️ Cleaned up ${deletedCount} old document files`);
      }

      return { deleted: deletedCount };
    } catch (error) {
      console.error(`❌ Error cleaning up old files: ${error.message}`);
      return { deleted: 0, error: error.message };
    }
  }
}

module.exports = FirstRoundDocumentGenerator;
