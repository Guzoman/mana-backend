import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import pg from 'pg';
import jwt from 'jsonwebtoken';
import axios from 'axios';
import { z } from 'zod';

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