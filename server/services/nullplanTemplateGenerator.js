/**
 * Professional Nullplan Template Generator
 * Based on official Rechtsanwaltskanzlei Thomas Scuric template
 */

const { Document, Paragraph, TextRun, AlignmentType, HeadingLevel, Tab, TabStopType, TabStopPosition } = require('docx');

class NullplanTemplateGenerator {
    /**
     * Generate professional Nullplan document matching official template
     */
    generateNullplanDocument(clientData, creditorData, creditorToSendTo) {
        // Format dates
        const currentDate = new Date().toLocaleDateString('de-DE', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric'
        });

        // Calculate deadline (30 days from now)
        const deadline = new Date();
        deadline.setDate(deadline.getDate() + 30);
        this.deadlineStr = deadline.toLocaleDateString('de-DE', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric'
        });

        // Calculate totals
        const totalDebt = creditorData.reduce((sum, c) => sum + (c.debt_amount || 0), 0);
        const numberOfCreditors = creditorData.length;

        // Find the specific creditor this letter is for
        const targetCreditor = creditorToSendTo || creditorData[0] || {
            creditor_name: 'Gläubiger',
            creditor_address: '',
            debt_amount: 0,
            reference_number: ''
        };

        // Calculate creditor index and quote
        const creditorIndex = creditorData.findIndex(c => c === targetCreditor) + 1;
        const creditorQuote = totalDebt > 0 ? ((targetCreditor.debt_amount / totalDebt) * 100).toFixed(2) : '0.00';

        // Get client info from clientData or use defaults
        const clientName = clientData.name || 'Schuldner/in';
        const clientReference = clientData.reference || 'XXX/XX';

        // Build document
        const doc = new Document({
            sections: [{
                properties: {
                    page: {
                        margin: {
                            top: 1134,  // ~2cm
                            right: 1134,
                            bottom: 1134,
                            left: 1134
                        }
                    }
                },
                children: [
                    ...this.createHeader(),
                    ...this.createCreditorAddress(targetCreditor),
                    ...this.createSubjectLine(clientName, targetCreditor.reference_number),
                    ...this.createSalutation(),
                    ...this.createIntroduction(clientName, numberOfCreditors, totalDebt),
                    ...this.createFamilySituation(clientData),
                    ...this.createNullplanOffer(),
                    ...this.createFlexibleNullplanExplanation(),
                    ...this.createPlanDuration(),
                    ...this.createIncomeChangeClause(),
                    ...this.createCreditorSpecificInfo(creditorIndex, targetCreditor.debt_amount, creditorQuote),
                    ...this.createRightSidebar(currentDate, clientReference),
                    ...this.createClosing(),
                    new Paragraph({ text: '', spacing: { after: 600 } }),
                    ...this.createZusatzvereinbarungen(currentDate)
                ]
            }]
        });

        return doc;
    }

    createHeader() {
        return [
            new Paragraph({
                children: [
                    new TextRun({
                        text: 'R e c h t s a n w a l t s k a n z l e i  T h o m a s  S c u r i c',
                        bold: true,
                        size: 24
                    })
                ],
                alignment: AlignmentType.CENTER,
                spacing: { after: 200 }
            }),
            new Paragraph({
                children: [
                    new TextRun({
                        text: 'Rechtsanwaltskanzlei Scuric, Bongardstraße 33, 44787 Bochum',
                        size: 16,
                        underline: {}
                    })
                ],
                spacing: { after: 400 }
            })
        ];
    }

    createCreditorAddress(creditor) {
        const addressLines = (creditor.creditor_address || '').split('\n').filter(line => line.trim());

        return [
            new Paragraph({
                children: [
                    new TextRun({
                        text: creditor.creditor_name || 'Gläubiger',
                        size: 22
                    })
                ],
                spacing: { after: 100 }
            }),
            ...addressLines.map(line => new Paragraph({
                children: [new TextRun({ text: line, size: 22 })],
                spacing: { after: 100 }
            })),
            new Paragraph({ text: '', spacing: { after: 400 } })
        ];
    }

    createSubjectLine(clientName, referenceNumber) {
        return [
            new Paragraph({
                children: [
                    new TextRun({
                        text: `Ihre Forderung gegen ${clientName}`,
                        bold: true,
                        size: 22
                    })
                ],
                spacing: { after: 100 }
            }),
            new Paragraph({
                children: [
                    new TextRun({
                        text: referenceNumber || 'Referenznummer',
                        size: 20
                    })
                ],
                spacing: { after: 100 }
            }),
            new Paragraph({
                children: [
                    new TextRun({
                        text: 'Außergerichtlicher Einigungsversuch im Rahmen der Insolvenzordnung (InsO)',
                        bold: true,
                        size: 20
                    })
                ],
                spacing: { after: 400 }
            })
        ];
    }

    createSalutation() {
        return [
            new Paragraph({
                children: [
                    new TextRun({
                        text: 'Sehr geehrte Damen und Herren,',
                        size: 22
                    })
                ],
                spacing: { after: 300 }
            })
        ];
    }

    createIntroduction(clientName, numCreditors, totalDebt) {
        return [
            new Paragraph({
                children: [
                    new TextRun({
                        text: 'mittlerweile liegen uns alle relevanten Daten vor, so dass wir Ihnen nun einen außergerichtlichen Einigungsvorschlag unterbreiten können:',
                        size: 22
                    })
                ],
                spacing: { after: 300 }
            }),
            new Paragraph({
                children: [
                    new TextRun({
                        text: `${clientName} ist bei ${numCreditors} Gläubigern mit insgesamt ${this.formatCurrency(totalDebt)} verschuldet.`,
                        size: 22
                    })
                ],
                spacing: { after: 300 }
            })
        ];
    }

    createFamilySituation(clientData) {
        // Get financial data
        const birthDate = clientData.geburtsdatum || 'nicht angegeben';
        const maritalStatus = clientData.familienstand || clientData.financial_data?.marital_status || 'ledig';
        const income = clientData.financial_data?.monthly_net_income || clientData.monatliches_netto_einkommen || 0;

        const maritalStatusDE = {
            'ledig': 'ledig',
            'verheiratet': 'verheiratet',
            'geschieden': 'geschieden',
            'verwitwet': 'verwitwet',
            'getrennt_lebend': 'getrennt lebend'
        }[maritalStatus] || maritalStatus;

        return [
            new Paragraph({
                children: [
                    new TextRun({
                        text: 'Die familiäre und wirtschaftliche Situation stellt sich wie folgt dar:',
                        size: 22,
                        italics: true
                    })
                ],
                spacing: { after: 300 }
            }),
            new Paragraph({
                children: [
                    new TextRun({
                        text: `Sie ist am ${birthDate} geboren und ${maritalStatusDE}. ${clientData.name} verfügt über Einkommen aus Erwerbstätigkeit von ${this.formatCurrency(income)}.`,
                        size: 22
                    })
                ],
                spacing: { after: 300 }
            }),
            new Paragraph({
                children: [
                    new TextRun({
                        text: 'Somit ergibt sich derzeit kein pfändbarer Betrag nach der Tabelle zu § 850c ZPO.',
                        size: 22,
                        bold: true
                    })
                ],
                spacing: { after: 400 }
            })
        ];
    }

    createNullplanOffer() {
        return [
            new Paragraph({
                children: [
                    new TextRun({
                        text: 'Zur Schuldenbereinigung bieten wir einen ',
                        size: 22
                    }),
                    new TextRun({
                        text: 'flexiblen Nullplan',
                        size: 22,
                        bold: true
                    }),
                    new TextRun({
                        text: ' an:',
                        size: 22
                    })
                ],
                spacing: { after: 300 }
            })
        ];
    }

    createFlexibleNullplanExplanation() {
        return [
            new Paragraph({
                children: [
                    new TextRun({
                        text: 'Eine Mindesttilgungsquote ist im Gesetz nicht festgelegt. Folglich können auch einkommensschwache Schuldner, bei denen keine pfändbaren Einkommensanteile vorhanden sind, grundsätzlich die Restschuldbefreiung erlangen.',
                        size: 22
                    })
                ],
                spacing: { after: 300 }
            })
        ];
    }

    createPlanDuration() {
        return [
            new Paragraph({
                children: [
                    new TextRun({
                        text: 'Analog zur Wohlverhaltensperiode im gerichtlichen Verfahren sieht unser außergerichtlicher Einigungsvorschlag eine Laufzeit von 3 Jahren vor.',
                        size: 22
                    })
                ],
                spacing: { after: 300 }
            })
        ];
    }

    createIncomeChangeClause() {
        return [
            new Paragraph({
                children: [
                    new TextRun({
                        text: 'Derzeit errechnen sich zwar keine pfändbaren Beträge, durch Veränderungen der Lebensumstände und der Einkommenssituation können sich jedoch während der Planlaufzeit pfändbare Beträge ergeben.',
                        size: 22
                    })
                ],
                spacing: { after: 300 }
            })
        ];
    }

    createCreditorSpecificInfo(creditorIndex, creditorAmount, quote) {
        return [
            new Paragraph({
                children: [
                    new TextRun({
                        text: `In der Anlage erhalten Sie den Schuldenbereinigungsplan, der die Forderungen der einzelnen Gläubiger, sowie die für jeden Gläubiger zutreffende Quote in der Gesamtübersicht ausweist. Ihre Forderung ist laufende Nr. ${creditorIndex}. Auf Ihre Forderung von ${this.formatCurrency(creditorAmount)} errechnet sich eine Quote von ${quote}%.`,
                        size: 22
                    })
                ],
                spacing: { after: 400 }
            })
        ];
    }

    createRightSidebar(currentDate, clientReference) {
        return [
            new Paragraph({
                children: [
                    new TextRun({
                        text: `Bochum, ${currentDate}`,
                        size: 20
                    })
                ],
                alignment: AlignmentType.RIGHT,
                spacing: { after: 200 }
            }),
            new Paragraph({
                children: [
                    new TextRun({
                        text: 'Thomas Scuric',
                        size: 20
                    })
                ],
                alignment: AlignmentType.RIGHT,
                spacing: { after: 100 }
            }),
            new Paragraph({
                children: [
                    new TextRun({
                        text: 'Rechtsanwalt',
                        size: 20
                    })
                ],
                alignment: AlignmentType.RIGHT,
                spacing: { after: 300 }
            }),
            new Paragraph({
                children: [
                    new TextRun({
                        text: 'Bongardstraße 33',
                        size: 18
                    })
                ],
                alignment: AlignmentType.RIGHT,
                spacing: { after: 50 }
            }),
            new Paragraph({
                children: [
                    new TextRun({
                        text: '44787 Bochum',
                        size: 18
                    })
                ],
                alignment: AlignmentType.RIGHT,
                spacing: { after: 200 }
            }),
            new Paragraph({
                children: [
                    new TextRun({
                        text: 'Telefon: 0234 9136810',
                        size: 16
                    })
                ],
                alignment: AlignmentType.RIGHT,
                spacing: { after: 50 }
            }),
            new Paragraph({
                children: [
                    new TextRun({
                        text: 'Telefax: 0234 91368129',
                        size: 16
                    })
                ],
                alignment: AlignmentType.RIGHT,
                spacing: { after: 50 }
            }),
            new Paragraph({
                children: [
                    new TextRun({
                        text: 'e-Mail: info@ra-scuric.de',
                        size: 16
                    })
                ],
                alignment: AlignmentType.RIGHT,
                spacing: { after: 300 }
            }),
            new Paragraph({
                children: [
                    new TextRun({
                        text: `Aktenzeichen: ${clientReference}`,
                        size: 16,
                        bold: true
                    })
                ],
                alignment: AlignmentType.RIGHT,
                spacing: { after: 100 }
            }),
            new Paragraph({
                children: [
                    new TextRun({
                        text: '(Bei Schriftverkehr und Zahlungen unbedingt angeben)',
                        size: 14,
                        italics: true
                    })
                ],
                alignment: AlignmentType.RIGHT,
                spacing: { after: 400 }
            })
        ];
    }

    createClosing() {
        return [
            new Paragraph({
                children: [
                    new TextRun({
                        text: 'Die Pfändungsbeträge werden Monat für Monat neu errechnet gemäß der Tabelle zu § 850c ZPO. Näheres regeln die Bedingungen in der Anlage zum Schuldenbereinigungsplan. Wenn sich pfändbare Anteile ergeben, werden diese nach der Quote an die Gläubiger ausgezahlt.',
                        size: 22
                    })
                ],
                spacing: { after: 300 }
            }),
            new Paragraph({
                children: [
                    new TextRun({
                        text: 'Nach Ablauf der Planlaufzeit von 36 Monaten wird die Restforderung erlassen. Der Schuldner erhält den entwerteten Vollstreckungstitel zurück, eine Bewilligung zur Löschung bei der Schufa und ein Erledigungsschreiben.',
                        size: 22
                    })
                ],
                spacing: { after: 400 }
            }),
            new Paragraph({
                children: [
                    new TextRun({
                        text: 'Für Ihre Entscheidung geben wir zu bedenken, dass im gerichtlichen Verfahren dieselbe Vorgehensweise zur Anwendung kommt, die von uns jetzt vorgeschlagen wird. Die Wohlverhaltensperiode würde, auch wenn keine pfändbaren Beträge zur Verteilung kommen, für die 36 Monate laufen und anschließend, wenn keine Versagungsgründe entgegenstehen, die Restschuldbefreiung gewährt. Sollten sich allerdings während der Laufzeit der Wohlverhaltensperiode pfändbare Beträge ergeben, so würden Sie schlechter gestellt, als im außergerichtlichen Verfahren, da hiervon die Kosten des Treuhänders in Abzug gebracht werden würden.',
                        size: 22,
                        bold: true
                    })
                ],
                spacing: { after: 400 }
            }),
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
                        text: this.deadlineStr || '(Datum)',
                        size: 24,
                        bold: true
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
            new Paragraph({
                children: [
                    new TextRun({
                        text: 'Für den Fall, dass nicht alle Gläubiger zustimmen, wird der Schuldner voraussichtlich bei Gericht Antrag auf Eröffnung des Insolvenzverfahrens mit anschließender Restschuldbefreiung stellen.',
                        size: 22
                    })
                ],
                spacing: { after: 400 }
            }),
            new Paragraph({
                children: [
                    new TextRun({
                        text: 'Mit freundlichen Grüßen',
                        size: 22
                    })
                ],
                spacing: { after: 300 }
            }),
            new Paragraph({
                children: [
                    new TextRun({
                        text: 'Rechtsanwalt',
                        size: 22
                    })
                ],
                spacing: { after: 400 }
            })
        ];
    }

    createZusatzvereinbarungen(currentDate, deadlineStr) {
        // Replace deadline placeholder
        return [
            new Paragraph({
                children: [
                    new TextRun({
                        text: `Zusatzvereinbarungen zum Schuldenbereinigungsplan vom ${currentDate}`,
                        size: 24,
                        bold: true
                    })
                ],
                spacing: { before: 600, after: 400 },
                pageBreakBefore: true
            }),
            new Paragraph({
                children: [
                    new TextRun({
                        text: 'Verzicht auf Zwangsvollstreckungsmaßnahmen',
                        size: 22,
                        bold: true
                    })
                ],
                spacing: { after: 200 }
            }),
            new Paragraph({
                children: [
                    new TextRun({
                        text: 'Mit wirksamem Abschluss des Vergleichs ruhen sämtliche Zwangsvollstreckungsmaßnahmen und Sicherungsverwertungen, soweit sie die in das Verfahren einbezogenen Forderungen und Ansprüche betreffen. Während der Laufzeit der Vereinbarung verzichten die Gläubiger auf weitere Zwangsvollstreckungsmaßnahmen oder die Offenlegung einer Lohnabtretung.',
                        size: 22
                    })
                ],
                spacing: { after: 400 }
            }),
            new Paragraph({
                children: [
                    new TextRun({
                        text: 'Anpassungsklauseln',
                        size: 22,
                        bold: true
                    })
                ],
                spacing: { after: 200 }
            }),
            new Paragraph({
                children: [
                    new TextRun({
                        text: '1. Bei Änderung der Pfändungstabelle zu § 850c ZPO ändert sich der Zahlungsbetrag dem dann pfändbaren Betrag entsprechend.',
                        size: 22
                    })
                ],
                spacing: { after: 200 }
            }),
            new Paragraph({
                children: [
                    new TextRun({
                        text: '2. Bei Familienzuwachs oder einer Minderung des Einkommens aufgrund von Arbeitslosigkeit oder anderer nicht vom Schuldner zu vertretender Gründe wird der Zahlungsbetrag analog der Pfändungstabelle zu § 850c ZPO geändert. Nach Abzug des Pfändungsbetrages ist dem Schuldner mindestens das sozialhilferechtliche Existenzminimum entsprechend den Bestimmungen nach § 850f Abs. 1 ZPO zu belassen. Die Anpassung ist mit einer Bescheinigung des zuständigen Sozialamtes zu belegen.',
                        size: 22
                    })
                ],
                spacing: { after: 200 }
            }),
            new Paragraph({
                children: [
                    new TextRun({
                        text: '3. Bei einer wesentlichen Verbesserung der Einkommenssituation von dauerhaft mindestens 10% oder bei einem Wegfall von Unterhaltspflichten erfolgt eine Anhebung der Rate entsprechend dem dann pfändbaren Betrag gem. § 850c ZPO.',
                        size: 22
                    })
                ],
                spacing: { after: 400 }
            }),
            new Paragraph({
                children: [
                    new TextRun({
                        text: 'Obliegenheiten',
                        size: 22,
                        bold: true
                    })
                ],
                spacing: { after: 200 }
            }),
            new Paragraph({
                children: [
                    new TextRun({
                        text: '1. Der Schuldner verpflichtet sich, dem Gläubiger auf Anforderung Nachweise über seine Einkommenssituation vorzulegen.',
                        size: 22
                    })
                ],
                spacing: { after: 200 }
            }),
            new Paragraph({
                children: [
                    new TextRun({
                        text: '2. Im Falle der Arbeitslosigkeit verpflichtet sich der Schuldner zu intensiven eigenen Bemühungen um eine angemessene Erwerbstätigkeit und er verpflichtet sich, keine zumutbare Tätigkeit abzulehnen. Auf Anforderung des Gläubigers legt der Schuldner entsprechende Nachweise vor.',
                        size: 22
                    })
                ],
                spacing: { after: 200 }
            }),
            new Paragraph({
                children: [
                    new TextRun({
                        text: '3. Erhält der Schuldner während der Laufzeit der Ratenzahlungen eine Erbschaft, verpflichtet er sich, diese zur Hälfte des Wertes an die Gläubiger entsprechend ihrer jeweiligen Quoten herauszugeben.',
                        size: 22
                    })
                ],
                spacing: { after: 400 }
            }),
            new Paragraph({
                children: [
                    new TextRun({
                        text: 'Kündigung',
                        size: 22,
                        bold: true
                    })
                ],
                spacing: { after: 200 }
            }),
            new Paragraph({
                children: [
                    new TextRun({
                        text: 'Gerät der Schuldner mit zwei ganzen aufeinander folgenden Monatsraten in Rückstand, ohne zuvor mit den Gläubigern eine entsprechende Stundungsvereinbarung getroffen zu haben, so kann von Gläubigerseite der abgeschlossene Vergleich schriftlich gekündigt werden.',
                        size: 22
                    })
                ],
                spacing: { after: 200 }
            }),
            new Paragraph({
                children: [
                    new TextRun({
                        text: 'Vor einer Kündigung wird der Gläubiger dem Schuldner schriftlich eine zweiwöchige Frist zur Zahlung des rückständigen Betrages einräumen. Diese Aufforderung ist mit der Erklärung zu versehen, dass bei Nichtzahlung der Vergleich gekündigt wird.',
                        size: 22
                    })
                ],
                spacing: { after: 400 }
            })
        ];
    }

    formatCurrency(amount) {
        return new Intl.NumberFormat('de-DE', {
            style: 'currency',
            currency: 'EUR'
        }).format(amount || 0);
    }
}

module.exports = NullplanTemplateGenerator;