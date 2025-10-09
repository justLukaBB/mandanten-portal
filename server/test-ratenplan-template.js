/**
 * Direct test of Ratenplan template processing
 */

const WordTemplateProcessor = require('./services/wordTemplateProcessor');

async function testRatenplanTemplate() {
    try {
        console.log('🧪 Testing Ratenplan template processing directly...');
        
        const templateProcessor = new WordTemplateProcessor();
        
        // Mock data for testing
        const clientReference = 'TEST123';
        const settlementData = {
            total_debt: 75000,
            monthly_payment: 450,
            creditor_payments: [
                {
                    creditor_name: 'Test Bank AG',
                    debt_amount: 25000,
                    name: 'Test Bank AG'
                },
                {
                    creditor_name: 'Versicherung GmbH', 
                    debt_amount: 15000,
                    name: 'Versicherung GmbH'
                },
                {
                    creditor_name: 'Finanzamt Test',
                    debt_amount: 35000,
                    name: 'Finanzamt Test'
                }
            ]
        };
        const pfaendbarAmount = 450;
        
        console.log('📊 Test data:', {
            clientReference,
            totalDebt: settlementData.total_debt,
            pfaendbarAmount,
            creditorCount: settlementData.creditor_payments.length
        });
        
        const result = await templateProcessor.processRatenplanTemplate(
            clientReference,
            settlementData,
            pfaendbarAmount
        );
        
        if (result.success) {
            console.log('✅ Template processing successful!');
            console.log('📁 Generated file:', result.filename);
            console.log('📏 File size:', Math.round(result.size / 1024), 'KB');
            console.log('📍 File path:', result.path);
        } else {
            console.log('❌ Template processing failed:', result.error);
        }
        
        return result;
        
    } catch (error) {
        console.error('❌ Test error:', error.message);
        console.error('   Stack:', error.stack);
        return { success: false, error: error.message };
    }
}

// Run the test if this file is executed directly
if (require.main === module) {
    testRatenplanTemplate().then(result => {
        console.log('\n🏁 Test completed');
        process.exit(result.success ? 0 : 1);
    });
}

module.exports = testRatenplanTemplate;