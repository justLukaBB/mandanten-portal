const express = require('express');
const router = express.Router();
const { PDFDocument } = require('pdf-lib');
const fs = require('fs').promises;
const path = require('path');
const axios = require('axios');
const { authenticateClient, authenticateAdmin } = require('../middleware/auth');
const Client = require('../models/Client');

// Helper function to get client (handles both id and aktenzeichen lookups)
async function getClient(clientId) {
  try {
    // Try to find by id first, then by aktenzeichen
    let client = await Client.findOne({ id: clientId });
    if (!client) {
      client = await Client.findOne({ aktenzeichen: clientId });
    }
    return client;
  } catch (error) {
    console.error('Error getting client from MongoDB:', error);
    throw error;
  }
}
const QuickFieldMapper = require('../pdf-form-test/quick-field-mapper');
const INSOLVENZANTRAG_CONFIG = require('../insolvenzantrag-checkbox-config');
const { convertDocxToPdf, generateSchuldenbereinigungsplanPdf, generateGlaeubigerlistePdf } = require('../services/documentConverter');
const documentGenerator = require('../services/documentGenerator');
const CreditorDocumentPackageGenerator = require('../services/creditorDocumentPackageGenerator');

// Helper function to calculate creditor response statistics from second email round
function calculateCreditorResponseStats(client) {
    // Get creditor list from final_creditor_list or debt_settlement_plan
    const creditors = client.final_creditor_list || client.debt_settlement_plan?.creditors || [];

    if (creditors.length === 0) {
        return {
            anzahl_glaeubiger: '0',
            anzahl_glaeubiger_zugestimmt: '0',
            anzahl_ablehnungen: '0',
            anzahl_ohne_antwort: '0',
            summe_zugestimmt: '0',
            summe_gesamt: String(client.total_debt || 0)
        };
    }

    // Count creditors by response status
    let acceptedCount = 0;
    let declinedCount = 0;
    let noResponseCount = 0;
    let acceptedSum = 0;
    let totalSum = 0;

    creditors.forEach(creditor => {
        const amount = creditor.claim_amount || creditor.current_debt_amount || creditor.creditor_response_amount || 0;
        totalSum += amount;

        const responseStatus = creditor.settlement_response_status || 'no_response';

        if (responseStatus === 'accepted') {
            acceptedCount++;
            acceptedSum += amount;
        } else if (responseStatus === 'declined' || responseStatus === 'counter_offer') {
            declinedCount++;
        } else {
            // 'pending' or 'no_response'
            noResponseCount++;
        }
    });

    console.log(`📊 Creditor response stats: ${acceptedCount} accepted, ${declinedCount} declined, ${noResponseCount} no response out of ${creditors.length} total`);
    console.log(`💰 Sum: ${acceptedSum} EUR accepted out of ${totalSum} EUR total`);

    return {
        anzahl_glaeubiger: String(creditors.length),  // Total number of creditors
        anzahl_glaeubiger_zugestimmt: String(acceptedCount),
        anzahl_ablehnungen: String(declinedCount),
        anzahl_ohne_antwort: String(noResponseCount),
        summe_zugestimmt: String(acceptedSum),
        summe_gesamt: String(totalSum)
    };
}

// Helper function to determine court based on ZIP code
function determineCourtByZipCode(zipCode) {
    if (!zipCode) return '';

    const zipPrefix = zipCode.substring(0, 2);
    const courtMapping = {
        '44': 'Bochum',
        '45': 'Essen',
        '46': 'Dortmund',
        '40': 'Düsseldorf',
        '41': 'Düsseldorf',
        '50': 'Köln',
        '51': 'Köln',
        '80': 'München',
        '81': 'München',
        '70': 'Stuttgart',
        '71': 'Stuttgart',
        '10': 'Berlin',
        '11': 'Berlin',
        '12': 'Berlin',
        '20': 'Hamburg',
        '21': 'Hamburg',
        '22': 'Hamburg'
    };

    return courtMapping[zipPrefix] || 'Berlin'; // Default fallback
}

