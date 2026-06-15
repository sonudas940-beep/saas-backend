const pool = require('../config/db');

// Get all settings or a specific setting
const getSettings = async (req, res) => {
  try {
    const { key } = req.query;
    
    if (key) {
      const result = await pool.query('SELECT setting_value FROM system_settings WHERE setting_key = $1', [key]);
      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Setting not found' });
      }
      return res.json(result.rows[0].setting_value);
    }

    const result = await pool.query('SELECT setting_key, setting_value FROM system_settings');
    const settings = {};
    result.rows.forEach(row => {
      settings[row.setting_key] = row.setting_value;
    });
    res.json(settings);
  } catch (error) {
    console.error('Error fetching settings:', error);
    res.status(500).json({ error: 'Server error fetching settings' });
  }
};

// Update a specific setting
const updateSetting = async (req, res) => {
  try {
    const { key } = req.params;
    const value = req.body;

    if (!key || value === undefined) {
      return res.status(400).json({ error: 'Key and value are required' });
    }

    const result = await pool.query(
      `INSERT INTO system_settings (setting_key, setting_value, updated_at) 
       VALUES ($1, $2, CURRENT_TIMESTAMP) 
       ON CONFLICT (setting_key) 
       DO UPDATE SET setting_value = EXCLUDED.setting_value, updated_at = CURRENT_TIMESTAMP 
       RETURNING *`,
      [key, JSON.stringify(value)]
    );

    res.json({ message: 'Setting updated successfully', data: result.rows[0] });
  } catch (error) {
    console.error('Error updating setting:', error);
    res.status(500).json({ error: 'Server error updating setting' });
  }
};

module.exports = {
  getSettings,
  updateSetting
};
