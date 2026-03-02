/**
 * Second Letter (2. Anschreiben) Service
 *
 * State machine for the second creditor letter workflow.
 * States: IDLE → PENDING → FORM_SUBMITTED → SENT
 *
 * Phase 28: Foundation stub with atomic state guard.
 * Phase 29+: Trigger logic, scheduler integration, email dispatch.
 */

const Client = require('../models/Client');

/**
 * Atomically transitions a client from IDLE → PENDING.
 * Uses findOneAndUpdate with status filter as an idempotency guard:
 * - Returns the updated client if transition succeeded
 * - Returns null if the client was not in IDLE state (already triggered)
 *
 * This is the ONLY entry point for triggering a second letter.
 * Both the scheduler and admin trigger must call this function.
 *
 * @param {string} clientId - The client's `id` field (not _id)
 * @param {string} triggeredBy - 'system' (scheduler) or admin identifier
 * @returns {Promise<Object|null>} Updated client or null if guard blocked
 */
async function triggerSecondLetter(clientId, triggeredBy = 'system') {
  const client = await Client.findOneAndUpdate(
    {
      id: clientId,
      second_letter_status: 'IDLE'  // Atomic guard: only IDLE clients transition
    },
    {
      $set: {
        second_letter_status: 'PENDING',
        second_letter_triggered_at: new Date()
      }
    },
    { new: true }
  );

  // null means guard blocked — client is already PENDING/FORM_SUBMITTED/SENT
  return client;
}

/**
 * Atomically transitions a client from PENDING → FORM_SUBMITTED.
 * Called when the client submits the financial data form.
 *
 * @param {string} clientId - The client's `id` field (not _id)
 * @param {Object} snapshotData - Financial snapshot to freeze
 * @returns {Promise<Object|null>} Updated client or null if guard blocked
 */
async function submitForm(clientId, snapshotData) {
  const client = await Client.findOneAndUpdate(
    {
      id: clientId,
      second_letter_status: 'PENDING'  // Guard: only PENDING clients can submit
    },
    {
      $set: {
        second_letter_status: 'FORM_SUBMITTED',
        second_letter_form_submitted_at: new Date(),
        second_letter_financial_snapshot: {
          ...snapshotData,
          snapshot_created_at: new Date()
        }
      }
    },
    { new: true }
  );

  return client;
}

/**
 * Atomically transitions a client from FORM_SUBMITTED → SENT.
 * Called after all creditor emails have been dispatched successfully.
 *
 * @param {string} clientId - The client's `id` field (not _id)
 * @returns {Promise<Object|null>} Updated client or null if guard blocked
 */
async function markSent(clientId) {
  const client = await Client.findOneAndUpdate(
    {
      id: clientId,
      second_letter_status: 'FORM_SUBMITTED'  // Guard: only FORM_SUBMITTED can be marked sent
    },
    {
      $set: {
        second_letter_status: 'SENT',
        second_letter_sent_at: new Date()
      }
    },
    { new: true }
  );

  return client;
}

module.exports = {
  triggerSecondLetter,
  submitForm,
  markSent
};
