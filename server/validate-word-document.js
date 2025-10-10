const JSZip = require('jszip');
const fs = require('fs');
const path = require('path');

async function validateWordDocument() {
    console.log('🔍 Validating generated Word document...\n');
    
    // Find the most recent generated document
    const documentsDir = path.join(__dirname, 'documents');
    const files = fs.readdirSync(documentsDir);
    
    const pfaendbarFiles = files
        .filter(f => f.includes('Pfaendbares-Einkommen'))
        .filter(f => f.endsWith('.docx'))
        .filter(f => !f.startsWith('~$')) // Exclude Word temp files
        .sort()
        .reverse();
    
    if (pfaendbarFiles.length === 0) {
        console.log('❌ No Pfaendbares-Einkommen documents found');
        return;
    }
    
    const latestFile = pfaendbarFiles[0];
    const filePath = path.join(documentsDir, latestFile);
    
    console.log('📄 Testing file:', latestFile);
    console.log('📁 Full path:', filePath);
    
    try {
        // Check file stats
        const stats = fs.statSync(filePath);
        console.log('📏 File size:', Math.round(stats.size / 1024), 'KB');
        console.log('📅 Last modified:', stats.mtime.toISOString());
        
        // Try to load with JSZip
        const buffer = fs.readFileSync(filePath);
        console.log('\n🔄 Loading with JSZip...');
        
        const zip = await JSZip.loadAsync(buffer);
        
        // Check essential Word document files
        const requiredFiles = [
            'word/document.xml',
            'word/_rels/document.xml.rels',
            '[Content_Types].xml',
            '_rels/.rels'
        ];
        
        console.log('\n📋 Checking required Word document structure:');
        let allRequiredPresent = true;
        
        for (const requiredFile of requiredFiles) {
            const exists = zip.file(requiredFile) !== null;
            console.log(`   ${exists ? '✅' : '❌'} ${requiredFile}`);
            if (!exists) allRequiredPresent = false;
        }
        
        if (!allRequiredPresent) {
            console.log('\n❌ Document structure is invalid - missing required files');
            return false;
        }
        
        // Check document.xml specifically
        console.log('\n🔍 Validating document.xml:');
        const documentXml = await zip.file('word/document.xml').async('string');
        
        // Basic XML structure checks
        if (!documentXml.startsWith('<?xml')) {
            console.log('❌ Missing XML declaration');
            return false;
        }
        
        if (!documentXml.includes('<w:document')) {
            console.log('❌ Missing Word document root element');
            return false;
        }
        
        if (!documentXml.includes('</w:document>')) {
            console.log('❌ Unclosed Word document root element');
            return false;
        }
        
        // Check for unmatched quotes or malformed XML that could cause corruption
        const xmlParser = require('xml2js');
        try {
            await xmlParser.parseStringPromise(documentXml);
            console.log('✅ XML is well-formed');
        } catch (xmlError) {
            console.log('❌ XML parsing error:', xmlError.message);
            
            // Look for common XML issues
            const issues = [];
            
            // Check for unescaped ampersands
            const unescapedAmpersands = documentXml.match(/&(?![a-zA-Z#][a-zA-Z0-9]*;)/g);
            if (unescapedAmpersands) {
                issues.push(`Unescaped ampersands found: ${unescapedAmpersands.length}`);
            }
            
            // Check for unmatched quotes in attributes
            const unmatchedQuotes = documentXml.match(/="[^"]*$/gm);
            if (unmatchedQuotes) {
                issues.push(`Unmatched quotes in attributes: ${unmatchedQuotes.length}`);
            }
            
            // Check for broken tag structure
            const brokenTags = documentXml.match(/<[^>]*[^>]/g);
            if (brokenTags) {
                issues.push(`Potentially broken tags found`);
            }
            
            if (issues.length > 0) {
                console.log('🔍 Specific XML issues found:');
                issues.forEach(issue => console.log(`   - ${issue}`));
            }
            
            return false;
        }
        
        // Check content types
        console.log('\n🔍 Validating content types:');
        const contentTypesXml = await zip.file('[Content_Types].xml').async('string');
        
        if (!contentTypesXml.includes('application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml')) {
            console.log('❌ Missing main document content type');
            return false;
        }
        
        console.log('✅ Content types are valid');
        
        // Check relationships
        console.log('\n🔍 Validating relationships:');
        const relsXml = await zip.file('_rels/.rels').async('string');
        
        if (!relsXml.includes('word/document.xml')) {
            console.log('❌ Missing relationship to main document');
            return false;
        }
        
        console.log('✅ Relationships are valid');
        
        console.log('\n✅ Document validation PASSED - structure appears valid');
        console.log('📄 This document should open correctly in Microsoft Word');
        
        return true;
        
    } catch (error) {
        console.log('\n❌ Document validation FAILED');
        console.log('💥 Error:', error.message);
        
        if (error.message.includes('invalid signature')) {
            console.log('🔍 This suggests the ZIP structure is corrupted');
        } else if (error.message.includes('unexpected end')) {
            console.log('🔍 This suggests the file was truncated during generation');
        } else if (error.message.includes('compression')) {
            console.log('🔍 This suggests compression issues during ZIP generation');
        }
        
        return false;
    }
}

// Add XML parser dependency check
try {
    require('xml2js');
} catch (e) {
    console.log('Installing xml2js for validation...');
    require('child_process').execSync('npm install xml2js', { stdio: 'inherit' });
}

validateWordDocument().then(success => {
    console.log(`\n🏁 Validation ${success ? 'completed successfully' : 'failed'}`);
}).catch(error => {
    console.error('💥 Validation error:', error);
});