require('dotenv').config();
const express = require('express');
const path = require('path');
const { initDb } = require('./db');

const app = express();

// Guard: ensure DB schema exists before any request is handled
let _dbReady = false;
const _dbReadyPromise = initDb().then(() => { _dbReady = true; }).catch(err => {
  console.error('DB init failed:', err.message);
});

app.use((req, res, next) => {
  if (_dbReady) return next();
  _dbReadyPromise.then(next).catch(next);
});

app.use('/static', express.static(path.join(__dirname, 'static')));

// Webhook must be registered before express.json() to keep raw body for signature check
app.use(require('./routes/webhook'));
app.use(require('./routes/api'));

app.get(['/', '/dashboard'], (req, res) => {
  res.sendFile(path.join(__dirname, 'templates', 'dashboard.html'));
});

app.get('/health', (req, res) => res.json({ status: 'ok' }));

// Global error handler
app.use((err, req, res, next) => {
  console.error(err.message);
  res.status(500).json({ detail: err.message });
});

const PORT = process.env.PORT || 3000;
if (require.main === module) {
  app.listen(PORT, () => console.log(`InstaDM running → http://localhost:${PORT}`));
}

module.exports = app;
