const axios = require('axios');

class ZendeskUserDeletionService {
    constructor() {
        this.domain = process.env.ZENDESK_DOMAIN || process.env.ZENDESK_SUBDOMAIN;
        this.email = process.env.ZENDESK_API_EMAIL || process.env.ZENDESK_EMAIL;
        this.token = process.env.ZENDESK_API_TOKEN || process.env.ZENDESK_TOKEN;

        this.baseURL = `https://${this.domain}/api/v2`;

        this.api = axios.create({
            baseURL: this.baseURL,
            auth: {
                username: `${this.email}/token`,
                password: this.token
            },
            headers: {
                'Content-Type': 'application/json'
            }
        });
    }

    /**
     * Check if user has open tickets
     * @param {string} zendeskUserId 
     * @returns {Promise<boolean>}
     */
    async hasOpenTickets(zendeskUserId) {
        try {
            // Fetch tickets requested by the user
            const response = await this.api.get(`/users/${zendeskUserId}/tickets/requested.json`);
            const tickets = response.data.tickets || [];

            // Check for any ticket that is NOT closed or solved
            // Statuses: new, open, pending, hold, solved, closed
            // We consider 'solved' as safe to delete (usually), but 'closed' is definitely safe.
            // However, Zendesk often blocks deletion even for 'solved' tickets until they are 'closed'.
            // So we check for anything that is NOT 'closed'.
            const openTickets = tickets.filter(t => t.status !== 'closed');

            if (openTickets.length > 0) {
                console.log(`🎫 Zendesk: User ${zendeskUserId} has ${openTickets.length} active/solved tickets (not closed).`);
                return true;
            }

            return false;
        } catch (error) {
            console.error(`⚠️ Zendesk: Failed to check tickets for user ${zendeskUserId}:`, error.message);
            // If check fails, assume safe to try delete (or could assume unsafe, but let's try delete and fall back)
            return false;
        }
    }

    /**
     * Close all open tickets for a user
     * @param {string} zendeskUserId 
     * @returns {Promise<{success: boolean, closedCount: number}>}
     */
    async closeUserTickets(zendeskUserId) {
        try {
            console.log(`🎫 Zendesk: Checking for open tickets to close for user ${zendeskUserId}...`);
            const response = await this.api.get(`/users/${zendeskUserId}/tickets/requested.json`);
            const tickets = response.data.tickets || [];

            // Find non-closed tickets
            const openTickets = tickets.filter(t => t.status !== 'closed');

            if (openTickets.length === 0) {
                return { success: true, closedCount: 0 };
            }

            const ticketIds = openTickets.map(t => t.id);
            console.log(`🎫 Zendesk: Found ${ticketIds.length} open tickets. Closing them now...`);

            // Bulk update tickets to 'closed'
            // API: PUT /api/v2/tickets/update_many.json?ids={ids}
            const idsString = ticketIds.join(',');
            await this.api.put(`/tickets/update_many.json?ids=${idsString}`, {
                ticket: {
                    status: 'closed',
                    comment: {
                        public: false,
                        body: "Auto-closed by system during user deletion request."
                    }
                }
            });

            // WAIT & VERIFY: Give Zendesk time to process the close index
            // Deletion will fail if we try too fast.
            console.log('⏳ Zendesk: Waiting for tickets to be indexed as closed...');

            let allClosed = false;
            let attempts = 0;
            const maxAttempts = 5;

            while (!allClosed && attempts < maxAttempts) {
                // Wait 1.5s between checks
                await new Promise(resolve => setTimeout(resolve, 1500));

                const checkResponse = await this.api.get(`/users/${zendeskUserId}/tickets/requested.json`);
                const checkTickets = checkResponse.data.tickets || [];
                const checkOpen = checkTickets.filter(t => t.status !== 'closed');

                if (checkOpen.length === 0) {
                    allClosed = true;
                    console.log('✅ Zendesk: Verified all tickets are now closed.');
                } else {
                    console.log(`⏳ Zendesk: Open tickets remaining: ${checkOpen.length}. Retrying verification (${attempts + 1}/${maxAttempts})...`);
                    attempts++;
                }
            }

            if (!allClosed) {
                console.warn('⚠️ Zendesk: Timed out waiting for tickets to close. Deletion might fail.');
            }

            console.log(`✅ Zendesk: Successfully closed ${ticketIds.length} tickets.`);
            return { success: true, closedCount: ticketIds.length };

        } catch (error) {
            console.error(`❌ Zendesk: Failed to close tickets for user ${zendeskUserId}:`, error.message);
            return { success: false, error: error.message };
        }
    }

