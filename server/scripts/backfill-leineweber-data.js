/**
 * Backfill Leineweber Data for Existing Clients
 *
 * Goes through all clients, checks each against the Leineweber database,
 * and syncs the rich form data (address, job, income, debts, family) for matches.
 *
 * Run with: node server/scripts/backfill-leineweber-data.js
 *
 * Options:
 *   --dry-run       Preview changes without saving
 *   --force         Re-sync even if client already has leineweber_synced_at
 *   --client=<id>   Only process a specific client (by aktenzeichen or _id)
 */

require('dotenv').config();
const mongoose = require('mongoose');
const config = require('../config');

// ── Leineweber connection ────────────────────────────────────
const LEINEWEBER_URI = process.env.LEINEWEBER_MONGODB_URI;

// ── CLI flags ────────────────────────────────────────────────
const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const FORCE = args.includes('--force');
const CLIENT_FLAG = args.find(a => a.startsWith('--client='));
const SINGLE_CLIENT = CLIENT_FLAG ? CLIENT_FLAG.split('=')[1] : null;

// ── Helpers ──────────────────────────────────────────────────
const safeNum = (v) => {
  if (v == null || v === '') return undefined;
  const n = Number(v);
  return isNaN(n) ? undefined : n;
};

function mapFormToClientFields(form) {
  const fields = {
    geburtsort: form.geburtsort || undefined,
    familienstand: form.familienstand || undefined,
    mobiltelefon: form.phoneNumber || undefined,
    strasse: form.strasse || undefined,
    hausnummer: form.hausnummer || undefined,
    plz: form.plz || undefined,
    wohnort: form.wohnort || undefined,
    beschaeftigungsart: form.beschaeftigungsArt || undefined,
    derzeitige_taetigkeit: form.derzeitigeTaetigkeit || undefined,
    erlernter_beruf: form.erlernterBeruf || undefined,
    netto_einkommen: safeNum(form.nettoEinkommen),
    selbststaendig: form.selbststaendig,
    befristet: form.befristet,
    war_selbststaendig: form.warSelbststaendig,
    gesamt_schulden: safeNum(form.gesamtSchulden),
    anzahl_glaeubiger: safeNum(form.glaeubiger),
    aktuelle_pfaendung: form.aktuelePfaendung,
    schuldenart_info: form.schuldenartInfo || undefined,
    p_konto: form.pKonto,
    kinder_anzahl: safeNum(form.kinderAnzahl),
    kinder_alter: form.kinderAlter || undefined,
    unterhaltspflicht: form.unterhaltspflicht,
    leineweber_form_data: form,
    leineweber_synced_at: new Date(),
  };

  // Composite address fallback
  if (form.strasse && form.plz && form.wohnort) {
    const street = form.hausnummer ? `${form.strasse} ${form.hausnummer}` : form.strasse;
    fields.address = `${street}, ${form.plz} ${form.wohnort}`;
  }

  // Also set case_source + task_id if not already set
  fields.case_source = 'online';
  fields.leineweber_task_id = form.taskId;

  return fields;
}

