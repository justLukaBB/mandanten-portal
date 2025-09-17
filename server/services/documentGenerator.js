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
     * Generate complete Schuldenbereinigungsplan Word document with save
     */
    async generateSchuldenbereinigungsplan(clientData, settlementData, calculationResult) {
        if (!docxModule) {
            throw new Error('Document generation is not available - docx package not installed. Please run: npm install docx');
        }

        try {
            console.log(`📄 Generating Schuldenbereinigungsplan for ${clientData.name}...`);

            // Generate the document
            const doc = await this.createSchuldenbereinigungsplanDocument(clientData, settlementData, calculationResult);

            // Save the document
            const result = await this.saveDocument(doc, clientData.reference);

            console.log(`✅ Schuldenbereinigungsplan document generated successfully`);
            console.log(`📁 File: ${result.filename} (${Math.round(result.size / 1024)} KB)`);

            return {
                success: true,
                document_info: {
                    filename: result.filename,
                    path: result.path,
                    size: result.size,
                    client_reference: clientData.reference,
                    generated_at: new Date().toISOString()
                },
                buffer: result.buffer
            };

        } catch (error) {
            console.error(`❌ Error generating Schuldenbereinigungsplan: ${error.message}`);
            return {
                success: false,
                error: error.message,
                client_reference: clientData.reference
            };
        }
    }

    /**
     * Create Schuldenbereinigungsplan document structure
     */
    async createSchuldenbereinigungsplanDocument(clientData, settlementData, calculationResult) {
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
                    // Document Title - matching screenshot format
                    new Paragraph({
                        children: [
                            new TextRun({
                                text: `Außergerichtlicher Schuldenbereinigungsplan vom ${currentDate}`,
                                bold: true,
                                size: 26
                            })
                        ],
                        alignment: AlignmentType.CENTER,
                        spacing: { after: 600 }
                    }),

                    // Debtor Information - matching screenshot format
                    new Paragraph({
                        children: [
                            new TextRun({
                                text: "Schuldner/-in:",
                                bold: true,
                                size: 20
                            }),
                            new TextRun({
                                text: `     ${clientData.name}`,
                                size: 20
                            })
                        ],
                        spacing: { after: 400 }
                    }),

                    // Quota Plan Information - matching screenshot format  
                    new Paragraph({
                        children: [
                            new TextRun({
                                text: "Quotenplan",
                                bold: true,
                                size: 20
                            }),
                            new TextRun({
                                text: `                              Laufzeit: ${settlementData.duration_months || 36} Monate`,
                                size: 20
                            })
                        ],
                        spacing: { after: 400 }
                    }),

                    // Payment Start Date - matching screenshot format
                    new Paragraph({
                        children: [
                            new TextRun({
                                text: "Beginn des Zahlungsplans",
                                size: 20
                            }),
                            new TextRun({
                                text: `          ${paymentStartDate.toLocaleDateString('de-DE')}`,
                                size: 20,
                                underline: {}
                            })
                        ],
                        spacing: { after: 600 }
                    }),

                    // Creditor Table
                    await this.createCreditorTable(calculationResult.creditor_payments, settlementData),

                    // Spacing after table
                    new Paragraph({
                        children: [new TextRun({ text: "" })],
                        spacing: { after: 400 }
                    }),

                    // Explanation Text (right side text box like in the screenshot)
                    new Paragraph({
                        children: [
                            new TextRun({
                                text: "Aufgrund schwankender Einkünfte oder mangels pfändbarem Einkommen wird nur die Quote angeboten. Die pfändbaren Beträge werden nach der Quote von Monat zu Monat neu errechnet. Die Verteilung der Zahlungen an die Gläubiger erfolgt einmal jährlich. Die Bedingungen in der Anlage sind Bestandteil dieses Plans.",
                                size: 18
                            })
                        ],
                        alignment: AlignmentType.JUSTIFIED,
                        indent: {
                            left: 5500, // Right-aligned text box
                            right: 200
                        },
                        spacing: { after: 600 }
                    }),

                    // Summary Information - matching screenshot format
                    new Paragraph({
                        children: [
                            new TextRun({
                                text: `\n\nGesamtsumme aller Forderungen: ${this.formatCurrency(calculationResult.total_debt)}`,
                                bold: true,
                                size: 18
                            })
                        ],
                        spacing: { after: 200 }
                    }),

                    new Paragraph({
                        children: [
                            new TextRun({
                                text: `Monatliche Zahlungsrate: ${this.formatCurrency(settlementData.monthly_payment)}`,
                                bold: true,
                                size: 18
                            })
                        ],
                        spacing: { after: 200 }
                    }),

                    new Paragraph({
                        children: [
                            new TextRun({
                                text: `Gesamte Zahlungssumme über ${settlementData.duration_months} Monate: ${this.formatCurrency(calculationResult.total_payment_amount)}`,
                                bold: true,
                                size: 18
                            })
                        ],
                        spacing: { after: 200 }
                    }),

                    new Paragraph({
                        children: [
                            new TextRun({
                                text: `Durchschnittliche Quote: ${calculationResult.average_quota_percentage.toFixed(2)}%`,
                                bold: true,
                                size: 18
                            })
                        ],
                        spacing: { after: 600 }
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
    }

    /**
     * Create the creditor table matching the format in the screenshot
     */
    async createCreditorTable(creditorPayments, settlementData) {
        // Calculate totals for the plan
        const totalDebt = creditorPayments.reduce((sum, c) => sum + c.debt_amount, 0);
        const monthlyPayment = settlementData.monthly_payment || 0;
        const duration = settlementData.duration_months || 36;
        const totalPayment = monthlyPayment * duration;
        const overallQuota = totalDebt > 0 ? (totalPayment / totalDebt) * 100 : 0;

        const tableRows = [
            // Header Row - matching exact format from screenshot
            new TableRow({
                children: [
                    new TableCell({
                        children: [new Paragraph({ 
                            children: [new TextRun({ text: "Nr.", bold: true, size: 18 })],
                            alignment: AlignmentType.CENTER
                        })],
                        width: { size: 6, type: WidthType.PERCENTAGE },
                        shading: { fill: "D9D9FF" },
                        borders: this.createTableBorders()
                    }),
                    new TableCell({
                        children: [new Paragraph({ 
                            children: [new TextRun({ text: "Gläubiger", bold: true, size: 18 })],
                            alignment: AlignmentType.CENTER
                        })],
                        width: { size: 28, type: WidthType.PERCENTAGE },
                        shading: { fill: "D9D9FF" },
                        borders: this.createTableBorders()
                    }),
                    new TableCell({
                        children: [new Paragraph({ 
                            children: [new TextRun({ text: "Zahlungsanspruch", bold: true, size: 18 })],
                            alignment: AlignmentType.CENTER
                        })],
                        width: { size: 16, type: WidthType.PERCENTAGE },
                        shading: { fill: "D9D9FF" },
                        borders: this.createTableBorders()
                    }),
                    new TableCell({
                        children: [new Paragraph({ 
                            children: [new TextRun({ text: "Quote", bold: true, size: 18 })],
                            alignment: AlignmentType.CENTER
                        })],
                        width: { size: 10, type: WidthType.PERCENTAGE },
                        shading: { fill: "D9D9FF" },
                        borders: this.createTableBorders()
                    }),
                    new TableCell({
                        children: [new Paragraph({ 
                            children: [new TextRun({ text: "%", bold: true, size: 18 })],
                            alignment: AlignmentType.CENTER
                        })],
                        width: { size: 8, type: WidthType.PERCENTAGE },
                        shading: { fill: "D9D9FF" },
                        borders: this.createTableBorders()
                    }),
                    new TableCell({
                        children: [new Paragraph({ 
                            children: [new TextRun({ text: "Monatl. Quote", bold: true, size: 18 })],
                            alignment: AlignmentType.CENTER
                        })],
                        width: { size: 12, type: WidthType.PERCENTAGE },
                        shading: { fill: "D9D9FF" },
                        borders: this.createTableBorders()
                    }),
                    new TableCell({
                        children: [new Paragraph({ 
                            children: [new TextRun({ text: "Gesamtquote der Forderung", bold: true, size: 18 })],
                            alignment: AlignmentType.CENTER
                        })],
                        width: { size: 20, type: WidthType.PERCENTAGE },
                        shading: { fill: "D9D9FF" },
                        borders: this.createTableBorders()
                    })
                ]
            })
        ];

        // Data Rows - matching the exact format from screenshot
        creditorPayments.forEach((creditor, index) => {
            // Calculate individual creditor amounts
            const creditorShare = totalDebt > 0 ? creditor.debt_amount / totalDebt : 0;
            const monthlyAmount = monthlyPayment * creditorShare;
            const totalAmount = monthlyAmount * duration;
            const creditorQuota = creditor.debt_amount > 0 ? (totalAmount / creditor.debt_amount) * 100 : 0;

            tableRows.push(
                new TableRow({
                    children: [
                        new TableCell({
                            children: [new Paragraph({ 
                                children: [new TextRun({ text: (index + 1).toString(), size: 16 })],
                                alignment: AlignmentType.CENTER
                            })],
                            borders: this.createTableBorders()
                        }),
                        new TableCell({
                            children: [new Paragraph({ 
                                children: [new TextRun({ text: creditor.creditor_name, size: 16 })],
                                alignment: AlignmentType.LEFT
                            })],
                            borders: this.createTableBorders()
                        }),
                        new TableCell({
                            children: [new Paragraph({ 
                                children: [new TextRun({ text: this.formatCurrency(creditor.debt_amount), size: 16 })],
                                alignment: AlignmentType.RIGHT
                            })],
                            borders: this.createTableBorders()
                        }),
                        new TableCell({
                            children: [new Paragraph({ 
                                children: [new TextRun({ text: this.formatCurrency(totalAmount), size: 16 })],
                                alignment: AlignmentType.RIGHT
                            })],
                            borders: this.createTableBorders()
                        }),
                        new TableCell({
                            children: [new Paragraph({ 
                                children: [new TextRun({ text: `${creditorQuota.toFixed(2)}`, size: 16 })],
                                alignment: AlignmentType.RIGHT
                            })],
                            borders: this.createTableBorders()
                        }),
                        new TableCell({
                            children: [new Paragraph({ 
                                children: [new TextRun({ text: this.formatCurrency(monthlyAmount), size: 16 })],
                                alignment: AlignmentType.RIGHT
                            })],
                            borders: this.createTableBorders()
                        }),
                        new TableCell({
                            children: [new Paragraph({ 
                                children: [new TextRun({ text: this.formatCurrency(totalAmount), size: 16 })],
                                alignment: AlignmentType.RIGHT
                            })],
                            borders: this.createTableBorders()
                        })
                    ]
                })
            );
        });

        // Totals Row (matching the new table structure)
        tableRows.push(
            new TableRow({
                children: [
                    new TableCell({
                        children: [new Paragraph({ 
                            children: [new TextRun({ text: "", size: 16 })],
                            alignment: AlignmentType.CENTER
                        })],
                        borders: this.createTableBorders(),
                        shading: { fill: "E8E8E8" }
                    }),
                    new TableCell({
                        children: [new Paragraph({ 
                            children: [new TextRun({ text: "Summe", bold: true, size: 16 })],
                            alignment: AlignmentType.LEFT
                        })],
                        borders: this.createTableBorders(),
                        shading: { fill: "E8E8E8" }
                    }),
                    new TableCell({
                        children: [new Paragraph({ 
                            children: [new TextRun({ text: this.formatCurrency(totalDebt), bold: true, size: 16 })],
                            alignment: AlignmentType.RIGHT
                        })],
                        borders: this.createTableBorders(),
                        shading: { fill: "E8E8E8" }
                    }),
                    new TableCell({
                        children: [new Paragraph({ 
                            children: [new TextRun({ text: this.formatCurrency(totalPayment), bold: true, size: 16 })],
                            alignment: AlignmentType.RIGHT
                        })],
                        borders: this.createTableBorders(),
                        shading: { fill: "E8E8E8" }
                    }),
                    new TableCell({
                        children: [new Paragraph({ 
                            children: [new TextRun({ text: `${overallQuota.toFixed(2)}`, bold: true, size: 16 })],
                            alignment: AlignmentType.RIGHT
                        })],
                        borders: this.createTableBorders(),
                        shading: { fill: "E8E8E8" }
                    }),
                    new TableCell({
                        children: [new Paragraph({ 
                            children: [new TextRun({ text: this.formatCurrency(monthlyPayment), bold: true, size: 16 })],
                            alignment: AlignmentType.RIGHT
                        })],
                        borders: this.createTableBorders(),
                        shading: { fill: "E8E8E8" }
                    }),
                    new TableCell({
                        children: [new Paragraph({ 
                            children: [new TextRun({ text: this.formatCurrency(totalPayment), bold: true, size: 16 })],
                            alignment: AlignmentType.RIGHT
                        })],
                        borders: this.createTableBorders(),
                        shading: { fill: "E8E8E8" }
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
     * Create table borders configuration
     */
    createTableBorders() {
        return {
            top: { style: BorderStyle.SINGLE, size: 1, color: "000000" },
            bottom: { style: BorderStyle.SINGLE, size: 1, color: "000000" },
            left: { style: BorderStyle.SINGLE, size: 1, color: "000000" },
            right: { style: BorderStyle.SINGLE, size: 1, color: "000000" }
        };
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

    /**
     * Generate complete Forderungsübersicht (Debt Overview) Word document
     */
    async generateForderungsuebersicht(clientData, creditorData) {
        if (!docxModule) {
            throw new Error('Document generation is not available - docx package not installed. Please run: npm install docx');
        }

        try {
            console.log(`📄 Generating Forderungsübersicht for ${clientData.name}...`);

            // Format the date for the document title
            const currentDate = new Date().toLocaleDateString('de-DE', {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric'
            });

            const doc = new Document({
                ...this.documentOptions,
                title: "Gläubiger- und Forderungsübersicht",
                sections: [{
                    properties: {},
                    children: [
                        // Document Title
                        new Paragraph({
                            children: [
                                new TextRun({
                                    text: `Gläubiger- und Forderungsübersicht vom     ${currentDate}`,
                                    bold: true,
                                    size: 24
                                })
                            ],
                            spacing: { after: 600 }
                        }),

                        // Applicant Information
                        new Paragraph({
                            children: [
                                new TextRun({
                                    text: "Antragsteller/-in:",
                                    bold: true,
                                    size: 22
                                }),
                                new TextRun({
                                    text: `     ${clientData.name}`,
                                    size: 22
                                })
                            ],
                            spacing: { after: 800 }
                        }),

                        // Creditor Table
                        await this.createForderungsuebersichtTable(creditorData),

                        // Page number footer
                        new Paragraph({
                            children: [
                                new TextRun({
                                    text: "Seite 1",
                                    size: 18
                                })
                            ],
                            alignment: AlignmentType.RIGHT,
                            spacing: { before: 800, after: 200 }
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
                            spacing: { before: 400 }
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

            console.log(`✅ Forderungsübersicht structure created for ${clientData.name}`);
            return doc;

        } catch (error) {
            console.error('❌ Error generating Forderungsübersicht:', error.message);
            throw new Error(`Forderungsübersicht generation failed: ${error.message}`);
        }
    }

    /**
     * Create the creditor overview table matching the format in the screenshot
     */
    async createForderungsuebersichtTable(creditorData) {
        const tableRows = [
            // Header Row
            new TableRow({
                children: [
                    new TableCell({
                        children: [new Paragraph({ 
                            children: [new TextRun({ text: "Nr.", bold: true, size: 18 })],
                            alignment: AlignmentType.CENTER
                        })],
                        width: { size: 5, type: WidthType.PERCENTAGE },
                        shading: { fill: "D9D9FF" }
                    }),
                    new TableCell({
                        children: [new Paragraph({ 
                            children: [new TextRun({ text: "Gläubiger", bold: true, size: 18 })],
                            alignment: AlignmentType.CENTER
                        })],
                        width: { size: 25, type: WidthType.PERCENTAGE },
                        shading: { fill: "D9D9FF" }
                    }),
                    new TableCell({
                        children: [new Paragraph({ 
                            children: [new TextRun({ text: "Aktenzeichen", bold: true, size: 18 })],
                            alignment: AlignmentType.CENTER
                        })],
                        width: { size: 12, type: WidthType.PERCENTAGE },
                        shading: { fill: "D9D9FF" }
                    }),
                    new TableCell({
                        children: [new Paragraph({ 
                            children: [new TextRun({ text: "Gläubigervertreter", bold: true, size: 18 })],
                            alignment: AlignmentType.CENTER
                        })],
                        width: { size: 25, type: WidthType.PERCENTAGE },
                        shading: { fill: "D9D9FF" }
                    }),
                    new TableCell({
                        children: [new Paragraph({ 
                            children: [new TextRun({ text: "Aktenzeichen", bold: true, size: 18 })],
                            alignment: AlignmentType.CENTER
                        })],
                        width: { size: 10, type: WidthType.PERCENTAGE },
                        shading: { fill: "D9D9FF" }
                    }),
                    new TableCell({
                        children: [new Paragraph({ 
                            children: [new TextRun({ text: "berechnet zum Datum EUR", bold: true, size: 18 })],
                            alignment: AlignmentType.CENTER
                        })],
                        width: { size: 8, type: WidthType.PERCENTAGE },
                        shading: { fill: "D9D9FF" }
                    }),
                    new TableCell({
                        children: [new Paragraph({ 
                            children: [new TextRun({ text: "Gesamt-forderung EUR", bold: true, size: 18 })],
                            alignment: AlignmentType.CENTER
                        })],
                        width: { size: 8, type: WidthType.PERCENTAGE },
                        shading: { fill: "D9D9FF" }
                    }),
                    new TableCell({
                        children: [new Paragraph({ 
                            children: [new TextRun({ text: "Forderungsgrund", bold: true, size: 18 })],
                            alignment: AlignmentType.CENTER
                        })],
                        width: { size: 7, type: WidthType.PERCENTAGE },
                        shading: { fill: "D9D9FF" }
                    }),
                    new TableCell({
                        children: [new Paragraph({ 
                            children: [new TextRun({ text: "Bemerkungen", bold: true, size: 18 })],
                            alignment: AlignmentType.CENTER
                        })],
                        width: { size: 10, type: WidthType.PERCENTAGE },
                        shading: { fill: "D9D9FF" }
                    })
                ]
            })
        ];

        // Data Rows
        creditorData.forEach((creditor, index) => {
            // Format creditor information
            const creditorInfo = this.formatCreditorInfo(creditor);
            const representativeInfo = this.formatRepresentativeInfo(creditor);

            tableRows.push(
                new TableRow({
                    children: [
                        new TableCell({
                            children: [new Paragraph({ 
                                children: [new TextRun({ text: (index + 1).toString(), size: 16 })],
                                alignment: AlignmentType.CENTER
                            })],
                            width: { size: 5, type: WidthType.PERCENTAGE }
                        }),
                        new TableCell({
                            children: [new Paragraph({ 
                                children: [new TextRun({ text: creditorInfo, size: 16 })],
                                alignment: AlignmentType.LEFT
                            })],
                            width: { size: 25, type: WidthType.PERCENTAGE }
                        }),
                        new TableCell({
                            children: [new Paragraph({ 
                                children: [new TextRun({ text: creditor.creditor_reference || '', size: 16 })],
                                alignment: AlignmentType.LEFT
                            })],
                            width: { size: 12, type: WidthType.PERCENTAGE }
                        }),
                        new TableCell({
                            children: [new Paragraph({ 
                                children: [new TextRun({ text: representativeInfo, size: 16 })],
                                alignment: AlignmentType.LEFT
                            })],
                            width: { size: 25, type: WidthType.PERCENTAGE }
                        }),
                        new TableCell({
                            children: [new Paragraph({ 
                                children: [new TextRun({ text: creditor.representative_reference || '', size: 16 })],
                                alignment: AlignmentType.LEFT
                            })],
                            width: { size: 10, type: WidthType.PERCENTAGE }
                        }),
                        new TableCell({
                            children: [new Paragraph({ 
                                children: [new TextRun({ text: '', size: 16 })],
                                alignment: AlignmentType.CENTER
                            })],
                            width: { size: 8, type: WidthType.PERCENTAGE }
                        }),
                        new TableCell({
                            children: [new Paragraph({ 
                                children: [new TextRun({ text: this.formatCurrency(creditor.debt_amount), size: 16 })],
                                alignment: AlignmentType.RIGHT
                            })],
                            width: { size: 8, type: WidthType.PERCENTAGE }
                        }),
                        new TableCell({
                            children: [new Paragraph({ 
                                children: [new TextRun({ text: creditor.debt_reason || '', size: 16 })],
                                alignment: AlignmentType.LEFT
                            })],
                            width: { size: 7, type: WidthType.PERCENTAGE }
                        }),
                        new TableCell({
                            children: [new Paragraph({ 
                                children: [new TextRun({ text: creditor.remarks || '', size: 16 })],
                                alignment: AlignmentType.LEFT
                            })],
                            width: { size: 10, type: WidthType.PERCENTAGE }
                        })
                    ]
                })
            );
        });

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
     * Format creditor information for the overview table
     */
    formatCreditorInfo(creditor) {
        const lines = [];
        
        if (creditor.creditor_name) {
            lines.push(creditor.creditor_name);
        }
        
        if (creditor.creditor_address) {
            const addressLines = creditor.creditor_address.split('\n');
            lines.push(...addressLines);
        }
        
        if (creditor.creditor_email) {
            lines.push(`E-Mail: ${creditor.creditor_email}`);
        }
        
        return lines.join('\n');
    }

    /**
     * Format representative information for the overview table
     */
    formatRepresentativeInfo(creditor) {
        if (!creditor.is_representative || !creditor.representative_info) {
            return '';
        }

        const rep = creditor.representative_info;
        const lines = [];
        
        if (rep.name) {
            lines.push(rep.name);
        }
        
        if (rep.address) {
            const addressLines = rep.address.split('\n');
            lines.push(...addressLines);
        }
        
        if (rep.email) {
            lines.push(`E-Mail: ${rep.email}`);
        }
        
        return lines.join('\n');
    }

    /**
     * Generate and save complete Forderungsübersicht document
     */
    async generateForderungsuebersichtDocument(clientReference) {
        try {
            console.log(`📄 Starting Forderungsübersicht generation for client: ${clientReference}`);

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

            // Get creditor data from final_creditor_list or creditor calculation table
            let creditorData = [];
            
            if (client.creditor_calculation_table && client.creditor_calculation_table.length > 0) {
                // Use creditor calculation table if available (more complete data)
                creditorData = client.creditor_calculation_table.map(creditor => ({
                    creditor_name: creditor.name,
                    creditor_address: creditor.address,
                    creditor_email: creditor.email,
                    creditor_reference: creditor.reference_number,
                    debt_amount: creditor.final_amount,
                    debt_reason: '', // Could be added to the data model later
                    remarks: creditor.contact_status === 'responded' ? 'Antwort erhalten' : 
                             creditor.contact_status === 'no_response' ? 'Keine Antwort' : 
                             'E-Mail fehlgeschlagen',
                    is_representative: creditor.is_representative,
                    representative_info: creditor.is_representative ? {
                        name: creditor.actual_creditor,
                        address: '', // Could be added to data model
                        email: ''
                    } : null,
                    representative_reference: ''
                }));
            } else if (client.final_creditor_list && client.final_creditor_list.length > 0) {
                // Fallback to final_creditor_list
                creditorData = client.final_creditor_list
                    .filter(creditor => creditor.status === 'confirmed')
                    .map(creditor => ({
                        creditor_name: creditor.sender_name,
                        creditor_address: creditor.sender_address,
                        creditor_email: creditor.sender_email,
                        creditor_reference: creditor.reference_number,
                        debt_amount: creditor.claim_amount || 0,
                        debt_reason: '',
                        remarks: '',
                        is_representative: creditor.is_representative || false,
                        representative_info: creditor.is_representative ? {
                            name: creditor.actual_creditor,
                            address: '',
                            email: ''
                        } : null,
                        representative_reference: ''
                    }));
            }

            if (creditorData.length === 0) {
                throw new Error('No creditor data available for Forderungsübersicht generation');
            }

            console.log(`📊 Processing ${creditorData.length} creditors for Forderungsübersicht`);

            // Generate the document
            const doc = await this.generateForderungsuebersicht(clientData, creditorData);

            // Save the document
            const filename = `Forderungsuebersicht_${clientReference}_${new Date().toISOString().split('T')[0]}.docx`;
            const result = await this.saveDocument(doc, clientReference, filename);

            console.log(`✅ Forderungsübersicht document generated successfully`);
            console.log(`📁 File: ${result.filename} (${Math.round(result.size / 1024)} KB)`);

            return {
                success: true,
                document_info: {
                    filename: result.filename,
                    path: result.path,
                    size: result.size,
                    client_reference: clientReference,
                    document_type: 'forderungsuebersicht',
                    generated_at: new Date().toISOString()
                },
                buffer: result.buffer
            };

        } catch (error) {
            console.error(`❌ Error generating Forderungsübersicht document: ${error.message}`);
            return {
                success: false,
                error: error.message,
                client_reference: clientReference,
                document_type: 'forderungsuebersicht'
            };
        }
    }
}

module.exports = DocumentGenerator;