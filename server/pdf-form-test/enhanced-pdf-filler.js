const { PDFDocument } = require('pdf-lib');
const fs = require('fs').promises;
const path = require('path');

class EnhancedPDFFiller {
    /**
     * Complete field mapping based on all analyzed screenshots
     */
    static getFieldMapping() {
        return {
            // HAUPTBLATT (Seite 1-2)
            // =====================================
            
            // Section 1: Personal Data (Basic Info)
            'vorname_name': 'Textfeld 1',                    // Combined Name field
            'vollstaendige_adresse': 'Textfeld 2',           // Street + House Number combined  
            'plz_ort_kombiniert': 'Textfeld 3',              // ZIP + City combined
            'telefon': 'Textfeld 4',                         // Phone number
            'anwalt_name': 'Textfeld 5',                     // Legal representative (if any)
            
            // Section 2: Court
            'amtsgericht': 'Textfeld 17',                    // Court location (Textfeld 17 from analysis)
            
            // Section 4: Standard Checkboxes - ALWAYS ACTIVATED
            // These are the same for ALL applications
            'standard_restschuldbefreiung_ja': 'Kontrollkästchen 1',        // Apply for debt relief - YES (ALWAYS)
            'standard_restschuldbefreiung_nein': 'Kontrollkästchen 2',      // Apply for debt relief - NO (NEVER)
            'standard_antrag_nicht_gestellt': 'Kontrollkästchen 3',         // No previous application (ALWAYS)
            'standard_antrag_bereits_gestellt': 'Kontrollkästchen 4',       // Previous application (NEVER)
            
            // Section 4.2b: Relief status (usually NEVER activated)
            'standard_restschuld_erteilt': 'Kontrollkästchen 5',            // Relief granted (NEVER)
            'standard_restschuld_versagt': 'Kontrollkästchen 6',            // Relief denied (NEVER)
            
            // Section 4.2c: Denial reasons (usually NEVER activated)
            'standard_versagung_rechtskraeftig': 'Kontrollkästchen 7',      // Legal conviction (NEVER)
            'standard_versagung_fahrlässig': 'Kontrollkästchen 10',         // Negligent violation (NEVER)
            
            // Section 5: III. ANLAGEN - ALL ALWAYS ACTIVATED
            'standard_anlage_personalbogen': 'Kontrollkästchen [ANLAGE1]',         // Personal data sheet
            'standard_anlage_bescheinigung': 'Kontrollkästchen [ANLAGE2]',         // Certificate from counseling
            'standard_anlage_gruende': 'Kontrollkästchen [ANLAGE2A]',              // Reasons for failure
            'standard_anlage_abtretung': 'Kontrollkästchen [ANLAGE3]',             // Assignment declaration
            'standard_anlage_vermoegen': 'Kontrollkästchen [ANLAGE4]',             // Asset overview
            'standard_anlage_einkommen': 'Kontrollkästchen [ANLAGE5]',             // Income listing
            'standard_anlage_glaeubiger': 'Kontrollkästchen [ANLAGE6]',            // Creditor listing
            'standard_anlage_plan': 'Kontrollkästchen [ANLAGE7]',                  // Debt settlement plan
            
            // Section 6: Cooperation obligations - ALWAYS ACTIVATED
            'standard_auskunftspflicht': 'Kontrollkästchen [AUSKUNFT]',
            
            // Section 7: Accuracy assurance - ALWAYS ACTIVATED
            'standard_richtigkeitsversicherung': 'Kontrollkästchen [RICHTIGKEIT]',
            
            // PERSONALBOGEN (Anlage 1) - Page 3
            // =====================================
            
            // Section 9: Personal Details (separate fields)
            'nachname_pb': 'Textfeld [PB_NACHNAME]',         // Last name
            'vorname_pb': 'Textfeld [PB_VORNAME]',           // First name  
            'geburtsdatum': 'Textfeld [PB_GEBURTSDATUM]',    // Birth date
            'geburtsort': 'Textfeld [PB_GEBURTSORT]',        // Birth place
            'strasse_pb': 'Textfeld [PB_STRASSE]',           // Street
            'hausnummer_pb': 'Textfeld [PB_HAUSNUMMER]',     // House number
            'plz_pb': 'Textfeld [PB_PLZ]',                   // ZIP
            'ort_pb': 'Textfeld [PB_ORT]',                   // City
            'telefon_pb': 'Textfeld [PB_TELEFON]',           // Phone
            'email': 'Textfeld [PB_EMAIL]',                  // Email
            
            // Section 10: Family Status - DYNAMIC based on user selection
            'familienstand_ledig': 'Kontrollkästchen [FS_LEDIG]',
            'familienstand_verheiratet': 'Kontrollkästchen [FS_VERHEIRATET]',
            'familienstand_eingetragene_lebenspartnerschaft': 'Kontrollkästchen [FS_LEBENSPARTNERSCHAFT]',
            'familienstand_geschieden': 'Kontrollkästchen [FS_GESCHIEDEN]',
            'familienstand_getrennt_lebend': 'Kontrollkästchen [FS_GETRENNT]',
            'familienstand_verwitwet': 'Kontrollkästchen [FS_VERWITWET]',
            
            // Section 11: Dependents - DYNAMIC
            'kinder_nein': 'Kontrollkästchen [KINDER_NEIN]',
            'kinder_ja': 'Kontrollkästchen [KINDER_JA]',
            
            // Section 12: Employment - DYNAMIC based on status
            'beruf_angestellt': 'Kontrollkästchen [BERUF_ANGESTELLT]',
            'beruf_selbstaendig': 'Kontrollkästchen [BERUF_SELBSTAENDIG]',
            'beruf_arbeitslos': 'Kontrollkästchen [BERUF_ARBEITSLOS]',
            'beruf_rentner': 'Kontrollkästchen [BERUF_RENTNER]',
            'beruf_student': 'Kontrollkästchen [BERUF_STUDENT]',
            'beruf_hausfrau': 'Kontrollkästchen [BERUF_HAUSFRAU]',
            'beruf_sonstiges': 'Kontrollkästchen [BERUF_SONSTIGES]',
            
            // Section 13: Legal Representative (if applicable)
            'anwalt_name_pb': 'Textfeld [ANW_NAME]',
            'anwalt_person': 'Textfeld [ANW_PERSON]',
            'anwalt_vollstaendige_adresse': 'Textfeld [ANW_ADRESSE]',
            'anwalt_plz_ort_kombiniert': 'Textfeld [ANW_PLZ_ORT]',
            'anwalt_telefon': 'Textfeld [ANW_TELEFON]',
            
            // BESCHEINIGUNG (Anlage 2) - Page 4
            // =====================================
            
            // Section 14: Counseling authority
            'beratung_name': 'Textfeld [BER_NAME]',
            'beratung_adresse': 'Textfeld [BER_ADRESSE]',
            
            // Section 15: Recognition - ALWAYS "YES"
            'standard_anerkannt_ja': 'Kontrollkästchen [BER_ANERKANNT_JA]',
            'standard_anerkannt_nein': 'Kontrollkästchen [BER_ANERKANNT_NEIN]',
            
            // Section 16: Out-of-court attempt
            'plan_datum': 'Textfeld [PLAN_DATUM]',           // Plan date (auto: today)
            'standard_plan_begonnen': 'Kontrollkästchen [PLAN_BEGONNEN]',      // Plan started (ALWAYS YES)
            'standard_plan_gescheitert': 'Kontrollkästchen [PLAN_GESCHEITERT]', // Plan failed (ALWAYS YES)
            'scheiter_datum': 'Textfeld [SCHEITER_DATUM]',   // Failed date (auto: today + 14 days)
            
            // Section 17: Certification
            'bescheinigung_ort': 'Textfeld [BESCH_ORT]',     // Certification place
            'bescheinigung_datum': 'Textfeld [BESCH_DATUM]', // Certification date
            
            // GRÜNDE FÜR SCHEITERN (Anlage 2A) - Page 5
            // =====================================
            
            // Section 18: Reasons for failure - STANDARD TEXT
            'standard_nicht_alle_glaeubiger': 'Kontrollkästchen [GRUND_NICHT_ALLE]',  // Not all creditors agreed (ALWAYS)
            'glaeubiger_anzahl': 'Textfeld [GLAUB_ANZAHL]',              // Number of creditors
            'glaeubiger_summe': 'Textfeld [GLAUB_SUMME]',                // Total debt amount
            'standard_begruendung_text': 'Textfeld [GRUND_TEXT]',         // Standard reason text
            
            // Section 19: Comparison with court plan - STANDARD
            'standard_plan_unterschied': 'Kontrollkästchen [PLAN_UNTERSCHIED]',      // Plans differ (ALWAYS)
            'standard_nicht_aussichtsreich': 'Kontrollkästchen [NICHT_AUSSICHTSREICH]', // Not promising (ALWAYS)
            'standard_quote_zu_gering': 'Textfeld [QUOTE_BEGRUENDUNG]'    // Standard: "Quote too low"
        };
    }

