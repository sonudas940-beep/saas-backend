const express = require('express');
const router = express.Router();
const dataController = require('../controllers/dataController');
const { authenticateToken, requireAdmin } = require('../middleware/auth');

// All data operations require admin/owner authentication
router.use(authenticateToken);
router.use(requireAdmin);

// Export data
router.get('/export/:module', dataController.exportData);

// Import data
router.post('/import/:module', dataController.importData);

module.exports = router;
