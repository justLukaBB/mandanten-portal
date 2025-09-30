const fs = require('fs');
const { PDFDocument } = require('pdf-lib');

async function extractAllCheckboxNames() {
  try {
    console.log('📄 Loading PDF form...');
    const pdfPath = './pdf-form-test/original_form.pdf';
    const pdfBytes = fs.readFileSync(pdfPath);
    const pdfDoc = await PDFDocument.load(pdfBytes);
    const form = pdfDoc.getForm();

    const fields = form.getFields();
    console.log(`\n📊 Total form fields found: ${fields.length}\n`);

    // Extract all checkboxes
    const checkboxes = [];
    fields.forEach(field => {
      const fieldName = field.getName();
      if (fieldName.includes('Kontrollkästchen')) {
        const num = parseInt(fieldName.replace('Kontrollkästchen ', ''));
        checkboxes.push({ name: fieldName, num: num });
      }
    });

    // Sort by number
    checkboxes.sort((a, b) => a.num - b.num);

    console.log(`✅ Found ${checkboxes.length} checkboxes\n`);
    console.log('All checkbox field names:');
    console.log('========================');
    checkboxes.forEach(cb => {
      console.log(cb.name);
    });

    // Focus on the likely range for Section 10 (Familienstand)
    console.log('\n\n🎯 Checkboxes in range 40-70 (likely Section 10):');
    console.log('===================================================');
    checkboxes
      .filter(cb => cb.num >= 40 && cb.num <= 70)
      .forEach(cb => {
        console.log(`  ${cb.name}`);
      });

    // Create a test PDF with ALL checkboxes in range 40-70 checked
    console.log('\n\n🔧 Creating comprehensive test PDF...');
    const testPdfDoc = await PDFDocument.load(pdfBytes);
    const testForm = testPdfDoc.getForm();

    let checkedCount = 0;
    for (let i = 40; i <= 70; i++) {
      try {
        const checkbox = testForm.getCheckBox(`Kontrollkästchen ${i}`);
        checkbox.check();
        checkedCount++;
        console.log(`  ✅ Checked: Kontrollkästchen ${i}`);
      } catch (error) {
        console.log(`  ⚠️  Not found: Kontrollkästchen ${i}`);
      }
    }

    const testPdfBytes = await testPdfDoc.save();
    fs.writeFileSync('./pdf-form-test/ALL-CHECKBOXES-40-70-MARKED.pdf', testPdfBytes);
    console.log(`\n✅ Created test PDF with ${checkedCount} checkboxes marked: ./pdf-form-test/ALL-CHECKBOXES-40-70-MARKED.pdf`);
    console.log('\n📝 Please open this file and look at Section 10 (Familienstand) to see which checkboxes appear!');

  } catch (error) {
    console.error('❌ Error:', error);
  }
}

extractAllCheckboxNames();