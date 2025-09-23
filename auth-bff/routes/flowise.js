const express = require('express');
const axios = require('axios');
const { z } = require('zod');
const router = express.Router();

// Schema for frontend payload validation
const FrontendPayloadSchema = z.object({
  question: z.any().optional(),
  variables: z.object({
    userId: z.string(),
    language: z.string().default('es'),
    caps: z.object({
      webauthn: z.boolean().default(true)
    }).optional()
  }).optional()
});

// ===== /flowise-api - Root endpoint for user validation =====
router.post('/', async (req, res) => {
  const { logger } = req.app.locals;

  try {
    // Validate and parse frontend payload
    const validation = FrontendPayloadSchema.safeParse(req.body);
    if (!validation.success) {
      console.log('❌ Invalid frontend payload:', validation.error);
      return res.status(400).json({
        version: '1.0.0',
        success: false,
        case: 'ERR_INTERNAL',
        message: 'Invalid request payload format',
        webauthn: { action: 'skip' },
        nextRoute: 'Lobby',
        uiState: { turn: 0, step: 'intro', counters: { energy: 0 } },
        playerState: {}
      });
    }

    const { variables } = validation.data;
    const userId = variables?.userId || '';
    const language = variables?.language || 'es';

    console.log('🔧 DEBUG: Received validation request:', { userId, language });

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (userId && !uuidRegex.test(userId)) {
      console.log('❌ Invalid UUID format:', userId);
      return res.json({
        version: '1.0.0',
        success: false,
        case: 'ERR_INVALID',
        errorCode: 'INVALID_UUID_FORMAT',
        message: language === 'es' ? 'Formato de UUID inválido' : 'Invalid UUID format',
        action: 'CLEANUP_LOCALSTORAGE',
        webauthn: { action: 'skip' },
        nextRoute: 'Lobby',
        uiState: { turn: 0, step: 'intro', counters: { energy: 0 } },
        playerState: {}
      });
    }

    // Call Flowise with correct flow ID and payload transformation
    const flowiseUrl = process.env.FLOWISE_URL || 'http://flowise:3000';
    const flowId = 'b77e8611-c327-46d9-8a1c-964426675ebe'; // Validation flow ID
    const url = `${flowiseUrl}/api/v1/prediction/${flowId}`;

    // Transform frontend payload to Flowise format
    const flowisePayload = {
      question: userId, // Send userId as question (empty for validation)
      overrideConfig: {
        userId: userId,
        userLanguage: language
      }
    };

    console.log('🔧 DEBUG: Sending to Flowise:', {
      url,
      payload: flowisePayload
    });

    const flowiseResponse = await axios.post(url, flowisePayload, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.FLOWISE_API_KEY || 'gaXY1T5ZWw5OBnRz8zqItQ1BVwKeEjXhLU7_CmMJ_cg'}`
      },
      timeout: 30000
    });

    console.log('🔧 DEBUG: Flowise response status:', flowiseResponse.status);

    const flowiseData = flowiseResponse.data;

    // Parse Flowise response (expected format: { text: "JSON_STRING" })
    let result;
    try {
      result = typeof flowiseData.text === 'string'
        ? JSON.parse(flowiseData.text)
        : flowiseData.text || flowiseData;
    } catch (parseError) {
      console.error('❌ Failed to parse Flowise response:', parseError);
      console.error('❌ Raw Flowise response:', flowiseData);

      return res.status(502).json({
        version: '1.0.0',
        success: false,
        case: 'ERR_INTERNAL',
        message: language === 'es' ? 'Error interno del servidor' : 'Internal server error',
        webauthn: { action: 'skip' },
        nextRoute: 'Lobby',
        uiState: { turn: 0, step: 'intro', counters: { energy: 0 } },
        playerState: {}
      });
    }

    console.log('🔧 DEBUG: Parsed Flowise result:', result);

    // Handle Flowise response format and transform to frontend format
    if (result.status === 'ERROR') {
      const errorCase = result.code === 'INVALID_UUID_FORMAT' || result.code === 'CORRUPTED_DATA' ? 'ERR_INVALID' :
                       result.code === 'USER_NOT_FOUND' ? 'ERR_NOT_FOUND' : 'ERR_INTERNAL';

      return res.json({
        version: '1.0.0',
        success: false,
        case: errorCase,
        errorCode: result.code,
        message: result.message || (language === 'es' ? 'Error de validación' : 'Validation error'),
        action: result.action,
        webauthn: { action: 'skip' },
        nextRoute: 'Lobby',
        uiState: { turn: 0, step: 'intro', counters: { energy: 0 } },
        playerState: {}
      });
    }

    // Handle success cases
    return res.json({
      version: '1.0.0',
      success: true,
      case: result.kind || 'OK_NEW',
      userId: result.userId,
      proposedUserId: result.proposedUserId,
      message: result.message || (language === 'es' ? 'Validación exitosa' : 'Validation successful'),
      webauthn: result.webauthn || { action: 'skip' },
      nextRoute: result.nextRoute || 'Lobby',
      uiState: result.uiState || { turn: 0, step: 'intro', counters: { energy: 0 } },
      playerState: result.playerState || {}
    });

  } catch (error) {
    console.error('❌ Flowise validation failed:', {
      error: error.message,
      response: error.response?.data,
      stack: error.stack
    });

    if (error.response) {
      return res.status(error.response.status).json({
        version: '1.0.0',
        success: false,
        case: 'ERR_INTERNAL',
        message: language === 'es' ? 'Error de servicio externo' : 'External service error',
        webauthn: { action: 'skip' },
        nextRoute: 'Lobby',
        uiState: { turn: 0, step: 'intro', counters: { energy: 0 } },
        playerState: {}
      });
    }

    return res.status(502).json({
      version: '1.0.0',
      success: false,
      case: 'ERR_INTERNAL',
      message: language === 'es' ? 'Servicio de validación temporalmente no disponible' : 'Validation service temporarily unavailable',
      webauthn: { action: 'skip' },
      nextRoute: 'Lobby',
      uiState: { turn: 0, step: 'intro', counters: { energy: 0 } },
      playerState: {}
    });
  }
});

module.exports = router;