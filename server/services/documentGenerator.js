// Try to load docx dependency, fail gracefully if not available
let docxModule = null;
let Document, Packer, Paragraph, Table, TableRow, TableCell, WidthType, AlignmentType, TextRun, HeadingLevel, BorderStyle;

try {
    docxModule = require('docx');
    ({ Document, Packer, Paragraph, Table, TableRow, TableCell, WidthType, AlignmentType, TextRun, HeadingLevel, BorderStyle } = docxModule);
} catch (error) {
    console.warn('⚠️ docx package not found - document generation will be disabled');
    console.warn('Install with: npm install docx');
}

const fs = require('fs').promises;
const path = require('path');

/**
 * Document Generator Service
 * Generates Word documents for Schuldenbereinigungsplan (Debt Settlement Plan)
 */
class DocumentGenerator {
    constructor() {
        this.documentOptions = {
            creator: "Thomas Scuric Rechtsanwälte",
            company: "Thomas Scuric Rechtsanwälte",
            title: "Außergerichtlicher Schuldenbereinigungsplan"
        };
    }

    /**
     * Generate complete Schuldenbereinigungsplan Word document
     */
    async generateSchuldenbereinigungsplan(clientData, settlementData, calculationResult) {
        if (!docxModule) {
            throw new Error('Document generation is not available - docx package not installed. Please run: npm install docx');
        }

        try {
            console.log(`📄 Generating Schuldenbereinigungsplan for ${clientData.name}...`);

            // Format the date for the document title
            const currentDate = new Date().toLocaleDateString('de-DE', {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric'
            });

            // Calculate payment start date (usually next month)
            const paymentStartDate = new Date();
            paymentStartDate.setMonth(paymentStartDate.getMonth() + 1);
            paymentStartDate.setDate(1);

            const doc = new Document({
                ...this.documentOptions,
                sections: [{
                    properties: {},
                    children: [
                        // Document Title
                        new Paragraph({
                            children: [
                                new TextRun({
                                    text: `Außergerichtlicher Schuldenbereinigungsplan vom     ${currentDate}`,
                                    bold: true,
                                    size: 24
                                })
                            ],
                            spacing: { after: 400 }
                        }),

                        // Debtor Information
                        new Paragraph({
                            children: [
                                new TextRun({
                                    text: "Schuldner/-in:",
                                    bold: true,
                                    size: 22
                                }),
                                new TextRun({
                                    text: `          ${clientData.name}`,
                                    size: 22
                                })
                            ],
                            spacing: { after: 400 }
                        }),

                        // Quota Plan Information
                        new Paragraph({
                            children: [
                                new TextRun({
                                    text: "Quotenplan",
                                    bold: true,
                                    size: 22
                                }),
                                new TextRun({
                                    text: `                    Laufzeit: ${settlementData.duration_months || 36} Monate`,
                                    size: 22
                                })
                            ],
                            spacing: { after: 600 }
                        }),

                        // Payment Start Date
                        new Paragraph({
                            children: [
                                new TextRun({
                                    text: "Beginn des Zahlungsplans",
                                    size: 22
                                }),
                                new TextRun({
                                    text: `          ${paymentStartDate.toLocaleDateString('de-DE')}`,
                                    size: 22,
                                    underline: {}
                                })
                            ],
                            spacing: { after: 600 }
                        }),

                        // Creditor Table
                        await this.createCreditorTable(calculationResult.creditor_payments),

                        // Spacing after table
                        new Paragraph({
                            children: [new TextRun({ text: "" })],
                            spacing: { after: 400 }
                        }),

                        // Explanation Text (right side box in the original)
                        new Paragraph({
                            children: [
                                new TextRun({
                                    text: "Aufgrund schwankender Einkünfte oder mangels pfändbarem Einkommen wird nur die Quote angeboten. Die pfändbaren Beträge werden nach der Quote von Monat zu Monat neu errechnet. Die Verteilung der Zahlungen an die Gläubiger erfolgt einmal jährlich. Die Bedingungen in der Anlage sind Bestandteil dieses Plans.",
                                    size: 20
                                })
                            ],
                            alignment: AlignmentType.JUSTIFIED,
                            indent: {
                                left: 6000, // Right aligned like in the original
                                right: 0
                            },
                            spacing: { after: 200 }
                        }),

                        // Summary Information
                        new Paragraph({
                            children: [
                                new TextRun({
                                    text: `\n\nGesamtsumme aller Forderungen: ${this.formatCurrency(calculationResult.total_debt)}`,
                                    bold: true,
                                    size: 22
                                })
                            ],
                            spacing: { after: 200 }
                        }),

                        new Paragraph({
                            children: [
                                new TextRun({
                                    text: `Monatliche Zahlungsrate: ${this.formatCurrency(settlementData.monthly_payment)}`,
                                    bold: true,
                                    size: 22
                                })
                            ],
                            spacing: { after: 200 }
                        }),

                        new Paragraph({
                            children: [
                                new TextRun({
                                    text: `Gesamte Zahlungssumme über ${settlementData.duration_months} Monate: ${this.formatCurrency(calculationResult.total_payment_amount)}`,
                                    bold: true,
                                    size: 22
                                })
                            ],
                            spacing: { after: 200 }
                        }),

                        new Paragraph({
                            children: [
                                new TextRun({
                                    text: `Durchschnittliche Quote: ${calculationResult.average_quota_percentage.toFixed(2)}%`,
                                    bold: true,
                                    size: 22
                                })
                            ],
                            spacing: { after: 400 }
                        }),

                        // Legal Footer
                        new Paragraph({
                            children: [
                                new TextRun({
                                    text: "\n\nErstellt von Thomas Scuric Rechtsanwälte",
                                    italics: true,
                                    size: 18
                                })
                            ],
                            alignment: AlignmentType.CENTER,
                            spacing: { before: 800 }
                        }),

                        new Paragraph({
                            children: [
                                new TextRun({
                                    text: `Datum: ${currentDate}`,
                                    italics: true,
                                    size: 18
                                })
                            ],
                            alignment: AlignmentType.CENTER,
                            spacing: { after: 200 }
                        })
                    ]
                }]
            });

            console.log(`✅ Document structure created for ${clientData.name}`);
            return doc;

        } catch (error) {
            console.error('❌ Error generating Schuldenbereinigungsplan:', error.message);
            throw new Error(`Document generation failed: ${error.message}`);
        }
    }

