const jwt = require('jsonwebtoken');
const db = require('../config/db');

/**
 * Main authentication middleware to verify the JWT token
 */
const authenticateToken = async (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access token missing' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Fetch fresh user data including role and permissions to ensure they are up to date
    const userResult = await db.query(
      'SELECT id, name, email, role, permissions FROM users WHERE id = $1',
      [decoded.id]
    );

    if (userResult.rows.length === 0) {
      return res.status(403).json({ error: 'User no longer exists' });
    }

    req.user = userResult.rows[0];
    next();
  } catch (err) {
    console.error('JWT Verification Error:', err.message);
    return res.status(403).json({ error: 'Invalid or expired token' });
  }
};

/**
 * Middleware generator to check specific module permissions based on user role and configuration
 * @param {string} moduleName - 'sales', 'service', 'rma', or 'financials'
 */
const requirePermission = (moduleName) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'User is not authenticated' });
    }

    const { role, permissions } = req.user;

    // Owner and Admin roles always bypass module authorization checks
    if (role === 'owner' || role === 'admin') {
      return next();
    }

    // Employees must have the specific permission checkbox set to true
    if (permissions && permissions[moduleName] === true) {
      return next();
    }

    return res.status(403).json({ 
      error: `Access denied. You do not have permission to access the '${moduleName}' module.` 
    });
  };
};

/**
 * Middleware to check if the user is an Admin or Owner
 */
const requireAdmin = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ error: 'User is not authenticated' });
  }

  const { role } = req.user;
  if (role === 'owner' || role === 'admin') {
    return next();
  }

  return res.status(403).json({ error: 'Access denied. Administrator privileges required.' });
};

module.exports = {
  authenticateToken,
  requirePermission,
  requireAdmin,
};
