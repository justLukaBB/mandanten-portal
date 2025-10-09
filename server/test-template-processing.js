/**
 * Test script to check template processing
 */

const WordTemplateProcessor = require('./services/wordTemplateProcessor');

async function testTemplateProcessing() {
    try {
        console.log('🧪 Testing template processing...');
        
        const templateProcessor = new WordTemplateProcessor();
        
        // Mock data for testing
        const clientReference = 'TEST123';
        const settlementData = {
            total_debt: 50000,
            monthly_payment: 300,
            creditor_payments: [
                {
                    creditor_name: 'Test Gläubiger',
                    debt_amount: 25000
                }
            ]
        };
        const pfaendbarAmount = 300;
        
        const result = await templateProcessor.processRatenplanTemplate(
            clientReference,
            settlementData,
            pfaendbarAmount
        );
        
        console.log('✅ Template processing result:', result);
        
    } catch (error) {
        console.error('❌ Template processing error:', error);
    }
}

// Run the test if this file is executed directly
if (require.main === module) {
    testTemplateProcessing();
}

module.exports = testTemplateProcessing;