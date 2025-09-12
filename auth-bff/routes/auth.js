const express = require("express");
const {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} = require('@simplewebauthn/server');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const fetch = require('node-fetch');
const { AuthRpcSchema, validateBody } = require('../schemas/rpc');

const router = express.Router();

function bufferToBase64url(buffer) {
  return Buffer.from(buffer).toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

router.post('/rpc', validateBody(AuthRpcSchema), async (req, res) => {
  const { pool, logger, config, challengeCache } = req.app.locals;
  const { op } = req.body;
  
  try {
    switch (op) {
      case 'webauthn.register.start':
        return await handleRegisterStart(req, res, { config, challengeCache });
      case 'webauthn.register.finish':
        return await handleRegisterFinish(req, res, { pool, logger, config, challengeCache });
      case 'webauthn.login.start':
        return await handleLoginStart(req, res, { config, challengeCache });
      case 'webauthn.login.finish':
        return await handleLoginFinish(req, res, { pool, logger, config, challengeCache });
      case 'auth.validate':
        return await handleAuthValidate(req, res, { pool, logger, config });
      case 'flowise.validate':
        return await handleFlowiseValidate(req, res, { pool, logger, config });
      default:
        return res.status(400).json({
          error: 'op_unknown',
          message: `Unknown operation: ${op}`,
        });
    }
  } catch (error) {
    logger.error('Auth RPC error:', { 
      requestId: req.id, 
      op, 
      error: error.message, 
      stack: error.stack 
    });
    
    res.status(500).json({
      error: 'server_error',
      message: 'Authentication operation failed',
    });
  }
});

async function handleRegisterStart(req, res, { config, challengeCache }) {
  const { userId } = req.body;
  
  const options = await generateRegistrationOptions({
    rpName: config.webauthn.rpName,
    rpID: config.webauthn.rpId,
    userID: Buffer.from(userId, 'utf8'),
    userName: `user_${userId}`,
    userDisplayName: 'Mana User',
    timeout: 60000,
    attestationType: 'none',
    authenticatorSelection: {
      userVerification: 'preferred',
      residentKey: 'preferred',
    },
  });
  
  challengeCache.set(`reg:${userId}`, options.challenge, 300);
  
  res.json({
    ok: true,
    publicKey: options,
  });
}

async function handleRegisterFinish(req, res, { pool, logger, config, challengeCache }) {
  const { userId, attestation } = req.body;
  
  const expectedChallenge = challengeCache.get(`reg:${userId}`);
  if (!expectedChallenge) {
    return res.status(400).json({
      error: 'challenge_expired',
      message: 'Registration challenge expired or not found',
    });
  }
  
  try {
    const verification = await verifyRegistrationResponse({
      response: attestation,
      expectedChallenge,
      expectedOrigin: config.webauthn.origin,
      expectedRPID: config.webauthn.rpId,
    });
    
    if (!verification.verified) {
      return res.status(400).json({
        error: 'attestation_failed',
        message: 'WebAuthn attestation verification failed',
      });
    }
    
    const { credentialID, credentialPublicKey, counter } = verification.registrationInfo;
    
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      await client.query(
        'INSERT INTO users (id, created_at) VALUES ($1, NOW()) ON CONFLICT (id) DO NOTHING',
        [userId]
      );
      
      await client.query(`
        INSERT INTO webauthn_credentials (
          credential_id, user_id, public_key, counter, transports, created_at
        ) VALUES ($1, $2, $3, $4, $5, NOW())
        ON CONFLICT (credential_id) DO UPDATE SET 
          counter = EXCLUDED.counter,
          updated_at = NOW()
      `, [
        credentialID,
        userId,
        Buffer.from(credentialPublicKey).toString('base64'),
        counter,
        attestation.response?.transports || [],
      ]);
      
      await client.query('COMMIT');
      
      challengeCache.del(`reg:${userId}`);
      
      // Generate JWT token for new user
      const token = jwt.sign(
        {
          sub: userId,
          iss: 'mana-auth',
          aud: 'mana-api',
          iat: Math.floor(Date.now() / 1000),
        },
        config.jwt.secret,
        { expiresIn: `${config.jwt.ttl}s` }
      );
      
      logger.info('User registered successfully', {
        requestId: req.id,
        userId,
        credentialId: bufferToBase64url(credentialID),
      });
      
      res.json({ 
        ok: true,
        access_token: token,
        token_type: 'Bearer',
        expires_in: config.jwt.ttl,
        user: {
          id: userId,
          email_verified: false,
          created_at: new Date().toISOString(),
        },
      });
      
    } catch (dbError) {
      await client.query('ROLLBACK');
      throw dbError;
    } finally {
      client.release();
    }
    
  } catch (error) {
    logger.error('Registration verification failed:', {
      requestId: req.id,
      userId,
      error: error.message,
    });
    
    res.status(400).json({
      error: 'registration_failed',
      message: 'Could not complete registration',
    });
  }
}