// Helper function to map client data to PDF form fields
function mapClientDataToPDF(client) {
    // Use direct fields from client data (our test clients have individual fields)
    let street = client.strasse || '';
    let houseNumber = client.hausnummer || '';
    let zipCode = client.plz || '';
    let city = client.ort || '';

    // Fallback: Parse address string if individual fields aren't available
    if (!street && !zipCode && client.address) {
        const addressParts = client.address.match(/^(.+?)\s+(\d+[a-zA-Z]?),?\s*(\d{5})\s+(.+)$/);
        if (addressParts) {
            street = addressParts[1];
            houseNumber = addressParts[2];
            zipCode = addressParts[3];
            city = addressParts[4];
        }
    }

    const mappedData = {
        // Personal information - prioritize direct field names from client
        vorname: client.vorname || client.firstName || '',
        nachname: client.nachname || client.lastName || '',
        strasse: street,
        hausnummer: houseNumber,
        plz: zipCode,
        ort: city,
        telefon: client.telefon || client.phone || '',
        telefon_mobil: client.telefon_mobil || '',
        email: client.email || '',

        // Birth information
        geburtsdatum: client.geburtsdatum || '',
        geburtsort: client.geburtsort || '',
        geschlecht: client.geschlecht || 'maennlich',

        // Combined address fields for PDF
        strasse_hausnummer: street && houseNumber ? `${street} ${houseNumber}` : '',
        plz_ort: zipCode && city ? `${zipCode} ${city}` : '',
        vollstaendige_adresse: street && houseNumber ? `${street} ${houseNumber}` : '',
        plz_ort_kombiniert: zipCode && city ? `${zipCode} ${city}` : '',
        vorname_name: `${client.nachname || client.lastName || ''}, ${client.vorname || client.firstName || ''}`,

        // Family and employment status
        familienstand: client.familienstand || client.financial_data?.marital_status || 'ledig',
        berufsstatus: client.berufsstatus || 'angestellt',
        kinder_anzahl: String(client.kinder_anzahl || client.financial_data?.number_of_children || 0),

        // Financial data
        monatliches_netto_einkommen: String(client.financial_data?.monthly_income || client.financial_data?.monthly_net_income || ''),
        pfaendbar_amount: client.debt_settlement_plan?.pfaendbar_amount || client.financial_data?.pfaendbar_amount || 0,

        // Check if client has attachable income - check both locations
        has_pfaendbares_einkommen: !!(
            (client.debt_settlement_plan?.pfaendbar_amount && client.debt_settlement_plan.pfaendbar_amount > 0) ||
            (client.financial_data?.pfaendbar_amount && client.financial_data.pfaendbar_amount > 0)
        ),

        // ALWAYS ensure BOTH main Restschuldbefreiung checkboxes are set
        restschuldbefreiung_antrag_stellen: true,                // ✓ ALWAYS CHECKED - "Ich stelle den Antrag auf Restschuldbefreiung"
        restschuldbefreiung_bisher_nicht_gestellt: true,         // ✓ ALWAYS CHECKED - "bisher nicht gestellt habe"

        // Debt information
        gesamtschuldensumme: String(client.total_debt || client.debt_settlement_plan?.total_debt || 0),

        // Calculate creditor response statistics from second email round (includes anzahl_glaeubiger)
        ...calculateCreditorResponseStats(client),

        // Court
        amtsgericht: determineCourtByZipCode(zipCode),

        // Legal representation (Thomas Scuric)
        hat_anwalt: true,
        anwalt_name: 'Rechtsanwalt Thomas Scuric',
        anwalt_strasse: 'Bongardstraße',
        anwalt_hausnummer: '33',
        anwalt_plz: '44787',
        anwalt_ort: 'Bochum',
    };

    console.log('📋 Mapped client data for PDF:', {
        name: mappedData.vorname_name,
        address: mappedData.vollstaendige_adresse,
        plz_ort: mappedData.plz_ort_kombiniert,
        court: mappedData.amtsgericht,
        birthDate: mappedData.geburtsdatum,
        familyStatus: mappedData.familienstand,
        anzahl_glaeubiger: mappedData.anzahl_glaeubiger,
        anzahl_glaeubiger_zugestimmt: mappedData.anzahl_glaeubiger_zugestimmt,
        anzahl_ablehnungen: mappedData.anzahl_ablehnungen,
        anzahl_ohne_antwort: mappedData.anzahl_ohne_antwort,
        summe_zugestimmt: mappedData.summe_zugestimmt,
        summe_gesamt: mappedData.summe_gesamt,
        totalDebt: mappedData.gesamtschuldensumme
    });

    return mappedData;
}

