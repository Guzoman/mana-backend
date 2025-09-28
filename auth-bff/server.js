require('dotenv').config();
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const { Pool } = require('pg');
const jwt = require('jsonwebtoken');
const axios = require('axios');
const { z } = require('zod');
const crypto = require('crypto');
const {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse
} = require('@simplewebauthn/server');

const app = express();
const port = process.env.PORT || 3000;

// Environment validation
const requiredEnvVars = ['DATABASE_HOST', 'DATABASE_USER', 'DATABASE_PASSWORD', 'DATABASE_NAME', 'JWT_SECRET'];
for (const envVar of requiredEnvVars) {
  if (!process.env[envVar]) {
    console.error(`❌ Missing required environment variable: ${envVar}`);
    process.exit(1);
  }
}

// Database connection
const pool = new Pool({
  host: process.env.DATABASE_HOST,
  port: process.env.DATABASE_PORT || 5432,
  user: process.env.DATABASE_USER,
  password: process.env.DATABASE_PASSWORD,
  database: process.env.DATABASE_NAME,
  ssl: process.env.DATABASE_SSL === 'true'
});

// Test database connection (non-fatal for now)
pool.connect((err, client, release) => {
  if (err) {
    console.error('❌ Error connecting to database:', err.message);
    console.log('⚠️  Continuing without database connection for testing...');
  } else {
    console.log('✅ Database connected successfully');
    release();
  }
});

// CORS configuration
const rawOrigins = process.env.CORS_ORIGINS || 'https://manaproject.app,https://www.manaproject.app';
const allowList = rawOrigins.split(',').map(s => s.trim()).filter(Boolean);

const corsOptions = {
  origin: function (origin, callback) {
    // Allow no origin (server-to-server)
    if (!origin) return callback(null, true);
    
    // Allow production domains
    if (allowList.includes(origin)) return callback(null, true);
    
    // Allow any localhost port for development
    if (origin.match(/^https?:\/\/localhost:\d+$/)) {
      return callback(null, true);
    }
    
    return callback(new Error('CORS not allowed for origin: ' + origin));
  },
  methods: ['GET', 'HEAD', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
  maxAge: 86400
};

// Middleware
app.disable('x-powered-by');
app.use(morgan('tiny'));
app.use(express.json({ limit: '1mb' }));

// CORS setup
app.options('/api/*', cors(corsOptions));
app.use('/api', cors(corsOptions));

// CORS para endpoints principales
app.options('/hola', cors(corsOptions));
app.options('/forbff', cors(corsOptions));
app.use('/hola', cors(corsOptions));
app.use('/forbff', cors(corsOptions));

// Store pool and config in app.locals for routes
app.locals.pool = pool;
app.locals.config = {
  jwtSecret: process.env.JWT_SECRET,
  jwtTtl: process.env.JWT_TTL || '3600',
  flowiseUrl: process.env.FLOWISE_URL || 'http://flowise:3000',
  flowiseApiKey: process.env.FLOWISE_API_KEY,
  authAgentflowId: process.env.AUTH_AGENTFLOW_ID || 'b77e8611-c327-46d9-8a1c-964426675ebe',
  rpId: process.env.RP_ID || 'manaproject.app',
  origin: process.env.ORIGIN || 'https://manaproject.app'
};

// In-memory challenge stores (dev/local)
const regChallengeByUser = new Map(); // userId -> challenge
const issuedAuthChallenges = new Set(); // challenges issued for auth

// JWT Authentication middleware
function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      ok: false,
      error: 'unauthorized',
      message: 'Bearer token required'
    });
  }

  const token = authHeader.slice(7);
  try {
    const decoded = jwt.verify(token, app.locals.config.jwtSecret);
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(401).json({
      ok: false,
      error: 'unauthorized',
      message: 'Invalid token'
    });
  }
}

// Basic validation middleware
function validateBody(schema) {
  return (req, res, next) => {
    try {
      req.body = schema.parse(req.body);
      next();
    } catch (error) {
      return res.status(400).json({
        ok: false,
        error: 'validation_error',
        message: 'Invalid request body',
        details: error.errors
      });
    }
  };
}

// Basic schemas
const EchoSchema = z.object({
  message: z.string().optional(),
  data: z.any().optional()
});

const ShareChatSchema = z.object({
  sessionId: z.string().uuid(),
  title: z.string().optional()
});

// Health endpoint
app.get('/health', (req, res) => {
  res.status(200).json({
    ok: true,
    service: 'mana-auth-bff',
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  });
});

