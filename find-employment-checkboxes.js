const { PDFDocument } = require('pdf-lib');
const fs = require('fs');

async function findEmploymentCheckboxes() {
    try {
        console.log('🔍 FINDING EMPLOYMENT CHECKBOXES');
        console.log('=================================');
        
        const pdfPath = '/Users/luka/Downloads/dqw.pdf';
        const existingPdfBytes = fs.readFileSync(pdfPath);
        
        const pdfDoc = await PDFDocument.load(existingPdfBytes);
        const form = pdfDoc.getForm();
        
        const fields = form.getFields();
        const allCheckboxes = [];
        const checkedCheckboxes = [];
        const uncheckedCheckboxes = [];
        
        console.log('\\n📋 ALL CHECKBOXES IN DOCUMENT:');
        console.log('===============================');
        
        fields.forEach((field, index) => {
            const fieldName = field.getName();
            const fieldType = field.constructor.name;
            
            if (fieldType === 'PDFCheckBox') {
                allCheckboxes.push(fieldName);
                
                try {
                    if (field.isChecked()) {
                        checkedCheckboxes.push(fieldName);
                        console.log(`✅ CHECKED: ${fieldName}`);
                    } else {
                        uncheckedCheckboxes.push(fieldName);
                    }
                } catch (error) {
                    uncheckedCheckboxes.push(fieldName);
                }
            }
        });
        
        console.log(`\\n📊 CHECKBOX SUMMARY:`);
        console.log(`Total Checkboxes: ${allCheckboxes.length}`);
        console.log(`Checked: ${checkedCheckboxes.length}`);
        console.log(`Unchecked: ${uncheckedCheckboxes.length}`);
        
        // Look for employment-related checkboxes by number ranges
        console.log('\\n🔍 LOOKING FOR EMPLOYMENT CHECKBOXES:');
        console.log('======================================');
        console.log('Based on the text you provided, employment checkboxes should be in a specific section.');
        console.log('Common employment checkbox ranges: 50-100, 150-200, etc.');
        
        // Show checkboxes in different ranges to help identify employment section
        const ranges = [
            { start: 1, end: 50, name: 'Range 1-50 (Main form)' },
            { start: 50, end: 100, name: 'Range 50-100 (Employment?)' },
            { start: 100, end: 150, name: 'Range 100-150' },
            { start: 150, end: 200, name: 'Range 150-200' },
            { start: 200, end: 250, name: 'Range 200-250' },
            { start: 250, end: 300, name: 'Range 250-300' },
            { start: 300, end: 350, name: 'Range 300-350' }
        ];
        
        ranges.forEach(range => {
            console.log(`\\n📂 ${range.name}:`);
            let foundInRange = false;
            
            for (let i = range.start; i <= range.end; i++) {
                const checkboxName = `Kontrollkästchen ${i}`;
                const checkboxNameAlt = `Kontrollkästchen ${i}a`;
                
                if (allCheckboxes.includes(checkboxName)) {
                    const isChecked = checkedCheckboxes.includes(checkboxName);
                    console.log(`  ${isChecked ? '✅' : '⬜'} ${checkboxName}`);
                    foundInRange = true;
                }
                
                if (allCheckboxes.includes(checkboxNameAlt)) {
                    const isChecked = checkedCheckboxes.includes(checkboxNameAlt);
                    console.log(`  ${isChecked ? '✅' : '⬜'} ${checkboxNameAlt}`);
                    foundInRange = true;
                }
            }
            
            if (!foundInRange) {
                console.log(`  (No checkboxes found in this range)`);
            }
        });
        
        console.log('\\n💡 SUGGESTIONS FOR EMPLOYMENT CHECKBOX:');
        console.log('========================================');
        console.log('The "Angestellt" (employed) checkbox is likely in one of the unchecked ranges.');
        console.log('Based on typical German forms, it could be around:');
        console.log('- Kontrollkästchen 40-80 (personal info section)');
        console.log('- Kontrollkästchen 100-150 (employment section)');
        console.log('');
        console.log('We should add an employment status checkbox to our configuration.');
        console.log('Recommended approach:');
        console.log('1. Add a checkbox for employment status (likely around 60-80 range)');
        console.log('2. Set it to be checked for employed clients');
        
        return {
            totalCheckboxes: allCheckboxes.length,
            checkedCheckboxes,
            uncheckedCheckboxes: uncheckedCheckboxes.slice(0, 20) // Show first 20 unchecked
        };
        
    } catch (error) {
        console.error('❌ Error finding employment checkboxes:', error);
        throw error;
    }
}

// Run the search
findEmploymentCheckboxes()
    .then(results => {
        console.log('\\n🎯 SEARCH COMPLETE!');
        process.exit(0);
    })
    .catch(error => {
        console.error('💥 Search failed:', error);
        process.exit(1);
    });