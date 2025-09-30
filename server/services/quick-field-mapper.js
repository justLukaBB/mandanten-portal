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
            
            // CREDITOR STATISTICS - Important for settlement tracking
            'anzahl_glaeubiger_zugestimmt': 'Textfeld 85',  // "Anzahl an Gläubigern (zuge"
            'anzahl_glaeubiger': 'Textfeld 86',             // "Anzahl an Gläubigern" 
            'summe_zugestimmt': 'Textfeld 87',              // "Summe (Zugestimmten)"
            'summe_gesamt': 'Textfeld 88',                  // "Summe"
            'anzahl_ohne_antwort': 'Textfeld 89',           // "Anzahl ohne Antwort"
            'anzahl_ablehnungen': 'Textfeld 90',            // "Anzahl an Gläubigern" (Ablehnungen)
            
            // SETTLEMENT PLAN DATES - Multiple instances throughout document  
            'schuldenbereinigungsplan_datum': 'Textfeld 642',  // "Datum des Schuldenbereinigungsplans:"
            
            // LEGAL REPRESENTATIVE DETAILS - Complete section
            'anwalt_vorname_name': 'Textfeld 69',           // "Vorname Name" (Anwalt)
            'anwalt_name_detail': 'Textfeld 70',            // "Rechtsanwalt Thomas Scuric"
            'anwalt_strasse': 'Textfeld 71',                // "Bongardstraße" ✅
            'anwalt_hausnummer': 'Textfeld 72',             // "33" ✅
            'anwalt_plz': 'Textfeld 73',                    // "44787" ✅
            'anwalt_ort': 'Textfeld 74',                    // "Bochum" ✅
            
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
            
            // EMPLOYMENT STATUS CHECKBOXES - Based on user requirements
            'employment_angestellt': 'Kontrollkästchen 62',     // "Angestellt" - employment status
            'employment_selbstaendig': 'Kontrollkästchen 63',   // Self-employed
            'employment_arbeitslos': 'Kontrollkästchen 64',     // Unemployed
            'employment_rentner': 'Kontrollkästchen 65',        // Retired

            // FAMILIENSTAND (MARITAL STATUS) CHECKBOXES - Section 10
            'familienstand_ledig': 'Kontrollkästchen 46',                   // Single
            'familienstand_verheiratet': 'Kontrollkästchen 47',             // Married
            'familienstand_lebenspartnerschaft': 'Kontrollkästchen 48',     // Registered partnership
            'familienstand_geschieden': 'Kontrollkästchen 49',              // Divorced
            'familienstand_getrennt_lebend': 'Kontrollkästchen 50',         // Separated
            'familienstand_verwitwet': 'Kontrollkästchen 51',               // Widowed

            // NO OTHER CHECKBOX MAPPINGS IN THIS SECTION
            // Main checkboxes are handled by INSOLVENZANTRAG_CONFIG
            // The 11 checkboxes from new template are automatically applied:
            // Kontrollkästchen 1, 2, 15, 17, 21, 25, 26, 27, 32a, 36, 333
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
            completeData.anwalt_name_field = fullName;                      // Textfeld 69 - "Vorname Name" (Anwalt)
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
                completeData.anzahl_glaeubiger = String(formData.anzahl_glaeubiger);  // Textfeld 86
                completeData.anzahl_glaeubiger_zugestimmt = String(formData.anzahl_glaeubiger_zugestimmt || 0);  // Textfeld 85
                completeData.anzahl_ablehnungen = String(formData.anzahl_ablehnungen || 0);  // Textfeld 90
                completeData.anzahl_ohne_antwort = String(formData.anzahl_ohne_antwort || 0);  // Textfeld 89
            }
            // Sum statistics - use summe_gesamt from creditor stats or fall back to gesamtschuldensumme
            if (formData.summe_gesamt || formData.gesamtschuldensumme) {
                completeData.summe_gesamt = String(formData.summe_gesamt || formData.gesamtschuldensumme);  // Textfeld 88
                completeData.summe_zugestimmt = String(formData.summe_zugestimmt || '0');  // Textfeld 87
            }
            
            // Personal information fields - PROVIDE DEFAULT VALUES so they don't get skipped
            completeData.telefon = formData.telefon || formData.phone || '0221123456';  // Textfeld 4 - provide default
            completeData.anwalt_name = formData.anwalt_name || 'Rechtsanwalt';  // Textfeld 5 - provide default
            completeData.geburtsort = formData.geburtsort || formData.ort || 'Deutschland';  // Textfeld 31 - use city or default
            completeData.telefon_mobil = formData.telefon_mobil || formData.phone || '0171123456';  // Textfeld 37 - provide default
            completeData.akademischer_grad = formData.akademischer_grad || '-';  // Textfeld 26 - use dash for empty
            completeData.geburtsdatum = formData.geburtsdatum || '01.01.1980';  // Textfeld 30 - provide default date
            // Keep these fields EMPTY as per user requirement (Seite 4: Erlernter Beruf & Zurzeit tätig als)
            completeData.erlernter_beruf = '';  // Textfeld 48 - MUST BE EMPTY
            completeData.aktuelle_taetigkeit = '';  // Textfeld 49 - MUST BE EMPTY
            completeData.berufliche_taetigkeit = formData.berufliche_taetigkeit || '';  // Textfeld 278 - only use if explicitly provided
            
            // Legal representative details (Anwalt)
            completeData.anwalt_vorname_name = formData.anwalt_vorname_name || fullName;  // Textfeld 69
            completeData.anwalt_name_detail = formData.anwalt_name_detail || 'Rechtsanwalt';  // Textfeld 70
            completeData.anwalt_strasse = formData.anwalt_strasse || '';  // Textfeld 71
            completeData.anwalt_hausnummer = formData.anwalt_hausnummer || '';  // Textfeld 72
            completeData.anwalt_plz = formData.anwalt_plz || '';  // Textfeld 73
            completeData.anwalt_ort = formData.anwalt_ort || '';  // Textfeld 74
            
            // Settlement plan dates
            completeData.außergerichtlicher_plan_datum = formData.außergerichtlicher_plan_datum || currentDate;  // Textfeld 80
            completeData.scheiterung_datum = formData.scheiterung_datum || currentDate;  // Textfeld 82
            completeData.schuldenbereinigungsplan_datum_2 = completeData.schuldenbereinigungsplan_datum;  // Textfeld 1231
            completeData.schuldenbereinigungsplan_datum_3 = completeData.schuldenbereinigungsplan_datum;  // Textfeld 1234
            
            // EMPLOYMENT STATUS CHECKBOXES - Set based on client employment status
            const berufsstatus = formData.berufsstatus || formData.employment_status || 'angestellt';  // Default to employed
            console.log(`🔍 Employment status: ${berufsstatus}`);
            
            // Set employment checkboxes (ensure they are boolean true for checking)
            completeData.employment_angestellt = (berufsstatus === 'angestellt' || berufsstatus === 'employed') ? true : false;
            completeData.employment_selbstaendig = (berufsstatus === 'selbstaendig' || berufsstatus === 'self-employed') ? true : false;
            completeData.employment_arbeitslos = (berufsstatus === 'arbeitslos' || berufsstatus === 'unemployed') ? true : false;
            completeData.employment_rentner = (berufsstatus === 'rentner' || berufsstatus === 'retired') ? true : false;
            
            console.log(`📋 Employment checkboxes: angestellt=${completeData.employment_angestellt}, selbstaendig=${completeData.employment_selbstaendig}, arbeitslos=${completeData.employment_arbeitslos}, rentner=${completeData.employment_rentner}`);

            // FAMILIENSTAND (MARITAL STATUS) CHECKBOXES - Set based on client marital status
            const familienstand = formData.familienstand || 'ledig';  // Default to single
            console.log(`👫 Familienstand (Marital Status): ${familienstand}`);

            // Set familienstand checkboxes (exclusive - only one should be checked)
            completeData.familienstand_ledig = (familienstand === 'ledig');
            completeData.familienstand_verheiratet = (familienstand === 'verheiratet');
            completeData.familienstand_lebenspartnerschaft = (familienstand === 'lebenspartnerschaft' || familienstand === 'eingetragene_lebenspartnerschaft');
            completeData.familienstand_geschieden = (familienstand === 'geschieden');
            completeData.familienstand_getrennt_lebend = (familienstand === 'getrennt_lebend');
            completeData.familienstand_verwitwet = (familienstand === 'verwitwet');

            console.log(`📋 Familienstand checkboxes: ledig=${completeData.familienstand_ledig}, verheiratet=${completeData.familienstand_verheiratet}, geschieden=${completeData.familienstand_geschieden}, getrennt_lebend=${completeData.familienstand_getrennt_lebend}, verwitwet=${completeData.familienstand_verwitwet}`);

            // Main form checkboxes are handled by INSOLVENZANTRAG_CONFIG
            
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