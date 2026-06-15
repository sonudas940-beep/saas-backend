const db = require('../config/db');

/**
 * Controller managing Leads, Webhooks, and Followups
 */
class SalesController {
  
  /**
   * Add a manual lead
   */
  async createLead(req, res) {
    const { customer_name, customer_phone, customer_email, requirement, total_amount, assigned_to, custom_fields } = req.body;

    if (!customer_name || !customer_phone) {
      return res.status(400).json({ error: 'Customer name and phone number are required' });
    }

    try {
      const result = await db.query(
        `INSERT INTO leads (source, customer_name, customer_phone, customer_email, requirement, total_amount, assigned_to, custom_fields, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING *`,
        [
          'manual',
          customer_name,
          customer_phone,
          customer_email || null,
          requirement || null,
          total_amount || 0.00,
          assigned_to || null,
          custom_fields || {},
          'lead_entry'
        ]
      );

      return res.status(201).json({
        message: 'Lead created successfully',
        lead: result.rows[0]
      });
    } catch (err) {
      console.error('Create Lead Error:', err);
      return res.status(500).json({ error: 'Failed to create lead' });
    }
  }

  /**
   * Webhook handler to receive leads from JustDial API.
   * Parses customer name, phone, email, and description query parameters or body payloads.
   */
  async justdialWebhook(req, res) {
    console.log('--- JustDial Webhook Triggered ---');
    console.log('Headers:', req.headers);
    console.log('Query:', req.query);
    console.log('Body:', req.body);

    // Extract fields (JustDial typically sends data in query params or application/json body)
    const customer_name = req.body.name || req.query.name || 'JustDial Lead';
    const customer_phone = req.body.phone || req.query.phone;
    const customer_email = req.body.email || req.query.email || null;
    const requirement = req.body.query || req.body.requirement || req.query.query || 'Leads fetched via JustDial Webhook';
    const total_amount = req.body.budget || req.query.budget || 0.00;

    if (!customer_phone) {
      console.warn('JustDial webhook rejected: phone field missing.');
      return res.status(400).json({ error: 'Phone number parameter is required by webhook' });
    }

    try {
      const result = await db.query(
        `INSERT INTO leads (source, customer_name, customer_phone, customer_email, requirement, total_amount, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING *`,
        ['justdial', customer_name, customer_phone, customer_email, requirement, total_amount, 'lead_entry']
      );

      console.log('Lead successfully inserted from JustDial Webhook:', result.rows[0]);

      // Respond back to JustDial API acknowledging receipt
      return res.status(200).json({
        success: true,
        message: 'Lead received and logged in CRM database',
        lead_id: result.rows[0].id
      });
    } catch (err) {
      console.error('JustDial Webhook DB Error:', err);
      return res.status(500).json({ error: 'Failed to process lead from webhook' });
    }
  }

  /**
   * Retrieve list of all leads with optional status/source filtering
   */
  async getLeads(req, res) {
    try {
      const result = await db.query(
        `SELECT l.*, u.name as assigned_name 
         FROM leads l
         LEFT JOIN users u ON l.assigned_to = u.id
         ORDER BY l.created_at DESC`
      );
      return res.json({ leads: result.rows });
    } catch (err) {
      console.error('Get Leads Error:', err);
      return res.status(500).json({ error: 'Failed to retrieve leads list' });
    }
  }

