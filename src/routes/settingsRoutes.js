const express = require('express');
const router = express.Router();
const settingsController = require('../controllers/settingsController');
const { authenticateToken, requireAdmin } = require('../middleware/auth');

// Apply authentication middleware
router.use(authenticateToken);

// All settings routes require admin or owner privileges
router.use(requireAdmin);

// Get all settings or specific setting by key
router.get('/', settingsController.getSettings);

// Update specific setting by key
router.put('/:key', settingsController.updateSetting);

module.exports = router;