    /**
     * Create the creditor table matching the format in the screenshot
     */
    async createCreditorTable(creditorPayments) {
        const tableRows = [
            // Header Row
            new TableRow({
                children: [
                    new TableCell({
                        children: [new Paragraph({ 
                            children: [new TextRun({ text: "Nr.", bold: true, size: 20 })],
                            alignment: AlignmentType.CENTER
                        })],
                        width: { size: 8, type: WidthType.PERCENTAGE },
                        shading: { fill: "D9D9FF" }
                    }),
                    new TableCell({
                        children: [new Paragraph({ 
                            children: [new TextRun({ text: "Gläubiger", bold: true, size: 20 })],
                            alignment: AlignmentType.CENTER
                        })],
                        width: { size: 40, type: WidthType.PERCENTAGE },
                        shading: { fill: "D9D9FF" }
                    }),
                    new TableCell({
                        children: [new Paragraph({ 
                            children: [new TextRun({ text: "Forderung", bold: true, size: 20 })],
                            alignment: AlignmentType.CENTER
                        })],
                        width: { size: 26, type: WidthType.PERCENTAGE },
                        shading: { fill: "D9D9FF" }
                    }),
                    new TableCell({
                        children: [new Paragraph({ 
                            children: [new TextRun({ text: "Quote von Gesamtverschuldung", bold: true, size: 20 })],
                            alignment: AlignmentType.CENTER
                        })],
                        width: { size: 26, type: WidthType.PERCENTAGE },
                        shading: { fill: "D9D9FF" }
                    })
                ]
            })
        ];

        // Data Rows
        creditorPayments.forEach((creditor, index) => {
            tableRows.push(
                new TableRow({
                    children: [
                        new TableCell({
                            children: [new Paragraph({ 
                                children: [new TextRun({ text: (index + 1).toString(), size: 20 })],
                                alignment: AlignmentType.CENTER
                            })],
                            width: { size: 8, type: WidthType.PERCENTAGE }
                        }),
                        new TableCell({
                            children: [new Paragraph({ 
                                children: [new TextRun({ text: creditor.creditor_name, size: 20 })],
                                alignment: AlignmentType.LEFT
                            })],
                            width: { size: 40, type: WidthType.PERCENTAGE }
                        }),
                        new TableCell({
                            children: [new Paragraph({ 
                                children: [new TextRun({ text: this.formatCurrency(creditor.debt_amount), size: 20 })],
                                alignment: AlignmentType.RIGHT
                            })],
                            width: { size: 26, type: WidthType.PERCENTAGE }
                        }),
                        new TableCell({
                            children: [new Paragraph({ 
                                children: [new TextRun({ text: `${creditor.quota_percentage.toFixed(2)}%`, size: 20 })],
                                alignment: AlignmentType.RIGHT
                            })],
                            width: { size: 26, type: WidthType.PERCENTAGE }
                        })
                    ]
                })
            );
        });

        // Totals Row
        const totalDebt = creditorPayments.reduce((sum, c) => sum + c.debt_amount, 0);
        tableRows.push(
            new TableRow({
                children: [
                    new TableCell({
                        children: [new Paragraph({ 
                            children: [new TextRun({ text: "", size: 20 })],
                            alignment: AlignmentType.CENTER
                        })],
                        width: { size: 8, type: WidthType.PERCENTAGE }
                    }),
                    new TableCell({
                        children: [new Paragraph({ 
                            children: [new TextRun({ text: "Summe", bold: true, size: 20 })],
                            alignment: AlignmentType.LEFT
                        })],
                        width: { size: 40, type: WidthType.PERCENTAGE }
                    }),
                    new TableCell({
                        children: [new Paragraph({ 
                            children: [new TextRun({ text: this.formatCurrency(totalDebt), bold: true, size: 20 })],
                            alignment: AlignmentType.RIGHT
                        })],
                        width: { size: 26, type: WidthType.PERCENTAGE }
                    }),
                    new TableCell({
                        children: [new Paragraph({ 
                            children: [new TextRun({ text: "100,00%", bold: true, size: 20 })],
                            alignment: AlignmentType.RIGHT
                        })],
                        width: { size: 26, type: WidthType.PERCENTAGE }
                    })
                ]
            })
        );

        return new Table({
            rows: tableRows,
            width: { size: 100, type: WidthType.PERCENTAGE },
            borders: {
                top: { style: BorderStyle.SINGLE, size: 1 },
                bottom: { style: BorderStyle.SINGLE, size: 1 },
                left: { style: BorderStyle.SINGLE, size: 1 },
                right: { style: BorderStyle.SINGLE, size: 1 },
                insideHorizontal: { style: BorderStyle.SINGLE, size: 1 },
                insideVertical: { style: BorderStyle.SINGLE, size: 1 }
            }
        });
    }

