const { exec } = require('child_process');
const { promisify } = require('util');
const fs = require('fs').promises;
const path = require('path');
const mammoth = require('mammoth');
const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');

const execAsync = promisify(exec);

// Convert DOCX to PDF using different methods
async function convertDocxToPdf(docxPath) {
    try {
        // Method 1: Try using LibreOffice if available (best quality)
        try {
            const pdfPath = docxPath.replace(/\.docx?$/i, '.pdf');

            // Try multiple LibreOffice paths (macOS, Linux/Render, system PATH)
            const libreOfficePaths = [
                '/opt/homebrew/bin/soffice',      // macOS Homebrew
                '/usr/bin/soffice',                // Linux/Render standard
                '/usr/bin/libreoffice',            // Alternative Linux path
                'soffice'                          // System PATH
            ];

            let libreOfficeCommand = null;
            for (const sofficePath of libreOfficePaths) {
                try {
                    // Check if this path works
                    await execAsync(`${sofficePath} --version`);
                    libreOfficeCommand = `"${sofficePath}" --headless --convert-to pdf --outdir "${path.dirname(docxPath)}" "${docxPath}"`;
                    console.log(`📄 Found LibreOffice at: ${sofficePath}`);
                    break;
                } catch (e) {
                    // Path doesn't work, try next one
                    continue;
                }
            }

            if (!libreOfficeCommand) {
                throw new Error('LibreOffice not found in any standard location');
            }

            console.log(`🔄 Converting with LibreOffice: ${path.basename(docxPath)}`);
            await execAsync(libreOfficeCommand);

            // Check if PDF was created
            await fs.access(pdfPath);
            const pdfBytes = await fs.readFile(pdfPath);

            // Clean up temporary PDF file
            await fs.unlink(pdfPath);

            console.log(`✅ Successfully converted ${path.basename(docxPath)} to PDF using LibreOffice`);
            return pdfBytes;
        } catch (libreOfficeError) {
            console.log(`⚠️  LibreOffice conversion failed: ${libreOfficeError.message}`);
            console.log('⚠️  WARNING: Falling back to mammoth conversion - formatting will be lost!');
        }
        
        // Method 2: Fallback to mammoth + pdf-lib conversion
        const docxBuffer = await fs.readFile(docxPath);
        
        // Extract HTML from DOCX
        const result = await mammoth.convertToHtml({ buffer: docxBuffer });
        const html = result.value;
        
        // Convert HTML to plain text for PDF (simple approach)
        const text = html
            .replace(/<[^>]*>/g, '') // Remove HTML tags
            .replace(/&nbsp;/g, ' ')
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"')
            .replace(/&#039;/g, "'")
            .replace(/\n\s*\n/g, '\n\n'); // Normalize line breaks
        
        // Create PDF from text
        const pdfDoc = await PDFDocument.create();
        const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
        const fontSize = 11;
        const lineHeight = fontSize * 1.5;
        const margin = 50;
        
        // Split text into lines
        const lines = text.split('\n');
        let currentPage = pdfDoc.addPage([595.28, 841.89]); // A4 size
        let { width, height } = currentPage.getSize();
        let yPosition = height - margin;
        
        for (const line of lines) {
            // Check if we need a new page
            if (yPosition < margin + lineHeight) {
                currentPage = pdfDoc.addPage([595.28, 841.89]);
                yPosition = height - margin;
            }
            
            // Word wrap if line is too long
            const words = line.split(' ');
            let currentLine = '';
            
            for (const word of words) {
                const testLine = currentLine + (currentLine ? ' ' : '') + word;
                const textWidth = font.widthOfTextAtSize(testLine, fontSize);
                
                if (textWidth > width - 2 * margin && currentLine) {
                    // Draw current line
                    currentPage.drawText(currentLine, {
                        x: margin,
                        y: yPosition,
                        size: fontSize,
                        font: font,
                        color: rgb(0, 0, 0),
                    });
                    yPosition -= lineHeight;
                    currentLine = word;
                    
                    // Check if we need a new page after drawing
                    if (yPosition < margin + lineHeight) {
                        currentPage = pdfDoc.addPage([595.28, 841.89]);
                        yPosition = height - margin;
                    }
                } else {
                    currentLine = testLine;
                }
            }
            
            // Draw remaining text
            if (currentLine) {
                currentPage.drawText(currentLine, {
                    x: margin,
                    y: yPosition,
                    size: fontSize,
                    font: font,
                    color: rgb(0, 0, 0),
                });
                yPosition -= lineHeight;
            }
        }
        
        const pdfBytes = await pdfDoc.save();
        return pdfBytes;
        
    } catch (error) {
        console.error('Error converting DOCX to PDF:', error);
        throw new Error(`Failed to convert document to PDF: ${error.message}`);
    }
}

// Generate Schuldenbereinigungsplan PDF from client data
async function generateSchuldenbereinigungsplanPdf(client) {
    try {
        const pdfDoc = await PDFDocument.create();
        const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
        const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
        
        const page = pdfDoc.addPage([595.28, 841.89]); // A4
        const { width, height } = page.getSize();
        
        let yPosition = height - 50;
        const margin = 50;
        const lineHeight = 20;
        
        // Title
        page.drawText('Schuldenbereinigungsplan', {
            x: margin,
            y: yPosition,
            size: 18,
            font: boldFont,
            color: rgb(0, 0, 0),
        });
        yPosition -= lineHeight * 2;
        
        // Client info
        page.drawText(`Name: ${client.firstName} ${client.lastName}`, {
            x: margin,
            y: yPosition,
            size: 12,
            font: font,
            color: rgb(0, 0, 0),
        });
        yPosition -= lineHeight;
        
        page.drawText(`Aktenzeichen: ${client.aktenzeichen}`, {
            x: margin,
            y: yPosition,
            size: 12,
            font: font,
            color: rgb(0, 0, 0),
        });
        yPosition -= lineHeight * 2;
        
        // Plan details
        if (client.debt_settlement_plan) {
            page.drawText('Planübersicht:', {
                x: margin,
                y: yPosition,
                size: 14,
                font: boldFont,
                color: rgb(0, 0, 0),
            });
            yPosition -= lineHeight;
            
            page.drawText(`Gesamtschulden: ${client.debt_settlement_plan.total_debt?.toFixed(2) || '0.00'} €`, {
                x: margin,
                y: yPosition,
                size: 12,
                font: font,
                color: rgb(0, 0, 0),
            });
            yPosition -= lineHeight;
            
            page.drawText(`Pfändbare Beträge: ${client.debt_settlement_plan.pfaendbar_amount?.toFixed(2) || '0.00'} €`, {
                x: margin,
                y: yPosition,
                size: 12,
                font: font,
                color: rgb(0, 0, 0),
            });
            yPosition -= lineHeight;
            
            page.drawText(`Anzahl Gläubiger: ${client.debt_settlement_plan.creditors?.length || 0}`, {
                x: margin,
                y: yPosition,
                size: 12,
                font: font,
                color: rgb(0, 0, 0),
            });
            yPosition -= lineHeight * 2;
            
            // Creditor details
            if (client.debt_settlement_plan.creditors && client.debt_settlement_plan.creditors.length > 0) {
                page.drawText('Gläubigeraufstellung:', {
                    x: margin,
                    y: yPosition,
                    size: 14,
                    font: boldFont,
                    color: rgb(0, 0, 0),
                });
                yPosition -= lineHeight;
                
                for (const creditor of client.debt_settlement_plan.creditors) {
                    if (yPosition < margin + lineHeight * 3) {
                        // Need new page
                        const newPage = pdfDoc.addPage([595.28, 841.89]);
                        yPosition = height - margin;
                    }
                    
                    page.drawText(`- ${creditor.name}: ${creditor.amount?.toFixed(2) || '0.00'} € (${creditor.percentage?.toFixed(2) || '0.00'}%)`, {
                        x: margin + 20,
                        y: yPosition,
                        size: 11,
                        font: font,
                        color: rgb(0, 0, 0),
                    });
                    yPosition -= lineHeight;
                }
            }
        }
        
        const pdfBytes = await pdfDoc.save();
        return pdfBytes;
        
    } catch (error) {
        console.error('Error generating Schuldenbereinigungsplan PDF:', error);
        throw error;
    }
}

// Generate Gläubigerliste PDF from client data
async function generateGlaeubigerlistePdf(client) {
    try {
        const pdfDoc = await PDFDocument.create();
        const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
        const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
        
        const page = pdfDoc.addPage([595.28, 841.89]); // A4
        const { width, height } = page.getSize();
        
        let yPosition = height - 50;
        const margin = 50;
        const lineHeight = 20;
        
        // Title
        page.drawText('Gläubigerliste', {
            x: margin,
            y: yPosition,
            size: 18,
            font: boldFont,
            color: rgb(0, 0, 0),
        });
        yPosition -= lineHeight * 2;
        
        // Client info
        page.drawText(`Name: ${client.firstName} ${client.lastName}`, {
            x: margin,
            y: yPosition,
            size: 12,
            font: font,
            color: rgb(0, 0, 0),
        });
        yPosition -= lineHeight;
        
        page.drawText(`Aktenzeichen: ${client.aktenzeichen}`, {
            x: margin,
            y: yPosition,
            size: 12,
            font: font,
            color: rgb(0, 0, 0),
        });
        yPosition -= lineHeight * 2;
        
        // Creditor list
        const creditors = client.final_creditor_list || client.debt_settlement_plan?.creditors || [];
        
        if (creditors.length > 0) {
            page.drawText(`Anzahl der Gläubiger: ${creditors.length}`, {
                x: margin,
                y: yPosition,
                size: 12,
                font: boldFont,
                color: rgb(0, 0, 0),
            });
            yPosition -= lineHeight * 1.5;
            
            // Table headers
            page.drawText('Nr.', { x: margin, y: yPosition, size: 11, font: boldFont, color: rgb(0, 0, 0) });
            page.drawText('Gläubiger', { x: margin + 40, y: yPosition, size: 11, font: boldFont, color: rgb(0, 0, 0) });
            page.drawText('Forderung', { x: width - margin - 100, y: yPosition, size: 11, font: boldFont, color: rgb(0, 0, 0) });
            yPosition -= lineHeight;
            
            // Draw line
            page.drawLine({
                start: { x: margin, y: yPosition + 5 },
                end: { x: width - margin, y: yPosition + 5 },
                thickness: 1,
                color: rgb(0, 0, 0),
            });
            yPosition -= 10;
            
            // Creditor entries
            creditors.forEach((creditor, index) => {
                if (yPosition < margin + lineHeight * 2) {
                    // Need new page
                    const newPage = pdfDoc.addPage([595.28, 841.89]);
                    yPosition = height - margin;
                }
                
                const num = `${index + 1}.`;
                const name = creditor.sender_name || creditor.name || 'Unbekannt';
                const amount = `${(creditor.claim_amount || creditor.amount || 0).toFixed(2)} €`;
                
                page.drawText(num, { x: margin, y: yPosition, size: 11, font: font, color: rgb(0, 0, 0) });
                page.drawText(name, { x: margin + 40, y: yPosition, size: 11, font: font, color: rgb(0, 0, 0) });
                page.drawText(amount, { x: width - margin - 100, y: yPosition, size: 11, font: font, color: rgb(0, 0, 0) });
                
                yPosition -= lineHeight;
                
                // Add address if available
                if (creditor.sender_address) {
                    page.drawText(creditor.sender_address, {
                        x: margin + 40,
                        y: yPosition,
                        size: 9,
                        font: font,
                        color: rgb(0.5, 0.5, 0.5),
                    });
                    yPosition -= lineHeight * 0.7;
                }
            });
            
            // Total
            yPosition -= lineHeight;
            page.drawLine({
                start: { x: margin, y: yPosition + 15 },
                end: { x: width - margin, y: yPosition + 15 },
                thickness: 1,
                color: rgb(0, 0, 0),
            });
            yPosition -= 5;
            
            const totalAmount = creditors.reduce((sum, c) => sum + (c.claim_amount || c.amount || 0), 0);
            page.drawText('Gesamt:', {
                x: margin + 40,
                y: yPosition,
                size: 12,
                font: boldFont,
                color: rgb(0, 0, 0),
            });
            page.drawText(`${totalAmount.toFixed(2)} €`, {
                x: width - margin - 100,
                y: yPosition,
                size: 12,
                font: boldFont,
                color: rgb(0, 0, 0),
            });
        } else {
            page.drawText('Keine Gläubiger erfasst', {
                x: margin,
                y: yPosition,
                size: 12,
                font: font,
                color: rgb(0, 0, 0),
            });
        }
        
        const pdfBytes = await pdfDoc.save();
        return pdfBytes;
        
    } catch (error) {
        console.error('Error generating Gläubigerliste PDF:', error);
        throw error;
    }
}

module.exports = {
    convertDocxToPdf,
    generateSchuldenbereinigungsplanPdf,
    generateGlaeubigerlistePdf
};