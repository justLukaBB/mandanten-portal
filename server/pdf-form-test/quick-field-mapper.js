const { PDFDocument } = require('pdf-lib');
const fs = require('fs').promises;
const path = require('path');

class QuickFieldMapper {
    /**
     * NEW TEMPLATE - Updated field mapping based on "New Docus.pdf" analysis
     * Generated on 29.9.2025 - Complete field structure rewrite
     */
    static getUpdatedFieldMapping() {
        return {
            // MAIN IDENTIFICATION FIELDS (Page 1) - Based on new template structure
            'vorname_name': 'Textfeld 1',                    // "Vorname und Name" 
            'vollstaendige_adresse': 'Textfeld 2',           // "Straße und Hausnummer"
            'plz_ort_kombiniert': 'Textfeld 3',              // "Postleitzahl und Ort"
            'telefon': 'Textfeld 4',                         // "Telefon tagsüber"
            'anwalt_name': 'Textfeld 5',                     // "Verfahrensbevollmächtigte(r)"
            'amtsgericht': 'Textfeld 16',                    // "An das Amtsgericht– Insolvenzgericht – in"
            
            // PERSONAL DATA SECTION - Correct field mappings from template
            'vorname': 'Textfeld 27',                        // "Vorname(n)" 
            'nachname': 'Textfeld 25',                       // "Name"
            'akademischer_grad': 'Textfeld 26',              // "Akademischer Grad" ✅
            'geburtsdatum': 'Textfeld 30',                   // "Geburtsdatum" ✅
            'geburtsort': 'Textfeld 31',                     // "Geburtsort" ✅
            
            // ADDRESS DETAILS - New template structure
            'strasse': 'Textfeld 32',                        // "Wohnanschrift Straße"
            'hausnummer': 'Textfeld 33',                     // "Hausnummer"
            'plz': 'Textfeld 34',                           // "Postleitzahl"
            'ort': 'Textfeld 35',                           // "Ort"
            
            // CONTACT INFORMATION - Updated mappings  
            'telefon': 'Textfeld 4',                        // "Telefon tagsüber" ✅
            'telefon_privat': 'Textfeld 36',                 // "Telefon (privat)" ✅
            'telefon_mobil': 'Textfeld 37',                  // "Mobil Telefon" ✅
            'email': 'Textfeld 39',                          // "E-mail"
            'anwalt_name': 'Textfeld 5',                     // "Verfahrensbevollmächtigte(r)" ✅
            
            // PROFESSIONAL INFORMATION - New fields from template
            'erlernter_beruf': 'Textfeld 48',               // "Erlernter Beruf" ✅
            'aktuelle_taetigkeit': 'Textfeld 49',           // "Zurzeit oder zuletzt tätig als" ✅
            'berufliche_taetigkeit': 'Textfeld 278',        // "Berufliche Tätigkeit" ✅
            
            // SETTLEMENT PLAN INFORMATION - Key new mappings
            'außergerichtlicher_plan_datum': 'Textfeld 80', // "außergerichtlicher Plan (Datum)"
            'scheiterung_datum': 'Textfeld 82',             // "Datum (Scheiterung)"
            'unterschrift_ort_datum': 'Textfeld 83',        // "(Ort, Datum)"
            'unterschrift_name': 'Textfeld 84',             // "Vorname Name" (Unterschrift)
            
            // CREDITOR STATISTICS - Section 18: Scheitern des Einigungsversuchs
            'nicht_alle_zugestimmt': 'Kontrollkästchen 35', // "Nicht alle Gläubiger haben zugestimmt"
            // 1. Anteil der zustimmenden Gläubiger nach Köpfen:
            'anzahl_glaeubiger_zugestimmt': 'Textfeld 85',  // X Gläubiger (zugestimmt)
            'anzahl_glaeubiger': 'Textfeld 86',             // von Y Gläubigern (gesamt)
            // 2. Anteil der zustimmenden Gläubiger nach Summen:
            'summe_zugestimmt': 'Textfeld 87',              // X EUR (zugestimmt)
            'summe_gesamt': 'Textfeld 88',                  // von Y EUR (gesamt)
            // 3. Anteil der Gläubiger ohne Rückäußerung:
            'anzahl_ohne_antwort': 'Textfeld 89',           // X Gläubiger (ohne Rückäußerung)
            'anzahl_ohne_antwort_von_gesamt': 'Textfeld 90', // von Y Gläubigern (gesamt)
            // Gründe für Ablehnung:
            'ablehnungsgruende': 'Textfeld 91',             // Freitext
            
            // SETTLEMENT PLAN DATES - Multiple instances throughout document  
            'schuldenbereinigungsplan_datum': 'Textfeld 642',  // "Datum des Schuldenbereinigungsplans:"
            
            // SECTION 13: VERFAHRENSBEVOLLMÄCHTIGTE(R) — Textfeld 55-68
            'bevollm_name': 'Textfeld 55',                  // Name
            'bevollm_akad_grad': 'Textfeld 56',             // Akademischer Grad
            'bevollm_vorname': 'Textfeld 57',               // Vorname
            'bevollm_beruf': 'Textfeld 58',                 // Beruf
            'bevollm_bezeichnung': 'Textfeld 59',           // ggf. Bezeichnung der geeigneten Stelle
            'bevollm_strasse': 'Textfeld 60',               // Straße
            'bevollm_hausnummer': 'Textfeld 61',            // Hausnummer
            'bevollm_plz': 'Textfeld 62',                   // Postleitzahl
            'bevollm_ort': 'Textfeld 63',                   // Ort
            'bevollm_telefon': 'Textfeld 64',               // Telefon
            'bevollm_telefax': 'Textfeld 65',               // Telefax
            'bevollm_email': 'Textfeld 66',                 // E-Mail
            'bevollm_geschaeftszeichen': 'Textfeld 67',     // Geschäftszeichen (Aktenzeichen)
            'bevollm_sachbearbeiter': 'Textfeld 68',         // Sachbearbeiter(in)
            // Vollmacht-Checkbox
            'bevollm_verfahren_insgesamt': 'Kontrollkästchen 31u', // für das Verfahren insgesamt

            // LEGAL REPRESENTATIVE DETAILS - other sections throughout document
            'anwalt_vorname_name': 'Textfeld 69',           // "Vorname Name" (Anwalt)
            'anwalt_name_detail': 'Textfeld 70',            // "Rechtsanwalt Thomas Scuric"
            'anwalt_strasse': 'Textfeld 71',                // "Bongardstraße"
            'anwalt_hausnummer': 'Textfeld 72',             // "33"
            'anwalt_plz': 'Textfeld 73',                    // "44787"
            'anwalt_ort': 'Textfeld 74',                    // "Bochum"
            
            // ADDITIONAL SETTLEMENT DATES - Multiple instances
            'schuldenbereinigungsplan_datum_2': 'Textfeld 1231', // "Datum des Schuldenbereinigungsplans:"
            'schuldenbereinigungsplan_datum_3': 'Textfeld 1234', // "Datum des Schuldenbereinigungsplans:"
            
            // SIGNATURE FIELDS - Date and location for signatures
            'datum_unterschrift': 'Textfeld 22',            // "(Ort, Datum)"
            
            // REPEATED NAME FIELDS - COMPLETE SET from Ultra Deep Analysis
            'name_field_main': 'Textfeld 1',                // "Vorname und Name" ✨ MISSING
            'nachname_standalone': 'Textfeld 25',           // "Name" ✨ MISSING  
            'vorname_standalone': 'Textfeld 27',            // "Vorname(n)" ✨ MISSING
            'anwalt_name_field': 'Textfeld 69',             // "Vorname Name" (Anwalt) ✨ MISSING
            'unterschrift_name_field': 'Textfeld 84',       // "Vorname Name" (Unterschrift) ✨ MISSING
            'name_field_1': 'Textfeld 24',                  // "Vorname Name"
            'name_field_2': 'Textfeld 97',                  // "Vorname Name" 
            'name_field_3': 'Textfeld 153',                 // "Vorname Name"
            'name_field_4': 'Textfeld 196',                 // "Vorname Name"
            'name_field_5': 'Textfeld 215',                 // "Vorname Name"
            'name_field_6': 'Textfeld 234',                 // "Vorname Name"
            'name_field_7': 'Textfeld 256',                 // "Vorname Name"
            'name_field_8': 'Textfeld 272',                 // "Vorname Name"
            'name_field_9': 'Textfeld 347',                 // "Vorname Name"
            'name_field_10': 'Textfeld 364',                // "Vorname Name"
            'name_field_11': 'Textfeld 394',                // "Vorname Name"
            'name_field_12': 'Textfeld 421',                // "Vorname Name"
            'name_field_13': 'Textfeld 634',                // "Vorname Name"
            'name_field_14': 'Textfeld 748',                // "Vorname Name"
            'name_field_15': 'Textfeld 1002',               // "Vorname Name"
            'name_field_16': 'Textfeld 1230',               // "Vorname Name"
            'name_field_17': 'Textfeld 1233',               // "Vorname Name"
            'name_field_18': 'Textfeld 99',                 // "Vorname Name" ✨ MISSING FIELD
            
            // ADDITIONAL ADDRESS FIELDS - For document consistency
            'adresse_strasse_hausnummer': 'Textfeld 636',   // "Straße und Hausnummer"
            'adresse_plz_ort': 'Textfeld 637',              // "Postleitzahl und Ort"
            'vollname_alt': 'Textfeld 635',                 // "Vormame und Name"
            
            // EMPLOYMENT STATUS CHECKBOXES — currently disabled (not needed in Insolvenzantrag)
            // 'employment_angestellt': 'Kontrollkästchen 62',
            // 'employment_selbstaendig': 'Kontrollkästchen 63',
            // 'employment_arbeitslos': 'Kontrollkästchen 64',
            // 'employment_rentner': 'Kontrollkästchen 65',

            // FAMILIENSTAND date fields (Kontrollkästchen 23 widgets are set in fillFinancialData)
            'familienstand_seit_verheiratet': 'Textfeld 40',               // verheiratet seit
            'familienstand_seit_lebenspartnerschaft': 'Textfeld 41',       // eingetragene Lebenspartnerschaft begruendet seit
            'familienstand_seit_beendet': 'Textfeld 42',                   // (Lebenspartnerschaft) beendet seit
            'familienstand_seit_geschieden': 'Textfeld 43',                // geschieden seit
            'familienstand_seit_getrennt': 'Textfeld 44',                  // getrennt lebend seit
            'familienstand_seit_verwitwet': 'Textfeld 45',                 // verwitwet seit
        };
    }

