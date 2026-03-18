const DelayedProcessingService = require('./services/delayedProcessingService');
const UploadWindowService = require('./services/uploadWindowService');

class Scheduler {
    constructor(dependencies) {
        this.documentReminderService = dependencies.documentReminderService;
        this.loginReminderService = dependencies.loginReminderService;
        this.secondLetterTriggerService = dependencies.secondLetterTriggerService;
        this.uploadWindowService = new UploadWindowService();
    }

    startScheduledTasks() {
        // DISABLED: Document reminder emails deactivated (2026-03-03)
        // const REMINDER_CHECK_INTERVAL = 60 * 60 * 1000;
        // setInterval(async () => {
        //     try {
        //         console.log('\n⏰ Running scheduled document reminder check...');
        //         const result = await this.documentReminderService.checkAndSendReminders();
        //         console.log(`✅ Document reminder check complete: ${result.remindersSent} reminders sent\n`);
        //     } catch (error) {
        //         console.error('❌ Error in scheduled document reminder check:', error);
        //     }
        // }, REMINDER_CHECK_INTERVAL);

        // Run delayed processing webhook check every 30 minutes
        const DELAYED_WEBHOOK_CHECK_INTERVAL = 30 * 60 * 1000; // 30 minutes in milliseconds

        setInterval(async () => {
            try {
                console.log('\n⏰ Running scheduled delayed webhook check...');
                const delayedService = new DelayedProcessingService();
                const result = await delayedService.checkAndTriggerPendingWebhooks();
                console.log(`✅ Delayed webhook check complete: ${result.webhooksTriggered} webhooks triggered\n`);
            } catch (error) {
                console.error('❌ Error in scheduled delayed webhook check:', error);
            }
        }, DELAYED_WEBHOOK_CHECK_INTERVAL);

        // Run login reminder check every 6 hours (for 7-day cycle checks)
        const LOGIN_REMINDER_CHECK_INTERVAL = 6 * 60 * 60 * 1000; // 6 hours in milliseconds

        setInterval(async () => {
            try {
                console.log('\n⏰ Running scheduled login reminder check...');
                const result = await this.loginReminderService.checkAndSendLoginReminders();
                console.log(`✅ Login reminder check complete: Login reminders: ${result.loginRemindersSent}, Doc reminders: ${result.documentRemindersSent}\n`);
            } catch (error) {
                console.error('❌ Error in scheduled login reminder check:', error);
            }
        }, LOGIN_REMINDER_CHECK_INTERVAL);

        // Run 7-day review check every hour
        const SEVEN_DAY_REVIEW_CHECK_INTERVAL = 60 * 60 * 1000; // 1 hour in milliseconds

        setInterval(async () => {
            try {
                console.log('\n⏰ Running scheduled 3-minute review check (TEST MODE)...');
                const delayedService = new DelayedProcessingService();
                const result = await delayedService.checkAndTriggerSevenDayReviews();
                console.log(`✅ 3-minute review check complete: ${result.reviewsTriggered} reviews triggered\n`);
            } catch (error) {
                console.error('❌ Error in scheduled 3-minute review check:', error);
            }
        }, SEVEN_DAY_REVIEW_CHECK_INTERVAL);

        // Run auto-confirmation check every 7 hours (PRODUCTION MODE)
        const AUTO_CONFIRMATION_CHECK_INTERVAL = 7 * 60 * 60 * 1000; // 7 hours in milliseconds (25200000 ms)

        setInterval(async () => {
            try {
                console.log('\n⏰ Running scheduled auto-confirmation check...');
                const delayedService = new DelayedProcessingService();
                const result = await delayedService.checkAndAutoConfirmCreditors();
                console.log(`✅ Auto-confirmation check complete: ${result.autoConfirmed} creditors auto-confirmed\n`);
            } catch (error) {
                console.error('❌ Error in scheduled auto-confirmation check:', error);
            }
        }, AUTO_CONFIRMATION_CHECK_INTERVAL);

        // DISABLED: Initial document reminder check deactivated (2026-03-03)
        // setTimeout(async () => {
        //     try {
        //         console.log('\n⏰ Running initial document reminder check...');
        //         const result = await this.documentReminderService.checkAndSendReminders();
        //         console.log(`✅ Initial document reminder check complete: ${result.remindersSent} reminders sent\n`);
        //     } catch (error) {
        //         console.error('❌ Error in initial document reminder check:', error);
        //     }
        // }, 60000);

        // Run initial delayed webhook check after 2 minutes
        setTimeout(async () => {
            try {
                console.log('\n⏰ Running initial delayed webhook check...');
                const delayedService = new DelayedProcessingService();
                const result = await delayedService.checkAndTriggerPendingWebhooks();
                console.log(`✅ Initial delayed webhook check complete: ${result.webhooksTriggered} webhooks triggered\n`);
            } catch (error) {
                console.error('❌ Error in initial delayed webhook check:', error);
            }
        }, 120000); // 2 minutes

        // Run initial login reminder check after 3 minutes
        setTimeout(async () => {
            try {
                console.log('\n⏰ Running initial login reminder check...');
                const result = await this.loginReminderService.checkAndSendLoginReminders();
                console.log(`✅ Initial login reminder check complete: Login reminders: ${result.loginRemindersSent}, Doc reminders: ${result.documentRemindersSent}\n`);
            } catch (error) {
                console.error('❌ Error in initial login reminder check:', error);
            }
        }, 180000); // 3 minutes

        // Run initial auto-confirmation check after 5 minutes (PRODUCTION MODE)
        setTimeout(async () => {
            try {
                console.log('\n⏰ Running initial auto-confirmation check (PRODUCTION MODE)...');
                const delayedService = new DelayedProcessingService();
                const result = await delayedService.checkAndAutoConfirmCreditors();
                console.log(`✅ Initial auto-confirmation check complete: ${result.autoConfirmed} creditors auto-confirmed\n`);
            } catch (error) {
                console.error('❌ Error in initial auto-confirmation check:', error);
            }
        }, 300000); // 5 minutes (PRODUCTION MODE)

        // === 2. Anschreiben Daily Eligibility Check ===
        const SECOND_LETTER_CHECK_INTERVAL = 24 * 60 * 60 * 1000; // 24 hours

        if (this.secondLetterTriggerService) {
            // Initial check after 10 minutes (soft start, consistent with other initial checks)
            setTimeout(async () => {
                try {
                    console.log('\n⏰ Running initial 2. Anschreiben eligibility check...');
                    const result = await this.secondLetterTriggerService.checkAndTriggerEligible();
                    console.log(`✅ Initial 2. Anschreiben check: ${result.triggered} triggered, ${result.skipped} skipped, ${result.errors} errors`);
                } catch (error) {
                    console.error('❌ Error in initial 2. Anschreiben check:', error);
                }
            }, 10 * 60 * 1000);

            // Recurring check every 24 hours
            setInterval(async () => {
                try {
                    console.log('\n⏰ Running scheduled 2. Anschreiben eligibility check...');
                    const result = await this.secondLetterTriggerService.checkAndTriggerEligible();
                    console.log(`✅ 2. Anschreiben check: ${result.triggered} triggered, ${result.skipped} skipped, ${result.errors} errors`);
                } catch (error) {
                    console.error('❌ Error in scheduled 2. Anschreiben check:', error);
                }
            }, SECOND_LETTER_CHECK_INTERVAL);

            console.log('📅 2. Anschreiben scheduler: initial check in 10 minutes, then every 24 hours');
        }

        // === Upload Window Promotion Check (daily) ===
        const UPLOAD_WINDOW_CHECK_INTERVAL = 24 * 60 * 60 * 1000; // 24 hours

        // Initial check after 8 minutes
        setTimeout(async () => {
            try {
                console.log('\n⏰ Running initial upload window promotion check...');
                const result = await this.uploadWindowService.checkAndPromoteEligible();
                console.log(`✅ Initial upload window check: ${result.promoted} promoted, ${result.errors} errors`);
            } catch (error) {
                console.error('❌ Error in initial upload window check:', error);
            }
        }, 8 * 60 * 1000);

        // Recurring check every 24 hours
        setInterval(async () => {
            try {
                console.log('\n⏰ Running scheduled upload window promotion check...');
                const result = await this.uploadWindowService.checkAndPromoteEligible();
                console.log(`✅ Upload window check: ${result.promoted} promoted, ${result.errors} errors`);
            } catch (error) {
                console.error('❌ Error in scheduled upload window check:', error);
            }
        }, UPLOAD_WINDOW_CHECK_INTERVAL);

        console.log('📅 Scheduled tasks started:');
        console.log('  • Document reminders: DISABLED');
        console.log('  • Delayed processing webhooks: every 30 minutes');
        console.log('  • Login reminders: every 6 hours (7-day cycle)');
        console.log('  • 7-day reviews: every hour');
        console.log('  • Auto-confirmation: every 7 hours (7-day threshold)');
        console.log('  • Upload window promotion: every 24 hours');
    }
}

module.exports = Scheduler;
