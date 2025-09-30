const QuickFieldMapper = require('./pdf-form-test/quick-field-mapper');

async function testEmploymentFix() {
    console.log('🧪 TESTING EMPLOYMENT CHECKBOX FIX');
    console.log('==================================');
    
    // Test data with employment status
    const testData = {
        vorname: 'Thomas',
        nachname: 'Schmidt',
        strasse: 'Hauptstraße',
        hausnummer: '78',
        plz: '50667',
        ort: 'Köln',
        telefon: '0221123456',
        telefon_mobil: '01751234567',
        email: 'thomas.schmidt@example.com',
        geburtsdatum: '15.05.1985',
        geburtsort: 'Köln',
        akademischer_grad: 'Dipl.-Ing.',
        erlernter_beruf: 'Ingenieur',
        aktuelle_taetigkeit: 'Projektleiter',
        berufliche_taetigkeit: 'Projektleiter',
        berufsstatus: 'angestellt',  // THIS IS THE KEY FIELD
        anzahl_glaeubiger: 4,
        gesamtschuldensumme: 13990,
        amtsgericht: 'Köln'
    };
    
    console.log('🔍 Test data employment status:', testData.berufsstatus);
    
    try {
        const originalPdfPath = '/Users/luka/Downloads/dqw.pdf';
        console.log('📄 Using template PDF:', originalPdfPath);
        
        console.log('\n🧪 Testing field mapping logic...');
        const fieldMapping = QuickFieldMapper.getUpdatedFieldMapping();
        
        // Find employment checkboxes in mapping
        const employmentFields = Object.entries(fieldMapping).filter(([key, value]) => 
            key.includes('employment_') && value.includes('Kontrollkästchen')
        );
        
        console.log('\n📋 Employment checkbox mappings:');
        employmentFields.forEach(([key, value]) => {
            console.log(`  ${key} → ${value}`);
        });
        
        console.log('\n🔧 Testing PDF generation...');
        const pdfBytes = await QuickFieldMapper.fillWithRealFields(testData, originalPdfPath);
        
        console.log('✅ PDF generation completed successfully!');
        console.log(`📦 Generated PDF size: ${pdfBytes.length} bytes`);
        
        // Save test PDF
        const fs = require('fs').promises;
        await fs.writeFile('/tmp/test-employment-checkboxes.pdf', pdfBytes);
        console.log('💾 Test PDF saved to: /tmp/test-employment-checkboxes.pdf');
        
        return {
            success: true,
            pdfSize: pdfBytes.length,
            employmentMappings: employmentFields.length
        };
        
    } catch (error) {
        console.error('❌ Test failed:', error.message);
        console.error('Stack:', error.stack);
        return {
            success: false,
            error: error.message
        };
    }
}

// Run test
testEmploymentFix()
    .then(result => {
        console.log('\n🎯 TEST RESULTS:');
        console.log('================');
        if (result.success) {
            console.log('✅ Employment checkbox fix test PASSED');
            console.log(`📊 PDF generated with ${result.employmentMappings} employment mappings`);
            console.log('🔍 Check /tmp/test-employment-checkboxes.pdf to verify checkboxes');
        } else {
            console.log('❌ Employment checkbox fix test FAILED');
            console.log('Error:', result.error);
        }
        process.exit(result.success ? 0 : 1);
    })
    .catch(error => {
        console.error('💥 Test crashed:', error);
        process.exit(1);
    });