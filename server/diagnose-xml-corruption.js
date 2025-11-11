const JSZip = require('jszip');
const fs = require('fs');
const path = require('path');

async function diagnoseXmlCorruption() {
    console.log('🔍 Diagnosing XML corruption in Pfaendbares-Einkommen documents...\n');
    
    // Find the most recent file
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
        .sort((a, b) => b.stats.mtime - a.stats.mtime);
    
    if (pfaendbarFiles.length === 0) {
        console.log('❌ No files found');
        return;
    }
    
    const latestFile = pfaendbarFiles[0];
    console.log('📄 Analyzing:', latestFile.name);
    
    // Load and examine the XML
    const buffer = fs.readFileSync(latestFile.path);
    const zip = await JSZip.loadAsync(buffer);
    const documentXml = await zip.file('word/document.xml').async('string');
    
    console.log(`📄 Document XML length: ${documentXml.length} characters\n`);
    
    // Find the error location (around character 4221)
    const errorPos = 4221;
    const contextStart = Math.max(0, errorPos - 200);
    const contextEnd = Math.min(documentXml.length, errorPos + 200);
    const context = documentXml.substring(contextStart, contextEnd);
    
    console.log('🔍 XML context around error position (char 4221):');
    console.log('=' .repeat(60));
    console.log(context);
    console.log('=' .repeat(60));
    
    // Look for common XML corruption patterns
    console.log('\n🔍 Searching for XML corruption patterns:');
    
    // Pattern 1: Unescaped ampersands
    const unescapedAmpersands = documentXml.match(/&(?![a-zA-Z#][a-zA-Z0-9]*;)/g) || [];
    if (unescapedAmpersands.length > 0) {
        console.log(`❌ Found ${unescapedAmpersands.length} unescaped ampersands`);
        unescapedAmpersands.slice(0, 5).forEach((amp, i) => {
            const pos = documentXml.indexOf(amp);
            const start = Math.max(0, pos - 30);
            const end = Math.min(documentXml.length, pos + 30);
            console.log(`   ${i + 1}. "${documentXml.substring(start, end).replace(/\\n/g, '\\\\n')}"`);
        });
    } else {
        console.log('✅ No unescaped ampersands found');
    }
    
    // Pattern 2: Unclosed quotes in attributes
    const unclosedQuotes = documentXml.match(/="[^"]*$/gm) || [];
    if (unclosedQuotes.length > 0) {
        console.log(`❌ Found ${unclosedQuotes.length} unclosed quotes in attributes`);
        unclosedQuotes.slice(0, 3).forEach(quote => console.log(`   "${quote}"`));
    } else {
        console.log('✅ No unclosed quotes found');
    }
    
    // Pattern 3: Malformed tags (tags that don't close properly)
    const malformedTags = documentXml.match(/<[^>]*[^>]/g) || [];
    if (malformedTags.length > 0) {
        console.log(`❌ Found ${malformedTags.length} potentially malformed tags`);
    } else {
        console.log('✅ No obviously malformed tags found');
    }
    
    // Pattern 4: Look for replacement artifacts that might have broken XML
    console.log('\n🔍 Checking for replacement artifacts:');
    
    // Look for variables that weren't properly replaced
    const variablePatterns = [
        /&quot;[^&]*?&quot;/g,
        /"[^"]*?"/g,
        /PLACEHOLDER[^\\s<>]*/g
    ];
    
    variablePatterns.forEach((pattern, index) => {
        const matches = documentXml.match(pattern) || [];
        console.log(`   Pattern ${index + 1}: ${matches.length} matches`);
        if (matches.length > 0 && matches.length < 20) {
            matches.slice(0, 5).forEach(match => {
                if (match.length > 50) {
                    console.log(`     "${match.substring(0, 50)}..."`);
                } else {
                    console.log(`     "${match}"`);
                }
            });
        }
    });
    
    // Pattern 5: Look for specific tag mismatches
    console.log('\n🔍 Analyzing tag structure:');
    
    // Find all opening tags
    const openingTags = (documentXml.match(/<[a-zA-Z][^/>]*[^/]>/g) || []).filter(tag => !tag.endsWith('/>'));
    const closingTags = documentXml.match(/<\/[a-zA-Z][^>]*>/g) || [];
    const selfClosingTags = documentXml.match(/<[^>]*\/>/g) || [];
    
    console.log(`   Opening tags: ${openingTags.length}`);
    console.log(`   Closing tags: ${closingTags.length}`);
    console.log(`   Self-closing tags: ${selfClosingTags.length}`);
    
    // Check if there are specific tag types that are mismatched
    const tagCounts = {};
    
    // Count opening tags
    openingTags.forEach(tag => {
        const tagName = tag.match(/<([a-zA-Z:]+)/)?.[1];
        if (tagName) {
            tagCounts[tagName] = (tagCounts[tagName] || 0) + 1;
        }
    });
    
    // Subtract closing tags
    closingTags.forEach(tag => {
        const tagName = tag.match(/<\/([a-zA-Z:]+)/)?.[1];
        if (tagName) {
            tagCounts[tagName] = (tagCounts[tagName] || 0) - 1;
        }
    });
    
    // Show mismatched tags
    const mismatchedTags = Object.entries(tagCounts).filter(([tag, count]) => count !== 0);
    if (mismatchedTags.length > 0) {
        console.log('\n❌ Mismatched tags:');
        mismatchedTags.forEach(([tag, count]) => {
            console.log(`   ${tag}: ${count > 0 ? '+' : ''}${count} (${count > 0 ? 'unclosed' : 'extra closing'})`);
        });
    } else {
        console.log('✅ All tags appear balanced');
    }
    
    // Pattern 6: Look for broken XML around our placeholder replacements
    console.log('\n🔍 Checking placeholder replacement areas:');
    const placeholders = [
        'CREDITOR_ADDRESS_PLACEHOLDER',
        'CREDITOR_REFERENCE_PLACEHOLDER', 
        'CLIENT_NAME_PLACEHOLDER',
        'TOTAL_DEBT_PLACEHOLDER',
        'TODAY_DATE_PLACEHOLDER',
        'CLIENT_REFERENCE_PLACEHOLDER',
        'PFAENDBAR_INCOME_PLACEHOLDER',
        'MONTHLY_PFAENDBAR_PLACEHOLDER',
        'TOTAL_MONTHLY_PAYMENT_PLACEHOLDER',
        'PLAN_NUMBER_PLACEHOLDER',
        'DEADLINE_DATE_PLACEHOLDER'
    ];
    
    placeholders.forEach(placeholder => {
        const pos = documentXml.indexOf(placeholder);
        if (pos >= 0) {
            console.log(`❌ Unreplaced placeholder found: ${placeholder} at position ${pos}`);
            const start = Math.max(0, pos - 50);
            const end = Math.min(documentXml.length, pos + placeholder.length + 50);
            console.log(`   Context: "${documentXml.substring(start, end)}"`);
        }
    });
    
    console.log('\n🏁 Diagnosis complete.');
}

diagnoseXmlCorruption().catch(error => {
    console.error('💥 Diagnosis failed:', error);
});