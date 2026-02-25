/**
 * Backfill Enrichment for Creditors Needing Manual Review
 *
 * Finds all clients with creditors flagged for manual review due to
 * missing email or address, and runs them through the Enrichment Service.
 *
 * Run with: node server/scripts/backfill-enrichment.js
 *
 * Options:
 *   --dry-run         Preview which creditors would be enriched, don't save
 *   --force           Re-enrich even if creditor already has enrichment_status
 *   --client=<id>     Only process a specific client (by aktenzeichen or _id)
 *   --limit=<n>       Max number of clients to process (default: all)
 *   --delay=<ms>      Delay between enrichment calls in ms (default: 500)
 */

require('dotenv').config();
const mongoose = require('mongoose');
const config = require('../config');
const { callEnrichmentService, getCircuitBreakerState } = require('../utils/enrichmentClient');

// ── CLI flags ────────────────────────────────────────────────
const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const FORCE = args.includes('--force');
const CLIENT_FLAG = args.find(a => a.startsWith('--client='));
const SINGLE_CLIENT = CLIENT_FLAG ? CLIENT_FLAG.split('=')[1] : null;
const LIMIT_FLAG = args.find(a => a.startsWith('--limit='));
const MAX_CLIENTS = LIMIT_FLAG ? parseInt(LIMIT_FLAG.split('=')[1]) : 0;
const DELAY_FLAG = args.find(a => a.startsWith('--delay='));
const CALL_DELAY_MS = DELAY_FLAG ? parseInt(DELAY_FLAG.split('=')[1]) : 500;

// ── Helpers ──────────────────────────────────────────────────
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const isMissing = (val) => {
    if (val === undefined || val === null) return true;
    if (typeof val === 'string') {
        const t = val.trim();
        if (!t) return true;
        const lower = t.toLowerCase();
        if (lower === 'n/a' || lower === 'na' || lower === 'n.a') return true;
    }
    return false;
};

function isValidEmail(val) {
    return typeof val === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val);
}

