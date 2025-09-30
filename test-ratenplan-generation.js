const DocumentGenerator = require('./server/services/documentGenerator');

async function testRatenplanGeneration() {
    console.log('📄 Testing Ratenplan pfändbares Einkommen document generation...');

    const documentGenerator = new DocumentGenerator();

    // Test data
    const testClientReference = 'TEST-2025-001';
    const testSettlementData = {
        monthly_payment: 880.78,
        duration_months: 36,
        total_debt: 97357.73,
        average_quota_percentage: 32.57,
        plan_type: 'ratenzahlung',
        creditor_payments: [
            {
                creditor_name: "Finanzamt Bochum-Süd",
                debt_amount: 1677.64,
                quota_percentage: 1.72
            },
            {
                creditor_name: "Telekom Deutschland GmbH", 
                debt_amount: 1587.13,
                quota_percentage: 1.63
            },
            {
                creditor_name: "Real Inkasso GmbH & Co. KG",
                debt_amount: 772.12,
                quota_percentage: 0.79
            }
        ]
    };

    // Mock client data
    const mockClientData = {
        name: "Alexander Drewitz",
        email: "test@example.com", 
        reference: testClientReference
    };

    const pfaendbarAmount = 880.78;

    try {
        console.log('🔧 Generating test document...');

        // Test the new document generation method directly
        const doc = await documentGenerator.generateRatenplanDocument(
            mockClientData, 
            testSettlementData, 
            pfaendbarAmount
        );

        // Save the document
        const result = await documentGenerator.saveRatenplanDocument(doc, testClientReference);

        console.log('✅ Test document generation successful!');
        console.log(`📁 Generated file: ${result.filename}`);
        console.log(`📍 File path: ${result.path}`);
        console.log(`📊 File size: ${Math.round(result.size / 1024)} KB`);

        return {
            success: true,
            filename: result.filename,
            path: result.path,
            size: result.size
        };

    } catch (error) {
        console.error('❌ Test document generation failed:', error.message);
        console.error('Stack trace:', error.stack);
        
        return {
            success: false,
            error: error.message
        };
    }
}

// Run the test
if (require.main === module) {
    testRatenplanGeneration()
        .then(result => {
            if (result.success) {
                console.log('🎉 Test completed successfully!');
                console.log(`Check the generated document: ${result.path}`);
            } else {
                console.log('💥 Test failed!');
                process.exit(1);
            }
        })
        .catch(error => {
            console.error('💥 Test execution failed:', error);
            process.exit(1);
        });
}

module.exports = testRatenplanGeneration;