// Enhanced PDF filling function with automatic checkbox application
async function fillInsolvenzantragWithCheckboxes(formData, originalPdfPath) {
    console.log('🔧 Starting enhanced PDF generation with automatic checkboxes...');
    
    // First, fill the basic form fields
    const filledPdfBytes = await QuickFieldMapper.fillWithRealFields(formData, originalPdfPath);
    
    // If client has pfändbares Einkommen, apply default checkboxes
    if (formData.has_pfaendbares_einkommen) {
        console.log('💰 Client has pfändbares Einkommen - applying default checkboxes...');
        
        try {
            // Apply the checkbox configuration to the PDF
            const finalPdfBytes = await INSOLVENZANTRAG_CONFIG.applyDefaultCheckboxesToPdf(filledPdfBytes);
            
            console.log('✅ Successfully applied default checkbox configuration');
            return finalPdfBytes;
            
        } catch (error) {
            console.error('⚠️ Error applying checkboxes, using basic form:', error.message);
            return filledPdfBytes;
        }
    } else {
        console.log('📝 Client has no pfändbares Einkommen - using basic form without additional checkboxes');
        return filledPdfBytes;
    }
}

// Check if all prerequisites are completed
async function checkPrerequisites(client) {
    const errors = [];

    // Check basic information
    if (!client.firstName || !client.lastName) {
        errors.push('Client name is missing');
    }

    // Check address - make it optional but warn if missing
    const hasAddress = client.address || (client.strasse && client.plz && client.ort);
    const hasAddressComponents = client.strasse || client.plz || client.ort;

    if (!hasAddress && !hasAddressComponents) {
        console.warn(`⚠️ Client ${client.aktenzeichen} has no address data - PDF will be generated with empty address fields`);
        // Don't block generation - address can be filled in manually if needed
    } else if (!hasAddress && hasAddressComponents) {
        console.warn(`⚠️ Client ${client.aktenzeichen} has partial address data`);
    }

    // Check financial data - accept if completed, client_form_filled, OR calculated_settlement_plan exists
    const hasFinancialData = client.financial_data?.completed ||
                             client.financial_data?.client_form_filled ||
                             client.calculated_settlement_plan;
    if (!hasFinancialData) {
        errors.push('Financial information form not completed');
    }

    // Check debt settlement plan
    if ((!client.debt_settlement_plan?.creditors || client.debt_settlement_plan.creditors.length === 0) &&
        (!client.final_creditor_list || client.final_creditor_list.length === 0)) {
        errors.push('Debt settlement plan not created');
    }

    // Check creditor list
    if (!client.final_creditor_list || client.final_creditor_list.length === 0) {
        errors.push('Creditor list not finalized');
    }

    return {
        isComplete: errors.length === 0,
        errors
    };
}

