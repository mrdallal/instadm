require('dotenv').config();
const express = require('express');
const path = require('path');

const app = express();

// Static assets served from CDN on Vercel, from Express locally
app.use('/static', express.static(path.join(__dirname, 'static')));

// Webhook must come before express.json() to get raw body for signature check
app.use(require('./routes/webhook'));

// REST API
app.use(require('./routes/api'));

// Dashboard SPA — serves the same HTML for / and /dashboard
app.get(['/', '/dashboard'], (req, res) => {
  res.sendFile(path.join(__dirname, 'templates', 'dashboard.html'));
});

// Health check for deployment platforms
app.get('/health', (req, res) => res.json({ status: 'ok' }));

const PORT = process.env.PORT || 3000;
if (require.main === module) {
  app.listen(PORT, () => console.log(`InstaDM running → http://localhost:${PORT}`));
}

module.exports = app;
