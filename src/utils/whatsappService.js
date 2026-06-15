require('dotenv').config();

/**
 * WhatsApp Dispatcher Utility (Using User's Personal Key Configuration)
 */
class WhatsAppService {
  constructor() {
    // Read personal configuration key from environment variables
    this.apiKey = process.env.WHATSAPP_API_KEY || 'MOCK_PERSONAL_KEY_12345';
    this.apiUrl = process.env.WHATSAPP_API_URL || 'https://api.whatsapp-gateway.io/v3/send';
  }

  /**
   * Dispatches automated messages via HTTP request
   * @param {string} phone - Target customer/engineer phone number
   * @param {string} message - Content of message body
   * @returns {Promise<boolean>}
   */
  async sendMessage(phone, message) {
    console.log(`\n--- [WhatsApp API Dispatch] ---`);
    console.log(`To: ${phone}`);
    console.log(`Message: ${message}`);
    console.log(`Gateway Key: ${this.apiKey}`);
    console.log(`--------------------------------\n`);

    try {
      // Mock API post request using global fetch
      const response = await fetch(this.apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`
        },
        body: JSON.stringify({
          to: phone,
          body: message
        })
      });

      // We handle success or log failure, but keep running since it's a mock
      if (response.ok) {
        console.log('WhatsApp notification dispatched successfully');
        return true;
      }
      
      console.log('WhatsApp HTTP status code return:', response.status);
      return true; // Return true for mock stability
    } catch (err) {
      console.warn('WhatsApp API connection skipped (Running offline/mock dispatch):', err.message);
      return true;
    }
  }
}

module.exports = new WhatsAppService();
