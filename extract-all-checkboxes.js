#!/usr/bin/env node

// Alle Checkboxen aus dem PDF extrahieren
const { PDFDocument } = require('pdf-lib');
const fs = require('fs');
const path = require('path');

async function extractAllCheckboxes() {
    console.log('📋 EXTRAHIERE ALLE CHECKBOXEN AUS DEM PDF');
    console.log('═══════════════════════════════════════════════════════════');
    
    try {
        const originalPdfPath = path.join(__dirname, 'pdf-form-test/original_form.pdf');
        const existingPdfBytes = await fs.promises.readFile(originalPdfPath);
        const pdfDoc = await PDFDocument.load(existingPdfBytes);
        const form = pdfDoc.getForm();
        
        const allFields = form.getFields();
        const checkboxFields = [];
        
        console.log(`📊 Gesamt gefundene Felder: ${allFields.length}`);
        
        allFields.forEach(field => {
            if (field.constructor.name === 'PDFCheckBox') {
                checkboxFields.push({
                    name: field.getName(),
                    isChecked: field.isChecked()
                });
            }
        });
        
        console.log(`✅ Gefundene Checkboxen: ${checkboxFields.length}`);
        console.log('\n📝 ALLE CHECKBOXEN:');
        console.log('══════════════════════════════════════════════════════════');
        
        // Sortiere nach Namen
        checkboxFields.sort((a, b) => {
            // Extrahiere Zahlen für numerische Sortierung
            const aNum = parseInt(a.name.match(/\\d+/)?.[0] || '0');
            const bNum = parseInt(b.name.match(/\\d+/)?.[0] || '0');
            return aNum - bNum;
        });
        
        let outputCode = `// ALLE CHECKBOXEN DES INSOLVENZANTRAG PDFs
// Gefunden: ${checkboxFields.length} Checkboxen
// 
// ANLEITUNG:
// - Setze auf 'true' um Checkbox zu aktivieren
// - Setze auf 'false' um Checkbox zu deaktivieren
// - Du kannst beliebige Checkboxen ein/ausschalten

const allCheckboxSettings = {
`;

        checkboxFields.forEach((checkbox, index) => {
            const isCurrentlyChecked = checkbox.isChecked ? 'true ' : 'false';
            const comment = checkbox.isChecked ? ' // ✓ Aktuell gecheckt' : ' // ✗ Aktuell nicht gecheckt';
            
            outputCode += `    '${checkbox.name}': ${isCurrentlyChecked},${comment}\n`;
        });
        
        outputCode += `};

// VERWENDUNG:
// const QuickFieldMapper = require('./pdf-form-test/quick-field-mapper');
// 
// // In der fillWithRealFields Funktion:
// Object.entries(allCheckboxSettings).forEach(([checkboxName, shouldCheck]) => {
//     try {
//         const checkbox = form.getCheckBox(checkboxName);
//         if (shouldCheck) {
//             checkbox.check();
//             console.log(\`✅ Checked: \${checkboxName}\`);
//         } else {
//             checkbox.uncheck();
//             console.log(\`✗ Unchecked: \${checkboxName}\`);
//         }
//     } catch (error) {
//         console.log(\`⚠️  Checkbox not found: \${checkboxName}\`);
//     }
// });

module.exports = allCheckboxSettings;
`;
        
        // Speichere die Datei
        const outputPath = path.join(__dirname, 'all-checkboxes-config.js');
        fs.writeFileSync(outputPath, outputCode);
        
        console.log('\\n✅ CHECKBOX KONFIGURATION ERSTELLT!');
        console.log(`📁 Datei: ${outputPath}`);
        console.log(`📊 Anzahl Checkboxen: ${checkboxFields.length}`);
        
        // Zeige erste 20 als Beispiel
        console.log('\\n📋 BEISPIEL (erste 20 Checkboxen):');
        console.log('═══════════════════════════════════════════════════════════');
        checkboxFields.slice(0, 20).forEach((checkbox, index) => {
            const status = checkbox.isChecked ? '✓' : '✗';
            console.log(`${String(index + 1).padStart(2, ' ')}. ${status} ${checkbox.name}`);
        });
        
        if (checkboxFields.length > 20) {
            console.log(`... und ${checkboxFields.length - 20} weitere`);
        }
        
        return {
            success: true,
            totalCheckboxes: checkboxFields.length,
            outputPath
        };
        
    } catch (error) {
        console.error('❌ Fehler beim Extrahieren der Checkboxen:', error);
        return {
            success: false,
            error: error.message
        };
    }
}

// Extrahierung starten
extractAllCheckboxes().then(result => {
    if (result.success) {
        console.log('\\n🎯 NÄCHSTE SCHRITTE:');
        console.log('1. Öffne: all-checkboxes-config.js');
        console.log('2. Ändere true/false Werte nach deinen Wünschen');
        console.log('3. Importiere die Konfiguration in QuickFieldMapper');
    }
}).catch(console.error);