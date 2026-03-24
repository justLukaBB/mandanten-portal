/**
 * Test script to verify document merging functionality
 * Tests the complete flow of generating and merging all documents
 */

const mongoose = require('mongoose');
const Client = require('./models/Client');
const CreditorDocumentPackageGenerator = require('./services/creditorDocumentPackageGenerator');
const { PDFDocument } = require('pdf-lib');
const fs = require('fs').promises;
const path = require('path');
require('dotenv').config();

async function testDocumentMerge() {
  try {
    console.log('🧪 Starting document merge test...\n');

    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });
    console.log('✅ Connected to MongoDB\n');

    // Find test client with pfändbar amount (TEST-2024-001)
    const testClient = await Client.findOne({ aktenzeichen: 'TEST-2024-001' });

    if (!testClient) {
      console.error('❌ Test client TEST-2024-001 not found!');
      console.log('💡 Run: node server/setup-test-data.js first');
      await mongoose.disconnect();
      return;
    }

    console.log('📋 Test Client:', testClient.aktenzeichen, '-', testClient.name);
    console.log('💰 Pfändbar Amount:', testClient.financial_data?.pfaendbar_amount || 0);
    console.log('📊 Total Debt:', testClient.total_debt || 0);
    console.log('👥 Creditors:', testClient.final_creditor_list?.length || 0);
    console.log('\n' + '='.repeat(60) + '\n');

    // Prepare settlement data
    const settlementData = {
      creditors: testClient.final_creditor_list || testClient.debt_settlement_plan?.creditors || [],
      total_debt: testClient.total_debt || testClient.debt_settlement_plan?.total_debt || 0,
      pfaendbar_amount: testClient.debt_settlement_plan?.pfaendbar_amount || testClient.financial_data?.pfaendbar_amount || 0,
      average_quota_percentage: testClient.debt_settlement_plan?.average_quota_percentage || 32.57,
      start_date: '01.08.2025',
      duration_months: 36,
      monthly_payment: testClient.debt_settlement_plan?.pfaendbar_amount || testClient.financial_data?.pfaendbar_amount || 0
    };

    console.log('📦 Settlement Data prepared:');
    console.log('   - Creditors:', settlementData.creditors.length);
    console.log('   - Total Debt:', settlementData.total_debt);
    console.log('   - Monthly Payment:', settlementData.pfaendbar_amount);
    console.log('   - Duration:', settlementData.duration_months, 'months');
    console.log('\n' + '='.repeat(60) + '\n');

    // Test 1: Generate complete creditor package
    console.log('🧪 TEST 1: Generate Complete Creditor Package\n');
    const packageGenerator = new CreditorDocumentPackageGenerator();

    try {
      const packageResult = await packageGenerator.generateCompleteCreditorPackage(
        testClient,
        settlementData
      );

      if (packageResult.success) {
        console.log('\n✅ Creditor package generated successfully!');
        console.log('📄 Filename:', packageResult.filename);
        console.log('📁 Path:', packageResult.path);
        console.log('📊 Size:', (packageResult.size / 1024).toFixed(2), 'KB');
        console.log('\n📝 Documents included:');
        console.log('   1. Schuldenbereinigungsplan');
        console.log('   2. Forderungsübersicht');
        console.log('   3. Ratenplan pfändbares Einkommen');

        // Verify the PDF was created
        const fileExists = await fs.access(packageResult.path)
          .then(() => true)
          .catch(() => false);

        if (fileExists) {
          console.log('\n✅ PDF file verified on disk');

          // Check PDF page count
          const pdfBytes = await fs.readFile(packageResult.path);
          const pdfDoc = await PDFDocument.load(pdfBytes);
          const pageCount = pdfDoc.getPageCount();

          console.log('📄 Total pages in merged PDF:', pageCount);

          if (pageCount >= 3) {
            console.log('✅ PDF contains multiple pages (merge successful)');
          } else {
            console.log('⚠️  Warning: PDF has fewer pages than expected');
          }
        } else {
          console.log('❌ PDF file not found on disk');
        }

      } else {
        console.log('\n❌ Creditor package generation failed');
        console.log('Error:', packageResult.error);
      }

    } catch (error) {
      console.error('\n❌ Error during package generation:');
      console.error('Message:', error.message);
      console.error('Stack:', error.stack);
    }

    console.log('\n' + '='.repeat(60) + '\n');

    // Test 2: Check individual document structures
    console.log('🧪 TEST 2: Verify Document Structure\n');

    const DocumentGeneratorClass = require('./services/documentGenerator');
    const docGenInstance = new DocumentGeneratorClass();

    try {
      console.log('📝 Generating Schuldenbereinigungsplan...');
      const schuldenplan = await docGenInstance.generateSettlementPlanDocument(
        testClient.aktenzeichen,
        settlementData
      );
      console.log('✅ Schuldenbereinigungsplan structure:');
      console.log('   - Has path:', !!schuldenplan?.path || !!schuldenplan?.document_info?.path);
      console.log('   - Has filename:', !!schuldenplan?.filename || !!schuldenplan?.document_info?.filename);
      console.log('   - Structure:', JSON.stringify(Object.keys(schuldenplan), null, 2));

    } catch (error) {
      console.error('❌ Error generating Schuldenbereinigungsplan:', error.message);
    }

    try {
      console.log('\n📝 Generating Forderungsübersicht...');
      const forderungsuebersicht = await docGenInstance.generateForderungsuebersichtDocument(
        testClient.aktenzeichen
      );
      console.log('✅ Forderungsübersicht structure:');
      console.log('   - Has path:', !!forderungsuebersicht?.path || !!forderungsuebersicht?.document_info?.path);
      console.log('   - Has filename:', !!forderungsuebersicht?.filename || !!forderungsuebersicht?.document_info?.filename);
      console.log('   - Structure:', JSON.stringify(Object.keys(forderungsuebersicht), null, 2));

    } catch (error) {
      console.error('❌ Error generating Forderungsübersicht:', error.message);
    }

    try {
      console.log('\n📝 Generating Ratenplan pfändbares Einkommen...');
      const ratenplan = await docGenInstance.generateRatenplanPfaendbaresEinkommen(
        testClient.aktenzeichen,
        settlementData
      );
      console.log('✅ Ratenplan structure:');
      console.log('   - Has path:', !!ratenplan?.path || !!ratenplan?.document_info?.path);
      console.log('   - Has filename:', !!ratenplan?.filename || !!ratenplan?.document_info?.filename);
      console.log('   - Structure:', JSON.stringify(Object.keys(ratenplan), null, 2));

    } catch (error) {
      console.error('❌ Error generating Ratenplan:', error.message);
    }

    console.log('\n' + '='.repeat(60) + '\n');
    console.log('✅ Document merge test completed!');

    // Disconnect
    await mongoose.disconnect();

  } catch (error) {
    console.error('❌ Test failed:', error);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run test
testDocumentMerge();