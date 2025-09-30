const express = require('express');
const axios = require('axios');
const cors = require('cors');
const { Pool } = require('pg');
const { v4: uuidv4 } = require('uuid');
const app = express();

// PostgreSQL connection usando las variables correctas
const pool = new Pool({
  host: process.env.DATABASE_HOST || process.env.PGHOST || 'mana-pg',
  port: process.env.DATABASE_PORT || process.env.PGPORT || 5432,
  user: process.env.DATABASE_USER || process.env.PGUSER || 'mana', 
  password: process.env.DATABASE_PASSWORD || process.env.PGPASSWORD || 'temporal-password-123',
  database: process.env.DATABASE_NAME || process.env.PGDATABASE || 'mana',
  ssl: false
});

// CORS configuration
app.use(cors({
  origin: ["https://www.manaproject.app", "https://manaproject.app"],
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"]
}));

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// =============================================================================
// 🔍 DEBUG ROUTE - Para inspeccionar el body crudo desde el front
// =============================================================================
app.post('/forbff/echo', (req, res) => {
  console.log('🔍 DEBUG ECHO - Raw body from frontend:', JSON.stringify(req.body, null, 2));
  res.json({
    receivedAt: new Date().toISOString(),
    rawBody: req.body,
    headers: {
      'content-type': req.headers['content-type'],
      'user-agent': req.headers['user-agent']
    }
  });
});

// UUID validation
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[4][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isValidUUID(str) {
  return UUID_REGEX.test(str);
}

// User validation logic
async function validateUserId(userId) {
  console.log('🔍 Validating userId:', userId);
  
  try {
    // Case 1: Empty userId -> NEW user
    if (!userId || userId.trim() === '') {
      console.log('📝 Creating new user (empty userId)');
      const newUserId = uuidv4();
      
      // Insert new user in database (adapted to existing table structure)
      await pool.query(
        'INSERT INTO users (id, email_verified, preferences, created_at) VALUES ($1, $2, $3, NOW())',
        [newUserId, false, '{}']
      );
      
      return {
        case: 'OK_NEW',
        userId: newUserId,
        message: 'New user created'
      };
    }
    
    // Case 2: Invalid UUID format -> ERROR
    if (!isValidUUID(userId)) {
      console.log('❌ Invalid UUID format:', userId);
      return {
        case: 'ERR_INVALID',
        userId: null,
        message: 'Invalid userId format - corruption detected'
      };
    }
    
    // Case 3: Valid UUID - check if exists in database
    const result = await pool.query('SELECT id, email, created_at FROM users WHERE id = $1', [userId]);
    
    if (result.rows.length === 0) {
      // Valid UUID but not found in DB -> MANIPULATION
      console.log('⚠️ Valid UUID but not found in database:', userId);
      return {
        case: 'ERR_NOT_FOUND', 
        userId: null,
        message: 'Valid userId but not found - possible manipulation'
      };
    }
    
    // Case 4: Valid UUID and exists in DB -> KNOWN user
    console.log('✅ Known user found:', userId, 'created:', result.rows[0].created_at);
    return {
      case: 'OK_KNOWN',
      userId: userId,
      message: 'Known user authenticated'
    };
    
  } catch (error) {
    console.error('💥 Database error:', error.message);
    return {
      case: 'ERR_INTERNAL',
      userId: null, 
      message: 'Database connection error'
    };
  }
}

// =============================================================================
// 🔄 PREDICT ROUTE - Paso transparente con logs detallados  
// =============================================================================
app.post('/forbff/predict', async (req, res) => {
  try {
    const body = req.body || {};
    const vars = body?.overrideConfig?.vars || {};
    
    console.log('🔥 DBG front->BFF vars:', JSON.stringify(vars, null, 2));
    
    const payload = {
      question: typeof body.question === 'string' ? body.question : 'boot',
      streaming: false,
      overrideConfig: {
        sessionId: body.sessionId || `${uuidv4()}`,
        vars: vars  // PASO TRANSPARENTE - no tocamos nada
      }
    };
    
    console.log('🔥 DBG BFF->Flowise payload:', JSON.stringify(payload, null, 2));
    
    const CHATFLOW_ID = process.env.AUTH_AGENTFLOW_ID || process.env.CHATFLOW_ID || '6e6088ac-e323-46de-acbb-67884fd57f2a';
    const FLOWISE_URL = process.env.FLOWISE_URL || 'http://flowise:3000';
    const url = `${FLOWISE_URL}/api/v1/prediction/${CHATFLOW_ID}`;
    
    const response = await axios.post(url, payload, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 15000
    });
    
    console.log('🔥 FLOWISE RESPONDED:', response.status);
    
    // Devolver tanto el payload enviado como la respuesta para debugging
    res.status(response.status).json({
      sentPayload: payload,
      flowiseResponse: response.data
    });
    
  } catch (err) {
    console.error('🔥 PREDICT ERROR:', err.message);
    const status = err.response?.status ?? 502;
    const body = err.response?.data ?? { error: "Flowise upstream error" };
    res.status(status).json({ error: body, sentPayload: req.body });
  }
});

