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
const { formatAddress } = require('../utils/addressFormatter');

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

        // Validate and prepare creditor payments data
   // ✅ Validate and prepare creditor payments data (with full fallback chain)
let creditorPayments = settlementData.creditor_payments || [];

if (!creditorPayments?.length) {
  console.warn('⚠️ No creditor_payments found in settlementData, checking settlementData.creditors...');
  
  if (settlementData.creditors?.length) {
    console.log(`📊 Found ${settlementData.creditors.length} creditors in settlementData.creditors`);
    creditorPayments = settlementData.creditors.map(c => ({
      creditor_name: c.sender_name || c.creditor_name || 'Unknown Creditor',
      debt_amount: c.claim_amount || c.debt_amount || 0
    }));
  } else if (clientData.final_creditor_list?.length) {
    console.log(`📊 Using clientData.final_creditor_list with ${clientData.final_creditor_list.length} creditors`);
    creditorPayments = clientData.final_creditor_list.map(c => ({
      creditor_name: c.sender_name || c.actual_creditor || 'Unknown Creditor',
      debt_amount: c.claim_amount || c.debt_amount || 0
    }));
  } else {
    console.error('❌ No creditor data found in settlementData or clientData!');
    throw new Error('No creditor data available to build Schuldenbereinigungsplan table');
  }
}

// ✅ Compute derived payment values if not already provided
const totalDebt = creditorPayments.reduce((sum, c) => sum + (c.debt_amount || 0), 0);
const monthlyBudget = settlementData.monthly_payment || settlementData.garnishable_amount || 0;
const duration = settlementData.duration_months || 36;

creditorPayments = creditorPayments.map(c => ({
  creditor_name: c.creditor_name,
  debt_amount: c.debt_amount || 0,
  payment_percentage: totalDebt > 0 ? ((c.debt_amount || 0) / totalDebt) * 100 : 0,
  monthly_payment: totalDebt > 0 ? (monthlyBudget * ((c.debt_amount || 0) / totalDebt)) : 0
}));