// Diagnostic endpoint - test Flowise connectivity
app.get('/diag', async (req, res) => {
  try {
    const FLOWISE_URL = app.locals.config.flowiseUrl || 'http://flowise:3001';
    const AUTH_AGENTFLOW_ID = app.locals.config.authAgentflowId || 'b77e8611-c327-46d9-8a1c-964426675ebe';
    const FLOWISE_API_KEY = app.locals.config.flowiseApiKey;

    const url = `${FLOWISE_URL}/prediction/${AUTH_AGENTFLOW_ID}`;
    const headers = {
      'Content-Type': 'application/json',
    };

    if (FLOWISE_API_KEY) {
      headers['x-api-key'] = FLOWISE_API_KEY;
      headers['Authorization'] = `Bearer ${FLOWISE_API_KEY}`;
    }

    const payload = {
      question: '',
      overrideConfig: {
        startState: [['userId','health'],['userLanguage','es']]
      }
    };

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload)
    });

    const text = await response.text();

    res.status(200).json({
      ok: response.ok,
      status: response.status,
      statusText: response.statusText,
      responseLength: text.length,
      flowiseUrl: FLOWISE_URL,
      hasApiKey: !!FLOWISE_API_KEY,
      headers: Object.keys(headers),
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      ok: false,
      error: String(error),
      message: 'Flowise connection failed',
      timestamp: new Date().toISOString()
    });
  }
});

// Echo endpoint for testing
app.post('/api/rpc/echo', validateBody(EchoSchema), (req, res) => {
  res.status(200).json({ 
    ok: true, 
    echo: req.body,
    timestamp: new Date().toISOString()
  });
});

// ===== WebAuthn Registration =====
app.post('/api/auth/webauthn/register/begin', async (req, res) => {
  try {
    const { username, displayName } = req.body || {};
    if (!username || !displayName) {
      return res.status(400).json({ ok: false, error: 'bad_request', message: 'username and displayName required' });
    }

    const userId = crypto.randomUUID();

    // Create user row
    await app.locals.pool.query(
      'INSERT INTO users (id, email, email_verified, preferences) VALUES ($1, $2, $3, $4)',
      [userId, null, false, JSON.stringify({ profile: { username, displayName } })]
    );

    const options = await generateRegistrationOptions({
      rpName: 'MANA Project',
      rpID: app.locals.config.rpId,
      userID: userId,
      userName: String(username),
      timeout: 120000,
      attestationType: 'none',
      authenticatorSelection: {
        userVerification: 'discouraged', // Allow PIN and other convenient methods
        residentKey: 'preferred',
        requireResidentKey: false,
      },
      supportedAlgorithmIDs: [-7, -257],
    });

    // Persist challenge in memory for this user (for local dev)
    regChallengeByUser.set(userId, options.challenge);

    return res.status(200).json({ ...options, userId });
  } catch (err) {
    console.error('register/begin error:', err);
    return res.status(500).json({ ok: false, error: 'internal_error', message: 'Failed to begin registration' });
  }
});

app.post('/api/auth/webauthn/register/finish', async (req, res) => {
  try {
    const { userId } = req.body || {};
    if (!userId) {
      return res.status(400).json({ ok: false, error: 'bad_request', message: 'userId missing' });
    }

    const expectedChallenge = regChallengeByUser.get(userId);
    if (!expectedChallenge) {
      return res.status(400).json({ ok: false, error: 'invalid_challenge', message: 'No registration in progress' });
    }

    const verification = await verifyRegistrationResponse({
      response: req.body,
      expectedChallenge,
      expectedOrigin: app.locals.config.origin,
      expectedRPID: app.locals.config.rpId,
      requireUserVerification: false,
    });

    if (!verification.verified || !verification.registrationInfo) {
      return res.status(400).json({ ok: false, error: 'verification_failed', message: 'Registration verification failed' });
    }

    const { credentialPublicKey, credentialID, counter } = verification.registrationInfo;

    // Store credential
    await app.locals.pool.query(
      'INSERT INTO webauthn_credentials (credential_id, user_id, public_key, counter, transports) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (credential_id) DO NOTHING',
      [Buffer.from(credentialID), userId, Buffer.from(credentialPublicKey).toString('base64'), counter, null]
    );

    // Clear challenge
    regChallengeByUser.delete(userId);

    const token = jwt.sign({ userId }, app.locals.config.jwtSecret, { expiresIn: app.locals.config.jwtTtl });
    return res.status(200).json({ ok: true, token, user: { id: userId } });
  } catch (err) {
    console.error('register/finish error:', err);
    return res.status(500).json({ ok: false, error: 'internal_error', message: 'Failed to complete registration' });
  }
});

