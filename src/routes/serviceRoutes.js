const express = require('express');
const router = express.Router();
const serviceController = require('../controllers/serviceController');
const { authenticateToken, requirePermission } = require('../middleware/auth');

// PUBLIC ticket logging endpoint (Used by Customer QR Code Scan web forms)
router.post('/public/qr-log', serviceController.createTicket);

// PUBLIC field engineer endpoints (Bypasses Admin authentication via secure smart token validation)
router.get('/public/token/:token', serviceController.getTicketByToken);
router.put('/public/token/:token', serviceController.submitEngineerUpdate);

// PROTECTED Admin service routes (Requires authentication and specific 'service' module permission)
router.get('/', authenticateToken, requirePermission('service'), serviceController.getTickets);
router.post('/', authenticateToken, requirePermission('service'), serviceController.createTicket);
router.put('/assign/:id', authenticateToken, requirePermission('service'), serviceController.assignTicket);

module.exports = router;