    /**
     * Fill PDF with real field names and handle both text and checkboxes
     */
    static async fillWithRealFields(formData, originalPdfPath) {
        try {
            console.log('🔄 Loading original PDF with real field mapping...');
            
            const existingPdfBytes = await fs.readFile(originalPdfPath);
            const pdfDoc = await PDFDocument.load(existingPdfBytes);
            const form = pdfDoc.getForm();
            
            // Prepare complete data for NEW TEMPLATE
            const completeData = { ...formData };
            
            // NEW TEMPLATE - Computed fields based on template analysis
            completeData.vorname_name = `${formData.nachname || ''}, ${formData.vorname || ''}`;  // Textfeld 1
            completeData.vollstaendige_adresse = `${formData.strasse || ''} ${formData.hausnummer || ''}`;  // Textfeld 2
            completeData.plz_ort_kombiniert = `${formData.plz || ''} ${formData.ort || ''}`;  // Textfeld 3
            
            // Fill ALL name fields throughout the document - COMPLETE SET from Ultra Deep Analysis
            const fullName = `${formData.vorname || ''} ${formData.nachname || ''}`;
            
            // NEW MISSING NAME FIELDS ✨
            completeData.name_field_main = `${formData.nachname || ''}, ${formData.vorname || ''}`;  // Textfeld 1 - "Vorname und Name" (Last, First format)
            completeData.nachname_standalone = formData.nachname || '';     // Textfeld 25 - "Name" 
            completeData.vorname_standalone = formData.vorname || '';       // Textfeld 27 - "Vorname(n)"
            completeData.anwalt_name_field = fullName;      // Textfeld 69 - Mandantenname (Anlage 2)
            completeData.unterschrift_name_field = fullName;                // Textfeld 84 - "Vorname Name" (Unterschrift)
            
            // EXISTING NAME FIELDS (keep all)
            completeData.name_field_1 = fullName;   // Textfeld 24
            completeData.name_field_2 = fullName;   // Textfeld 97
            completeData.name_field_3 = fullName;   // Textfeld 153
            completeData.name_field_4 = fullName;   // Textfeld 196
            completeData.name_field_5 = fullName;   // Textfeld 215
            completeData.name_field_6 = fullName;   // Textfeld 234
            completeData.name_field_7 = fullName;   // Textfeld 256
            completeData.name_field_8 = fullName;   // Textfeld 272
            completeData.name_field_9 = fullName;   // Textfeld 347
            completeData.name_field_10 = fullName;  // Textfeld 364
            completeData.name_field_11 = fullName;  // Textfeld 394
            completeData.name_field_12 = fullName;  // Textfeld 421
            completeData.name_field_13 = fullName;  // Textfeld 634
            completeData.name_field_14 = fullName;  // Textfeld 748
            completeData.name_field_15 = fullName;  // Textfeld 1002
            completeData.name_field_16 = fullName;  // Textfeld 1230
            completeData.name_field_17 = fullName;  // Textfeld 1233
            completeData.name_field_18 = fullName;  // Textfeld 99 ✨ NEW FIELD
            
            // Additional address fields for consistency
            completeData.adresse_strasse_hausnummer = `${formData.strasse || ''} ${formData.hausnummer || ''}`;  // Textfeld 636
            completeData.adresse_plz_ort = `${formData.plz || ''} ${formData.ort || ''}`;  // Textfeld 637
            completeData.vollname_alt = fullName;  // Textfeld 635
            
            // Date fields - use current date where appropriate
            const currentDate = new Date().toLocaleDateString('de-DE');
            completeData.datum_unterschrift = currentDate;  // Textfeld 22
            completeData.unterschrift_ort_datum = `${formData.ort || ''}, ${currentDate}`;  // Textfeld 83
            completeData.unterschrift_name = fullName;  // Textfeld 84
            
            // Settlement plan information if available
            if (formData.schuldenbereinigungsplan_datum) {
                completeData.schuldenbereinigungsplan_datum = formData.schuldenbereinigungsplan_datum;  // Textfeld 642
            }
            
            // Creditor statistics if available
            if (formData.anzahl_glaeubiger) {
                const totalCreditors = String(formData.anzahl_glaeubiger);
                const zugestimmt = Number(formData.anzahl_glaeubiger_zugestimmt || 0);
                const gesamt = Number(formData.anzahl_glaeubiger);

                completeData.anzahl_glaeubiger = totalCreditors;                                     // Textfeld 86
                completeData.anzahl_glaeubiger_zugestimmt = String(zugestimmt);                      // Textfeld 85
                completeData.anzahl_ohne_antwort = String(formData.anzahl_ohne_antwort || 0);        // Textfeld 89
                completeData.anzahl_ohne_antwort_von_gesamt = totalCreditors;                        // Textfeld 90 — "von X Gläubigern"
                completeData.ablehnungsgruende = formData.ablehnungsgruende || '';                   // Textfeld 91

                // Kontrollkästchen 35: "Nicht alle Gläubiger haben zugestimmt"
                completeData.nicht_alle_zugestimmt = zugestimmt < gesamt;
            }
            if (formData.gesamtschuldensumme) {
                completeData.summe_gesamt = String(formData.gesamtschuldensumme);  // Textfeld 88
                completeData.summe_zugestimmt = String(formData.summe_zugestimmt || formData.gesamtschuldensumme);  // Textfeld 87
            }
            
            // Personal information — use real data, leave empty if not available
            completeData.telefon = formData.telefon || '';
            completeData.telefon_privat = formData.telefon || formData.telefon_privat || '';
            completeData.anwalt_name = formData.anwalt_name || '';
            completeData.geburtsort = formData.geburtsort || '';
            completeData.telefon_mobil = formData.telefon_mobil || formData.mobiltelefon || '';
            completeData.akademischer_grad = formData.akademischer_grad || '';
            completeData.geburtsdatum = formData.geburtsdatum || '';

            // Professional information — use real data from client
            completeData.erlernter_beruf = formData.erlernter_beruf || '';
            completeData.aktuelle_taetigkeit = formData.derzeitige_taetigkeit || formData.aktuelle_taetigkeit || '';
            completeData.berufliche_taetigkeit = formData.beschaeftigungsart || formData.berufliche_taetigkeit || '';
            
            // Section 13: Verfahrensbevollmächtigte(r) — always Thomas Scuric
            completeData.bevollm_name = 'Scuric';
            completeData.bevollm_akad_grad = '';
            completeData.bevollm_vorname = 'Thomas';
            completeData.bevollm_beruf = 'Rechtsanwalt';
            completeData.bevollm_bezeichnung = '';
            completeData.bevollm_strasse = 'Bongardstraße';
            completeData.bevollm_hausnummer = '33';
            completeData.bevollm_plz = '44787';
            completeData.bevollm_ort = 'Bochum';
            completeData.bevollm_telefon = '0234 9136810';
            completeData.bevollm_telefax = '';
            completeData.bevollm_email = 'info@ra-scuric.de';
            completeData.bevollm_geschaeftszeichen = formData.aktenzeichen || '';
            completeData.bevollm_sachbearbeiter = '';
            completeData.bevollm_verfahren_insgesamt = true;  // Kontrollkästchen 31u — immer an

            // Legal representative in other sections throughout document
            completeData.anwalt_vorname_name = fullName;  // Textfeld 69 — Mandantenname (Anlage 2 Kopf)
            completeData.anwalt_name_detail = 'Rechtsanwalt Thomas Scuric';   // Textfeld 70
            completeData.anwalt_strasse = 'Bongardstraße';   // Textfeld 71
            completeData.anwalt_hausnummer = '33';            // Textfeld 72
            completeData.anwalt_plz = '44787';                // Textfeld 73
            completeData.anwalt_ort = 'Bochum';               // Textfeld 74
            
            // Settlement plan dates
            completeData.außergerichtlicher_plan_datum = formData.außergerichtlicher_plan_datum || currentDate;  // Textfeld 80
            completeData.scheiterung_datum = formData.scheiterung_datum || currentDate;  // Textfeld 82
            completeData.schuldenbereinigungsplan_datum_2 = completeData.schuldenbereinigungsplan_datum;  // Textfeld 1231
            completeData.schuldenbereinigungsplan_datum_3 = completeData.schuldenbereinigungsplan_datum;  // Textfeld 1234
            
            // EMPLOYMENT STATUS CHECKBOXES - Set based on client employment status
            const berufsstatus = formData.berufsstatus || formData.employment_status || '';
            
            // Set employment checkboxes (ensure they are boolean true for checking)
            completeData.employment_angestellt = (berufsstatus === 'angestellt' || berufsstatus === 'employed') ? true : false;
            completeData.employment_selbstaendig = (berufsstatus === 'selbstaendig' || berufsstatus === 'self-employed') ? true : false;
            completeData.employment_arbeitslos = (berufsstatus === 'arbeitslos' || berufsstatus === 'unemployed') ? true : false;
            completeData.employment_rentner = (berufsstatus === 'rentner' || berufsstatus === 'retired') ? true : false;
            
            // FAMILIENSTAND date fields — checkbox widget is set in fillFinancialData()
            const familienstand = formData.familienstand || '';
            const familienstandDatum = formData.familienstand_seit || '';

            // Fill the "seit" date field for the matching status
            if (familienstandDatum) {
                if (familienstand === 'verheiratet') completeData.familienstand_seit_verheiratet = familienstandDatum;
                if (familienstand === 'lebenspartnerschaft' || familienstand === 'eingetragene_lebenspartnerschaft') completeData.familienstand_seit_lebenspartnerschaft = familienstandDatum;
                if (familienstand === 'geschieden') completeData.familienstand_seit_geschieden = familienstandDatum;
                if (familienstand === 'getrennt_lebend') completeData.familienstand_seit_getrennt = familienstandDatum;
                if (familienstand === 'verwitwet') completeData.familienstand_seit_verwitwet = familienstandDatum;
            }

            // Main form checkboxes are handled by INSOLVENZANTRAG_CONFIG
            // Familienstand checkbox (Kontrollkästchen 23 widgets) is handled in fillFinancialData()
            
            console.log('📝 Filling PDF with real field names...');
            
            const fieldMapping = this.getUpdatedFieldMapping();
            let textFieldsFilled = 0;
            let checkboxesFilled = 0;
            let failedFields = 0;
            
            Object.entries(fieldMapping).forEach(([dataField, pdfFieldName]) => {
                try {
                    const value = completeData[dataField];
                    
                    // For checkboxes, allow boolean false values to be processed (for unchecking)
                    // For text fields, skip only if truly empty
                    const shouldProcess = pdfFieldName.includes('Kontrollkästchen') ? 
                        (value !== undefined && value !== null) : 
                        (value !== undefined && value !== null && value !== '');
                    
                    if (shouldProcess) {
                        if (pdfFieldName.includes('Kontrollkästchen')) {
                            // Checkbox
                            try {
                                const checkbox = form.getCheckBox(pdfFieldName);
                                if (value === true || value === 'true' || value === 'on') {
                                    checkbox.check();
                                    checkboxesFilled++;
                                    console.log(`  ✅ Checked: ${pdfFieldName} (${dataField}=${value})`);
                                } else {
                                    checkbox.uncheck();
                                    console.log(`  ⬜ Unchecked: ${pdfFieldName} (${dataField}=${value})`);
                                }
                            } catch (checkboxError) {
                                console.log(`  ⚠️  Checkbox not found: ${pdfFieldName}`);
                                failedFields++;
                            }
                        } else {
                            // Text field
                            try {
                                const textField = form.getTextField(pdfFieldName);
                                textField.setText(String(value));
                                textFieldsFilled++;
                                console.log(`  📝 Filled: ${pdfFieldName} = "${value}"`);
                            } catch (textError) {
                                console.log(`  ⚠️  Text field not found: ${pdfFieldName}`);
                                failedFields++;
                            }
                        }
                    } else {
                        // Empty value - explicitly clear the field to remove any pre-filled values from template
                        try {
                            const field = form.getField(pdfFieldName);
                            if (field.constructor.name === 'PDFCheckBox') {
                                field.uncheck();
                                console.log(`  🔲 Cleared checkbox: ${pdfFieldName} (${dataField})`);
                            } else {
                                const textField = form.getTextField(pdfFieldName);
                                textField.setText('');
                                console.log(`  🧹 Cleared text field: ${pdfFieldName} (${dataField})`);
                            }
                        } catch (clearError) {
                            console.log(`  ⏭️  Skipped: ${pdfFieldName} (${dataField}) - field not found or cannot clear`);
                        }
                    }
                } catch (error) {
                    console.warn(`  ❌ Error with ${pdfFieldName}:`, error.message);
                    failedFields++;
                }
            });
            
            console.log(`📊 Results: ${textFieldsFilled} text fields, ${checkboxesFilled} checkboxes, ${failedFields} failed`);

            // Regenerate field appearances so all viewers render the values
            try {
                const { StandardFonts } = require('pdf-lib');
                const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
                form.updateFieldAppearances(font);
            } catch (err) {
                console.warn('Could not update field appearances:', err.message);
            }

            console.log('💾 Generating improved PDF...');

            const filledPdfBytes = await pdfDoc.save();
            return filledPdfBytes;
            
        } catch (error) {
            console.error('❌ Error filling PDF with real fields:', error);
            throw error;
        }
    }
    