// ===== WebAuthn Authentication =====
app.post('/api/auth/webauthn/authenticate/begin', async (req, res) => {
  try {
    const options = await generateAuthenticationOptions({
      rpID: app.locals.config.rpId,
      timeout: 120000,
      userVerification: 'discouraged', // Allow PIN and other convenient methods
      allowCredentials: [], // rely on resident/discoverable credentials
      authenticatorSelection: {
        userVerification: 'discouraged',
        residentKey: 'preferred',
        requireResidentKey: false,
      }
    });

    issuedAuthChallenges.add(options.challenge);
    return res.status(200).json(options);
  } catch (err) {
    console.error('authenticate/begin error:', err);
    return res.status(500).json({ ok: false, error: 'internal_error', message: 'Failed to begin authentication' });
  }
});

app.post('/api/auth/webauthn/authenticate/finish', async (req, res) => {
  try {
    const body = req.body || {};
    const credId = body.id;
    if (!credId) {
      return res.status(400).json({ ok: false, error: 'bad_request', message: 'Missing credential id' });
    }

    // Find credential owner and public key
    const rawIdArray = body.rawId ? Uint8Array.from(body.rawId) : null;
    const rawIdBuf = rawIdArray ? Buffer.from(rawIdArray) : null;
    const credRes = await app.locals.pool.query(
      'SELECT user_id, public_key, counter FROM webauthn_credentials WHERE credential_id = $1',
      [rawIdBuf]
    );
    if (credRes.rowCount === 0) {
      return res.status(404).json({ ok: false, error: 'credential_not_found', message: 'Unknown credential' });
    }

    const { user_id: userId, public_key: publicKeyB64, counter } = credRes.rows[0];
    const authenticator = {
      credentialPublicKey: Buffer.from(publicKeyB64, 'base64'),
      counter: Number(counter) || 0,
    };

    // Extract challenge from clientDataJSON and validate it was issued
    const clientData = Buffer.from(Uint8Array.from(body.response?.clientDataJSON || [])).toString('utf8');
    const clientJson = JSON.parse(clientData);
    const expectedChallenge = clientJson.challenge;
    if (!issuedAuthChallenges.has(expectedChallenge)) {
      return res.status(400).json({ ok: false, error: 'invalid_challenge', message: 'Auth challenge not recognized' });
    }

    const verification = await verifyAuthenticationResponse({
      response: body,
      expectedChallenge,
      expectedOrigin: app.locals.config.origin,
      expectedRPID: app.locals.config.rpId,
      authenticator,
      requireUserVerification: false,
    });

    if (!verification.verified || !verification.authenticationInfo) {
      return res.status(401).json({ ok: false, error: 'verification_failed', message: 'Authentication failed' });
    }

    const { newCounter } = verification.authenticationInfo;
    await app.locals.pool.query(
      'UPDATE webauthn_credentials SET counter = $1 WHERE credential_id = $2',
      [newCounter, rawIdBuf]
    );

    issuedAuthChallenges.delete(expectedChallenge);

    const token = jwt.sign({ userId }, app.locals.config.jwtSecret, { expiresIn: app.locals.config.jwtTtl });
    return res.status(200).json({ ok: true, token, user: { id: userId } });
  } catch (err) {
    console.error('authenticate/finish error:', err);
    return res.status(500).json({ ok: false, error: 'internal_error', message: 'Failed to complete authentication' });
  }
});

// Simple local dev chat stub (no auth required)
app.post('/api/chat', (req, res) => {
  const { message } = req.body || {};
  res.status(200).json({
    ok: true,
    response: message ? `Echo: ${message}` : 'Hola desde MANA local',
    timestamp: new Date().toISOString()
  });
});



// Share chat endpoint
app.post('/api/share/chat', requireAuth, validateBody(ShareChatSchema), async (req, res) => {
  const { sessionId, title } = req.body;
  const { pool } = req.app.locals;
  
  try {
    // Check if chat session exists
    const chatCheck = await pool.query(
      'SELECT COUNT(*) FROM chat_message WHERE "sessionId" = $1',
      [sessionId]
    );
    
    if (parseInt(chatCheck.rows[0].count) === 0) {
      return res.status(404).json({
        ok: false,
        error: 'chat_not_found',
        message: 'Chat session not found'
      });
    }

    // Create share entry
    const shareId = sessionId; // Use sessionId as shareId for simplicity
    await pool.query(
      'INSERT INTO workspace_shared ("workspaceId", "sharedItemId", "itemType") VALUES ($1, $2, $3) ON CONFLICT ("sharedItemId", "itemType") DO NOTHING',
      [req.user.workspaceId || '00000000-0000-0000-0000-000000000000', shareId, 'CHAT_SESSION']
    );

    res.status(200).json({
      ok: true,
      shareId,
      url: `https://manaproject.app/chat/${shareId}`,
      title: title || 'Shared Chat'
    });
  } catch (error) {
    console.error('Share chat error:', error);
    res.status(500).json({
      ok: false,
      error: 'internal_error',
      message: 'Failed to create share'
    });
  }
});