    /**
     * Get standard values that are ALWAYS the same for every application
     */
    static getStandardValues() {
        return {
            // MAIN APPLICATION - Always the same checkboxes
            standard_restschuldbefreiung_ja: true,         // ALWAYS apply for debt relief
            standard_restschuldbefreiung_nein: false,      // NEVER decline debt relief
            standard_antrag_nicht_gestellt: true,          // ALWAYS "no previous application"
            standard_antrag_bereits_gestellt: false,       // NEVER "previous application made"
            standard_restschuld_erteilt: false,            // NEVER "relief granted before"
            standard_restschuld_versagt: false,            // NEVER "relief denied before"
            standard_versagung_rechtskraeftig: false,      // NEVER "denial due to conviction"
            standard_versagung_fahrlässig: false,          // NEVER "denial due to negligence"
            
            // ATTACHMENTS - Always all 7 standard attachments
            standard_anlage_personalbogen: true,           // Personal data sheet
            standard_anlage_bescheinigung: true,           // Counseling certificate
            standard_anlage_gruende: true,                 // Reasons for failure
            standard_anlage_abtretung: true,               // Assignment declaration
            standard_anlage_vermoegen: true,               // Asset overview
            standard_anlage_einkommen: true,               // Income listing
            standard_anlage_glaeubiger: true,              // Creditor listing
            standard_anlage_plan: true,                    // Debt settlement plan
            
            // OBLIGATIONS - Always accepted
            standard_auskunftspflicht: true,               // Information duties
            standard_richtigkeitsversicherung: true,      // Accuracy assurance
            
            // COUNSELING - Always "recognized authority"
            standard_anerkannt_ja: true,                   // Recognized counseling authority
            standard_anerkannt_nein: false,                // NOT unrecognized
            
            // OUT-OF-COURT ATTEMPT - Always standard process
            standard_plan_begonnen: true,                  // Plan was started
            standard_plan_gescheitert: true,               // Plan failed (always reason for court application)
            
            // FAILURE REASONS - Always standard reasons
            standard_nicht_alle_glaeubiger: true,          // Not all creditors agreed
            standard_plan_unterschied: true,               // Plans differ
            standard_nicht_aussichtsreich: true,           // Not promising
            
            // STANDARD TEXTS - Always the same
            standard_begruendung_text: 'ohne Begründung',  // Standard: "without reason"
            standard_quote_begruendung: 'Die angegebene Quote ist zu gering.' // Standard: "Quote too low"
        };
    }

