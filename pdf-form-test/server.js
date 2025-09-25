const express = require('express');
const cors = require('cors');
const { PDFDocument, rgb, StandardFonts } = require('pdf-lib');
const fs = require('fs').promises;
const path = require('path');
const PDFShiftService = require('./pdfshift-service');
const OriginalPDFFiller = require('./original-pdf-filler');
const EnhancedPDFFiller = require('./enhanced-pdf-filler');
const QuickFieldMapper = require('./quick-field-mapper');
require('dotenv').config();

const app = express();
const PORT = 3001;

// Initialize PDF Shift service
const pdfShiftService = new PDFShiftService();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('.'));

// Route für die HTML-Seite
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Original PDF Form Filling - MAIN ROUTE
app.post('/fill-original-pdf', async (req, res) => {
    try {
        const data = req.body;
        console.log('Received form data for Original PDF filling:', data);

        // Path to original PDF
        const originalPdfPath = path.join(__dirname, 'original_form.pdf');
        
        // Fill original PDF with real field names and complete data
        const filledPdfBytes = await QuickFieldMapper.fillWithRealFields(data, originalPdfPath);
        
        // Send filled PDF as download
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', 'attachment; filename="Privatinsolvenzantrag_ausgefuellt_ORIGINAL.pdf"');
        res.send(Buffer.from(filledPdfBytes));
        
        console.log('✅ Original PDF successfully filled and sent');
        
    } catch (error) {
        console.error('❌ Original PDF filling error:', error);
        res.status(500).send('Fehler beim Ausfüllen der Original-PDF: ' + error.message);
    }
});

// PDF Shift Route - Alternative approach
app.post('/fill-pdf-shift', async (req, res) => {
    try {
        const data = req.body;
        console.log('Received form data for PDF Shift:', data);

        // Generate PDF using PDF Shift service
        const pdfBuffer = await pdfShiftService.fillPDFForm(data);
        
        // Send PDF as download
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', 'attachment; filename="Privatinsolvenzantrag_PDFShift.pdf"');
        res.send(pdfBuffer);
        
    } catch (error) {
        console.error('PDF Shift error:', error);
        res.status(500).send('Fehler bei PDF-Generierung mit PDF Shift: ' + error.message);
    }
});

