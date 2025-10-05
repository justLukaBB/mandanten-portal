const fs = require('fs').promises;
const path = require('path');
const Docxtemplater = require('docxtemplater');
const PizZip = require('pizzip');

/**
 * First Round Document Generator
 * Generates individual DOCX files for each creditor using the template
 */
class FirstRoundDocumentGenerator {
    constructor() {
        this.templatePath = path.join(__dirname, '../templates/1.Schreiben.docx');
        this.outputDir = path.join(__dirname, '../generated_documents/first_round');
    }

    /**
     * Generate DOCX files for all creditors
     */
    async generateCreditorDocuments(clientData, creditors) {
        try {
            console.log(`📄 Generating first round documents for ${creditors.length} creditors...`);

            // Ensure output directory exists
            await this.ensureOutputDirectory();

            const results = [];
            const errors = [];

            for (let i = 0; i < creditors.length; i++) {
                const creditor = creditors[i];
                console.log(`   Processing ${i + 1}/${creditors.length}: ${creditor.creditor_name || creditor.sender_name}`);

                try {
                    const result = await this.generateSingleCreditorDocument(clientData, creditor);
                    results.push(result);
                } catch (error) {
                    console.error(`❌ Failed to generate document for ${creditor.creditor_name || creditor.sender_name}: ${error.message}`);
                    errors.push({
                        creditor: creditor.creditor_name || creditor.sender_name,
                        error: error.message
                    });
                }
            }

            console.log(`✅ Generated ${results.length}/${creditors.length} documents successfully`);
            if (errors.length > 0) {
                console.log(`❌ ${errors.length} documents failed to generate`);
            }

            return {
                success: true,
                documents: results,
                errors: errors,
                total_generated: results.length,
                total_failed: errors.length
            };

        } catch (error) {
            console.error(`❌ Error in generateCreditorDocuments: ${error.message}`);
            return {
                success: false,
                error: error.message,
                documents: [],
                errors: []
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
            });

            // Prepare the data for replacement
            const templateData = this.prepareTemplateData(clientData, creditor);

            // Render the document with the data
            doc.render(templateData);

            // Generate the output buffer
            const outputBuffer = doc.getZip().generate({
                type: 'nodebuffer',
                compression: 'DEFLATE',
            });

            // Generate filename
            const creditorName = (creditor.creditor_name || creditor.sender_name || 'UnknownCreditor')
                .replace(/[^a-zA-Z0-9äöüßÄÖÜ\s-]/g, '') // Remove special characters
                .replace(/\s+/g, '_') // Replace spaces with underscores
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
                generated_at: new Date().toISOString()
            };

        } catch (error) {
            console.error(`❌ Error generating document for creditor: ${error.message}`);
            throw error;
        }
    }

    /**
     * Prepare template data for DOCX generation
     */
    prepareTemplateData(clientData, creditor) {
        const today = new Date();
        const responseDate = new Date();
        responseDate.setDate(today.getDate() + 14); // 14 days from today

        const formatGermanDate = (date) => {
            return date.toLocaleDateString('de-DE', {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric'
            });
        };

        return {
            // Creditor information
            "Adresse des Creditors": creditor.creditor_address || 
                creditor.address || 
                creditor.sender_address || 
                "Adresse nicht verfügbar",
            
            "Creditor": creditor.creditor_name || 
                creditor.sender_name || 
                "Unbekannter Gläubiger",
            
            "Aktenzeichen des Credtiors": creditor.creditor_reference || 
                creditor.reference || 
                creditor.aktenzeichen || 
                "Nicht verfügbar",

            // Client information
            "Name": clientData.name,
            "Geburtstag": clientData.birthdate || 
                clientData.dateOfBirth || 
                "Nicht verfügbar",
            "Adresse": clientData.address || "Adresse nicht verfügbar",
            "Aktenzeichen des Mandanten": clientData.reference,

            // Dates
            "heutiges Datum": formatGermanDate(today),
            "Datum in 14 Tagen": formatGermanDate(responseDate)
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