// ── Main ─────────────────────────────────────────────────────
async function main() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  Leineweber Data Backfill Script');
  console.log('═══════════════════════════════════════════════════════════');
  if (DRY_RUN) console.log('  ⚠️  DRY RUN — no changes will be saved');
  if (FORCE) console.log('  ⚡ FORCE — re-syncing already synced clients');
  if (SINGLE_CLIENT) console.log(`  🎯 Single client: ${SINGLE_CLIENT}`);
  console.log('');

  // 1. Check Leineweber URI
  if (!LEINEWEBER_URI) {
    console.error('❌ LEINEWEBER_MONGODB_URI not set in environment. Aborting.');
    process.exit(1);
  }

  // 2. Connect to main database
  console.log('📡 Connecting to main database...');
  await mongoose.connect(config.MONGODB_URI);
  console.log('   ✅ Connected');

  // 3. Connect to Leineweber database
  console.log('📡 Connecting to Leineweber database...');
  const leineweberConn = await mongoose.createConnection(LEINEWEBER_URI, {
    serverSelectionTimeoutMS: 5000,
    maxPoolSize: 3,
  }).asPromise();
  console.log('   ✅ Connected');

  // 4. Create Leineweber Form model
  const formSchema = new mongoose.Schema({
    taskId: String, qualifiziert: Boolean,
    vorname: String, nachname: String,
    geburtsdatum: String, geburtsort: String, geschlecht: String,
    familienstand: String, phoneNumber: String,
    strasse: String, hausnummer: String, plz: String, wohnort: String,
    beschaeftigungsArt: String, derzeitigeTaetigkeit: String,
    erlernterBeruf: String, nettoEinkommen: String,
    selbststaendig: Boolean, befristet: Boolean, warSelbststaendig: Boolean,
    gesamtSchulden: String, glaeubiger: String,
    aktuelePfaendung: Boolean, schuldenartInfo: String, pKonto: Boolean,
    kinderAnzahl: String, kinderAlter: String, unterhaltspflicht: Boolean,
  }, { strict: false, collection: 'forms' });
  const FormModel = leineweberConn.model('Form', formSchema);

  // 5. Load Client model
  const Client = require('../models/Client');

  // 6. Load clients
  let query = {};
  if (SINGLE_CLIENT) {
    query = { $or: [{ aktenzeichen: SINGLE_CLIENT }, { _id: SINGLE_CLIENT }] };
  }
  const clients = await Client.find(query).sort({ created_at: -1 }).lean();
  console.log(`\n📋 Found ${clients.length} clients to process\n`);

  // 7. Stats
  let matched = 0;
  let alreadySynced = 0;
  let updated = 0;
  let noMatch = 0;
  let errors = 0;

  // 8. Process each client
  for (const client of clients) {
    const label = `${client.firstName} ${client.lastName} (${client.aktenzeichen})`;

    // Skip if already synced (unless --force)
    if (client.leineweber_synced_at && !FORCE) {
      alreadySynced++;
      console.log(`  ⏭️  ${label} — already synced at ${new Date(client.leineweber_synced_at).toISOString()}`);
      continue;
    }

    try {
      // Convert DD.MM.YYYY → YYYY-MM-DD for Leineweber comparison
      const toISO = (de) => {
        if (!de) return null;
        const p = de.split('.');
        if (p.length !== 3) return de;
        return `${p[2]}-${p[1].padStart(2, '0')}-${p[0].padStart(2, '0')}`;
      };

      const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const firstName = client.firstName.trim();
      const lastName = client.lastName.trim();

      // Strategy 1: Exact name + ISO birthday
      let form = null;
      const isoBday = toISO(client.geburtstag);

      if (isoBday) {
        form = await FormModel.findOne({
          qualifiziert: true,
          vorname: new RegExp(`^\\s*${esc(firstName)}\\s*$`, 'i'),
          nachname: new RegExp(`^\\s*${esc(lastName)}\\s*$`, 'i'),
          geburtsdatum: isoBday,
        }).sort({ _id: -1 }).lean();
      }

      // Strategy 2: Exact name (trimmed), no birthday
      if (!form) {
        form = await FormModel.findOne({
          qualifiziert: true,
          vorname: new RegExp(`^\\s*${esc(firstName)}\\s*$`, 'i'),
          nachname: new RegExp(`^\\s*${esc(lastName)}\\s*$`, 'i'),
        }).sort({ _id: -1 }).lean();
      }

      // Strategy 3: firstName contained in LW vorname (handles "Justin" vs "Justin Heinz")
      if (!form) {
        form = await FormModel.findOne({
          qualifiziert: true,
          vorname: new RegExp(`(^|\\s)${esc(firstName)}(\\s|$)`, 'i'),
          nachname: new RegExp(`^\\s*${esc(lastName)}\\s*$`, 'i'),
        }).sort({ _id: -1 }).lean();
      }

      if (!form) {
        noMatch++;
        console.log(`  ❌ ${label} — kein Leineweber-Match`);
        continue;
      }

      matched++;
      const fields = mapFormToClientFields(form);
      const filledCount = Object.keys(fields).filter(k => fields[k] != null).length;

      console.log(`  ✅ ${label} — MATCH (taskId: ${form.taskId}, ${filledCount} Felder)`);

      // Show key data
      if (form.strasse) console.log(`     📍 ${form.strasse} ${form.hausnummer || ''}, ${form.plz || ''} ${form.wohnort || ''}`);
      if (form.nettoEinkommen) console.log(`     💰 Einkommen: ${form.nettoEinkommen}€ | Schulden: ${form.gesamtSchulden || '–'}€`);
      if (form.glaeubiger) console.log(`     👥 Gläubiger: ${form.glaeubiger}`);

      if (!DRY_RUN) {
        await Client.updateOne({ _id: client._id }, { $set: fields });
        updated++;
        console.log(`     💾 Gespeichert`);
      } else {
        console.log(`     🔍 [dry-run] Würde ${filledCount} Felder speichern`);
      }

    } catch (err) {
      errors++;
      console.error(`  ⚠️  ${label} — Fehler: ${err.message}`);
    }
  }

  // 9. Summary
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('  ERGEBNIS');
  console.log('═══════════════════════════════════════════════════════════');
  console.log(`  📋 Gesamt:           ${clients.length}`);
  console.log(`  ✅ Leineweber-Match: ${matched}`);
  console.log(`  💾 Aktualisiert:     ${DRY_RUN ? `0 (dry-run, ${matched} würden aktualisiert)` : updated}`);
  console.log(`  ⏭️  Bereits gesynct:  ${alreadySynced}`);
  console.log(`  ❌ Kein Match:       ${noMatch}`);
  if (errors > 0) console.log(`  ⚠️  Fehler:          ${errors}`);
  console.log('═══════════════════════════════════════════════════════════\n');

  // 10. Cleanup
  await leineweberConn.close();
  await mongoose.disconnect();
  console.log('📡 Verbindungen geschlossen. Fertig.');
}

main().catch(err => {
  console.error('💥 Fatal error:', err);
  process.exit(1);
});
