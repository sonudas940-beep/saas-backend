const db = require('../config/db');
const whatsappService = require('../utils/whatsappService');

/**
 * Controller for Repair & RMA Brand Tracking
 */
class RmaController {
  
  /**
   * Log product intake (Received state)
   */
  async createRma(req, res) {
    const { customer_name, customer_phone, customer_email, product_name, brand, serial_number, issue_description, warranty_status } = req.body;

    if (!customer_name || !customer_phone || !product_name || !brand || !serial_number || !warranty_status) {
      return res.status(400).json({ error: 'Customer name, phone, product name, brand, serial, and warranty status are required' });
    }

    try {
      const result = await db.query(
        `INSERT INTO rma_tickets (customer_name, customer_phone, customer_email, product_name, brand, serial_number, issue_description, warranty_status, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING *`,
        [
          customer_name,
          customer_phone,
          customer_email || null,
          product_name,
          brand,
          serial_number,
          issue_description || 'General inspection required',
          warranty_status,
          'received' // Default status
        ]
      );

      const ticket = result.rows[0];

      // Auto-trigger WhatsApp notification to customer on Received
      const customerMsg = `Dear ${ticket.customer_name},\nWe have successfully received your ${ticket.brand} ${ticket.product_name} (Serial: ${ticket.serial_number}) for repair.\n` +
                          `Ticket ID: #RMA-${ticket.id.slice(0, 6).toUpperCase()}.\nWe will update you at every progress step.\n- Tech IT World`;
      
      await whatsappService.sendMessage(ticket.customer_phone, customerMsg);

      return res.status(201).json({
        message: 'RMA Intake ticket created and customer notified via WhatsApp',
        ticket
      });
    } catch (err) {
      console.error('Create RMA Error:', err);
      return res.status(500).json({ error: 'Failed to create RMA record' });
    }
  }

  /**
   * Retrieve all RMA entries
   */
  async getRmas(req, res) {
    try {
      const result = await db.query('SELECT * FROM rma_tickets ORDER BY created_at DESC');
      return res.json({ rmas: result.rows });
    } catch (err) {
      console.error('Get RMAs Error:', err);
      return res.status(500).json({ error: 'Failed to fetch RMA register' });
    }
  }

  /**
   * Transition RMA states. Formulates WhatsApp notifications and logs outcomes in Finance Hub.
   */
  async updateRmaStatus(req, res) {
    const { id } = req.params;
    const { status, estimate_amount, brand_charge, challan_pdf_url } = req.body;

    try {
      // 1. Fetch current record
      const rmaCheck = await db.query('SELECT * FROM rma_tickets WHERE id = $1', [id]);
      if (rmaCheck.rows.length === 0) {
        return res.status(404).json({ error: 'RMA ticket not found' });
      }

      const rma = rmaCheck.rows[0];

      // 2. Out-of-Warranty logic checks
      if (rma.warranty_status === 'out_of_warranty' && status === 'waiting_for_approval' && !estimate_amount) {
        return res.status(400).json({ 
          error: "An Estimate amount is required for Out-of-Warranty repairs before setting state to 'Waiting for Approval'." 
        });
      }

      // 3. Build dynamic update query
      let query = 'UPDATE rma_tickets SET updated_at = CURRENT_TIMESTAMP';
      const params = [];
      let index = 1;

      if (status) {
        query += `, status = $${index}`;
        params.push(status);
        index++;
      }
      if (estimate_amount !== undefined) {
        query += `, estimate_amount = $${index}`;
        params.push(estimate_amount);
        index++;
      }
      if (brand_charge !== undefined) {
        query += `, brand_charge = $${index}`;
        params.push(brand_charge);
        index++;
      }
      if (challan_pdf_url) {
        query += `, challan_pdf_url = $${index}`;
        params.push(challan_pdf_url);
        index++;
      }

      query += ` WHERE id = $${index} RETURNING *`;
      params.push(id);

      const result = await db.query(query, params);
      const updatedRma = result.rows[0];

      // 4. Formulate status-specific customer WhatsApp alerts
      let customerAlertMsg = '';
      const rmaIdShort = updatedRma.id.slice(0, 6).toUpperCase();

      switch (status) {
        case 'sent_to_brand_center':
          customerAlertMsg = `Dear ${updatedRma.customer_name},\nYour device under Ticket #RMA-${rmaIdShort} has been dispatched to the brand repair center for advanced diagnosis.\n- Tech IT World`;
          break;
        case 'waiting_for_approval':
          customerAlertMsg = `Dear ${updatedRma.customer_name},\nDiagnosis completed for Ticket #RMA-${rmaIdShort}.\nEstimate repair cost is: ₹${updatedRma.estimate_amount}.\nReply to approve or reject the repair estimate.\n- Tech IT World`;
          break;
        case 'ready':
          const amountText = updatedRma.warranty_status === 'in_warranty' ? 'Free (In-Warranty)' : `₹${updatedRma.estimate_amount}`;
          customerAlertMsg = `Dear ${updatedRma.customer_name},\nGood news! Your device under Ticket #RMA-${rmaIdShort} is repaired and ready for pickup/delivery.\nCharges due: ${amountText}.\n- Tech IT World`;
          break;
        case 'delivered':
          customerAlertMsg = `Dear ${updatedRma.customer_name},\nYour device under Ticket #RMA-${rmaIdShort} has been successfully delivered/returned to you. Thank you for your business!\n- Tech IT World`;
          break;
        case 'rejected':
          customerAlertMsg = `Dear ${updatedRma.customer_name},\nAs requested, the repair estimate for Ticket #RMA-${rmaIdShort} was rejected. Your device is being returned unrepaired.\n- Tech IT World`;
          break;
      }

      if (customerAlertMsg) {
        await whatsappService.sendMessage(updatedRma.customer_phone, customerAlertMsg);
      }

      // 5. Trigger finance ledger synchronization
      // A. If marked 'ready' and out-of-warranty, push estimate to central payments
      if (status === 'ready' && updatedRma.warranty_status === 'out_of_warranty' && rma.status !== 'ready') {
        const checkPayment = await db.query(
          `SELECT id FROM payments WHERE source_module = 'rma' AND source_id = $1`,
          [id]
        );
        if (checkPayment.rows.length === 0) {
          console.log(`RMA ${id} marked Ready. Pushing collection to Central Hub: ₹${updatedRma.estimate_amount}`);
          await db.query(
            `INSERT INTO payments (source_module, source_id, customer_name, amount, status)
             VALUES ($1, $2, $3, $4, $5)`,
            ['rma', updatedRma.id, updatedRma.customer_name, updatedRma.estimate_amount, 'pending_verification']
          );
        }
      }

      // B. If brand charges (job expense) exist, log them in expenses
      const parsedBrandCharge = parseFloat(brand_charge) || 0.00;
      if (parsedBrandCharge > 0 && rma.brand_charge === 0.00) {
        await db.query(
          `INSERT INTO ticket_expenses (source_module, source_id, description, amount)
           VALUES ($1, $2, $3, $4)`,
          ['rma', updatedRma.id, `Brand service charges for ${updatedRma.brand} ${updatedRma.product_name}`, parsedBrandCharge]
        );
      }

      return res.json({
        message: 'RMA status updated successfully and customer alerted',
        ticket: updatedRma
      });
    } catch (err) {
      console.error('Update RMA Error:', err);
      return res.status(500).json({ error: 'Failed to update RMA state' });
    }
  }
}

module.exports = new RmaController();
