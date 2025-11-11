#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// Read the analysis results
const analysisFile = path.join(__dirname, 'nullplan-exact-variables.json');
const analysis = JSON.parse(fs.readFileSync(analysisFile, 'utf8'));

console.log('=== NULLPLAN TEMPLATE VARIABLE ANALYSIS SUMMARY ===\n');

console.log('🎯 CONFIRMED VARIABLES IN TEMPLATE (13 variables):');
console.log('These are the exact variable names found in quotes in the template:\n');

analysis.foundVariables.forEach((variable, i) => {
    console.log(`  ${i + 1}. "${variable}"`);
});

console.log('\n❌ VARIABLES NOT FOUND IN TEMPLATE (8 variables):');
console.log('These variables were expected but not found in the current template:\n');

analysis.missingVariables.forEach((variable, i) => {
    console.log(`  ${i + 1}. "${variable}"`);
});

console.log('\n📝 TEMPLATE VARIABLE MAPPING FOR CODE:');
console.log('Use this exact mapping in your Nullplan processing code:\n');

console.log('```javascript');
console.log('const templateVariables = {');
Object.entries(analysis.variableMapping).forEach(([templateVar, codeVar]) => {
    const found = analysis.foundVariables.includes(templateVar);
    const status = found ? '✓' : '✗';
    console.log(`  '${templateVar}': data.${codeVar} || '', // ${status}`);
});
console.log('};');
console.log('```');

console.log('\n🔧 RECOMMENDED ACTIONS:');
console.log('1. Update your Nullplan template processing code to use the exact variable names above');
console.log('2. Focus on the 13 confirmed variables that actually exist in the template');
console.log('3. The missing variables might be in other parts of the document or in different templates');
console.log('4. Test with a few variables first to confirm the mapping works');

console.log('\n📊 VARIABLE CATEGORIES:');
const categories = {
    client: ['Name Mandant', 'Mandant Name', 'Geburtstag', 'Familienstand', 'Einkommen'],
    creditor: ['Adresse des Creditors', 'Gläuibgeranzahl', 'Quote des Gläubigers'],
    financial: ['Schuldsumme Insgesamt', 'Forderungssumme', 'Forderungsnummer in der Forderungsliste'],
    dates: ['Heutiges Datum', 'Datum in 14 Tagen']
};

Object.entries(categories).forEach(([category, vars]) => {
    const foundInCategory = vars.filter(v => analysis.foundVariables.includes(v));
    console.log(`\n${category.toUpperCase()}: ${foundInCategory.length}/${vars.length} found`);
    foundInCategory.forEach(v => console.log(`  ✓ "${v}"`));
    const missing = vars.filter(v => !analysis.foundVariables.includes(v));
    missing.forEach(v => console.log(`  ✗ "${v}"`));
});

console.log('\n💡 NEXT STEPS:');
console.log('1. Update your Nullplan processing function with the confirmed variables');
console.log('2. Test document generation with sample data');
console.log('3. Check if missing variables appear in other Word template files');
console.log('4. Consider if some variables are hardcoded in the template rather than dynamic');

console.log(`\n📁 Files created:`);
console.log(`  - ${path.basename(analysisFile)} (detailed analysis)`);
console.log(`  - nullplan-template-raw-v2.xml (raw template XML)`);
console.log(`  - nullplan-template-cleaned.txt (cleaned template text)`);
console.log(`  - analyze-nullplan-template.js (first analysis script)`);
console.log(`  - analyze-nullplan-template-v2.js (improved analysis script)`);
console.log(`  - extract-nullplan-variables.js (final extraction script)`);
console.log(`  - nullplan-variable-summary.js (this summary script)`);