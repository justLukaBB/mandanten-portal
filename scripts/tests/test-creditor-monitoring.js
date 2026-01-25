#!/usr/bin/env node

/**
 * Test Script for Creditor Contact Monitoring System
 * 
 * This script demonstrates and tests the creditor contact workflow:
 * 1. Creates a test client ready for creditor contact
 * 2. Triggers client confirmation (simulating portal confirmation)
 * 3. Verifies that creditor emails are sent and monitoring starts
 * 4. Shows monitoring status
 */

const axios = require('axios');
require('dotenv').config();

// Configuration
const BASE_URL = process.env.BACKEND_URL || 'http://localhost:3001';
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || 'test-admin-token';

// API endpoints
const API = {
  createClient: `${BASE_URL}/api/test/creditor-contact/create-ready-client`,
  manualConfirmation: (aktenzeichen) => `${BASE_URL}/api/test/creditor-contact/manual-client-confirmation/${aktenzeichen}`,
  directTrigger: (aktenzeichen) => `${BASE_URL}/api/test/creditor-contact/trigger-creditor-contact/${aktenzeichen}`,
  monitorStatus: (aktenzeichen) => `${BASE_URL}/api/test/creditor-contact/monitor-status/${aktenzeichen}`,
  activeSessions: `${BASE_URL}/api/test/creditor-contact/active-sessions`,
  testClients: `${BASE_URL}/api/test/creditor-contact/test-clients`,
  cleanup: `${BASE_URL}/api/test/creditor-contact/cleanup`
};

// HTTP client with auth
const client = axios.create({
  timeout: 30000,
  headers: {
    'Authorization': `Bearer ${ADMIN_TOKEN}`,
    'Content-Type': 'application/json'
  }
});

// Helper functions
function log(message, data = null) {
  console.log(`🔍 ${message}`);
  if (data) {
    console.log(JSON.stringify(data, null, 2));
  }
}

function success(message, data = null) {
  console.log(`✅ ${message}`);
  if (data) {
    console.log(JSON.stringify(data, null, 2));
  }
}

function error(message, err = null) {
  console.error(`❌ ${message}`);
  if (err) {
    console.error(err.response?.data || err.message || err);
  }
}

function wait(seconds) {
  console.log(`⏳ Waiting ${seconds} seconds...`);
  return new Promise(resolve => setTimeout(resolve, seconds * 1000));
}

// Main test workflow
async function runCreditorContactTest() {
  let testClient = null;
  
  try {
    console.log('\n🧪 CREDITOR CONTACT MONITORING TEST');
    console.log('=====================================\n');

    // Step 1: Create test client
    log('Step 1: Creating test client ready for creditor contact...');
    const clientResponse = await client.post(API.createClient);
    testClient = clientResponse.data.test_client;
    success('Test client created!', {
      aktenzeichen: testClient.aktenzeichen,
      name: testClient.name,
      creditors: testClient.creditors,
      ready_for_contact: testClient.ready_for_contact
    });

    // Step 2: Check initial monitoring status (should be empty)
    log('\nStep 2: Checking initial monitoring status...');
    const initialStatus = await client.get(API.activeSessions);
    success('Initial monitoring status:', initialStatus.data.summary);

    // Step 3: Manual client confirmation (triggers creditor contact)
    log('\nStep 3: Triggering manual client confirmation...');
    const confirmationResponse = await client.post(API.manualConfirmation(testClient.aktenzeichen));
    success('Client confirmation triggered!', {
      creditor_contact_initiated: confirmationResponse.data.creditor_contact_initiated,
      webhook_response: confirmationResponse.data.webhook_response
    });

    // Step 4: Wait and check monitoring status
    await wait(5);
    log('\nStep 4: Checking monitoring status after creditor contact...');
    const statusResponse = await client.get(API.monitorStatus(testClient.aktenzeichen));
    success('Monitoring status:', {
      creditor_contacts: statusResponse.data.creditor_contact_status?.summary,
      monitoring_active: !!statusResponse.data.monitoring_session,
      side_conversations: statusResponse.data.side_conversations?.length || 0
    });

    // Step 5: Check all active sessions
    log('\nStep 5: Checking all active monitoring sessions...');
    const allSessionsResponse = await client.get(API.activeSessions);
    success('All active sessions:', allSessionsResponse.data.summary);

    // Step 6: Show detailed monitoring info
    if (statusResponse.data.monitoring_session) {
      success('🔄 Monitoring is now ACTIVE!', {
        client: testClient.aktenzeichen,
        session: statusResponse.data.monitoring_session,
        side_conversations: statusResponse.data.side_conversations?.length || 0,
        global_monitor: statusResponse.data.global_monitor_running
      });
    } else {
      error('❌ Monitoring is NOT active - check the logs for issues');
    }

    console.log('\n🎯 TEST SUMMARY');
    console.log('===============');
    console.log(`✅ Created test client: ${testClient.aktenzeichen}`);
    console.log(`✅ Triggered creditor contact: ${confirmationResponse.data.creditor_contact_initiated}`);
    console.log(`✅ Monitoring active: ${!!statusResponse.data.monitoring_session}`);
    console.log(`📊 Active sessions: ${allSessionsResponse.data.summary.active_monitoring_sessions}`);
    console.log(`📧 Creditor contacts: ${allSessionsResponse.data.summary.total_creditor_contacts}`);

    if (statusResponse.data.monitoring_session) {
      console.log('\n🎉 SUCCESS! Creditor contact monitoring is now working!');
      console.log('The system is now actively monitoring for creditor responses.');
      console.log(`Use this endpoint to check status: GET ${API.monitorStatus(testClient.aktenzeichen)}`);
    } else {
      console.log('\n⚠️  Monitoring not started - check server logs for errors');
    }

  } catch (err) {
    error('Test failed:', err);
  }

  return testClient;
}

