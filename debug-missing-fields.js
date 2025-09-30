// Debug script to identify which fields have empty data

const fieldMapping = {
    // MAIN IDENTIFICATION FIELDS (Page 1) - Based on new template structure
    'vorname_name': 'Textfeld 1',                    // "Vorname und Name" 
    'vollstaendige_adresse': 'Textfeld 2',           // "Straße und Hausnummer"
    'plz_ort_kombiniert': 'Textfeld 3',              // "Postleitzahl und Ort"
    'amtsgericht': 'Textfeld 16',                    // "An das Amtsgericht– Insolvenzgericht – in"
    
    // CONTACT INFORMATION - Updated mappings  
    'telefon': 'Textfeld 4',                        // "Telefon tagsüber" ✅
    'telefon_mobil': 'Textfeld 37',                  // "Mobil Telefon" ✅
    'email': 'Textfeld 39',                          // "E-mail"
    'anwalt_name': 'Textfeld 5',                     // "Verfahrensbevollmächtigte(r)" ✅
    
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
    
    // PROFESSIONAL INFORMATION - New fields from template
    'erlernter_beruf': 'Textfeld 48',               // "Erlernter Beruf" ✅
    'aktuelle_taetigkeit': 'Textfeld 49',           // "Zurzeit oder zuletzt tätig als" ✅
    'berufliche_taetigkeit': 'Textfeld 278',        // "Berufliche Tätigkeit" ✅
};

// Simulate the data that would be available
const formData = {
    vorname: 'Thomas',
    nachname: 'Schmidt', 
    strasse: 'Hauptstraße',
    hausnummer: '78',
    plz: '50667',
    ort: 'Köln',
    telefon: '', // EMPTY - could be the issue
    telefon_mobil: '', // EMPTY - could be the issue
    email: 'thomas.schmidt@example.com',
    geburtsdatum: '', // EMPTY - could be the issue
    geburtsort: '', // EMPTY - could be the issue
    akademischer_grad: '', // EMPTY - could be the issue
    erlernter_beruf: '', // EMPTY - could be the issue
    aktuelle_taetigkeit: '', // EMPTY - could be the issue
    berufliche_taetigkeit: '', // EMPTY - could be the issue
    anwalt_name: '', // EMPTY - could be the issue
    anzahl_glaeubiger: 4,
    gesamtschuldensumme: 13990,
    amtsgericht: 'Köln'
};

console.log('🔍 DEBUGGING MISSING FIELDS:');
console.log('============================');

// Prepare data like the actual system does
const completeData = { ...formData };
const fullName = `${formData.vorname || ''} ${formData.nachname || ''}`;
const currentDate = new Date().toLocaleDateString('de-DE');

// Add computed fields
completeData.vorname_name = `${formData.nachname || ''}, ${formData.vorname || ''}`;
completeData.vollstaendige_adresse = `${formData.strasse || ''} ${formData.hausnummer || ''}`;
completeData.plz_ort_kombiniert = `${formData.plz || ''} ${formData.ort || ''}`;

// Personal information fields that were missing
completeData.telefon = formData.telefon || '';  // Textfeld 4
completeData.anwalt_name = formData.anwalt_name || '';  // Textfeld 5
completeData.geburtsort = formData.geburtsort || '';  // Textfeld 31
completeData.telefon_mobil = formData.telefon_mobil || '';  // Textfeld 37
completeData.akademischer_grad = formData.akademischer_grad || '';  // Textfeld 26
completeData.geburtsdatum = formData.geburtsdatum || '';  // Textfeld 30
completeData.erlernter_beruf = formData.erlernter_beruf || '';  // Textfeld 48
completeData.aktuelle_taetigkeit = formData.aktuelle_taetigkeit || '';  // Textfeld 49
completeData.berufliche_taetigkeit = formData.berufliche_taetigkeit || formData.aktuelle_taetigkeit || '';  // Textfeld 278

console.log('\\n📝 CHECKING WHICH FIELDS WOULD BE SKIPPED:');
console.log('============================================');

Object.entries(fieldMapping).forEach(([dataField, pdfFieldName]) => {
    const value = completeData[dataField];
    const isEmpty = (value === undefined || value === null || value === '');
    
    if (isEmpty) {
        console.log(`❌ SKIPPED: ${pdfFieldName} (${dataField}) = "${value}" - EMPTY!`);
    } else {
        console.log(`✅ FILLED: ${pdfFieldName} (${dataField}) = "${value}"`);
    }
});

console.log('\\n🔧 SOLUTION: We need to provide default values for empty fields!');
console.log('================================================================');

console.log('\\nFields that need default values:');
Object.entries(fieldMapping).forEach(([dataField, pdfFieldName]) => {
    const value = completeData[dataField];
    const isEmpty = (value === undefined || value === null || value === '');
    
    if (isEmpty) {
        let suggestion = '';
        const fieldLower = pdfFieldName.toLowerCase();
        
        if (fieldLower.includes('telefon')) {
            suggestion = 'Use client phone or default value';
        } else if (fieldLower.includes('beruf') || fieldLower.includes('tätig')) {
            suggestion = 'Use "Angestellt" or employment status from client data';
        } else if (fieldLower.includes('geburt')) {
            suggestion = 'Use client birth data or current date';
        } else if (fieldLower.includes('anwalt')) {
            suggestion = 'Use legal representative info or default';
        } else if (fieldLower.includes('grad')) {
            suggestion = 'Leave empty or use "-"';
        } else {
            suggestion = 'Provide appropriate default value';
        }
        
        console.log(`  • ${dataField} (${pdfFieldName}): ${suggestion}`);
    }
});