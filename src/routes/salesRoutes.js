const express = require('express');
const router = express.Router();
const salesController = require('../controllers/salesController');
const { authenticateToken, requirePermission } = require('../middleware/auth');

// PUBLIC webhook endpoint called by JustDial servers to register external leads
router.post('/webhook/justdial', salesController.justdialWebhook);

// PROTECTED sales routes (Require user logging and specific 'sales' module permission)
router.get('/', authenticateToken, requirePermission('sales'), salesController.getLeads);
router.post('/', authenticateToken, requirePermission('sales'), salesController.createLead);
router.put('/:id', authenticateToken, requirePermission('sales'), salesController.updateLead);

// Follow-up sub-resource routing
router.post('/followup', authenticateToken, requirePermission('sales'), salesController.logFollowup);
router.get('/followup/:leadId', authenticateToken, requirePermission('sales'), salesController.getFollowups);

module.exports = router;
