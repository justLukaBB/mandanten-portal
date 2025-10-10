const fs = require('fs');
const path = require('path');
const JSZip = require('jszip');

/**
 * Fix remaining hardcoded values in template
 */
async function fixRemainingHardcodedValues() {
    try {
        const templatePath = path.join(__dirname, 'templates/Nullplan_Text_Template.docx');
        const backupPath = path.join(__dirname, 'templates/Nullplan_Text_Template_backup2.docx');
        
        if (!fs.existsSync(templatePath)) {
            console.error('❌ Template not found:', templatePath);
            return;
        }

        console.log('🔧 Fixing remaining hardcoded values in Nullplan template...\n');

        // Create backup
        fs.copyFileSync(templatePath, backupPath);
        console.log('✅ Backup created:', backupPath);

        // Load template
        const templateBuffer = fs.readFileSync(templatePath);
        const zip = await JSZip.loadAsync(templateBuffer);
        let documentXml = await zip.file('word/document.xml').async('string');

        // Track changes
        let changes = 0;

        // Fix 1: Replace hardcoded case number "904/24" with variable
        console.log('🔍 Searching for hardcoded case number...');
        const oldCaseNumber = '904/24';
        const newCaseNumberVariable = '&quot;Aktenzeichen&quot;';
        
        if (documentXml.includes(oldCaseNumber)) {
            documentXml = documentXml.replace(new RegExp(oldCaseNumber, 'g'), newCaseNumberVariable);
            console.log(`✅ Replaced "${oldCaseNumber}" with "${newCaseNumberVariable}"`);
            changes++;
        } else {
            console.log(`⚠️ Case number "${oldCaseNumber}" not found`);
        }

        // Fix 2: Look for creditor name in header/address area and replace
        console.log('🔍 Searching for hardcoded creditor names...');
        
        // Common creditor name patterns that might be hardcoded
        const creditorPatterns = [
            { old: 'EOS Deutscher Inkasso-Dienst GmbH', new: '&quot;Name des Gläubigers&quot;' },
            { old: 'EOS Deutscher Inkasso', new: '&quot;Name des Gläubigers&quot;' },
            { old: 'Deutscher Inkasso-Dienst GmbH', new: '&quot;Name des Gläubigers&quot;' }
        ];

        creditorPatterns.forEach(pattern => {
            if (documentXml.includes(pattern.old)) {
                documentXml = documentXml.replace(new RegExp(pattern.old, 'g'), pattern.new);
                console.log(`✅ Replaced "${pattern.old}" with "${pattern.new}"`);
                changes++;
            }
        });

        // Fix 3: Look for other potential hardcoded values
        console.log('🔍 Searching for other hardcoded values...');
        
        // Search for any remaining occurrences of "TS-JK" 
        if (documentXml.includes('TS-JK')) {
            // This might be part of the case number format, keep it but make the prefix dynamic
            const tsJkPattern = /<w:t>([^<]*TS-JK[^<]*)<\/w:t>/g;
            documentXml = documentXml.replace(tsJkPattern, '<w:t>&quot;Aktenzeichen&quot;</w:t>');
            console.log('✅ Replaced TS-JK patterns with dynamic case number variable');
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

fixRemainingHardcodedValues();