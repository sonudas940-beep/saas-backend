const express = require('express');
const router = express.Router();
const financeController = require('../controllers/financeController');
const { authenticateToken, requirePermission } = require('../middleware/auth');

// PROTECTED Finance hub routes (Requires authentication and specific 'financials' module permission)
router.get('/payments', authenticateToken, requirePermission('financials'), financeController.getPayments);
router.put('/payments/:id/approve', authenticateToken, requirePermission('financials'), financeController.approvePayment);
router.get('/expenses', authenticateToken, requirePermission('financials'), financeController.getExpenses);
router.get('/profit-ledger', authenticateToken, requirePermission('financials'), financeController.getNetProfitSummary);

module.exports = router;
