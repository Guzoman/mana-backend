const express = require('express');
const cors = require('cors');
const axios = require('axios');
const { Pool } = require('pg');

const app = express();
const port = process.env.PORT || 3000;

// Database connection
const pool = new Pool({
  host: process.env.DATABASE_HOST,
  port: process.env.DATABASE_PORT || 5432,
  user: process.env.DATABASE_USER,
  password: process.env.DATABASE_PASSWORD,
  database: process.env.DATABASE_NAME,
  ssl: process.env.DATABASE_SSL === 'true'
});

// Middleware
app.use(express.json({ limit: '1mb' }));
app.use(cors({
  origin: ['https://manaproject.app', 'https://lovable-preview.lovable.app'],
  credentials: false
}));

// Health endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Simple RPC endpoint for testing
app.post('/api/rpc', async (req, res) => {
  const { op } = req.body;
  
  try {
    switch (op) {
      case 'chat.send':
        return await handleChatSend(req, res);
      case 'ping':
        return res.json({ ok: true, message: 'pong', timestamp: new Date().toISOString() });
      default:
        return res.status(400).json({ error: 'unknown_operation', op });
    }
  } catch (error) {
    console.error('RPC error:', error);
    return res.status(500).json({ error: 'server_error', message: error.message });
  }
});

// Chat handler
async function handleChatSend(req, res) {
  const { flowId, message } = req.body;
  
  if (!flowId || !message) {
    return res.status(400).json({ error: 'missing_fields', required: ['flowId', 'message'] });
  }

  try {
    const flowiseUrl = process.env.FLOWISE_URL || 'http://flowise:3000';
    const url = `${flowiseUrl}/api/v1/prediction/${encodeURIComponent(flowId)}`;
    
    const payload = {
      question: message,
      variables: {}
    };
    
    const response = await axios.post(url, payload, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 30000
    });
    
    return res.json({ ok: true, data: response.data });
    
  } catch (error) {
    console.error('Flowise request failed:', error.message);
    return res.status(502).json({ 
      error: 'flowise_error', 
      message: 'Chat service unavailable',
      details: error.message
    });
  }
}

app.listen(port, '0.0.0.0', () => {
  console.log(`Auth-BFF server running on port ${port}`);
});

process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  pool.end(() => {
    process.exit(0);
  });
});
