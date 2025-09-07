const jwt = require('jsonwebtoken');

// JWT Authentication middleware
function requireAuth(req, res, next) {
  const { logger, config } = req.app.locals;
  const authHeader = req.get('Authorization');
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      error: 'unauthorized',
      message: 'Bearer token required',
    });
  }
  
  const token = authHeader.slice(7);
  
  try {
    const payload = jwt.verify(token, config.jwt.secret);
    
    if (!payload.sub || !payload.iss || !payload.aud) {
      throw new Error('Invalid token payload');
    }
    
    if (payload.iss !== 'mana-auth' || payload.aud !== 'mana-api') {
      throw new Error('Invalid token claims');
    }
    
    req.user = {
      sub: payload.sub,
      iat: payload.iat,
      exp: payload.exp,
    };
    
    next();
    
  } catch (error) {
    logger.debug('JWT verification failed:', {
      requestId: req.id,
      error: error.message,
      tokenPreview: token.substring(0, 20) + '...',
    });
    
    let errorCode = 'unauthorized';
    let message = 'Invalid token';
    
    if (error.name === 'TokenExpiredError') {
      errorCode = 'token_expired';
      message = 'Token has expired';
    } else if (error.name === 'JsonWebTokenError') {
      errorCode = 'invalid_token';
      message = 'Token is malformed';
    }
    
    res.status(401).json({ error: errorCode, message });
  }
}

// Service token middleware for internal communication
function requireServiceToken(req, res, next) {
  const { logger, config } = req.app.locals;
  const serviceToken = req.get('X-Service-Token');
  
  if (!serviceToken) {
    return res.status(401).json({
      error: 'unauthorized',
      message: 'Service token required',
    });
  }
  
  if (serviceToken !== config.flowise.serviceToken) {
    logger.warn('Invalid service token attempt:', {
      requestId: req.id,
      ip: req.ip,
      userAgent: req.get('User-Agent'),
    });
    
    return res.status(401).json({
      error: 'unauthorized', 
      message: 'Invalid service token',
    });
  }
  
  next();
}

module.exports = {
  requireAuth,
  requireServiceToken,
};

// In-memory rate limiting by operation
const bucketStore = new Map();

function rateByOperation(req, res, next) {
  const { op } = req.body;
  
  // Rate limits per operation
  const rateLimits = {
    'chat.send': { limit: 5, windowMs: 1000 },
    'player.save': { limit: 2, windowMs: 1000 },
    'inventory.list': { limit: 10, windowMs: 1000 },
    'inventory.update': { limit: 2, windowMs: 1000 },
    'progress.resume': { limit: 5, windowMs: 1000 },
  };
  
  const spec = rateLimits[op];
  if (!spec) return next(); // No rate limit for this op
  
  const now = Date.now();
  const key = `${op}:${req.user?.sub || req.ip}`;
  const bucket = bucketStore.get(key);
  
  if (!bucket || now > bucket.resetAt) {
    bucketStore.set(key, { count: 1, resetAt: now + spec.windowMs });
    return next();
  }
  
  if (bucket.count < spec.limit) {
    bucket.count++;
    return next();
  }
  
  const retry = Math.max(0, bucket.resetAt - now);
  res.setHeader('Retry-After', Math.ceil(retry / 1000));
  return res.status(429).json({
    error: 'rate_limited',
    op,
    retryMs: retry,
  });
}

module.exports = {
  requireAuth,
  requireServiceToken,
  rateByOperation,
};
