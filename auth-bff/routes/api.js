const express = require('express');
const axios = require('axios');
const crypto = require('crypto');
const { ApiRpcSchema, validateBody } = require('../schemas/rpc');
const { requireAuth, rateByOperation } = require('../utils/auth');

const router = express.Router();

// ===== /api/rpc - Main API Endpoint =====
router.post('/rpc',
  requireAuth,
  validateBody(ApiRpcSchema),
  rateByOperation,
  async (req, res) => {
    const { pool, logger, config } = req.app.locals;
    const { op } = req.body;
    
    try {
      switch (op) {
        case 'chat.send':
          return await handleChatSend(req, res, { pool, logger, config });
        case 'progress.resume':
          return await handleProgressResume(req, res, { pool, logger, config });
        case 'player.save':
          return await handlePlayerSave(req, res, { pool, logger, config });
        case 'inventory.list':
          return await handleInventoryList(req, res, { pool, logger, config });
        case 'inventory.update':
          return await handleInventoryUpdate(req, res, { pool, logger, config });
        default:
          return res.status(400).json({
            error: 'op_unknown',
            message: `Unknown operation: ${op}`,
          });
      }
    } catch (error) {
      logger.error('API RPC error:', {
        requestId: req.id,
        userId: req.user.sub,
        op,
        error: error.message,
        stack: error.stack,
      });
      
      res.status(500).json({
        error: 'server_error',
        message: 'API operation failed',
      });
    }
  }
);

// ===== HANDLER FUNCTIONS =====

async function handleChatSend(req, res, { pool, logger, config }) {
  const { flowId, message, vars = {}, overrideConfig = {} } = req.body;
  
  if (!flowId || typeof message !== 'string') {
    return res.status(400).json({ error: 'bad_request', message: 'flowId and message are required' });
  }

  try {
    const payload = {
      question: message,
      variables: { ...vars, userId: req.user.sub },
      overrideConfig,
    };
    
    const flowiseUrl = process.env.FLOWISE_URL || 'http://flowise:3000';
    const url = `${flowiseUrl}/api/v1/prediction/${encodeURIComponent(flowId)}`;
    
    const response = await axios.post(url, payload, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 30000, // 30s timeout
    });
    
    return res.json({ ok: true, data: response.data });
    
  } catch (error) {
    logger.error('Flowise request failed:', { error: error.message, flowId });
    return res.status(502).json({ 
      error: 'flowise_upstream', 
      message: 'Chat service temporarily unavailable' 
    });
  }
}

async function handleProgressResume(req, res, { pool, logger }) {
  try {
    const result = await pool.query(
      'SELECT scene, flags, etag FROM player_saves WHERE user_id = $1 LIMIT 1',
      [req.user.sub]
    );
    
    if (result.rows.length === 0) {
      return res.json({ ok: true, hasSave: false });
    }
    
    const row = result.rows[0];
    return res.json({ 
      ok: true, 
      hasSave: true, 
      state: { 
        scene: row.scene, 
        flags: row.flags 
      }, 
      etag: row.etag 
    });
    
  } catch (error) {
    logger.error('Progress resume failed:', { error: error.message, userId: req.user.sub });
    return res.status(500).json({ error: 'db_error', message: 'Could not load progress' });
  }
}

async function handlePlayerSave(req, res, { pool, logger }) {
  const { state, etag } = req.body;
  
  if (!state || typeof state.scene !== 'string') {
    return res.status(400).json({ error: 'bad_request', message: 'state.scene is required' });
  }

  try {
    const nextETag = crypto.randomUUID();
    
    await pool.query(
      `INSERT INTO player_saves (user_id, scene, flags, etag, updated_at)
       VALUES ($1, $2, $3, $4, NOW())
       ON CONFLICT (user_id) 
       DO UPDATE SET 
         scene = EXCLUDED.scene, 
         flags = EXCLUDED.flags, 
         etag = EXCLUDED.etag, 
         updated_at = NOW()`,
      [req.user.sub, state.scene, state.flags || {}, nextETag]
    );
    
    return res.json({ ok: true, etag: nextETag });
    
  } catch (error) {
    logger.error('Player save failed:', { error: error.message, userId: req.user.sub });
    return res.status(500).json({ error: 'db_error', message: 'Could not save progress' });
  }
}

async function handleInventoryList(req, res, { pool, logger }) {
  const { q = '', limit = 25, cursor } = req.body;
  
  try {
    const L = Math.max(1, Math.min(100, limit));
    const params = [req.user.sub];
    let where = 'owner_id = $1';
    
    if (q) {
      params.push(`%${q}%`);
      where += ` AND name ILIKE $${params.length}`;
    }
    
    if (cursor) {
      params.push(cursor);
      where += ` AND id > $${params.length}`;
    }
    
    const sql = `SELECT id, name, qty FROM inventory WHERE ${where} ORDER BY id ASC LIMIT ${L + 1}`;
    const result = await pool.query(sql, params);
    const rows = result.rows;
    
    const nextCursor = rows.length > L ? rows[L].id : null;
    
    return res.json({ 
      ok: true, 
      items: rows.slice(0, L), 
      nextCursor 
    });
    
  } catch (error) {
    logger.error('Inventory list failed:', { error: error.message, userId: req.user.sub });
    return res.status(500).json({ error: 'db_error', message: 'Could not load inventory' });
  }
}

async function handleInventoryUpdate(req, res, { pool, logger }) {
  const { id, patch } = req.body;
  
  if (!id || !patch) {
    return res.status(400).json({ error: 'bad_request', message: 'id and patch are required' });
  }

  try {
    const fields = [];
    const vals = [];
    let idx = 2; // Start at 2 since user_id and id are positions 1 and 2
    
    if (patch.qty !== undefined) {
      fields.push(`qty = $${++idx}`);
      vals.push(patch.qty);
    }
    
    if (fields.length === 0) {
      return res.status(400).json({ error: 'nothing_to_update', message: 'No valid fields to update' });
    }
    
    const sql = `UPDATE inventory SET ${fields.join(', ')} WHERE owner_id = $1 AND id = $2 RETURNING id, name, qty`;
    const result = await pool.query(sql, [req.user.sub, id, ...vals]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'not_found', message: 'Item not found' });
    }
    
    return res.json({ ok: true, item: result.rows[0] });
    
  } catch (error) {
    logger.error('Inventory update failed:', { error: error.message, userId: req.user.sub, id });
    return res.status(500).json({ error: 'db_error', message: 'Could not update item' });
  }
}

module.exports = router;
