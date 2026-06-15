const db = require('../config/db');
const whatsappService = require('../utils/whatsappService');

/**
 * Controller managing Cashier Ledger Approvals, Ticket Expenses, and Net Profits
 */
class FinanceController {
  
  /**
   * Retrieve all payments (Sales, Service, and RMA)
   */
  async getPayments(req, res) {
    try {
      const result = await db.query(
        `SELECT p.*, 
                CASE 
                  WHEN p.source_module = 'sales' THEN 'Sales Pipeline'
                  WHEN p.source_module = 'service' THEN 'Service Dispatch'
                  WHEN p.source_module = 'rma' THEN 'RMA Brand Repair'
                  ELSE p.source_module
                END as source_label
         FROM payments p 
         ORDER BY p.created_at DESC`
      );
      return res.json({ payments: result.rows });
    } catch (err) {
      console.error('Get Payments Error:', err);
      return res.status(500).json({ error: 'Failed to retrieve payment collections' });
    }
  }

  /**
   * Cashier action: Approve cash/field collections to Settled.
   * Dispatches WhatsApp notification containing receipt download url.
   */
  async approvePayment(req, res) {
    const { id } = req.params;

    try {
      // 1. Fetch payment details
      const payCheck = await db.query('SELECT * FROM payments WHERE id = $1', [id]);
      if (payCheck.rows.length === 0) {
        return res.status(404).json({ error: 'Payment record not found' });
      }

      const payment = payCheck.rows[0];

      if (payment.status === 'settled') {
        return res.status(400).json({ error: 'Payment is already settled and verified' });
      }

      // 2. Generate a mock receipt PDF URL
      const receiptToken = payment.id.slice(0, 8).toUpperCase();
      const receiptPdfUrl = `http://localhost:5000/public/receipts/REC-${receiptToken}.pdf`;

      // 3. Update payment status to settled
      const result = await db.query(
        `UPDATE payments 
         SET status = 'settled', receipt_pdf_url = $1, updated_at = CURRENT_TIMESTAMP 
         WHERE id = $2 
         RETURNING *`,
        [receiptPdfUrl, id]
      );

      const updatedPayment = result.rows[0];

      // 4. Fetch phone number from source modules to trigger customer alert
      let phone = '';
      if (updatedPayment.source_module === 'sales') {
        const check = await db.query('SELECT customer_phone FROM leads WHERE id = $1', [updatedPayment.source_id]);
        phone = check.rows[0]?.customer_phone;
      } else if (updatedPayment.source_module === 'service') {
        const check = await db.query('SELECT customer_phone FROM service_tickets WHERE id = $1', [updatedPayment.source_id]);
        phone = check.rows[0]?.customer_phone;
      } else if (updatedPayment.source_module === 'rma') {
        const check = await db.query('SELECT customer_phone FROM rma_tickets WHERE id = $1', [updatedPayment.source_id]);
        phone = check.rows[0]?.customer_phone;
      }

      const targetPhone = phone || '919876543210'; // Fallback

      // 5. WhatsApp API Hook: Send PDF receipt link to customer
      const clientAlertMsg = `Dear ${updatedPayment.customer_name},\nYour payment of ₹${updatedPayment.amount} has been successfully settled and verified.\n` +
                             `Receipt Reference: REC-${receiptToken}.\nDownload your official PDF Receipt here:\n${receiptPdfUrl}\n\nThank you for choosing Tech IT World!`;
      
      await whatsappService.sendMessage(targetPhone, clientAlertMsg);

      return res.json({
        message: 'Payment collection verified and settled. Receipt dispatched via WhatsApp.',
        payment: updatedPayment
      });
    } catch (err) {
      console.error('Approve Payment Error:', err);
      return res.status(500).json({ error: 'Failed to settle payment' });
    }
  }

  /**
   * Retrieve strictly job-based expenses (excluding general overheads)
   */
  async getExpenses(req, res) {
    try {
      const result = await db.query(
        `SELECT e.*,
                CASE 
                  WHEN e.source_module = 'service' THEN 'Service Ticket'
                  WHEN e.source_module = 'rma' THEN 'RMA Brand Repair'
                  ELSE e.source_module
                END as source_label
         FROM ticket_expenses e
         ORDER BY e.created_at DESC`
      );
      return res.json({ expenses: result.rows });
    } catch (err) {
      console.error('Get Expenses Error:', err);
      return res.status(500).json({ error: 'Failed to retrieve expenses' });
    }
  }

  /**
   * Dynamic SQL calculation for [Customer Bill] - [Job Expense] = Net Profit per ticket
   */
  async getNetProfitSummary(req, res) {
    try {
      const sqlQuery = `
        SELECT 
          'service' AS module,
          id AS ticket_id,
          customer_name,
          device_details AS details,
          amount_billed AS total_billed,
          job_expense AS job_expenses,
          (amount_billed - job_expense) AS net_profit,
          status::VARCHAR,
          created_at
        FROM service_tickets
        WHERE status = 'solved'
        
        UNION ALL
        
        SELECT 
          'rma' AS module,
          id AS ticket_id,
          customer_name,
          (brand || ' ' || product_name) AS details,
          estimate_amount AS total_billed,
          brand_charge AS job_expenses,
          (estimate_amount - brand_charge) AS net_profit,
          status::VARCHAR,
          created_at
        FROM rma_tickets
        WHERE status = 'ready' OR status = 'delivered'
        
        ORDER BY created_at DESC;
      `;

      const result = await db.query(sqlQuery);
      return res.json({ netProfitList: result.rows });
    } catch (err) {
      console.error('Net Profit Query Error:', err);
      return res.status(500).json({ error: 'Failed to calculate net profits ledger' });
    }
  }
}

module.exports = new FinanceController();
