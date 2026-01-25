#!/usr/bin/env node

/**
 * Test Script für Gläubiger-Bestätigung und 1. Anschreiben-Erstellung
 * 
 * Dieses Script testet den kompletten Flow:
 * 1. Erstellt einen Test-Client mit Gläubigern
 * 2. Simuliert die Gläubiger-Bestätigung durch den Benutzer
 * 3. Prüft, ob das 1. Anschreiben für jeden Gläubiger erstellt wurde
 * 4. Zeigt die generierten Dokumente an
 */

const axios = require('axios');
const fs = require('fs').promises;
const path = require('path');
require('dotenv').config();

// Configuration
const BASE_URL = process.env.BACKEND_URL || 'http://localhost:3001';
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || 'test-admin-token';

// API endpoints
const API = {
  createClient: `${BASE_URL}/api/test/creditor-contact/create-ready-client`,
  confirmCreditors: (clientId) => `${BASE_URL}/api/clients/${clientId}/confirm-creditors`,
  getCreditorConfirmation: (clientId) => `${BASE_URL}/api/clients/${clientId}/creditor-confirmation`,
  getCreditorContactStatus: (clientId) => `${BASE_URL}/api/clients/${clientId}/creditor-contact-status`
};

// Dokumenten-Verzeichnis
const DOCUMENTS_DIR = path.join(__dirname, '../../server/generated_documents/first_round');

