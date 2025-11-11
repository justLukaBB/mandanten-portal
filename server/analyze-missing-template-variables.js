const fs = require('fs');
const path = require('path');
const JSZip = require('jszip');

/**
 * Analyze template for missing variables and hardcoded text
 */
async function analyzeMissingTemplateVariables() {
    try {
        const templatePath = path.join(__dirname, 'templates/Nullplan_Text_Template.docx');
        
        if (!fs.existsSync(templatePath)) {
            console.error('❌ Template not found:', templatePath);
            return;
        }

        console.log('🔍 Analyzing template for missing variables and hardcoded text...\n');

        // Load template
        const templateBuffer = fs.readFileSync(templatePath);
        const zip = await JSZip.loadAsync(templateBuffer);
        const documentXml = await zip.file('word/document.xml').async('string');

        // Search for specific problematic text
        const problematicTexts = [
            'Max Mustermann',
            '01.08.2025',
            'Frau Laux',
            '904/24 TS-JK'
        ];

        console.log('🔍 Searching for hardcoded text that should be variables:');
        
        problematicTexts.forEach(text => {
            if (documentXml.includes(text)) {
                console.log(`\n⚠️ Found hardcoded text: "${text}"`);
                
                // Find all occurrences
                let startIndex = 0;
                let occurrences = 0;
                while ((startIndex = documentXml.indexOf(text, startIndex)) !== -1) {
                    occurrences++;
                    const context = documentXml.substring(Math.max(0, startIndex - 100), Math.min(documentXml.length, startIndex + text.length + 100));
                    console.log(`   Occurrence ${occurrences}: ...${context}...`);
                    startIndex += text.length;
                }
            } else {
                console.log(`✅ No hardcoded "${text}" found`);
            }
        });

        // Look for specific patterns that indicate missing variables
        console.log('\n🔍 Looking for potential missing variable patterns:');
        
        // Look for things that look like they should be variables but aren't quoted
        const potentialVariables = [
            /(\w+\s+\w+)\s+verfügt über Einkommen/g, // Client name before income
            /Aktenzeichen:\s*([^\s]+)/g, // Reference numbers
            /(\d{2}\.\d{2}\.\d{4})/g // Dates
        ];

        potentialVariables.forEach((pattern, index) => {
            const matches = [...documentXml.matchAll(pattern)];
            if (matches.length > 0) {
                console.log(`\nPattern ${index + 1}: ${pattern}`);
                matches.forEach((match, matchIndex) => {
                    console.log(`   Match ${matchIndex + 1}: "${match[1] || match[0]}"`);
                    const matchIndex2 = match.index;
                    const context = documentXml.substring(Math.max(0, matchIndex2 - 80), Math.min(documentXml.length, matchIndex2 + match[0].length + 80));
                    console.log(`   Context: ...${context}...`);
                });
            }
        });

        // Show all current quoted variables for reference
        console.log('\n📋 All current quoted variables in template:');
        const allQuotedRegex = /&quot;[^&]*?&quot;/g;
        const allMatches = documentXml.match(allQuotedRegex) || [];
        
        allMatches.forEach((match, index) => {
            const content = match.replace(/&quot;/g, '');
            console.log(`   ${index + 1}. "${content}"`);
        });

    } catch (error) {
        console.error('❌ Error:', error.message);
    }
}

analyzeMissingTemplateVariables();