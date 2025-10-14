const express = require('express');
const router = express.Router();
const { PDFDocument, StandardFonts } = require('pdf-lib');
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
const { percentageValue } = require('docx');

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

// async function injectCreditorsIntoAnlage6(pdfBytes, client, options = {}) {
//     try {
//         const pdfDoc = await PDFDocument.load(pdfBytes);

//         const targetIndex = Number(options.targetIndex ?? 23); // 0-based
//         const startFieldNumber = Number(options.startFieldNumber ?? 423); // first row's first field
//         const fieldsPerRow = Number(options.fieldsPerRow ?? 8); // 8 fields per row
//         const maxRowsPerPage = Number(options.maxRowsPerPage ?? 20); // adjust according to template

//         const creditors = client.final_creditor_list || [];
//         if (!Array.isArray(creditors) || creditors.length === 0) return pdfBytes;

//         const form = pdfDoc.getForm();
//         let pageOffset = 0;

//         for (let i = 0; i < creditors.length; i++) {
//             const rowInPage = i % maxRowsPerPage;

//             // Duplicate page if needed
//             if (i > 0 && rowInPage === 0) {
//                 const [dup] = await pdfDoc.copyPages(pdfDoc, [targetIndex]);
//                 pdfDoc.addPage(dup);
//                 pageOffset++;
//             }

//             const creditor = creditors[i];

//             // Fill all 8 text fields for this row
//             for (let f = 0; f < fieldsPerRow; f++) {
//                 const fieldNumber = startFieldNumber + rowInPage * fieldsPerRow + f;
//                 const fieldName = `Textfeld ${fieldNumber}`;
//                 let text = '';
//                 const principal = Number(creditor.claim_amount ?? creditor.current_debt_amount ?? creditor.amount ?? 0);
//                 switch (f) {
//                     case 0: 
//                         text = `${i + 1}.`; // Serial No.
//                         break;
//                     case 1: 
//                         text = creditor.sender_name || creditor.name || 'Unbekannt'; // Name
//                         break;
//                     case 2: 
//                         text = `${principal.toFixed(2)} €`; // Principal Claim
//                         break;
//                     case 3: 
//                         text = '0'
//                         break;
//                     case 4: 
//                         text = '0'
//                         break;
//                     case 5: 
//                         text = `${principal.toFixed(2)} €`; // Principal Claim
//                         break;
//                     case 6: 
//                         text = creditor.actual_creditor || ''; // Claim Reason / Basis
//                         break;
//                     case 7: 
//                         text = `${principal.toFixed(2)} €`; // Principal Claim
//                         break;
//                 }

//                 try { form.getTextField(fieldName).setText(text); } catch {}
//             }
//         }

//         return await pdfDoc.save();

//     } catch (e) {
//         console.warn('⚠️ Failed to inject creditors into Anlage 6:', e.message);
//         return pdfBytes;
//     }
// }


async function injectCreditorsIntoAnlage6and7(pdfBytes, client, options = {}) {
    try {
        const pdfDoc = await PDFDocument.load(pdfBytes);
        const form = pdfDoc.getForm();

        // ------------------- 📄 ANLAGE 6 -------------------
        const creditors = client.final_creditor_list || [];
        if (Array.isArray(creditors) && creditors.length > 0) {
            await fillAnlage6(pdfDoc, form, creditors, options);
            await fillAnlage7(pdfDoc, form, creditors, options);
        }

        // ------------------- 📄 ANLAGE 7 -------------------
        // const relatedPersons = client.related_persons || []; // 👈 use another dataset here
        // if (Array.isArray(relatedPersons) && relatedPersons.length > 0) {
        //   await fillAnlage7(pdfDoc, form, relatedPersons, options);
        // }

        return await pdfDoc.save();
    } catch (err) {
        console.warn("⚠️ Failed to inject data into Anlage 6 & 7:", err.message);
        return pdfBytes;
    }
}

