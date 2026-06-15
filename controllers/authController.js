const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../config/db');

/**
 * Controller for User Authentication & Employee RBAC Management
 */
class AuthController {
  
  /**
   * Login handler. Auto-seeds a default master admin if the users table is completely empty.
   */
  async login(req, res) {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    try {
      // 1. Auto-seed owner if database contains zero users
      const countResult = await db.query('SELECT COUNT(*) FROM users');
      const userCount = parseInt(countResult.rows[0].count, 10);

      if (userCount === 0) {
        console.log('No users found in database. Auto-seeding master owner account...');
        const salt = await bcrypt.genSalt(10);
        const seedPasswordHash = await bcrypt.hash('admin123', salt);
        await db.query(
          `INSERT INTO users (name, email, password_hash, role, permissions) 
           VALUES ($1, $2, $3, $4, $5)`,
          [
            'Master Owner', 
            'admin@techitworld.com', 
            seedPasswordHash, 
            'owner', 
            JSON.stringify({ sales: true, service: true, rma: true, financials: true })
          ]
        );
      }

      // 2. Query user by email
      const userResult = await db.query('SELECT * FROM users WHERE email = $1', [email]);
      if (userResult.rows.length === 0) {
        return res.status(401).json({ error: 'Invalid email or password' });
      }

      const user = userResult.rows[0];

      // 3. Compare password
      const isMatch = await bcrypt.compare(password, user.password_hash);
      if (!isMatch) {
        return res.status(401).json({ error: 'Invalid email or password' });
      }

      // 4. Generate JWT
      const token = jwt.sign(
        { id: user.id, role: user.role },
        process.env.JWT_SECRET,
        { expiresIn: '24h' }
      );

      return res.json({
        message: 'Login successful',
        token,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          permissions: user.permissions,
        },
      });
    } catch (err) {
      console.error('Login Error:', err);
      return res.status(500).json({ error: 'Database connection or authentication failure' });
    }
  }

  /**
   * Return profile of currently authenticated user
   */
  async getMe(req, res) {
    return res.json({ user: req.user });
  }

  /**
   * Create an employee (Admin/Owner action only)
   */
  async createEmployee(req, res) {
    const { name, email, password, permissions } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Name, email, and password are required' });
    }

    try {
      // Check if email already registered
      const checkResult = await db.query('SELECT id FROM users WHERE email = $1', [email]);
      if (checkResult.rows.length > 0) {
        return res.status(409).json({ error: 'Email is already registered' });
      }

      // Hash password
      const salt = await bcrypt.genSalt(10);
      const passwordHash = await bcrypt.hash(password, salt);

      // Default permissions structure
      const defaultPermissions = {
        sales: false,
        service: false,
        rma: false,
        financials: false,
        ...permissions
      };

      const insertResult = await db.query(
        `INSERT INTO users (name, email, password_hash, role, permissions)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, name, email, role, permissions, created_at`,
        ['Employee: ' + name, email, passwordHash, 'employee', JSON.stringify(defaultPermissions)]
      );

      return res.status(201).json({
        message: 'Employee created successfully',
        employee: insertResult.rows[0],
      });
    } catch (err) {
      console.error('Create Employee Error:', err);
      return res.status(500).json({ error: 'Failed to create employee' });
    }
  }

  /**
   * Get list of all employees (Admin/Owner action only)
   */
  async getEmployees(req, res) {
    try {
      const result = await db.query(
        `SELECT id, name, email, role, permissions, created_at 
         FROM users 
         WHERE role = 'employee' 
         ORDER BY name ASC`
      );
      return res.json({ employees: result.rows });
    } catch (err) {
      console.error('Get Employees Error:', err);
      return res.status(500).json({ error: 'Failed to retrieve employees list' });
    }
  }

  /**
   * Update permissions or details of an employee (Admin/Owner action only)
   */
  async updateEmployee(req, res) {
    const { id } = req.params;
    const { name, email, permissions } = req.body;

    try {
      // Ensure target user is indeed an employee
      const checkResult = await db.query('SELECT role FROM users WHERE id = $1', [id]);
      if (checkResult.rows.length === 0) {
        return res.status(404).json({ error: 'Employee not found' });
      }

      if (checkResult.rows[0].role !== 'employee') {
        return res.status(403).json({ error: 'Cannot modify non-employee accounts from this endpoint' });
      }

      // Build dynamically updated values
      let query = 'UPDATE users SET updated_at = CURRENT_TIMESTAMP';
      const params = [];
      let index = 1;

      if (name) {
        query += `, name = $${index}`;
        params.push(name);
        index++;
      }
      if (email) {
        query += `, email = $${index}`;
        params.push(email);
        index++;
      }
      if (permissions) {
        query += `, permissions = $${index}`;
        params.push(JSON.stringify(permissions));
        index++;
      }

      query += ` WHERE id = $${index} RETURNING id, name, email, role, permissions`;
      params.push(id);

      const result = await db.query(query, params);

      return res.json({
        message: 'Employee updated successfully',
        employee: result.rows[0],
      });
    } catch (err) {
      console.error('Update Employee Error:', err);
      return res.status(500).json({ error: 'Failed to update employee details' });
    }
  }

  /**
   * Delete an employee (Admin/Owner action only)
   */
  async deleteEmployee(req, res) {
    const { id } = req.params;

    try {
      const checkResult = await db.query('SELECT role FROM users WHERE id = $1', [id]);
      if (checkResult.rows.length === 0) {
        return res.status(404).json({ error: 'Employee not found' });
      }

      if (checkResult.rows[0].role !== 'employee') {
        return res.status(403).json({ error: 'Only employee accounts can be deleted' });
      }

      await db.query('DELETE FROM users WHERE id = $1', [id]);
      return res.json({ message: 'Employee deleted successfully' });
    } catch (err) {
      console.error('Delete Employee Error:', err);
      return res.status(500).json({ error: 'Failed to delete employee' });
    }
  }
}

module.exports = new AuthController();
