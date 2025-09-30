// Integration script to enhance quick-field-mapper.js with template-based checkbox configuration
// This script will update your existing mapper with the extracted default checkboxes

const fs = require('fs').promises;
const path = require('path');

const CHECKBOX_CONFIG = require('./insolvenzantrag-checkbox-config');

/**
 * Integration helper to apply template-based checkbox configuration
 * to your existing PDF form filling process
 */
class InsolvenzantragCheckboxIntegrator {
    
    /**
     * Apply the default checkboxes from the template analysis
     * Use this in your fillInsolvenzantrag function for clients with pfändbares Einkommen
     */
    static applyTemplateCheckboxes(form, clientData = {}) {
        console.log('🔲 Starting checkbox integration for Insolvenzantrag...');
        
        // Check if client has attachable income
        const hasPfaendbaresEinkommen = clientData.hasPfaendbaresEinkommen || 
                                       clientData.attachableIncome || 
                                       clientData.employment_status === 'employed';

        if (hasPfaendbaresEinkommen) {
            console.log('✅ Client has pfändbares Einkommen - applying default checkboxes');
            return CHECKBOX_CONFIG.applyDefaultCheckboxes(form);
        } else {
            console.log('ℹ️  Client has no pfändbares Einkommen - skipping default checkboxes');
            return { applied: 0, errors: 0 };
        }
    }

    /**
     * Enhanced field mapping that combines your existing mappings 
     * with insights from template analysis
     */
    static getEnhancedFieldMapping() {
        // Get field mapping suggestions from the template analysis
        const templateSuggestions = CHECKBOX_CONFIG.getFieldMappingSuggestions();
        
        return {
            // Your existing field mappings (keep these as they are working)
            // Just add the template-based default checkboxes
            
            // Template-based default checkboxes for pfändbares Einkommen cases
            TEMPLATE_DEFAULT_CHECKBOXES: CHECKBOX_CONFIG.DEFAULT_CHECKBOXES_FOR_PFAENDBARES_EINKOMMEN,
            
            // Field mapping suggestions from template analysis
            TEMPLATE_FIELD_SUGGESTIONS: templateSuggestions
        };
    }

    /**
     * Generate integration code to add to your existing fillInsolvenzantrag function
     */
    static generateIntegrationCode() {
        return `
// Add this to your fillInsolvenzantrag function after form loading:

// Import the checkbox configuration
const CHECKBOX_CONFIG = require('./insolvenzantrag-checkbox-config');

// Apply default checkboxes for clients with pfändbares Einkommen
if (userData.hasPfaendbaresEinkommen || userData.attachableIncome || userData.employment_status === 'employed') {
    console.log('✅ Applying template-based default checkboxes for pfändbares Einkommen...');
    
    const checkboxResults = CHECKBOX_CONFIG.applyDefaultCheckboxes(form);
    console.log(\`📊 Applied \${checkboxResults.applied} default checkboxes, \${checkboxResults.errors} errors\`);
    
    // These checkboxes are now automatically checked:
    // - Kontrollkästchen 1, 2, 3, 4 (Basic declarations)
    // - Kontrollkästchen 11 (Employment status)
    // - Kontrollkästchen 20, 23, 27 (Income/expense related)
    // - Kontrollkästchen 30, 36 (Settlement related)
} else {
    console.log('ℹ️  Client without pfändbares Einkommen - using manual checkbox configuration');
}

// Continue with your existing field mappings...
`;
    }

    /**
     * Validation function to check if the template checkboxes conflict 
     * with your existing mappings
     */
    static validateCheckboxMappings(existingMappings) {
        const conflicts = [];
        const templateCheckboxes = CHECKBOX_CONFIG.DEFAULT_CHECKBOXES_FOR_PFAENDBARES_EINKOMMEN;
        
        // Check for conflicts with existing explicit mappings
        Object.entries(existingMappings).forEach(([key, value]) => {
            if (typeof value === 'string' && value.startsWith('Kontrollkästchen')) {
                if (templateCheckboxes.includes(value)) {
                    conflicts.push({
                        existingMapping: key,
                        checkbox: value,
                        issue: 'This checkbox is automatically checked by template defaults'
                    });
                }
            }
        });

        return {
            hasConflicts: conflicts.length > 0,
            conflicts: conflicts,
            recommendations: conflicts.map(conflict => ({
                action: 'REVIEW',
                message: `Review mapping '${conflict.existingMapping}' -> '${conflict.checkbox}' - this checkbox is auto-checked for pfändbares Einkommen clients`
            }))
        };
    }

    /**
     * Quick test function to verify the integration works
     */
    static async testIntegration(pdfPath) {
        try {
            const { PDFDocument } = require('pdf-lib');
            const pdfBytes = await fs.readFile(pdfPath);
            const pdfDoc = await PDFDocument.load(pdfBytes);
            const form = pdfDoc.getForm();

            // Test applying default checkboxes
            const testClientData = { hasPfaendbaresEinkommen: true };
            const result = this.applyTemplateCheckboxes(form, testClientData);

            console.log('🧪 Integration Test Results:');
            console.log(`   ✅ Applied: ${result.applied} checkboxes`);
            console.log(`   ❌ Errors: ${result.errors} checkboxes`);
            console.log(`   📊 Success rate: ${((result.applied / (result.applied + result.errors)) * 100).toFixed(1)}%`);

            return result.errors === 0;
        } catch (error) {
            console.error('❌ Integration test failed:', error.message);
            return false;
        }
    }
}

// Export for use in your application
module.exports = InsolvenzantragCheckboxIntegrator;

// If running as standalone script, show integration instructions
if (require.main === module) {
    console.log('=== INSOLVENZANTRAG CHECKBOX INTEGRATION ===\\n');
    
    console.log('📋 Default Checkboxes for Pfändbares Einkommen:');
    CHECKBOX_CONFIG.DEFAULT_CHECKBOXES_FOR_PFAENDBARES_EINKOMMEN.forEach((checkbox, index) => {
        console.log(`   ${index + 1}. ${checkbox}`);
    });
    
    console.log('\\n🔗 Integration Code:');
    console.log(InsolvenzantragCheckboxIntegrator.generateIntegrationCode());
    
    console.log('\\n📝 Field Mapping Suggestions:');
    const suggestions = CHECKBOX_CONFIG.getFieldMappingSuggestions();
    Object.entries(suggestions).forEach(([field, mapping]) => {
        console.log(`   ${field}: ${mapping}`);
    });
}