// Fallback: Original PDF ausfüllen Route (using pdf-lib)
app.post('/fill-original-pdf-fallback', async (req, res) => {
    try {
        const data = req.body;
        console.log('Received form data:', data);

        // Original PDF laden
        const existingPdfBytes = await fs.readFile(path.join(__dirname, 'original_form.pdf'));
        const pdfDoc = await PDFDocument.load(existingPdfBytes);
        
        // Formulardaten extrahieren (falls es sich um ein ausfüllbares PDF handelt)
        const form = pdfDoc.getForm();
        const fields = form.getFields();
        
        console.log('PDF Form fields found:', fields.length);
        fields.forEach(field => {
            const fieldName = field.getName();
            const fieldType = field.constructor.name;
            console.log(`Field: ${fieldName} (Type: ${fieldType})`);
        });

        // Falls keine Formularfelder vorhanden sind, fügen wir Text direkt über die Seite hinzu
        if (fields.length === 0) {
            console.log('No form fields found, adding text overlay...');
            
            const pages = pdfDoc.getPages();
            const firstPage = pages[0];
            const { width, height } = firstPage.getSize();
            
            const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
            const fontSize = 10;
            
            // Koordinaten basierend auf dem Screenshot der ersten Seite schätzen
            // Diese Werte müssen eventuell angepasst werden
            
            // Vorname und Name
            if (data.vorname_name) {
                firstPage.drawText(data.vorname_name, {
                    x: 390, // Angepasst basierend auf Formular-Layout
                    y: height - 105,
                    size: fontSize,
                    font: font,
                    color: rgb(0, 0, 0),
                });
            }
            
            // Straße und Hausnummer
            if (data.strasse_hausnummer) {
                firstPage.drawText(data.strasse_hausnummer, {
                    x: 390,
                    y: height - 135,
                    size: fontSize,
                    font: font,
                    color: rgb(0, 0, 0),
                });
            }
            
            // PLZ und Ort
            if (data.plz_ort) {
                firstPage.drawText(data.plz_ort, {
                    x: 390,
                    y: height - 165,
                    size: fontSize,
                    font: font,
                    color: rgb(0, 0, 0),
                });
            }
            
            // Telefon tagsüber
            if (data.telefon_tags) {
                firstPage.drawText(data.telefon_tags, {
                    x: 390,
                    y: height - 195,
                    size: fontSize,
                    font: font,
                    color: rgb(0, 0, 0),
                });
            }
            
            // Verfahrensbevollmächtigter
            if (data.verfahrensbevollmaechtigter) {
                firstPage.drawText(data.verfahrensbevollmaechtigter, {
                    x: 390,
                    y: height - 225,
                    size: fontSize,
                    font: font,
                    color: rgb(0, 0, 0),
                });
            }
            
            // Amtsgericht
            if (data.amtsgericht_ort) {
                firstPage.drawText(data.amtsgericht_ort, {
                    x: 120,
                    y: height - 320,
                    size: fontSize,
                    font: font,
                    color: rgb(0, 0, 0),
                });
            }
            
            // Checkboxen für Restschuldbefreiung
            if (data.restschuldbefreiung_ja) {
                // Checkbox "Ja" markieren - X hinzufügen
                firstPage.drawText('X', {
                    x: 280,
                    y: height - 500,
                    size: 12,
                    font: font,
                    color: rgb(0, 0, 0),
                });
            }
            
            if (data.restschuldbefreiung_nein) {
                // Checkbox "Nein" markieren - X hinzufügen
                firstPage.drawText('X', {
                    x: 590,
                    y: height - 500,
                    size: 12,
                    font: font,
                    color: rgb(0, 0, 0),
                });
            }
            
            // Weitere Checkboxen ähnlich behandeln...
            if (data.antrag_nicht_gestellt) {
                firstPage.drawText('X', {
                    x: 280,
                    y: height - 680,
                    size: 12,
                    font: font,
                    color: rgb(0, 0, 0),
                });
            }
            
        } else {
            // Wenn Formularfelder vorhanden sind, diese ausfüllen
            try {
                // Versuche Felder nach Namen zu füllen
                if (data.vorname_name) {
                    const nameField = form.getTextField('vorname_name');
                    if (nameField) nameField.setText(data.vorname_name);
                }
                // Weitere Felder entsprechend...
            } catch (error) {
                console.log('Error filling form fields:', error.message);
            }
        }

        // PDF als Buffer generieren
        const pdfBytes = await pdfDoc.save();
        
        // Als Download senden
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', 'attachment; filename="Privatinsolvenzantrag_ausgefuellt.pdf"');
        res.send(Buffer.from(pdfBytes));
        
    } catch (error) {
        console.error('Error filling original PDF:', error);
        res.status(500).send('Fehler beim Ausfüllen der Original-PDF: ' + error.message);
    }
});

