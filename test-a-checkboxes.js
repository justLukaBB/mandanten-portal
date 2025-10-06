const fs = require('fs');
const { PDFDocument } = require('pdf-lib');

async function testACheckboxes() {
  try {
    console.log('📄 Loading PDF form...');
    const pdfPath = './server/pdf-form-test/original_form.pdf';
    const pdfBytes = fs.readFileSync(pdfPath);

    console.log('\n🔧 Creating test PDF with "a" suffix checkboxes (40a-60a)...');
    const testPdfDoc = await PDFDocument.load(pdfBytes);
    const testForm = testPdfDoc.getForm();

    let checkedCount = 0;
    for (let i = 40; i <= 60; i++) {
      try {
        const checkbox = testForm.getCheckBox(`Kontrollkästchen ${i}a`);
        checkbox.check();
        checkedCount++;
        console.log(`  ✅ Checked: Kontrollkästchen ${i}a`);
      } catch (error) {
        console.log(`  ⚠️  Not found: Kontrollkästchen ${i}a`);
      }
    }

    const testPdfBytes = await testPdfDoc.save();
    fs.writeFileSync('./server/pdf-form-test/A-SUFFIX-CHECKBOXES-40a-60a.pdf', testPdfBytes);
    console.log(`\n✅ Created test PDF with ${checkedCount} "a" suffix checkboxes marked`);
    console.log('📂 File: ./server/pdf-form-test/A-SUFFIX-CHECKBOXES-40a-60a.pdf');
    console.log('\n📝 Please open this file and check Section 10 (Familienstand)!');

  } catch (error) {
    console.error('❌ Error:', error);
  }
}

testACheckboxes();