    /**
     * Save document to file and return buffer
     */
    async saveDocument(doc, clientReference, filename = null) {
        try {
            const buffer = await Packer.toBuffer(doc);
            
            // Create documents directory if it doesn't exist
            const documentsDir = path.join(__dirname, '../documents');
            try {
                await fs.access(documentsDir);
            } catch {
                await fs.mkdir(documentsDir, { recursive: true });
            }
            
            // Generate filename if not provided
            const actualFilename = filename || `Schuldenbereinigungsplan_${clientReference}_${new Date().toISOString().split('T')[0]}.docx`;
            const filePath = path.join(documentsDir, actualFilename);
            
            // Save to file
            await fs.writeFile(filePath, buffer);
            
            console.log(`✅ Document saved: ${filePath}`);
            return {
                buffer,
                filename: actualFilename,
                path: filePath,
                size: buffer.length
            };
            
        } catch (error) {
            console.error('❌ Error saving document:', error.message);
            throw new Error(`Document save failed: ${error.message}`);
        }
    }

    /**
     * Format currency amount to German format
     */
    formatCurrency(amount) {
        if (typeof amount !== 'number' || isNaN(amount)) {
            return '0,00 €';
        }
        
        return new Intl.NumberFormat('de-DE', {
            style: 'currency',
            currency: 'EUR',
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        }).format(amount);
    }

