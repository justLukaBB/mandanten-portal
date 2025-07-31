const axios = require('axios');

class ZendeskService {
  constructor() {
    this.domain = process.env.ZENDESK_DOMAIN; // e.g., 'yourcompany.zendesk.com'
    this.email = process.env.ZENDESK_API_EMAIL; // e.g., 'agent@yourcompany.com'
    this.token = process.env.ZENDESK_API_TOKEN; // Your API token
    
    this.baseURL = `https://${this.domain}/api/v2`;
    
    // Create axios instance with auth
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

  // Create a new ticket in Zendesk
  async createTicket({ subject, content, requesterEmail, tags = [], priority = 'normal', type = 'task' }) {
    try {
      console.log('🎫 Creating Zendesk ticket:', { subject, requesterEmail, tags });

      const ticketData = {
        ticket: {
          subject: subject,
          comment: {
            body: content,
            public: false // Internal note
          },
          requester: {
            email: requesterEmail
          },
          tags: tags,
          priority: priority,
          type: type,
          status: 'open'
        }
      };

      const response = await this.api.post('/tickets.json', ticketData);
      
      console.log('✅ Zendesk ticket created:', {
        ticket_id: response.data.ticket.id,
        subject: response.data.ticket.subject,
        status: response.data.ticket.status
      });

      return {
        success: true,
        ticket_id: response.data.ticket.id,
        ticket_url: response.data.ticket.url,
        ticket: response.data.ticket
      };

    } catch (error) {
      console.error('❌ Failed to create Zendesk ticket:', error.response?.data || error.message);
      
      return {
        success: false,
        error: error.response?.data?.error || error.message,
        details: error.response?.data?.details || null
      };
    }
  }

  // Update an existing ticket
  async updateTicket(ticketId, { subject, content, tags = [], status = 'open' }) {
    try {
      console.log('🔄 Updating Zendesk ticket:', ticketId);

      const updateData = {
        ticket: {
          comment: {
            body: content,
            public: false
          }
        }
      };

      // Add optional fields if provided
      if (subject) updateData.ticket.subject = subject;
      if (tags.length > 0) updateData.ticket.tags = tags;
      if (status) updateData.ticket.status = status;

      const response = await this.api.put(`/tickets/${ticketId}.json`, updateData);
      
      console.log('✅ Zendesk ticket updated:', ticketId);

      return {
        success: true,
        ticket_id: response.data.ticket.id,
        ticket: response.data.ticket
      };

    } catch (error) {
      console.error('❌ Failed to update Zendesk ticket:', error.response?.data || error.message);
      
      return {
        success: false,
        error: error.response?.data?.error || error.message
      };
    }
  }

  // Get ticket information
  async getTicket(ticketId) {
    try {
      const response = await this.api.get(`/tickets/${ticketId}.json`);
      return {
        success: true,
        ticket: response.data.ticket
      };
    } catch (error) {
      console.error('❌ Failed to get Zendesk ticket:', error.response?.data || error.message);
      return {
        success: false,
        error: error.response?.data?.error || error.message
      };
    }
  }

  // Add internal comment to existing ticket
  async addInternalComment(ticketId, { content, status = null, tags = [] }) {
    try {
      console.log('💬 Adding internal comment to Zendesk ticket:', ticketId);

      const updateData = {
        ticket: {
          comment: {
            body: content,
            public: false // Internal comment only
          }
        }
      };

      // Add optional status and tags
      if (status) updateData.ticket.status = status;
      if (tags.length > 0) updateData.ticket.tags = tags;

      const response = await this.api.put(`/tickets/${ticketId}.json`, updateData);
      
      console.log('✅ Internal comment added to ticket:', ticketId);

      return {
        success: true,
        ticket_id: response.data.ticket.id,
        comment_added: true,
        ticket: response.data.ticket
      };

    } catch (error) {
      console.error('❌ Failed to add internal comment:', error.response?.data || error.message);
      
      return {
        success: false,
        error: error.response?.data?.error || error.message
      };
    }
  }

  // Check if service is configured
  isConfigured() {
    return !!(this.domain && this.email && this.token);
  }

  // Get configuration status
  getConfigStatus() {
    return {
      configured: this.isConfigured(),
      domain: this.domain ? `✅ ${this.domain}` : '❌ Missing ZENDESK_DOMAIN',
      email: this.email ? `✅ ${this.email}` : '❌ Missing ZENDESK_API_EMAIL',
      token: this.token ? '✅ Set' : '❌ Missing ZENDESK_API_TOKEN'
    };
  }
}

module.exports = ZendeskService;