// Generate Insolvenzantrag for a specific client
router.get('/generate/:clientId', authenticateAdmin, async (req, res) => {
    try {
        const { clientId } = req.params;

        // Fetch client data
        const client = await getClient(clientId);
        if (!client) {
            return res.status(404).json({ error: 'Client not found' });
        }

        // Override: Allow generation if settlement plan has been sent to creditors
        const hasReachedSettlementStage = client.current_status === 'settlement_plan_sent_to_creditors';

        // Check prerequisites (skip if already at settlement stage)
        if (!hasReachedSettlementStage) {
            const prerequisiteCheck = await checkPrerequisites(client);
            if (!prerequisiteCheck.isComplete) {
                return res.status(400).json({
                    error: 'Prerequisites not met',
                    details: prerequisiteCheck.errors
                });
            }
        } else {
            console.log(`✅ Client has reached settlement stage - skipping prerequisite checks`);
        }

        console.log(`Generating Insolvenzantrag for client: ${client.firstName} ${client.lastName}`);

        // 1. Map client data to PDF form fields
        const formData = mapClientDataToPDF(client);

        // 2. Generate the main Insolvenzantrag PDF with checkboxes
<<<<<<< HEAD
        const originalPdfPath = path.join(__dirname, '../pdf-form-test/original_form.pdf');
=======
        const originalPdfPath = path.join(__dirname, '../../pdf-form-test/original_form.pdf');
>>>>>>> origin
        
        // Fill form fields and apply checkboxes
        const insolvenzantragBytes = await fillInsolvenzantragWithCheckboxes(formData, originalPdfPath);

        // 3. For now, we'll only generate the main Insolvenzantrag form
        // Attachment generation will be added later
        console.log('📝 Generating main Insolvenzantrag form only (attachments disabled for testing)');
        
        // Simply use the filled form without attachments
        const mergedPdfBytes = insolvenzantragBytes;

        // Send the PDF as download
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="Insolvenzantrag_${client.lastName}_${client.firstName}.pdf"`);
        res.send(Buffer.from(mergedPdfBytes));

        console.log(`✅ Insolvenzantrag generated successfully for ${client.firstName} ${client.lastName}`);

    } catch (error) {
        console.error('Error generating Insolvenzantrag:', error);
        res.status(500).json({ error: 'Failed to generate Insolvenzantrag', details: error.message });
    }
});

// Check prerequisites endpoint
router.get('/check-prerequisites/:clientId', authenticateAdmin, async (req, res) => {
    try {
        const { clientId } = req.params;

        const client = await getClient(clientId);
        if (!client) {
            return res.status(404).json({ error: 'Client not found' });
        }

        const prerequisiteCheck = await checkPrerequisites(client);

        // Override: Allow download if settlement plan has been sent to creditors
        const hasReachedSettlementStage = client.current_status === 'settlement_plan_sent_to_creditors';
        const canGenerate = prerequisiteCheck.isComplete || hasReachedSettlementStage;

        res.json({
            clientId,
            canGenerateInsolvenzantrag: canGenerate,
            prerequisites: {
                hasPersonalInfo: !!(client.firstName && client.lastName && (client.address || (client.strasse && client.plz && client.ort))),
                hasFinancialData: !!(client.financial_data?.completed || client.financial_data?.client_form_filled || client.calculated_settlement_plan),
                hasDebtSettlementPlan: !!(client.debt_settlement_plan?.creditors?.length > 0 || client.final_creditor_list?.length > 0 || client.calculated_settlement_plan),
                hasCreditorList: !!(client.final_creditor_list?.length > 0)
            },
            errors: hasReachedSettlementStage ? [] : prerequisiteCheck.errors,
            statusOverride: hasReachedSettlementStage ? 'Settlement plan sent - download enabled' : null
        });

    } catch (error) {
        console.error('Error checking prerequisites:', error);
        res.status(500).json({ error: 'Failed to check prerequisites' });
    }
});

// Generate complete creditor document package
router.get('/generate-creditor-package/:clientId', authenticateAdmin, async (req, res) => {
    try {
        const { clientId } = req.params;

        // Fetch client data
        const client = await getClient(clientId);
        if (!client) {
            return res.status(404).json({ error: 'Client not found' });
        }

        console.log(`Generating creditor document package for client: ${client.firstName} ${client.lastName}`);

        // Check if client has settlement data
        if (!client.debt_settlement_plan && !client.final_creditor_list) {
            return res.status(400).json({ 
                error: 'Settlement data not available',
                details: ['Client must have debt settlement plan and creditor list']
            });
        }

        // Determine if this is a Nullplan or regular plan
        const pfaendbarAmount = client.calculated_settlement_plan?.garnishable_amount ||
                               client.debt_settlement_plan?.pfaendbar_amount ||
                               client.financial_data?.garnishable_amount ||
                               client.financial_data?.pfaendbar_amount || 0;

        // Use threshold of 1 EUR to handle rounding and treat very small amounts as 0
        const isNullplan = pfaendbarAmount < 1 ||
                          client.financial_data?.recommended_plan_type === 'nullplan' ||
                          client.calculated_settlement_plan?.plan_type === 'nullplan';

        const planType = isNullplan ? 'nullplan' : 'quotenplan';

        console.log(`📊 Plan type for creditor package: ${planType} (pfändbar: €${pfaendbarAmount.toFixed(2)}, threshold: €1.00)`);

        // Prepare settlement data
        const creditors = client.final_creditor_list || client.debt_settlement_plan?.creditors || [];
        const totalDebt = creditors.reduce((sum, c) => sum + (c.claim_amount || 0), 0) || client.total_debt || 0;

        const settlementData = {
            plan_type: planType,
            creditors: creditors,
            total_debt: totalDebt,
            pfaendbar_amount: pfaendbarAmount,
            garnishable_amount: pfaendbarAmount,
            monthly_payment: pfaendbarAmount,
            average_quota_percentage: isNullplan ? 0 : (client.debt_settlement_plan?.average_quota_percentage || 32.57),
            start_date: '01.08.2025',
            duration_months: 36
        };

        // Add creditor_payments only for non-Nullplan
        if (!isNullplan) {
            settlementData.creditor_payments = creditors.map(creditor => ({
                creditor_name: creditor.sender_name || creditor.creditor_name || 'Unknown',
                debt_amount: creditor.claim_amount || 0,
                payment_percentage: totalDebt > 0 ? ((creditor.claim_amount || 0) / totalDebt * 100) : 0,
                monthly_payment: totalDebt > 0 ? (pfaendbarAmount * ((creditor.claim_amount || 0) / totalDebt)) : 0
            }));
        }

        // Generate complete creditor package
        const packageGenerator = new CreditorDocumentPackageGenerator();
        const packageResult = await packageGenerator.generateCompleteCreditorPackage(client, settlementData);

        if (!packageResult.success) {
            return res.status(500).json({ 
                error: 'Failed to generate creditor package', 
                details: packageResult.error 
            });
        }

        // Send the merged PDF
        const pdfBuffer = await require('fs').promises.readFile(packageResult.path);
        
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${packageResult.filename}"`);
        res.send(pdfBuffer);

        console.log(`✅ Creditor document package generated successfully: ${packageResult.filename}`);

    } catch (error) {
        console.error('Error generating creditor document package:', error);
        res.status(500).json({ error: 'Failed to generate creditor document package', details: error.message });
    }
});

