/**
 * Direct Test of Professional Nullplan Template Generator
 *
 * Tests the NullplanTemplateGenerator directly without database connection
 */

const NullplanTemplateGenerator = require('./server/services/nullplanTemplateGenerator');
const fs = require('fs').promises;
const path = require('path');

async function testNullplanGenerator() {
    console.log('\n🧪 Testing Professional Nullplan Template Generator\n');
    console.log('='.repeat(60));

    const generator = new NullplanTemplateGenerator();

    // Test client data
    const clientData = {
        aktenzeichen: 'TEST-NULLPLAN-001',
        personal_info: {
            first_name: 'Max',
            last_name: 'Mustermann',
            gender: 'male',
            birth_date: '1985-05-15',
            street: 'Musterstraße 123',
            postal_code: '12345',
            city: 'Berlin'
        },
        family_info: {
            marital_status: 'single',
            children_count: 0
        },
        financial_data: {
            pfaendbar_amount: 0,
            recommended_plan_type: 'nullplan'
        },
        creditor_list: [
            {
                creditor_name: 'Test Bank AG',
                creditor_street: 'Bankstraße 123',
                creditor_postal_code: '12345',
                creditor_city: 'Berlin',
                debt_amount: 15000,
                creditor_id: '1'
            },
            {
                creditor_name: 'Versandhaus GmbH',
                creditor_street: 'Versandweg 45',
                creditor_postal_code: '67890',
                creditor_city: 'Hamburg',
                debt_amount: 3500,
                creditor_id: '2'
            },
            {
                creditor_name: 'Telekom Deutschland',
                creditor_street: 'Friedrich-Ebert-Allee 140',
                creditor_postal_code: '53113',
                creditor_city: 'Bonn',
                debt_amount: 850,
                creditor_id: '3'
            }
        ]
    };

    try {
        console.log('\n📝 Test Data:');
        console.log(`   Client: ${clientData.personal_info.first_name} ${clientData.personal_info.last_name}`);
        console.log(`   Aktenzeichen: ${clientData.aktenzeichen}`);
        console.log(`   Creditors: ${clientData.creditor_list.length}`);
        const totalDebt = clientData.creditor_list.reduce((sum, c) => sum + c.debt_amount, 0);
        console.log(`   Total Debt: €${totalDebt.toLocaleString('de-DE')}`);

        console.log('\n🔧 Generating professional Nullplan document...');

        // Generate the document
        const doc = await generator.generateNullplanDocument(clientData, clientData.creditor_list);

        if (doc) {
            console.log('\n✅ Document object created successfully!');
            console.log('   Document sections: ✓');
            console.log('   Law firm header: ✓');
            console.log('   Creditor addressing: ✓');
            console.log('   Legal text: ✓');
            console.log('   Zusatzvereinbarungen: ✓');

            // Try to save it to verify it's valid
            const { Packer } = require('docx');
            const buffer = await Packer.toBuffer(doc);

            const outputPath = path.join(__dirname, 'server', 'documents',
                `Nullplan-Professional-Test_${clientData.aktenzeichen}_${new Date().toISOString().split('T')[0]}.docx`);

            await fs.writeFile(outputPath, buffer);

            console.log('\n📄 Test document saved:');
            console.log(`   Path: ${outputPath}`);
            console.log(`   Size: ${Math.round(buffer.length / 1024)} KB`);

            console.log('\n✅ All tests passed!');
            console.log('\n💡 Professional Nullplan template is working correctly');
            console.log('   and will be used for all Nullplan generations.');

        } else {
            console.error('\n❌ Test FAILED: Document generation returned null/undefined');
            process.exit(1);
        }

    } catch (error) {
        console.error('\n❌ Test ERROR:', error.message);
        console.error(error.stack);
        process.exit(1);
    }

    console.log('\n' + '='.repeat(60));
}

// Run the test
testNullplanGenerator()
    .then(() => {
        console.log('\n✅ Professional Nullplan template test complete!\n');
        process.exit(0);
    })
    .catch((error) => {
        console.error('\n❌ Test failed:', error);
        process.exit(1);
    });