    /**
     * Generate and save complete settlement plan document
     */
    async generateSettlementPlanDocument(clientReference, settlementData) {
        try {
            console.log(`📄 Starting document generation for client: ${clientReference}`);

            // Get client data
            const Client = require('../models/Client');
            const client = await Client.findOne({ aktenzeichen: clientReference });
            
            if (!client) {
                throw new Error(`Client not found: ${clientReference}`);
            }

            const clientData = {
                name: `${client.firstName} ${client.lastName}`,
                email: client.email,
                reference: clientReference
            };

            // Get creditor data from settlement data
            if (!settlementData.creditor_payments || settlementData.creditor_payments.length === 0) {
                throw new Error('No creditor payment data available for document generation');
            }

            console.log(`📊 Processing ${settlementData.creditor_payments.length} creditors for document`);

            // Generate the document
            const doc = await this.generateSchuldenbereinigungsplan(
                clientData,
                settlementData,
                settlementData // calculation result is part of settlement data
            );

            // Save the document
            const result = await this.saveDocument(doc, clientReference);

            console.log(`✅ Settlement plan document generated successfully`);
            console.log(`📁 File: ${result.filename} (${Math.round(result.size / 1024)} KB)`);

            return {
                success: true,
                document_info: {
                    filename: result.filename,
                    path: result.path,
                    size: result.size,
                    client_reference: clientReference,
                    generated_at: new Date().toISOString()
                },
                buffer: result.buffer
            };

        } catch (error) {
            console.error(`❌ Error generating settlement plan document: ${error.message}`);
            return {
                success: false,
                error: error.message,
                client_reference: clientReference
            };
        }
    }

    /**
     * Check if document generation is available
     */
    isAvailable() {
        return docxModule !== null;
    }

    /**
     * Test document generation with sample data
     */
    async testDocumentGeneration() {
        if (!docxModule) {
            throw new Error('Document generation is not available - docx package not installed. Please run: npm install docx');
        }

        const sampleClientData = {
            name: "Anke Laux",
            email: "anke.laux@example.com",
            reference: "TEST123"
        };

        const sampleSettlementData = {
            monthly_payment: 250.00,
            duration_months: 36,
            creditor_payments: [
                { creditor_name: "Telekom Deutschland GmbH", debt_amount: 1587.13, quota_percentage: 6.12 },
                { creditor_name: "Real Inkasso GmbH & Co. KG", debt_amount: 772.12, quota_percentage: 2.98 },
                { creditor_name: "REAL Solution Inkasso GmbH & Co. KG", debt_amount: 1661.60, quota_percentage: 6.40 },
                { creditor_name: "Drillisch Online GmbH", debt_amount: 1266.85, quota_percentage: 4.88 },
                { creditor_name: "Quelle AG", debt_amount: 2541.00, quota_percentage: 9.79 },
                { creditor_name: "Sirius Inkasso GmbH", debt_amount: 3277.77, quota_percentage: 12.63 },
                { creditor_name: "Talkline GmbH & Co. KG", debt_amount: 10427.85, quota_percentage: 40.19 },
                { creditor_name: "EOS Deutscher Inkasso Dienst", debt_amount: 4413.46, quota_percentage: 17.01 }
            ],
            total_debt: 25947.78,
            total_payment_amount: 9000.00,
            average_quota_percentage: 34.67
        };

        console.log('🧪 Testing document generation...');
        
        const doc = await this.generateSchuldenbereinigungsplan(
            sampleClientData, 
            sampleSettlementData, 
            sampleSettlementData
        );
        
        const result = await this.saveDocument(doc, sampleClientData.reference, 'TEST_Schuldenbereinigungsplan.docx');
        
        console.log('✅ Test document generated successfully!');
        return result;
    }
}

module.exports = DocumentGenerator;