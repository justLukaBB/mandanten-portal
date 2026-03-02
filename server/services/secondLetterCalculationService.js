'use strict';

/**
 * Second Letter Calculation Service
 *
 * Pure calculation service for second letter financials.
 * Computes garnishable amount, plan type (RATENPLAN/NULLPLAN), and per-creditor
 * Tilgungsangebot from snapshot data only — never from live financial_data.
 *
 * Used by:
 * - Phase 30 form-submit handler (via secondLetterService.js)
 * - Phase 32+ admin recalculate endpoint
 */

const GermanGarnishmentCalculator = require('./germanGarnishmentCalculator');
const calculator = new GermanGarnishmentCalculator();

/**
 * Calculate second letter financials from a financial snapshot and creditor list.
 *
 * Implements CALC-01 through CALC-04:
 *   CALC-01: Garnishable amount via §850c ZPO (germanGarnishmentCalculator.calculate)
 *   CALC-02: Plan type — RATENPLAN when garnishable > 0, NULLPLAN when == 0
 *   CALC-03: Total debt validation, missing claim_amount guard, zero-division guard
 *   CALC-04: Per-creditor Tilgungsangebot and quota_percentage (pro-rata)
 *
 * @param {Object} snapshot - The second_letter_financial_snapshot subdocument
 * @param {number} snapshot.monthly_net_income - Monthly net income in EUR
 * @param {string} snapshot.familienstand - Marital status ('ledig', 'verheiratet', etc.)
 * @param {number} [snapshot.anzahl_unterhaltsberechtigte=0] - Number of dependents
 *
 * @param {Array<Object>} creditors - The client.final_creditor_list array
 * @param {*} creditors[].claim_amount - Creditor's claim amount in EUR (must not be null/undefined)
 * @param {*} [creditors[]._id] - MongoDB ObjectId of the creditor
 * @param {string} [creditors[].sender_name] - Preferred display name
 * @param {string} [creditors[].creditor_name] - Fallback name
 * @param {string} [creditors[].glaeubiger_name] - Fallback name (German spelling)
 *
 * @returns {{
 *   success: boolean,
 *   garnishableAmount?: number,
 *   planType?: 'RATENPLAN' | 'NULLPLAN',
 *   totalDebt?: number,
 *   creditorCalculations?: Array<{
 *     creditor_id: string,
 *     creditor_name: string,
 *     claim_amount: number,
 *     tilgungsangebot: number,
 *     quota_percentage: number
 *   }>,
 *   error?: string
 * }}
 */
function calculateSecondLetterFinancials(snapshot, creditors) {
    // -------------------------------------------------------------------------
    // CALC-01: Garnishable amount from snapshot via §850c ZPO
    // Phase 30 snapshot stores marital_status + number_of_dependents;
    // older snapshots may use familienstand + anzahl_unterhaltsberechtigte.
    // Support both field name conventions.
    // -------------------------------------------------------------------------
    const familienstand = snapshot.familienstand || snapshot.marital_status;
    const anzahlUnterhaltsberechtigte =
        snapshot.anzahl_unterhaltsberechtigte != null
            ? snapshot.anzahl_unterhaltsberechtigte
            : (snapshot.number_of_dependents || 0);

    const garnishmentResult = calculator.calculate(
        snapshot.monthly_net_income,
        familienstand,
        anzahlUnterhaltsberechtigte
    );

    if (!garnishmentResult.success) {
        return {
            success: false,
            error: `Garnishment calculation failed: ${garnishmentResult.error}`
        };
    }

    // Clamp to zero — garnishable amount cannot be negative
    const garnishableAmount = Math.max(0, garnishmentResult.garnishableAmount);

    // -------------------------------------------------------------------------
    // CALC-02: Plan type (uppercase enum — locked decision)
    // -------------------------------------------------------------------------
    const planType = garnishableAmount > 0 ? 'RATENPLAN' : 'NULLPLAN';

    // -------------------------------------------------------------------------
    // CALC-03: Creditor validation + total debt
    // -------------------------------------------------------------------------
    for (const creditor of creditors) {
        if (creditor.claim_amount == null) {
            const name = creditor.sender_name
                || creditor.creditor_name
                || creditor.glaeubiger_name
                || String(creditor._id || 'Unbekannt');
            return {
                success: false,
                error: `Creditor "${name}" is missing claim_amount — calculation aborted`
            };
        }
    }

    const totalDebt = creditors.reduce((sum, c) => sum + c.claim_amount, 0);

    if (totalDebt === 0) {
        return {
            success: false,
            error: 'Total debt is zero — cannot calculate creditor quotas'
        };
    }

    // -------------------------------------------------------------------------
    // CALC-04: Per-creditor Tilgungsangebot and quota percentage (pro-rata)
    // -------------------------------------------------------------------------
    const creditorCalculations = [];

    for (const creditor of creditors) {
        let tilgungsangebot;
        let quota_percentage;

        if (planType === 'NULLPLAN') {
            // Locked decision: NULLPLAN creditors get explicit 0 (uniform data structure)
            tilgungsangebot = 0;
            quota_percentage = Math.round((creditor.claim_amount / totalDebt) * 10000) / 100;
        } else {
            // RATENPLAN: pro-rata share of monthly garnishable amount
            tilgungsangebot = Math.round(
                (creditor.claim_amount / totalDebt) * garnishableAmount * 100
            ) / 100;
            quota_percentage = Math.round((creditor.claim_amount / totalDebt) * 10000) / 100;
        }

        // Guard: all numeric outputs must be finite — no NaN or Infinity
        if (!Number.isFinite(tilgungsangebot) || !Number.isFinite(quota_percentage)) {
            return {
                success: false,
                error: `Non-finite value computed for creditor "${
                    creditor.sender_name || creditor.creditor_name || creditor.glaeubiger_name || 'Unbekannt'
                }" — tilgungsangebot=${tilgungsangebot}, quota_percentage=${quota_percentage}`
            };
        }

        creditorCalculations.push({
            creditor_id: creditor._id?.toString() || '',
            creditor_name: creditor.sender_name
                || creditor.creditor_name
                || creditor.glaeubiger_name
                || 'Unbekannt',
            claim_amount: creditor.claim_amount,
            tilgungsangebot,
            quota_percentage
        });
    }

    // -------------------------------------------------------------------------
    // Success
    // -------------------------------------------------------------------------
    return {
        success: true,
        garnishableAmount,
        planType,
        totalDebt,
        creditorCalculations
    };
}

module.exports = { calculateSecondLetterFinancials };
