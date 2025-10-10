const fs = require('fs');
const path = require('path');
const JSZip = require('jszip');

/**
 * Fix hardcoded values in template by replacing them with variables
 */
async function fixHardcodedTemplateValues() {
    try {
        const templatePath = path.join(__dirname, 'templates/Nullplan_Text_Template.docx');
        const backupPath = path.join(__dirname, 'templates/Nullplan_Text_Template_backup.docx');
        
        if (!fs.existsSync(templatePath)) {
            console.error('❌ Template not found:', templatePath);
            return;
        }

        console.log('🔧 Fixing hardcoded values in Nullplan template...\n');

        // Create backup
        fs.copyFileSync(templatePath, backupPath);
        console.log('✅ Backup created:', backupPath);

        // Load template
        const templateBuffer = fs.readFileSync(templatePath);
        const zip = await JSZip.loadAsync(templateBuffer);
        let documentXml = await zip.file('word/document.xml').async('string');

        // Track changes
        let changes = 0;

        // Fix 1: Replace hardcoded "01.08.2025" with variable
        const oldDate = '01.08.2025';
        const newDateVariable = '&quot;Datum in 3 Monaten&quot;';
        
        if (documentXml.includes(oldDate)) {
            documentXml = documentXml.replace(oldDate, newDateVariable);
            console.log(`✅ Replaced "${oldDate}" with "${newDateVariable}"`);
            changes++;
        }

        // Fix 2: Replace hardcoded "Frau Laux" with variable
        const oldNamePattern = 'Frau Laux';
        const newNameVariable = '&quot;Name Mandant&quot;';
        
        if (documentXml.includes(oldNamePattern)) {
            documentXml = documentXml.replace(oldNamePattern, newNameVariable);
            console.log(`✅ Replaced "${oldNamePattern}" with "${newNameVariable}"`);
            changes++;
        }

        if (changes > 0) {
            // Update the document XML in the zip
            zip.file('word/document.xml', documentXml);

            // Generate new template
            const outputBuffer = await zip.generateAsync({ type: 'nodebuffer' });
            fs.writeFileSync(templatePath, outputBuffer);

            console.log(`\n✅ Template updated with ${changes} changes`);
            console.log('📁 Updated template:', templatePath);
            console.log('📁 Backup available:', backupPath);
        } else {
            console.log('\n⚠️ No changes needed - hardcoded values not found');
        }

    } catch (error) {
        console.error('❌ Error fixing template:', error.message);
    }
}

fixHardcodedTemplateValues();