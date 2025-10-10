const fs = require('fs');
const path = require('path');
const JSZip = require('jszip');

async function extractActualVariables() {
    console.log('🔍 Extracting actual variables from Word template...\n');

    try {
        const templatePath = path.join(__dirname, 'templates/Template-Word-Pfaendbares-Einkommen.docx');
        const templateBuffer = fs.readFileSync(templatePath);
        const zip = await JSZip.loadAsync(templateBuffer);
        const documentXml = await zip.file('word/document.xml').async('string');

        // Extract all text that contains quotes and reconstruct the variables
        console.log('📋 Reconstructing variables from XML structure...\n');

        // First, let's look for the actual pattern with our analysis
        const htmlQuotedPattern = /&quot;[^&]*?&quot;/g;
        const htmlMatches = documentXml.match(htmlQuotedPattern);

        if (htmlMatches) {
            console.log('📄 Found HTML encoded quoted variables:');
            htmlMatches.forEach((match, index) => {
                const cleaned = match.replace(/&quot;/g, '"');
                console.log(`   ${index + 1}. ${cleaned}`);
            });
        }

        // Now let's extract the split variables by looking at the analysis output
        console.log('\n🔧 Extracting split variables from XML analysis...\n');

        // From the debug output, we can see these patterns:
        const splitVariablePatterns = [
            {
                pattern: '&quot;Adresse</w:t></w:r><w:r><w:rPr><w:color w:val="101012"/><w:spacing w:val="-7"/><w:sz w:val="22"/></w:rPr><w:t> </w:t></w:r><w:r><w:rPr><w:color w:val="101012"/><w:spacing w:val="-6"/><w:sz w:val="22"/></w:rPr><w:t>des</w:t></w:r><w:r><w:rPr><w:color w:val="101012"/><w:spacing w:val="-7"/><w:sz w:val="22"/></w:rPr><w:t> </w:t></w:r><w:r><w:rPr><w:color w:val="101012"/><w:spacing w:val="-6"/><w:sz w:val="22"/></w:rPr><w:t>Creditors</w:t></w:r><w:r><w:rPr><w:color w:val="101012"/><w:spacing w:val="-5"/><w:sz w:val="22"/></w:rPr><w:t> </w:t></w:r><w:r><w:rPr><w:color w:val="101012"/><w:spacing w:val="-10"/><w:sz w:val="22"/></w:rPr><w:t>&quot;',
                variable: 'Adresse des Creditors'
            },
            {
                pattern: '&quot;Aktenzeichen</w:t></w:r><w:r><w:rPr><w:color w:val="0E1012"/><w:spacing w:val="5"/><w:sz w:val="22"/></w:rPr><w:t> </w:t></w:r><w:r><w:rPr><w:color w:val="0E1012"/><w:spacing w:val="-8"/><w:sz w:val="22"/></w:rPr><w:t>der</w:t></w:r><w:r><w:rPr><w:color w:val="0E1012"/><w:spacing w:val="5"/><w:sz w:val="22"/></w:rPr><w:t> </w:t></w:r><w:r><w:rPr><w:color w:val="0E1012"/><w:spacing w:val="-8"/><w:sz w:val="22"/></w:rPr><w:t>Forderung&quot;',
                variable: 'Aktenzeichen der Forderung'
            },
            {
                pattern: '&quot;Name</w:t></w:r><w:r><w:rPr><w:color w:val="121215"/><w:spacing w:val="-12"/><w:sz w:val="22"/></w:rPr><w:t> </w:t></w:r><w:r><w:rPr><w:color w:val="121215"/><w:spacing w:val="-4"/><w:sz w:val="22"/></w:rPr><w:t>des</w:t></w:r><w:r><w:rPr><w:color w:val="121215"/><w:spacing w:val="-11"/><w:sz w:val="22"/></w:rPr><w:t> </w:t></w:r><w:r><w:rPr><w:color w:val="121215"/><w:spacing w:val="-4"/><w:sz w:val="22"/></w:rPr><w:t>Mandanten&quot;',
                variable: 'Name des Mandanten'
            },
            {
                pattern: '&quot;Gessamtsumme</w:t></w:r><w:r><w:rPr><w:color w:val="121215"/><w:spacing w:val="-16"/><w:sz w:val="22"/></w:rPr><w:t> </w:t></w:r><w:r><w:rPr><w:color w:val="121215"/><w:spacing w:val="-2"/><w:sz w:val="22"/></w:rPr><w:t>Verschuldung&quot;',
                variable: 'Gessamtsumme Verschuldung'
            },
            {
                pattern: '&quot;Heutiges </w:t></w:r><w:r><w:rPr><w:color w:val="1A1A1D"/><w:spacing w:val="-2"/></w:rPr><w:t>Datum&quot;',
                variable: 'Heutiges Datum'
            },
            {
                pattern: '&quot;Aktenzeichen</w:t></w:r><w:r><w:rPr><w:rFonts w:ascii="Helvetica"/><w:color w:val="0E0F11"/><w:spacing w:val="-8"/></w:rPr><w:t> </w:t></w:r><w:r><w:rPr><w:rFonts w:ascii="Helvetica"/><w:color w:val="0E0F11"/><w:spacing w:val="-6"/></w:rPr><w:t>des </w:t></w:r><w:r><w:rPr><w:rFonts w:ascii="Helvetica"/><w:color w:val="0E0F11"/><w:spacing w:val="-2"/></w:rPr><w:t>Mandanten&quot;',
                variable: 'Aktenzeichen des Mandanten'
            }
        ];

        console.log('📋 Split variables found in template:');
        splitVariablePatterns.forEach((item, index) => {
            const found = documentXml.includes(item.pattern);
            console.log(`   ${index + 1}. "${item.variable}": ${found ? '✅ FOUND' : '❌ NOT FOUND'}`);
        });

        // Now let's create a comprehensive mapping
        console.log('\n📊 Creating comprehensive variable mapping...\n');

        // Variables that work (from debug output)
        const workingVariables = [
            'Mandant',
            'Gläubigeranzahl', 
            'Geburtstag',
            'Familienstand',
            'Einkommen', // (split-XML match)
            'Forderungssumme',
            'Tilgungsqoute',
            'Immer der erste in 3 Monaten'
        ];

        // Variables that need special handling (split across XML)
        const splitVariables = [
            'Adresse des Creditors',
            'Aktenzeichen der Forderung', 
            'Name des Mandanten',
            'Gessamtsumme Verschuldung',
            'Heutiges Datum',
            'Aktenzeichen des Mandanten'
        ];

        // Variables that may not exist or need different names
        const missingVariables = [
            'pfändbares Einkommen',
            'monatlicher pfändbarer Betrag',
            'Summe für die Tilgung des Gläubigers monatlich',
            'Nummer im Schuldenbereinigungsplan',
            'Datum in 14 Tagen'
        ];

        console.log('✅ Working variables (9):');
        workingVariables.forEach((variable, index) => {
            console.log(`   ${index + 1}. "${variable}"`);
        });

        console.log('\n🔧 Split variables needing special handling (6):');
        splitVariables.forEach((variable, index) => {
            console.log(`   ${index + 1}. "${variable}"`);
        });

        console.log('\n❌ Missing/problematic variables (5):');
        missingVariables.forEach((variable, index) => {
            console.log(`   ${index + 1}. "${variable}"`);
        });

        // Let's also check for similar patterns that might be the missing variables
        console.log('\n🔍 Searching for similar patterns for missing variables...\n');

        const searchPatterns = [
            { search: 'pfändbar', variable: 'pfändbares Einkommen' },
            { search: 'monatlich', variable: 'monatlicher pfändbarer Betrag' },
            { search: 'Tilgung.*Gläubiger', variable: 'Summe für die Tilgung des Gläubigers' },
            { search: 'Nummer.*Schuldenbereinigung', variable: 'Nummer im Schuldenbereinigungsplan' },
            { search: '14.*Tag', variable: 'Datum in 14 Tagen' }
        ];

        searchPatterns.forEach(item => {
            const regex = new RegExp(item.search, 'i');
            const matches = documentXml.match(regex);
            console.log(`🔎 "${item.variable}": ${matches ? `Found ${matches.length} matches` : 'Not found'}`);
            if (matches && matches.length > 0) {
                matches.slice(0, 3).forEach((match, index) => {
                    console.log(`     ${index + 1}. ${match}`);
                });
            }
        });

    } catch (error) {
        console.error('❌ Error extracting variables:', error.message);
    }
}

// Run the extraction
extractActualVariables().then(() => {
    console.log('\n🏁 Variable extraction completed.');
}).catch(error => {
    console.error('💥 Extraction error:', error);
});