// Alternative direct trigger test
async function runDirectTriggerTest() {
  let testClient = null;
  
  try {
    console.log('\n🚀 DIRECT CREDITOR CONTACT TRIGGER TEST');
    console.log('=======================================\n');

    // Step 1: Create test client
    log('Step 1: Creating test client...');
    const clientResponse = await client.post(API.createClient);
    testClient = clientResponse.data.test_client;
    success('Test client created!', testClient);

    // Step 2: Direct trigger (bypasses client confirmation)
    log('\nStep 2: Direct creditor contact trigger...');
    const triggerResponse = await client.post(API.directTrigger(testClient.aktenzeichen));
    success('Direct trigger completed!', {
      success: triggerResponse.data.success,
      monitoring_started: triggerResponse.data.monitoring_started,
      active_sessions: triggerResponse.data.active_sessions
    });

    // Step 3: Check status
    await wait(3);
    const statusResponse = await client.get(API.monitorStatus(testClient.aktenzeichen));
    success('Final status:', statusResponse.data);

  } catch (err) {
    error('Direct trigger test failed:', err);
  }

  return testClient;
}

// Cleanup test data
async function cleanup() {
  try {
    log('\n🧹 Cleaning up test data...');
    const cleanupResponse = await client.delete(API.cleanup);
    success('Cleanup completed!', cleanupResponse.data.deleted);
  } catch (err) {
    error('Cleanup failed:', err);
  }
}

// Show current status
async function showCurrentStatus() {
  try {
    console.log('\n📊 CURRENT MONITORING STATUS');
    console.log('=============================\n');

    const sessionsResponse = await client.get(API.activeSessions);
    const testClientsResponse = await client.get(API.testClients);

    success('Active monitoring sessions:', sessionsResponse.data.summary);
    
    if (sessionsResponse.data.active_sessions.length > 0) {
      console.log('\n📡 Active Sessions:');
      sessionsResponse.data.active_sessions.forEach(session => {
        console.log(`  - ${session.client_reference}: ${session.side_conversations_count} conversations, ${session.responses_found} responses`);
      });
    }

    success('Test clients available:', {
      total: testClientsResponse.data.total,
      ready_for_testing: testClientsResponse.data.ready_for_testing
    });

    if (testClientsResponse.data.test_clients.length > 0) {
      console.log('\n🧪 Test Clients:');
      testClientsResponse.data.test_clients.forEach(client => {
        console.log(`  - ${client.aktenzeichen}: ${client.status} (${client.creditors.confirmed} creditors)`);
      });
    }

  } catch (err) {
    error('Failed to get current status:', err);
  }
}

// Main CLI interface
async function main() {
  const command = process.argv[2] || 'test';

  switch (command) {
    case 'test':
      await runCreditorContactTest();
      break;
      
    case 'direct':
      await runDirectTriggerTest();
      break;
      
    case 'status':
      await showCurrentStatus();
      break;
      
    case 'cleanup':
      await cleanup();
      break;
      
    case 'help':
      console.log('\n📖 CREDITOR CONTACT TEST COMMANDS');
      console.log('==================================');
      console.log('node test-creditor-monitoring.js test     - Run full creditor contact test');
      console.log('node test-creditor-monitoring.js direct   - Run direct trigger test');
      console.log('node test-creditor-monitoring.js status   - Show current monitoring status');
      console.log('node test-creditor-monitoring.js cleanup  - Clean up test data');
      console.log('node test-creditor-monitoring.js help     - Show this help');
      break;
      
    default:
      console.log(`Unknown command: ${command}. Use 'help' for available commands.`);
      break;
  }
}

// Handle script execution
if (require.main === module) {
  main().catch(err => {
    error('Script failed:', err);
    process.exit(1);
  });
}

module.exports = {
  runCreditorContactTest,
  runDirectTriggerTest,
  cleanup,
  showCurrentStatus
};