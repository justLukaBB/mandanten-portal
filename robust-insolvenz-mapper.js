const { PDFDocument } = require('pdf-lib');
const fs = require('fs').promises;

/**
 * ROBUSTES INSOLVENZANTRAG-SYSTEM
 * - Nur mit existierenden Feldern arbeiten
 * - Klare Trennung zwischen Standard-Checkboxen und dynamischen Daten
 * - Keine Fehler durch nicht-existierende Felder
 */
class RobustInsolvenzMapper {
    
    /**
     * STANDARD CHECKBOXEN - Diese werden IMMER gesetzt
     * Basierend auf deinen spezifischen Anforderungen
     */
    static STANDARD_CHECKBOXES = {
        // === SEKTION II: RESTSCHULDBEFREIUNG ===
        'Kontrollkästchen 1': true,    // ✅ "Ich stelle den Antrag auf Restschuldbefreiung"
        
        // === SEKTION II.2.A: ERKLÄRUNG ZUM RESTSCHULDBEFREIUNGSANTRAG ===
        'Kontrollkästchen 11': true,   // ✅ "bisher nicht gestellt habe" - NUR DIESE eine Checkbox
        
        // === SEKTION V: VERSICHERUNG ===
        'Kontrollkästchen 298': true,  // ✅ "Ich versichere die Richtigkeit..."
        
        // === SEKTION III: ANLAGEN ===
        // PROBLEM: Kontrollkästchen 2-7 gehören zu Sektion II.2, NICHT zu Anlagen!
        // Wir müssen die RICHTIGEN Anlage-Checkboxen finden!
        'Kontrollkästchen 18': true,   // ✅ Anlage 6 (korrekt identifiziert)
        'Kontrollkästchen 19': true,   // ✅ Anlage 7 (korrekt identifiziert)  
        'Kontrollkästchen 20': true,   // ✅ Anlage 7a - Musterplan mit flexiblen Raten (korrekt)
        
        // === ALLE ANDEREN CHECKBOXEN EXPLIZIT AUF FALSE ===
        // Sektion II.2: Kontrollkästchen 2-10 müssen ALLE auf FALSE (nur 11 soll aktiviert sein)
        'Kontrollkästchen 2': false,   // ❌ Sektion II.2 Option (NICHT Anlage!)
        'Kontrollkästchen 3': false,   // ❌ Sektion II.2 Option (NICHT Anlage!)
        'Kontrollkästchen 4': false,   // ❌ Sektion II.2 Option (NICHT Anlage!)
        'Kontrollkästchen 5': false,   // ❌ Sektion II.2 Option (NICHT Anlage!)
        'Kontrollkästchen 6': false,   // ❌ Sektion II.2 Option (NICHT Anlage!)
        'Kontrollkästchen 7': false,   // ❌ Sektion II.2 Option (NICHT Anlage!)
        'Kontrollkästchen 10': false,  // ❌ Sektion II.2 letzte Option
        
        // Plan mit sonstigen Inhalt - NICHT aktivieren  
        'Kontrollkästchen 21': false,  // ❌ Plan mit sonstigen Inhalt
    };
    
    /**
     * DYNAMISCHE FELD-ZUORDNUNGEN
     * Diese werden basierend auf Client-Daten gesetzt
     */
    static DYNAMIC_MAPPINGS = {
        // Geschlecht (existierende Felder)
        geschlecht: {
            'maennlich': 'Kontrollkästchen 27',
            'weiblich': 'Kontrollkästchen 28', 
            'divers': 'Kontrollkästchen 29'
        },
        
        // Familienstand (existierende Felder)
        familienstand: {
            'ledig': 'Kontrollkästchen 23',
            'verheiratet': 'Kontrollkästchen 24',
            'geschieden': 'Kontrollkästchen 25', 
            'verwitwet': 'Kontrollkästchen 26'
        },
        
        // Berufsstatus (existierende Felder)
        berufsstatus: {
            'angestellt': 'Kontrollkästchen 30',
            'selbstaendig': 'Kontrollkästchen 32',
            'arbeitslos': 'Kontrollkästchen 33'
        },
        
        // Kinder (existierende Felder)
        kinder: {
            'ja': 'Kontrollkästchen 35',
            'nein': 'Kontrollkästchen 36'
        }
    };
    
