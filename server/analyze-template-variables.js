const fs = require('fs');

// Read the extracted text
const text = fs.readFileSync('./template-readable-text.txt', 'utf8');

// Define patterns to look for
const patterns = {
    dates: /\d{1,2}\.\d{1,2}\.\d{4}/g,
    aktenzeichen: /\d{3}\/\d{2}\s+[A-Z]{2}-[A-Z]{2}/g,
    amounts: /\d{1,3}(\.\d{3})*,\d{2}\s*€?/g,
    names: /(Anke\s+Laux|Thomas\s+Scuric|EOS\s+Deutscher)/g,
    addresses: /(Bongardstraße\s+\d+|Steindamm\s+\d+|44787\s+Bochum|20085\s+Hamburg)/g,
    phones: /\d{4}\s+\d{7}/g,
    bankDetails: /(Konto-Nr\.:\s*\d+\s+\d+\s+\d+|BLZ:\s*\d+\s+\d+\s+\d+)/g,
    hardcodedTexts: [
        'Rechtsanwaltskanzlei Scuric',
        'EOS Deutscher Inkasso Dienst', 
        'info@ra-scuric.de',
        'Deutsche Bank',
        'Anke Laux',
        'Thomas Scuric',
        '42883554201', // ID number
        '904/24 TS-JK', // Case number
        '05.03.1967', // Birth date
        '05.05.2025', // Document date
        '02.06.2025', // Deadline date
        '01.08.2025', // Plan date
        '25.947,78 €', // Total debt
        '4.413,46 €', // Individual claim
        '17,01%', // Quote percentage
        '540,00 €', // Income
        'Bongardstraße 33',
        '44787 Bochum',
        'Steindamm 71',
        '20085 Hamburg',
        '0234 9136810', // Phone
        '172 209 900', // Account number
        '430 700 24' // Bank code
    ]
};

console.log('=== TEMPLATE VARIABLE ANALYSIS ===\n');

// Find all dates
console.log('📅 DATES FOUND:');
const dates = text.match(patterns.dates) || [];
dates.forEach(date => console.log(`  - ${date}`));

// Find case numbers
console.log('\n📋 CASE NUMBERS:');
const caseNumbers = text.match(patterns.aktenzeichen) || [];
caseNumbers.forEach(cn => console.log(`  - ${cn}`));

// Find amounts
console.log('\n💰 AMOUNTS:');
const amounts = text.match(patterns.amounts) || [];
amounts.forEach(amount => console.log(`  - ${amount}`));

// Find names
console.log('\n👤 NAMES:');
const names = text.match(patterns.names) || [];
names.forEach(name => console.log(`  - ${name}`));

// Find addresses
console.log('\n🏠 ADDRESSES:');
const addresses = text.match(patterns.addresses) || [];
addresses.forEach(addr => console.log(`  - ${addr}`));

// Find phone numbers
console.log('\n📞 PHONE NUMBERS:');
const phones = text.match(patterns.phones) || [];
phones.forEach(phone => console.log(`  - ${phone}`));

// Find bank details
console.log('\n🏦 BANK DETAILS:');
const bankDetails = text.match(patterns.bankDetails) || [];
bankDetails.forEach(bank => console.log(`  - ${bank}`));

console.log('\n🔍 HARDCODED VALUES THAT SHOULD BE VARIABLES:');
patterns.hardcodedTexts.forEach(hardcoded => {
    if (text.includes(hardcoded)) {
        console.log(`  ✓ Found: "${hardcoded}"`);
    }
});

// Look for potential variable patterns
console.log('\n🎯 RECOMMENDED VARIABLES TO ADD:');
const recommendations = [
    { variable: '{{LAWYER_NAME}}', current: 'Thomas Scuric', description: 'Lawyer name' },
    { variable: '{{LAWYER_FIRM}}', current: 'Rechtsanwaltskanzlei Scuric', description: 'Law firm name' },
    { variable: '{{LAWYER_ADDRESS}}', current: 'Bongardstraße 33', description: 'Lawyer address' },
    { variable: '{{LAWYER_CITY}}', current: '44787 Bochum', description: 'Lawyer city' },
    { variable: '{{LAWYER_PHONE}}', current: '0234 9136810', description: 'Lawyer phone' },
    { variable: '{{LAWYER_EMAIL}}', current: 'info@ra-scuric.de', description: 'Lawyer email' },
    { variable: '{{CREDITOR_NAME}}', current: 'EOS Deutscher Inkasso Dienst', description: 'Creditor name' },
    { variable: '{{CREDITOR_ADDRESS}}', current: 'Steindamm 71', description: 'Creditor address' },
    { variable: '{{CREDITOR_CITY}}', current: '20085 Hamburg', description: 'Creditor city' },
    { variable: '{{DEBTOR_NAME}}', current: 'Anke Laux', description: 'Debtor name' },
    { variable: '{{DEBTOR_FIRST_NAME}}', current: 'Anke', description: 'Debtor first name' },
    { variable: '{{DEBTOR_LAST_NAME}}', current: 'Laux', description: 'Debtor last name' },
    { variable: '{{DEBTOR_ID}}', current: '42883554201', description: 'Debtor ID number' },
    { variable: '{{CASE_NUMBER}}', current: '904/24 TS-JK', description: 'Case/file number' },
    { variable: '{{DOCUMENT_DATE}}', current: '05.05.2025', description: 'Document creation date' },
    { variable: '{{DEADLINE_DATE}}', current: '02.06.2025', description: 'Response deadline date' },
    { variable: '{{PLAN_DATE}}', current: '01.08.2025', description: 'Plan start date' },
    { variable: '{{DEBTOR_BIRTH_DATE}}', current: '05.03.1967', description: 'Debtor birth date' },
    { variable: '{{TOTAL_DEBT}}', current: '25.947,78 €', description: 'Total debt amount' },
    { variable: '{{CLAIM_AMOUNT}}', current: '4.413,46 €', description: 'Individual claim amount' },
    { variable: '{{CLAIM_QUOTE}}', current: '17,01%', description: 'Claim quote percentage' },
    { variable: '{{DEBTOR_INCOME}}', current: '540,00 €', description: 'Debtor monthly income' },
    { variable: '{{CREDITOR_COUNT}}', current: '8', description: 'Number of creditors' },
    { variable: '{{CLAIM_NUMBER}}', current: '8', description: 'Claim number in list' },
    { variable: '{{BANK_NAME}}', current: 'Deutsche Bank', description: 'Bank name' },
    { variable: '{{ACCOUNT_NUMBER}}', current: '172 209 900', description: 'Account number' },
    { variable: '{{BANK_CODE}}', current: '430 700 24', description: 'Bank code (BLZ)' }
];

recommendations.forEach(rec => {
    console.log(`  ${rec.variable} → "${rec.current}" (${rec.description})`);
});

// Save the analysis
const analysis = {
    dates,
    caseNumbers,
    amounts,
    names,
    addresses,
    phones,
    bankDetails,
    recommendations
};

fs.writeFileSync('./template-variables.json', JSON.stringify(analysis, null, 2));
console.log('\n💾 Analysis saved to template-variables.json');