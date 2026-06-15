const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();

// Standard middleware setup
app.use(cors({ origin: '*' })); // Allow requests from any origin (e.g. Vite dev frontend)
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Dynamic import of route definitions
const authRoutes = require('./routes/authRoutes');
const salesRoutes = require('./routes/salesRoutes');
const serviceRoutes = require('./routes/serviceRoutes');
const rmaRoutes = require('./routes/rmaRoutes');
const financeRoutes = require('./routes/financeRoutes');
const analyticsRoutes = require('./routes/analyticsRoutes');
const settingsRoutes = require('./routes/settingsRoutes');
const dataRoutes = require('./routes/dataRoutes');

// Root API test path
app.get('/api/health', (req, res) => {
  res.json({ status: 'healthy', timestamp: new Date() });
});

// Mounting main domain routes
app.use('/api/auth', authRoutes);
app.use('/api/sales', salesRoutes);
app.use('/api/service', serviceRoutes);
app.use('/api/rma', rmaRoutes);
app.use('/api/finance', financeRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/data', dataRoutes);

// General 404 middleware
app.use((req, res, next) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

// Global internal error handler
app.use((err, req, res, next) => {
  console.error('Unhandled Server Error:', err);
  res.status(500).json({ error: 'Internal Server Error' });
});

module.exports = app;
