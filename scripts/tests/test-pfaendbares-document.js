const JSZip = require('jszip');
const fs = require('fs');
const path = require('path');
const xml2js = require('xml2js');

async function testPfaendbaresDocument() {
    console.log('🔍 Testing Pfaendbares-Einkommen document validation...\n');
    
    // Find the most recent Pfaendbares-Einkommen document
    const documentsDir = path.join(__dirname, 'documents');
    const files = fs.readdirSync(documentsDir);
    
    const pfaendbarFiles = files
        .filter(f => f.includes('Pfaendbares-Einkommen'))
        .filter(f => f.endsWith('.docx'))
        .filter(f => !f.startsWith('~$'))
        .map(f => ({
            name: f,
            path: path.join(documentsDir, f),
            stats: fs.statSync(path.join(documentsDir, f))
        }))
        .sort((a, b) => b.stats.mtime - a.stats.mtime); // Sort by most recent
    
    if (pfaendbarFiles.length === 0) {
        console.log('❌ No Pfaendbares-Einkommen documents found');
        return false;
    }
    
    const latestFile = pfaendbarFiles[0];
    console.log('📄 Testing most recent file:', latestFile.name);
    console.log('📁 Full path:', latestFile.path);
    console.log('📏 File size:', Math.round(latestFile.stats.size / 1024), 'KB');
    console.log('📅 Created:', latestFile.stats.mtime.toISOString());
    
    try {
        // Load the document
        const buffer = fs.readFileSync(latestFile.path);
        console.log('\n🔄 Loading document with JSZip...');
        
        const zip = await JSZip.loadAsync(buffer);
        console.log('✅ ZIP structure loaded successfully');
        
        // Verify essential files
        const requiredFiles = [
            'word/document.xml',
            'word/_rels/document.xml.rels', 
            '[Content_Types].xml',
            '_rels/.rels'
        ];
        
        console.log('\n📋 Checking document structure:');
        for (const file of requiredFiles) {
            const exists = zip.file(file) !== null;
            console.log(`   ${exists ? '✅' : '❌'} ${file}`);
            if (!exists) {
                throw new Error(`Missing required file: ${file}`);
            }
        }
        
        // Load and validate the main document XML
        console.log('\n🔍 Validating document.xml:');
        const documentXml = await zip.file('word/document.xml').async('string');
        console.log(`   📄 Document XML length: ${documentXml.length} characters`);
        
        // Check XML structure
        if (!documentXml.startsWith('<?xml')) {
            throw new Error('Missing XML declaration');
        }
        console.log('   ✅ XML declaration present');
        
        if (!documentXml.includes('<w:document')) {
            throw new Error('Missing Word document root element');
        }
        console.log('   ✅ Word document root element present');
        
        // Validate XML syntax
        try {
            await xml2js.parseStringPromise(documentXml);
            console.log('   ✅ XML syntax is valid');
        } catch (xmlError) {
            console.log('   ❌ XML syntax error:', xmlError.message);
            
            // Look for specific issues that could cause Word corruption
            console.log('\n🔍 Analyzing XML issues:');
            
            // Check for unescaped entities
            const unescapedAmpersands = (documentXml.match(/&(?![a-zA-Z#][a-zA-Z0-9]*;)/g) || []).length;
            if (unescapedAmpersands > 0) {
                console.log(`   ❌ Found ${unescapedAmpersands} unescaped ampersands`);
            }
            
            // Check for malformed attributes
            const malformedAttrs = (documentXml.match(/="[^"]*$/gm) || []).length;
            if (malformedAttrs > 0) {
                console.log(`   ❌ Found ${malformedAttrs} malformed attributes`);
            }
            
            // Check for unclosed tags
            const openTags = (documentXml.match(/<[^/>]+>/g) || []).length;
            const closeTags = (documentXml.match(/<\/[^>]+>/g) || []).length;
            const selfClosingTags = (documentXml.match(/<[^>]*\/>/g) || []).length;
            
            console.log(`   📊 Tag analysis: ${openTags} open, ${closeTags} close, ${selfClosingTags} self-closing`);
            
            if (openTags - selfClosingTags !== closeTags) {
                console.log(`   ❌ Tag mismatch: ${openTags - selfClosingTags} open vs ${closeTags} close`);
            }
            
            throw xmlError;
        }
        
        // Check content types
        console.log('\n🔍 Validating content types:');
        const contentTypesXml = await zip.file('[Content_Types].xml').async('string');
        
        if (!contentTypesXml.includes('application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml')) {
            throw new Error('Missing main document content type');
        }
        console.log('   ✅ Main document content type present');
        
        // Check relationships
        console.log('\n🔍 Validating relationships:');
        const relsXml = await zip.file('_rels/.rels').async('string');
        
        if (!relsXml.includes('word/document.xml')) {
            throw new Error('Missing relationship to main document');
        }
        console.log('   ✅ Main document relationship present');
        
        // Test regeneration with proper compression
        console.log('\n🔄 Testing document regeneration...');
        const regeneratedBuffer = await zip.generateAsync({ 
            type: 'nodebuffer',
            compression: 'DEFLATE',
            compressionOptions: {
                level: 6
            }
        });
        
        console.log(`   📏 Original size: ${Math.round(buffer.length / 1024)} KB`);
        console.log(`   📏 Regenerated size: ${Math.round(regeneratedBuffer.length / 1024)} KB`);
        
        // Save a test copy
        const testPath = path.join(documentsDir, 'VALIDATION_TEST_' + latestFile.name);
        fs.writeFileSync(testPath, regeneratedBuffer);
        console.log(`   💾 Test copy saved: ${path.basename(testPath)}`);
        
        // Try to load the regenerated version
        const testZip = await JSZip.loadAsync(regeneratedBuffer);
        const testDocXml = await testZip.file('word/document.xml').async('string');
        
        if (testDocXml.length === documentXml.length) {
            console.log('   ✅ Regenerated document matches original');
        } else {
            console.log('   ⚠️ Regenerated document size differs');
        }
        
        console.log('\n✅ VALIDATION PASSED - Document appears to be valid');
        console.log('📄 This document should open correctly in Microsoft Word');
        
        return true;
        
    } catch (error) {
        console.log('\n❌ VALIDATION FAILED');
        console.log('💥 Error:', error.message);
        
        // Provide specific guidance based on error type
        if (error.message.includes('invalid signature') || error.message.includes('zip file')) {
            console.log('🔍 ROOT CAUSE: ZIP structure corruption');
            console.log('💡 SOLUTION: Check JSZip generation options and compression settings');
        } else if (error.message.includes('XML')) {
            console.log('🔍 ROOT CAUSE: XML structure corruption'); 
            console.log('💡 SOLUTION: Check variable replacement patterns and XML escaping');
        } else if (error.message.includes('unexpected end')) {
            console.log('🔍 ROOT CAUSE: File truncation during generation');
            console.log('💡 SOLUTION: Check file write operations and buffer handling');
        }
        
        return false;
    }
}

testPfaendbaresDocument().then(success => {
    console.log(`\n🏁 Test ${success ? 'PASSED' : 'FAILED'}`);
    process.exit(success ? 0 : 1);
}).catch(error => {
    console.error('💥 Test error:', error);
    process.exit(1);
});