// HTTP client with auth
const client = axios.create({
  timeout: 60000, // 60 seconds for document generation
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

function info(message) {
  console.log(`ℹ️  ${message}`);
}

function wait(seconds) {
  console.log(`⏳ Warte ${seconds} Sekunden...`);
  return new Promise(resolve => setTimeout(resolve, seconds * 1000));
}

/**
 * Prüft, ob Dokumente im Verzeichnis existieren
 */
async function checkGeneratedDocuments(aktenzeichen, expectedCount) {
  try {
    // Prüfe ob Verzeichnis existiert
    try {
      await fs.access(DOCUMENTS_DIR);
    } catch {
      return {
        success: false,
        error: `Dokumenten-Verzeichnis existiert nicht: ${DOCUMENTS_DIR}`
      };
    }

    // Lese alle Dateien im Verzeichnis
    const files = await fs.readdir(DOCUMENTS_DIR);
    
    // Filtere nach DOCX-Dateien für diesen Client
    // Dateinamen-Format: ${aktenzeichen}_${creditorName}_Erstschreiben.docx
    const sanitizedAktenzeichen = aktenzeichen.replace(/[^a-zA-Z0-9]/g, '_');
    const clientFiles = files.filter(file => 
      file.endsWith('.docx') && 
      (file.startsWith(`${aktenzeichen}_`) || 
       file.startsWith(`${sanitizedAktenzeichen}_`) ||
       file.includes(`_${aktenzeichen}_`) ||
       file.includes(`_${sanitizedAktenzeichen}_`))
    );

    // Sortiere nach Änderungsdatum (neueste zuerst)
    const filesWithStats = await Promise.all(
      clientFiles.map(async (file) => {
        const filePath = path.join(DOCUMENTS_DIR, file);
        const stats = await fs.stat(filePath);
        return {
          filename: file,
          path: filePath,
          size: stats.size,
          modified: stats.mtime,
          created: stats.birthtime
        };
      })
    );

    filesWithStats.sort((a, b) => b.modified - a.modified);

    // Prüfe ob genug Dokumente erstellt wurden
    // Dokumente müssen in den letzten 10 Minuten erstellt worden sein und eine Mindestgröße haben (> 1 KB)
    const tenMinutesAgo = Date.now() - 10 * 60 * 1000;
    const recentFiles = filesWithStats.filter(file => {
      const isRecent = file.modified.getTime() > tenMinutesAgo;
      const hasValidSize = file.size > 1024; // Mindestens 1 KB
      return isRecent && hasValidSize;
    });

    return {
      success: true,
      total_files: clientFiles.length,
      recent_files: recentFiles.length,
      expected_count: expectedCount,
      files: filesWithStats,
      recent_files_list: recentFiles,
      all_files_match: recentFiles.length >= expectedCount
    };

  } catch (err) {
    return {
      success: false,
      error: err.message
    };
  }
}

/**
 * Haupttest-Funktion
 */
async function testCreditorConfirmationAndAnschreiben() {
  let testClient = null;
  
  try {
    console.log('\n🧪 TEST: GLÄUBIGER-BESTÄTIGUNG UND 1. ANSCHREIBEN');
    console.log('==================================================\n');

    // Schritt 1: Test-Client erstellen
    log('Schritt 1: Erstelle Test-Client mit Gläubigern...');
    let clientResponse;
    try {
      clientResponse = await client.post(API.createClient);
      testClient = clientResponse.data.test_client;
      success('Test-Client erstellt!', {
        aktenzeichen: testClient.aktenzeichen,
        name: testClient.name,
        creditors: testClient.creditors,
        status: testClient.status
      });
    } catch (err) {
      error('Fehler beim Erstellen des Test-Clients:', err);
      throw err;
    }

    const clientId = testClient.aktenzeichen; // Verwende aktenzeichen als ID
    const creditorCount = testClient.creditors.total;

    // Schritt 2: Prüfe initialen Status
    log('\nSchritt 2: Prüfe initialen Status...');
    try {
      const initialStatus = await client.get(API.getCreditorConfirmation(clientId));
      success('Initialer Status:', {
        workflow_status: initialStatus.data.workflow_status,
        client_confirmed: initialStatus.data.client_confirmed,
        creditors_count: initialStatus.data.creditors?.length || 0
      });
    } catch (err) {
      error('Fehler beim Abrufen des initialen Status:', err);
    }

    // Schritt 3: Prüfe ob Dokumente bereits existieren (sollten nicht)
    log('\nSchritt 3: Prüfe ob bereits Dokumente existieren (sollten nicht)...');
    const initialDocCheck = await checkGeneratedDocuments(clientId, 0);
    if (initialDocCheck.success) {
      info(`Gefundene Dokumente vor Bestätigung: ${initialDocCheck.total_files}`);
      if (initialDocCheck.recent_files > 0) {
        info(`⚠️  ${initialDocCheck.recent_files} kürzlich erstellte Dokumente gefunden (sollten nicht existieren)`);
      }
    }

    // Schritt 4: Simuliere Gläubiger-Bestätigung
    log(`\nSchritt 4: Simuliere Gläubiger-Bestätigung für ${creditorCount} Gläubiger...`);
    let confirmationResponse;
    try {
      // Hole zuerst die Gläubiger-IDs für die Bestätigung
      const creditorData = await client.get(API.getCreditorConfirmation(clientId));
      const creditorIds = creditorData.data.creditors?.map(c => c.id) || [];
      
      if (creditorIds.length === 0) {
        throw new Error('Keine Gläubiger zum Bestätigen gefunden');
      }
      
      confirmationResponse = await client.post(API.confirmCreditors(clientId), {
        confirmed_creditors: creditorIds // Bestätige alle Gläubiger
      });
      success('Gläubiger-Bestätigung erfolgreich!', {
        success: confirmationResponse.data.success,
        status: confirmationResponse.data.status,
        creditor_contact: confirmationResponse.data.creditor_contact
      });
    } catch (err) {
      if (err.code === 'ECONNREFUSED' || err.code === 'ETIMEDOUT') {
        error('Verbindung zum Server fehlgeschlagen. Stelle sicher, dass der Server läuft:', {
          url: BASE_URL,
          error: err.message
        });
      } else {
        error('Fehler bei der Gläubiger-Bestätigung:', err);
      }
      throw err;
    }

    // Schritt 5: Warte auf Dokumentenerstellung
    log('\nSchritt 5: Warte auf Dokumentenerstellung...');
    await wait(10); // 10 Sekunden warten für Dokumentenerstellung

    // Schritt 6: Prüfe ob Dokumente erstellt wurden
    log(`\nSchritt 6: Prüfe ob ${creditorCount} Anschreiben erstellt wurden...`);
    const docCheck = await checkGeneratedDocuments(clientId, creditorCount);
    
    if (docCheck.success) {
      if (docCheck.all_files_match) {
        success(`✅ ${docCheck.recent_files} Anschreiben wurden erfolgreich erstellt!`, {
          erwartet: docCheck.expected_count,
          gefunden: docCheck.recent_files,
          gesamt_im_verzeichnis: docCheck.total_files
        });

        // Zeige Details der erstellten Dokumente
        console.log('\n📄 ERSTELLTE ANSCHREIBEN:');
        console.log('========================');
        docCheck.recent_files_list.forEach((file, index) => {
          const sizeKB = (file.size / 1024).toFixed(2);
          console.log(`${index + 1}. ${file.filename}`);
          console.log(`   Größe: ${sizeKB} KB`);
          console.log(`   Erstellt: ${file.created.toLocaleString('de-DE')}`);
          console.log(`   Pfad: ${file.path}`);
        });
      } else {
        error(`⚠️  Nicht alle Dokumente wurden erstellt!`, {
          erwartet: docCheck.expected_count,
          gefunden: docCheck.recent_files,
          gesamt_im_verzeichnis: docCheck.total_files
        });
      }
    } else {
      error('Fehler beim Prüfen der Dokumente:', docCheck.error);
    }

    // Schritt 7: Prüfe Creditor Contact Status
    log('\nSchritt 7: Prüfe Creditor Contact Status...');
    try {
      await wait(3); // Kurz warten für Status-Update
      const statusResponse = await client.get(API.getCreditorContactStatus(clientId));
      success('Creditor Contact Status:', {
        status: statusResponse.data.status,
        emails_sent: statusResponse.data.emails_sent,
        main_ticket_id: statusResponse.data.main_ticket_id,
        creditor_contacts: statusResponse.data.creditor_contacts?.length || 0
      });
    } catch (err) {
      info('Status konnte nicht abgerufen werden (möglicherweise noch nicht verfügbar):', err.message);
    }

    // Zusammenfassung
    console.log('\n🎯 TEST-ZUSAMMENFASSUNG');
    console.log('=======================');
    console.log(`✅ Test-Client erstellt: ${testClient.aktenzeichen}`);
    console.log(`✅ Gläubiger-Bestätigung durchgeführt: ${confirmationResponse?.data?.success ? 'Ja' : 'Nein'}`);
    console.log(`✅ Anschreiben erstellt: ${docCheck.all_files_match ? `Ja (${docCheck.recent_files}/${docCheck.expected_count})` : 'Nein'}`);
    console.log(`📊 Status nach Bestätigung: ${confirmationResponse?.data?.status || 'Unbekannt'}`);
    
    if (docCheck.all_files_match) {
      console.log('\n🎉 ERFOLG! Das 1. Anschreiben wurde für alle Gläubiger erstellt!');
      console.log(`📁 Dokumente befinden sich in: ${DOCUMENTS_DIR}`);
    } else {
      console.log('\n⚠️  WARNUNG: Nicht alle Dokumente wurden erstellt. Bitte Logs prüfen.');
    }

    return {
      success: docCheck.all_files_match,
      test_client: testClient,
      documents: docCheck.recent_files_list,
      confirmation: confirmationResponse?.data
    };

  } catch (err) {
    error('Test fehlgeschlagen:', err);
    return {
      success: false,
      error: err.message,
      test_client: testClient
    };
  }
}

/**
 * Prüfe nur die Dokumente für einen existierenden Client
 */
async function checkDocumentsForClient(aktenzeichen) {
  try {
    console.log(`\n🔍 Prüfe Dokumente für Client: ${aktenzeichen}\n`);
    
    // Hole Client-Info
    const clientResponse = await client.get(API.getCreditorConfirmation(aktenzeichen));
    const creditorCount = clientResponse.data.creditors?.length || 0;
    
    info(`Client hat ${creditorCount} Gläubiger`);
    
    // Prüfe Dokumente
    const docCheck = await checkGeneratedDocuments(aktenzeichen, creditorCount);
    
    if (docCheck.success) {
      console.log(`\n📊 DOKUMENTEN-STATUS:`);
      console.log(`   Erwartet: ${docCheck.expected_count}`);
      console.log(`   Gefunden (kürzlich): ${docCheck.recent_files}`);
      console.log(`   Gesamt im Verzeichnis: ${docCheck.total_files}`);
      
      if (docCheck.recent_files_list.length > 0) {
        console.log(`\n📄 Kürzlich erstellte Dokumente:`);
        docCheck.recent_files_list.forEach((file, index) => {
          const sizeKB = (file.size / 1024).toFixed(2);
          console.log(`   ${index + 1}. ${file.filename} (${sizeKB} KB)`);
        });
      }
    } else {
      error('Fehler:', docCheck.error);
    }
    
    return docCheck;
  } catch (err) {
    error('Fehler beim Prüfen:', err);
    return { success: false, error: err.message };
  }
}

// CLI Interface
async function main() {
  const command = process.argv[2];
  const aktenzeichen = process.argv[3];

  switch (command) {
    case 'test':
    case undefined:
      await testCreditorConfirmationAndAnschreiben();
      break;
      
    case 'check':
      if (!aktenzeichen) {
        console.error('❌ Bitte Aktenzeichen angeben: node test-creditor-confirmation-anschreiben.js check <AKTENZEICHEN>');
        process.exit(1);
      }
      await checkDocumentsForClient(aktenzeichen);
      break;
      
    case 'help':
      console.log('\n📖 TEST-SCRIPT BEFEHLE');
      console.log('======================');
      console.log('node test-creditor-confirmation-anschreiben.js test     - Führe vollständigen Test durch');
      console.log('node test-creditor-confirmation-anschreiben.js check <AKTENZEICHEN>  - Prüfe Dokumente für einen Client');
      console.log('node test-creditor-confirmation-anschreiben.js help     - Zeige diese Hilfe');
      console.log('\n📝 Beispiel:');
      console.log('  node test-creditor-confirmation-anschreiben.js test');
      console.log('  node test-creditor-confirmation-anschreiben.js check TEST_CC_1234567890');
      break;
      
    default:
      console.log(`❌ Unbekannter Befehl: ${command}. Verwende 'help' für verfügbare Befehle.`);
      process.exit(1);
  }
}

// Script ausführen
if (require.main === module) {
  main().catch(err => {
    error('Script fehlgeschlagen:', err);
    process.exit(1);
  });
}

module.exports = {
  testCreditorConfirmationAndAnschreiben,
  checkDocumentsForClient,
  checkGeneratedDocuments
};