    /**
     * Set family status (exclusive)
     */
    static setFamilyStatus(data, status) {
        data.familienstand_ledig = (status === 'ledig');
        data.familienstand_verheiratet = (status === 'verheiratet');
        data.familienstand_geschieden = (status === 'geschieden');
        data.familienstand_verwitwet = (status === 'verwitwet');
    }
    
    /**
     * Set employment status (exclusive)
     */
    static setEmploymentStatus(data, status) {
        data.beruf_angestellt = (status === 'angestellt');
        data.beruf_selbstaendig = (status === 'selbstaendig');
        data.beruf_arbeitslos = (status === 'arbeitslos');
        data.beruf_rentner = (status === 'rentner');
    }

    /**
     * Set marital status (exclusive)
     */
    static setFamilienstand(data, status) {
        data.familienstand_ledig = (status === 'ledig');
        data.familienstand_verheiratet = (status === 'verheiratet');
        data.familienstand_lebenspartnerschaft = (status === 'lebenspartnerschaft' || status === 'eingetragene_lebenspartnerschaft');
        data.familienstand_geschieden = (status === 'geschieden');
        data.familienstand_getrennt_lebend = (status === 'getrennt_lebend');
        data.familienstand_verwitwet = (status === 'verwitwet');
    }
}

module.exports = QuickFieldMapper;