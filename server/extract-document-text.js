const fs = require('fs');
const xml2js = require('xml2js');

// Read the XML file
const xmlContent = fs.readFileSync('./temp_extract_nullplan/word/document.xml', 'utf8');

// Function to extract text from Word document XML
function extractTextFromXML(xmlString) {
    let text = '';
    
    // Simple regex approach to extract text between <w:t> tags
    const regex = /<w:t[^>]*>(.*?)<\/w:t>/g;
    let match;
    
    while ((match = regex.exec(xmlString)) !== null) {
        if (match[1]) {
            text += match[1];
        }
    }
    
    return text;
}

// Extract text
const extractedText = extractTextFromXML(xmlContent);

// Write to file
fs.writeFileSync('./template-readable-text.txt', extractedText, 'utf8');

console.log('Text extracted and saved to template-readable-text.txt');
console.log('Total characters:', extractedText.length);