// =============================================================================
// 🔄 UNIVERSAL HANDLER - Soporta AMBOS formatos (legacy + nuevo)
// =============================================================================
async function handleUniversalRequest(req, res) {
  try {
    console.log('🔥 UNIVERSAL REQUEST RECEIVED:', JSON.stringify(req.body, null, 2));
    
    // Detectar formato: ¿tiene overrideConfig.vars o campos directos?
    const body = req.body || {};
    const hasOverrideConfig = body.overrideConfig && body.overrideConfig.vars;
    
    let userId, userLanguage, question;
    
    if (hasOverrideConfig) {
      // FORMATO NUEVO: { overrideConfig: { vars: { userId, userLanguage } } }
      console.log('📦 Detected NEW format (overrideConfig.vars)');
      userId = body.overrideConfig.vars.userId;
      userLanguage = body.overrideConfig.vars.userLanguage;
      question = body.question;
      
      // PASO TRANSPARENTE - enviamos directo a Flowise
      const payload = {
        question: typeof question === 'string' ? question : 'boot',
        streaming: false,
        overrideConfig: {
          sessionId: body.sessionId || `${uuidv4()}`,
          vars: {
            userId: userId || '',
            userLanguage: userLanguage || 'es',
            PGHOST: 'mana-pg',
            PGPORT: '5432',
            PGUSER: 'mana',
            PGPASSWORD: 'CambiaEstaClaveFuerte',
            PGDATABASE: 'mana',
            PGSSLMODE: 'disable'
          }
        }
      };
      
      console.log('🔥 SENDING NEW FORMAT TO FLOWISE:', JSON.stringify(payload, null, 2));
      
      const CHATFLOW_ID = process.env.AUTH_AGENTFLOW_ID || process.env.CHATFLOW_ID || '6e6088ac-e323-46de-acbb-67884fd57f2a';
      const FLOWISE_URL = process.env.FLOWISE_URL || 'http://flowise:3000';
      const url = `${FLOWISE_URL}/api/v1/prediction/${CHATFLOW_ID}`;
      
      const response = await axios.post(url, payload, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 15000
      });
      
      console.log('🔥 FLOWISE RESPONDED:', response.status);
      
      // Respuesta compatible con frontend
      return res.status(200).json({
        version: '1.0.0',
        success: true,
        case: 'TRANSPARENT',
        message: 'Request forwarded transparently',
        userId: userId,
        webauthn: { action: 'authenticate' },
        nextRoute: 'Game',
        uiState: { turn: 1, step: 'ready', counters: { energy: 100 } },
        playerState: { chatId: response.data.chatId },
        flowiseData: response.data
      });
      
    } else {
      // FORMATO LEGACY: { userId, userLanguage, question }
      console.log('📦 Detected LEGACY format (direct fields)');
      userId = body.userId;
      userLanguage = body.userLanguage;
      question = body.question;
      
      const q = (question && question.trim().length) ? question : 'boot';
      
      // Validate user
      const userValidation = await validateUserId(userId);
      console.log('🎯 User validation result:', userValidation);
      
      // If error, return early without calling Flowise
      if (userValidation.case.startsWith('ERR_')) {
        return res.status(200).json({
          version: '1.0.0',
          success: false,
          case: userValidation.case,
          message: userValidation.message,
          proposedUserId: userValidation.case === 'OK_NEW' ? userValidation.userId : undefined,
          webauthn: { action: 'skip' },
          nextRoute: 'Lobby',
          uiState: { turn: 0, step: 'intro', counters: { energy: 0 } },
          playerState: {}
        });
      }
      
      // Use validated userId for Flowise
      const validatedUserId = userValidation.userId;
      console.log('🔥 SENDING LEGACY TO FLOWISE - UserId:', validatedUserId, 'Question:', q);
      
      const payload = {
        question: q,
        overrideConfig: {
          sessionId: req.body.sessionId || `${uuidv4()}`,
          vars: {
            userId: validatedUserId || "",
            userLanguage: userLanguage || "es",
            PGHOST: "mana-pg",
            PGPORT: "5432",
            PGUSER: "mana",
            PGPASSWORD: "CambiaEstaClaveFuerte",
            PGDATABASE: "mana",
            PGSSLMODE: "disable"
          }
        },
        streaming: false
      };
      
      console.log('🔥 LEGACY FLOWISE COMPLETE PAYLOAD:', JSON.stringify(payload, null, 2));
      
      const CHATFLOW_ID = process.env.AUTH_AGENTFLOW_ID || process.env.CHATFLOW_ID || '6e6088ac-e323-46de-acbb-67884fd57f2a';
      const FLOWISE_URL = process.env.FLOWISE_URL || 'http://flowise:3000';
      const url = `${FLOWISE_URL}/api/v1/prediction/${CHATFLOW_ID}`;
      
      const response = await axios.post(url, payload, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 15000
      });
      
      console.log('🔥 FLOWISE RESPONDED:', response.status);
      
      // Return success with validation info
      return res.status(200).json({
        version: '1.0.0',
        success: true,
        case: userValidation.case,
        message: userValidation.message,
        userId: validatedUserId,
        proposedUserId: userValidation.case === 'OK_NEW' ? validatedUserId : undefined,
        webauthn: { action: 'authenticate' },
        nextRoute: 'Game',
        uiState: { turn: 1, step: 'ready', counters: { energy: 100 } },
        playerState: { chatId: response.data.chatId },
        flowiseData: response.data
      });
    }
    
  } catch (err) {
    console.error('🔥 UNIVERSAL ERROR:', err.message);
    res.status(500).json({
      version: '1.0.0', 
      success: false,
      case: 'ERR_INTERNAL',
      message: 'Internal server error'
    });
  }
}

