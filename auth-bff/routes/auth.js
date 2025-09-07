const express = require("express");
const {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} = require('@simplewebauthn/server');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
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
        'INSERT INTO users (id, created_at) VALUES (, NOW()) ON CONFLICT (id) DO NOTHING',
        [userId]
      );
      
      await client.query(`
        INSERT INTO webauthn_credentials (
          credential_id, user_id, public_key, counter, transports, created_at
        ) VALUES (, , , , , NOW())
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
      
      logger.info('User registered successfully', {
        requestId: req.id,
        userId,
        credentialId: bufferToBase64url(credentialID),
      });
      
      res.json({ ok: true });
      
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
      WHERE wc.credential_id =  AND wc.revoked = false
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
      'UPDATE webauthn_credentials SET counter = , updated_at = NOW() WHERE credential_id = ',
      [verification.authenticationInfo.newCounter, credentialId]
    );
    
    const [saveCheck, userInfo] = await Promise.all([
      pool.query('SELECT 1 FROM player_saves WHERE user_id =  LIMIT 1', [credential.user_id]),
      pool.query('SELECT email_verified FROM users WHERE id = ', [credential.user_id]),
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
      hasSave: saveCheck.rows.length > 0,
      hasEmailVerified: userInfo.rows[0]?.email_verified === true,
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

module.exports = router;
