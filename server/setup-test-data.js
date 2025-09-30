/**
 * Setup test data for local development
 * Creates test clients with complete data for Insolvenzantrag testing
 */

const mongoose = require('mongoose');
const Client = require('./models/Client');
const Agent = require('./models/Agent');
require('dotenv').config();

// Test data
const testClients = [
  {
    id: 'test-001',
    aktenzeichen: 'TEST-2024-001',
    name: 'Max Mustermann',
    email: 'max.mustermann@example.com',
    firstName: 'Max',
    lastName: 'Mustermann',
    address: 'Teststraße 123, 10115 Berlin',
    vorname: 'Max',
    nachname: 'Mustermann',
    strasse: 'Teststraße',
    hausnummer: '123',
    plz: '10115',
    ort: 'Berlin',
    telefon: '030 12345678',
    telefon_mobil: '0170 12345678',
    familienstand: 'ledig',
    berufsstatus: 'angestellt',
    kinder_anzahl: 0,
    geschlecht: 'maennlich',
    geburtsdatum: '1985-06-15',
    geburtsort: 'Berlin',
    status: 'insolvenzantrag_ready',
    payment_status: 'paid',
    payment_date: new Date(),
    payment_amount: 49,
    workflow_stage: 'final_documents',
    
    // Financial data
    financial_data: {
      monthly_income: 2500,
      monthly_net_income: 2500,
      housing_cost: 800,
      living_expenses: 1200,
      pfaendbar_amount: 169.42,
      number_of_children: 0,
      marital_status: 'ledig',
      completed: true,
      client_form_filled: true,
      completed_at: new Date()
    },
    
    // Creditors with complete data
    final_creditor_list: [
      {
        id: 'cred-001',
        name: 'Sparkasse Berlin',
        address: 'Alexanderplatz 2, 10178 Berlin',
        contact_person: 'Herr Schmidt',
        phone: '030 869 869 869',
        email: 'inkasso@sparkasse-berlin.de',
        claim_amount: 5000,
        original_claim_amount: 5000,
        extraction_confidence: 95,
        document_references: ['bank_statement_1.pdf'],
        is_consumer_credit: true,
        settlement_response_status: 'accepted',
        settlement_accepted_amount: 2165.45,
        settlement_response_date: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
      },
      {
        id: 'cred-002',
        name: 'Vodafone GmbH',
        address: 'Ferdinand-Braun-Platz 1, 40549 Düsseldorf',
        contact_person: 'Frau Müller',
        phone: '0800 1721212',
        email: 'forderung@vodafone.de',
        claim_amount: 1500,
        original_claim_amount: 1500,
        extraction_confidence: 90,
        document_references: ['vodafone_bill.pdf'],
        is_consumer_credit: false,
        settlement_response_status: 'declined',
        settlement_response_date: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000)
      },
      {
        id: 'cred-003',
        name: 'Deutsche Telekom AG',
        address: 'Friedrich-Ebert-Allee 140, 53113 Bonn',
        phone: '0228 181 0',
        claim_amount: 800,
        original_claim_amount: 800,
        extraction_confidence: 88,
        document_references: ['telekom_invoice.pdf'],
        is_consumer_credit: false,
        settlement_response_status: 'no_response'
      },
      {
        id: 'cred-004',
        name: 'Amazon EU S.à r.l.',
        address: '38 Avenue John F. Kennedy, L-1855 Luxembourg',
        email: 'payments@amazon.de',
        claim_amount: 350,
        original_claim_amount: 350,
        extraction_confidence: 92,
        document_references: ['amazon_statement.pdf'],
        settlement_response_status: 'accepted',
        settlement_accepted_amount: 151.58,
        settlement_response_date: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000)
      },
      {
        id: 'cred-005',
        name: 'Stadtwerke Berlin',
        address: 'Stralauer Platz 34, 10243 Berlin',
        phone: '030 2671 2671',
        claim_amount: 600,
        original_claim_amount: 600,
        extraction_confidence: 85,
        document_references: ['utility_bill.pdf'],
        settlement_response_status: 'pending'
      }
    ],
    
    // Debt settlement plan structure
    debt_settlement_plan: {
      created_at: new Date(),
      total_debt: 8250,
      pfaendbar_amount: 169.42,
      creditors: [
        {
          id: 'cred-001',
          name: 'Sparkasse Berlin',
          amount: 5000,
          percentage: 60.6,
          monthly_quota: 100,
          amount_source: 'original_document',
          contact_status: 'responded'
        },
        {
          id: 'cred-002',
          name: 'Vodafone GmbH',
          amount: 1500,
          percentage: 18.2,
          monthly_quota: 30,
          amount_source: 'original_document',
          contact_status: 'responded'
        },
        {
          id: 'cred-003',
          name: 'Deutsche Telekom AG',
          amount: 800,
          percentage: 9.7,
          monthly_quota: 16,
          amount_source: 'original_document',
          contact_status: 'no_response'
        },
        {
          id: 'cred-004',
          name: 'Amazon EU S.à r.l.',
          amount: 350,
          percentage: 4.2,
          monthly_quota: 7,
          amount_source: 'original_document',
          contact_status: 'responded'
        },
        {
          id: 'cred-005',
          name: 'Stadtwerke Berlin',
          amount: 600,
          percentage: 7.3,
          monthly_quota: 12,
          amount_source: 'original_document',
          contact_status: 'no_response'
        }
      ]
    },
    
    // Document analysis complete
    document_analysis: {
      completed: true,
      completed_at: new Date(),
      creditors_identified: 5,
      total_debt_identified: 8250,
      documents_processed: 5
    },
    
    // Settlement plan data
    settlement_plan_generated: true,
    settlement_plan_generated_at: new Date(),
    total_debt: 8250,
    
    // All workflows complete - FINAL STAGE
    agent_review_completed: true,
    agent_review_date: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000), // 10 days ago
    creditor_confirmation_completed: true,
    creditor_confirmation_date: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000), // 5 days ago
    
    // Settlement process complete
    settlement_responses_complete: true,
    settlement_completion_date: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000), // 2 days ago
    
    // All creditor contact attempts finished
    creditor_contact_completed: true,
    creditor_contact_completion_date: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000), // 1 day ago
    
    // Documents generated and ready
    schuldenbereinigungsplan_generated: true,
    schuldenbereinigungsplan_date: new Date(),
    forderungsuebersicht_generated: true,
    forderungsuebersicht_date: new Date(),
    
    // FINAL STAGE: Ready for Insolvenzantrag
    insolvenzantrag_ready: true,
    insolvenzantrag_prerequisites_met: true,
    final_stage_reached: true,
    ready_for_court_submission: true
  },
  {
    id: 'test-002',
    aktenzeichen: 'TEST-2024-002',
    name: 'Erika Musterfrau',
    email: 'erika.musterfrau@example.com',
    firstName: 'Erika',
    lastName: 'Musterfrau',
    address: 'Beispielweg 45, 80331 München',
    vorname: 'Erika',
    nachname: 'Musterfrau',
    strasse: 'Beispielweg',
    hausnummer: '45',
    plz: '80331',
    ort: 'München',
    telefon: '089 12345678',
    telefon_mobil: '0160 98765432',
    familienstand: 'verheiratet',
    berufsstatus: 'arbeitslos',
    kinder_anzahl: 2,
    geschlecht: 'weiblich',
    geburtsdatum: '1978-03-22',
    geburtsort: 'München',
    status: 'insolvenzantrag_ready',
    payment_status: 'paid',
    payment_date: new Date(),
    payment_amount: 49,
    workflow_stage: 'final_documents',
    
    financial_data: {
      monthly_income: 1200,
      monthly_net_income: 1200,
      housing_cost: 600,
      living_expenses: 800,
      pfaendbar_amount: 0,
      number_of_children: 2,
      marital_status: 'verheiratet',
      completed: true,
      client_form_filled: true,
      completed_at: new Date()
    },
    
    final_creditor_list: [
      {
        id: 'cred-006',
        name: 'Commerzbank AG',
        address: 'Kaiserplatz, 60311 Frankfurt am Main',
        contact_person: 'Frau Weber',
        phone: '069 136 20',
        email: 'insolvenz@commerzbank.de',
        claim_amount: 12000,
        original_claim_amount: 12000,
        extraction_confidence: 95,
        document_references: ['commerzbank_credit.pdf'],
        is_consumer_credit: true,
        settlement_response_status: 'declined',
        settlement_response_date: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000)
      },
      {
        id: 'cred-007',
        name: 'Otto GmbH & Co KG',
        address: 'Werner-Otto-Straße 1-7, 22179 Hamburg',
        contact_person: 'Herr Schneider',
        phone: '040 64 61 0',
        email: 'forderung@otto.de',
        claim_amount: 2500,
        original_claim_amount: 2500,
        extraction_confidence: 90,
        document_references: ['otto_invoice.pdf'],
        is_consumer_credit: false,
        settlement_response_status: 'no_response'
      },
      {
        id: 'cred-008',
        name: 'Tchibo GmbH',
        address: 'Überseering 18, 22297 Hamburg',
        phone: '040 3071 0',
        claim_amount: 450,
        original_claim_amount: 450,
        extraction_confidence: 88,
        document_references: ['tchibo_bill.pdf'],
        settlement_response_status: 'pending'
      }
    ],
    
    // Debt settlement plan structure
    debt_settlement_plan: {
      created_at: new Date(),
      total_debt: 14950,
      pfaendbar_amount: 0,
      creditors: [
        {
          id: 'cred-006',
          name: 'Commerzbank AG',
          amount: 12000,
          percentage: 80.3,
          monthly_quota: 0,
          amount_source: 'original_document',
          contact_status: 'responded'
        },
        {
          id: 'cred-007',
          name: 'Otto GmbH & Co KG',
          amount: 2500,
          percentage: 16.7,
          monthly_quota: 0,
          amount_source: 'original_document',
          contact_status: 'no_response'
        },
        {
          id: 'cred-008',
          name: 'Tchibo GmbH',
          amount: 450,
          percentage: 3.0,
          monthly_quota: 0,
          amount_source: 'original_document',
          contact_status: 'no_response'
        }
      ]
    },
    
    // Document analysis complete
    document_analysis: {
      completed: true,
      completed_at: new Date(),
      creditors_identified: 3,
      total_debt_identified: 14950,
      documents_processed: 3
    },
    
    // Settlement plan data
    settlement_plan_generated: true,
    settlement_plan_generated_at: new Date(),
    total_debt: 14950,
    
    // All workflows complete - FINAL STAGE
    agent_review_completed: true,
    agent_review_date: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000),
    creditor_confirmation_completed: true,
    creditor_confirmation_date: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000),
    
    // Settlement process complete
    settlement_responses_complete: true,
    settlement_completion_date: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000),
    
    // All creditor contact attempts finished
    creditor_contact_completed: true,
    creditor_contact_completion_date: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000),
    
    // Documents generated and ready
    schuldenbereinigungsplan_generated: true,
    schuldenbereinigungsplan_date: new Date(),
    forderungsuebersicht_generated: true,
    forderungsuebersicht_date: new Date(),
    
    // FINAL STAGE: Ready for Insolvenzantrag
    insolvenzantrag_ready: true,
    insolvenzantrag_prerequisites_met: true,
    final_stage_reached: true,
    ready_for_court_submission: true
  },
  {
    id: 'test-003',
    aktenzeichen: 'TEST-2024-003',
    name: 'Thomas Schmidt',
    email: 'thomas.schmidt@example.com',
    firstName: 'Thomas',
    lastName: 'Schmidt',
    address: 'Hauptstraße 78, 50667 Köln',
    vorname: 'Thomas',
    nachname: 'Schmidt',
    strasse: 'Hauptstraße',
    hausnummer: '78',
    plz: '50667',
    ort: 'Köln',
    telefon: '0221 987654',
    telefon_mobil: '0175 5555555',
    familienstand: 'geschieden',
    berufsstatus: 'angestellt',
    kinder_anzahl: 1,
    geschlecht: 'maennlich',
    geburtsdatum: '1980-11-10',
    geburtsort: 'Köln',
    status: 'insolvenzantrag_ready',
    payment_status: 'paid',
    payment_date: new Date(),
    payment_amount: 49,
    workflow_stage: 'final_documents',
    
    financial_data: {
      monthly_income: 3200,
      monthly_net_income: 3200,
      housing_cost: 900,
      living_expenses: 1400,
      pfaendbar_amount: 245.80,
      number_of_children: 1,
      marital_status: 'geschieden',
      completed: true,
      client_form_filled: true,
      completed_at: new Date()
    },
    
    final_creditor_list: [
      {
        id: 'cred-009',
        name: 'Deutsche Bank AG',
        address: 'Taunusanlage 12, 60325 Frankfurt am Main',
        contact_person: 'Herr Fischer',
        phone: '069 910 00',
        email: 'inkasso@db.com',
        claim_amount: 8500,
        original_claim_amount: 8500,
        extraction_confidence: 98,
        document_references: ['deutsche_bank_loan.pdf'],
        is_consumer_credit: true,
        settlement_response_status: 'accepted',
        settlement_accepted_amount: 4250,
        settlement_response_date: new Date(Date.now() - 6 * 24 * 60 * 60 * 1000)
      },
      {
        id: 'cred-010',
        name: 'IKEA Deutschland GmbH & Co. KG',
        address: 'Am Wandersmann 2-4, 65719 Hofheim-Wallau',
        contact_person: 'Frau Klein',
        phone: '06122 585 0',
        email: 'kundendienst@ikea.de',
        claim_amount: 1200,
        original_claim_amount: 1200,
        extraction_confidence: 92,
        document_references: ['ikea_furniture.pdf'],
        is_consumer_credit: false,
        settlement_response_status: 'accepted',
        settlement_accepted_amount: 800,
        settlement_response_date: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000)
      },
      {
        id: 'cred-011',
        name: 'Santander Consumer Bank AG',
        address: 'Santander-Platz 1, 41061 Mönchengladbach',
        contact_person: 'Herr Lang',
        phone: '02161 690 0',
        email: 'service@santander.de',
        claim_amount: 3400,
        original_claim_amount: 3400,
        extraction_confidence: 95,
        document_references: ['santander_credit.pdf'],
        is_consumer_credit: true,
        settlement_response_status: 'declined',
        settlement_response_date: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000)
      },
      {
        id: 'cred-012',
        name: 'PayPal (Europe) S.à r.l. et Cie, S.C.A.',
        address: '22-24 Boulevard Royal, L-2449 Luxembourg',
        email: 'service@paypal.de',
        claim_amount: 890,
        original_claim_amount: 890,
        extraction_confidence: 90,
        document_references: ['paypal_statement.pdf'],
        settlement_response_status: 'no_response'
      }
    ],
    
    // Debt settlement plan structure
    debt_settlement_plan: {
      created_at: new Date(),
      total_debt: 13990,
      pfaendbar_amount: 245.80,
      creditors: [
        {
          id: 'cred-009',
          name: 'Deutsche Bank AG',
          amount: 8500,
          percentage: 60.8,
          monthly_quota: 150,
          amount_source: 'original_document',
          contact_status: 'responded'
        },
        {
          id: 'cred-010',
          name: 'IKEA Deutschland GmbH & Co. KG',
          amount: 1200,
          percentage: 8.6,
          monthly_quota: 20,
          amount_source: 'original_document',
          contact_status: 'responded'
        },
        {
          id: 'cred-011',
          name: 'Santander Consumer Bank AG',
          amount: 3400,
          percentage: 24.3,
          monthly_quota: 56,
          amount_source: 'original_document',
          contact_status: 'responded'
        },
        {
          id: 'cred-012',
          name: 'PayPal (Europe) S.à r.l. et Cie, S.C.A.',
          amount: 890,
          percentage: 6.3,
          monthly_quota: 19,
          amount_source: 'original_document',
          contact_status: 'no_response'
        }
      ]
    },
    
    // Document analysis complete
    document_analysis: {
      completed: true,
      completed_at: new Date(),
      creditors_identified: 4,
      total_debt_identified: 13990,
      documents_processed: 4
    },
    
    // Settlement plan data
    settlement_plan_generated: true,
    settlement_plan_generated_at: new Date(),
    total_debt: 13990,
    
    // All workflows complete - FINAL STAGE
    agent_review_completed: true,
    agent_review_date: new Date(Date.now() - 12 * 24 * 60 * 60 * 1000),
    creditor_confirmation_completed: true,
    creditor_confirmation_date: new Date(Date.now() - 6 * 24 * 60 * 60 * 1000),
    
    // Settlement process complete
    settlement_responses_complete: true,
    settlement_completion_date: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
    
    // All creditor contact attempts finished
    creditor_contact_completed: true,
    creditor_contact_completion_date: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000),
    
    // Documents generated and ready
    schuldenbereinigungsplan_generated: true,
    schuldenbereinigungsplan_date: new Date(),
    forderungsuebersicht_generated: true,
    forderungsuebersicht_date: new Date(),
    
    // FINAL STAGE: Ready for Insolvenzantrag
    insolvenzantrag_ready: true,
    insolvenzantrag_prerequisites_met: true,
    final_stage_reached: true,
    ready_for_court_submission: true
  }
];

