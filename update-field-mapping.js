// Update the field mapping in quick-field-mapper.js based on new template analysis

const fs = require('fs');
const path = require('path');

const newFieldMapping = `static getUpdatedFieldMapping() {
    return {
        // NEW TEMPLATE - Based on field analysis from "New Docus.pdf"
        
        // Main identification fields (Page 1)
        'vorname_name': 'Textfeld 1',                    // "Vorname und Name"
        'vollstaendige_adresse': 'Textfeld 2',           // "Straße und Hausnummer"  
        'plz_ort_kombiniert': 'Textfeld 3',              // "Postleitzahl und Ort"
        'telefon': 'Textfeld 4',                         // "Telefon tagsüber"
        'anwalt_name': 'Textfeld 5',                     // "Verfahrensbevollmächtigte(r)"
        'amtsgericht': 'Textfeld 16',                    // "An das Amtsgericht– Insolvenzgericht – in"
        
        // Personal data section
        'vorname': 'Textfeld 27',                        // "Vorname(n)" 
        'nachname': 'Textfeld 25',                       // "Name"
        'akademischer_grad': 'Textfeld 26',              // "Akademischer Grad"
        'geburtsdatum': 'Textfeld 30',                   // "Geburtsdatum"
        'geburtsort': 'Textfeld 31',                     // "Geburtsort"
        
        // Address details
        'strasse': 'Textfeld 32',                        // "Wohnanschrift Straße"
        'hausnummer': 'Textfeld 33',                     // "Hausnummer"
        'plz': 'Textfeld 34',                           // "Postleitzahl"
        'ort': 'Textfeld 35',                           // "Ort"
        
        // Contact information
        'telefon_mobil': 'Textfeld 37',                  // "Mobil Telefon"
        'email': 'Textfeld 39',                          // "E-mail"
        
        // Professional information
        'erlernter_beruf': 'Textfeld 48',               // "Erlernter Beruf"
        'aktuelle_taetigkeit': 'Textfeld 49',           // "Zurzeit oder zuletzt tätig als"
        'berufliche_taetigkeit': 'Textfeld 278',        // "Berufliche Tätigkeit"
        
        // Legal representative details (Rechtsanwalt)
        'anwalt_vorname_name': 'Textfeld 69',           // "Vorname Name" (Anwalt)
        'anwalt_name_detail': 'Textfeld 70',            // "Rechtsanwalt Thomas Scuric"
        'anwalt_strasse': 'Textfeld 71',                // "Bongardstraße"
        'anwalt_hausnummer': 'Textfeld 72',             // "33"
        'anwalt_plz': 'Textfeld 73',                    // "44787"
        'anwalt_ort': 'Textfeld 74',                    // "Bochum"
        
        // Settlement plan information
        'außergerichtlicher_plan_datum': 'Textfeld 80', // "außergerichtlicher Plan (Datum)"
        'scheiterung_datum': 'Textfeld 82',             // "Datum (Scheiterung)"
        'unterschrift_ort_datum': 'Textfeld 83',        // "(Ort, Datum)"
        'unterschrift_name': 'Textfeld 84',             // "Vorname Name" (Unterschrift)
        
        // Creditor statistics
        'anzahl_glaeubiger_zugestimmt': 'Textfeld 85',  // "Anzahl an Gläubigern (zuge"
        'anzahl_glaeubiger': 'Textfeld 86',             // "Anzahl an Gläubigern" 
        'summe_zugestimmt': 'Textfeld 87',              // "Summe (Zugestimmten)"
        'summe_gesamt': 'Textfeld 88',                  // "Summe"
        'anzahl_ohne_antwort': 'Textfeld 89',           // "Anzahl ohne Antwort"
        'anzahl_ablehnungen': 'Textfeld 90',            // "Anzahl an Gläubigern" (Ablehnungen)
        
        // Settlement plan dates  
        'schuldenbereinigungsplan_datum_1': 'Textfeld 642',  // "Datum des Schuldenbereinigungsplans:"
        'schuldenbereinigungsplan_datum_2': 'Textfeld 1231', // "Datum des Schuldenbereinigungsplans:"
        'schuldenbereinigungsplan_datum_3': 'Textfeld 1234', // "Datum des Schuldenbereinigungsplans:"
        
        // Various name fields throughout the document
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
        
        // Additional address fields
        'adresse_strasse_hausnummer': 'Textfeld 636',   // "Straße und Hausnummer"
        'adresse_plz_ort': 'Textfeld 637',              // "Postleitzahl und Ort"
        'vollname_alt': 'Textfeld 635',                 // "Vormame und Name"
        
        // Date and signature fields
        'datum_unterschrift_1': 'Textfeld 22',          // "(Ort, Datum)"
        
        // NO CHECKBOX MAPPINGS HERE - Checkboxes are handled by INSOLVENZANTRAG_CONFIG
        // The 10 checkboxes from new template are:
        // Kontrollkästchen 1, 2, 17, 21, 25, 26, 27, 32a, 36, 333
        
    };
}`;

console.log('📝 Updated field mapping generated');
console.log('🔧 This mapping is based on the new template analysis');
console.log('📊 Key changes:');
console.log('  - Updated all field names to match new template');
console.log('  - Removed old checkbox mappings (handled by CONFIG)');
console.log('  - Added proper name/address field structure');
console.log('  - Added settlement plan and creditor fields');
console.log('');
console.log('To apply this mapping, update the getUpdatedFieldMapping() function in quick-field-mapper.js');
console.log('');