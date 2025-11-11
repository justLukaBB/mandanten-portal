const fs = require('fs');
const JSZip = require('jszip');

async function findAllQuotedVariables() {
    try {
        const templatePath = './templates/Nullplan_Text_Template.docx';
        const templateBuffer = fs.readFileSync(templatePath);
        const zip = await JSZip.loadAsync(templateBuffer);
        const documentXml = await zip.file('word/document.xml').async('string');
        
        // Find all quoted variables (both &quot; and regular quotes)
        const quotedVariables = [];
        
        // Pattern 1: &quot;Variable Name&quot;
        const quotPattern1 = /&quot;([^&]+?)&quot;/g;
        let match1;
        while ((match1 = quotPattern1.exec(documentXml)) !== null) {
            if (!quotedVariables.includes(match1[1])) {
                quotedVariables.push(match1[1]);
            }
        }
        
        // Pattern 2: "Variable Name" (regular quotes)
        const quotPattern2 = /"([^"]+?)"/g;
        let match2;
        while ((match2 = quotPattern2.exec(documentXml)) !== null) {
            if (!quotedVariables.includes(match2[1])) {
                quotedVariables.push(match2[1]);
            }
        }
        
        console.log('🔍 All quoted variables found in template:');
        quotedVariables.sort().forEach((variable, index) => {
            console.log(`${index + 1}. "${variable}"`);
        });
        
        console.log(`\n📊 Total variables found: ${quotedVariables.length}`);
        
        // Check which ones we're NOT handling
        const handledVariables = [
            'Adresse des Creditors',
            'Aktenzeichen der Forderung', 
            'Schuldsumme Insgesamt',
            'Heutiges Datum',
            'Mandant Name',
            'Datum in 14 Tagen',
            'Name Mandant XML-1',
            'Name Mandant XML-2',
            'Name Mandant',
            'Forderungssumme',
            'Quote des Gläubigers',
            'Forderungsnummer in der Forderungsliste',
            'Gläuibgeranzahl',
            'Einkommen',
            'Geburtstag',
            'Familienstand',
            'Datum in 3 Monaten'
        ];
        
        const unhandledVariables = quotedVariables.filter(v => !handledVariables.includes(v));
        
        if (unhandledVariables.length > 0) {
            console.log('\n❌ Variables NOT being handled:');
            unhandledVariables.forEach((variable, index) => {
                console.log(`${index + 1}. "${variable}"`);
            });
        } else {
            console.log('\n✅ All quoted variables are being handled!');
        }
        
    } catch (error) {
        console.error('❌ Error:', error.message);
    }
}

findAllQuotedVariables();