console.log(`✅ Final creditorPayments prepared: ${creditorPayments.length} entries`);
if (creditorPayments.length > 0) {
  console.log('📋 Example creditor:', creditorPayments[0]);
}

        
        
        console.log(`📊 Creating creditor table with ${creditorPayments.length} creditors`);
        if (creditorPayments.length > 0) {
            console.log(`📋 Sample creditor data: ${JSON.stringify(creditorPayments[0])}`);
        } else {
            console.error('❌ ERROR: No creditor payments data available for table generation!');
            throw new Error('No creditor payments data available for Schuldenbereinigungsplan table generation');
        }

        // Generate the creditor table BEFORE creating the document (fix async issue)
        const creditorTable = await this.createCreditorTableForPlan(creditorPayments, settlementData);

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

                    // Creditor Table - already generated above
                    creditorTable,

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
                                text: `\n\nGesamtsumme aller Forderungen: ${this.formatCurrency(settlementData.total_debt)}`,
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
                                text: `Gesamte Zahlungssumme über ${settlementData.duration_months} Monate: ${this.formatCurrency(settlementData.total_payment_amount)}`,
                                bold: true,
                                size: 18
                            })
                        ],
                        spacing: { after: 200 }
                    }),

                    new Paragraph({
                        children: [
                            new TextRun({
                                text: `Durchschnittliche Quote: ${settlementData.average_quota_percentage ? settlementData.average_quota_percentage.toFixed(2) : '0.00'}%`,
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
     * Create creditor table for settlement plan - detects Nullplan vs. regular plan
     */
    async createCreditorTableForPlan(creditorPayments, settlementData) {
        console.log(`📊 createCreditorTableForPlan called with ${creditorPayments?.length || 0} creditors`);
        
        if (!creditorPayments || creditorPayments.length === 0) {
            console.error('❌ ERROR: createCreditorTableForPlan called with empty creditorPayments!');
            throw new Error('Cannot create creditor table: creditorPayments is empty or undefined');
        }
        
        // Check if this is a Nullplan (no monthly payment or payment is 0)
        const monthlyPayment = settlementData.monthly_payment || settlementData.garnishable_amount || 0;
        const isNullplan = monthlyPayment === 0 || monthlyPayment < 1;
        
        if (isNullplan) {
            console.log('📋 Creating Nullplan table (ohne pfändbares Einkommen)');
            return await this.createSimpleCreditorTable(creditorPayments);
        } else {
            console.log('📋 Creating regular settlement plan table (mit pfändbarem Einkommen)');
            return await this.createCreditorTable(creditorPayments, settlementData);
        }
    }

    /**
     * Create simple creditor table for Nullplan (ohne pfändbares Einkommen)
     */
    async createSimpleCreditorTable(creditorPayments) {
        // Calculate total debt
        const totalDebt = creditorPayments.reduce((sum, c) => sum + (c.debt_amount || 0), 0);

        const tableRows = [
            // Header Row - simplified for Nullplan (4 columns only)
            new TableRow({
                children: [
                    new TableCell({
                        children: [new Paragraph({
                            children: [new TextRun({ text: "Nr.", bold: true, size: 18 })],
                            alignment: AlignmentType.CENTER
                        })],
                        width: { size: 10, type: WidthType.PERCENTAGE },
                        shading: { fill: "D9D9FF" },
                        borders: this.createTableBorders()
                    }),
                    new TableCell({
                        children: [new Paragraph({
                            children: [new TextRun({ text: "Gläubiger", bold: true, size: 18 })],
                            alignment: AlignmentType.CENTER
                        })],
                        width: { size: 45, type: WidthType.PERCENTAGE },
                        shading: { fill: "D9D9FF" },
                        borders: this.createTableBorders()
                    }),
                    new TableCell({
                        children: [new Paragraph({
                            children: [new TextRun({ text: "Forderung", bold: true, size: 18 })],
                            alignment: AlignmentType.CENTER
                        })],
                        width: { size: 20, type: WidthType.PERCENTAGE },
                        shading: { fill: "D9D9FF" },
                        borders: this.createTableBorders()
                    }),
                    new TableCell({
                        children: [new Paragraph({
                            children: [new TextRun({ text: "Quote von Gesamtverschuldung", bold: true, size: 18 })],
                            alignment: AlignmentType.CENTER
                        })],
                        width: { size: 25, type: WidthType.PERCENTAGE },
                        shading: { fill: "D9D9FF" },
                        borders: this.createTableBorders()
                    })
                ]
            })
        ];

        // Data Rows for Nullplan
        creditorPayments.forEach((creditor, index) => {
            const debtAmount = creditor.debt_amount || 0;
            const debtPercentage = totalDebt > 0 ? (debtAmount / totalDebt) * 100 : 0;
            
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
                                children: [new TextRun({
                                    text: creditor.creditor_name || creditor.name || 'N/A',
                                    size: 16
                                })],
                                alignment: AlignmentType.LEFT
                            })],
                            borders: this.createTableBorders()
                        }),
                        new TableCell({
                            children: [new Paragraph({
                                children: [new TextRun({
                                    text: this.formatCurrency(debtAmount),
                                    size: 16
                                })],
                                alignment: AlignmentType.RIGHT
                            })],
                            borders: this.createTableBorders()
                        }),
                        new TableCell({
                            children: [new Paragraph({
                                children: [new TextRun({
                                    text: this.formatPercentage(debtPercentage),
                                    size: 16
                                })],
                                alignment: AlignmentType.RIGHT
                            })],
                            borders: this.createTableBorders()
                        })
                    ]
                })
            );
        });

        // Total Row
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
                            children: [new TextRun({
                                text: this.formatCurrency(totalDebt),
                                bold: true,
                                size: 16
                            })],
                            alignment: AlignmentType.RIGHT
                        })],
                        borders: this.createTableBorders(),
                        shading: { fill: "E8E8E8" }
                    }),
                    new TableCell({
                        children: [new Paragraph({
                            children: [new TextRun({
                                text: "100,00%",
                                bold: true,
                                size: 16
                            })],
                            alignment: AlignmentType.RIGHT
                        })],
                        borders: this.createTableBorders(),
                        shading: { fill: "E8E8E8" }
                    })
                ]
            })
        );

        return new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: tableRows,
            float: {
                horizontalAnchor: HorizontalPositionAlign.CENTER,
                verticalAnchor: VerticalPositionAlign.TOP,
            }
        });
    }

    /**
     * Create the creditor table with correct German debt restructuring table specifications
     */
    async createCreditorTable(creditorPayments, settlementData) {
        console.log(`📊 createCreditorTable called with ${creditorPayments?.length || 0} creditors`);
        
        if (!creditorPayments || creditorPayments.length === 0) {
            console.error('❌ ERROR: createCreditorTable called with empty or undefined creditorPayments!');
            throw new Error('Cannot create creditor table: creditorPayments is empty or undefined');
        }
        
        console.log(`📋 Sample creditor payment: ${JSON.stringify(creditorPayments[0])}`);
        
        // Calculate totals for the plan
        const totalDebt = creditorPayments.reduce((sum, c) => sum + (c.debt_amount || 0), 0);
        const monthlyBudget = settlementData.monthly_payment || settlementData.garnishable_amount || 0;
        const duration = settlementData.duration_months || 36;
        
        console.log(`💰 Total debt: ${totalDebt}, Monthly budget: ${monthlyBudget}, Duration: ${duration} months`);

        const tableRows = [
            // Header Row - exactly 7 columns as specified
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
                        width: { size: 22, type: WidthType.PERCENTAGE },
                        shading: { fill: "D9D9FF" },
                        borders: this.createTableBorders()
                    }),
                    new TableCell({
                        children: [new Paragraph({ 
                            children: [new TextRun({ text: "Forderung", bold: true, size: 18 })],
                            alignment: AlignmentType.CENTER
                        })],
                        width: { size: 12, type: WidthType.PERCENTAGE },
                        shading: { fill: "D9D9FF" },
                        borders: this.createTableBorders()
                    }),
                    new TableCell({
                        children: [new Paragraph({ 
                            children: [new TextRun({ text: "Quote von Gesamtverschuldung", bold: true, size: 18 })],
                            alignment: AlignmentType.CENTER
                        })],
                        width: { size: 16, type: WidthType.PERCENTAGE },
                        shading: { fill: "D9D9FF" },
                        borders: this.createTableBorders()
                    }),
                    new TableCell({
                        children: [new Paragraph({ 
                            children: [new TextRun({ text: "mtl.", bold: true, size: 18 })],
                            alignment: AlignmentType.CENTER
                        })],
                        width: { size: 12, type: WidthType.PERCENTAGE },
                        shading: { fill: "D9D9FF" },
                        borders: this.createTableBorders()
                    }),
                    new TableCell({
                        children: [new Paragraph({ 
                            children: [new TextRun({ text: "Gesamthöhe des Tilgungsangebots", bold: true, size: 18 })],
                            alignment: AlignmentType.CENTER
                        })],
                        width: { size: 16, type: WidthType.PERCENTAGE },
                        shading: { fill: "D9D9FF" },
                        borders: this.createTableBorders()
                    }),
                    new TableCell({
                        children: [new Paragraph({ 
                            children: [new TextRun({ text: "Regulierungsquote", bold: true, size: 18 })],
                            alignment: AlignmentType.CENTER
                        })],
                        width: { size: 16, type: WidthType.PERCENTAGE },
                        shading: { fill: "D9D9FF" },
                        borders: this.createTableBorders()
                    })
                ]
            })
        ];

        // Data Rows - with correct calculations as specified
        creditorPayments.forEach((creditor, index) => {
            // Column 4: Quote von Gesamtverschuldung = (Individual Forderung / Sum of all Forderungen) × 100
            const quoteTotalDebt = totalDebt > 0 ? (creditor.debt_amount / totalDebt) * 100 : 0;
            
            // Column 5: mtl. = (Total Monthly Budget × Quote von Gesamtverschuldung) / 100
            const monthlyPayment = (monthlyBudget * quoteTotalDebt) / 100;
            
            // Column 6: Gesamthöhe des Tilgungsangebots = mtl. × 36 months
            const totalRepayment = monthlyPayment * duration;
            
            // Column 7: Regulierungsquote = (Gesamthöhe des Tilgungsangebots / Forderung) × 100
            const settlementRate = creditor.debt_amount > 0 ? (totalRepayment / creditor.debt_amount) * 100 : 0;

            tableRows.push(
                new TableRow({
                    children: [
                        // Column 1: Nr.
                        new TableCell({
                            children: [new Paragraph({ 
                                children: [new TextRun({ text: (index + 1).toString(), size: 16 })],
                                alignment: AlignmentType.CENTER
                            })],
                            borders: this.createTableBorders()
                        }),
                        // Column 2: Gläubiger
                        new TableCell({
                            children: [new Paragraph({ 
                                children: [new TextRun({ text: creditor.creditor_name, size: 16 })],
                                alignment: AlignmentType.LEFT
                            })],
                            borders: this.createTableBorders()
                        }),
                        // Column 3: Forderung
                        new TableCell({
                            children: [new Paragraph({ 
                                children: [new TextRun({ text: this.formatCurrency(creditor.debt_amount), size: 16 })],
                                alignment: AlignmentType.RIGHT
                            })],
                            borders: this.createTableBorders()
                        }),
                        // Column 4: Quote von Gesamtverschuldung
                        new TableCell({
                            children: [new Paragraph({ 
                                children: [new TextRun({ text: this.formatPercentage(quoteTotalDebt), size: 16 })],
                                alignment: AlignmentType.RIGHT
                            })],
                            borders: this.createTableBorders()
                        }),
                        // Column 5: mtl.
                        new TableCell({
                            children: [new Paragraph({ 
                                children: [new TextRun({ text: this.formatCurrency(monthlyPayment), size: 16 })],
                                alignment: AlignmentType.RIGHT
                            })],
                            borders: this.createTableBorders()
                        }),
                        // Column 6: Gesamthöhe des Tilgungsangebots
                        new TableCell({
                            children: [new Paragraph({ 
                                children: [new TextRun({ text: this.formatCurrency(totalRepayment), size: 16 })],
                                alignment: AlignmentType.RIGHT
                            })],
                            borders: this.createTableBorders()
                        }),
                        // Column 7: Regulierungsquote
                        new TableCell({
                            children: [new Paragraph({ 
                                children: [new TextRun({ text: this.formatPercentage(settlementRate), size: 16 })],
                                alignment: AlignmentType.RIGHT
                            })],
                            borders: this.createTableBorders()
                        })
                    ]
                })
            );
        });

        // Totals Row
        const totalMonthlyPayments = creditorPayments.reduce((sum, creditor) => {
            const quoteTotalDebt = totalDebt > 0 ? (creditor.debt_amount / totalDebt) * 100 : 0;
            const monthlyPayment = (monthlyBudget * quoteTotalDebt) / 100;
            return sum + monthlyPayment;
        }, 0);

        const totalRepayments = totalMonthlyPayments * duration;
        const averageSettlementRate = totalDebt > 0 ? (totalRepayments / totalDebt) * 100 : 0;

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
                            children: [new TextRun({ text: "100,00%", bold: true, size: 16 })],
                            alignment: AlignmentType.RIGHT
                        })],
                        borders: this.createTableBorders(),
                        shading: { fill: "E8E8E8" }
                    }),
                    new TableCell({
                        children: [new Paragraph({ 
                            children: [new TextRun({ text: this.formatCurrency(monthlyBudget), bold: true, size: 16 })],
                            alignment: AlignmentType.RIGHT
                        })],
                        borders: this.createTableBorders(),
                        shading: { fill: "E8E8E8" }
                    }),
                    new TableCell({
                        children: [new Paragraph({ 
                            children: [new TextRun({ text: this.formatCurrency(totalRepayments), bold: true, size: 16 })],
                            alignment: AlignmentType.RIGHT
                        })],
                        borders: this.createTableBorders(),
                        shading: { fill: "E8E8E8" }
                    }),
                    new TableCell({
                        children: [new Paragraph({ 
                            children: [new TextRun({ text: this.formatPercentage(averageSettlementRate), bold: true, size: 16 })],
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
     * Format percentage to German format
     */
    formatPercentage(percentage) {
        if (typeof percentage !== 'number' || isNaN(percentage)) {
            return '0,00%';
        }
        
        return new Intl.NumberFormat('de-DE', {
            style: 'percent',
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        }).format(percentage / 100);
    }

    /**
     * Generate Ratenplan pfändbares Einkommen document
     */
    async generateRatenplanPfaendbaresEinkommen(clientReference, settlementData) {
        try {
            console.log(`📄 Starting Ratenplan document generation for client: ${clientReference}`);

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

            // Get pfändbares Einkommen data - check multiple sources
            const pfaendbarAmount = settlementData?.garnishable_amount !== undefined ? settlementData.garnishable_amount :
                                   settlementData?.monthly_payment !== undefined ? settlementData.monthly_payment :
                                   client.debt_settlement_plan?.pfaendbar_amount !== undefined ? client.debt_settlement_plan.pfaendbar_amount :
                                   client.financial_data?.pfaendbar_amount !== undefined ? client.financial_data.pfaendbar_amount :
                                   client.calculated_settlement_plan?.garnishable_amount !== undefined ? client.calculated_settlement_plan.garnishable_amount : 0;

            // Allow < 1 EUR for Nullplan cases (use threshold to handle rounding)
            const isNullplan = settlementData?.plan_type === 'nullplan' || pfaendbarAmount < 1;

            if (pfaendbarAmount < 0) {
                throw new Error('Invalid pfändbares Einkommen amount (negative value)');
            }

            console.log(`💰 Ratenplan generation: pfändbar amount = €${pfaendbarAmount.toFixed(2)} (${isNullplan ? 'Nullplan' : 'Regular plan'}, threshold: €1.00)`);

            if (!isNullplan && pfaendbarAmount < 1) {
                throw new Error('No pfändbares Einkommen available for regular Ratenplan generation (< €1.00)');
            }

            // Generate the document based on plan type
            let doc, result;

            if (isNullplan) {
                // For Nullplan: Generate special Nullplan-Ratenplan document
                console.log(`📝 Generating Nullplan-Ratenplan (no monthly payments)`);
                doc = await this.generateNullplanRatenplanDocument(clientData, settlementData);
                result = await this.saveNullplanRatenplanDocument(doc, clientReference);
            } else {
                // For regular plan: Generate pfändbares Einkommen Ratenplan (NEW: Multi-document per creditor)
                console.log(`📝 Generating regular Ratenplan with monthly payments`);
                const multiDocResult = await this.generateRatenplanDocument(clientData, settlementData, pfaendbarAmount);
                
                if (!multiDocResult.success || !multiDocResult.documents || multiDocResult.documents.length === 0) {
                    throw new Error(multiDocResult.error || 'No documents generated');
                }
                
                // NEW: Return both old format (for backwards compatibility) and new format (for multi-document)
                const firstDoc = multiDocResult.documents[0]; // Use first document for backwards compatibility
                console.log(`✅ Ratenplan pfändbares Einkommen document generated successfully`);
                console.log(`📁 File: ${firstDoc.filename} (${Math.round(firstDoc.size / 1024)} KB)`);
                
                return {
                    success: true,
                    // OLD FORMAT: Backwards compatibility (first document only)
                    document_info: {
                        filename: firstDoc.filename,
                        path: firstDoc.path,
                        size: firstDoc.size,
                        client_reference: clientReference,
                        document_type: 'ratenplan_pfaendbares_einkommen',
                        generated_at: new Date().toISOString()
                    },
                    buffer: firstDoc.buffer,
                    // NEW FORMAT: Multi-document support
                    documents: multiDocResult.documents,
                    totalDocuments: multiDocResult.totalDocuments,
                    totalCreditors: multiDocResult.totalCreditors,
                    errors: multiDocResult.errors
                };
            }

            const documentType = 'Nullplan-Ratenplan';
            console.log(`✅ ${documentType} document generated successfully`);
            console.log(`📁 File: ${result.filename} (${Math.round(result.size / 1024)} KB)`);

            return {
                success: true,
                document_info: {
                    filename: result.filename,
                    path: result.path,
                    size: result.size,
                    client_reference: clientReference,
                    document_type: 'ratenplan_nullplan',
                    generated_at: new Date().toISOString()
                },
                buffer: result.buffer
            };

        } catch (error) {
            console.error(`❌ Error generating Ratenplan document: ${error.message}`);
            return {
                success: false,
                error: error.message,
                client_reference: clientReference
            };
        }
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

            // Get creditor data from settlement data - check both creditor_payments and creditors
            const hasCreditorPayments = settlementData.creditor_payments && settlementData.creditor_payments.length > 0;
            const hasCreditors = settlementData.creditors && settlementData.creditors.length > 0;
            
            if (!hasCreditorPayments && !hasCreditors) {
                console.error('❌ No creditor data found in settlementData');
                console.error('   - creditor_payments:', settlementData.creditor_payments);
                console.error('   - creditors:', settlementData.creditors);
                throw new Error('No creditor payment data available for document generation');
            }

            if (hasCreditorPayments) {
                console.log(`📊 Processing ${settlementData.creditor_payments.length} creditors from creditor_payments for document`);
            } else if (hasCreditors) {
                console.log(`📊 Processing ${settlementData.creditors.length} creditors from creditors array (will be converted to creditor_payments format)`);
            }

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
            const formattedAddress = formatAddress(creditor.creditor_address);
            const addressLines = formattedAddress.split('\n');
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
                    creditor_address: creditor.address ? formatAddress(creditor.address) : '',
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
                        creditor_address: creditor.sender_address ? formatAddress(creditor.sender_address) : '',
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

    /**
     * Generate complete Nullplan Word document
     * For clients with no garnishable income (pfändbar amount = 0)
     */
    async generateNullplan(clientData, creditorData) {
        if (!docxModule) {
            throw new Error('Document generation is not available - docx package not installed. Please run: npm install docx');
        }

        try {
            console.log(`📄 Generating Nullplan for ${clientData.name}...`);

            // Generate the document
            const doc = await this.createNullplanDocument(clientData, creditorData);

            // Save the document
            const result = await this.saveDocument(doc, clientData.reference);

            console.log(`✅ Nullplan document generated successfully`);
            console.log(`📁 File: ${result.filename} (${Math.round(result.size / 1024)} KB)`);

            return {
                success: true,
                document_info: {
                    filename: result.filename,
                    path: result.path,
                    size: result.size,
                    client_reference: clientData.reference,
                    document_type: 'nullplan',
                    generated_at: new Date().toISOString()
                },
                buffer: result.buffer
            };

        } catch (error) {
            console.error(`❌ Error generating Nullplan: ${error.message}`);
            return {
                success: false,
                error: error.message,
                client_reference: clientData.reference,
                document_type: 'nullplan'
            };
        }
    }

    /**
     * Create Nullplan document structure
     */
    async createNullplanDocument(clientData, creditorData) {
        // Use the new professional Nullplan template generator
        const NullplanTemplateGenerator = require('./nullplanTemplateGenerator');
        const nullplanGenerator = new NullplanTemplateGenerator();

        console.log('📄 Using professional Nullplan template for document generation...');

        try {
            // Generate using the professional template
            const doc = await nullplanGenerator.generateNullplanDocument(clientData, creditorData);
            return doc;
        } catch (error) {
            console.error('❌ Error with professional Nullplan template, falling back to basic template:', error.message);

            // Fallback to original basic Nullplan generation if needed
            return this.createNullplanDocumentFallback(clientData, creditorData);
        }
    }

    /**
     * Fallback: Basic Nullplan document (old version)
     */
    async createNullplanDocumentFallback(clientData, creditorData) {
        // Format the date for the document
        const currentDate = new Date().toLocaleDateString('de-DE', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric'
        });

        // Calculate deadline (30 days from now)
        const deadline = new Date();
        deadline.setDate(deadline.getDate() + 30);
        const deadlineStr = deadline.toLocaleDateString('de-DE', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric'
        });

        // Calculate total debt amount
        const totalDebt = creditorData.reduce((sum, creditor) => sum + (creditor.debt_amount || 0), 0);

        // Get first creditor for the letter header (this letter is sent to each creditor individually)
        const creditor = creditorData[0] || { creditor_name: 'Gläubiger', creditor_address: '', debt_amount: 0 };
        const creditorIndex = creditorData.indexOf(creditor) + 1;
        const creditorQuote = totalDebt > 0 ? ((creditor.debt_amount / totalDebt) * 100).toFixed(2) : '0.00';

        const doc = new Document({
            ...this.documentOptions,
            title: "Außergerichtlicher Nullplan",
            sections: [{
                properties: {
                    page: {
                        margin: {
                            top: 1440, // 2.54cm
                            right: 1440,
                            bottom: 1440,
                            left: 1440
                        }
                    }
                },
                children: [
                    // Law Firm Header
                    new Paragraph({
                        children: [
                            new TextRun({
                                text: "Rechtsanwaltskanzlei Thomas Scuric",
                                bold: true,
                                size: 24
                            })
                        ],
                        alignment: AlignmentType.CENTER,
                        spacing: { after: 200 }
                    }),

                    // Return Address Line
                    new Paragraph({
                        children: [
                            new TextRun({
                                text: "Rechtsanwaltskanzlei Scuric, Bongardstraße 33, 44787 Bochum",
                                size: 16
                            })
                        ],
                        spacing: { after: 400 }
                    }),

                    // Creditor Address
                    new Paragraph({
                        children: [
                            new TextRun({
                                text: creditor.creditor_name || 'Gläubiger',
                                size: 20
                            })
                        ],
                        spacing: { after: 100 }
                    }),
                    new Paragraph({
                        children: [
                            new TextRun({
                                text: creditor.creditor_address || '',
                                size: 20
                            })
                        ],
                        spacing: { after: 400 }
                    }),

                    // Key Information Section
                    new Paragraph({
                        children: [
                            new TextRun({
                                text: "Zusammenfassung der Schulden:",
                                bold: true,
                                size: 20
                            })
                        ],
                        spacing: { after: 200 }
                    }),

                    new Paragraph({
                        children: [
                            new TextRun({
                                text: `• Gesamtschuldensumme: ${this.formatCurrency(totalDebt)}`,
                                size: 18
                            })
                        ],
                        spacing: { after: 100 }
                    }),

                    new Paragraph({
                        children: [
                            new TextRun({
                                text: `• Anzahl Gläubiger: ${creditorData.length}`,
                                size: 18
                            })
                        ],
                        spacing: { after: 100 }
                    }),

                    new Paragraph({
                        children: [
                            new TextRun({
                                text: `• Pfändbares Einkommen: 0,00 EUR`,
                                size: 18,
                                bold: true
                            })
                        ],
                        spacing: { after: 400 }
                    }),

                    // Plan Details
                    new Paragraph({
                        children: [
                            new TextRun({
                                text: "Nullplan-Regelung:",
                                bold: true,
                                size: 20
                            })
                        ],
                        spacing: { after: 200 }
                    }),

                    new Paragraph({
                        children: [
                            new TextRun({
                                text: "• Die Schuldnerin/Der Schuldner kann aufgrund ihrer/seiner wirtschaftlichen Verhältnisse keine Ratenzahlungen leisten.",
                                size: 18
                            })
                        ],
                        spacing: { after: 100 }
                    }),

                    new Paragraph({
                        children: [
                            new TextRun({
                                text: "• Eine Befriedigung der Gläubiger ist derzeit nicht möglich.",
                                size: 18
                            })
                        ],
                        spacing: { after: 100 }
                    }),

                    new Paragraph({
                        children: [
                            new TextRun({
                                text: "• Bei Verbesserung der wirtschaftlichen Verhältnisse wird unverzüglich eine angemessene Regelung angestrebt.",
                                size: 18
                            })
                        ],
                        spacing: { after: 400 }
                    }),

                    // Creditor List Table
                    new Paragraph({
                        children: [
                            new TextRun({
                                text: "Gläubigerverzeichnis:",
                                bold: true,
                                size: 20
                            })
                        ],
                        spacing: { after: 200 }
                    }),

                    await this.createNullplanCreditorTable(creditorData, totalDebt),

                    // Footer Information
                    new Paragraph({
                        children: [
                            new TextRun({
                                text: `Erstellt am: ${currentDate}`,
                                size: 16,
                                italics: true
                            })
                        ],
                        alignment: AlignmentType.RIGHT,
                        spacing: { before: 400 }
                    }),

                    new Paragraph({
                        children: [
                            new TextRun({
                                text: "Thomas Scuric Rechtsanwälte",
                                size: 16,
                                italics: true
                            })
                        ],
                        alignment: AlignmentType.RIGHT,
                        spacing: { after: 200 }
                    })
                ]
            }]
        });

        return doc;
    }

    /**
     * Generate Ratenplan pfändbares Einkommen using original Word template
     */
    async generateRatenplanDocument(clientData, settlementData, pfaendbarAmount) {
        console.log('🎯 NEW generateRatenplanDocument called - generating documents for ALL creditors:', {
            clientReference: clientData?.reference,
            pfaendbarAmount,
            hasSettlementData: !!settlementData,
            creditorCount: settlementData?.creditor_payments?.length || 0
        });
        
        try {
            // Clear require cache to ensure we get the latest version (Docker deployment fix)
            const templateProcessorPath = require.resolve('./newWordTemplateProcessor');
            delete require.cache[templateProcessorPath];
            console.log('🔄 Cleared require cache for newWordTemplateProcessor');
            
            // Use the NEW Word template processor for "Template Word Pfändbares Einkommen"
            const NewWordTemplateProcessor = require('./newWordTemplateProcessor');
            
            // Get full client data for template processing
            const Client = require('../models/Client');
            let fullClientData;
            
            try {
                fullClientData = await Client.findOne({ aktenzeichen: clientData.reference });
            } catch (dbError) {
                console.error('❌ Database error, using provided client data:', dbError.message);
                fullClientData = clientData;
            }
            
            if (!fullClientData) {
                console.error('❌ Client not found, creating mock data for template');
                fullClientData = {
                    firstName: 'Max',
                    lastName: 'Mustermann',
                    aktenzeichen: clientData.reference,
                    financial_data: {
                        monthly_net_income: pfaendbarAmount + 1500, // Estimate
                        number_of_children: 0,
                        marital_status: 'single'
                    },
                    geburtstag: '01.01.1980'
                };
            }
            
            // Get all creditors from settlement data and deduplicate by name
            // First try to get creditors from creditor_calculation_table (has more complete data)
            let allCreditors = [];
            
            // Use the already loaded fullClientData instead of loading again
            const client = fullClientData;
            
            if (client?.creditor_calculation_table && client.creditor_calculation_table.length > 0) {
                console.log(`📊 Using creditor_calculation_table with ${client.creditor_calculation_table.length} creditors`);
                allCreditors = client.creditor_calculation_table;
            } else if (settlementData?.creditor_payments) {
                console.log(`📊 Fallback to creditor_payments with ${settlementData.creditor_payments.length} creditors`);
                allCreditors = settlementData.creditor_payments;
            } else {
                console.log(`⚠️ No creditor data found in either creditor_calculation_table or creditor_payments`);
                allCreditors = [];
            }
            
            // First, log all creditors to debug the issue
            console.log(`🔍 All creditors before deduplication:`);
            allCreditors.forEach((creditor, idx) => {
                console.log(`   ${idx + 1}. ${creditor.creditor_name || creditor.name} - Ref: ${creditor.reference_number || creditor.creditor_reference || creditor.aktenzeichen || 'NO_REF'} - Amount: ${creditor.final_amount || creditor.debt_amount || creditor.amount}`);
            });
            
            // Deduplicate creditors - use name + reference, but if references are same, use amount as tiebreaker
            const creditorKeys = new Set();
            const creditors = allCreditors.filter((creditor, index) => {
                const name = creditor.creditor_name || creditor.name;
                const reference = creditor.reference_number || creditor.creditor_reference || creditor.aktenzeichen || 'NO_REF';
                const amount = creditor.final_amount || creditor.debt_amount || creditor.amount || 0;
                
                // First try with reference
                let uniqueKey = `${name}__${reference}`;
                
                // If this key already exists and references are the same, use amount as tiebreaker
                if (creditorKeys.has(uniqueKey) && reference !== 'NO_REF') {
                    // Check if it's truly the same entry or different amounts
                    const isDifferentAmount = !Array.from(creditorKeys).some(key => key === `${uniqueKey}__${amount}`);
                    if (isDifferentAmount) {
                        uniqueKey = `${name}__${reference}__${amount}`;
                        console.log(`📋 Same creditor "${name}" with same reference "${reference}" but different amount: €${amount}`);
                    } else {
                        console.log(`⚠️ Skipping duplicate creditor entry: ${name} (${reference}) - Amount: €${amount}`);
                        return false;
                    }
                } else if (reference === 'NO_REF') {
                    // If no reference, use index to ensure uniqueness
                    uniqueKey = `${name}__${index}__${amount}`;
                }
                
                creditorKeys.add(uniqueKey);
                if (amount) creditorKeys.add(`${name}__${reference}__${amount}`); // Track amount combinations
                
                // Log when same creditor has different entries
                const existingWithSameName = Array.from(creditorKeys).filter(key => key.startsWith(name + '__'));
                if (existingWithSameName.length > 1) {
                    console.log(`📋 Note: Creditor "${name}" has ${existingWithSameName.length} separate entries`);
                }
                
                return true;
            });
            
            console.log(`📊 Deduplicated ${allCreditors.length} creditors to ${creditors.length} unique creditors`);
            
            if (creditors.length === 0) {
                console.log('⚠️ No creditors found, generating single general document');
                const templateProcessor = new NewWordTemplateProcessor();
                
                const result = await templateProcessor.processTemplate(
                    fullClientData, 
                    settlementData,
                    null // No specific creditor data
                );
                
                return {
                    success: true,
                    documents: result.success ? [result] : [],
                    totalDocuments: result.success ? 1 : 0,
                    errors: result.success ? [] : [result.error]
                };
            }
            
            console.log(`📄 Generating individual "Pfändbares Einkommen" documents for ${creditors.length} creditors...`);
            
            const generatedDocuments = [];
            const errors = [];
            
            // Generate document for each creditor
            for (let i = 0; i < creditors.length; i++) {
                const creditor = creditors[i];
                console.log(`\n🎯 Processing creditor ${i + 1}/${creditors.length}: ${creditor.creditor_name || creditor.name}`);
                
                try {
                    const templateProcessor = new NewWordTemplateProcessor();
                    
                    // Prepare creditor-specific data with proper field mapping
                    const creditorData = {
                        creditor_name: creditor.name || creditor.creditor_name,
                        name: creditor.name || creditor.creditor_name,
                        debt_amount: creditor.final_amount || creditor.debt_amount || creditor.amount,
                        address: (creditor.address && formatAddress(creditor.address)) ||
                               (creditor.creditor_address && formatAddress(creditor.creditor_address)) ||
                               this.buildCreditorAddress(creditor) ||
                               'Gläubiger Adresse nicht verfügbar',
                        aktenzeichen: creditor.reference_number || creditor.creditor_reference || creditor.aktenzeichen || `${clientData.reference || clientData.aktenzeichen}/TS-JK`,
                        creditor_index: i
                    };
                    
                    console.log('📊 Creditor data:', {
                        name: creditorData.name,
                        amount: creditorData.debt_amount,
                        address: creditorData.address,
                        reference: creditorData.aktenzeichen
                    });
                    
                    console.log('🔍 Full creditor object:', {
                        name: creditor.name,
                        creditor_name: creditor.creditor_name,
                        address: creditor.address,
                        creditor_address: creditor.creditor_address,
                        creditor_street: creditor.creditor_street,
                        creditor_postal_code: creditor.creditor_postal_code,
                        creditor_city: creditor.creditor_city,
                        reference_number: creditor.reference_number,
                        creditor_reference: creditor.creditor_reference,
                        aktenzeichen: creditor.aktenzeichen,
                        final_amount: creditor.final_amount,
                        debt_amount: creditor.debt_amount,
                        amount: creditor.amount,
                        buildResult: this.buildCreditorAddress(creditor)
                    });
                    
                    const result = await templateProcessor.processTemplate(
                        fullClientData, 
                        settlementData,
                        creditorData // Pass specific creditor data
                    );
                    
                    if (result.success) {
                        generatedDocuments.push({
                            ...result,
                            creditor_name: creditorData.name,
                            creditor_index: i + 1
                        });
                        console.log(`✅ Document generated for ${creditorData.name}: ${result.filename}`);
                    } else {
                        const errorMsg = `Failed to generate document for ${creditorData.name}: ${result.error}`;
                        errors.push(errorMsg);
                        console.error(`❌ ${errorMsg}`);
                    }
                    
                } catch (creditorError) {
                    const errorMsg = `Error processing creditor ${creditor.creditor_name || creditor.name}: ${creditorError.message}`;
                    errors.push(errorMsg);
                    console.error(`❌ ${errorMsg}`);
                }
            }
            
            console.log(`\n📊 Summary: Generated ${generatedDocuments.length}/${creditors.length} documents`);
            if (errors.length > 0) {
                console.log(`❌ Errors: ${errors.length}`);
                errors.forEach(error => console.log(`   - ${error}`));
            }
            
            return {
                success: generatedDocuments.length > 0,
                documents: generatedDocuments,
                totalDocuments: generatedDocuments.length,
                totalCreditors: creditors.length,
                errors: errors,
                summary: `Generated ${generatedDocuments.length} individual "Pfändbares Einkommen" documents for creditors`
            };
            
        } catch (error) {
            console.error('❌ Error with NEW template processor, falling back to old method:');
            console.error('   Error message:', error.message);
            console.error('   Error stack:', error.stack);
            console.log('🔄 Using fallback docx generation instead of NEW Word template');
            
            // Fallback: Generate individual documents per creditor using old method
            console.log('🔄 Generating individual fallback documents for each creditor...');
            
            const creditors = settlementData?.creditor_payments || [];
            const fallbackDocuments = [];
            const fallbackErrors = [];
            
            for (let i = 0; i < creditors.length; i++) {
                const creditor = creditors[i];
                console.log(`📄 Fallback generation for creditor ${i + 1}/${creditors.length}: ${creditor.creditor_name || creditor.name}`);
                
                try {
                    const fallbackResult = await this.generateRatenplanDocumentFallback(clientData, settlementData, pfaendbarAmount);
                    
                    if (fallbackResult.success) {
                        // Add creditor-specific info to the result
                        fallbackDocuments.push({
                            ...fallbackResult,
                            creditor_name: creditor.creditor_name || creditor.name,
                            creditor_index: i + 1
                        });
                        console.log(`✅ Fallback document generated for ${creditor.creditor_name || creditor.name}`);
                    } else {
                        const errorMsg = `Fallback failed for ${creditor.creditor_name || creditor.name}: ${fallbackResult.error}`;
                        fallbackErrors.push(errorMsg);
                        console.error(`❌ ${errorMsg}`);
                    }
                } catch (creditorError) {
                    const errorMsg = `Fallback error for ${creditor.creditor_name || creditor.name}: ${creditorError.message}`;
                    fallbackErrors.push(errorMsg);
                    console.error(`❌ ${errorMsg}`);
                }
            }
            
            console.log(`📊 Fallback summary: Generated ${fallbackDocuments.length}/${creditors.length} documents`);
            
            return {
                success: fallbackDocuments.length > 0,
                documents: fallbackDocuments,
                totalDocuments: fallbackDocuments.length,
                totalCreditors: creditors.length,
                errors: fallbackErrors,
                summary: `Generated ${fallbackDocuments.length} documents using fallback method`
            };
        }
    }

    /**
     * Fallback: Generate Ratenplan pfändbares Einkommen document structure using docx
     */
    async generateRatenplanDocumentFallback(clientData, settlementData, pfaendbarAmount) {
        const currentDate = new Date().toLocaleDateString('de-DE', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric'
        });

        const startDate = new Date(2025, 7, 1); // 01.08.2025
        const formattedStartDate = startDate.toLocaleDateString('de-DE');

        const tilgungsquote = settlementData.average_quota_percentage || 32.57;

        // Calculate individual creditor payment based on the HTML template data
        const creditorDebt = 1677.64; // From template
        const totalMonthlyPayment = pfaendbarAmount;
        const totalDebt = settlementData.total_debt || 97357.73;
        const creditorTotalPayment = (creditorDebt / totalDebt) * (totalMonthlyPayment * 36);
        const grossIncome = pfaendbarAmount * 4.04; // Reverse calculate from pfändbar amount

        const doc = new Document({
            ...this.documentOptions,
            title: "Ratenplan pfändbares Einkommen",
            sections: [{
                properties: {},
                children: [
                    // Letterhead - Large Spaced Title
                    new Paragraph({
                        children: [
                            new TextRun({
                                text: "Rechtsanwaltskanzlei Thomas Scuric",
                                size: 36, // 18pt
                                spacing: 6 // Letter spacing
                            })
                        ],
                        alignment: AlignmentType.LEFT,
                        spacing: { after: 600 } // 3cm
                    }),

                    // Right Column Contact Info
                    new Paragraph({
                        children: [
                            new TextRun({
                                text: `Bochum, ${currentDate}`,
                                size: 18 // 9pt
                            })
                        ],
                        alignment: AlignmentType.RIGHT,
                        spacing: { after: 100 }
                    }),

                    new Paragraph({
                        children: [
                            new TextRun({
                                text: "Thomas Scuric",
                                size: 18
                            })
                        ],
                        alignment: AlignmentType.RIGHT,
                        spacing: { after: 100 }
                    }),

                    new Paragraph({
                        children: [
                            new TextRun({
                                text: "Rechtsanwalt",
                                size: 18
                            })
                        ],
                        alignment: AlignmentType.RIGHT,
                        spacing: { after: 100 }
                    }),

                    new Paragraph({
                        children: [
                            new TextRun({
                                text: "Bongardstraße 33",
                                size: 18
                            })
                        ],
                        alignment: AlignmentType.RIGHT,
                        spacing: { after: 100 }
                    }),

                    new Paragraph({
                        children: [
                            new TextRun({
                                text: "44787 Bochum",
                                size: 18
                            })
                        ],
                        alignment: AlignmentType.RIGHT,
                        spacing: { after: 100 }
                    }),

                    new Paragraph({
                        children: [
                            new TextRun({
                                text: "Telefon: 0234 913681-0",
                                size: 18
                            })
                        ],
                        alignment: AlignmentType.RIGHT,
                        spacing: { after: 100 }
                    }),

                    new Paragraph({
                        children: [
                            new TextRun({
                                text: "Telefax: 0234 913681-29",
                                size: 18
                            })
                        ],
                        alignment: AlignmentType.RIGHT,
                        spacing: { after: 100 }
                    }),

                    new Paragraph({
                        children: [
                            new TextRun({
                                text: "e-Mail: info@ra-scuric.de",
                                size: 18
                            })
                        ],
                        alignment: AlignmentType.RIGHT,
                        spacing: { after: 100 }
                    }),

                    new Paragraph({
                        children: [
                            new TextRun({
                                text: "Öffnungszeiten:",
                                size: 18
                            })
                        ],
                        alignment: AlignmentType.RIGHT,
                        spacing: { after: 50 }
                    }),

                    new Paragraph({
                        children: [
                            new TextRun({
                                text: "Mo. - Fr.: 09.00 - 13.00 Uhr",
                                size: 18
                            })
                        ],
                        alignment: AlignmentType.RIGHT,
                        spacing: { after: 50 }
                    }),

                    new Paragraph({
                        children: [
                            new TextRun({
                                text: "              14.00 - 18.00 Uhr",
                                size: 18
                            })
                        ],
                        alignment: AlignmentType.RIGHT,
                        spacing: { after: 100 }
                    }),

                    new Paragraph({
                        children: [
                            new TextRun({
                                text: "Bankverbindungen:",
                                bold: true,
                                size: 18
                            })
                        ],
                        alignment: AlignmentType.RIGHT,
                        spacing: { after: 50 }
                    }),

                    new Paragraph({
                        children: [
                            new TextRun({
                                text: "Deutsche Bank",
                                size: 18
                            })
                        ],
                        alignment: AlignmentType.RIGHT,
                        spacing: { after: 50 }
                    }),

                    new Paragraph({
                        children: [
                            new TextRun({
                                text: "Konto-Nr.: 172 209 900",
                                size: 18
                            })
                        ],
                        alignment: AlignmentType.RIGHT,
                        spacing: { after: 50 }
                    }),

                    new Paragraph({
                        children: [
                            new TextRun({
                                text: "BLZ: 430 700 24",
                                size: 18
                            })
                        ],
                        alignment: AlignmentType.RIGHT,
                        spacing: { after: 100 }
                    }),

                    new Paragraph({
                        children: [
                            new TextRun({
                                text: "Aktenzeichen:",
                                bold: true,
                                size: 18
                            })
                        ],
                        alignment: AlignmentType.RIGHT,
                        spacing: { after: 50 }
                    }),

                    new Paragraph({
                        children: [
                            new TextRun({
                                text: `${clientData.reference}/TS-JK`,
                                bold: true,
                                size: 18
                            })
                        ],
                        alignment: AlignmentType.RIGHT,
                        spacing: { after: 50 }
                    }),

                    new Paragraph({
                        children: [
                            new TextRun({
                                text: "(Bei Schriftverkehr und Zahlungen",
                                size: 18
                            })
                        ],
                        alignment: AlignmentType.RIGHT,
                        spacing: { after: 50 }
                    }),

                    new Paragraph({
                        children: [
                            new TextRun({
                                text: "unbedingt angeben)",
                                size: 18
                            })
                        ],
                        alignment: AlignmentType.RIGHT,
                        spacing: { after: 400 }
                    }),

                    // Sender Info (underlined small text)
                    new Paragraph({
                        children: [
                            new TextRun({
                                text: "Rechtsanwaltskanzlei Scuric, Bongardstraße 33, 44787 Bochum",
                                size: 16, // 8pt
                                underline: {}
                            })
                        ],
                        alignment: AlignmentType.LEFT,
                        spacing: { after: 400 }
                    }),

                    // Recipient Address
                    new Paragraph({
                        children: [
                            new TextRun({
                                text: "Finanzamt Bochum-Süd",
                                size: 18
                            })
                        ],
                        spacing: { after: 100 }
                    }),

                    new Paragraph({
                        children: [
                            new TextRun({
                                text: "Königsallee 21",
                                size: 18
                            })
                        ],
                        spacing: { after: 100 }
                    }),

                    new Paragraph({
                        children: [
                            new TextRun({
                                text: "44789 Bochum",
                                size: 18
                            })
                        ],
                        spacing: { after: 400 }
                    }),

                    // Subject Line
                    new Paragraph({
                        children: [
                            new TextRun({
                                text: `Ihre Forderung gegen ${clientData.name}`,
                                bold: true,
                                size: 18
                            })
                        ],
                        spacing: { after: 100 }
                    }),

                    new Paragraph({
                        children: [
                            new TextRun({
                                text: `${clientData.reference}`,
                                size: 18
                            })
                        ],
                        spacing: { after: 100 }
                    }),

                    new Paragraph({
                        children: [
                            new TextRun({
                                text: "Außergerichtlicher Einigungsversuch im Rahmen der Insolvenzordnung (InsO)",
                                size: 18
                            })
                        ],
                        spacing: { after: 400 }
                    }),

                    // Greeting
                    new Paragraph({
                        children: [
                            new TextRun({
                                text: "Sehr geehrte Damen und Herren,",
                                size: 18
                            })
                        ],
                        spacing: { after: 300 }
                    }),

                    // Main Content
                    new Paragraph({
                        children: [
                            new TextRun({
                                text: "mittlerweile liegen uns alle relevanten Daten vor, sodass wir Ihnen nun einen außergerichtlichen Einigungsvorschlag unterbreiten können:",
                                size: 18
                            })
                        ],
                        spacing: { after: 200 }
                    }),

                    new Paragraph({
                        children: [
                            new TextRun({
                                text: `Herr ${clientData.name} ist bei 12 Gläubigern mit insgesamt ${this.formatCurrency(settlementData.total_debt || 0)} € verschuldet.`,
                                size: 18
                            })
                        ],
                        spacing: { after: 200 }
                    }),

                    new Paragraph({
                        children: [
                            new TextRun({
                                text: "Die familiäre und wirtschaftliche Situation stellt sich wie folgt dar:",
                                size: 18,
                                italics: true
                            })
                        ],
                        spacing: { after: 200 }
                    }),

                    new Paragraph({
                        children: [
                            new TextRun({
                                text: `Er ist am 24.11.1985 geboren und verheiratet. Herr ${clientData.name} verfügt über Einkommen aus `,
                                size: 22
                            }),
                            new TextRun({
                                text: "Erwerbstätigkeit",
                                size: 22,
                                italics: true
                            }),
                            new TextRun({
                                text: ` in Höhe von ${this.formatCurrency(grossIncome)}.`,
                                size: 22
                            })
                        ],
                        spacing: { after: 200 }
                    }),

                    new Paragraph({
                        children: [
                            new TextRun({
                                text: `Somit ergibt sich ein pfändbarer Betrag nach der Tabelle zu § 850c ZPO von `,
                                size: 22
                            }),
                            new TextRun({
                                text: `${this.formatCurrency(pfaendbarAmount)}`,
                                size: 22,
                                italics: true
                            }),
                            new TextRun({
                                text: ` monatlich.`,
                                size: 22
                            })
                        ],
                        spacing: { after: 300 }
                    }),

                    new Paragraph({
                        children: [
                            new TextRun({
                                text: `Analog zur Wohlverhaltensperiode im gerichtlichen Verfahren sieht unser außergerichtlicher Einigungsvorschlag eine Laufzeit von 3 Jahren vor. Während der Laufzeit zahlt Herr ${clientData.name} monatlich den pfändbaren Betrag in Höhe von `,
                                size: 22
                            }),
                            new TextRun({
                                text: `${this.formatCurrency(pfaendbarAmount)}`,
                                bold: true,
                                size: 22
                            }),
                            new TextRun({
                                text: `. Diese Beträge werden nach der sich für jeden Gläubiger errechnenden Quote auf alle beteiligten Gläubiger verteilt.`,
                                size: 22
                            })
                        ],
                        spacing: { after: 300 }
                    }),

                    new Paragraph({
                        children: [
                            new TextRun({
                                text: `Auf Ihre Forderung in Höhe von `,
                                size: 22
                            }),
                            new TextRun({
                                text: `${this.formatCurrency(creditorDebt)}`,
                                bold: true,
                                size: 22
                            }),
                            new TextRun({
                                text: ` errechnet sich ein Gesamttilgungsangebot von `,
                                size: 22
                            }),
                            new TextRun({
                                text: `${this.formatCurrency(creditorTotalPayment)}.`,
                                bold: true,
                                size: 22
                            }),
                            new TextRun({
                                text: ` Dies entspricht einer Tilgungsquote von `,
                                size: 22
                            }),
                            new TextRun({
                                text: `${this.formatPercentage(tilgungsquote)}`,
                                bold: true,
                                size: 22
                            }),
                            new TextRun({
                                text: `. Nähere Einzelheiten entnehmen Sie bitte dem beigefügten Zahlungsplan. Ihre Forderung ist die laufende Nummer 12.`,
                                size: 22
                            })
                        ],
                        spacing: { after: 300 }
                    }),

                    new Paragraph({
                        children: [
                            new TextRun({
                                text: `Der Zahlungsplan beginnt am ${formattedStartDate}, vorausgesetzt, dass bis dahin eine Einigung zustande kommt. Die Raten sind jeweils zum 03. des Monats fällig.`,
                                size: 18
                            })
                        ],
                        spacing: { after: 300 }
                    }),

                    new Paragraph({
                        children: [
                            new TextRun({
                                text: `Nach Zahlung der letzten Rate erhält Herr ${clientData.name} den entwerteren Vollstreckungstitel zurück und eine Erledigungsmeldung bei der Schufa.`,
                                size: 18
                            })
                        ],
                        spacing: { after: 300 }
                    }),

                    new Paragraph({
                        children: [
                            new TextRun({
                                text: "Bei bereits laufenden Lohnpfändungen:",
                                size: 18,
                                italics: true
                            })
                        ],
                        spacing: { after: 100 }
                    }),

                    new Paragraph({
                        children: [
                            new TextRun({
                                text: "Bitte um die Zusage, dass eine laufende Lohnpfändung zurückgenommen wird.",
                                size: 18
                            })
                        ],
                        spacing: { after: 400 }
                    }),

                    // Page break and additional sections
                    new Paragraph({
                        children: [
                            new TextRun({
                                text: "Für Ihre Entscheidung geben wir zu bedenken, dass im gerichtlichen Verfahren dieselben Beträge zur Verteilung kommen, die von uns jetzt angeboten werden. Allerdings werden dann hiervon die Gerichtskosten und die Kosten des Treuhänders in Abzug gebracht. Im gerichtlichen Verfahren sind Sie somit aller Voraussicht nach schlechter gestellt.",
                                size: 18
                            })
                        ],
                        spacing: { after: 300 }
                    }),

                    new Paragraph({
                        children: [
                            new TextRun({
                                text: "Wir bitten daher, im Interesse aller Beteiligten um Ihre Zustimmung bis zum",
                                size: 18
                            })
                        ],
                        spacing: { after: 200 }
                    }),

                    new Paragraph({
                        children: [
                            new TextRun({
                                text: "16.05.2025",
                                bold: true,
                                size: 20
                            })
                        ],
                        alignment: AlignmentType.CENTER,
                        spacing: { after: 200 }
                    }),

                    new Paragraph({
                        children: [
                            new TextRun({
                                text: "zu unserem Vergleichsvorschlag.",
                                size: 18
                            })
                        ],
                        spacing: { after: 300 }
                    }),

                    new Paragraph({
                        children: [
                            new TextRun({
                                text: `Für den Fall, dass nicht alle Gläubiger zustimmen, wird Herr ${clientData.name} voraussichtlich bei Gericht Antrag auf Eröffnung des Insolvenzverfahrens mit anschließender Restschuldbefreiung stellen.`,
                                size: 18
                            })
                        ],
                        spacing: { after: 400 }
                    }),

                    // Closing
                    new Paragraph({
                        children: [
                            new TextRun({
                                text: "Mit freundlichen Grüßen",
                                size: 18
                            })
                        ],
                        spacing: { after: 600 }
                    }),

                    // Signature
                    new Paragraph({
                        children: [
                            new TextRun({
                                text: "Rechtsanwalt",
                                size: 18
                            })
                        ],
                        spacing: { after: 800 }
                    }),

                    // Additional page content
                    new Paragraph({
                        children: [
                            new TextRun({
                                text: "Zusatzvereinbarungen zum Schuldenbereinigungsplan vom 01.08.2025",
                                bold: true,
                                size: 20
                            })
                        ],
                        alignment: AlignmentType.CENTER,
                        spacing: { after: 400 }
                    }),

                    new Paragraph({
                        children: [
                            new TextRun({
                                text: "Verzicht auf Zwangsvollstreckungsmaßnahmen",
                                bold: true,
                                size: 18
                            })
                        ],
                        spacing: { after: 200 }
                    }),

                    new Paragraph({
                        children: [
                            new TextRun({
                                text: "Mit wirksamen Abschluss des Vergleichs ruhen sämtliche Zwangsvollstreckungsmaßnahmen und Sicherungsverwendungen, soweit sie sich auf das Vermögen der Vertragschließenden des Schuldners beziehen. Eingeleitet werden dürfen diese durch die Gläubiger während der Laufzeit der Vereinbarung vorher nicht. Von der Einhaltung ist der Schuldner auf weitere Zwangsvollstreckungsmaßnahmen über die Erfüllung befreit bis zum Anlaufen.",
                                size: 16
                            })
                        ],
                        spacing: { after: 300 }
                    }),

                    new Paragraph({
                        children: [
                            new TextRun({
                                text: "Einsatz eines außergerichtlichen Treuhänders",
                                bold: true,
                                size: 18
                            })
                        ],
                        spacing: { after: 200 }
                    }),

                    new Paragraph({
                        children: [
                            new TextRun({
                                text: "Es wird ein außergerichtlicher Treuhänder eingesetzt, der die pfändbaren Beträge einzieht und nach der Quote an die Gläubiger verteilt.",
                                size: 16
                            })
                        ],
                        spacing: { after: 300 }
                    }),

                    // Terms and conditions continue...
                    new Paragraph({
                        children: [
                            new TextRun({
                                text: "Anpassungsklauseln",
                                bold: true,
                                size: 18
                            })
                        ],
                        spacing: { after: 200 }
                    }),

                    new Paragraph({
                        children: [
                            new TextRun({
                                text: "1. Bei Änderung der Pfändungstabelle zu § 850 c ZPO ändert sich der Zahlungsbetrag dem entsprechend.\n\n2. Bei Änderung der Einkommensverhältnisse wird eine erneute Einkommensaufstellung erfolgen. Bei Arbeitslosigkeit oder anderer nicht vom Schuldner zu vertretender Gründe wird der Zahlungsbetrag analog der Pfändungstabelle zu § 850 c ZPO entsprechend angepasst.\n\n3. Bei einer wesentlichen Verbesserung der Einkommenssituation ist mit einer dauerhaft mindestens 10% oder bei einem Wegfall von Unterhaltspflichten erfolgt eine Anhebung der Rate entsprechend dem pfändbaren Betrag zu § 850 c ZPO.",
                                size: 16
                            })
                        ],
                        spacing: { after: 300 }
                    }),

                    new Paragraph({
                        children: [
                            new TextRun({
                                text: "Obliegenheiten",
                                bold: true,
                                size: 18
                            })
                        ],
                        spacing: { after: 200 }
                    }),

                    new Paragraph({
                        children: [
                            new TextRun({
                                text: "1. Der Schuldner verpflichtet sich, dem Gläubiger auf Anforderung Nachweise über seine Einkommenssituation zu gewähren.\n\n2. Im Falle der Arbeitslosigkeit verpflichtet sich der Schuldner zu intensiven eigenen Bemühungen um eine angemessene berufliche und wirtschaftliche Tätigkeit abzulehnen. Auf Anforderung des Gläubigers legt der Schuldner entsprechende Nachweise vor.\n\n3. Erhält der Schuldner während der Laufzeit der Ratenzahlungen eine Erbschaft, verpflichtet er sich, diese zur Hälfte an die Gläubiger entsprechend ihrer jeweiligen Quoten herauszugeben.",
                                size: 16
                            })
                        ],
                        spacing: { after: 300 }
                    }),

                    new Paragraph({
                        children: [
                            new TextRun({
                                text: "Kündigung",
                                bold: true,
                                size: 18
                            })
                        ],
                        spacing: { after: 200 }
                    }),

                    new Paragraph({
                        children: [
                            new TextRun({
                                text: "Gerät der Schuldner mit zwei ganzen aufeinander folgenden Monatsraten in Rückstand, ohne dass vor den Gläubigern eine Stundungsvereinbarung getroffen worden ist, so kann von Gläubigerseite der abgeschlossene Vergleich schriftlich gekündigt werden.\n\nVor einer Kündigung wird der Gläubiger dem Schuldner schriftlich eine zweiwöchige Frist zur Zahlung des rückständigen Betrages einräumen. Diese Aufforderung ist mit der Erklärung zu verstehen, dass bei Nichtzahlung der Vergleich gekündigt wird.",
                                size: 16
                            })
                        ],
                        spacing: { after: 400 }
                    })
                ]
            }]
        });

        return doc;
    }

    /**
     * Save Ratenplan document(s) with specific naming - handles multiple creditor documents
     */
    async saveRatenplanDocument(doc, clientReference) {
        // Check if doc is the new multi-document result format
        if (doc && doc.documents && Array.isArray(doc.documents)) {
            console.log(`📊 Processing ${doc.totalDocuments} Ratenplan documents for multiple creditors`);
            
            // For backward compatibility, return the first document with additional info
            if (doc.documents.length > 0) {
                const fs = require('fs');
                const firstDoc = doc.documents[0];
                const buffer = fs.readFileSync(firstDoc.path);
                
                return {
                    ...firstDoc,
                    buffer,
                    // Additional info about all documents
                    total_documents: doc.totalDocuments,
                    total_creditors: doc.totalCreditors,
                    all_documents: doc.documents.map(d => ({
                        filename: d.filename,
                        creditor_name: d.creditor_name,
                        creditor_index: d.creditor_index,
                        size: d.size
                    })),
                    summary: doc.summary
                };
            } else {
                throw new Error('No documents were generated');
            }
        }
        
        // Check if doc is a single processed template result (not a docx Document object)
        if (doc && doc.success && doc.path) {
            // This is already a processed template result, return it with buffer
            const fs = require('fs');
            const buffer = fs.readFileSync(doc.path);
            return {
                ...doc,
                buffer
            };
        }

        // Otherwise, treat as docx Document object and save normally
        const filename = `Ratenplan-Pfaendbares-Einkommen_${clientReference}_${new Date().toISOString().split('T')[0]}.docx`;
        return await this.saveDocument(doc, clientReference, filename);
    }

    /**
     * Generate Nullplan-specific Ratenplan document (no monthly payments)
     */
    async generateNullplanRatenplanDocument(clientData, settlementData) {
        try {
            // Use the Word template processor for Quotenplan-Nullplan (Nullplan with creditor quota table)
            const WordTemplateProcessor = require('./wordTemplateProcessor');
            const templateProcessor = new WordTemplateProcessor();
            
            console.log('📄 Using Quotenplan-Nullplan Word template for Nullplan generation...');
            
            const result = await templateProcessor.processQuotenplanNullplanTemplate(
                clientData.reference, 
                settlementData
            );
            
            if (!result.success) {
                throw new Error(`Quotenplan-Nullplan template processing failed: ${result.error}`);
            }
            
            // Return the processed template result in the expected format
            return result;
            
        } catch (error) {
            console.error('❌ Error with Quotenplan-Nullplan template processor, falling back to docx generation:');
            console.error('   Error message:', error.message);
            console.error('   Error stack:', error.stack);
            console.log('🔄 Using fallback docx generation instead of Quotenplan-Nullplan template');
            
            // Fallback to original docx generation
            return this.generateNullplanRatenplanDocumentFallback(clientData, settlementData);
        }
    }
    
    /**
     * Fallback: Generate Nullplan-specific Ratenplan document (no monthly payments)
     */
    async generateNullplanRatenplanDocumentFallback(clientData, settlementData) {
        const currentDate = new Date().toLocaleDateString('de-DE', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric'
        });

        const doc = new Document({
            ...this.documentOptions,
            title: "Nullplan-Ratenplan",
            sections: [{
                properties: {
                    page: {
                        margin: {
                            top: 1440,
                            right: 1440,
                            bottom: 1440,
                            left: 1440
                        }
                    }
                },
                children: [
                    // Header
                    new Paragraph({
                        children: [
                            new TextRun({
                                text: "Ratenplan für Nullplan",
                                bold: true,
                                size: 28
                            })
                        ],
                        alignment: AlignmentType.CENTER,
                        spacing: { after: 400 }
                    }),

                    // Client info
                    new Paragraph({
                        children: [
                            new TextRun({
                                text: `Mandant: ${clientData.name}`,
                                bold: true,
                                size: 22
                            })
                        ],
                        spacing: { after: 200 }
                    }),

                    new Paragraph({
                        children: [
                            new TextRun({
                                text: `Aktenzeichen: ${clientData.reference}`,
                                size: 20
                            })
                        ],
                        spacing: { after: 200 }
                    }),

                    new Paragraph({
                        children: [
                            new TextRun({
                                text: `Datum: ${currentDate}`,
                                size: 20
                            })
                        ],
                        spacing: { after: 400 }
                    }),

                    // Nullplan explanation
                    new Paragraph({
                        children: [
                            new TextRun({
                                text: "Zahlungsplan",
                                bold: true,
                                size: 24
                            })
                        ],
                        spacing: { after: 200 }
                    }),

                    new Paragraph({
                        children: [
                            new TextRun({
                                text: "Pfändbares Einkommen: 0,00 EUR",
                                bold: true,
                                size: 22
                            })
                        ],
                        spacing: { after: 200 }
                    }),

                    new Paragraph({
                        children: [
                            new TextRun({
                                text: "Monatliche Zahlung: 0,00 EUR",
                                bold: true,
                                size: 22
                            })
                        ],
                        spacing: { after: 400 }
                    }),

                    // Explanation text
                    new Paragraph({
                        children: [
                            new TextRun({
                                text: "Erläuterung:",
                                bold: true,
                                size: 22
                            })
                        ],
                        spacing: { after: 200 }
                    }),

                    new Paragraph({
                        children: [
                            new TextRun({
                                text: "Aufgrund der derzeitigen wirtschaftlichen Verhältnisse der Schuldnerin/des Schuldners ist kein pfändbares Einkommen vorhanden. Eine regelmäßige Ratenzahlung ist daher nicht möglich.",
                                size: 20
                            })
                        ],
                        spacing: { after: 200 }
                    }),

                    new Paragraph({
                        children: [
                            new TextRun({
                                text: "Die Schuldnerin/Der Schuldner verpflichtet sich, bei Verbesserung der wirtschaftlichen Verhältnisse unverzüglich eine angemessene Regelung mit den Gläubigern anzustreben.",
                                size: 20
                            })
                        ],
                        spacing: { after: 400 }
                    }),

                    // Footer
                    new Paragraph({
                        children: [
                            new TextRun({
                                text: "Thomas Scuric Rechtsanwälte",
                                size: 18,
                                italics: true
                            })
                        ],
                        alignment: AlignmentType.RIGHT,
                        spacing: { before: 600 }
                    })
                ]
            }]
        });

        return doc;
    }

    /**
     * Save Nullplan-Ratenplan document with correct filename
     */
    async saveNullplanRatenplanDocument(doc, clientReference) {
        // Check if doc is a processed template result (not a docx Document object)
        if (doc && doc.success && doc.path) {
            // This is already a processed template result, return it with buffer
            const fs = require('fs');
            const buffer = fs.readFileSync(doc.path);
            return {
                ...doc,
                buffer
            };
        }
        
        // Otherwise, treat as docx Document object and save normally (fallback)
        const filename = `Quotenplan-Nullplan_${clientReference}_${new Date().toISOString().split('T')[0]}.docx`;
        return await this.saveDocument(doc, clientReference, filename);
    }

    /**
     * Create creditor table for Nullplan document
     */
    async createNullplanCreditorTable(creditorData, totalDebt) {
        const tableRows = [
            // Header Row
            new TableRow({
                children: [
                    new TableCell({
                        children: [new Paragraph({ 
                            children: [new TextRun({ text: "Nr.", bold: true, size: 18 })],
                            alignment: AlignmentType.CENTER
                        })],
                        width: { size: 8, type: WidthType.PERCENTAGE },
                        shading: { fill: "D9D9FF" },
                        borders: this.createTableBorders()
                    }),
                    new TableCell({
                        children: [new Paragraph({ 
                            children: [new TextRun({ text: "Gläubiger", bold: true, size: 18 })],
                            alignment: AlignmentType.CENTER
                        })],
                        width: { size: 35, type: WidthType.PERCENTAGE },
                        shading: { fill: "D9D9FF" },
                        borders: this.createTableBorders()
                    }),
                    new TableCell({
                        children: [new Paragraph({ 
                            children: [new TextRun({ text: "Aktenzeichen", bold: true, size: 18 })],
                            alignment: AlignmentType.CENTER
                        })],
                        width: { size: 20, type: WidthType.PERCENTAGE },
                        shading: { fill: "D9D9FF" },
                        borders: this.createTableBorders()
                    }),
                    new TableCell({
                        children: [new Paragraph({ 
                            children: [new TextRun({ text: "Forderungshöhe", bold: true, size: 18 })],
                            alignment: AlignmentType.CENTER
                        })],
                        width: { size: 15, type: WidthType.PERCENTAGE },
                        shading: { fill: "D9D9FF" },
                        borders: this.createTableBorders()
                    }),
                    new TableCell({
                        children: [new Paragraph({ 
                            children: [new TextRun({ text: "Anteil", bold: true, size: 18 })],
                            alignment: AlignmentType.CENTER
                        })],
                        width: { size: 12, type: WidthType.PERCENTAGE },
                        shading: { fill: "D9D9FF" },
                        borders: this.createTableBorders()
                    }),
                    new TableCell({
                        children: [new Paragraph({ 
                            children: [new TextRun({ text: "Zahlung", bold: true, size: 18 })],
                            alignment: AlignmentType.CENTER
                        })],
                        width: { size: 10, type: WidthType.PERCENTAGE },
                        shading: { fill: "D9D9FF" },
                        borders: this.createTableBorders()
                    })
                ]
            })
        ];

        // Data Rows
        creditorData.forEach((creditor, index) => {
            const debtPercentage = totalDebt > 0 ? (creditor.debt_amount / totalDebt) * 100 : 0;
            
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
                                children: [new TextRun({ text: creditor.creditor_name || 'N/A', size: 16 })],
                                alignment: AlignmentType.LEFT
                            })],
                            borders: this.createTableBorders()
                        }),
                        new TableCell({
                            children: [new Paragraph({ 
                                children: [new TextRun({ text: creditor.creditor_reference || 'N/A', size: 16 })],
                                alignment: AlignmentType.CENTER
                            })],
                            borders: this.createTableBorders()
                        }),
                        new TableCell({
                            children: [new Paragraph({ 
                                children: [new TextRun({ text: this.formatCurrency(creditor.debt_amount || 0), size: 16 })],
                                alignment: AlignmentType.RIGHT
                            })],
                            borders: this.createTableBorders()
                        }),
                        new TableCell({
                            children: [new Paragraph({ 
                                children: [new TextRun({ text: this.formatPercentage(debtPercentage), size: 16 })],
                                alignment: AlignmentType.RIGHT
                            })],
                            borders: this.createTableBorders()
                        }),
                        new TableCell({
                            children: [new Paragraph({ 
                                children: [new TextRun({ text: "0,00 EUR", size: 16, bold: true })],
                                alignment: AlignmentType.RIGHT
                            })],
                            borders: this.createTableBorders()
                        })
                    ]
                })
            );
        });

        // Totals Row
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
                            children: [new TextRun({ text: "", size: 16 })],
                            alignment: AlignmentType.CENTER
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
                            children: [new TextRun({ text: "100,00%", bold: true, size: 16 })],
                            alignment: AlignmentType.RIGHT
                        })],
                        borders: this.createTableBorders(),
                        shading: { fill: "E8E8E8" }
                    }),
                    new TableCell({
                        children: [new Paragraph({ 
                            children: [new TextRun({ text: "0,00 EUR", bold: true, size: 16 })],
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
     * Generate Nullplan documents (both Nullplan and Forderungsübersicht)
     * Public method that handles the complete Nullplan generation process
     */
    async generateNullplanDocuments(clientReference) {
        try {
            console.log(`📄 Starting Nullplan document generation for client ${clientReference}...`);
            
            const Client = require('../models/Client');
            const client = await Client.findOne({ aktenzeichen: clientReference });

            if (!client) {
                throw new Error(`Client not found with reference: ${clientReference}`);
            }

            if (!client.financial_data || client.financial_data.recommended_plan_type !== 'nullplan') {
                throw new Error(`Client ${clientReference} is not eligible for Nullplan (recommended_plan_type: ${client.financial_data?.recommended_plan_type})`);
            }

            // Prepare complete client data for robust processors
            const clientData = {
                firstName: client.firstName,
                lastName: client.lastName,
                fullName: `${client.firstName} ${client.lastName}`,
                name: `${client.firstName} ${client.lastName}`,
                email: client.email,
                reference: client.aktenzeichen,
                aktenzeichen: client.aktenzeichen,
                financial_data: client.financial_data,
                birthDate: client.geburtstag,
                geburtstag: client.geburtstag,
                maritalStatus: client.financial_data?.marital_status
            };

            // Get creditor data
            let creditorData = [];
            
            if (client.creditor_calculation_table && client.creditor_calculation_table.length > 0) {
                // Use creditor calculation table if available
                creditorData = client.creditor_calculation_table.map(creditor => ({
                    creditor_name: creditor.name,
                    creditor_address: creditor.address ? formatAddress(creditor.address) : '',
                    creditor_email: creditor.email,
                    creditor_reference: creditor.reference_number,
                    debt_amount: creditor.final_amount,
                    debt_reason: '',
                    remarks: creditor.contact_status === 'responded' ? 'Antwort erhalten' : 
                             creditor.contact_status === 'no_response' ? 'Keine Antwort' : 
                             'E-Mail fehlgeschlagen',
                    is_representative: creditor.is_representative,
                    representative_info: creditor.is_representative ? {
                        name: creditor.actual_creditor,
                        address: '',
                        email: ''
                    } : null
                }));
            } else if (client.final_creditor_list && client.final_creditor_list.length > 0) {
                // Fallback to final_creditor_list
                creditorData = client.final_creditor_list
                    .filter(creditor => creditor.status === 'confirmed')
                    .map(creditor => ({
                        creditor_name: creditor.sender_name,
                        creditor_address: creditor.sender_address ? formatAddress(creditor.sender_address) : '',
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
                        } : null
                    }));
            }

            if (creditorData.length === 0) {
                throw new Error('No creditor data available for Nullplan generation');
            }

            console.log(`📊 Processing ${creditorData.length} creditors for Nullplan`);

            // Generate individual Nullplan letters for each creditor using ROBUST processor
            console.log('📄 Generating individual Nullplan letters for each creditor...');
            const RobustNullplanProcessor = require('./robustNullplanProcessor');
            const letterGenerator = new RobustNullplanProcessor();
            const nullplanLettersResult = await letterGenerator.generateNullplanLettersForAllCreditors(clientData, creditorData);
            
            // Generate Forderungsübersicht
            const forderungsuebersichtResult = await this.generateForderungsuebersichtDocument(clientReference);

            // Generate Nullplan Quota Table (replaces Schuldenbereinigungsplan for Nullplan) using ROBUST generator
            console.log('📊 Generating Nullplan quota table instead of standard Schuldenbereinigungsplan...');
            const RobustNullplanTableGenerator = require('./robustNullplanTableGenerator');
            const tableGenerator = new RobustNullplanTableGenerator();
            const nullplanTableResult = await tableGenerator.generateNullplanTable(clientData, creditorData);

            return {
                success: true,
                nullplan_letters: nullplanLettersResult,
                forderungsuebersicht: forderungsuebersichtResult,
                schuldenbereinigungsplan: nullplanTableResult,
                client_reference: clientReference,
                generated_at: new Date().toISOString()
            };

        } catch (error) {
            console.error(`❌ Error generating Nullplan documents: ${error.message}`);
            return {
                success: false,
                error: error.message,
                client_reference: clientReference
            };
        }
    }

    /**
     * Build creditor address from individual components
     */
    buildCreditorAddress(creditor) {
        const street = creditor.creditor_street || '';
        const postalCode = creditor.creditor_postal_code || '';
        const city = creditor.creditor_city || '';
        
        // Only build address if we have meaningful data
        if (!street && !postalCode && !city) {
            return null; // Return null so fallback can be used
        }
        
        const parts = [];
        if (street) parts.push(street);
        if (postalCode || city) {
            const locationPart = `${postalCode} ${city}`.trim();
            if (locationPart) parts.push(locationPart);
        }
        
        // Join with newline to put PLZ and city on separate line
        return parts.length > 0 ? parts.join('\n') : null;
    }
}

module.exports = DocumentGenerator;