    /**
     * TEXTFELD-ZUORDNUNGEN (nur existierende)
     */
    static TEXT_MAPPINGS = {
        // Grunddaten
        'vorname_name': 'Textfeld 1',      // "Nachname, Vorname"
        'telefon': 'Textfeld 4',           // Telefon
        
        // Personalbogen
        'vorname_pb': 'Textfeld 22',       // Vorname Personalbogen
        'strasse_pb': 'Textfeld 25',       // Straße Personalbogen  
        'hausnummer_pb': 'Textfeld 28',    // Hausnummer Personalbogen
        'plz_pb': 'Textfeld 31',           // PLZ Personalbogen
        'ort_pb': 'Textfeld 37',           // Ort Personalbogen
        'telefon_pb': 'Textfeld 39',       // Telefon Personalbogen
        'email_pb': 'Textfeld 40',         // Email Personalbogen
        
        // Termine
        'plan_datum': 'Textfeld 27',       // Plan-Datum
        'scheiter_datum': 'Textfeld 29',   // Scheitern-Datum
        'bescheinigung_datum': 'Textfeld 30', // Bescheinigung-Datum
        'unterschrift_ort': 'Textfeld 26', // Unterschrift-Ort
        
        // Unterhaltsberechtigte
        'unterhalt_anzahl': 'Textfeld 46',      // Anzahl Unterhaltsberechtigte
        'unterhalt_minderjaehrig': 'Textfeld 47' // Minderjährige
    };
    
    /**
     * Hauptfunktion: PDF mit robusten Mappings füllen
     */
    static async fillInsolvenzantrag(clientData, originalPdfPath) {
        try {
            console.log('🚀 Starting ROBUST Insolvenzantrag Generation...');
            
            const existingPdfBytes = await fs.readFile(originalPdfPath);
            const pdfDoc = await PDFDocument.load(existingPdfBytes);
            const form = pdfDoc.getForm();
            
            // 1. Daten vorbereiten
            const formData = this.prepareFormData(clientData);
            
            // 2. Textfelder füllen
            this.fillTextFields(form, formData);
            
            // 3. Standard-Checkboxen setzen
            this.setStandardCheckboxes(form);
            
            // 4. Dynamische Checkboxen setzen
            this.setDynamicCheckboxes(form, formData);
            
            console.log('✅ PDF successfully filled with robust mappings!');
            
            const filledPdfBytes = await pdfDoc.save();
            return filledPdfBytes;
            
        } catch (error) {
            console.error('❌ Error in robust PDF filling:', error);
            throw error;
        }
    }
    
    /**
     * Client-Daten für PDF vorbereiten
     */
    static prepareFormData(clientData) {
        const formData = { ...clientData };
        
        // Computed fields
        formData.vorname_name = `${clientData.lastName || ''}, ${clientData.firstName || ''}`;
        formData.vorname_pb = clientData.firstName;
        formData.telefon_pb = clientData.phone;
        formData.email_pb = clientData.email;
        
        // Adresse aufteilen
        if (clientData.address) {
            const addressParts = clientData.address.match(/^(.+?)\s+(\d+[a-zA-Z]?),?\s*(\d{5})\s+(.+)$/);
            if (addressParts) {
                formData.strasse_pb = addressParts[1];
                formData.hausnummer_pb = addressParts[2];
                formData.plz_pb = addressParts[3];
                formData.ort_pb = addressParts[4];
            }
        }
        
        // Daten generieren
        const heute = new Date();
        const scheiterDatum = new Date(heute.getTime() + 14 * 24 * 60 * 60 * 1000);
        
        formData.plan_datum = heute.toLocaleDateString('de-DE');
        formData.scheiter_datum = scheiterDatum.toLocaleDateString('de-DE');
        formData.bescheinigung_datum = heute.toLocaleDateString('de-DE');
        formData.unterschrift_ort = formData.ort_pb || 'Musterstadt';
        
        // Kinder-Info
        const hasChildren = clientData.financial_data?.number_of_children && 
                          parseInt(clientData.financial_data.number_of_children) > 0;
        formData.unterhalt_anzahl = hasChildren ? String(clientData.financial_data.number_of_children) : '';
        formData.unterhalt_minderjaehrig = hasChildren ? String(clientData.financial_data.number_of_children) : '';
        
        return formData;
    }
    