  /**
   * Update lead details, status, or follow-up dates.
   * Special logic triggers automatic payment insertion on 'closed_won'.
   */
  async updateLead(req, res) {
    const { id } = req.params;
    const { status, next_follow_up_date, total_amount, requirement, assigned_to, custom_fields } = req.body;

    try {
      // 1. Fetch current lead status and details
      const leadCheck = await db.query('SELECT * FROM leads WHERE id = $1', [id]);
      if (leadCheck.rows.length === 0) {
        return res.status(404).json({ error: 'Lead profile not found' });
      }

      const currentLead = leadCheck.rows[0];

      // 2. Validate follow_up condition
      if (status === 'follow_up' && !next_follow_up_date) {
        return res.status(400).json({ 
          error: "A mandatory 'Next Follow-up Date' is required when updating lead status to 'Follow-up'." 
        });
      }

      // 3. Perform update query
      let query = 'UPDATE leads SET updated_at = CURRENT_TIMESTAMP';
      const params = [];
      let index = 1;

      if (status) {
        query += `, status = $${index}`;
        params.push(status);
        index++;
      }
      if (next_follow_up_date) {
        query += `, next_follow_up_date = $${index}`;
        params.push(next_follow_up_date);
        index++;
      }
      if (total_amount !== undefined) {
        query += `, total_amount = $${index}`;
        params.push(total_amount);
        index++;
      }
      if (requirement) {
        query += `, requirement = $${index}`;
        params.push(requirement);
        index++;
      }
      if (assigned_to) {
        query += `, assigned_to = $${index}`;
        params.push(assigned_to);
        index++;
      }
      if (custom_fields) {
        query += `, custom_fields = $${index}`;
        params.push(custom_fields);
        index++;
      }

      query += ` WHERE id = $${index} RETURNING *`;
      params.push(id);

      const result = await db.query(query, params);
      const updatedLead = result.rows[0];

      // 4. Trigger logic: If transitioning to 'closed_won' and wasn't closed_won previously
      if (status === 'closed_won' && currentLead.status !== 'closed_won') {
        const checkPayment = await db.query(
          `SELECT id FROM payments WHERE source_module = 'sales' AND source_id = $1`,
          [id]
        );

        if (checkPayment.rows.length === 0) {
          console.log(`Lead ${id} closed won. Triggering auto-payment in Central Hub: ₹${updatedLead.total_amount}`);
          await db.query(
            `INSERT INTO payments (source_module, source_id, customer_name, amount, status)
             VALUES ($1, $2, $3, $4, $5)`,
            [
              'sales',
              updatedLead.id,
              updatedLead.customer_name,
              updatedLead.total_amount,
              'pending_verification' // Hits Central Hub as pending cashier review
            ]
          );
        }
      }

      return res.json({
        message: 'Lead updated successfully',
        lead: updatedLead
      });
    } catch (err) {
      console.error('Update Lead Error:', err);
      return res.status(500).json({ error: 'Failed to update lead data' });
    }
  }

  /**
   * Log a new followup description note
   */
  async logFollowup(req, res) {
    const { lead_id, notes, followup_date } = req.body;

    if (!lead_id || !notes || !followup_date) {
      return res.status(400).json({ error: 'Lead ID, followup notes, and date are required' });
    }

    try {
      // Record the followup note
      const followupResult = await db.query(
        `INSERT INTO lead_followups (lead_id, notes, followup_date, created_by)
         VALUES ($1, $2, $3, $4)
         RETURNING *`,
        [lead_id, notes, followup_date, req.user.id]
      );

      // Automatically update lead's next followup date and change status to 'follow_up'
      await db.query(
        `UPDATE leads 
         SET next_follow_up_date = $1, status = 'follow_up', updated_at = CURRENT_TIMESTAMP 
         WHERE id = $2`,
        [followup_date, lead_id]
      );

      return res.status(201).json({
        message: 'Followup logged successfully. Lead state updated to Follow-up.',
        followup: followupResult.rows[0]
      });
    } catch (err) {
      console.error('Log Followup Error:', err);
      return res.status(500).json({ error: 'Failed to save followup log' });
    }
  }

  /**
   * Fetch log of all followups for a specific lead
   */
  async getFollowups(req, res) {
    const { leadId } = req.params;

    try {
      const result = await db.query(
        `SELECT f.*, u.name as creator_name 
         FROM lead_followups f
         LEFT JOIN users u ON f.created_by = u.id
         WHERE f.lead_id = $1
         ORDER BY f.created_at DESC`,
        [leadId]
      );
      return res.json({ followups: result.rows });
    } catch (err) {
      console.error('Get Followups Error:', err);
      return res.status(500).json({ error: 'Failed to fetch followups ledger' });
    }
  }
}

module.exports = new SalesController();