// ── Main ─────────────────────────────────────────────────────
async function main() {
    console.log('═══════════════════════════════════════════════════════════');
    console.log('  Creditor Enrichment Backfill');
    console.log('═══════════════════════════════════════════════════════════');
    if (DRY_RUN) console.log('  ⚠️  DRY RUN — no changes will be saved');
    if (FORCE) console.log('  ⚡ FORCE — re-enriching already enriched creditors');
    if (SINGLE_CLIENT) console.log(`  🎯 Single client: ${SINGLE_CLIENT}`);
    if (MAX_CLIENTS) console.log(`  📊 Limit: ${MAX_CLIENTS} clients`);
    console.log(`  ⏱️  Delay between calls: ${CALL_DELAY_MS}ms`);
    console.log('');

    // 1. Connect to database
    console.log('📡 Connecting to database...');
    await mongoose.connect(config.MONGODB_URI);
    console.log('   ✅ Connected\n');

    // 2. Load Client model
    const Client = require('../models/Client');

    // 3. Build query: clients with creditors needing review for email/address
    let query = {
        'final_creditor_list': {
            $elemMatch: {
                needs_manual_review: true,
                review_reasons: {
                    $in: ['Fehlende Gläubiger-E-Mail', 'Fehlende Gläubiger-Adresse']
                }
            }
        }
    };

    if (SINGLE_CLIENT) {
        query = {
            $and: [
                { $or: [{ aktenzeichen: SINGLE_CLIENT }, { _id: SINGLE_CLIENT }] },
                query
            ]
        };
    }

    let clientQuery = Client.find(query).sort({ created_at: -1 });
    if (MAX_CLIENTS) clientQuery = clientQuery.limit(MAX_CLIENTS);

    const clients = await clientQuery.lean();
    console.log(`📋 Found ${clients.length} clients with creditors needing review\n`);

    if (clients.length === 0) {
        console.log('✅ No creditors need enrichment. Done.');
        await mongoose.disconnect();
        return;
    }

    // 4. Stats
    const stats = {
        clientsProcessed: 0,
        creditorsFound: 0,
        creditorsSkipped: 0,
        creditorsAlreadyEnriched: 0,
        enrichmentCalls: 0,
        enrichmentSuccess: 0,
        enrichmentPartial: 0,
        enrichmentNotFound: 0,
        enrichmentFailed: 0,
        fieldsFilledEmail: 0,
        fieldsFilledAddress: 0,
        fieldsFilledPhone: 0,
        reviewsCleared: 0,
        dbErrors: 0,
    };

    // 5. Enrichment cache (avoid duplicate calls for same creditor name across clients)
    const enrichmentCache = new Map();

    // 6. Process each client
    for (const client of clients) {
        const label = `${client.firstName} ${client.lastName} (${client.aktenzeichen})`;
        stats.clientsProcessed++;

        console.log(`\n── ${stats.clientsProcessed}/${clients.length} ${label} ──`);

        const creditors = client.final_creditor_list || [];
        const needsReview = creditors.filter(c =>
            c.needs_manual_review &&
            Array.isArray(c.review_reasons) &&
            c.review_reasons.some(r =>
                r === 'Fehlende Gläubiger-E-Mail' || r === 'Fehlende Gläubiger-Adresse'
            )
        );

        if (needsReview.length === 0) {
            console.log('   ⏭️  No creditors needing email/address review');
            continue;
        }

        console.log(`   📋 ${needsReview.length} creditor(s) needing enrichment`);

        let clientModified = false;

        for (const creditor of needsReview) {
            const creditorName = creditor.glaeubiger_name || creditor.sender_name || creditor.id;
            stats.creditorsFound++;

            // Skip if already enriched (unless --force)
            if (creditor.enrichment_status && !FORCE) {
                stats.creditorsAlreadyEnriched++;
                console.log(`   ⏭️  ${creditorName} — already enriched (${creditor.enrichment_status})`);
                continue;
            }

            // Determine what's missing
            const hasEmail = !isMissing(creditor.email_glaeubiger) || !isMissing(creditor.sender_email);
            const hasAddress = !isMissing(creditor.glaeubiger_adresse) || !isMissing(creditor.sender_address);

            const missingFields = [];
            if (!hasEmail) missingFields.push('email');
            if (!hasAddress) missingFields.push('address');
            if (isMissing(creditor.phone)) missingFields.push('phone');

            if (missingFields.length === 0) {
                stats.creditorsSkipped++;
                console.log(`   ⏭️  ${creditorName} — nothing actually missing`);
                continue;
            }

            const displayName = creditorName || 'Unknown';
            console.log(`   🔍 ${displayName} — missing: ${missingFields.join(', ')}`);

            if (DRY_RUN) {
                console.log(`      🔍 [dry-run] Would call enrichment for: ${displayName}`);
                continue;
            }

            // Check cache
            const cacheKey = (creditorName || '').toLowerCase().trim();
            let result = enrichmentCache.get(cacheKey);

            if (result === undefined) {
                // Build known data hints
                const knownData = {};
                if (creditor.glaeubiger_adresse && !isMissing(creditor.glaeubiger_adresse)) {
                    knownData.address_hint = creditor.glaeubiger_adresse;
                }
                if (creditor.sender_address && !isMissing(creditor.sender_address)) {
                    knownData.address_hint = creditor.sender_address;
                }

                // Check circuit breaker before calling
                const cbState = getCircuitBreakerState();
                if (cbState.state === 'OPEN') {
                    console.log('   🔴 Circuit breaker OPEN — stopping enrichment calls');
                    console.log(`      Remaining clients will be skipped. Re-run later.`);
                    break;
                }

                stats.enrichmentCalls++;
                result = await callEnrichmentService(
                    creditorName,
                    knownData,
                    missingFields,
                    client.aktenzeichen || 'backfill'
                );
                enrichmentCache.set(cacheKey, result || null);

                // Throttle between calls
                if (CALL_DELAY_MS > 0) await sleep(CALL_DELAY_MS);
            } else {
                console.log(`      📦 Using cached result for ${displayName}`);
            }

            if (!result || result.status === 'not_found') {
                if (result?.status === 'not_found') stats.enrichmentNotFound++;
                else stats.enrichmentFailed++;
                console.log(`      ❌ ${displayName} — ${result ? 'not_found' : 'enrichment failed'}`);
                continue;
            }

            if (result.status === 'complete') stats.enrichmentSuccess++;
            else if (result.status === 'partial') stats.enrichmentPartial++;

            // Apply enriched data
            const enrichedData = result.enriched_data || {};
            const confidence = result.confidence || {};
            const sources = result.sources || {};
            const appliedFields = [];

            // Email
            if (enrichedData.email && !hasEmail) {
                if (isValidEmail(enrichedData.email)) {
                    creditor.email_glaeubiger = enrichedData.email;
                    creditor.sender_email = enrichedData.email;
                    appliedFields.push('email');
                    stats.fieldsFilledEmail++;
                } else {
                    console.log(`      ⚠️  Invalid email skipped: ${enrichedData.email}`);
                }
            }

            // Address
            if (enrichedData.address && !hasAddress) {
                creditor.glaeubiger_adresse = enrichedData.address;
                creditor.sender_address = enrichedData.address;
                creditor.address_source = sources.address || 'web_enrichment';
                appliedFields.push('address');
                stats.fieldsFilledAddress++;
            }

            // Phone
            if (enrichedData.phone && isMissing(creditor.phone)) {
                creditor.phone = enrichedData.phone;
                appliedFields.push('phone');
                stats.fieldsFilledPhone++;
            }

            // Website / Geschaeftsfuehrer
            if (enrichedData.website && isMissing(creditor.website)) {
                creditor.website = enrichedData.website;
                appliedFields.push('website');
            }
            if (enrichedData.geschaeftsfuehrer && isMissing(creditor.geschaeftsfuehrer)) {
                creditor.geschaeftsfuehrer = enrichedData.geschaeftsfuehrer;
                appliedFields.push('geschaeftsfuehrer');
            }

            // Enrichment metadata
            const bestSource = Object.entries(confidence).sort(([, a], [, b]) => b - a)[0];
            creditor.enrichment_source = bestSource ? (sources[bestSource[0]] || 'web_enrichment') : 'web_enrichment';
            creditor.enrichment_status = result.status === 'complete' ? 'enriched' : result.status;
            const confValues = Object.values(confidence);
            creditor.enrichment_confidence = confValues.length > 0 ? Math.max(...confValues) : 0;
            creditor.enriched_at = new Date();
            creditor.enrichment_log = (result.enrichment_log || []).slice(0, 10).map(entry => ({
                source: entry.source,
                fields_found: entry.fields_found || [],
                confidence: confidence[entry.fields_found?.[0]] || 0,
                timestamp: new Date(entry.timestamp),
            }));

            // Cleanup review reasons if fields were filled
            if (appliedFields.includes('email') && Array.isArray(creditor.review_reasons)) {
                creditor.review_reasons = creditor.review_reasons.filter(r => r !== 'Fehlende Gläubiger-E-Mail');
            }
            if (appliedFields.includes('address') && Array.isArray(creditor.review_reasons)) {
                creditor.review_reasons = creditor.review_reasons.filter(r => r !== 'Fehlende Gläubiger-Adresse');
            }
            if (Array.isArray(creditor.review_reasons) && creditor.review_reasons.length === 0) {
                creditor.needs_manual_review = false;
                stats.reviewsCleared++;
            }

            if (appliedFields.length > 0) {
                clientModified = true;
                console.log(`      ✅ ${displayName} — filled: ${appliedFields.join(', ')} (${result.status})`);
            } else {
                console.log(`      ⚠️  ${displayName} — enrichment returned data but nothing applicable`);
            }
        }

        // Save updated client
        if (clientModified && !DRY_RUN) {
            try {
                await Client.updateOne(
                    { _id: client._id },
                    { $set: { final_creditor_list: client.final_creditor_list } }
                );
                console.log(`   💾 Client saved`);
            } catch (err) {
                stats.dbErrors++;
                console.error(`   ⚠️  Save failed: ${err.message}`);
            }
        }

        // Check circuit breaker health between clients
        const cbState = getCircuitBreakerState();
        if (cbState.state === 'OPEN') {
            console.log('\n🔴 Circuit breaker OPEN — aborting remaining clients.');
            console.log('   Re-run the script later when the enrichment service is available.');
            break;
        }
    }

    // 7. Summary
    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('  ERGEBNIS');
    console.log('═══════════════════════════════════════════════════════════');
    console.log(`  📋 Clients verarbeitet:     ${stats.clientsProcessed}`);
    console.log(`  👥 Gläubiger gefunden:       ${stats.creditorsFound}`);
    console.log(`  ⏭️  Bereits enriched:         ${stats.creditorsAlreadyEnriched}`);
    console.log(`  ⏭️  Übersprungen (komplett):  ${stats.creditorsSkipped}`);
    console.log(`  🔍 Enrichment-Calls:         ${stats.enrichmentCalls}`);
    console.log(`  ✅ Erfolgreich (complete):    ${stats.enrichmentSuccess}`);
    console.log(`  🟡 Teilweise (partial):       ${stats.enrichmentPartial}`);
    console.log(`  ❌ Nicht gefunden:            ${stats.enrichmentNotFound}`);
    console.log(`  💥 Fehlgeschlagen:            ${stats.enrichmentFailed}`);
    console.log('  ─────────────────────────────────────────────────────');
    console.log(`  📧 E-Mails gefüllt:          ${stats.fieldsFilledEmail}`);
    console.log(`  📍 Adressen gefüllt:          ${stats.fieldsFilledAddress}`);
    console.log(`  📞 Telefon gefüllt:           ${stats.fieldsFilledPhone}`);
    console.log(`  ✅ Reviews aufgelöst:         ${stats.reviewsCleared}`);
    if (stats.dbErrors > 0) {
        console.log(`  ⚠️  DB-Fehler:               ${stats.dbErrors}`);
    }
    console.log('═══════════════════════════════════════════════════════════\n');

    // 8. Cleanup
    await mongoose.disconnect();
    console.log('📡 Verbindung geschlossen. Fertig.');
}

main().catch(err => {
    console.error('💥 Fatal error:', err);
    process.exit(1);
});
