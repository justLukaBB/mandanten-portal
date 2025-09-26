const axios = require('axios');
require('dotenv').config();

class PDFShiftService {
    constructor() {
        this.apiKey = process.env.PDFSHIFT_API_KEY;
        this.baseURL = 'https://api.pdfshift.io/v3';
        
        if (!this.apiKey) {
            console.warn('PDF Shift API key not found. Please add PDFSHIFT_API_KEY to .env file');
        }
    }

    /**
     * Convert HTML to PDF using PDF Shift
     * This method generates a PDF from HTML template with form data
     */
    async convertHTMLtoPDF(htmlContent, options = {}) {
        try {
            const payload = {
                source: htmlContent,
                landscape: options.landscape || false,
                format: options.format || 'A4',
                margin: options.margin || '1cm'
            };
            
            // Only add wait_for if it's specified and valid
            if (options.wait_for && options.wait_for > 0) {
                payload.wait_for = options.wait_for;
            }
            
            const response = await axios.post(`${this.baseURL}/convert/pdf`, payload, {
                auth: {
                    username: 'api',
                    password: this.apiKey
                },
                responseType: 'arraybuffer',
                headers: {
                    'Content-Type': 'application/json'
                }
            });

            return response.data;
        } catch (error) {
            if (error.response?.data) {
                // Parse error response from PDF Shift
                let errorMessage = 'PDF Shift API error';
                try {
                    const errorData = Buffer.isBuffer(error.response.data) 
                        ? JSON.parse(error.response.data.toString()) 
                        : error.response.data;
                    
                    console.error('PDF Shift API error details:', errorData);
                    
                    if (errorData.errors) {
                        const errors = Object.entries(errorData.errors)
                            .map(([key, value]) => `${key}: ${value}`)
                            .join(', ');
                        errorMessage = `PDF Shift errors: ${errors}`;
                    }
                } catch (parseError) {
                    console.error('Could not parse PDF Shift error:', error.response.data.toString());
                    errorMessage = 'PDF Shift API returned an error';
                }
                throw new Error(errorMessage);
            }
            
            console.error('PDF Shift connection error:', error.message);
            throw new Error('Failed to connect to PDF Shift API');
        }
    }

    /**
     * Fill PDF form using PDF Shift
     * Note: PDF Shift primarily works with HTML conversion
     * For form filling, we'll convert the data to HTML and then to PDF
     */
    async fillPDFForm(formData) {
        try {
            // Generate HTML from form data that mimics the original PDF
            const htmlContent = this.generateFormHTML(formData);
            
            // Convert HTML to PDF using PDF Shift
            const pdfBuffer = await this.convertHTMLtoPDF(htmlContent, {
                format: 'A4',
                margin: '2cm',
                landscape: false
            });

            return pdfBuffer;
        } catch (error) {
            console.error('PDF form filling error:', error);
            throw new Error('Failed to fill PDF form');
        }
    }