    /**
     * Fill the original PDF with both user data and standard values
     */
    static async fillCompletePDF(userFormData, originalPdfPath) {
        try {
            console.log('🔄 Loading original PDF...');
            
            const existingPdfBytes = await fs.readFile(originalPdfPath);
            const pdfDoc = await PDFDocument.load(existingPdfBytes);
            const form = pdfDoc.getForm();
            
            // Combine user data with standard values
            const standardValues = this.getStandardValues();
            const completeData = { ...userFormData, ...standardValues };
            
            // Add computed fields
            completeData.vorname_name = `${userFormData.nachname || ''}, ${userFormData.vorname || ''}`;
            completeData.nachname_pb = userFormData.nachname;
            completeData.vorname_pb = userFormData.vorname;
            completeData.strasse_pb = userFormData.strasse;
            completeData.hausnummer_pb = userFormData.hausnummer;
            completeData.plz_pb = userFormData.plz;
            completeData.ort_pb = userFormData.ort;
            completeData.telefon_pb = userFormData.telefon;
            
            // Auto-generate dates
            const heute = new Date();
            const planDatum = new Date();
            const scheiterDatum = new Date(heute.getTime() + 14 * 24 * 60 * 60 * 1000); // +14 days
            
            completeData.plan_datum = planDatum.toLocaleDateString('de-DE');
            completeData.scheiter_datum = scheiterDatum.toLocaleDateString('de-DE');
            completeData.bescheinigung_datum = heute.toLocaleDateString('de-DE');
            completeData.bescheinigung_ort = userFormData.amtsgericht || userFormData.ort;
            
            // Handle family status (only one selected)
            this.setFamilyStatus(completeData, userFormData.familienstand);
            
            // Handle employment status (only one selected)  
            this.setEmploymentStatus(completeData, userFormData.berufsstatus);
            
            // Handle children (yes/no)
            const hasChildren = userFormData.kinder_anzahl && parseInt(userFormData.kinder_anzahl) > 0;
            completeData.kinder_ja = hasChildren;
            completeData.kinder_nein = !hasChildren;
            
            // Fill legal representative data if provided
            if (userFormData.hat_anwalt) {
                completeData.anwalt_name_pb = userFormData.anwalt_name;
                completeData.beratung_name = userFormData.anwalt_name;
                completeData.beratung_adresse = `${userFormData.anwalt_strasse} ${userFormData.anwalt_hausnummer}`;
            }
            
            console.log('📝 Filling PDF form fields...');
            
            // Get field mapping and fill the PDF
            const fieldMapping = this.getFieldMapping();
            let filledFields = 0;
            let failedFields = 0;
            
            Object.entries(fieldMapping).forEach(([dataField, pdfFieldName]) => {
                try {
                    const value = completeData[dataField];
                    
                    if (value !== undefined && value !== null && value !== '') {
                        // Handle different field types
                        if (pdfFieldName.includes('Kontrollkästchen') || pdfFieldName.includes('[') && pdfFieldName.includes(']')) {
                            // This is a checkbox - we'll handle it with our current system for now
                            // In production, you'd map these to actual PDF field names from analysis
                            console.log(`  🔲 Checkbox mapping: ${dataField} = ${value} (${pdfFieldName})`);
                        } else {
                            // Text field - try to fill if it exists
                            try {
                                const textField = form.getTextField(pdfFieldName);
                                textField.setText(String(value));
                                filledFields++;
                                console.log(`  📝 Filled: ${pdfFieldName} = "${value}"`);
                            } catch (fieldError) {
                                // Field doesn't exist - this is expected for new mappings
                                console.log(`  ⚠️  Field not found: ${pdfFieldName} (will be mapped in production)`);
                                failedFields++;
                            }
                        }
                    }
                } catch (error) {
                    console.warn(`  ❌ Error filling ${pdfFieldName}:`, error.message);
                    failedFields++;
                }
            });
            
            console.log(`📊 Filled ${filledFields} fields, ${failedFields} fields need mapping`);
            console.log('💾 Generating enhanced PDF...');
            
            const filledPdfBytes = await pdfDoc.save();
            return filledPdfBytes;
            
        } catch (error) {
            console.error('❌ Error filling complete PDF:', error);
            throw new Error('Failed to fill complete PDF: ' + error.message);
        }
    }
    
    /**
     * Set family status checkboxes (exclusive)
     */
    static setFamilyStatus(data, status) {
        // Reset all family status fields
        data.familienstand_ledig = false;
        data.familienstand_verheiratet = false;
        data.familienstand_eingetragene_lebenspartnerschaft = false;
        data.familienstand_geschieden = false;
        data.familienstand_getrennt_lebend = false;
        data.familienstand_verwitwet = false;
        
        // Set the selected one
        if (status) {
            data[`familienstand_${status}`] = true;
        }
    }
    
    /**
     * Set employment status checkboxes (exclusive)
     */
    static setEmploymentStatus(data, status) {
        // Reset all employment fields
        data.beruf_angestellt = false;
        data.beruf_selbstaendig = false;
        data.beruf_arbeitslos = false;
        data.beruf_rentner = false;
        data.beruf_student = false;
        data.beruf_hausfrau = false;
        data.beruf_sonstiges = false;
        
        // Set the selected one
        if (status) {
            data[`beruf_${status}`] = true;
        }
    }
}

module.exports = EnhancedPDFFiller;