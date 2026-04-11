import rateLimit from 'express-rate-limit';

/**
 * Middleware de Rate Limiting
 * Protege a rota /api/chat contra abuso e uso excessivo.
 */
export const chatRateLimiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000', 10),
  max: parseInt(process.env.RATE_LIMIT_MAX || '10', 10),
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'rate_limit_exceeded',
    message:
      'Você enviou muitas perguntas em pouco tempo. Aguarde um momento antes de continuar.',
    retryAfter: 60,
  },
  handler: (req, res, next, options) => {
    res.status(429).json(options.message);
  },
  // Ignora rate limit para /api/reload-docs (rota administrativa interna)
  skip: (req) => req.path === '/api/reload-docs',
});
