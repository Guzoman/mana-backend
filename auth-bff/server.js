import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import pg from 'pg';
import jwt from 'jsonwebtoken';
import axios from 'axios';
import { z } from 'zod';
import crypto from 'crypto';
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse
} from '@simplewebauthn/server';

const { Pool } = pg;
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

// Test database connection
pool.connect((err, client, release) => {
  if (err) {
    console.error('❌ Error connecting to database:', err.message);
    process.exit(1);
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
    if (!origin || allowList.includes(origin)) return callback(null, true);
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

// Store pool and config in app.locals for routes
app.locals.pool = pool;
app.locals.config = {
  jwtSecret: process.env.JWT_SECRET,
  jwtTtl: process.env.JWT_TTL || '3600',
  flowiseUrl: process.env.FLOWISE_URL || 'http://flowise:3000',
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
      timeout: 60000,
      attestationType: 'none',
      authenticatorSelection: {
        userVerification: 'preferred',
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
      timeout: 60000,
      userVerification: 'preferred',
      allowCredentials: [], // rely on resident/discoverable credentials
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

export default app;