// Get shared chat
app.get('/api/chat/:shareId', async (req, res) => {
  const { shareId } = req.params;
  const { pool } = req.app.locals;

  try {
    // Check if chat is shared
    const shareCheck = await pool.query(
      'SELECT * FROM workspace_shared WHERE "sharedItemId" = $1 AND "itemType" = $2',
      [shareId, 'CHAT_SESSION']
    );

    if (shareCheck.rows.length === 0) {
      return res.status(404).json({
        ok: false,
        error: 'share_not_found',
        message: 'Shared chat not found'
      });
    }

    // Get chat messages
    const messages = await pool.query(
      `SELECT cm.*, cf.name as flow_name 
       FROM chat_message cm 
       JOIN chat_flow cf ON cm.chatflowid = cf.id 
       WHERE cm."sessionId" = $1 
       ORDER BY cm."createdDate" ASC`,
      [shareId]
    );

    res.status(200).json({
      ok: true,
      shareId,
      messages: messages.rows,
      shared: true
    });
  } catch (error) {
    console.error('Get shared chat error:', error);
    res.status(500).json({
      ok: false,
      error: 'internal_error',
      message: 'Failed to retrieve shared chat'
    });
  }
});

// Handler único para /hola y /forbff
async function handleAuth(req, res) {
  try {
    console.log('📨 INCOMING REQUEST:', {
      method: req.method,
      path: req.path,
      body: req.body,
      headers: req.headers['content-type']
    });
    
    const { question, userId, userLanguage } = req.body || {};
    console.log('📋 EXTRACTED VALUES:', { question, userId, userLanguage });
    
    const q = (typeof question === 'string' && question.trim().length) ? question : 'boot';
    console.log('✅ FINAL QUESTION:', q);

    const flowisePayload = {
      question: q,
      overrideConfig: {
        vars: { userId, userLanguage }
      },
      streaming: false
    };

    console.log('→ Enviando a Flowise:', JSON.stringify(flowisePayload));

    const CHATFLOW_ID = process.env.CHATFLOW_ID || process.env.AUTH_AGENTFLOW_ID || 'b77e8611-c327-46d9-8a1c-964426675ebe';
    const FLOWISE_URL = process.env.FLOWISE_URL || 'http://flowise:3001';
    const url = `${FLOWISE_URL}/api/v1/prediction/${CHATFLOW_ID}`;

    const response = await axios.post(url, flowisePayload, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 15000
    });

    const data = response.data;

    // ACEPTAR texto u objeto (no parsear a la fuerza)
    if (typeof data === 'string') {
      return res.status(200).json({ ok: true, case: 'OK', text: data });
    }
    if (data && typeof data === 'object') {
      return res.status(200).json({ ok: true, case: 'OK', data });
    }

    return res.status(502).json({
      ok: false,
      case: 'ERR_GATEWAY',
      message: 'Unexpected response type from upstream'
    });
  } catch (err) {
    console.error('Auth error:', err?.response?.status, err?.response?.data || err.message);
    return res.status(500).json({
      ok: false,
      case: 'ERR_INTERNAL',
      message: 'AuthBFF error'
    });
  }
}

// Endpoints usando el handler compartido
app.post('/forbff', handleAuth);
app.post('/hola', handleAuth);

// Public Flowise API endpoint (no auth required)
const flowiseRouter = require('./routes/flowise');
app.use('/flowise-api', flowiseRouter);

// Fallback 404 for /api
app.use('/api', (req, res) => {
  res.status(404).json({ 
    ok: false, 
    error: 'not_found',
    message: 'API endpoint not found' 
  });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('Global error:', err);
  
  if (err && /CORS not allowed/.test(err.message)) {
    return res.status(403).json({ 
      ok: false, 
      error: 'cors_forbidden', 
      message: err.message 
    });
  }
  
  return res.status(500).json({ 
    ok: false, 
    error: 'internal_error', 
    message: 'Internal server error' 
  });
});

// Start server
app.listen(port, () => {
  console.log(`🚀 MANA Auth-BFF listening on port ${port}`);
  console.log(`🌐 CORS origins: ${allowList.join(', ')}`);
  console.log(`🗄️  Database: ${process.env.DATABASE_HOST}:${process.env.DATABASE_PORT}/${process.env.DATABASE_NAME}`);
  console.log(`✨ Environment: ${process.env.NODE_ENV || 'development'}`);
});

module.exports = app;
