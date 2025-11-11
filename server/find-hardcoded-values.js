const fs = require('fs');
const JSZip = require('jszip');

async function findHardcodedValues() {
    try {
        const templatePath = './templates/Nullplan_Text_Template.docx';
        const templateBuffer = fs.readFileSync(templatePath);
        const zip = await JSZip.loadAsync(templateBuffer);
        const documentXml = await zip.file('word/document.xml').async('string');
        
        console.log('🔍 Searching for hardcoded values that need to be variables...\n');
        
        // Search for specific hardcoded patterns
        const hardcodedPatterns = [
            '904/24 TS-JK',
            '904/24',
            'TS-JK',
            'EOS Deutscher Inkasso',
            'Deutscher Inkasso',
            'Inkasso-Dienst',
            'Inkasso',
            'EOS'
        ];
        
        let foundCount = 0;
        hardcodedPatterns.forEach(pattern => {
            if (documentXml.includes(pattern)) {
                foundCount++;
                console.log(`❌ Found hardcoded: "${pattern}"`);
                
                // Get more context
                const index = documentXml.indexOf(pattern);
                const start = Math.max(0, index - 150);
                const end = Math.min(documentXml.length, index + pattern.length + 150);
                const context = documentXml.substring(start, end);
                
                console.log(`   Context: ...${context.substring(0, 250)}...`);
                console.log('');
            }
        });
        
        if (foundCount === 0) {
            console.log('✅ No hardcoded patterns found with direct search');
        }
        
        // Also search for text elements that might contain these values
        console.log('🔍 Searching for text elements containing potential hardcoded values...\n');
        
        const textMatches = documentXml.match(/<w:t[^>]*>[^<]+<\/w:t>/g);
        if (textMatches) {
            textMatches.forEach((match, index) => {
                const text = match.replace(/<[^>]+>/g, '');
                if (text.includes('904') || text.includes('TS-JK') || text.includes('EOS') || text.includes('Inkasso')) {
                    console.log(`📍 Text element ${index + 1}: ${match}`);
                    console.log(`   Content: "${text}"`);
                    console.log('');
                }
            });
        }
        
    } catch (error) {
        console.error('❌ Error:', error.message);
    }
}

findHardcodedValues();