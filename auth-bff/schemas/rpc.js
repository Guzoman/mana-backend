const { z } = require('zod');

// Auth RPC Schemas
const AuthRpcSchema = z.discriminatedUnion('op', [
  z.object({
    op: z.literal('webauthn.register.start'),
    userHint: z.string().optional().nullable(),
  }).strip(),
  z.object({
    op: z.literal('webauthn.register.finish'),
    userId: z.string().uuid(),
    attestation: z.unknown(),
  }).strip(),
  z.object({
    op: z.literal('webauthn.login.start'),
  }).strip(),
  z.object({
    op: z.literal('webauthn.login.finish'),
    assertion: z.unknown(),
    nonce: z.string().min(8).optional(),
  }).strip(),
]);

// API RPC Schemas
const ApiRpcSchema = z.discriminatedUnion('op', [
  z.object({
    op: z.literal('chat.send'),
    flowId: z.string().min(1),
    message: z.string().min(1).max(2000),
    vars: z.record(z.any()).default({}),
    overrideConfig: z.record(z.any()).default({}),
  }).strict(),
  z.object({ op: z.literal('progress.resume') }).strict(),
  z.object({
    op: z.literal('player.save'),
    state: z.object({
      scene: z.string().min(1),
      flags: z.record(z.any()).default({}),
    }).strict(),
    etag: z.string().optional(),
  }).strict(),
  z.object({
    op: z.literal('inventory.list'),
    q: z.string().max(100).optional().default(''),
    limit: z.coerce.number().int().min(1).max(100).default(25),
    cursor: z.string().optional(),
  }).strict(),
  z.object({
    op: z.literal('inventory.get'),
    id: z.string().min(1),
  }).strict(),
  z.object({
    op: z.literal('inventory.update'),
    id: z.string().min(1),
    patch: z.object({
      qty: z.coerce.number().int().min(0).optional(),
    }).strict(),
  }).strict(),
  z.object({ op: z.literal('stats.get') }).strict(),
  z.object({
    op: z.literal('event.track'),
    name: z.string().min(1),
    props: z.record(z.any()).default({}),
  }).strict(),
]);

// Account RPC Schemas
const AccountRpcSchema = z.discriminatedUnion('op', [
  z.object({
    op: z.literal('account.email.start'),
    email: z.string().email().min(3).max(254),
  }).strict(),
  z.object({
    op: z.literal('account.preferences.update'),
    preferences: z.object({
      language: z.enum(['en', 'es']).optional(),
      theme: z.enum(['light', 'dark', 'auto']).optional(),
      notifications: z.boolean().optional(),
    }).strict(),
  }).strict(),
]);

// Validation middleware
function validateBody(schema) {
  return (req, res, next) => {
    try {
      const result = schema.safeParse(req.body);
      if (!result.success) {
        return res.status(400).json({
          error: 'bad_request',
          message: 'Invalid request body',
          issues: result.error.issues.map(issue => ({
            path: issue.path.join('.'),
            message: issue.message,
            expected: issue.expected,
            received: issue.received,
          })),
        });
      }
      req.body = result.data;
      next();
    } catch (error) {
      req.app.locals.logger.error('Schema validation error:', error);
      res.status(500).json({
        error: 'server_error',
        message: 'Validation failed',
      });
    }
  };
}

module.exports = {
  AuthRpcSchema,
  ApiRpcSchema, 
  AccountRpcSchema,
  validateBody,
};
