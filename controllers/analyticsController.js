const db = require('../config/db');

/**
 * Controller calculating complex metrics for CRM Analytics dashboards
 */
class AnalyticsController {
  
  /**
   * Retrieve executive performance: Leads assigned, closed won, and conversion rates
   */
  async getSalesPerformance(req, res) {
    try {
      const sql = `
        SELECT 
          u.id AS user_id,
          u.name AS executive_name,
          COUNT(l.id) AS leads_assigned,
          COUNT(CASE WHEN l.status = 'closed_won' THEN 1 END) AS leads_closed_won,
          CASE 
            WHEN COUNT(l.id) = 0 THEN 0 
            ELSE ROUND((COUNT(CASE WHEN l.status = 'closed_won' THEN 1 END)::numeric / COUNT(l.id)::numeric) * 100, 2)
          END AS conversion_rate,
          COALESCE(SUM(CASE WHEN l.status = 'closed_won' THEN l.total_amount ELSE 0 END), 0) AS total_sales_value
        FROM users u
        LEFT JOIN leads l ON u.id = l.assigned_to
        WHERE u.role = 'employee' OR u.role = 'admin' OR u.role = 'owner'
        GROUP BY u.id, u.name
        ORDER BY total_sales_value DESC;
      `;
      const result = await db.query(sql);
      return res.json({ salesPerformance: result.rows });
    } catch (err) {
      console.error('Sales Analytics Error:', err);
      return res.status(500).json({ error: 'Failed to aggregate sales metrics' });
    }
  }

  /**
   * Retrieve field engineer performance: tickets assigned vs solved and customer satisfaction ratings
   */
  async getEngineerPerformance(req, res) {
    try {
      const sql = `
        SELECT 
          u.id AS user_id,
          u.name AS engineer_name,
          COUNT(t.id) AS tickets_assigned,
          COUNT(CASE WHEN t.status = 'solved' THEN 1 END) AS tickets_solved,
          COUNT(CASE WHEN t.status = 'assigned' THEN 1 END) AS tickets_pending,
          COALESCE(ROUND(AVG(t.customer_rating), 2), 0) AS average_rating
        FROM users u
        LEFT JOIN service_tickets t ON u.id = t.assigned_engineer_id
        WHERE u.role = 'employee' OR u.role = 'admin' OR u.role = 'owner'
        GROUP BY u.id, u.name
        ORDER BY tickets_solved DESC;
      `;
      const result = await db.query(sql);
      return res.json({ engineerPerformance: result.rows });
    } catch (err) {
      console.error('Engineer Analytics Error:', err);
      return res.status(500).json({ error: 'Failed to aggregate engineer metrics' });
    }
  }

  /**
   * Retrieve Monthly Profit Ledger: Total Billed vs Job Expenses = Net Profit
   */
  async getFinancialOverview(req, res) {
    try {
      const sql = `
        SELECT 
          COALESCE(p.month_label, e.month_label) AS month_label,
          COALESCE(p.revenue, 0) AS revenue,
          COALESCE(e.expenses, 0) AS expenses,
          (COALESCE(p.revenue, 0) - COALESCE(e.expenses, 0)) AS net_profit
        FROM (
          SELECT TO_CHAR(created_at, 'YYYY-MM') AS month_label, SUM(amount) AS revenue
          FROM payments WHERE status = 'settled'
          GROUP BY month_label
        ) p
        FULL OUTER JOIN (
          SELECT TO_CHAR(created_at, 'YYYY-MM') AS month_label, SUM(amount) AS expenses
          FROM ticket_expenses
          GROUP BY month_label
        ) e ON p.month_label = e.month_label
        ORDER BY month_label DESC;
      `;
      const result = await db.query(sql);
      return res.json({ financialTrend: result.rows });
    } catch (err) {
      console.error('Financial Trend Error:', err);
      return res.status(500).json({ error: 'Failed to aggregate monthly financial overview' });
    }
  }
}

module.exports = new AnalyticsController();
