const app = require('./src/app.js');
require('dotenv').config();

const PORT = process.env.PORT || 5000;

const server = app.listen(PORT, () => {
  console.log(`===================================================`);
  console.log(`Tech IT World CRM API Server running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`===================================================`);
});

// Graceful shutdown hooks
process.on('SIGTERM', () => {
  console.log('SIGTERM signal received. Closing API server...');
  server.close(() => {
    console.log('API server closed gracefully.');
  });
});
