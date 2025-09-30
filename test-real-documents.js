#!/usr/bin/env node

// Test the ACTUAL document generation and integration
const path = require('path');
const fs = require('fs');

async function testRealDocumentGeneration() {
    console.log('🧪 Testing REAL Document Generation Integration');
    console.log('═══════════════════════════════════════════════\n');

    try {
        // Test 1: Generate ACTUAL Schuldenbereinigungsplan
        console.log('📄 Test 1: Generating ACTUAL Schuldenbereinigungsplan...');
        
        const DocumentGenerator = require('./server/services/documentGenerator');
        const documentGenerator = new DocumentGenerator();
        
        const mockClient = {
            aktenzeichen: 'TEST_001',
            firstName: 'Max',
            lastName: 'Mustermann',
            final_creditor_list: [
                {
                    sender_name: 'Deutsche Bank AG',
                    claim_amount: 25000,
                    sender_address: 'Taunusanlage 12, 60325 Frankfurt am Main',
                    reference_number: 'DB-2025-001',
                    sender_email: 'kundenservice@deutsche-bank.de'
                },
                {
                    sender_name: 'Sparkasse Köln Bonn',
                    claim_amount: 15000,
                    sender_address: 'Hahnenstraße 57, 50667 Köln',
                    reference_number: 'SKB-2025-789',
                    sender_email: 'service@sparkasse-koelnbonn.de'
                },
                {
                    sender_name: 'Amazon Europe Core S.à r.l.',
                    claim_amount: 5000,
                    sender_address: '38 avenue John F. Kennedy, L-1855 Luxembourg',
                    reference_number: 'AMZ-DE-2025-456'
                }
            ],
            financial_data: {
                monthly_net_income: 2500,
                garnishable_amount: 300
            }
        };

        try {
            const clientData = {
                name: `${mockClient.firstName} ${mockClient.lastName}`,
                reference: mockClient.aktenzeichen,
                firstName: mockClient.firstName,
                lastName: mockClient.lastName
            };
            
            const settlementData = {
                creditors: mockClient.final_creditor_list,
                totalDebt: mockClient.final_creditor_list.reduce((sum, c) => sum + c.claim_amount, 0),
                garnishableAmount: mockClient.financial_data.garnishable_amount
            };
            
            const calculationResult = {
                monthly_payment: mockClient.financial_data.garnishable_amount,
                payment_duration: 36,
                total_payment: mockClient.financial_data.garnishable_amount * 36
            };
            
            const schuldenResult = await documentGenerator.generateSchuldenbereinigungsplan(
                clientData, 
                settlementData, 
                calculationResult
            );
            
            if (schuldenResult && schuldenResult.success && schuldenResult.document_info) {
                console.log(`✅ Schuldenbereinigungsplan generated: ${schuldenResult.document_info.filename}`);
                
                // Copy to current directory for viewing
                const targetPath = path.join(__dirname, 'test-real-schuldenbereinigungsplan.docx');
                fs.copyFileSync(schuldenResult.document_info.path, targetPath);
                console.log(`📁 Copied to: ${targetPath}`);
            } else {
                console.log('❌ No Schuldenbereinigungsplan file generated');
                if (schuldenResult.error) {
                    console.log(`   Error: ${schuldenResult.error}`);
                }
            }
        } catch (error) {
            console.log(`❌ Schuldenbereinigungsplan generation failed: ${error.message}`);
        }

        // Test 2: Generate ACTUAL Forderungsübersicht
        console.log('\n📋 Test 2: Generating ACTUAL Forderungsübersicht...');
        
        try {
            const clientData = {
                name: `${mockClient.firstName} ${mockClient.lastName}`,
                reference: mockClient.aktenzeichen,
                firstName: mockClient.firstName,
                lastName: mockClient.lastName
            };
            
            const creditorData = mockClient.final_creditor_list.map(creditor => ({
                creditor_name: creditor.sender_name,
                creditor_address: creditor.sender_address,
                creditor_email: creditor.sender_email,
                creditor_reference: creditor.reference_number,
                debt_amount: creditor.claim_amount,
                debt_reason: 'Kreditvertrag',
                remarks: '',
                is_representative: false,
                representative_info: null
            }));
            
            const forderungsResult = await documentGenerator.generateForderungsuebersicht(clientData, creditorData);
            
            if (forderungsResult && forderungsResult.success && forderungsResult.document_info) {
                console.log(`✅ Forderungsübersicht generated: ${forderungsResult.document_info.filename}`);
                
                // Copy to current directory for viewing
                const targetPath = path.join(__dirname, 'test-real-forderungsuebersicht.docx');
                fs.copyFileSync(forderungsResult.document_info.path, targetPath);
                console.log(`📁 Copied to: ${targetPath}`);
            } else {
                console.log('❌ No Forderungsübersicht file generated');
                if (forderungsResult.error) {
                    console.log(`   Error: ${forderungsResult.error}`);
                }
            }
        } catch (error) {
            console.log(`❌ Forderungsübersicht generation failed: ${error.message}`);
        }

        // Test 3: Convert to PDF and merge with Insolvenzantrag
        console.log('\n🔗 Test 3: Complete Integration Test...');
        
        try {
            const { PDFDocument } = require('pdf-lib');
            const { convertDocxToPdf } = require('./server/services/documentConverter');
            const QuickFieldMapper = require('./pdf-form-test/quick-field-mapper');
            
            // Generate Insolvenzantrag PDF
            const formData = {
                nachname: mockClient.lastName,
                vorname: mockClient.firstName,
                strasse: 'Musterstraße',
                hausnummer: '123',
                plz: '12345',
                ort: 'Musterstadt',
                telefon: '+49 123 456789',
                email: 'max.mustermann@example.com',
                familienstand: 'verheiratet',
                kinder_anzahl: '2',
                monatliches_netto_einkommen: '2500',
                gesamtschuldensumme: '45000',
                anzahl_glaeubiger: '3',
                amtsgericht: 'Berlin'
            };
            
            const originalPdfPath = path.join(__dirname, 'pdf-form-test/original_form.pdf');
            if (fs.existsSync(originalPdfPath)) {
                const insolvenzantragBytes = await QuickFieldMapper.fillWithRealFields(formData, originalPdfPath);
                
                // Create merged PDF
                const mergedPdf = await PDFDocument.create();
                
                // Add Insolvenzantrag
                const insolvenzantragDoc = await PDFDocument.load(insolvenzantragBytes);
                const insolvenzantragPages = await mergedPdf.copyPages(insolvenzantragDoc, insolvenzantragDoc.getPageIndices());
                insolvenzantragPages.forEach(page => mergedPdf.addPage(page));
                
                // Add Schuldenbereinigungsplan if available
                const schuldenPath = path.join(__dirname, 'test-real-schuldenbereinigungsplan.docx');
                if (fs.existsSync(schuldenPath)) {
                    try {
                        const schuldenPdfBytes = await convertDocxToPdf(schuldenPath);
                        const schuldenDoc = await PDFDocument.load(schuldenPdfBytes);
                        const schuldenPages = await mergedPdf.copyPages(schuldenDoc, schuldenDoc.getPageIndices());
                        schuldenPages.forEach(page => mergedPdf.addPage(page));
                        console.log('✅ Added Schuldenbereinigungsplan to merged PDF');
                    } catch (error) {
                        console.log(`⚠️  Could not convert Schuldenbereinigungsplan to PDF: ${error.message}`);
                    }
                }
                
                // Add Forderungsübersicht if available
                const forderungsPath = path.join(__dirname, 'test-real-forderungsuebersicht.docx');
                if (fs.existsSync(forderungsPath)) {
                    try {
                        const forderungsPdfBytes = await convertDocxToPdf(forderungsPath);
                        const forderungsDoc = await PDFDocument.load(forderungsPdfBytes);
                        const forderungsPages = await mergedPdf.copyPages(forderungsDoc, forderungsDoc.getPageIndices());
                        forderungsPages.forEach(page => mergedPdf.addPage(page));
                        console.log('✅ Added Forderungsübersicht to merged PDF');
                    } catch (error) {
                        console.log(`⚠️  Could not convert Forderungsübersicht to PDF: ${error.message}`);
                    }
                }
                
                // Save complete merged PDF
                const mergedBytes = await mergedPdf.save();
                const completePath = path.join(__dirname, 'test-complete-real-insolvenzantrag.pdf');
                fs.writeFileSync(completePath, mergedBytes);
                console.log(`✅ Complete Insolvenzantrag generated: ${completePath}`);
                
            } else {
                console.log('⚠️  Original form PDF not found, skipping integration test');
            }
            
        } catch (error) {
            console.log(`❌ Integration test failed: ${error.message}`);
        }

        // Test 4: Check document health
        console.log('\n🏥 Test 4: Document Service Health Check...');
        
        try {
            const axios = require('axios');
            const response = await axios.get('http://localhost:3001/api/documents/health', {
                timeout: 5000
            });
            
            console.log(`✅ Document service health: ${response.status} - ${response.data.status}`);
            if (response.data.details) {
                console.log('📋 Service details:', response.data.details);
            }
        } catch (error) {
            console.log(`⚠️  Document service health check failed: ${error.message}`);
        }

        // Summary
        console.log('\n🎉 Test Results Summary:');
        console.log('═══════════════════════════════════════════════');
        
        const generatedFiles = [
            'test-real-schuldenbereinigungsplan.docx',
            'test-real-forderungsuebersicht.docx',
            'test-complete-real-insolvenzantrag.pdf'
        ].filter(file => fs.existsSync(path.join(__dirname, file)));
        
        if (generatedFiles.length > 0) {
            console.log(`✅ ${generatedFiles.length} REAL document files generated:`);
            generatedFiles.forEach(file => {
                const stats = fs.statSync(path.join(__dirname, file));
                const ext = path.extname(file);
                const icon = ext === '.docx' ? '📄' : '📑';
                console.log(`   ${icon} ${file} (${Math.round(stats.size / 1024)} KB)`);
            });
            
            console.log('\n📂 Open these files to verify the REAL documents:');
            generatedFiles.forEach(file => {
                console.log(`   open "${file}"`);
            });
        } else {
            console.log('❌ No files generated - check the document generation service');
        }
        
        console.log('\n🚀 Ready for Admin Dashboard Testing:');
        console.log('1. Open http://localhost:3000/admin');
        console.log('2. Login with admin credentials');
        console.log('3. Navigate to client details');
        console.log('4. Click "Insolvenzantrag herunterladen"');
        console.log('5. Verify the downloaded PDF contains:');
        console.log('   • Official Insolvenzantrag form (45 pages)');
        console.log('   • REAL Schuldenbereinigungsplan document');
        console.log('   • REAL Forderungsübersicht document');
        
    } catch (error) {
        console.error('\n❌ Test failed:', error.message);
        console.error(error.stack);
    }
}

// Run the test
testRealDocumentGeneration().catch(console.error);