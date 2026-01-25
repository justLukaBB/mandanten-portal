#!/usr/bin/env node
/**
 * Simple test script for Settlement Response Content Analysis
 */

// Import the settlement response processor
const SettlementResponseProcessor = require('./server/services/settlementResponseProcessor');

// Create processor instance
const processor = new SettlementResponseProcessor();

console.log('🧪 Testing Settlement Response Content Analysis\n');

// Test cases
const testCases = [
    {
        name: 'Clear Acceptance',
        content: 'Sehr geehrte Damen und Herren,\n\nwir sind einverstanden mit dem Schuldenbereinigungsplan und stimmen zu.\n\nMit freundlichen Grüßen'
    },
    {
        name: 'Clear Rejection', 
        content: 'Sehr geehrte Damen und Herren,\n\nlehnen wir ab. Der Betrag ist nicht akzeptabel.\n\nMit freundlichen Grüßen'
    },
    {
        name: 'Counter Offer',
        content: 'Sehr geehrte Damen und Herren,\n\nwir schlagen vor eine Ratenzahlung von 50€ monatlich unter der Bedingung...\n\nMit freundlichen Grüßen'
    },
    {
        name: 'Mixed Signals',
        content: 'Wir sind grundsätzlich einverstanden, jedoch können wir nicht den vollen Betrag akzeptieren'
    },
    {
        name: 'No Clear Response',
        content: 'Danke für Ihr Schreiben. Wir werden dies prüfen und uns baldmöglichst melden.'
    },
    {
        name: 'Strong Acceptance Pattern',
        content: 'Wir akzeptieren den vorgeschlagenen Schuldenbereinigungsplan vollständig.'
    },
    {
        name: 'Strong Rejection Pattern',
        content: 'Wir lehnen ab den Vorschlag und können nicht zustimmen.'
    }
];

// Run tests
testCases.forEach((testCase, index) => {
    console.log(`\n--- Test ${index + 1}: ${testCase.name} ---`);
    console.log(`Content: "${testCase.content.substring(0, 60)}..."`);
    
    try {
        const result = processor.analyzeResponseContent(testCase.content);
        
        console.log(`✅ Status: ${result.status}`);
        console.log(`🎯 Confidence: ${result.confidence}`);
        console.log(`🔍 Keywords Found: ${result.keywords_found.join(', ')}`);
        console.log(`📝 Analysis Notes: ${result.analysis_notes?.join(', ') || 'None'}`);
        console.log(`📏 Content Length: ${result.content_length}`);
        console.log(`📊 Counts - Accept: ${result.acceptance_count}, Reject: ${result.rejection_count}, Counter: ${result.counter_offer_count}`);
    } catch (error) {
        console.log(`❌ Error: ${error.message}`);
    }
});

console.log('\n🏁 Settlement Response Content Analysis Test Complete!');
console.log('\n📋 Test Summary:');
console.log('- Enhanced keyword detection with German language patterns');
console.log('- Context-aware analysis with pattern matching');
console.log('- Email signature cleaning');  
console.log('- Confidence scoring based on keyword strength');
console.log('- Mixed signal handling with prioritization');
console.log('- Counter-offer detection for Euro amounts and payment terms');