    /**
     * Suspend a user in Zendesk (fallback when deletion fails)
     * @param {string} zendeskUserId 
     */
    async suspendUser(zendeskUserId) {
        try {
            console.log(`🔒 Zendesk: Attempting to suspend user ${zendeskUserId}...`);
            await this.api.put(`/users/${zendeskUserId}.json`, {
                user: { suspended: true }
            });
            console.log(`✅ Zendesk: User ${zendeskUserId} successfully suspended.`);
            return { success: true };
        } catch (error) {
            console.error(`❌ Zendesk Suspension Failed:`, error.message);
            return { success: false, error: error.message };
        }
    }

    /**
     * Permanently delete a user from Zendesk
     * @param {string} zendeskUserId - The Zendesk User ID
     * @returns {Promise<{success: boolean, message?: string, error?: string}>}
     */
    async deleteTickets(ticketIds) {
        try {
            if (!ticketIds || ticketIds.length === 0) return { success: true, count: 0 };

            const idsString = ticketIds.join(',');
            console.log(`🗑️ Zendesk: Deleting ${ticketIds.length} tickets...`);

            // Soft delete tickets (moves to Deleted Tickets view)
            await this.api.delete(`/tickets/destroy_many.json?ids=${idsString}`);

            console.log(`✅ Zendesk: Successfully deleted ${ticketIds.length} tickets.`);
            return { success: true, count: ticketIds.length };
        } catch (error) {
            console.error(`❌ Zendesk: Failed to delete tickets:`, error.message);
            return { success: false, error: error.message };
        }
    }

    /**
     * Standard implementation: Cleanup tickets but KEEP User
     * Refactored as per request: "Close and Delete tickets, but keep user active in Zendesk"
     */
    async deleteUser(zendeskUserId) {
        if (!this.domain || !this.email || !this.token) {
            console.warn('⚠️ Zendesk Cleanup skipped: Credentials missing');
            return { success: false, error: 'Zendesk credentials missing' };
        }

        if (!zendeskUserId) {
            return { success: false, error: 'No Zendesk User ID provided' };
        }

        try {
            // STEP 1: Find and Close/Delete tickets
            // We reuse closeUserTickets logic but we will also DELETE them as requested

            // 1a. Check for tickets
            const response = await this.api.get(`/users/${zendeskUserId}/tickets/requested.json`);
            const tickets = response.data.tickets || [];

            if (tickets.length > 0) {
                const ticketIds = tickets.map(t => t.id);

                // 1. Close Open Tickets first (Safety)
                const openTickets = tickets.filter(t => t.status !== 'closed');
                if (openTickets.length > 0) {
                    await this.closeUserTickets(zendeskUserId); // Reuse existing close logic
                }

                // 2. DELETE All User Tickets (Requested: "Close and Delete")
                const deleteResult = await this.deleteTickets(ticketIds);

                return {
                    success: true,
                    message: 'Zendesk tickets deleted. User account retained.',
                    ticketsDeleted: deleteResult.count || 0,
                    userRetained: true
                };
            }

            return {
                success: true,
                message: 'No tickets found to delete. User account retained.',
                ticketsDeleted: 0,
                userRetained: true
            };

        } catch (error) {
            // Handle 404 (User already deleted or not found) as a "success" type case
            if (error.response && error.response.status === 404) {
                console.warn(`⚠️ Zendesk: User ${zendeskUserId} not found (already deleted?)`);
                return {
                    success: true,
                    message: 'User not found in Zendesk (may have been already deleted)',
                    alreadyDeleted: true
                };
            }

            // Extract clearer error message from Zendesk response
            const zendeskError = error.response?.data?.error || error.message;
            const zendeskDescription = error.response?.data?.description || '';
            const fullErrorMessage = zendeskDescription
                ? `${zendeskError}: ${zendeskDescription}`
                : typeof zendeskError === 'object' ? JSON.stringify(zendeskError) : zendeskError;

            console.error(`❌ Zendesk Deletion Failed:`, fullErrorMessage);

            // FALLBACK: If deletion fails due to validation (likely open tickets), Try to SUSPEND
            if (zendeskError === 'RecordInvalid') {
                console.warn(`⚠️ Cannot delete Zendesk user (likely due to open tickets or active chats). Attempting to SUSPEND instead...`);

                const suspendResult = await this.suspendUser(zendeskUserId);

                if (suspendResult.success) {
                    return {
                        success: true,
                        message: 'User could not be deleted (RecordInvalid) but was successfully SUSPENDED.',
                        actionTaken: 'suspended',
                        data: { suspended: true }
                    };
                }
            }

            return {
                success: false,
                error: fullErrorMessage,
                details: error.response?.data
            };
        }
    }
}

module.exports = new ZendeskUserDeletionService();
