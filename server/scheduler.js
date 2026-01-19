const DelayedProcessingService = require('./services/delayedProcessingService');

class Scheduler {
    constructor(dependencies) {
        this.documentReminderService = dependencies.documentReminderService;
        this.loginReminderService = dependencies.loginReminderService;
    }

    startScheduledTasks() {
        // Run document reminder check every hour
        const REMINDER_CHECK_INTERVAL = 60 * 60 * 1000; // 1 hour in milliseconds

        setInterval(async () => {
            try {
                console.log('\n⏰ Running scheduled document reminder check...');
                const result = await this.documentReminderService.checkAndSendReminders();
                console.log(`✅ Document reminder check complete: ${result.remindersSent} reminders sent\n`);
            } catch (error) {
                console.error('❌ Error in scheduled document reminder check:', error);
            }
        }, REMINDER_CHECK_INTERVAL);

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

        // Run initial checks after 1 minute
        setTimeout(async () => {
            try {
                console.log('\n⏰ Running initial document reminder check...');
                const result = await this.documentReminderService.checkAndSendReminders();
                console.log(`✅ Initial document reminder check complete: ${result.remindersSent} reminders sent\n`);
            } catch (error) {
                console.error('❌ Error in initial document reminder check:', error);
            }
        }, 60000); // 1 minute

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

        console.log('📅 Scheduled tasks started:');
        console.log('  • Document reminders: every hour');
        console.log('  • Delayed processing webhooks: every 30 minutes');
        console.log('  • Login reminders: every 6 hours (7-day cycle)');
        console.log('  • 7-day reviews: every hour');
        console.log('  • Auto-confirmation: every 7 hours (7-day threshold)');
    }
}

module.exports = Scheduler;