//
// ------------------- 📄 ANLAGE 6 -------------------
//
async function fillAnlage6(pdfDoc, form, creditors, options) {
    const targetIndex = Number(options.anlage6Index ?? 23); // 0-based (page 24)
    const startFieldNumber = Number(options.anlage6Start ?? 423);
    const fieldsPerRow = 8;
    const maxRowsPerPage = 20;

    let pageOffset = 0;

    for (let i = 0; i < creditors.length; i++) {
        const rowInPage = i % maxRowsPerPage;

        // Duplicate page if needed
        if (i > 0 && rowInPage === 0) {
            const [dup] = await pdfDoc.copyPages(pdfDoc, [targetIndex]);
            pdfDoc.addPage(dup);
            pageOffset++;
        }

        const creditor = creditors[i];
        const principal = Number(creditor.claim_amount ?? creditor.amount ?? 0);

        for (let f = 0; f < fieldsPerRow; f++) {
            const fieldNumber = startFieldNumber + rowInPage * fieldsPerRow + f;
            const fieldName = `Textfeld ${fieldNumber}`;
            let text = "";

            switch (f) {
                case 0:
                    text = `${i + 1}.`;
                    break;
                case 1:
                    text = creditor.sender_name || creditor.name || "Unbekannt";
                    break;
                case 2:
                    text = `${principal.toFixed(2)} €`;
                    break;
                case 3:
                case 4:
                    text = "0";
                    break;
                case 5:
                    text = `${principal.toFixed(2)} €`;
                    break;
                case 6:
                    text = creditor.actual_creditor || "";
                    break;
                case 7:
                    text = `${principal.toFixed(2)} €`;
                    break;
            }

            try {
                form.getTextField(fieldName).setText(text);
            } catch { }
        }
    }
}

//
// ------------------- 📄 ANLAGE 7 -------------------
//
// async function fillAnlage7(pdfDoc, form, creditors, options = {}) {
//     const targetIndex = Number(options.anlage7Index ?? 25); // Page index (0-based)
//     const startFieldNumber = Number(options.anlage7Start ?? 643); // Starts from Textfeld 643
//     const fieldGap = 11; // Gap between each creditor block (next creditor starts 7 fields later)
//     const fieldsPerCreditor = 5; // Number of fields filled per creditor
//     const maxRowsPerPage = 6; // Number of creditor blocks per page (3 left + 3 right columns)

//     // Dummy France address for now
//     const dummyStreet = "Rue de Lyon";
//     const dummyHouseNumber = "18B";
//     const dummyZip = "75012";
//     const dummyCity = "Paris";

//     let pageOffset = 0;

//      // Calculate total debt amount (sum of all claim_amounts)
//     const totalDebtAmount = creditors.reduce((sum, c) => {
//         const amount = parseFloat(c.claim_amount || c.amount || 0);
//         return sum + (isNaN(amount) ? 0 : amount);
//     }, 0);

//     for (let i = 0; i < 9; i++) {
//         const rowInPage = i % maxRowsPerPage;

//         // ➕ Duplicate page when current page fills up
//         if (i > 0 && rowInPage === 0) {
//             const [dup] = await pdfDoc.copyPages(pdfDoc, [targetIndex]);
//             pdfDoc.addPage(dup);
//             pageOffset++;
//         }

//         const baseFieldNumber =
//             startFieldNumber + (rowInPage + pageOffset * maxRowsPerPage) * fieldGap;

//         const creditor = creditors[i];

//         const claimAmount = parseFloat(creditor.claim_amount || creditor.amount || 0);
//         const percentage =
//         totalDebtAmount > 0 ? ((claimAmount / totalDebtAmount) * 100).toFixed(2) : "0.00";

//         // 🧭 Dummy address for France
//         const dummyStreet = "Rue de Lyon";
//         const dummyHouseNumber = "18B";
//         const dummyZip = "75012";
//         const dummyCity = "Paris";

//         // 🧭 Map main fields (643–647)
//         const rows = [
//             `${creditor.name || creditor.sender_name || "Unbekannt"}`, // 643
//             `${dummyStreet} ${dummyHouseNumber}`.trim(), // 644
//             `${dummyZip} ${dummyCity}`.trim(), // 645
//             `${creditor.reference_number || ""}`, // 646
//             `${creditor.actual_creditor || ""}`, // 647
//         ];

//         // 🖋 Fill main creditor fields
//         rows.forEach((text, idx) => {
//             const fieldName = `Textfeld ${baseFieldNumber + idx}`;
//             try {
//                 form.getTextField(fieldName).setText(text);
//             } catch {
//                 console.warn(`⚠️ Missing field: ${fieldName}`);
//             }
//         });

//         // ⏩ Skip 4 fields (648–651)
//         const claimFieldIndex = baseFieldNumber + 9; // 643 + 9 = 652
//         const percentFieldIndex = baseFieldNumber + 10; // 643 + 10 = 653

//         // 🧮 Fill claim amount and percentage
//         try {
//             form.getTextField(`Textfeld ${claimFieldIndex}`).setText(
//                 `${claimAmount}`
//             );
//         } catch {
//             console.warn(`⚠️ Missing field: Textfeld ${claimFieldIndex}`);
//         }

//         try {
//             form.getTextField(`Textfeld ${percentFieldIndex}`).setText(
//                 `${percentage}`
//             );
//         } catch {
//             console.warn(`⚠️ Missing field: Textfeld ${percentFieldIndex}`);
//         }
//     }

