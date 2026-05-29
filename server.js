const express = require('express');
require('dotenv').config();

const app = express();

app.use(express.static('public'));

// Health check — used by Vercel and external uptime monitors.
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Maison Voyage running on port ${PORT}`);
});
