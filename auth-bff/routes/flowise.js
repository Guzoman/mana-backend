const express = require('express');
const axios = require('axios');
const router = express.Router();

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

module.exports = router;