    /**
     * Textfelder füllen (nur existierende)
     */
    static fillTextFields(form, formData) {
        console.log('📝 Filling text fields...');
        let filled = 0;
        
        Object.entries(this.TEXT_MAPPINGS).forEach(([dataField, pdfFieldName]) => {
            try {
                const value = formData[dataField];
                if (value !== undefined && value !== null && value !== '') {
                    const textField = form.getTextField(pdfFieldName);
                    textField.setText(String(value));
                    filled++;
                    console.log(`  ✅ ${pdfFieldName} = "${value}"`);
                }
            } catch (error) {
                console.log(`  ⚠️  Text field not found: ${pdfFieldName}`);
            }
        });
        
        console.log(`📊 ${filled} text fields filled`);
    }
    
    /**
     * Standard-Checkboxen setzen (immer gleich)
     */
    static setStandardCheckboxes(form) {
        console.log('📋 Setting standard checkboxes...');
        let checked = 0;
        
        Object.entries(this.STANDARD_CHECKBOXES).forEach(([checkboxName, shouldCheck]) => {
            try {
                const checkbox = form.getCheckBox(checkboxName);
                if (shouldCheck) {
                    checkbox.check();
                    checked++;
                    console.log(`  ✅ ${checkboxName} - CHECKED`);
                } else {
                    checkbox.uncheck();
                    console.log(`  ❌ ${checkboxName} - UNCHECKED`);
                }
            } catch (error) {
                console.log(`  ⚠️  Standard checkbox not found: ${checkboxName}`);
            }
        });
        
        console.log(`📊 ${checked} standard checkboxes set`);
    }
    
    /**
     * Dynamische Checkboxen basierend auf Client-Daten
     */
    static setDynamicCheckboxes(form, formData) {
        console.log('🎯 Setting dynamic checkboxes...');
        let dynamicChecked = 0;
        
        // Geschlecht
        const geschlecht = formData.geschlecht || 'maennlich';
        this.setCheckboxGroup(form, this.DYNAMIC_MAPPINGS.geschlecht, geschlecht);
        
        // Familienstand
        const familienstand = formData.familienstand || formData.financial_data?.marital_status || 'ledig';
        this.setCheckboxGroup(form, this.DYNAMIC_MAPPINGS.familienstand, familienstand);
        
        // Berufsstatus
        const berufsstatus = formData.berufsstatus || 'angestellt';
        this.setCheckboxGroup(form, this.DYNAMIC_MAPPINGS.berufsstatus, berufsstatus);
        
        // Kinder
        const hasChildren = formData.financial_data?.number_of_children && 
                          parseInt(formData.financial_data.number_of_children) > 0;
        const kinderStatus = hasChildren ? 'ja' : 'nein';
        this.setCheckboxGroup(form, this.DYNAMIC_MAPPINGS.kinder, kinderStatus);
        
        console.log(`📊 Dynamic checkboxes configured`);
    }
    
    /**
     * Checkbox-Gruppe setzen (nur eine aktiv)
     */
    static setCheckboxGroup(form, mappings, activeValue) {
        Object.entries(mappings).forEach(([value, checkboxName]) => {
            try {
                const checkbox = form.getCheckBox(checkboxName);
                if (value === activeValue) {
                    checkbox.check();
                    console.log(`  ✅ ${checkboxName} - ${value} (ACTIVE)`);
                } else {
                    checkbox.uncheck();
                    console.log(`  ❌ ${checkboxName} - ${value}`);
                }
            } catch (error) {
                console.log(`  ⚠️  Dynamic checkbox not found: ${checkboxName}`);
            }
        });
    }
}

module.exports = RobustInsolvenzMapper;