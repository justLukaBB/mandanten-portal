/**
 * Analysis of the new Nullplan Table Template and integration strategy
 * Compares the new template with current Nullplan generation system
 */

const fs = require('fs');
const path = require('path');

console.log('=== NULLPLAN TABLE TEMPLATE ANALYSIS ===\n');

// Read the analyzed template data
const templateAnalysis = JSON.parse(fs.readFileSync('template-variables.json', 'utf8'));

console.log('1. NEW TEMPLATE STRUCTURE:');
console.log('   Template Type:', templateAnalysis.templateType);
console.log('   Variables Required:', templateAnalysis.variables);
console.log('   Table Structure:');
console.log('     - Columns:', templateAnalysis.tableStructure.columns);
console.log('     - Max Rows:', templateAnalysis.tableStructure.maxRows);
console.log('     - Has Summary Row:', templateAnalysis.tableStructure.hasSummaryRow);
console.log('   Quota System:', templateAnalysis.quotaSystem);
console.log('   Fixed Values:', templateAnalysis.fixedValues);

console.log('\n2. CURRENT NULLPLAN GENERATION SYSTEM:');
console.log('   Current flow for Nullplan cases:');
console.log('   - Detection: settlementData.plan_type === "nullplan" OR pfaendbarAmount < 1');
console.log('   - Generation: generateNullplanRatenplanDocument()');
console.log('   - Template: Uses wordTemplateProcessor.processQuotenplanNullplanTemplate()');
console.log('   - Template File: templates/Nullplan_Text_Template.docx');
console.log('   - Output: Quotenplan-Nullplan document');

console.log('\n3. NEW TEMPLATE INTEGRATION STRATEGY:');

const integrationPlan = {
    templateFile: {
        current: 'templates/Nullplan_Text_Template.docx',
        new: 'templates/Tabelle Nullplan Template.docx',
        action: 'Replace or add alongside existing'
    },
    
    variableMapping: {
        description: 'Map new template variables to existing data structure',
        mappings: [
            {
                templateVar: 'Heutiges Datum',
                source: 'new Date().toLocaleDateString("de-DE")',
                current: 'clientData.currentDate'
            },
            {
                templateVar: 'Name Mandant',
                source: 'client.firstName + " " + client.lastName',
                current: 'clientData.fullName'
            },
            {
                templateVar: 'Datum in 3 Monaten',
                source: 'new Date(Date.now() + 3*30*24*60*60*1000).toLocaleDateString("de-DE")',
                current: 'calculated based on currentDate + 3 months'
            }
        ]
    },

    tableGeneration: {
        description: 'Generate creditor table with quota calculations',
        requirements: [
            'Extract creditor data from settlementData.creditor_payments or client.creditors',
            'Calculate total debt from all creditors',
            'Calculate quota percentage for each creditor (debt_amount / total_debt * 100)',
            'Format currency amounts in German format (1.234,56 EUR)',
            'Round quota percentages to 2 decimal places',
            'Ensure sum of quotas approximately equals 100%',
            'Handle up to 8 creditors (template limit)',
            'Add summary row with totals'
        ]
    },

    codeChanges: {
        description: 'Required code modifications',
        changes: [
            {
                file: 'services/wordTemplateProcessor.js',
                action: 'Add new method processNullplanTableTemplate()',
                details: 'Process the new table template with creditor data'
            },
            {
                file: 'services/documentGenerator.js',
                action: 'Update generateNullplanRatenplanDocument()',
                details: 'Route to new table template processor'
            },
            {
                file: 'services/wordTemplateProcessor.js',
                action: 'Add template path property',
                details: 'this.nullplanTableTemplatePath for new template'
            }
        ]
    },

    quotaCalculation: {
        description: 'Quota calculation system',
        algorithm: [
            '1. Get all creditor amounts from settlementData.creditor_payments',
            '2. Calculate totalDebt = sum of all creditor amounts',
            '3. For each creditor: quota = (creditor.debt_amount / totalDebt) * 100',
            '4. Round quota to 2 decimal places',
            '5. Handle rounding discrepancies (sum may not equal exactly 100%)',
            '6. Format amounts as German currency (1.234,56 EUR)',
            '7. Fill table rows (max 8 creditors, numbered 1-8)',
            '8. Add summary row with total amounts'
        ]
    }
};

console.log('   Template File Strategy:');
console.log('     - Current:', integrationPlan.templateFile.current);
console.log('     - New:', integrationPlan.templateFile.new);
console.log('     - Action:', integrationPlan.templateFile.action);

console.log('\n   Variable Mapping:');
integrationPlan.variableMapping.mappings.forEach((mapping, index) => {
    console.log(`     ${index + 1}. "${mapping.templateVar}"`);
    console.log(`        Source: ${mapping.source}`);
    console.log(`        Current: ${mapping.current}`);
});

console.log('\n   Table Generation Requirements:');
integrationPlan.tableGeneration.requirements.forEach((req, index) => {
    console.log(`     ${index + 1}. ${req}`);
});

console.log('\n   Code Changes Required:');
integrationPlan.codeChanges.changes.forEach((change, index) => {
    console.log(`     ${index + 1}. File: ${change.file}`);
    console.log(`        Action: ${change.action}`);
    console.log(`        Details: ${change.details}`);
});

console.log('\n   Quota Calculation Algorithm:');
integrationPlan.quotaCalculation.algorithm.forEach((step, index) => {
    console.log(`     ${step}`);
});

console.log('\n4. IMPLEMENTATION RECOMMENDATION:');
console.log('   Option A: Replace existing Nullplan template entirely');
console.log('     - Update wordTemplateProcessor.processQuotenplanNullplanTemplate()');
console.log('     - Use new table template for all Nullplan cases');
console.log('     - Simpler maintenance');
console.log('');
console.log('   Option B: Add new template as alternative');
console.log('     - Keep existing template for compatibility');
console.log('     - Add new processNullplanTableTemplate() method');
console.log('     - Allow choice between table and text format');
console.log('     - Better for gradual migration');

console.log('\n5. DATA FLOW ANALYSIS:');
console.log('   Current Nullplan Detection:');
console.log('     - Trigger: settlementData.plan_type === "nullplan" OR pfaendbarAmount < 1');
console.log('     - Path: generateNullplanRatenplanDocument() -> processQuotenplanNullplanTemplate()');
console.log('');
console.log('   Required Data for New Template:');
console.log('     - Client name (already available)');
console.log('     - Current date (already available)');
console.log('     - Start date (+3 months, needs calculation)');
console.log('     - Creditor list with amounts (available in settlementData.creditor_payments)');
console.log('     - Total debt calculation (needs sum of creditor amounts)');
console.log('     - Quota percentages (needs calculation)');

console.log('\n6. NEXT STEPS:');
console.log('   1. Create new template processor method for table template');
console.log('   2. Implement quota calculation logic');
console.log('   3. Add German currency formatting');
console.log('   4. Update document generator to use new template');
console.log('   5. Test with sample client data');
console.log('   6. Verify quota calculations sum to ~100%');

// Save the analysis
fs.writeFileSync('nullplan-table-integration-plan.json', JSON.stringify({
    templateAnalysis,
    integrationPlan,
    timestamp: new Date().toISOString()
}, null, 2));

console.log('\n✅ Analysis complete - integration plan saved to nullplan-table-integration-plan.json');