// Test agent
const testAgent = {
  id: 'test-agent-001',
  email: 'agent@test.com',
  password_hash: 'agent123', // Will be hashed by the pre-save hook
  name: 'Test Agent',
  first_name: 'Test',
  last_name: 'Agent',
  username: 'testagent',
  role: 'agent',
  is_active: true
};

async function setupTestData() {
  try {
    // Connect to MongoDB
    await mongoose.connect('mongodb://localhost:27017/mandanten-portal-test', {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });
    console.log('✅ Connected to MongoDB');
    
    // Clear existing test data
    await Client.deleteMany({ aktenzeichen: { $regex: /^TEST-/ } });
    await Agent.deleteOne({ email: 'agent@test.com' });
    console.log('🧹 Cleared existing test data');
    
    // Create test clients
    for (const clientData of testClients) {
      const client = new Client(clientData);
      await client.save();
      console.log(`✅ Created client: ${client.aktenzeichen} - ${client.name}`);
    }
    
    // Create test agent
    const agent = new Agent(testAgent);
    await agent.save();
    console.log(`✅ Created agent: ${agent.email}`);
    
    // Create admin if doesn't exist
    const adminEmail = process.env.ADMIN_EMAIL || 'admin@test.com';
    const adminExists = await Agent.findOne({ email: adminEmail });
    if (!adminExists) {
      const admin = new Agent({
        id: 'test-admin-001',
        email: adminEmail,
        password_hash: process.env.ADMIN_PASSWORD || 'admin123',
        name: 'Admin User',
        first_name: 'Admin',
        last_name: 'User',
        username: 'admin',
        role: 'supervisor',
        is_active: true
      });
      await admin.save();
      console.log(`✅ Created admin: ${admin.email}`);
    }
    
    console.log('\n📊 Test Data Summary:');
    console.log(`- ${testClients.length} test clients created`);
    console.log(`- Client TEST-2024-001: Ready for Insolvenzantrag (all data complete)`);
    console.log(`- Client TEST-2024-002: In progress (needs agent review)`);
    console.log('\n🔐 Login Credentials:');
    console.log(`- Admin: ${adminEmail} / ${process.env.ADMIN_PASSWORD || 'admin123'}`);
    console.log(`- Agent: agent@test.com / agent123`);
    console.log('\n🌐 Access URLs:');
    console.log('- Client Portal: http://localhost:3000');
    console.log('- Admin Portal: http://localhost:3000/admin');
    console.log('- Agent Portal: http://localhost:3000/agent/login');
    
    // Disconnect
    await mongoose.disconnect();
    console.log('\n✅ Setup complete!');
    
  } catch (error) {
    console.error('❌ Error setting up test data:', error);
    process.exit(1);
  }
}

// Run setup
setupTestData();