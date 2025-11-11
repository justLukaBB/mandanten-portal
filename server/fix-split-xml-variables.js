const fs = require('fs');
const path = require('path');
const JSZip = require('jszip');

/**
 * Fix split XML variables in Word template by creating exact replacement patterns
 */
async function fixSplitXmlVariables() {
    console.log('🔧 Creating exact replacement patterns for split XML variables...\n');

    try {
        const templatePath = path.join(__dirname, 'templates/Template-Word-Pfaendbares-Einkommen.docx');
        const templateBuffer = fs.readFileSync(templatePath);
        const zip = await JSZip.loadAsync(templateBuffer);
        const documentXml = await zip.file('word/document.xml').async('string');

        // From debug output, these are the exact split XML patterns we found
        const splitPatterns = [
            {
                pattern: '&quot;Adresse</w:t></w:r><w:r><w:rPr><w:color w:val="101012"/><w:spacing w:val="-7"/><w:sz w:val="22"/></w:rPr><w:t> </w:t></w:r><w:r><w:rPr><w:color w:val="101012"/><w:spacing w:val="-6"/><w:sz w:val="22"/></w:rPr><w:t>des</w:t></w:r><w:r><w:rPr><w:color w:val="101012"/><w:spacing w:val="-7"/><w:sz w:val="22"/></w:rPr><w:t> </w:t></w:r><w:r><w:rPr><w:color w:val="101012"/><w:spacing w:val="-6"/><w:sz w:val="22"/></w:rPr><w:t>Creditors</w:t></w:r><w:r><w:rPr><w:color w:val="101012"/><w:spacing w:val="-5"/><w:sz w:val="22"/></w:rPr><w:t> </w:t></w:r><w:r><w:rPr><w:color w:val="101012"/><w:spacing w:val="-10"/><w:sz w:val="22"/></w:rPr><w:t>&quot;',
                variable: 'Adresse des Creditors',
                replacement: 'CREDITOR_ADDRESS_PLACEHOLDER'
            },
            {
                pattern: '&quot;Aktenzeichen</w:t></w:r><w:r><w:rPr><w:color w:val="0E1012"/><w:spacing w:val="5"/><w:sz w:val="22"/></w:rPr><w:t> </w:t></w:r><w:r><w:rPr><w:color w:val="0E1012"/><w:spacing w:val="-8"/><w:sz w:val="22"/></w:rPr><w:t>der</w:t></w:r><w:r><w:rPr><w:color w:val="0E1012"/><w:spacing w:val="5"/><w:sz w:val="22"/></w:rPr><w:t> </w:t></w:r><w:r><w:rPr><w:color w:val="0E1012"/><w:spacing w:val="-8"/><w:sz w:val="22"/></w:rPr><w:t>Forderung&quot;',
                variable: 'Aktenzeichen der Forderung',
                replacement: 'CREDITOR_REFERENCE_PLACEHOLDER'
            },
            {
                pattern: '&quot;Name</w:t></w:r><w:r><w:rPr><w:color w:val="121215"/><w:spacing w:val="-12"/><w:sz w:val="22"/></w:rPr><w:t> </w:t></w:r><w:r><w:rPr><w:color w:val="121215"/><w:spacing w:val="-4"/><w:sz w:val="22"/></w:rPr><w:t>des</w:t></w:r><w:r><w:rPr><w:color w:val="121215"/><w:spacing w:val="-11"/><w:sz w:val="22"/></w:rPr><w:t> </w:t></w:r><w:r><w:rPr><w:color w:val="121215"/><w:spacing w:val="-4"/><w:sz w:val="22"/></w:rPr><w:t>Mandanten&quot;',
                variable: 'Name des Mandanten',
                replacement: 'CLIENT_NAME_PLACEHOLDER'
            },
            {
                pattern: '&quot;Gessamtsumme</w:t></w:r><w:r><w:rPr><w:color w:val="121215"/><w:spacing w:val="-16"/><w:sz w:val="22"/></w:rPr><w:t> </w:t></w:r><w:r><w:rPr><w:color w:val="121215"/><w:spacing w:val="-2"/><w:sz w:val="22"/></w:rPr><w:t>Verschuldung&quot;',
                variable: 'Gessamtsumme Verschuldung',
                replacement: 'TOTAL_DEBT_PLACEHOLDER'
            },
            {
                pattern: '&quot;Heutiges </w:t></w:r><w:r><w:rPr><w:color w:val="1A1A1D"/><w:spacing w:val="-2"/></w:rPr><w:t>Datum&quot;',
                variable: 'Heutiges Datum',
                replacement: 'TODAY_DATE_PLACEHOLDER'
            },
            {
                pattern: '&quot;Aktenzeichen</w:t></w:r><w:r><w:rPr><w:rFonts w:ascii="Helvetica"/><w:color w:val="0E0F11"/><w:spacing w:val="-8"/></w:rPr><w:t> </w:t></w:r><w:r><w:rPr><w:rFonts w:ascii="Helvetica"/><w:color w:val="0E0F11"/><w:spacing w:val="-6"/></w:rPr><w:t>des </w:t></w:r><w:r><w:rPr><w:rFonts w:ascii="Helvetica"/><w:color w:val="0E0F11"/><w:spacing w:val="-2"/></w:rPr><w:t>Mandanten&quot;',
                variable: 'Aktenzeichen des Mandanten',
                replacement: 'CLIENT_REFERENCE_PLACEHOLDER'
            }
        ];

        // Test each pattern
        let processedXml = documentXml;
        let totalReplacements = 0;

        console.log('📋 Testing exact replacement patterns:\n');

        splitPatterns.forEach(({ pattern, variable, replacement }) => {
            const found = processedXml.includes(pattern);
            console.log(`🔍 "${variable}": ${found ? '✅ FOUND' : '❌ NOT FOUND'}`);
            
            if (found) {
                processedXml = processedXml.replace(pattern, replacement);
                totalReplacements++;
                console.log(`   ➡️ Replaced with: ${replacement}`);
            }
        });

        console.log(`\n📊 Summary: ${totalReplacements}/${splitPatterns.length} patterns replaced\n`);

        if (totalReplacements > 0) {
            // Create a test document to verify the replacements work
            zip.file('word/document.xml', processedXml);
            const outputBuffer = await zip.generateAsync({ type: 'nodebuffer' });
            const testPath = path.join(__dirname, 'documents/test-split-replacement.docx');
            
            // Ensure output directory exists
            const outputDir = path.dirname(testPath);
            if (!fs.existsSync(outputDir)) {
                fs.mkdirSync(outputDir, { recursive: true });
            }
            
            fs.writeFileSync(testPath, outputBuffer);
            console.log('✅ Test document created:', testPath);
            console.log('📏 File size:', Math.round(outputBuffer.length / 1024), 'KB');

            // Create code for the Word template processor
            console.log('\n🔧 Code to add to Word template processor:\n');
            
            console.log('// Add this to the processTemplate method before the existing variable replacement:');
            console.log('```javascript');
            console.log('// First, replace the complex split XML patterns with simple placeholders');
            console.log('const splitXmlReplacements = [');
            splitPatterns.forEach(({ pattern, variable, replacement }) => {
                console.log(`    {`);
                console.log(`        pattern: ${JSON.stringify(pattern)},`);
                console.log(`        variable: ${JSON.stringify(variable)},`);
                console.log(`        placeholder: ${JSON.stringify(replacement)}`);
                console.log(`    },`);
            });
            console.log('];');
            console.log('');
            console.log('splitXmlReplacements.forEach(({ pattern, placeholder }) => {');
            console.log('    if (processedXml.includes(pattern)) {');
            console.log('        processedXml = processedXml.replace(pattern, placeholder);');
            console.log('        console.log(`✅ Replaced split XML pattern with ${placeholder}`);');
            console.log('    }');
            console.log('});');
            console.log('```');
        }

    } catch (error) {
        console.error('❌ Error:', error.message);
    }
}

// Run the fix
fixSplitXmlVariables().then(() => {
    console.log('\n🏁 Split XML variable analysis completed.');
}).catch(error => {
    console.error('💥 Error:', error);
});