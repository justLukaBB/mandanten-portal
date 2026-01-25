require('dotenv').config();
const ZendeskService = require('./server/services/zendeskService');

const zendeskService = new ZendeskService();

console.log('🔧 Zendesk Configuration Test:');
console.log('================================');

const status = zendeskService.getConfigStatus();
console.log('✅ Configured:', status.configured);
console.log('🌐 Domain:', status.domain);
console.log('📧 Email:', status.email);
console.log('🔑 Token:', status.token);

console.log('\n📋 Environment Variables:');
console.log('ZENDESK_DOMAIN:', process.env.ZENDESK_DOMAIN || 'NOT SET');
console.log('ZENDESK_SUBDOMAIN:', process.env.ZENDESK_SUBDOMAIN || 'NOT SET');
console.log('ZENDESK_API_EMAIL:', process.env.ZENDESK_API_EMAIL || 'NOT SET');
console.log('ZENDESK_EMAIL:', process.env.ZENDESK_EMAIL || 'NOT SET');
console.log('ZENDESK_API_TOKEN:', process.env.ZENDESK_API_TOKEN ? 'SET' : 'NOT SET');
console.log('ZENDESK_TOKEN:', process.env.ZENDESK_TOKEN ? 'SET' : 'NOT SET');

if (status.configured) {
  console.log('\n✅ Zendesk ist korrekt konfiguriert - Tickets werden erstellt!');
} else {
  console.log('\n❌ Zendesk ist NICHT konfiguriert - Tickets werden NICHT erstellt!');
  console.log('💡 Bitte füllen Sie die .env Datei mit Ihren echten Zendesk-Werten aus.');
}