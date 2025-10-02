/**
 * Test script to generate a sample Nullplan document
 */

const NullplanTemplateGenerator = require('./services/nullplanTemplateGenerator');
const { Packer } = require('docx');
const fs = require('fs').promises;
const path = require('path');

async function testNullplanTemplate() {
    console.log('\n🧪 Testing New Nullplan Template\n');
    console.log('='.repeat(60));

    const generator = new NullplanTemplateGenerator();

    // Sample client data matching the template structure
    const clientData = {
        aktenzeichen: '904/24 TS-JK',
        personal_info: {
            first_name: 'Anke',
            last_name: 'Laux',
            birth_date: '1967-03-05',
            street: 'Musterstraße 123',
            postal_code: '12345',
            city: 'Berlin'
        },
        family_info: {
            marital_status: 'verheiratet',
            children_count: 0
        },
        financial_data: {
            monthly_net_income: 540,
            pfaendbar_amount: 0,
            recommended_plan_type: 'nullplan'
        },
        creditor_list: []  // Will be set below
    };

    // Sample creditors matching the template
    const creditorData = [
        {
            creditor_name: 'Sparkasse Berlin',
            creditor_street: 'Alexanderplatz 1',
            creditor_postal_code: '10178',
            creditor_city: 'Berlin',
            debt_amount: 5200.50,
            reference_number: 'SK-12345678',
            creditor_id: '1'
        },
        {
            creditor_name: 'Versandhaus Otto GmbH',
            creditor_street: 'Werner-Otto-Straße 1-7',
            creditor_postal_code: '22179',
            creditor_city: 'Hamburg',
            debt_amount: 1850.75,
            reference_number: 'VH-98765432',
            creditor_id: '2'
        },
        {
            creditor_name: 'Telekom Deutschland GmbH',
            creditor_street: 'Friedrich-Ebert-Allee 140',
            creditor_postal_code: '53113',
            creditor_city: 'Bonn',
            debt_amount: 892.30,
            creditor_id: '3'
        },
        {
            creditor_name: 'Stadtwerke München',
            creditor_street: 'Emmy-Noether-Straße 2',
            creditor_postal_code: '80287',
            creditor_city: 'München',
            debt_amount: 1256.80,
            creditor_id: '4'
        },
        {
            creditor_name: 'Inkasso Büro Nord',
            creditor_street: 'Hafenstraße 45',
            creditor_postal_code: '20457',
            creditor_city: 'Hamburg',
            debt_amount: 3450.00,
            reference_number: 'IB-2024-5566',
            creditor_id: '5'
        },
        {
            creditor_name: 'Kreditbank AG',
            creditor_street: 'Bankplatz 3',
            creditor_postal_code: '60311',
            creditor_city: 'Frankfurt am Main',
            debt_amount: 8750.25,
            reference_number: 'KB-789456123',
            creditor_id: '6'
        },
        {
            creditor_name: 'Versicherungs GmbH',
            creditor_street: 'Versicherungsweg 12',
            creditor_postal_code: '70173',
            creditor_city: 'Stuttgart',
            debt_amount: 950.00,
            creditor_id: '7'
        },
        {
            creditor_name: 'EOS Deutscher Inkasso Dienst',
            creditor_street: 'Steindamm 71',
            creditor_postal_code: '20085',
            creditor_city: 'Hamburg',
            debt_amount: 4413.46,
            reference_number: '42883554201',
            creditor_id: '8'
        }
    ];

    clientData.creditor_list = creditorData;

    try {
        console.log('\n📝 Generating Nullplan document...');
        console.log(`   Client: ${clientData.personal_info.first_name} ${clientData.personal_info.last_name}`);
        console.log(`   Aktenzeichen: ${clientData.aktenzeichen}`);
        console.log(`   Creditors: ${creditorData.length}`);

        const totalDebt = creditorData.reduce((sum, c) => sum + c.debt_amount, 0);
        console.log(`   Total Debt: €${totalDebt.toLocaleString('de-DE', { minimumFractionDigits: 2 })}`);

        // Generate the document
        const doc = await generator.generateNullplanDocument(clientData, creditorData);

        if (doc) {
            console.log('\n✅ Document object created successfully!');

            // Save to file
            const buffer = await Packer.toBuffer(doc);
            const outputPath = path.join(__dirname, 'documents',
                `Nullplan-TEST_${clientData.aktenzeichen.replace(/\//g, '-')}_${new Date().toISOString().split('T')[0]}.docx`);

            await fs.writeFile(outputPath, buffer);

            console.log('\n📄 Test document saved:');
            console.log(`   Path: ${outputPath}`);
            console.log(`   Size: ${Math.round(buffer.length / 1024)} KB`);

            console.log('\n✅ Test successful!');
            console.log('\n💡 Open the document to verify it matches the official template');

        } else {
            console.error('\n❌ Document generation returned null/undefined');
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
testNullplanTemplate()
    .then(() => {
        console.log('\n✅ Nullplan template test complete!\n');
        process.exit(0);
    })
    .catch((error) => {
        console.error('\n❌ Test failed:', error);
        process.exit(1);
    });