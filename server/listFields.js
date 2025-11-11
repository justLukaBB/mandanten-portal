const fs = require('fs');
const { PDFDocument } = require('pdf-lib');

async function getPage24Fields(filePath) {
  const pdfBytes = fs.readFileSync(filePath);
  const pdfDoc = await PDFDocument.load(pdfBytes);
  const form = pdfDoc.getForm();
  const pages = pdfDoc.getPages();
  const page24 = pages[25]; // Page 24 (0-indexed)
  
  console.log(`Total pages: ${pages.length}`);
  console.log('Page 26 fields:\n');
  
  const fields = form.getFields();
  let count = 0;
  
  fields.forEach((field) => {
    const widgets = field.acroField.getWidgets();
    
    widgets.forEach((widget) => {
      const pageAnnots = page24.node.Annots();
      if (pageAnnots) {
        const widgetRef = widget.dict.context.getObjectRef(widget.dict);
        const annots = pageAnnots.asArray();
        
        if (annots.some(annot => annot === widgetRef)) {
          count++;
          console.log(`${count}. ${field.getName()} (${field.constructor.name})`);
        }
      }
    });
  });
  
  if (count === 0) {
    console.log('No fields found on page 24');
  }
}

getPage24Fields('../pdf-form-test/original_form.pdf');