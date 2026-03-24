#!/usr/bin/env node
/**
 * Client Status Audit & Repair Script
 *
 * Checks all clients for status inconsistencies where boolean flags
 * don't match the current_status. Optionally fixes them.
 *
 * Usage:
 *   node server/scripts/audit-client-status.js              # Audit only (dry-run)
 *   node server/scripts/audit-client-status.js --fix         # Audit + fix inconsistencies
 *   node server/scripts/audit-client-status.js --client AZ123  # Audit single client
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const mongoose = require('mongoose');
const Client = require('../models/Client');
const { v4: uuidv4 } = require('uuid');

const FIX_MODE = process.argv.includes('--fix');
const SINGLE_CLIENT = process.argv.find((a, i) => process.argv[i - 1] === '--client');

// ─── Consistency Rules ─────────────────────────────────────────────────────────
// Each rule defines: what boolean/field state implies which status should (not) be set

const RULES = [
  {
    id: 'CONFIRMED_BUT_PRE_CONTACT',
    description: 'client_confirmed_creditors=true but status is still pre-confirmation',
    check: (c) => {
      const preConfirmStatuses = [
        'awaiting_client_confirmation',
        'creditor_review',
        'manual_review_complete',
        'documents_completed',
        'upload_window_active'
      ];
      return c.client_confirmed_creditors === true && preConfirmStatuses.includes(c.current_status);
    },
    severity: 'CRITICAL',
    fix: (c) => {
      // Client already confirmed — status should be at least creditor_contact_initiated
      if (c.creditor_contact_started) {
        c.current_status = 'creditor_contact_active';
        c.workflow_status = 'creditor_contact_active';
      } else {
        c.current_status = 'creditor_contact_initiated';
        c.workflow_status = 'creditor_contact_active';
      }
      c.phase = Math.max(c.phase || 1, 2);
      return `Status corrected to ${c.current_status}`;
    }
  },
  {
    id: 'NOT_CONFIRMED_BUT_POST_CONTACT',
    description: 'client_confirmed_creditors=false but status is post-confirmation',
    check: (c) => {
      const postConfirmStatuses = [
        'creditor_contact_initiated',
        'creditor_contact_active',
        'creditor_contact_failed',
        'creditor_calculation_ready',
        'settlement_documents_generated',
        'settlement_plan_sent_to_creditors',
        'settlement_plan_generating',
        'settlement_plan_ready_for_review',
        'insolvenzantrag_data_pending',
        'insolvenzantrag_ready',
        'completed'
      ];
      return c.client_confirmed_creditors !== true && postConfirmStatuses.includes(c.current_status);
    },
    severity: 'WARNING',
    fix: (c) => {
      // Status is post-confirmation, so the flag should be true
      c.client_confirmed_creditors = true;
      c.client_confirmed_at = c.client_confirmed_at || new Date();
      return 'Set client_confirmed_creditors=true to match post-confirmation status';
    }
  },
  {
    id: 'PAYMENT_BUT_NO_STATUS_ADVANCE',
    description: 'first_payment_received=true but status is still pre-payment',
    check: (c) => {
      return c.first_payment_received === true && c.current_status === 'waiting_for_payment';
    },
    severity: 'WARNING',
    fix: (c) => {
      c.current_status = 'payment_confirmed';
      return 'Advanced status from waiting_for_payment to payment_confirmed';
    }
  },
  {
    id: 'ADMIN_APPROVED_BUT_NO_STATUS_ADVANCE',
    description: 'admin_approved=true but status still in creditor_review',
    check: (c) => {
      return c.admin_approved === true && c.current_status === 'creditor_review';
    },
    severity: 'INFO',
    fix: null // This could be intentional (admin approved but hasn't sent confirmation email yet)
  },
  {
    id: 'PHASE_MISMATCH',
    description: 'Phase does not match current_status position in workflow',
    check: (c) => {
      const phase2Statuses = [
        'creditor_contact_initiated',
        'creditor_contact_active',
        'creditor_contact_failed',
        'creditor_calculation_ready',
        'settlement_documents_generated',
        'settlement_plan_sent_to_creditors',
        'settlement_plan_generating',
        'settlement_plan_ready_for_review',
        'insolvenzantrag_data_pending',
        'insolvenzantrag_ready',
        'completed'
      ];
      return phase2Statuses.includes(c.current_status) && (c.phase || 1) < 2;
    },
    severity: 'WARNING',
    fix: (c) => {
      c.phase = 2;
      return 'Set phase=2 to match post-confirmation status';
    }
  },
  {
    id: 'WORKFLOW_STATUS_DESYNC',
    description: 'workflow_status does not match current_status',
    check: (c) => {
      const expectedMapping = {
        'creditor_contact_initiated': 'creditor_contact_active',
        'creditor_contact_active': 'creditor_contact_active',
        'creditor_contact_failed': 'creditor_contact_active',
        'awaiting_client_confirmation': 'client_confirmation',
        'creditor_review': 'admin_review',
        'upload_window_active': 'upload_window_active',
        'portal_access_sent': 'portal_access_sent',
        'documents_processing': 'documents_processing',
        'completed': 'completed'
      };
      const expected = expectedMapping[c.current_status];
      if (!expected) return false; // No mapping defined — skip
      return c.workflow_status !== expected;
    },
    severity: 'INFO',
    fix: (c) => {
      const expectedMapping = {
        'creditor_contact_initiated': 'creditor_contact_active',
        'creditor_contact_active': 'creditor_contact_active',
        'creditor_contact_failed': 'creditor_contact_active',
        'awaiting_client_confirmation': 'client_confirmation',
        'creditor_review': 'admin_review',
        'upload_window_active': 'upload_window_active',
        'portal_access_sent': 'portal_access_sent',
        'documents_processing': 'documents_processing',
        'completed': 'completed'
      };
      const expected = expectedMapping[c.current_status];
      if (expected) {
        const old = c.workflow_status;
        c.workflow_status = expected;
        return `workflow_status corrected: ${old} → ${expected}`;
      }
      return null;
    }
  },
  {
    id: 'CREDITOR_CONTACT_STARTED_BUT_NO_FLAG',
    description: 'Status is creditor_contact_active but creditor_contact_started=false',
    check: (c) => {
      return c.current_status === 'creditor_contact_active' && !c.creditor_contact_started;
    },
    severity: 'WARNING',
    fix: (c) => {
      c.creditor_contact_started = true;
      c.creditor_contact_started_at = c.creditor_contact_started_at || new Date();
      return 'Set creditor_contact_started=true to match active contact status';
    }
  },
  {
    id: 'NO_CREDITORS_BUT_AWAITING_CONFIRMATION',
    description: 'Status is awaiting_client_confirmation but no creditors in list',
    check: (c) => {
      return c.current_status === 'awaiting_client_confirmation' &&
             (!c.final_creditor_list || c.final_creditor_list.length === 0);
    },
    severity: 'WARNING',
    fix: null // Needs manual investigation
  }
];

// ─── Main ───────────────────────────────────────────────────────────────────────

async function main() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  CLIENT STATUS AUDIT' + (FIX_MODE ? ' + REPAIR' : ' (dry-run)'));
  console.log('═══════════════════════════════════════════════════════════════');
  console.log();

  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected to MongoDB\n');

  const query = SINGLE_CLIENT ? { aktenzeichen: SINGLE_CLIENT } : {};
  const clients = await Client.find(query).lean(false);
  console.log(`Auditing ${clients.length} clients...\n`);

  const findings = {
    CRITICAL: [],
    WARNING: [],
    INFO: []
  };

  let fixedCount = 0;

  for (const client of clients) {
    const clientIssues = [];

    for (const rule of RULES) {
      try {
        if (rule.check(client)) {
          const issue = {
            ruleId: rule.id,
            severity: rule.severity,
            description: rule.description,
            aktenzeichen: client.aktenzeichen,
            name: `${client.firstName} ${client.lastName}`,
            current_status: client.current_status,
            workflow_status: client.workflow_status,
            client_confirmed_creditors: client.client_confirmed_creditors,
            phase: client.phase,
            creditor_count: (client.final_creditor_list || []).length,
            admin_approved: client.admin_approved,
            first_payment_received: client.first_payment_received
          };

          clientIssues.push(issue);
          findings[rule.severity].push(issue);

          if (FIX_MODE && rule.fix) {
            const fixResult = rule.fix(client);
            if (fixResult) {
              client.status_history.push({
                id: uuidv4(),
                status: client.current_status,
                changed_by: 'system',
                metadata: {
                  action: 'status_audit_repair',
                  rule_id: rule.id,
                  fix_description: fixResult,
                  repaired_at: new Date().toISOString()
                },
                created_at: new Date()
              });
              client.updated_at = new Date();
              issue.fixed = fixResult;
            }
          }
        }
      } catch (err) {
        console.error(`  Error checking rule ${rule.id} for ${client.aktenzeichen}:`, err.message);
      }
    }

    if (clientIssues.length > 0 && FIX_MODE) {
      const fixableIssues = clientIssues.filter(i => i.fixed);
      if (fixableIssues.length > 0) {
        await client.save();
        fixedCount++;
        console.log(`  FIXED ${client.aktenzeichen}: ${fixableIssues.map(i => i.fixed).join('; ')}`);
      }
    }
  }

  // ─── Report ─────────────────────────────────────────────────────────────────
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('  AUDIT RESULTS');
  console.log('═══════════════════════════════════════════════════════════════\n');

  const totalIssues = findings.CRITICAL.length + findings.WARNING.length + findings.INFO.length;

  if (totalIssues === 0) {
    console.log('  All clients are consistent. No issues found.\n');
  } else {
    // CRITICAL
    if (findings.CRITICAL.length > 0) {
      console.log(`  CRITICAL (${findings.CRITICAL.length}):`);
      console.log('  ─────────────────────────────────────');
      for (const f of findings.CRITICAL) {
        console.log(`    ${f.aktenzeichen} (${f.name})`);
        console.log(`      Rule: ${f.ruleId}`);
        console.log(`      Status: current_status=${f.current_status}, workflow_status=${f.workflow_status}`);
        console.log(`      Flags:  confirmed=${f.client_confirmed_creditors}, phase=${f.phase}, creditors=${f.creditor_count}`);
        if (f.fixed) console.log(`      FIX:    ${f.fixed}`);
        console.log();
      }
    }

    // WARNING
    if (findings.WARNING.length > 0) {
      console.log(`  WARNING (${findings.WARNING.length}):`);
      console.log('  ─────────────────────────────────────');
      for (const f of findings.WARNING) {
        console.log(`    ${f.aktenzeichen} (${f.name})`);
        console.log(`      Rule: ${f.ruleId}`);
        console.log(`      Status: current_status=${f.current_status}, workflow_status=${f.workflow_status}`);
        console.log(`      Flags:  confirmed=${f.client_confirmed_creditors}, phase=${f.phase}, creditors=${f.creditor_count}`);
        if (f.fixed) console.log(`      FIX:    ${f.fixed}`);
        console.log();
      }
    }

    // INFO
    if (findings.INFO.length > 0) {
      console.log(`  INFO (${findings.INFO.length}):`);
      console.log('  ─────────────────────────────────────');
      for (const f of findings.INFO) {
        console.log(`    ${f.aktenzeichen} (${f.name})`);
        console.log(`      Rule: ${f.ruleId} — ${f.description}`);
        console.log(`      Status: current_status=${f.current_status}, workflow_status=${f.workflow_status}`);
        if (f.fixed) console.log(`      FIX:    ${f.fixed}`);
        console.log();
      }
    }

    console.log('  ─────────────────────────────────────');
    console.log(`  TOTAL: ${findings.CRITICAL.length} critical, ${findings.WARNING.length} warnings, ${findings.INFO.length} info`);
    if (FIX_MODE) {
      console.log(`  FIXED: ${fixedCount} clients repaired`);
    } else {
      console.log(`  Run with --fix to repair fixable issues`);
    }
  }

  console.log();
  await mongoose.disconnect();
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