// =============================================================================
// 📍 ROUTES - Asignar handlers
// =============================================================================

// Handler universal que soporta AMBOS formatos
app.post('/forbff', handleUniversalRequest);

// Handler legacy para /hola (solo formato antiguo)
// Función handleLegacyRequest corregida con validación de payload y propagación de text
async function handleLegacyRequest(req, res) {
  try {
    console.log('🔥 /hola REQUEST RECEIVED:', JSON.stringify(req.body, null, 2));

    // ✅ VALIDACIÓN DE PAYLOAD
    const b = req.body;

    if (!b || typeof b.question !== 'string') {
      return res.status(400).json({
        success: false,
        case: 'ERR_INPUT',
        message: 'question requerida'
      });
    }

    // ✅ HARDENING: NO se permite question dentro de vars
    if (b.overrideConfig?.vars && ('question' in b.overrideConfig.vars || 'overrideConfig' in b.overrideConfig.vars)) {
      return res.status(400).json({
        success: false,
        case: 'ERR_INPUT',
        message: 'payload inválido: no anides question/overrideConfig en vars'
      });
    }

    console.log('🔥 VALIDATED PAYLOAD - question:', b.question, 'overrideConfig:', b.overrideConfig);

    // ✅ LLAMAR A FLOWISE Y REENVÍAR SU SALIDA TAL CUAL EN `text`
    const CHATFLOW_ID = process.env.AUTH_AGENTFLOW_ID || process.env.CHATFLOW_ID || '6e6088ac-e323-46de-acbb-67884fd57f2a';
    const FLOWISE_URL = process.env.FLOWISE_URL || 'http://flowise:3000';
    const url = `${FLOWISE_URL}/api/v1/prediction/${CHATFLOW_ID}`;

    const flowisePayload = {
      question: b.question,
      overrideConfig: b.overrideConfig || {},
      streaming: false
    };

    console.log('🔥 SENDING TO FLOWISE:', JSON.stringify(flowisePayload, null, 2));

    const flowiseResp = await axios.post(url, flowisePayload, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 15000
    });

    console.log('🔥 FLOWISE RESPONSE STATUS:', flowiseResp.status);
    console.log('🔥 FLOWISE RESPONSE DATA:', JSON.stringify(flowiseResp.data, null, 2));

    // ✅ SI EL NODO ROUTER RETORNA STRING JSON:
    if (typeof flowiseResp.data?.text === 'string' && flowiseResp.data.text.trim() !== '') {
      console.log('🔥 RETURNING TRANSPARENT RESPONSE WITH TEXT');
      return res.status(200).json({
        success: true,
        case: 'TRANSPARENT',
        text: flowiseResp.data.text
      });
    }

    // ✅ SI NO HAY TEXT, ES ERROR DE FLUJO
    console.log('🔥 EMPTY OUTPUT - RETURNING 502');
    return res.status(502).json({
      success: false,
      case: 'ERR_INTERNAL',
      message: 'EMPTY_OUTPUT'
    });

  } catch (e) {
    console.error('🔥 /hola ERROR:', e.message);
    return res.status(500).json({
      success: false,
      case: 'ERR_INTERNAL',
      message: e?.message || 'Internal server error'
    });
  }
}
app.post('/hola', handleLegacyRequest);

