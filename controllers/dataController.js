const pool = require('../config/db');

// Export data for a given module
const exportData = async (req, res) => {
  const { module } = req.params;
  try {
    let query = '';
    switch (module) {
      case 'sales': query = 'SELECT * FROM leads'; break;
      case 'service': query = 'SELECT * FROM service_tickets'; break;
      case 'rma': query = 'SELECT * FROM rma_tickets'; break;
      case 'financials': query = 'SELECT * FROM payments'; break;
      default: return res.status(400).json({ error: 'Invalid module specified' });
    }

    const result = await pool.query(query);
    res.json({ data: result.rows });
  } catch (err) {
    console.error(`Error exporting ${module}:`, err);
    res.status(500).json({ error: 'Failed to export data' });
  }
};

// Import data for a given module
const importData = async (req, res) => {
  const { module } = req.params;
  const { data } = req.body; // Array of objects parsed from CSV by the frontend

  if (!Array.isArray(data) || data.length === 0) {
    return res.status(400).json({ error: 'No valid data provided to import' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    let importedCount = 0;

    for (const row of data) {
      if (module === 'sales') {
        const { customer_name, customer_phone, source, status, initial_requirements, assigned_to } = row;
        if (!customer_name) continue;
        await client.query(
          `INSERT INTO leads (customer_name, customer_phone, source, status, initial_requirements, assigned_to) 
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [customer_name, customer_phone, source || 'manual', status || 'lead_entry', initial_requirements, assigned_to || null]
        );
        importedCount++;
      } 
      else if (module === 'service') {
        const { client_name, client_phone, device_type, reported_issue, status, service_engineer } = row;
        if (!client_name || !device_type) continue;
        await client.query(
          `INSERT INTO service_tickets (client_name, client_phone, device_type, reported_issue, status, service_engineer) 
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [client_name, client_phone, device_type, reported_issue, status || 'pending', service_engineer || null]
        );
        importedCount++;
      }
    }

    await client.query('COMMIT');
    res.json({ message: `Successfully imported ${importedCount} records to ${module}` });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(`Error importing ${module}:`, err);
    res.status(500).json({ error: 'Database error during import. Action rolled back.' });
  } finally {
    client.release();
  }
};

module.exports = {
  exportData,
  importData
};
