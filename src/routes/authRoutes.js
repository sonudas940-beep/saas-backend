const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { authenticateToken, requireAdmin } = require('../middleware/auth');

// Public authentication endpoint
router.post('/login', authController.login);

// Protected account profile endpoint
router.get('/me', authenticateToken, authController.getMe);

// Admin-level Employee RBAC management endpoints
router.get('/employees', authenticateToken, requireAdmin, authController.getEmployees);
router.post('/employees', authenticateToken, requireAdmin, authController.createEmployee);
router.put('/employees/:id', authenticateToken, requireAdmin, authController.updateEmployee);
router.delete('/employees/:id', authenticateToken, requireAdmin, authController.deleteEmployee);

module.exports = router;