// Health check endpoint
app.get('/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    const userCount = await pool.query('SELECT COUNT(*) as count FROM users');
    res.json({ 
      status: 'healthy', 
      database: 'connected',
      userCount: userCount.rows[0].count 
    });
  } catch (error) {
    res.status(500).json({ 
      status: 'unhealthy', 
      database: 'disconnected', 
      error: error.message 
    });
  }
});

// Puerto de escucha
const PORT = process.env.PORT || 3000;

// Test database connection (SINCRONAMENTE ANTES DE ARRANCAR)
console.log('🔗 Testing database connection...');
pool.query('SELECT NOW() as current_time')
  .then(result => {
    console.log('✅ Database connected successfully:', result.rows[0].current_time);
    
    // Show users count
    return pool.query('SELECT COUNT(*) as count FROM users');
  })
  .then(userCountResult => {
    console.log('👥 Total users in database:', userCountResult.rows[0].count);
    
    // Start server
    app.listen(PORT, () => {
        console.log('🚀 Auth-BFF server running on port ' + PORT);
        console.log('📡 Routes available:');
        console.log('   🔍 /forbff/echo - Debug endpoint');
        console.log('   🔄 /forbff/predict - Debug transparent endpoint');
        console.log('   🔄 /forbff - UNIVERSAL handler (NEW + LEGACY formats)');
        console.log('   🔄 /hola - Legacy handler only');
    });
  })
  .catch(error => {
    console.error('💥 Database connection failed:', error.message);
    app.listen(PORT, () => {
        console.log('🚀 Auth-BFF server running on port ' + PORT + ' (DATABASE ERROR!)');
    });
  });

module.exports = app;
