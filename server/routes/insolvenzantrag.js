const express = require('express');
const router = express.Router();
const { PDFDocument, StandardFonts, rgb, PDFName, PDFBool } = require('pdf-lib');
const fs = require('fs').promises;
const path = require('path');
const axios = require('axios');
const { authenticateClient, authenticateAdmin } = require('../middleware/auth');
const Client = require('../models/Client');

// Helper function to get client (handles _id, id, and aktenzeichen lookups)
async function getClient(clientId) {
    try {
        // Try MongoDB _id first (24-char hex), then UUID id, then aktenzeichen
        if (clientId.match(/^[0-9a-fA-F]{24}$/)) {
            const client = await Client.findById(clientId);
            if (client) return client;
        }
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

// Determine Insolvenzgericht based on ZIP code
// PLZ → Amtsgericht mapping (NRW komplett, alle Großstädte, erweitert)
function determineCourtByZipCode(zipCode) {
    if (!zipCode) return '';

    const zip3 = zipCode.substring(0, 3);
    const zip2 = zipCode.substring(0, 2);

    // 3-digit precision for areas where multiple courts share a 2-digit prefix
    const courtMapping3 = {
        // NRW — Ruhrgebiet & Umgebung
        '440': 'Bochum', '441': 'Bochum', '442': 'Bochum', '443': 'Bochum',
        '444': 'Dortmund', '445': 'Dortmund', '446': 'Dortmund', '447': 'Dortmund',
        '448': 'Hagen', '449': 'Hagen',
        '450': 'Essen', '451': 'Essen', '452': 'Essen', '453': 'Essen',
        '454': 'Mülheim an der Ruhr', '455': 'Oberhausen',
        '456': 'Oberhausen', '457': 'Gelsenkirchen', '458': 'Gelsenkirchen',
        '459': 'Recklinghausen',
        '460': 'Recklinghausen', '461': 'Recklinghausen',
        '462': 'Marl', '463': 'Herne',
        '464': 'Castrop-Rauxel', '465': 'Dorsten',
        '466': 'Bottrop', '467': 'Gladbeck',
        '468': 'Duisburg', '469': 'Duisburg',
        '470': 'Duisburg', '471': 'Duisburg', '472': 'Krefeld', '473': 'Krefeld',
        '474': 'Moers', '475': 'Wesel',
        '476': 'Kleve', '477': 'Kleve',
        '478': 'Emmerich',
        '480': 'Münster', '481': 'Münster', '482': 'Münster',
        '483': 'Warendorf', '484': 'Warendorf',
        '485': 'Steinfurt', '486': 'Steinfurt',
        '487': 'Coesfeld', '488': 'Coesfeld',
        '489': 'Borken',
        '490': 'Osnabrück', '491': 'Osnabrück',
        // NRW — Düsseldorf & Niederrhein
        '400': 'Düsseldorf', '401': 'Düsseldorf', '402': 'Düsseldorf',
        '403': 'Mettmann', '404': 'Neuss',
        '405': 'Mönchengladbach', '406': 'Mönchengladbach',
        '407': 'Viersen', '408': 'Viersen',
        '410': 'Krefeld', '411': 'Krefeld',
        '412': 'Solingen', '413': 'Remscheid',
        '414': 'Wuppertal', '415': 'Wuppertal',
        '420': 'Wuppertal', '421': 'Wuppertal',
        '422': 'Solingen', '423': 'Remscheid',
        '424': 'Velbert',
        // NRW — Köln & Rheinland
        '500': 'Köln', '501': 'Köln', '502': 'Köln', '503': 'Köln',
        '504': 'Brühl', '505': 'Bergisch Gladbach',
        '506': 'Bergisch Gladbach', '507': 'Leverkusen',
        '508': 'Kerpen', '509': 'Kerpen',
        '510': 'Köln', '511': 'Köln', '512': 'Gummersbach',
        '513': 'Siegburg', '514': 'Siegburg',
        '515': 'Bonn', '516': 'Bonn', '517': 'Bonn', '518': 'Bonn',
        '520': 'Aachen', '521': 'Aachen', '522': 'Aachen',
        '523': 'Düren', '524': 'Düren',
        '525': 'Euskirchen', '526': 'Euskirchen',
        '527': 'Heinsberg',
        // NRW — Ostwestfalen-Lippe
        '330': 'Bielefeld', '331': 'Bielefeld', '332': 'Gütersloh',
        '333': 'Gütersloh', '334': 'Minden',
        '335': 'Minden', '336': 'Herford', '337': 'Herford',
        '338': 'Paderborn', '339': 'Paderborn',
        // NRW — Sauerland / Siegen
        '570': 'Siegen', '571': 'Siegen', '572': 'Olpe',
        '573': 'Meschede', '574': 'Arnsberg', '575': 'Arnsberg',
        '576': 'Arnsberg', '577': 'Brilon',
        '580': 'Hagen', '581': 'Iserlohn', '582': 'Iserlohn',
        '583': 'Lüdenscheid', '584': 'Lüdenscheid',
        '585': 'Altena', '586': 'Plettenberg',
        '590': 'Hamm', '591': 'Hamm',
        '592': 'Soest', '593': 'Soest', '594': 'Lippstadt',
        '595': 'Unna', '596': 'Unna',
        // NRW — Lippe / Detmold
        '320': 'Detmold', '321': 'Lemgo', '322': 'Lemgo',
        '323': 'Paderborn', '324': 'Höxter',
        '325': 'Höxter', '326': 'Warburg',
        '327': 'Detmold', '328': 'Bad Salzuflen',
    };

    // 2-digit fallback for remaining areas (non-NRW)
    const courtMapping2 = {
        // Berlin
        '10': 'Berlin-Charlottenburg', '11': 'Berlin-Charlottenburg',
        '12': 'Berlin-Charlottenburg', '13': 'Berlin-Charlottenburg', '14': 'Potsdam',
        // Hamburg
        '20': 'Hamburg', '21': 'Hamburg', '22': 'Hamburg',
        // Niedersachsen
        '23': 'Lübeck', '24': 'Kiel', '25': 'Pinneberg',
        '26': 'Oldenburg', '27': 'Bremen', '28': 'Bremen', '29': 'Celle',
        '30': 'Hannover', '31': 'Hannover',
        '34': 'Kassel', '35': 'Gießen', '36': 'Fulda', '37': 'Göttingen',
        '38': 'Braunschweig', '39': 'Magdeburg',
        // Sachsen-Anhalt / Thüringen / Sachsen
        '06': 'Halle (Saale)', '07': 'Gera', '08': 'Zwickau', '09': 'Chemnitz',
        '04': 'Leipzig',
        '01': 'Dresden', '02': 'Görlitz', '03': 'Cottbus',
        '98': 'Erfurt', '99': 'Erfurt',
        // Hessen
        '60': 'Frankfurt am Main', '61': 'Frankfurt am Main',
        '63': 'Offenbach', '64': 'Darmstadt', '65': 'Wiesbaden',
        // Rheinland-Pfalz / Saarland
        '54': 'Trier', '55': 'Mainz', '56': 'Koblenz',
        '66': 'Saarbrücken', '67': 'Ludwigshafen',
        // Baden-Württemberg
        '68': 'Mannheim', '69': 'Heidelberg',
        '70': 'Stuttgart', '71': 'Stuttgart', '72': 'Tübingen', '73': 'Göppingen',
        '74': 'Heilbronn', '75': 'Pforzheim', '76': 'Karlsruhe', '77': 'Offenburg',
        '78': 'Villingen-Schwenningen', '79': 'Freiburg',
        // Bayern
        '80': 'München', '81': 'München', '82': 'München',
        '83': 'Rosenheim', '84': 'Landshut', '85': 'Ingolstadt',
        '86': 'Augsburg', '87': 'Kempten', '88': 'Ravensburg',
        '89': 'Ulm',
        '90': 'Nürnberg', '91': 'Nürnberg',
        '92': 'Amberg', '93': 'Regensburg', '94': 'Passau',
        '95': 'Bayreuth', '96': 'Bamberg', '97': 'Würzburg',
        // Schleswig-Holstein / Meckl.-Vorpommern
        '15': 'Frankfurt (Oder)', '16': 'Neuruppin', '17': 'Neubrandenburg', '18': 'Rostock', '19': 'Schwerin',
    };

    return courtMapping3[zip3] || courtMapping2[zip2] || '';
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
        // Personal information
        vorname: client.vorname || client.firstName || '',
        nachname: client.nachname || client.lastName || '',
        strasse: street,
        hausnummer: houseNumber,
        plz: zipCode,
        ort: city,
        telefon: client.telefon || client.phone || '',
        telefon_mobil: client.telefon_mobil || client.mobiltelefon || '',
        email: client.email || '',

        // Birth information — geburtsdatum with geburtstag fallback
        geburtsdatum: client.geburtsdatum || client.geburtstag || '',
        geburtsort: client.geburtsort || '',
        geschlecht: client.geschlecht || '',

        // Professional information
        erlernter_beruf: client.erlernter_beruf || '',
        derzeitige_taetigkeit: client.derzeitige_taetigkeit || '',
        beschaeftigungsart: client.beschaeftigungsart || '',

        // Combined address fields for PDF
        strasse_hausnummer: street && houseNumber ? `${street} ${houseNumber}` : '',
        plz_ort: zipCode && city ? `${zipCode} ${city}` : '',
        vollstaendige_adresse: street && houseNumber ? `${street} ${houseNumber}` : '',
        plz_ort_kombiniert: zipCode && city ? `${zipCode} ${city}` : '',
        vorname_name: `${client.nachname || client.lastName || ''}, ${client.vorname || client.firstName || ''}`,

        // Family and employment status
        familienstand: client.familienstand || client.financial_data?.marital_status || 'ledig',
        berufsstatus: client.berufsstatus
            || client.extended_financial_data?.berufsstatus
            || client.beschaeftigungsart
            || '',
        kinder_anzahl: String(client.kinder_anzahl || client.financial_data?.number_of_children || 0),

        // Financial data
        monatliches_netto_einkommen: String(
            client.netto_einkommen
            || client.financial_data?.monthly_net_income
            || client.financial_data?.monthly_income
            || ''
        ),
        pfaendbar_amount: client.debt_settlement_plan?.pfaendbar_amount
            || client.financial_data?.pfaendbar_amount
            || client.calculated_settlement_plan?.garnishable_amount
            || client.second_letter_financial_snapshot?.garnishable_amount
            || 0,

        // Check if client has attachable income
        has_pfaendbares_einkommen: !!(
            (client.debt_settlement_plan?.pfaendbar_amount && client.debt_settlement_plan.pfaendbar_amount > 0) ||
            (client.financial_data?.pfaendbar_amount && client.financial_data.pfaendbar_amount > 0) ||
            (client.calculated_settlement_plan?.garnishable_amount && client.calculated_settlement_plan.garnishable_amount > 0) ||
            (client.second_letter_financial_snapshot?.garnishable_amount && client.second_letter_financial_snapshot.garnishable_amount > 0)
        ),

        // Debt information
        gesamtschuldensumme: String(client.total_debt || client.gesamt_schulden || client.debt_settlement_plan?.total_debt || client.second_letter_financial_snapshot?.total_debt || 0),

        // Creditor response statistics
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

    // Track missing fields for validation report
    const requiredFields = {
        'Vorname': mappedData.vorname,
        'Nachname': mappedData.nachname,
        'Straße': mappedData.strasse,
        'PLZ': mappedData.plz,
        'Ort': mappedData.ort,
        'Geburtsdatum': mappedData.geburtsdatum,
        'Geburtsort': mappedData.geburtsort,
        'Telefon': mappedData.telefon,
        'E-Mail': mappedData.email,
        'Familienstand': mappedData.familienstand,
        'Berufsstatus': mappedData.berufsstatus,
    };

    const missingFields = Object.entries(requiredFields)
        .filter(([, value]) => !value)
        .map(([label]) => label);

    if (missingFields.length > 0) {
        console.warn(`Missing fields for Insolvenzantrag: ${missingFields.join(', ')}`);
    }

    mappedData._missingFields = missingFields;

    return mappedData;
}

// Enhanced PDF filling function with automatic checkbox application
async function fillInsolvenzantragWithCheckboxes(formData, originalPdfPath) {
    // First, fill the basic form fields (personal data, employment, marital status)
    const filledPdfBytes = await QuickFieldMapper.fillWithRealFields(formData, originalPdfPath);

    // Always apply structural checkboxes (Antrag, Restschuldbefreiung, etc.)
    // Pass pfändbares Einkommen flag to additionally check Kontrollkästchen 32a
    try {
        const finalPdfBytes = await INSOLVENZANTRAG_CONFIG.applyDefaultCheckboxesToPdf(
            filledPdfBytes,
            !!formData.has_pfaendbares_einkommen
        );
        return finalPdfBytes;
    } catch (error) {
        console.error('Error applying structural checkboxes, using basic form:', error.message);
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

        // ------------------- 💰 FINANCIAL DATA + FAMILIENSTAND -------------------
        // Build combined data: financial_data + top-level familienstand
        const financialDataForPdf = {
            ...(client.financial_data || {}),
            // Ensure marital_status is set from whichever source has it
            marital_status: client.financial_data?.marital_status || client.familienstand || '',
            number_of_children: client.financial_data?.number_of_children || client.kinder_anzahl || 0,
        };
        await fillFinancialData(pdfDoc, form, financialDataForPdf, options);

        const creditors = client.final_creditor_list || [];
        if (Array.isArray(creditors) && creditors.length > 0) {
            await fillAnlage6(pdfDoc, form, creditors, options);
            await fillAnlage7(pdfDoc, form, creditors, { ...options, basePdfBytes: pdfBytes });
            await fillAnlage7A(pdfDoc, form, creditors, client, options);
        }

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
    // Anlage 6 has 2 pages with pre-existing fields:
    // Page 1: Textfeld 423-534 (14 rows, 8 fields per row)
    // Page 2: Textfeld 535-632 (up to 13 rows) + Textfeld 633 (Ort/Datum)
    const page1Start = Number(options.anlage6Start ?? 423);
    const page2Start = 535;
    const fieldsPerRow = 8;
    const maxRowsPage1 = 14;
    const maxRowsPage2 = 13;
    const maxTotal = maxRowsPage1 + maxRowsPage2; // 27 rows across both pages

    for (let i = 0; i < creditors.length && i < maxTotal; i++) {
        const creditor = creditors[i];
        const principal = Number(creditor.claim_amount ?? creditor.amount ?? 0);

        // Determine field start for this row
        let rowFieldStart;
        if (i < maxRowsPage1) {
            rowFieldStart = page1Start + (i * fieldsPerRow);
        } else {
            rowFieldStart = page2Start + ((i - maxRowsPage1) * fieldsPerRow);
        }

        // Column mapping:
        // +0: lfd. Nr.
        // +1: Name/Kurzbezeichnung des Gläubigers
        // +2: Hauptforderung in EUR
        // +3: Zinsen — Höhe in EUR
        // +4: Zinsen — berechnet bis zum
        // +5: Kosten in EUR
        // +6: Forderungsgrund
        // +7: Summe aller Forderungen in EUR
        const rowData = [
            `${i + 1}.`,                                                    // lfd. Nr.
            creditor.sender_name || creditor.name || 'Unbekannt',           // Name
            `${principal.toFixed(2)}`,                                      // Hauptforderung
            '',                                                             // Zinsen Höhe (nicht getrackt)
            '',                                                             // Zinsen berechnet bis (nicht getrackt)
            '',                                                             // Kosten (nicht getrackt)
            creditor.reference_number || '',                                // Forderungsgrund
            `${principal.toFixed(2)}`,                                      // Summe (= Hauptforderung)
        ];

        for (let f = 0; f < fieldsPerRow; f++) {
            const fieldName = `Textfeld ${rowFieldStart + f}`;
            try {
                form.getTextField(fieldName).setText(rowData[f]);
            } catch {}
        }
    }

    // Fill Textfeld 633 (Ort, Datum) on page 2
    try {
        const currentDate = new Date().toLocaleDateString('de-DE');
        form.getTextField('Textfeld 633').setText(currentDate);
    } catch {}
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
// Parse creditor address into street+nr and plz+city
function parseCreditorAddress(creditor) {
    let streetLine = '';
    let plzOrt = '';

    if (creditor.sender_address) {
        const m = creditor.sender_address.match(/^(.+?)\s+(\d+[a-zA-Z\-\/]*),?\s*(\d{5})\s+(.+)$/);
        if (m) {
            streetLine = `${m[1].trim()} ${m[2].trim()}`;
            plzOrt = `${m[3].trim()} ${m[4].trim()}`;
        } else {
            // Fallback: use as-is
            streetLine = creditor.sender_address;
        }
    }
    return { streetLine, plzOrt };
}

async function fillAnlage7(pdfDoc, form, creditors, options = {}) {
    // Anlage 7 layout:
    // Page 1 (page index 25): 3 creditor blocks, start Textfeld 643, 11 fields each, NO lfd. Nr. field
    // Page 2 (page index 26): 6 creditor blocks, start Textfeld 676, 12 fields each (1 lfd.Nr + 11 data)
    // Total: 9 creditors on 2 pre-existing pages

    const page1Start = 643;    // First creditor block on page 1
    const page1Gap = 11;       // Fields per block on page 1
    const page1Slots = 3;

    const page2Start = 676;    // First creditor block on page 2
    const page2Gap = 12;       // Fields per block on page 2 (includes lfd. Nr.)
    const page2Slots = 6;

    const totalDebt = creditors.reduce((sum, c) => {
        const amt = parseFloat(c.claim_amount || c.amount || 0);
        return sum + (isNaN(amt) ? 0 : amt);
    }, 0);

    for (let i = 0; i < creditors.length && i < page1Slots + page2Slots; i++) {
        const creditor = creditors[i];
        const claimAmount = parseFloat(creditor.claim_amount || creditor.amount || 0) || 0;
        const percentage = totalDebt > 0 ? ((claimAmount / totalDebt) * 100).toFixed(2) : '0.00';
        const { streetLine, plzOrt } = parseCreditorAddress(creditor);
        const displayName = creditor.glaeubiger_name || creditor.sender_name || creditor.name || 'Unbekannt';

        if (i < page1Slots) {
            // Page 1: 11 fields per block, no lfd. Nr. field
            const base = page1Start + (i * page1Gap);
            const fields = {
                [base]:     displayName,                                            // Name
                [base + 1]: streetLine,                                             // Straße, Hausnummer
                [base + 2]: plzOrt,                                                 // PLZ, Ort
                [base + 3]: creditor.reference_number || '',                        // Geschäftszeichen
                [base + 4]: creditor.is_representative ? (creditor.actual_creditor || '') : '', // gesetzl. vertreten durch
                [base + 5]: '',                                                     // Bevollmächtigter Name
                [base + 6]: '',                                                     // Bevollmächtigter Straße
                [base + 7]: '',                                                     // Bevollmächtigter PLZ/Ort
                [base + 8]: '',                                                     // Bevollmächtigter Geschäftszeichen
                [base + 9]: `${claimAmount.toFixed(2)}`,                            // Summe EUR
                [base + 10]: `${percentage}%`,                                      // Anteil %
            };
            for (const [fn, val] of Object.entries(fields)) {
                try { form.getTextField(`Textfeld ${fn}`).setText(val); } catch {}
            }
        } else {
            // Page 2: 12 fields per block (lfd. Nr. + 11 data)
            const blockIdx = i - page1Slots;
            const base = page2Start + (blockIdx * page2Gap);
            const fields = {
                [base]:      `${i + 1}.`,                                            // lfd. Nr.
                [base + 1]:  displayName,                                            // Name
                [base + 2]:  streetLine,                                             // Straße, Hausnummer
                [base + 3]:  plzOrt,                                                 // PLZ, Ort
                [base + 4]:  creditor.reference_number || '',                        // Geschäftszeichen
                [base + 5]:  creditor.is_representative ? (creditor.actual_creditor || '') : '', // gesetzl. vertreten
                [base + 6]:  '',                                                     // Bevollmächtigter Name
                [base + 7]:  '',                                                     // Bevollmächtigter Straße
                [base + 8]:  '',                                                     // Bevollmächtigter PLZ/Ort
                [base + 9]:  '',                                                     // Bevollmächtigter Geschäftszeichen
                [base + 10]: `${claimAmount.toFixed(2)}`,                            // Summe EUR
                [base + 11]: `${percentage}%`,                                       // Anteil %
            };
            for (const [fn, val] of Object.entries(fields)) {
                try { form.getTextField(`Textfeld ${fn}`).setText(val); } catch {}
            }
        }

        console.log(`Anlage7 [${i + 1}]: ${creditor.sender_name} — ${claimAmount.toFixed(2)} EUR (${percentage}%)`);
    }

    if (creditors.length > page1Slots + page2Slots) {
        console.warn(`Anlage 7: ${creditors.length} creditors but only ${page1Slots + page2Slots} slots. ${creditors.length - page1Slots - page2Slots} creditors not shown.`);
    }
}

// Fill Anlage 7A — Schuldenbereinigungsplan Besonderer Teil (Musterplan mit flexiblen Raten)
async function fillAnlage7A(pdfDoc, form, creditors, client, options = {}) {
    const pfaendbar = client.debt_settlement_plan?.pfaendbar_amount
        || client.financial_data?.pfaendbar_amount
        || client.calculated_settlement_plan?.garnishable_amount
        || client.second_letter_financial_snapshot?.garnishable_amount
        || 0;
    const isNullplan = pfaendbar < 1;
    const totalDebt = creditors.reduce((s, c) => s + (parseFloat(c.claim_amount || c.amount || 0) || 0), 0);
    const laufzeitMonate = 36;
    const startDatum = '01.05.2026'; // TODO: make dynamic
    const fullName = `${client.vorname || client.firstName || ''} ${client.nachname || client.lastName || ''}`;
    const sbpDatum = client.debt_settlement_plan?.created_at
        ? new Date(client.debt_settlement_plan.created_at).toLocaleDateString('de-DE')
        : new Date().toLocaleDateString('de-DE');

    // Header
    try { form.getTextField('Textfeld 1002').setText(fullName); } catch {}
    try { form.getTextField('Textfeld 1003').setText(sbpDatum); } catch {}
    try { form.getTextField('Textfeld 1005').setText(`${totalDebt.toFixed(2)}`); } catch {}
    try { form.getTextField('Textfeld 1006').setText(isNullplan ? '0,00' : `${pfaendbar.toFixed(2)}`); } catch {}
    try { form.getTextField('Textfeld 1305').setText(`${laufzeitMonate}`); } catch {}
    try { form.getTextField('Textfeld 1007').setText('1.'); } catch {}
    try { form.getTextField('Textfeld 1009').setText(startDatum); } catch {}

    // Creditor rows: Page 1 = 5 rows start 1010, Page 2 = 17 rows start 1060, gap 10
    const page1Start = 1010, page2Start = 1060, gap = 10, page1Slots = 5;
    const maxSlots = page1Slots + 17; // 22 total

    for (let i = 0; i < creditors.length && i < maxSlots; i++) {
        const cr = creditors[i];
        const amt = parseFloat(cr.claim_amount || cr.amount || 0) || 0;
        const anteilPct = totalDebt > 0 ? (amt / totalDebt) * 100 : 0;
        const monatlicheRate = isNullplan ? 0 : (pfaendbar * anteilPct / 100);

        const base = i < page1Slots
            ? page1Start + (i * gap)
            : page2Start + ((i - page1Slots) * gap);

        const vals = [
            `${i + 1}.`,
            cr.sender_name || cr.name || 'Unbekannt',
            `${amt.toFixed(2)}`,
            '', '', '',                                     // Zinsen, Zinsen bis, Kosten
            `${laufzeitMonate}`,                            // Anzahl Raten
            `${monatlicheRate.toFixed(2)} EUR`,             // p.m. Betrag
            startDatum,                                      // erstmals am
            `${anteilPct.toFixed(2)}%`,                     // Anteil %
        ];

        vals.forEach((v, j) => {
            try { form.getTextField(`Textfeld ${base + j}`).setText(v); } catch {}
        });
    }
}

// Helper: check a specific widget in a multi-widget checkbox field
// Reads the actual appearance state names from the widget (not guessing 'Yes'/'On')
function setMultiWidgetCheckbox(form, fieldName, targetWidgetIndex, debugLabel = '') {
    let field;
    try {
        field = form.getFieldMaybe(fieldName) || form.getCheckBox(fieldName);
    } catch { }
    if (!field) {
        console.warn(`${fieldName} not found`);
        return;
    }

    const acroField = field.acroField;
    const widgets = acroField.getWidgets() || [];

    // Uncheck all widgets
    for (const widget of widgets) {
        try { widget.setAppearanceState(PDFName.of('Off')); } catch {}
    }

    if (targetWidgetIndex < 0 || targetWidgetIndex >= widgets.length) {
        console.warn(`${fieldName}: no widget for index ${targetWidgetIndex} (${debugLabel})`);
        return;
    }

    const targetWidget = widgets[targetWidgetIndex];

    // Find the "on" state name from the widget's appearance dictionary
    const appearances = targetWidget.getAppearances();
    const normalDict = appearances?.normal;
    let onStateName = null;

    if (normalDict && typeof normalDict.keys === 'function') {
        for (const key of normalDict.keys()) {
            const name = key.toString().replace(/^\//, '');
            if (name !== 'Off') {
                onStateName = name;
                break;
            }
        }
    }

    if (!onStateName) {
        // Fallback: try common names
        onStateName = 'Yes';
    }

    try {
        targetWidget.setAppearanceState(PDFName.of(onStateName));
        // For multi-widget fields, set the value directly on the acroField dict
        // (acroField.setValue with PDFName fails for radio-button-style checkboxes)
        try {
            acroField.dict.set(PDFName.of('V'), PDFName.of(onStateName));
        } catch {}
        console.log(`Checked ${fieldName} widget ${targetWidgetIndex} "${onStateName}" (${debugLabel})`);
    } catch (err) {
        console.warn(`Failed to check ${fieldName} widget ${targetWidgetIndex}:`, err.message);
    }
}

async function fillFinancialData(pdfDoc, form, financialData = {}, options = {}) {
    const targetIndex = Number(options.financialPageIndex ?? 3); // page 4 (0-based index = 3)
    const targetPage = pdfDoc.getPage(targetIndex); // ensure page is loaded and keep ref

    if (!financialData || typeof financialData !== 'object') {
        console.warn("⚠️ No financial data found on client.financial_data");
        return;
    }

    console.log(`📄 Filling financial data on page index ${targetIndex}`);

    // Helper: normalize children count from various possible keys
    const getChildrenCount = () => {
        const candidates = [
            financialData.number_of_children,
            financialData.kinder_anzahl,
            financialData.children,
            financialData.dependent_children_count
        ];
        for (const v of candidates) {
            const n = Number(v);
            if (!isNaN(n) && n >= 0) return n;
        }
        return 0;
    };

    const childrenCount = getChildrenCount();

    // --- Fill Textfeld 46 ---
    try {
        const field46 = form.getTextField('Textfeld 46');
        if (field46) {
            field46.setText(childrenCount > 0 ? String(childrenCount) : '');
            console.log(`✅ Filled Textfeld 46 with "${childrenCount}"`);
        }
    } catch (err) {
        console.error('❌ Error filling Textfeld 46:', err.message);
    }


    // --- Handle Kontrollkästchen 23 (seven widgets for marital status) ---
    try {
        const maritalStatus = (financialData.marital_status || '').toString().toLowerCase().trim();

        // Map familienstand values to widget index (0-based)
        const statusMap = {
            'ledig': 0, 'single': 0,
            'verheiratet': 1, 'married': 1,
            'eingetragene lebenspartnerschaft': 2, 'eingetragene_lebenspartnerschaft': 2,
            'lebenspartnerschaft': 2, 'registered partnership': 2,
            'beendet': 3, 'beendet seit': 3, 'partnership ended': 3,
            'geschieden': 4, 'divorced': 4,
            'getrennt lebend': 5, 'getrennt_lebend': 5, 'separated': 5,
            'verwitwet': 6, 'widowed': 6,
        };

        const targetIdx = statusMap[maritalStatus] ?? -1;

        setMultiWidgetCheckbox(form, 'Kontrollkästchen 23', targetIdx, maritalStatus);
    } catch (err) {
        console.error('Error handling Kontrollkästchen 23:', err.message);
    }

    // --- Handle Kontrollkästchen 24 (children: widget 0 = no, widget 1 = yes) ---
    try {
        const targetIdx = childrenCount > 0 ? 1 : 0;
        setMultiWidgetCheckbox(form, 'Kontrollkästchen 24', targetIdx, `children=${childrenCount}`);
    } catch (err) {
        console.error('Error handling Kontrollkästchen 24:', err.message);
    }

    // --- Handle Kontrollkästchen 33 (Anlage 2 Ja/Nein: widget 0 = Ja, widget 1 = Nein) ---
    try {
        setMultiWidgetCheckbox(form, 'Kontrollkästchen 33', 0, 'Anlage 2 Bescheinigung = Ja');
    } catch (err) {
        console.error('Error handling Kontrollkästchen 33:', err.message);
    }

    // --- Kontrollkästchen 37 (widget 0 = "nicht") — immer aktiviert ---
    try {
        setMultiWidgetCheckbox(form, 'Kontrollkästchen 37', 0, 'nicht');
    } catch (err) {
        console.error('Error handling Kontrollkästchen 37:', err.message);
    }

    // --- Kontrollkästchen 38 (widget 1 = "nicht aussichtsreich") — immer aktiviert ---
    try {
        setMultiWidgetCheckbox(form, 'Kontrollkästchen 38', 1, 'nicht aussichtsreich');
    } catch (err) {
        console.error('Error handling Kontrollkästchen 38:', err.message);
    }

    // --- Kontrollkästchen 361 (widget 0 = "monatlich zum") — Zahlungsweise ---
    try {
        setMultiWidgetCheckbox(form, 'Kontrollkästchen 361', 0, 'monatlich zum');
    } catch (err) {
        console.error('Error handling Kontrollkästchen 361:', err.message);
    }

    // --- Regenerate appearances ---
    try {
        const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
        form.updateFieldAppearances(font);
        console.log('🖼️ Updated field appearances');
    } catch (err) {
        console.warn(`⚠️ Could not regenerate field appearances: ${err.message}`);
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

    // Check financial data — accept any of these as proof that financial info exists
    const hasFinancialData = client.financial_data?.completed ||
        client.financial_data?.client_form_filled ||
        client.financial_data?.monthly_net_income > 0 ||
        client.calculated_settlement_plan ||
        client.second_letter_financial_snapshot?.calculation_status === 'completed' ||
        client.second_letter_status === 'SENT';
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
        if (formData._missingFields?.length > 0) {
            res.setHeader('X-Missing-Fields', JSON.stringify(formData._missingFields));
        }
        res.send(Buffer.from(mergedPdfBytes));

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
                hasFinancialData: !!(client.financial_data?.completed || client.financial_data?.client_form_filled || client.financial_data?.monthly_net_income > 0 || client.calculated_settlement_plan || client.second_letter_financial_snapshot?.calculation_status === 'completed' || client.second_letter_status === 'SENT'),
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