// PDF-Generierung Route (alte Version)
app.post('/generate-pdf', async (req, res) => {
    try {
        const data = req.body;
        console.log('Received data:', data);

        // Neues PDF-Dokument erstellen
        const pdfDoc = await PDFDocument.create();
        const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
        const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
        
        // Erste Seite erstellen
        const page = pdfDoc.addPage([595.28, 841.89]); // A4 Format
        const { width, height } = page.getSize();
        
        // Titel
        page.drawText('Antrag auf Eröffnung des Verbraucherinsolvenzverfahrens', {
            x: 50,
            y: height - 60,
            size: 16,
            font: boldFont,
            color: rgb(0, 0, 0)
        });
        
        let yPosition = height - 120;
        const lineHeight = 20;
        const sectionSpacing = 10;
        
        // Hilfsfunktion für Textzeilen
        function drawTextLine(label, value, bold = false) {
            const currentFont = bold ? boldFont : font;
            page.drawText(`${label}: ${value || ''}`, {
                x: 50,
                y: yPosition,
                size: 11,
                font: currentFont,
                color: rgb(0, 0, 0)
            });
            yPosition -= lineHeight;
        }
        
        // Hilfsfunktion für Sektionsüberschriften
        function drawSectionHeader(title) {
            yPosition -= sectionSpacing;
            page.drawText(title, {
                x: 50,
                y: yPosition,
                size: 14,
                font: boldFont,
                color: rgb(0, 0, 0.5)
            });
            yPosition -= lineHeight + 5;
        }
        
        // Persönliche Daten
        drawSectionHeader('1. Persönliche Daten');
        drawTextLine('Name', `${data.nachname || ''}, ${data.vorname || ''}`);
        drawTextLine('Geburtsdatum', data.geburtsdatum || '');
        drawTextLine('Geburtsort', data.geburtsort || '');
        
        // Adresse
        drawSectionHeader('2. Anschrift');
        drawTextLine('Straße', data.strasse || '');
        drawTextLine('PLZ/Ort', `${data.plz || ''} ${data.ort || ''}`);
        
        // Kontaktdaten
        drawSectionHeader('3. Kontaktdaten');
        drawTextLine('Telefon', data.telefon || '');
        drawTextLine('E-Mail', data.email || '');
        
        // Berufliche Situation
        drawSectionHeader('4. Berufliche Situation');
        drawTextLine('Beruf/Tätigkeit', data.beruf || '');
        drawTextLine('Arbeitgeber', data.arbeitgeber || '');
        drawTextLine('Monatliches Nettoeinkommen', data.einkommen ? `${data.einkommen} €` : '');
        
        // Familienstand
        drawSectionHeader('5. Familienstand');
        drawTextLine('Familienstand', data.familienstand || '');
        drawTextLine('Anzahl Kinder', data.kinder || '0');
        
        // Schulden
        drawSectionHeader('6. Schulden');
        drawTextLine('Geschätzte Gesamtschuldensumme', data.schuldensumme ? `${data.schuldensumme} €` : '');
        drawTextLine('Außergerichtl. Schuldenbereinigung versucht', data.schuldenbereinigungsplan ? 'Ja' : 'Nein');
        
        // Bemerkungen
        if (data.bemerkungen) {
            drawSectionHeader('7. Besondere Bemerkungen');
            // Lange Texte in mehrere Zeilen aufteilen
            const bemerkungen = data.bemerkungen;
            const maxWidth = width - 100;
            const words = bemerkungen.split(' ');
            let currentLine = '';
            
            for (const word of words) {
                const testLine = currentLine + (currentLine ? ' ' : '') + word;
                const textWidth = font.widthOfTextAtSize(testLine, 11);
                
                if (textWidth > maxWidth && currentLine) {
                    page.drawText(currentLine, {
                        x: 50,
                        y: yPosition,
                        size: 11,
                        font: font,
                        color: rgb(0, 0, 0)
                    });
                    yPosition -= lineHeight;
                    currentLine = word;
                } else {
                    currentLine = testLine;
                }
            }
            
            if (currentLine) {
                page.drawText(currentLine, {
                    x: 50,
                    y: yPosition,
                    size: 11,
                    font: font,
                    color: rgb(0, 0, 0)
                });
                yPosition -= lineHeight;
            }
        }
        
        // Unterschriftsfeld
        yPosition -= 40;
        page.drawText('_' + '_'.repeat(50), {
            x: 50,
            y: yPosition,
            size: 11,
            font: font,
            color: rgb(0, 0, 0)
        });
        yPosition -= 15;
        page.drawText('Datum, Unterschrift des Schuldners', {
            x: 50,
            y: yPosition,
            size: 10,
            font: font,
            color: rgb(0, 0, 0)
        });
        
        // Rechtlicher Hinweis
        yPosition -= 30;
        page.drawText('Hinweis: Dieser Antrag wurde automatisch generiert und dient als Vorlage.', {
            x: 50,
            y: yPosition,
            size: 9,
            font: font,
            color: rgb(0.5, 0.5, 0.5)
        });
        yPosition -= 12;
        page.drawText('Bitte prüfen Sie alle Angaben sorgfältig vor der Einreichung.', {
            x: 50,
            y: yPosition,
            size: 9,
            font: font,
            color: rgb(0.5, 0.5, 0.5)
        });
        
        // PDF als Buffer generieren
        const pdfBytes = await pdfDoc.save();
        
        // Als Download senden
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="Privatinsolvenzantrag_${data.nachname || 'Unbekannt'}_${data.vorname || 'Unbekannt'}.pdf"`);
        res.send(Buffer.from(pdfBytes));
        
    } catch (error) {
        console.error('Error generating PDF:', error);
        res.status(500).send('Fehler beim Generieren der PDF: ' + error.message);
    }
});

// Test Original PDF filling route
app.get('/test-original-pdf', async (req, res) => {
    try {
        const originalPdfPath = path.join(__dirname, 'original_form.pdf');
        const testOutputPath = path.join(__dirname, 'test-filled-original.pdf');
        
        // Create test PDF
        await OriginalPDFFiller.createTestPDF(originalPdfPath, testOutputPath);
        
        res.json({
            status: 'success',
            message: 'Test PDF created successfully',
            outputFile: 'test-filled-original.pdf',
            downloadUrl: '/download-test-pdf'
        });
        
    } catch (error) {
        res.status(500).json({
            status: 'error',
            message: error.message
        });
    }
});

// Download test PDF
app.get('/download-test-pdf', async (req, res) => {
    try {
        const testPdfPath = path.join(__dirname, 'test-filled-original.pdf');
        const pdfBytes = await fs.readFile(testPdfPath);
        
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', 'attachment; filename="test-filled-original.pdf"');
        res.send(pdfBytes);
        
    } catch (error) {
        res.status(404).send('Test PDF not found. Run /test-original-pdf first.');
    }
});

// Test PDF Shift connection route
app.get('/test-pdfshift', async (req, res) => {
    try {
        const isConnected = await pdfShiftService.testConnection();
        res.json({
            status: isConnected ? 'success' : 'error',
            message: isConnected ? 'PDF Shift connection successful' : 'PDF Shift connection failed',
            hasApiKey: !!process.env.PDFSHIFT_API_KEY
        });
    } catch (error) {
        res.status(500).json({
            status: 'error',
            message: error.message,
            hasApiKey: !!process.env.PDFSHIFT_API_KEY
        });
    }
});

// Server starten
app.listen(PORT, async () => {
    console.log(`Server läuft auf http://localhost:${PORT}`);
    console.log('Öffne deinen Browser und gehe zu: http://localhost:3001');
    console.log('');
    console.log('PDF Shift Integration:');
    console.log(`API Key configured: ${process.env.PDFSHIFT_API_KEY ? 'Yes' : 'No'}`);
    
    if (process.env.PDFSHIFT_API_KEY && process.env.PDFSHIFT_API_KEY !== 'your_api_key_here') {
        console.log('Testing PDF Shift connection...');
        try {
            const isConnected = await pdfShiftService.testConnection();
            console.log(`PDF Shift status: ${isConnected ? '✅ Connected' : '❌ Connection failed'}`);
        } catch (error) {
            console.log(`PDF Shift status: ❌ Error - ${error.message}`);
        }
    } else {
        console.log('⚠️  Please add your PDF Shift API key to .env file');
        console.log('   Get your key from: https://pdfshift.io/dashboard');
    }
    console.log('');
    console.log('🧪 Test endpoints:');
    console.log('   Original PDF: http://localhost:3001/test-original-pdf');
    console.log('   PDF Shift: http://localhost:3001/test-pdfshift');
});