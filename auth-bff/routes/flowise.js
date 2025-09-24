const express = require('express');
const axios = require('axios');
const { z } = require('zod');
const router = express.Router();

// Schema for frontend payload validation - NEW CONTRACT
const FrontendPayloadSchema = z.object({
  question: z.string().default(''),
  overrideConfig: z.object({
    startState: z.array(z.tuple([
      z.string(),  // key
      z.string()   // value
    ])).optional()
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

    const { overrideConfig } = validation.data;
    const startState = overrideConfig?.startState || [];

    // Extract userId and userLanguage from startState
    const userIdEntry = startState.find(([key]) => key === 'userId');
    const languageEntry = startState.find(([key]) => key === 'userLanguage');

    const userId = userIdEntry ? userIdEntry[1] : '';
    const language = languageEntry ? languageEntry[1] : 'cat';

    console.log('🔧 DEBUG: Received validation request:', { userId, language });

    // Call Flowise with NEW CONTRACT - pass through directly
    const flowiseUrl = process.env.FLOWISE_URL || 'http://flowise:3001';
    // TODO: Replace with actual AgentFlow ID when imported
    const flowId = process.env.AUTH_AGENTFLOW_ID || 'b77e8611-c327-46d9-8a1c-964426675ebe';
    const url = `${flowiseUrl}/api/v1/agentflow/prediction/${flowId}`;

    // NEW CONTRACT: Pass payload directly to Flowise
    const flowisePayload = {
      question: '',
      overrideConfig: {
        startState: [
          ['userId', userId],
          ['userLanguage', language]
        ]
      }
    };

    console.log('🔧 DEBUG: Sending to Flowise:', {
      url,
      payload: flowisePayload
    });

    // Prepare headers with both authentication methods
    const headers = {
      'Content-Type': 'application/json',
    };

    // Add both authentication headers if API key is available
    const flowiseApiKey = process.env.FLOWISE_API_KEY || 'gaXY1T5ZWw5OBnRz8zqItQ1BVwKeEjXhLU7_CmMJ_cg';
    if (flowiseApiKey) {
      headers['x-api-key'] = flowiseApiKey;
      headers['Authorization'] = `Bearer ${flowiseApiKey}`;
    }

    const flowiseResponse = await axios.post(url, flowisePayload, {
      headers,
      timeout: 30000
    });

    console.log('🔧 DEBUG: Flowise response status:', flowiseResponse.status);
    console.log('🔧 DEBUG: Flowise www-authenticate:', flowiseResponse.headers['www-authenticate']);
    console.log('🔧 DEBUG: Flowise server header:', flowiseResponse.headers['server']);
    console.log('🔧 DEBUG: Flowise response headers:', Object.keys(flowiseResponse.headers));

    const flowiseData = flowiseResponse.data;

    // NEW CONTRACT: Flowise DirectReply returns JSON string - pass through without parsing
    // The AgentFlow already returns the correct format, so we just pass it through
    console.log('🔧 DEBUG: Flowise response received, passing through directly');

    // If flowiseData.text is a string, it's already the correct JSON response
    if (typeof flowiseData.text === 'string') {
      // Return the JSON string directly without re-parsing
      res.type('application/json');
      return res.send(flowiseData.text);
    }

    // Fallback for other response formats
    return res.json(flowiseData.text || flowiseData);

  } catch (error) {
    console.error('❌ Flowise validation failed:', {
      error: error.message,
      response: error.response?.data,
      stack: error.stack,
      code: error.code,
      timeout: error.timeout
    });

    // NEW CONTRACT: Only return 500 for actual network/gateway failures
    // If Flowise is unreachable or times out, return 500
    if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND' || error.timeout) {
      return res.status(502).json({
        version: '1.0.4',
        success: false,
        case: 'ERR_INTERNAL',
        message: 'Flowise service unavailable',
        timestamp: new Date().toISOString()
      });
    }

    // For other errors (like Flowise returning 500), also return 500
    return res.status(502).json({
      version: '1.0.4',
      success: false,
      case: 'ERR_INTERNAL',
      message: 'Gateway error',
      timestamp: new Date().toISOString()
    });
  }
});

module.exports = router;