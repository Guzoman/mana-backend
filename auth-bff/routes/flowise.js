const express = require('express');
const axios = require('axios');
const { z } = require('zod');
const router = express.Router();

// Schema for validateUser request
const ValidateUserSchema = z.object({
  userId: z.string().min(1),
  language: z.string().default('es')
});

// ===== /flowise-api/prediction/:flowId - Public Flowise endpoint =====
router.post('/prediction/:flowId', async (req, res) => {
  const { logger } = req.app.locals;
  const { flowId } = req.params;
  const { question, overrideConfig } = req.body;
  
  if (!question) {
    return res.status(400).json({ 
      error: 'bad_request', 
      message: 'question is required' 
    });
  }

  try {
    const payload = {
      question,
      overrideConfig: overrideConfig || {}
    };
    
    const flowiseUrl = process.env.FLOWISE_URL || 'http://flowise:3000';
    const url = `${flowiseUrl}/api/v1/prediction/${encodeURIComponent(flowId)}`;
    
    logger.info('Proxying to Flowise:', { flowId, question });
    
    const response = await axios.post(url, payload, {
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.FLOWISE_API_KEY || 'gaXY1T5ZWw5OBnRz8zqItQ1BVwKeEjXhLU7_CmMJ_cg'}`
      },
      timeout: 30000, // 30s timeout
    });
    
    logger.info('Flowise response successful:', { flowId });
    return res.json(response.data);
    
  } catch (error) {
    logger.error('Flowise request failed:', { 
      error: error.message, 
      flowId,
      response: error.response?.data 
    });
    
    if (error.response) {
      return res.status(error.response.status).json({
        error: 'flowise_error',
        message: error.response.data.message || 'Flowise service error'
      });
    }
    
    return res.status(502).json({ 
      error: 'flowise_upstream', 
      message: 'Flowise service temporarily unavailable' 
    });
  }
});

// ===== /flowise-api/rpc/validateUser - Public user validation endpoint =====
router.post('/rpc/validateUser', async (req, res) => {
  const { logger } = req.app.locals;

  // Validate request body
  const validation = ValidateUserSchema.safeParse(req.body);
  if (!validation.success) {
    return res.status(400).json({
      success: false,
      error: 'invalid_request',
      message: 'Invalid request body'
    });
  }

  const { userId, language } = validation.data;

  try {
    console.log('Validating user:', { userId, language });

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(userId)) {
      return res.json({
        success: false,
        case: 'ERR_INVALID',
        errorCode: 'INVALID_UUID_FORMAT',
        message: language === 'es' ? 'Formato de UUID inválido' : 'Invalid UUID format',
        action: 'CLEANUP_LOCALSTORAGE'
      });
    }

    // Call Flowise to validate user
    const flowiseUrl = process.env.FLOWISE_URL || 'http://flowise:3000';
    const url = `${flowiseUrl}/api/v1/prediction/cdcb7665-5e80-4283-b84f-4d7a080c6044`;

    const payload = {
      question: userId,
      overrideConfig: {
        userId: userId,
        userLanguage: language
      }
    };

    const response = await axios.post(url, payload, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 30000
    });

    const flowiseData = response.data;

    // Parse Flowise response (expected format: { text: "JSON_STRING" })
    let result;
    try {
      result = JSON.parse(flowiseData.text);
    } catch (parseError) {
      console.error('Failed to parse Flowise response:', parseError);
      return res.status(502).json({
        success: false,
        case: 'ERR_INTERNAL',
        message: language === 'es' ? 'Error interno del servidor' : 'Internal server error'
      });
    }

    // Handle Flowise response format
    if (result.status === 'ERROR') {
      return res.json({
        success: false,
        case: result.code === 'INVALID_UUID_FORMAT' || result.code === 'CORRUPTED_DATA' ? 'ERR_INVALID' :
              result.code === 'USER_NOT_FOUND' ? 'ERR_NOT_FOUND' : 'ERR_INTERNAL',
        errorCode: result.code,
        message: result.message || (language === 'es' ? 'Error de validación' : 'Validation error'),
        action: result.action
      });
    }

    // Handle success cases
    return res.json({
      success: true,
      case: result.kind,
      userId: result.userId,
      proposedUserId: result.proposedUserId,
      message: result.message || (language === 'es' ? 'Validación exitosa' : 'Validation successful')
    });

  } catch (error) {
    console.error('User validation failed:', {
      error: error.message,
      userId,
      response: error.response?.data
    });

    if (error.response) {
      return res.status(error.response.status).json({
        success: false,
        case: 'ERR_INTERNAL',
        message: language === 'es' ? 'Error de servicio externo' : 'External service error'
      });
    }

    return res.status(502).json({
      success: false,
      case: 'ERR_INTERNAL',
      message: language === 'es' ? 'Servicio de validación temporalmente no disponible' : 'Validation service temporarily unavailable'
    });
  }
});

module.exports = router;