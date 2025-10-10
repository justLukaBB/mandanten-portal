const fs = require('fs');
const JSZip = require('jszip');

async function analyzeCreditorHeader() {
    try {
        const templatePath = './templates/Nullplan_Text_Template.docx';
        const templateBuffer = fs.readFileSync(templatePath);
        const zip = await JSZip.loadAsync(templateBuffer);
        const documentXml = await zip.file('word/document.xml').async('string');
        
        console.log('🔍 Detailed analysis of creditor header area...\n');
        
        // Extract all text elements to understand document structure
        const textMatches = documentXml.match(/<w:t[^>]*>[^<]+<\/w:t>/g);
        
        if (textMatches) {
            console.log('📋 All text elements in order:\n');
            textMatches.forEach((match, index) => {
                const text = match.replace(/<[^>]+>/g, '');
                if (text.trim()) {
                    console.log(`${index + 1}: "${text}"`);
                }
            });
        }
        
        console.log('\n🎯 Looking for specific patterns...\n');
        
        // Look for the creditor address area specifically
        const addressAreaStart = documentXml.indexOf('Rechtsanwaltskanzlei Scuric, Bongardstraße');
        const addressAreaEnd = documentXml.indexOf('Ihre Forderung gegen');
        
        if (addressAreaStart !== -1 && addressAreaEnd !== -1) {
            const addressArea = documentXml.substring(addressAreaStart, addressAreaEnd);
            console.log('📍 Found creditor address area...');
            
            // Extract text elements from this area
            const addressTexts = addressArea.match(/<w:t[^>]*>[^<]+<\/w:t>/g);
            if (addressTexts) {
                console.log('📋 Text elements in address area:');
                addressTexts.forEach((match, index) => {
                    const text = match.replace(/<[^>]+>/g, '');
                    if (text.trim()) {
                        console.log(`  ${index + 1}: "${text}"`);
                    }
                });
            }
        }
        
        // Look for Aktenzeichen occurrences
        console.log('\n🔍 Analyzing Aktenzeichen occurrences...\n');
        
        const aktenzeichenRegex = /Aktenzeichen[^<>]*(?:<[^>]*>[^<]*)*?TS-JK/g;
        const aktenzeichenMatches = documentXml.match(aktenzeichenRegex);
        
        if (aktenzeichenMatches) {
            aktenzeichenMatches.forEach((match, index) => {
                console.log(`📍 Aktenzeichen occurrence ${index + 1}:`);
                console.log(`   ${match}`);
            });
        }
        
    } catch (error) {
        console.error('❌ Error:', error.message);
    }
}

analyzeCreditorHeader();