async function handleLoginStart(req, res, { config, challengeCache }) {
  const nonce = crypto.randomUUID();
  
  const options = await generateAuthenticationOptions({
    rpID: config.webauthn.rpId,
    userVerification: 'preferred',
    timeout: 60000,
  });
  
  challengeCache.set(`auth:${nonce}`, options.challenge, 300);
  
  res.json({
    ok: true,
    publicKey: options,
    nonce,
  });
}

async function handleLoginFinish(req, res, { pool, logger, config, challengeCache }) {
  const { assertion, nonce } = req.body;
  
  const expectedChallenge = challengeCache.get(`auth:${nonce || 'default'}`);
  if (!expectedChallenge) {
    return res.status(400).json({
      error: 'challenge_expired',
      message: 'Authentication challenge expired or not found',
    });
  }
  
  try {
    const credentialId = new Uint8Array(assertion.rawId);
    
    const credResult = await pool.query(`
      SELECT 
        wc.credential_id,
        wc.user_id,
        wc.public_key,
        wc.counter,
        u.email_verified
      FROM webauthn_credentials wc
      JOIN users u ON u.id = wc.user_id
      WHERE wc.credential_id = $1 AND wc.revoked = false
    `, [credentialId]);
    
    if (credResult.rows.length === 0) {
      return res.status(401).json({
        error: 'credential_not_found',
        message: 'Unknown credential',
      });
    }
    
    const credential = credResult.rows[0];
    
    const verification = await verifyAuthenticationResponse({
      response: assertion,
      expectedChallenge,
      expectedOrigin: config.webauthn.origin,
      expectedRPID: config.webauthn.rpId,
      authenticator: {
        credentialID: credential.credential_id,
        credentialPublicKey: Buffer.from(credential.public_key, 'base64'),
        counter: credential.counter,
      },
    });
    
    if (!verification.verified) {
      return res.status(401).json({
        error: 'assertion_failed',
        message: 'WebAuthn assertion verification failed',
      });
    }
    
    await pool.query(
      'UPDATE webauthn_credentials SET counter = $1, updated_at = NOW() WHERE credential_id = $2',
      [verification.authenticationInfo.newCounter, credentialId]
    );
    
    const [saveCheck, userInfo] = await Promise.all([
      pool.query('SELECT 1 FROM player_saves WHERE user_id = $1 LIMIT 1', [credential.user_id]),
      pool.query('SELECT email_verified, created_at FROM users WHERE id = $1', [credential.user_id]),
    ]);
    
    const token = jwt.sign(
      {
        sub: credential.user_id,
        iss: 'mana-auth',
        aud: 'mana-api',
        iat: Math.floor(Date.now() / 1000),
      },
      config.jwt.secret,
      { expiresIn: `${config.jwt.ttl}s` }
    );
    
    challengeCache.del(`auth:${nonce || 'default'}`);
    
    logger.info('User authenticated successfully', {
      requestId: req.id,
      userId: credential.user_id,
      credentialId: bufferToBase64url(credentialId),
    });
    
    res.json({
      ok: true,
      access_token: token,
      token_type: 'Bearer',
      expires_in: config.jwt.ttl,
      user: {
        id: credential.user_id,
        email_verified: userInfo.rows[0]?.email_verified || false,
        created_at: userInfo.rows[0]?.created_at,
      },
      hasSave: saveCheck.rows.length > 0,
    });
    
  } catch (error) {
    logger.error('Authentication verification failed:', {
      requestId: req.id,
      error: error.message,
      stack: error.stack,
    });
    
    res.status(401).json({
      error: 'authentication_failed',
      message: 'Could not complete authentication',
    });
  }
}