    /**
     * Generate HTML that matches the original PDF layout
     */
    generateFormHTML(data) {
        return `
        <!DOCTYPE html>
        <html lang="de">
        <head>
            <meta charset="UTF-8">
            <style>
                body {
                    font-family: Arial, sans-serif;
                    font-size: 11px;
                    line-height: 1.4;
                    margin: 0;
                    padding: 20px;
                    color: #000;
                }
                .form-container {
                    max-width: 210mm;
                    margin: 0 auto;
                }
                .section {
                    border: 2px solid #000;
                    margin-bottom: 15px;
                    padding: 10px;
                    position: relative;
                }
                .section-number {
                    position: absolute;
                    top: -15px;
                    left: -5px;
                    width: 25px;
                    height: 25px;
                    border: 2px solid #000;
                    background: white;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-weight: bold;
                    font-size: 14px;
                }
                .section-title {
                    font-weight: bold;
                    margin-bottom: 10px;
                    font-size: 12px;
                }
                table {
                    width: 100%;
                    border-collapse: collapse;
                    margin: 10px 0;
                }
                td {
                    border: 1px solid #000;
                    padding: 8px;
                    vertical-align: top;
                }
                .label-cell {
                    background-color: #f0f0f0;
                    font-weight: normal;
                    width: 35%;
                }
                .checkbox {
                    display: inline-block;
                    width: 12px;
                    height: 12px;
                    border: 1px solid #000;
                    margin-right: 5px;
                    text-align: center;
                    line-height: 10px;
                    font-size: 10px;
                    vertical-align: top;
                }
                .checkbox.checked {
                    background-color: #000;
                    color: white;
                }
                .text-small {
                    font-size: 9px;
                }
                .underline {
                    border-bottom: 1px solid #000;
                    display: inline-block;
                    min-width: 100px;
                    padding-bottom: 2px;
                    margin: 0 3px;
                }
                .long-text {
                    line-height: 1.3;
                    text-align: justify;
                }
                .subsection {
                    margin: 15px 0;
                    padding-left: 15px;
                }
                h1 {
                    text-align: center;
                    font-size: 16px;
                    margin-bottom: 30px;
                }
                .footer {
                    position: fixed;
                    bottom: 20px;
                    left: 0;
                    right: 0;
                    text-align: center;
                    font-size: 9px;
                    color: #666;
                }
            </style>
        </head>
        <body>
            <div class="form-container">
                <h1>Antrag auf Eröffnung des Insolvenzverfahrens (§ 305 InsO) des / der</h1>
                
                <!-- Section 1: Personal Data -->
                <div class="section">
                    <div class="section-number">1</div>
                    
                    <table>
                        <tr>
                            <td class="label-cell">Vorname und Name</td>
                            <td><strong>${data.vorname_name || ''}</strong></td>
                        </tr>
                        <tr>
                            <td class="label-cell">Straße und Hausnummer</td>
                            <td><strong>${data.strasse_hausnummer || ''}</strong></td>
                        </tr>
                        <tr>
                            <td class="label-cell">Postleitzahl und Ort</td>
                            <td><strong>${data.plz_ort || ''}</strong></td>
                        </tr>
                        <tr>
                            <td class="label-cell">Telefon tagsüber</td>
                            <td><strong>${data.telefon_tags || ''}</strong></td>
                        </tr>
                        <tr>
                            <td class="label-cell">Verfahrensbevollmächtigte(r)</td>
                            <td><strong>${data.verfahrensbevollmaechtigter || ''}</strong></td>
                        </tr>
                    </table>
                </div>

                <!-- Section 2: Court -->
                <div class="section">
                    <div class="section-number">2</div>
                    <div class="section-title">An das Amtsgericht<br>– Insolvenzgericht –</div>
                    
                    <p>in <span class="underline"><strong>${data.amtsgericht_ort || ''}</strong></span></p>
                </div>

                <!-- Section 3: Application -->
                <div class="section">
                    <div class="section-number">3</div>
                    <div class="section-title">I. Eröffnungsantrag</div>
                    
                    <p class="long-text">
                        Ich stelle den <strong>Antrag, über mein Vermögen das Insolvenzverfahren zu eröffnen.</strong> 
                        Nach meinen Vermögens- und Einkommensverhältnissen bin ich nicht in der Lage, meine bestehenden 
                        Zahlungspflichten, die bereits fällig sind oder in absehbarer Zeit fällig werden, zu erfüllen.
                    </p>
                </div>

                <!-- Section 4: Debt Relief -->
                <div class="section">
                    <div class="section-number">4</div>
                    <div class="section-title">II. 1. Restschuldbefreiungsantrag</div>
                    
                    <p>
                        <span class="checkbox ${data.restschuldbefreiung_ja ? 'checked' : ''}">
                            ${data.restschuldbefreiung_ja ? '✓' : ''}
                        </span>
                        Ich stelle den <strong>Antrag auf Restschuldbefreiung</strong> (§ 287 InsO).<br>
                        <span class="text-small">(Nummer II. 2. ist auszufüllen.)</span>
                    </p>
                    
                    <p>
                        <span class="checkbox ${data.restschuldbefreiung_nein ? 'checked' : ''}">
                            ${data.restschuldbefreiung_nein ? '✓' : ''}
                        </span>
                        Ich stelle <strong>keinen Antrag auf Restschuldbefreiung.</strong><br>
                        <span class="text-small">(Nummer II. 2. ist <strong>nicht</strong> auszufüllen.)</span>
                    </p>

                    <div class="subsection">
                        <div class="section-title">II. 2. Erklärung zum Restschuldbefreiungsantrag</div>
                        
                        <div class="section-title">Ich erkläre,</div>
                        
                        <p><strong>a)</strong> dass ich einen Antrag auf Restschuldbefreiung</p>
                        
                        <p style="margin-left: 20px;">
                            <span class="checkbox ${data.antrag_nicht_gestellt ? 'checked' : ''}">
                                ${data.antrag_nicht_gestellt ? '✓' : ''}
                            </span>
                            bisher nicht gestellt habe. (Nummer II. 2. b), c) sind <strong>nicht</strong> auszufüllen.)
                        </p>
                        
                        <p style="margin-left: 20px;">
                            <span class="checkbox ${data.antrag_bereits_gestellt ? 'checked' : ''}">
                                ${data.antrag_bereits_gestellt ? '✓' : ''}
                            </span>
                            bereits gestellt habe am
                        </p>
                        
                        <p style="text-align: center; margin: 15px 0;">
                            <span class="underline" style="min-width: 300px;"></span><br>
                            <span class="text-small">(Datum, Az., Gericht - Nummer II. 2. b) ist auszufüllen.)</span>
                        </p>

                        <p><strong>b)</strong> dass mir Restschuldbefreiung</p>
                        
                        <p style="margin-left: 20px;">
                            <span class="checkbox ${data.restschuld_erteilt ? 'checked' : ''}">
                                ${data.restschuld_erteilt ? '✓' : ''}
                            </span>
                            erteilt wurde am
                        </p>
                        
                        <p style="text-align: center; margin: 15px 0;">
                            <span class="underline" style="min-width: 300px;"></span><br>
                            <span class="text-small">(Datum, Az., Gericht - Nummer II. 2. c) ist <strong>nicht</strong> auszufüllen.)</span>
                        </p>
                        
                        <p style="margin-left: 20px;">
                            <span class="checkbox ${data.restschuld_versagt ? 'checked' : ''}">
                                ${data.restschuld_versagt ? '✓' : ''}
                            </span>
                            versagt wurde am
                        </p>
                        
                        <p style="text-align: center; margin: 15px 0;">
                            <span class="underline" style="min-width: 300px;"></span><br>
                            <span class="text-small">(Datum, Az., Gericht - Nummer II. 2. c) ist auszufüllen.)</span>
                        </p>

                        <p><strong>c)</strong> dass die Versagung der Restschuldbefreiung erfolgte auf Grund</p>
                        
                        <p style="margin-left: 20px;" class="long-text">
                            <span class="checkbox ${data.versagung_rechtskraeftig ? 'checked' : ''}">
                                ${data.versagung_rechtskraeftig ? '✓' : ''}
                            </span>
                            rechtskräftiger Verurteilung in dem Zeitraum zwischen Schlusstermin und Aufhebung des 
                            Insolvenzverfahrens oder in dem Zeitraum zwischen Beendigung des Insolvenzverfahrens und 
                            dem Ende der Abtretungsfrist wegen einer Insolvenzstraftat zu einer Geldstrafe von mehr 
                            als 90 Tagessätzen oder einer Freiheitsstrafe von mehr als drei Monaten (§ 297 InsO).
                        </p>
                        
                        <p style="margin-left: 20px;" class="long-text">
                            <span class="checkbox ${data.versagung_fahrlässig ? 'checked' : ''}">
                                ${data.versagung_fahrlässig ? '✓' : ''}
                            </span>
                            vorsätzlicher oder grob fahrlässiger Verletzung der Auskunfts- und Mitwirkungspflichten 
                            nach der Insolvenzordnung (§ 290 Abs. 1 Nr. 5 InsO).
                        </p>
                    </div>
                </div>
            </div>
            
            <div class="footer">
                Eigenantrag Verbraucherinsolvenz: Eröffnungsantrag (Hauptblatt), Seite 1 von 2<br>
                Amtliche Fassung 1/2021
            </div>
        </body>
        </html>
        `;
    }

    /**
     * Test the PDF Shift connection
     */
    async testConnection() {
        try {
            const testHTML = '<html><body><h1>PDF Shift Test</h1></body></html>';
            await this.convertHTMLtoPDF(testHTML);
            return true;
        } catch (error) {
            console.error('PDF Shift connection test failed:', error.message);
            return false;
        }
    }
}

module.exports = PDFShiftService;