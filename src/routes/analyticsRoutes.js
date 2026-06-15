const express = require('express');
const router = express.Router();
const analyticsController = require('../controllers/analyticsController');
const { authenticateToken } = require('../middleware/auth');

// PROTECTED analytics routes (Requires authentication)
router.get('/sales', authenticateToken, analyticsController.getSalesPerformance);
router.get('/engineer', authenticateToken, analyticsController.getEngineerPerformance);
router.get('/financial-trend', authenticateToken, analyticsController.getFinancialOverview);

module.exports = router;
