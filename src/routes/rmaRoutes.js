const express = require('express');
const router = express.Router();
const rmaController = require('../controllers/rmaController');
const { authenticateToken, requirePermission } = require('../middleware/auth');

// PROTECTED Repair & RMA routes (Require user logging and specific 'rma' module permission)
router.get('/', authenticateToken, requirePermission('rma'), rmaController.getRmas);
router.post('/', authenticateToken, requirePermission('rma'), rmaController.createRma);
router.put('/:id', authenticateToken, requirePermission('rma'), rmaController.updateRmaStatus);

module.exports = router;