// }
async function fillAnlage7(pdfDoc, form, creditors, options = {}) {
    const targetIndex = Number(options.anlage7Index ?? 25); // Page index (0-based)
    const startFieldNumber = Number(options.anlage7Start ?? 643); // Starts from Textfeld 643
    const maxRowsPerPage = 6; // Number of creditor blocks per page (3 left + 3 right columns)

    // Dummy France address for now
    // const dummyStreet = "Rue de Lyon";
    // const dummyHouseNumber = "18B";
    // const dummyZip = "75012";
    // const dummyCity = "Paris";

    let pageOffset = 0;
    let currentFieldNumber = startFieldNumber; // 👈 Track actual field number manually

    // Calculate total debt amount (sum of all claim_amounts)
    const totalDebtAmount = creditors.reduce((sum, c) => {
        const amount = parseFloat(c.claim_amount || c.amount || 0);
        return sum + (isNaN(amount) ? 0 : amount);
    }, 0);

    // 🔁 Loop from 1 to 9 (inclusive)
    for (let i = 1; i <= 9; i++) {
        const rowInPage = (i - 1) % maxRowsPerPage;

        // ➕ Duplicate page when current page fills up
        if (i > 1 && rowInPage === 0) {
            const [dup] = await pdfDoc.copyPages(pdfDoc, [targetIndex]);
            pdfDoc.addPage(dup);
            pageOffset++;
        }

        const creditor = creditors[i - 1];
        if (!creditor) continue;

        let street = creditor.strasse || '';
        let houseNumber = creditor.hausnummer || '';
        let zipCode = creditor.plz || '';
        let city = creditor.ort || '';

        const claimAmount = parseFloat(creditor.claim_amount || creditor.amount || 0);
        const percentage =
            totalDebtAmount > 0 ? ((claimAmount / totalDebtAmount) * 100).toFixed(2) : "0.00";

        // 🧭 Prepare data rows
        const rows = [
            `${creditor.name || creditor.sender_name || "Unbekannt"}`,
            `${street} ${houseNumber}`.trim(),
            `${zipCode} ${city}`.trim(),
            `${creditor.reference_number || ""}`,
            `${creditor.actual_creditor || ""}`,
        ];

        // 🧾 Add iteration number at start from i >= 4
        const finalRows = i >= 4 ? [`${i}.`, ...rows] : rows;

        // 🖋 Fill fields
        finalRows.forEach((text, idx) => {
            const fieldName = `Textfeld ${currentFieldNumber + idx}`;
            try {
                form.getTextField(fieldName).setText(text);
            } catch {
                console.warn(`⚠️ Missing field: ${fieldName}`);
            }
        });

        // Calculate indexes for claim and percentage fields dynamically
        const claimFieldIndex = currentFieldNumber + finalRows.length + 4; // skip 4 fields (48–51)
        const percentFieldIndex = claimFieldIndex + 1;

        try {
            form.getTextField(`Textfeld ${claimFieldIndex}`).setText(`${claimAmount}`);
        } catch {
            console.warn(`⚠️ Missing field: Textfeld ${claimFieldIndex}`);
        }

        try {
            form.getTextField(`Textfeld ${percentFieldIndex}`).setText(`${percentage}%`);
        } catch {
            console.warn(`⚠️ Missing field: Textfeld ${percentFieldIndex}`);
        }

        // 🧮 Increment field number for next creditor
        const fieldGap = i >= 4 ? 12 : 11;
        currentFieldNumber += fieldGap;
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
        const originalPdfPath = path.join(__dirname, '../pdf-form-test/original_form.pdf');

        // Fill form fields and apply checkboxes
        const insolvenzantragBytes = await fillInsolvenzantragWithCheckboxes(formData, originalPdfPath);

        // 3. For now, we'll only generate the main Insolvenzantrag form
        // Attachment generation will be added later
        console.log('📝 Generating main Insolvenzantrag form only (attachments disabled for testing)');

        // Inject creditor table into Anlage 6 (page 24) with optional positioning overrides from query params
        const mergedPdfBytes = await injectCreditorsIntoAnlage6and7(insolvenzantragBytes, client, req.query);

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
        const originalPdfPath = path.join(__dirname, '../pdf-form-test/original_form.pdf');
        const insolvenzantragBytes = await fillInsolvenzantragWithCheckboxes(formData, originalPdfPath);
        // Inject creditor table into Anlage 6 (page 24) with optional positioning overrides from query params
        let mergedPdfBytes = await injectCreditorsIntoAnlage6and7(insolvenzantragBytes, client, req.query);

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
        const mainDoc = await PDFDocument.load(mergedPdfBytes);
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