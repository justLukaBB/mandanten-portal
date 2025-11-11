const fs = require('fs');
const path = require('path');
const JSZip = require('jszip');

/**
 * Fix template issues: add creditor name and remove duplicate TS-JK
 */
async function fixTemplateIssues() {
    try {
        const templatePath = path.join(__dirname, 'templates/Nullplan_Text_Template.docx');
        const backupPath = path.join(__dirname, 'templates/Nullplan_Text_Template_backup3.docx');
        
        if (!fs.existsSync(templatePath)) {
            console.error('❌ Template not found:', templatePath);
            return;
        }

        console.log('🔧 Fixing template issues: creditor name and duplicate TS-JK...\n');

        // Create backup
        fs.copyFileSync(templatePath, backupPath);
        console.log('✅ Backup created:', backupPath);

        // Load template
        const templateBuffer = fs.readFileSync(templatePath);
        const zip = await JSZip.loadAsync(templateBuffer);
        let documentXml = await zip.file('word/document.xml').async('string');

        let changes = 0;

        // Fix 1: Add creditor name before address
        console.log('🔍 Adding creditor name before address...');
        
        // Find the pattern for "Adresse des Creditors" and add creditor name before it
        const addressPattern = '&quot;Adresse</w:t></w:r><w:r><w:rPr><w:spacing w:val="-7"/></w:rPr><w:t> </w:t></w:r><w:r><w:rPr/><w:t>des</w:t></w:r><w:r><w:rPr><w:spacing w:val="-6"/></w:rPr><w:t> </w:t></w:r><w:r><w:rPr><w:spacing w:val="-2"/></w:rPr><w:t>Creditors&quot;';
        
        if (documentXml.includes(addressPattern)) {
            // Replace with creditor name + newline + address
            const newPattern = '&quot;Name des Gläubigers&quot;</w:t></w:r></w:p><w:p><w:pPr><w:pStyle w:val="BodyText"/></w:pPr><w:r><w:rPr/><w:t>&quot;Adresse</w:t></w:r><w:r><w:rPr><w:spacing w:val="-7"/></w:rPr><w:t> </w:t></w:r><w:r><w:rPr/><w:t>des</w:t></w:r><w:r><w:rPr><w:spacing w:val="-6"/></w:rPr><w:t> </w:t></w:r><w:r><w:rPr><w:spacing w:val="-2"/></w:rPr><w:t>Creditors&quot;';
            
            documentXml = documentXml.replace(addressPattern, newPattern);
            console.log('✅ Added creditor name before address');
            changes++;
        } else {
            console.log('⚠️ Address pattern not found');
        }

        // Fix 2: Remove hardcoded "TS-JK" after variable
        console.log('🔍 Removing duplicate TS-JK...');
        
        // Find pattern: variable + TS- + JK
        const tsJkPattern = /(&quot;Aktenzeichen&quot;<\/w:t><\/w:r>(?:<w:r[^>]*>[^<]*<\/w:r>)*?<w:r[^>]*><w:t>)TS-(<\/w:t><\/w:r>(?:<w:r[^>]*>[^<]*<\/w:r>)*?<w:r[^>]*><w:t>)JK(<\/w:t><\/w:r>)/;
        
        const match = documentXml.match(tsJkPattern);
        if (match) {
            // Remove the "TS-" and "JK" parts, keep just the variable
            documentXml = documentXml.replace(tsJkPattern, '$1$2$3');
            console.log('✅ Removed duplicate TS-JK');
            changes++;
        } else {
            // Try simpler pattern - look for text elements containing "TS-" and "JK" after Aktenzeichen
            const simplePattern1 = /<w:t>TS-<\/w:t>/g;
            const simplePattern2 = /<w:t>JK<\/w:t>/g;
            
            if (documentXml.includes('<w:t>TS-</w:t>')) {
                documentXml = documentXml.replace(simplePattern1, '<w:t></w:t>');
                console.log('✅ Removed hardcoded "TS-"');
                changes++;
            }
            
            if (documentXml.includes('<w:t>JK</w:t>')) {
                documentXml = documentXml.replace(simplePattern2, '<w:t></w:t>');
                console.log('✅ Removed hardcoded "JK"');
                changes++;
            }
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
            console.log('\n⚠️ No changes needed');
        }

    } catch (error) {
        console.error('❌ Error fixing template:', error.message);
    }
}

fixTemplateIssues();