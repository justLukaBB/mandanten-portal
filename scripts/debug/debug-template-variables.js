const NewWordTemplateProcessor = require('./services/newWordTemplateProcessor');

async function debugTemplateVariables() {
    console.log('🔍 Debugging Word template variables...\n');

    const templateProcessor = new NewWordTemplateProcessor();

    try {
        // Analyze the template to see what's actually in there
        console.log('📄 Analyzing template structure...');
        await templateProcessor.analyzeTemplate();

        // Create a test processing to see what variables we're trying to replace
        console.log('\n🎯 Testing variable replacement...');
        
        const testClientData = {
            firstName: 'Max',
            lastName: 'Mustermann',
            aktenzeichen: 'DEBUG-TEST-001',
            financial_data: {
                monthly_net_income: 2500,
                number_of_children: 1,
                marital_status: 'married'
            },
            geburtstag: '15.03.1985'
        };

        const testSettlementData = {
            total_debt: 35000,
            creditor_payments: [
                {
                    creditor_name: 'Test Bank AG',
                    debt_amount: 15000,
                    creditor_address: 'Teststraße 123, 12345 Teststadt'
                },
                {
                    creditor_name: 'Test Sparkasse',
                    debt_amount: 20000,
                    creditor_address: 'Sparkassenweg 456, 54321 Musterstadt'
                }
            ]
        };

        const testCreditorData = {
            creditor_name: 'Test Bank AG',
            name: 'Test Bank AG',
            debt_amount: 15000,
            address: 'Teststraße 123, 12345 Teststadt',
            aktenzeichen: 'BANK-TEST-123'
        };

        // Process template with debug output
        const result = await templateProcessor.processTemplate(
            testClientData,
            testSettlementData,
            testCreditorData
        );

        if (result.success) {
            console.log('\n✅ Template processing successful!');
            console.log(`📁 Generated file: ${result.filename}`);
            console.log(`📏 File size: ${Math.round(result.size / 1024)} KB`);
            console.log(`🔄 Replacements made: ${result.replacements_made}`);
        } else {
            console.log('\n❌ Template processing failed:', result.error);
        }

        // Now let's examine what variables are actually in the template
        console.log('\n🔍 Detailed analysis of template content...');
        
        const fs = require('fs');
        const path = require('path');
        const JSZip = require('jszip');

        const templatePath = path.join(__dirname, 'templates/Template-Word-Pfaendbares-Einkommen.docx');
        const templateBuffer = fs.readFileSync(templatePath);
        const zip = await JSZip.loadAsync(templateBuffer);
        const documentXml = await zip.file('word/document.xml').async('string');

        // Extract all quoted text patterns
        console.log('\n📋 All quoted text in template (first 20):');
        
        const allQuotedPatterns = [
            /&quot;[^&]*?&quot;/g,
            /"[^"]*?"/g,
            /"[^"]*?"/g
        ];

        let allMatches = new Set();
        
        allQuotedPatterns.forEach((pattern, index) => {
            const matches = documentXml.match(pattern);
            if (matches) {
                matches.forEach(match => allMatches.add(match));
            }
        });

        const sortedMatches = Array.from(allMatches).sort();
        sortedMatches.slice(0, 20).forEach((match, index) => {
            console.log(`   ${index + 1}. ${match}`);
        });

        if (sortedMatches.length > 20) {
            console.log(`   ... and ${sortedMatches.length - 20} more`);
        }

        // Look specifically for variables we're trying to replace
        console.log('\n🎯 Looking for our specific variables:');
        const ourVariables = [
            'Adresse des Creditors',
            'Mandant',
            'Aktenzeichen der Forderung',
            'Name des Mandanten',
            'Gläubigeranzahl',
            'Gessamtsumme Verschuldung',
            'Heutiges Datum',
            'Geburtstag',
            'Familienstand',
            'Einkommen',
            'pfändbares Einkommen',
            'Forderungssumme',
            'Tilgungsqoute'
        ];

        ourVariables.forEach(variable => {
            const htmlEncoded = documentXml.includes(`&quot;${variable}&quot;`);
            const regularQuotes = documentXml.includes(`"${variable}"`);
            const curlyQuotes = documentXml.includes(`"${variable}"`);
            const plainText = documentXml.includes(variable);
            
            console.log(`   "${variable}"`);
            console.log(`     HTML encoded (&quot;): ${htmlEncoded ? '✅' : '❌'}`);
            console.log(`     Regular quotes ("): ${regularQuotes ? '✅' : '❌'}`);
            console.log(`     Curly quotes (""): ${curlyQuotes ? '✅' : '❌'}`);
            console.log(`     Plain text: ${plainText ? '✅' : '❌'}`);
        });

    } catch (error) {
        console.error('❌ Debug failed:', error.message);
        console.error(error.stack);
    }
}

// Run the debug
debugTemplateVariables().then(() => {
    console.log('\n🏁 Debug completed.');
}).catch(error => {
    console.error('💥 Debug error:', error);
});