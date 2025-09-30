/**
 * Professional Nullplan Template Generator V2
 * Exact match to official Rechtsanwaltskanzlei Thomas Scuric template
 * Based on "Nullplan Temlate.pdf"
 */

const { Document, Paragraph, TextRun, AlignmentType, Table, TableRow, TableCell, WidthType, BorderStyle } = require('docx');

class NullplanTemplateGenerator {
    constructor() {
        this.lawFirmInfo = {
            name: 'Rechtsanwaltskanzlei Thomas Scuric',
            attorney: 'Thomas Scuric',
            title: 'Rechtsanwalt',
            street: 'Bongardstraße 33',
            postalCode: '44787',
            city: 'Bochum',
            phone: '0234 9136810',
            fax: '0234 91368129',
            email: 'info@ra-scuric.de',
            openingHours: 'Mo. - Fr.: 09.00 - 13.00 Uhr\n14.00 - 18.00 Uhr',
            bank: 'Deutsche Bank',
            accountNumber: '172 209 900',
            blz: '430 700 24'
        };
    }

    /**
     * Generate complete Nullplan document
     */
    async generateNullplanDocument(clientData, creditorData) {
        // This will generate individual letters for each creditor
        // For now, we'll generate for the first creditor as an example
        const targetCreditor = creditorData[0] || {
            creditor_name: 'Gläubiger',
            creditor_street: '',
            creditor_postal_code: '',
            creditor_city: '',
            debt_amount: 0,
            reference_number: ''
        };

        const doc = new Document({
            creator: this.lawFirmInfo.name,
            title: 'Außergerichtlicher Nullplan',
            sections: [{
                properties: {
                    page: {
                        margin: {
                            top: 1440,  // 1 inch = 2.54cm
                            right: 1440,
                            bottom: 1440,
                            left: 1440
                        }
                    }
                },
                children: [
                    // Page 1
                    ...this.createPage1(clientData, creditorData, targetCreditor),

                    // Page break
                    new Paragraph({ pageBreakBefore: true }),

                    // Page 2
                    ...this.createPage2(clientData),

                    // Page break
                    new Paragraph({ pageBreakBefore: true }),

                    // Page 3 - Zusatzvereinbarungen
                    ...this.createPage3()
                ]
            }]
        });

        return doc;
    }

    /**
     * Page 1: Main letter with law firm header, creditor address, and offer
     */
    createPage1(clientData, creditorData, targetCreditor) {
        const currentDate = new Date().toLocaleDateString('de-DE', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric'
        });