// Generate complete Insolvenzantrag with all attachments (including creditor documents)
router.get('/generate-complete/:clientId', authenticateAdmin, async (req, res) => {
    try {
        const { clientId } = req.params;

        // Fetch client data
        const client = await getClient(clientId);
        if (!client) {
            return res.status(404).json({ error: 'Client not found' });
        }

        // Override: Allow generation if settlement plan has been sent to creditors
        const hasReachedSettlementStage = client.current_status === 'settlement_plan_sent_to_creditors';

        // Check prerequisites (skip if already at settlement stage)
        if (!hasReachedSettlementStage) {
            const prerequisiteCheck = await checkPrerequisites(client);
            if (!prerequisiteCheck.isComplete) {
                return res.status(400).json({
                    error: 'Prerequisites not met',
                    details: prerequisiteCheck.errors
                });
            }
        } else {
            console.log(`✅ Client has reached settlement stage - skipping prerequisite checks`);
        }

        console.log(`Generating complete Insolvenzantrag with attachments for client: ${client.firstName} ${client.lastName}`);

        // 1. Generate main Insolvenzantrag PDF
        const formData = mapClientDataToPDF(client);
<<<<<<< HEAD
        const originalPdfPath = path.join(__dirname, '../pdf-form-test/original_form.pdf');
=======
        const originalPdfPath = path.join(__dirname, '../../pdf-form-test/original_form.pdf');
>>>>>>> origin
        const insolvenzantragBytes = await fillInsolvenzantragWithCheckboxes(formData, originalPdfPath);

        // 2. Generate creditor document package
        let creditorPackageBytes = null;
        if (client.debt_settlement_plan || client.final_creditor_list) {
            try {
                // Determine if this is a Nullplan or regular plan
                const pfaendbarAmount = client.calculated_settlement_plan?.garnishable_amount ||
                                       client.debt_settlement_plan?.pfaendbar_amount ||
                                       client.financial_data?.garnishable_amount ||
                                       client.financial_data?.pfaendbar_amount || 0;

                // Use threshold of 1 EUR to handle rounding and treat very small amounts as 0
                const isNullplan = pfaendbarAmount < 1 ||
                                  client.financial_data?.recommended_plan_type === 'nullplan' ||
                                  client.calculated_settlement_plan?.plan_type === 'nullplan';

                const planType = isNullplan ? 'nullplan' : 'quotenplan';

                console.log(`📊 Plan type for complete package: ${planType} (pfändbar: €${pfaendbarAmount.toFixed(2)}, threshold: €1.00)`);

                // Prepare settlement data
                const creditors = client.final_creditor_list || client.debt_settlement_plan?.creditors || [];
                const totalDebt = creditors.reduce((sum, c) => sum + (c.claim_amount || 0), 0) || client.total_debt || 0;

                const settlementData = {
                    plan_type: planType,
                    creditors: creditors,
                    total_debt: totalDebt,
                    pfaendbar_amount: pfaendbarAmount,
                    garnishable_amount: pfaendbarAmount,
                    monthly_payment: pfaendbarAmount,
                    average_quota_percentage: isNullplan ? 0 : (client.debt_settlement_plan?.average_quota_percentage || 32.57),
                    start_date: '01.08.2025',
                    duration_months: 36
                };

                // Add creditor_payments only for non-Nullplan
                if (!isNullplan) {
                    settlementData.creditor_payments = creditors.map(creditor => ({
                        creditor_name: creditor.sender_name || creditor.creditor_name || 'Unknown',
                        debt_amount: creditor.claim_amount || 0,
                        payment_percentage: totalDebt > 0 ? ((creditor.claim_amount || 0) / totalDebt * 100) : 0,
                        monthly_payment: totalDebt > 0 ? (pfaendbarAmount * ((creditor.claim_amount || 0) / totalDebt)) : 0
                    }));
                }

                const packageGenerator = new CreditorDocumentPackageGenerator();
                const packageResult = await packageGenerator.generateCompleteCreditorPackage(client, settlementData);
                
                if (packageResult.success) {
                    creditorPackageBytes = await require('fs').promises.readFile(packageResult.path);
                    console.log('✅ Creditor document package included in complete Insolvenzantrag');
                }
            } catch (error) {
                console.warn('⚠️ Could not include creditor documents:', error.message);
            }
        }

        // 3. Merge all documents
        const finalPdf = await PDFDocument.create();
        
        // Add main Insolvenzantrag
        const mainDoc = await PDFDocument.load(insolvenzantragBytes);
        const mainPages = await finalPdf.copyPages(mainDoc, mainDoc.getPageIndices());
        mainPages.forEach(page => finalPdf.addPage(page));
        
        // Add creditor document package if available
        if (creditorPackageBytes) {
            const creditorDoc = await PDFDocument.load(creditorPackageBytes);
            const creditorPages = await finalPdf.copyPages(creditorDoc, creditorDoc.getPageIndices());
            creditorPages.forEach(page => finalPdf.addPage(page));
        }
        
        const finalPdfBytes = await finalPdf.save();

        // Send the complete PDF
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="Complete-Insolvenzantrag_${client.lastName}_${client.firstName}.pdf"`);
        res.send(Buffer.from(finalPdfBytes));

        console.log(`✅ Complete Insolvenzantrag with attachments generated successfully for ${client.firstName} ${client.lastName}`);

    } catch (error) {
        console.error('Error generating complete Insolvenzantrag:', error);
        res.status(500).json({ error: 'Failed to generate complete Insolvenzantrag', details: error.message });
    }
});

module.exports = router;