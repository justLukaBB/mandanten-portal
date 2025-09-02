const axios = require('axios');

class ZendeskService {
  constructor() {
    // Support both old and new environment variable names
    this.domain = process.env.ZENDESK_DOMAIN || process.env.ZENDESK_SUBDOMAIN; // e.g., 'yourcompany.zendesk.com'
    this.email = process.env.ZENDESK_API_EMAIL || process.env.ZENDESK_EMAIL; // e.g., 'agent@yourcompany.com'
    this.token = process.env.ZENDESK_API_TOKEN || process.env.ZENDESK_TOKEN; // Your API token
    
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

  // Send Side Conversation (email to external party) - IMPROVED
  async sendSideConversation(ticketId, { recipient_email, subject, message }) {
    try {
      console.log(`📧 Sending Side Conversation from ticket ${ticketId} to ${recipient_email}...`);
      
      // Validate ticket exists first
      const ticketCheck = await this.getTicket(ticketId);
      if (!ticketCheck.success) {
        console.error(`❌ Cannot send side conversation - ticket ${ticketId} not found`);
        return {
          success: false,
          error: `Ticket ${ticketId} not found`,
          status: 404
        };
      }
      
      // Create a side conversation with improved structure
      const sideConversationData = {
        message: {
          to: [{
            email: recipient_email,
            name: recipient_email.split('@')[0]
          }],
          subject: subject,
          body: message,
          html_body: message.replace(/\n/g, '<br>').replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        }
      };

      console.log(`📤 Side conversation payload:`, JSON.stringify(sideConversationData, null, 2));

      const response = await this.api.post(`/tickets/${ticketId}/side_conversations.json`, sideConversationData);
      
      console.log('✅ Side Conversation sent successfully:', {
        ticket_id: ticketId,
        recipient: recipient_email,
        subject: subject,
        side_conversation_id: response.data.side_conversation?.id
      });

      // Add internal comment about success (don't await to avoid blocking)
      this.addInternalComment(ticketId, {
        content: `📧 **SIDE CONVERSATION SENT**\n\nRecipient: ${recipient_email}\nSubject: ${subject}\nSide Conversation ID: ${response.data.side_conversation?.id}\n\n✅ Email sent successfully`,
        status: 'pending'
      }).catch(err => console.log('Warning: Could not add success comment:', err.message));

      return {
        success: true,
        side_conversation_id: response.data.side_conversation?.id,
        ticket_id: ticketId
      };

    } catch (error) {
      console.error('❌ Failed to send Side Conversation:', {
        status: error.response?.status,
        statusText: error.response?.statusText,
        data: error.response?.data,
        message: error.message,
        ticketId: ticketId,
        recipientEmail: recipient_email,
        url: error.config?.url,
        method: error.config?.method
      });
      
      // Add internal comment about failure (don't await to avoid blocking)
      this.addInternalComment(ticketId, {
        content: `❌ **SIDE CONVERSATION FAILED**\n\nRecipient: ${recipient_email}\nSubject: ${subject}\nError: ${error.response?.status} ${error.response?.statusText}\nDetails: ${JSON.stringify(error.response?.data)}\n\n**MANUAL ACTION REQUIRED:** Send email to client manually`,
        status: 'open'
      }).catch(err => console.log('Warning: Could not add error comment:', err.message));
      
      return {
        success: false,
        error: error.response?.data?.error || error.response?.data || error.message,
        status: error.response?.status,
        details: error.response?.data
      };
    }
  }

  // Create side conversation to send email to customer - IMPROVED
  async createSideConversation(ticketId, { recipientEmail, recipientName, subject, body, internalNote = true }) {
    try {
      console.log(`📧 Creating Side Conversation on ticket ${ticketId} to send email to ${recipientEmail}...`);
      
      // Validate ticket exists first  
      const ticketCheck = await this.getTicket(ticketId);
      if (!ticketCheck.success) {
        console.error(`❌ Cannot create side conversation - ticket ${ticketId} not found`);
        return {
          success: false,
          error: `Ticket ${ticketId} not found`,
          status: 404,
          email_sent: false
        };
      }

      // Check if side conversations are enabled for this Zendesk instance
      try {
        // First check if we can access side conversations endpoint
        await this.api.get(`/tickets/${ticketId}/side_conversations.json`);
      } catch (checkError) {
        if (checkError.response?.status === 403) {
          console.error(`❌ Side Conversations not enabled or insufficient permissions`);
          return {
            success: false,
            error: 'Side Conversations feature not enabled or insufficient permissions',
            status: 403,
            email_sent: false,
            suggestion: 'Enable Side Conversations in Zendesk admin or use public comments instead'
          };
        }
      }
      
      const sideConversationData = {
        message: {
          to: [
            {
              email: recipientEmail,
              name: recipientName
            }
          ],
          subject: subject,
          body: body,
          html_body: body.replace(/\n/g, '<br>').replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        }
      };

      console.log(`📤 Creating side conversation with data:`, {
        ticketId,
        recipientEmail,
        recipientName,
        subject: subject.substring(0, 50) + '...'
      });

      const response = await this.api.post(`/tickets/${ticketId}/side_conversations.json`, sideConversationData);
      
      console.log(`✅ Side Conversation created successfully!`);
      console.log(`📨 Side Conversation ID: ${response.data.side_conversation?.id}`);
      console.log(`📧 Email sent to: ${recipientEmail}`);
      
      // Add internal note to main ticket about the side conversation if requested
      if (internalNote) {
        try {
          await this.addInternalComment(
            ticketId, 
            {
              content: `📧 **CLIENT EMAIL SENT**\n\nRecipient: ${recipientEmail} (${recipientName})\nSubject: ${subject}\nSide Conversation ID: ${response.data.side_conversation?.id}\n\n✅ E-Mail successfully sent via Side Conversation`,
              tags: ['client-email-sent', 'side-conversation']
            }
          );
        } catch (commentError) {
          console.log('Warning: Could not add internal note:', commentError.message);
        }
      }
      
      return {
        success: true,
        ticket_id: ticketId,
        side_conversation_id: response.data.side_conversation?.id,
        recipient_email: recipientEmail,
        recipient_name: recipientName,
        subject: subject,
        email_sent: true
      };

    } catch (error) {
      console.error(`❌ Error creating Side Conversation for ticket ${ticketId}:`, {
        status: error.response?.status,
        statusText: error.response?.statusText,
        data: error.response?.data,
        message: error.message,
        url: error.config?.url
      });
      
      let errorMessage = error.message;
      let suggestion = null;
      
      if (error.response?.status === 403) {
        errorMessage = 'Forbidden - Side Conversations feature may not be enabled or insufficient API permissions';
        suggestion = 'Check Zendesk admin settings for Side Conversations feature and API token permissions';
      } else if (error.response?.status === 404) {
        errorMessage = 'Ticket not found or Side Conversations endpoint not available';
      } else if (error.response?.status === 422) {
        errorMessage = 'Invalid data - check email format and required fields';
      }
      
      // Add internal comment about failure if possible
      if (ticketId) {
        try {
          await this.addInternalComment(ticketId, {
            content: `❌ **SIDE CONVERSATION FAILED**\n\nRecipient: ${recipientEmail} (${recipientName})\nSubject: ${subject}\nError: ${error.response?.status} ${error.response?.statusText}\nDetails: ${JSON.stringify(error.response?.data)}\n\n**MANUAL ACTION REQUIRED:** Send email to client manually at ${recipientEmail}`,
            tags: ['side-conversation-failed'],
            status: 'open'
          });
        } catch (commentError) {
          console.log('Warning: Could not add error comment:', commentError.message);
        }
      }
      
      return {
        success: false,
        error: errorMessage,
        status: error.response?.status,
        details: error.response?.data,
        suggestion: suggestion,
        email_sent: false
      };
    }
  }

  // Add public comment to ticket (visible to customer)
  async addPublicComment(ticketId, { content, status = null, tags = [] }) {
    try {
      console.log('💬 Adding public comment to Zendesk ticket:', ticketId);

      const updateData = {
        ticket: {
          comment: {
            body: content,
            public: true // Public comment visible to customer
          }
        }
      };

      // Add optional status and tags
      if (status) updateData.ticket.status = status;
      if (tags.length > 0) updateData.ticket.tags = tags;

      const response = await this.api.put(`/tickets/${ticketId}.json`, updateData);
      
      console.log('✅ Public comment added to ticket:', ticketId);

      return {
        success: true,
        ticket_id: response.data.ticket.id,
        comment_added: true,
        ticket: response.data.ticket
      };

    } catch (error) {
      console.error('❌ Failed to add public comment:', error.response?.data || error.message);
      
      return {
        success: false,
        error: error.response?.data?.error || error.message
      };
    }
  }

  // Fallback method: Send email as public comment when side conversations fail
  async sendEmailAsPublicComment(ticketId, { recipient_email, subject, message }) {
    try {
      console.log(`📧 Fallback: Sending email as public comment on ticket ${ticketId}...`);
      
      const publicCommentContent = `📧 **Email to ${recipient_email}**\n\n**Subject:** ${subject}\n\n**Message:**\n${message}\n\n---\n*This message was sent as a public comment because Side Conversations are not available. The client should receive this via email notification.*`;
      
      const result = await this.addPublicComment(ticketId, {
        content: publicCommentContent,
        status: 'pending'
      });
      
      if (result.success) {
        console.log(`✅ Email sent as public comment on ticket ${ticketId}`);
        return {
          success: true,
          method: 'public_comment',
          ticket_id: ticketId,
          recipient_email: recipient_email
        };
      } else {
        return {
          success: false,
          error: result.error,
          method: 'public_comment'
        };
      }
      
    } catch (error) {
      console.error('❌ Fallback public comment also failed:', error.message);
      return {
        success: false,
        error: error.message,
        method: 'public_comment'
      };
    }
  }

  // Helper method to send client notification with automatic fallbacks
  async sendClientNotification(ticketId, { recipient_email, recipient_name, subject, message }) {
    console.log(`📧 Attempting to send client notification to ${recipient_email}...`);
    
    // Method 1: Try Side Conversation (createSideConversation)
    let result = await this.createSideConversation(ticketId, {
      recipientEmail: recipient_email,
      recipientName: recipient_name,
      subject: subject,
      body: message,
      internalNote: false
    });
    
    if (result.success) {
      console.log(`✅ Client notification sent via createSideConversation`);
      return { ...result, method: 'createSideConversation' };
    }
    
    console.log(`⚠️ createSideConversation failed, trying sendSideConversation...`);
    
    // Method 2: Try original Side Conversation (sendSideConversation) 
    result = await this.sendSideConversation(ticketId, {
      recipient_email: recipient_email,
      subject: subject,
      message: message
    });
    
    if (result.success) {
      console.log(`✅ Client notification sent via sendSideConversation`);
      return { ...result, method: 'sendSideConversation' };
    }
    
    console.log(`⚠️ sendSideConversation failed, trying public comment fallback...`);
    
    // Method 3: Fallback to public comment
    result = await this.sendEmailAsPublicComment(ticketId, {
      recipient_email: recipient_email,
      subject: subject,
      message: message
    });
    
    if (result.success) {
      console.log(`✅ Client notification sent via public comment fallback`);
      return { ...result, method: 'public_comment_fallback' };
    }
    
    console.log(`❌ All notification methods failed`);
    return {
      success: false,
      error: 'All notification methods failed',
      methods_tried: ['createSideConversation', 'sendSideConversation', 'public_comment_fallback'],
      last_error: result.error
    };
  }
}

module.exports = ZendeskService;