        // Calculate deadline (30 days)
        const deadline = new Date();
        deadline.setDate(deadline.getDate() + 30);
        const deadlineStr = deadline.toLocaleDateString('de-DE', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric'
        });

        const totalDebt = creditorData.reduce((sum, c) => sum + (c.debt_amount || 0), 0);
        const numberOfCreditors = creditorData.length;
        const creditorIndex = creditorData.findIndex(c => c === targetCreditor) + 1;
        const creditorQuote = totalDebt > 0 ? ((targetCreditor.debt_amount / totalDebt) * 100).toFixed(2) : '0.00';

        // Get client info
        const firstName = clientData.personal_info?.first_name || '';
        const lastName = clientData.personal_info?.last_name || '';
        const fullName = `${firstName} ${lastName}`.trim();
        const birthDate = clientData.personal_info?.birth_date
            ? new Date(clientData.personal_info.birth_date).toLocaleDateString('de-DE', {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric'
            })
            : '';
        const maritalStatus = this.getMaritalStatusText(clientData.family_info?.marital_status);
        const income = clientData.financial_data?.monthly_net_income || 0;
        const aktenzeichen = clientData.aktenzeichen || 'XXX/XX';

        // Build creditor address
        const creditorName = targetCreditor.creditor_name || 'Gläubiger';
        const creditorStreet = targetCreditor.creditor_street || '';
        const creditorPostal = targetCreditor.creditor_postal_code || '';
        const creditorCity = targetCreditor.creditor_city || '';
        const creditorAddress = `${creditorStreet}${creditorStreet ? '\n' : ''}${creditorPostal} ${creditorCity}`.trim();

        return [
            // Header: Rechtsanwaltskanzlei Thomas Scuric
            new Paragraph({
                children: [
                    new TextRun({
                        text: 'R e c h t s a n w a l t s k a n z l e i  T h o m a s  S c u r i c',
                        bold: true,
                        size: 24
                    })
                ],
                alignment: AlignmentType.CENTER,
                spacing: { after: 300 }
            }),

            // Return address line
            new Paragraph({
                children: [
                    new TextRun({
                        text: `Rechtsanwaltskanzlei Scuric, ${this.lawFirmInfo.street}, ${this.lawFirmInfo.postalCode} ${this.lawFirmInfo.city}`,
                        size: 16,
                        underline: {}
                    })
                ],
                spacing: { after: 400 }
            }),

            // Creditor address block
            new Paragraph({
                children: [new TextRun({ text: creditorName, size: 20 })],
                spacing: { after: 80 }
            }),
            new Paragraph({
                children: [new TextRun({ text: creditorStreet, size: 20 })],
                spacing: { after: 80 }
            }),
            new Paragraph({
                children: [new TextRun({ text: `${creditorPostal} ${creditorCity}`, size: 20 })],
                spacing: { after: 400 }
            }),

            // Subject line
            new Paragraph({
                children: [
                    new TextRun({ text: `Ihre Forderung gegen ${fullName}`, bold: true, size: 22 })
                ],
                spacing: { after: 120 }
            }),
            new Paragraph({
                children: [
                    new TextRun({ text: targetCreditor.reference_number || '', size: 20 })
                ],
                spacing: { after: 120 }
            }),
            new Paragraph({
                children: [
                    new TextRun({
                        text: 'Außergerichtlicher Einigungsversuch im Rahmen der Insolvenzordnung (InsO)',
                        bold: true,
                        size: 20
                    })
                ],
                spacing: { after: 300 }
            }),

            // Salutation
            new Paragraph({
                children: [new TextRun({ text: 'Sehr geehrte Damen und Herren,', size: 22 })],
                spacing: { after: 300 }
            }),

            // Introduction
            new Paragraph({
                children: [
                    new TextRun({
                        text: 'mittlerweile liegen uns alle relevanten Daten vor, so dass wir Ihnen nun einen außergerichtlichen Einigungsvorschlag unterbreiten können:',
                        size: 22
                    })
                ],
                spacing: { after: 300 }
            }),

            // Total debt statement
            new Paragraph({
                children: [
                    new TextRun({
                        text: `${fullName} ist bei ${numberOfCreditors} Gläubigern mit insgesamt ${this.formatCurrency(totalDebt)} verschuldet.`,
                        size: 22
                    })
                ],
                spacing: { after: 300 }
            }),

            // Family and economic situation
            new Paragraph({
                children: [
                    new TextRun({
                        text: 'Die familiäre und wirtschaftliche Situation stellt sich wie folgt dar:',
                        italics: true,
                        size: 22
                    })
                ],
                spacing: { after: 200 }
            }),

            new Paragraph({
                children: [
                    new TextRun({
                        text: `Sie ist am ${birthDate} geboren und ${maritalStatus}. ${fullName} verfügt über Einkommen aus Erwerbstätigkeit von ${this.formatCurrency(income)}.`,
                        size: 22
                    })
                ],
                spacing: { after: 300 }
            }),

            // No garnishable amount statement
            new Paragraph({
                children: [
                    new TextRun({
                        text: 'Somit ergibt sich derzeit kein pfändbarer Betrag nach der Tabelle zu § 850c ZPO.',
                        size: 22
                    })
                ],
                spacing: { after: 300 }
            }),

            // Flexible Nullplan offer
            new Paragraph({
                children: [
                    new TextRun({
                        text: 'Zur Schuldenbereinigung bieten wir einen ',
                        size: 22
                    }),
                    new TextRun({
                        text: 'flexiblen Nullplan',
                        bold: true,
                        size: 22
                    }),
                    new TextRun({
                        text: ' an:',
                        size: 22
                    })
                ],
                spacing: { after: 300 }
            }),

            // Legal explanation
            new Paragraph({
                children: [
                    new TextRun({
                        text: 'Eine Mindesttilgungsquote ist im Gesetz nicht festgelegt. Folglich können auch einkommensschwache Schuldner, bei denen keine pfändbaren Einkommensanteile vorhanden sind, grundsätzlich die Restschuldbefreiung erlangen.',
                        size: 22
                    })
                ],
                spacing: { after: 300 }
            }),

            // Plan duration
            new Paragraph({
                children: [
                    new TextRun({
                        text: 'Analog zur Wohlverhaltensperiode im gerichtlichen Verfahren sieht unser außergerichtlicher Einigungsvorschlag eine Laufzeit von 3 Jahren vor.',
                        size: 22
                    })
                ],
                spacing: { after: 300 }
            }),

            // Income change clause
            new Paragraph({
                children: [
                    new TextRun({
                        text: 'Derzeit errechnen sich zwar keine pfändbaren Beträge, durch Veränderungen der Lebensumstände und der Einkommenssituation können sich jedoch während der Planlaufzeit pfändbare Beträge ergeben.',
                        size: 22
                    })
                ],
                spacing: { after: 300 }
            }),

            // Creditor-specific information
            new Paragraph({
                children: [
                    new TextRun({
                        text: `In der Anlage erhalten Sie den Schuldenbereinigungsplan, der die Forderungen der einzelnen Gläubiger, sowie die für jeden Gläubiger zutreffende Quote in der Gesamtübersicht ausweist. Ihre Forderung ist laufende Nr. ${creditorIndex}. Auf Ihre Forderung von ${this.formatCurrency(targetCreditor.debt_amount)} errechnet sich eine Quote von ${creditorQuote}%.`,
                        size: 22
                    })
                ],
                spacing: { after: 600 }
            }),

            // Closing with date and signature box
            new Paragraph({
                children: [
                    new TextRun({ text: `${this.lawFirmInfo.city}, ${currentDate}`, size: 20 })
                ],
                spacing: { after: 400 }
            }),

            new Paragraph({
                children: [
                    new TextRun({ text: this.lawFirmInfo.attorney, size: 20 })
                ],
                spacing: { after: 80 }
            }),

            new Paragraph({
                children: [
                    new TextRun({ text: this.lawFirmInfo.title, size: 20 })
                ],
                spacing: { after: 600 }
            }),

            // Right sidebar info (simplified - in real template this would be positioned)
            this.createContactInfoBox(currentDate, aktenzeichen)
        ];
    }

    /**
     * Page 2: Detailed explanations and comparison
     */
    createPage2(clientData) {
        const firstName = clientData.personal_info?.first_name || '';
        const lastName = clientData.personal_info?.last_name || '';
        const fullName = `${firstName} ${lastName}`.trim();

        // Calculate deadline (30 days)
        const deadline = new Date();
        deadline.setDate(deadline.getDate() + 30);
        const deadlineStr = deadline.toLocaleDateString('de-DE', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric'
        });

        return [
            // Monthly recalculation explanation
            new Paragraph({
                children: [
                    new TextRun({
                        text: 'Die Pfändungsbeträge werden Monat für Monat neu errechnet gemäß der Tabelle zu § 850 c ZPO. Näheres regeln die Bedingungen in der Anlage zum Schuldenbereinigungsplan. Wenn sich pfändbare Anteile ergeben, werden diese nach der Quote an die Gläubiger ausgezahlt.',
                        size: 22
                    })
                ],
                spacing: { after: 300 }
            }),

            // After plan completion
            new Paragraph({
                children: [
                    new TextRun({
                        text: `Nach Ablauf der Planlaufzeit von 36 Monaten wird die Restforderung erlassen. ${fullName} erhält den entwerteten Vollstreckungstitel zurück, eine Bewilligung zur Löschung bei der Schufa und ein Erledigungsschreiben.`,
                        size: 22
                    })
                ],
                spacing: { after: 300 }
            }),

            // Bold comparison section
            new Paragraph({
                children: [
                    new TextRun({
                        text: 'Für Ihre Entscheidung geben wir zu bedenken, dass im gerichtlichen Verfahren dieselbe Vorgehensweise zur Anwendung kommt, die von uns jetzt vorgeschlagen wird. Die Wohlverhaltensperiode würde, auch wenn keine pfändbaren Beträge zur Verteilung kommen, für die 36 Monate laufen und anschließend, wenn keine Versagungsgründe entgegenstehen, die Restschuldbefreiung gewährt. Sollten sich allerdings während der Laufzeit der Wohlverhaltensperiode pfändbare Beträge ergeben, so würden Sie schlechter gestellt, als im außergerichtlichen Verfahren, da hiervon die Kosten des Treuhänders in Abzug gebracht werden würden.',
                        bold: true,
                        size: 22
                    })
                ],
                spacing: { after: 400 }
            }),

            // Request for consent
            new Paragraph({
                children: [
                    new TextRun({
                        text: 'Wir bitten daher, im Interesse aller Beteiligten um Ihre Zustimmung bis zum',
                        size: 22
                    })
                ],
                spacing: { after: 200 }
            }),

            new Paragraph({
                children: [
                    new TextRun({
                        text: deadlineStr,
                        bold: true,
                        size: 28
                    })
                ],
                alignment: AlignmentType.CENTER,
                spacing: { after: 200 }
            }),

            new Paragraph({
                children: [
                    new TextRun({
                        text: 'zu unserem Vergleichsvorschlag.',
                        size: 22
                    })
                ],
                spacing: { after: 400 }
            }),

            // Insolvency threat
            new Paragraph({
                children: [
                    new TextRun({
                        text: `Für den Fall, dass nicht alle Gläubiger zustimmen, wird ${fullName} voraussichtlich bei Gericht Antrag auf Eröffnung des Insolvenzverfahrens mit anschließender Restschuldbefreiung stellen.`,
                        size: 22
                    })
                ],
                spacing: { after: 600 }
            }),

            // Closing
            new Paragraph({
                children: [
                    new TextRun({ text: 'Mit freundlichen Grüßen', size: 22 })
                ],
                spacing: { after: 400 }
            }),

            // Signature space
            new Paragraph({
                children: [
                    new TextRun({ text: '', size: 22 })
                ],
                spacing: { after: 400 }
            }),

            new Paragraph({
                children: [
                    new TextRun({ text: 'Rechtsanwalt', size: 20 })
                ],
                spacing: { after: 400 }
            })
        ];
    }

    /**
     * Page 3: Zusatzvereinbarungen (Additional Agreements)
     */
    createPage3() {
        const currentDate = new Date().toLocaleDateString('de-DE', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric'
        });

        return [
            // Title
            new Paragraph({
                children: [
                    new TextRun({
                        text: `Zusatzvereinbarungen zum Schuldenbereinigungsplan vom ${currentDate}`,
                        bold: true,
                        size: 24
                    })
                ],
                spacing: { after: 400 }
            }),

            // Section 1: Verzicht auf Zwangsvollstreckungsmaßnahmen
            new Paragraph({
                children: [
                    new TextRun({
                        text: 'Verzicht auf Zwangsvollstreckungsmaßnahmen',
                        bold: true,
                        size: 22
                    })
                ],
                spacing: { after: 200 }
            }),

            new Paragraph({
                children: [
                    new TextRun({
                        text: 'Mit wirksamem Abschluss des Vergleichs ruhen sämtliche Zwangsvollstreckungsmaßnahmen und Sicherungsverwertungen, soweit sie die in das Verfahren einbezogenen Forderungen und Ansprüche betreffen. Während der Laufzeit der Vereinbarung verzichten die Gläubiger auf weitere Zwangsvollstreckungsmaßnahmen oder die Offenlegung einer Lohnabtretung.',
                        size: 20
                    })
                ],
                spacing: { after: 400 }
            }),

            // Section 2: Anpassungsklauseln
            new Paragraph({
                children: [
                    new TextRun({
                        text: 'Anpassungsklauseln',
                        bold: true,
                        size: 22
                    })
                ],
                spacing: { after: 200 }
            }),

            new Paragraph({
                children: [
                    new TextRun({
                        text: '1. Bei Änderung der Pfändungstabelle zu § 850 c ZPO ändert sich der Zahlungsbetrag dem dann pfändbaren Betrag entsprechend.',
                        size: 20
                    })
                ],
                spacing: { after: 200 }
            }),

            new Paragraph({
                children: [
                    new TextRun({
                        text: '2. Bei Familienzuwachs oder einer Minderung des Einkommens aufgrund von Arbeitslosigkeit oder anderer nicht vom Schuldner zu vertretender Gründe wird der Zahlungsbetrag analog der Pfändungstabelle zu § 850 c ZPO geändert. Nach Abzug des Pfändungsbetrages ist dem Schuldner mindestens das sozialhilferechtliche Existenzminimum entsprechend den Bestimmungen nach § 850 f Abs. 1 ZPO zu belassen. Die Anpassung ist mit einer Bescheinigung des zuständigen Sozialamtes zu belegen.',
                        size: 20
                    })
                ],
                spacing: { after: 200 }
            }),

            new Paragraph({
                children: [
                    new TextRun({
                        text: '3. Bei einer wesentlichen Verbesserung der Einkommenssituation von dauerhaft mindestens 10 % oder bei einem Wegfall von Unterhaltspflichten erfolgt eine Anhebung der Rate entsprechend dem dann pfändbaren Betrag gem. § 850 c ZPO.',
                        size: 20
                    })
                ],
                spacing: { after: 400 }
            }),

            // Section 3: Obliegenheiten
            new Paragraph({
                children: [
                    new TextRun({
                        text: 'Obliegenheiten',
                        bold: true,
                        size: 22
                    })
                ],
                spacing: { after: 200 }
            }),

            new Paragraph({
                children: [
                    new TextRun({
                        text: '1. Der Schuldner verpflichtet sich, dem Gläubiger auf Anforderung Nachweise über seine Einkommenssituation vorzulegen.',
                        size: 20
                    })
                ],
                spacing: { after: 200 }
            }),

            new Paragraph({
                children: [
                    new TextRun({
                        text: '2. Im Falle der Arbeitslosigkeit verpflichtet sich der Schuldner zu intensiven eigenen Bemühungen um eine angemessene Erwerbstätigkeit und er verpflichtet sich, keine zumutbare Tätigkeit abzulehnen. Auf Anforderung des Gläubigers legt der Schuldner entsprechende Nachweise vor.',
                        size: 20
                    })
                ],
                spacing: { after: 200 }
            }),

            new Paragraph({
                children: [
                    new TextRun({
                        text: '3. Erhält der Schuldner während der Laufzeit der Ratenzahlungen eine Erbschaft, verpflichtet er sich, diese zur Hälfte des Wertes an die Gläubiger entsprechend ihrer jeweiligen Quoten herauszugeben.',
                        size: 20
                    })
                ],
                spacing: { after: 400 }
            }),

            // Section 4: Kündigung
            new Paragraph({
                children: [
                    new TextRun({
                        text: 'Kündigung',
                        bold: true,
                        size: 22
                    })
                ],
                spacing: { after: 200 }
            }),

            new Paragraph({
                children: [
                    new TextRun({
                        text: 'Gerät der Schuldner mit zwei ganzen aufeinander folgenden Monatsraten in Rückstand, ohne zuvor mit den Gläubigern eine entsprechende Stundungsvereinbarung getroffen zu haben, so kann von Gläubigerseite der abgeschlossene Vergleich schriftlich gekündigt werden.',
                        size: 20
                    })
                ],
                spacing: { after: 200 }
            }),

            new Paragraph({
                children: [
                    new TextRun({
                        text: 'Vor einer Kündigung wird der Gläubiger dem Schuldner schriftlich eine zweiwöchige Frist zur Zahlung des rückständigen Betrages einräumen. Diese Aufforderung ist mit der Erklärung zu versehen, dass bei Nichtzahlung der Vergleich gekündigt wird.',
                        size: 20
                    })
                ],
                spacing: { after: 400 }
            })
        ];
    }

    /**
     * Create contact information box (simplified version for right sidebar)
     */
    createContactInfoBox(currentDate, aktenzeichen) {
        return new Paragraph({
            children: [
                new TextRun({
                    text: `\n\n${this.lawFirmInfo.name}\n${this.lawFirmInfo.street}\n${this.lawFirmInfo.postalCode} ${this.lawFirmInfo.city}\n\nTelefon: ${this.lawFirmInfo.phone}\nTelefax: ${this.lawFirmInfo.fax}\ne-Mail: ${this.lawFirmInfo.email}\n\nÖffnungszeiten:\n${this.lawFirmInfo.openingHours}\n\nBankverbindungen:\n${this.lawFirmInfo.bank}:\nKonto-Nr.: ${this.lawFirmInfo.accountNumber}\nBLZ: ${this.lawFirmInfo.blz}\n\nAktenzeichen:\n${aktenzeichen}\n(Bei Schriftverkehr und Zahlungen unbedingt angeben)`,
                    size: 16
                })
            ],
            spacing: { before: 600 }
        });
    }

    /**
     * Helper: Format currency
     */
    formatCurrency(amount) {
        return new Intl.NumberFormat('de-DE', {
            style: 'currency',
            currency: 'EUR'
        }).format(amount || 0);
    }

    /**
     * Helper: Get marital status in German
     */
    getMaritalStatusText(status) {
        const statusMap = {
            'ledig': 'ledig',
            'verheiratet': 'verheiratet',
            'geschieden': 'geschieden',
            'verwitwet': 'verwitwet',
            'getrennt_lebend': 'getrennt lebend',
            'single': 'ledig',
            'married': 'verheiratet',
            'divorced': 'geschieden',
            'widowed': 'verwitwet'
        };
        return statusMap[status] || 'ledig';
    }
}

module.exports = NullplanTemplateGenerator;