async function handleAuthValidate(req, res, { pool, logger, config }) {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      error: 'token_missing',
      message: 'Authorization token required',
    });
  }
  
  const token = authHeader.slice(7);
  
  try {
    // Verify JWT token
    const decoded = jwt.verify(token, config.jwt.secret);
    const userId = decoded.sub;
    
    // Check if user exists in database
    const userResult = await pool.query(
      'SELECT id, email_verified, created_at FROM users WHERE id = $1',
      [userId]
    );
    
    if (userResult.rows.length === 0) {
      return res.status(401).json({
        error: 'user_not_found',
        message: 'User account no longer exists',
      });
    }
    
    const user = userResult.rows[0];
    
    // Check if user has valid credentials
    const credResult = await pool.query(
      'SELECT COUNT(*) as count FROM webauthn_credentials WHERE user_id = $1 AND revoked = false',
      [userId]
    );
    
    if (credResult.rows[0].count === 0) {
      return res.status(401).json({
        error: 'credentials_revoked',
        message: 'User credentials have been revoked',
      });
    }
    
    // Check for game save
    const saveResult = await pool.query(
      'SELECT COUNT(*) as count FROM player_saves WHERE user_id = $1',
      [userId]
    );
    
    logger.info('Token validation successful', {
      requestId: req.id,
      userId,
    });
    
    res.json({
      ok: true,
      user: {
        id: user.id,
        email_verified: user.email_verified,
        created_at: user.created_at,
      },
      hasSave: saveResult.rows[0].count > 0,
    });
    
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        error: 'token_invalid',
        message: 'Invalid authorization token',
      });
    }
    
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        error: 'token_expired',
        message: 'Authorization token has expired',
      });
    }
    
    logger.error('Token validation failed:', {
      requestId: req.id,
      error: error.message,
      stack: error.stack,
    });
    
    res.status(500).json({
      error: 'validation_failed',
      message: 'Could not validate token',
    });
  }
}

async function handleFlowiseValidate(req, res, { pool, logger, config }) {
  const { userId } = req.body;
  
  try {
    // Llamar al agentflow de Flowise con el userId
    const flowiseUrl = process.env.FLOWISE_URL || 'http://flowise:3000';
    const flowId = process.env.FLOWISE_FLOW_ID || 'ec813128-dbbc-4ffd-b834-cc15a361ccb1'; // ID del agentflow de debug
    
    const flowiseResponse = await fetch(`${flowiseUrl}/api/v1/prediction/${flowId}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        question: userId || '', // Enviar userId como question (input)
        overrideConfig: {
          vars: {
            userId: userId || ''
          }
        }
      })
    });
    
    if (!flowiseResponse.ok) {
      throw new Error(`Flowise responded with status: ${flowiseResponse.status}`);
    }
    
    const flowiseResult = await flowiseResponse.text();
    let parsedResult;
    
    try {
      parsedResult = JSON.parse(flowiseResult);
    } catch (parseError) {
      // Si no es JSON válido, retornar error
      logger.error('Flowise returned invalid JSON:', {
        requestId: req.id,
        userId,
        response: flowiseResult,
      });
      
      return res.status(500).json({
        error: 'flowise_invalid_response',
        message: 'Flowise returned invalid response format',
      });
    }
    
    logger.info('Flowise validation completed:', {
      requestId: req.id,
      userId,
      result: parsedResult,
    });
    
    res.json({
      ok: true,
      result: parsedResult,
    });
    
  } catch (error) {
    logger.error('Flowise validation failed:', {
      requestId: req.id,
      userId,
      error: error.message,
      stack: error.stack,
    });
    
    res.status(500).json({
      error: 'flowise_validation_failed',
      message: 'Could not validate user with Flowise',
    });
  }
}

module.exports = router;