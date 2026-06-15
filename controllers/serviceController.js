const db = require('../config/db');
const whatsappService = require('../utils/whatsappService');
const crypto = require('crypto');

/**
 * Controller for Service Ticket lifecycle
 */
class ServiceController {
  
  /**
   * Create service ticket (Manual admin log or Customer QR Web-Form scan)
   */
  async createTicket(req, res) {
    const { source, customer_name, customer_phone, customer_email, device_details, issue_description } = req.body;

    if (!customer_name || !customer_phone || !device_details || !issue_description) {
      return res.status(400).json({ error: 'Name, phone, device details, and issue description are required' });
    }

    try {
      const ticketSource = source === 'qr_code' ? 'qr_code' : 'manual';
      
      const result = await db.query(
        `INSERT INTO service_tickets (source, customer_name, customer_phone, customer_email, device_details, issue_description, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING *`,
        [
          ticketSource,
          customer_name,
          customer_phone,
          customer_email || null,
          device_details,
          issue_description,
          'pending'
        ]
      );

      return res.status(201).json({
        message: 'Support ticket registered successfully',
        ticket: result.rows[0]
      });
    } catch (err) {
      console.error('Create Ticket Error:', err);
      return res.status(500).json({ error: 'Failed to create support ticket' });
    }
  }

  /**
   * Retrieve list of all tickets (both QR scans and manual inputs merged)
   */
  async getTickets(req, res) {
    try {
      const result = await db.query(
        `SELECT t.*, u.name as engineer_name 
         FROM service_tickets t
         LEFT JOIN users u ON t.assigned_engineer_id = u.id
         ORDER BY t.created_at DESC`
      );
      return res.json({ tickets: result.rows });
    } catch (err) {
      console.error('Get Tickets Error:', err);
      return res.status(500).json({ error: 'Failed to retrieve tickets' });
    }
  }

  /**
   * Dispatch/Assign ticket to field engineer and trigger WhatsApp notification with Smart Link
   */
  async assignTicket(req, res) {
    const { id } = req.params;
    const { assigned_engineer_id, engineer_phone } = req.body;

    if (!assigned_engineer_id) {
      return res.status(400).json({ error: 'Engineer ID is required for assignment' });
    }

    try {
      // 1. Generate unique security token for smart link
      const smartLinkToken = crypto.randomBytes(16).toString('hex');

      // 2. Fetch engineer details
      const engCheck = await db.query('SELECT name, email FROM users WHERE id = $1', [assigned_engineer_id]);
      if (engCheck.rows.length === 0) {
        return res.status(404).json({ error: 'Selected field engineer not found' });
      }

      const engineer = engCheck.rows[0];

      // 3. Update ticket assignment and generate token
      const result = await db.query(
        `UPDATE service_tickets 
         SET assigned_engineer_id = $1, status = 'assigned', smart_link_token = $2, updated_at = CURRENT_TIMESTAMP 
         WHERE id = $3 
         RETURNING *`,
        [assigned_engineer_id, smartLinkToken, id]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Service ticket not found' });
      }

      const updatedTicket = result.rows[0];
      const targetPhone = engineer_phone || '919876543210'; // Fallback/Provided phone

      // 4. Construct Unique Smart Link
      const smartLink = `http://localhost:5173/?engineer_token=${smartLinkToken}`;

      // 5. Send automated WhatsApp API alert
      const messageBody = `Hello ${engineer.name.replace('Employee: ', '')},\nYou have been assigned a new field service ticket at Tech IT World.\n\n` +
                          `Customer: ${updatedTicket.customer_name}\n` +
                          `Device: ${updatedTicket.device_details}\n` +
                          `Issue: ${updatedTicket.issue_description}\n\n` +
                          `Click this unique smart link to update job status, upload signature, and log expenses:\n${smartLink}`;
      
      await whatsappService.sendMessage(targetPhone, messageBody);

      return res.json({
        message: 'Ticket successfully assigned and dispatched via WhatsApp',
        ticket: updatedTicket,
        smart_link: smartLink
      });
    } catch (err) {
      console.error('Assign Ticket Error:', err);
      return res.status(500).json({ error: 'Failed to assign ticket' });
    }
  }

  /**
   * Public endpoint to fetch ticket details for the engineer view (Requires token validation)
   */
  async getTicketByToken(req, res) {
    const { token } = req.params;

    try {
      const result = await db.query(
        `SELECT * FROM service_tickets WHERE smart_link_token = $1`,
        [token]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Invalid or expired job link' });
      }

      return res.json({ ticket: result.rows[0] });
    } catch (err) {
      console.error('Get Ticket by Token Error:', err);
      return res.status(500).json({ error: 'Failed to fetch ticket info' });
    }
  }

  /**
   * Field Engineer Submit Updates. Live-syncs to finance hub on Solved status.
   */
  async submitEngineerUpdate(req, res) {
    const { token } = req.params;
    const { status, customer_signature_url, customer_rating, job_expense, amount_billed, expense_description } = req.body;

    if (!status) {
      return res.status(400).json({ error: 'Status is required' });
    }

    try {
      // 1. Verify token and fetch ticket
      const checkResult = await db.query('SELECT * FROM service_tickets WHERE smart_link_token = $1', [token]);
      if (checkResult.rows.length === 0) {
        return res.status(404).json({ error: 'Invalid or expired job link' });
      }

      const ticket = checkResult.rows[0];

      // 2. Perform updates
      const updatedStatus = status === 'solved' ? 'solved' : 'pending';
      const parsedExpense = parseFloat(job_expense) || 0.00;
      const parsedBilled = parseFloat(amount_billed) || 0.00;
      const rating = parseInt(customer_rating, 10) || null;

      const updateResult = await db.query(
        `UPDATE service_tickets
         SET status = $1, 
             customer_signature_url = $2, 
             customer_rating = $3, 
             job_expense = $4, 
             amount_billed = $5,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $6
         RETURNING *`,
        [updatedStatus, customer_signature_url || null, rating, parsedExpense, parsedBilled, ticket.id]
      );

      const updatedTicket = updateResult.rows[0];

      // 3. Trigger: If Solved, push payment record and ticket-based expenses to Financial Hub
      if (updatedStatus === 'solved') {
        // Log job expense into ticket_expenses
        if (parsedExpense > 0) {
          await db.query(
            `INSERT INTO ticket_expenses (source_module, source_id, description, amount)
             VALUES ($1, $2, $3, $4)`,
            ['service', ticket.id, expense_description || 'Parts/cables replaced in field job', parsedExpense]
          );
        }

        // Log billed collection in payments table
        if (parsedBilled > 0) {
          await db.query(
            `INSERT INTO payments (source_module, source_id, customer_name, amount, status)
             VALUES ($1, $2, $3, $4, $5)`,
            ['service', ticket.id, ticket.customer_name, parsedBilled, 'pending_verification']
          );
        }
      }

      return res.json({
        message: 'Service ticket submitted and live-synced to Admin dashboard',
        ticket: updatedTicket
      });
    } catch (err) {
      console.error('Engineer Update Ticket Error:', err);
      return res.status(500).json({ error: 'Failed to update job profile' });
    }
  }
}

module.exports = new ServiceController();
