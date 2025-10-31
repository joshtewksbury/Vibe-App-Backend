import { Request, Response, NextFunction } from 'express';
import { RateLimiterMemory } from 'rate-limiter-flexible';

// Different rate limiters for different endpoints
const authLimiter = new RateLimiterMemory({
  keyPrefix: 'auth',
  points: 5, // Number of requests
  duration: 900, // Per 15 minutes
  blockDuration: 900, // Block for 15 minutes if limit exceeded
});

const apiLimiter = new RateLimiterMemory({
  keyPrefix: 'api',
  points: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '500'), // Increased from 100 to 500
  duration: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000') / 1000, // Convert to seconds (15 min)
  blockDuration: 60, // Block for 1 minute if limit exceeded
});

// Separate rate limiter for messaging - needs higher limits due to real-time nature
const messagingLimiter = new RateLimiterMemory({
  keyPrefix: 'messaging',
  points: 200, // 200 requests per minute (very generous)
  duration: 60, // Per minute
  blockDuration: 10, // Block for 10 seconds if exceeded (short block)
});

// Separate rate limiter for friends endpoints - polling every 5 seconds needs higher limits
const friendsLimiter = new RateLimiterMemory({
  keyPrefix: 'friends',
  points: 300, // 300 requests per 15 minutes (enough for polling + actions)
  duration: 900, // Per 15 minutes
  blockDuration: 30, // Block for 30 seconds if exceeded
});

const createAccountLimiter = new RateLimiterMemory({
  keyPrefix: 'create_account',
  points: 3, // Number of requests
  duration: 3600, // Per hour
  blockDuration: 3600, // Block for 1 hour
});

export const rateLimitMiddleware = (req: Request, res: Response, next: NextFunction) => {
  const getClientKey = (req: Request): string => {
    // Use IP address as the key, but in production you might want to use user ID for authenticated requests
    return req.ip || req.connection.remoteAddress || 'unknown';
  };

  const key = getClientKey(req);

  // Exempt heatmap tile requests from rate limiting - tiles are cached and need rapid loading
  if (req.path.startsWith('/heatmap/tiles/')) {
    return next();
  }

  // Apply messaging rate limiter to messaging endpoints (higher limits)
  if (req.path.startsWith('/messages/')) {
    messagingLimiter.consume(key)
      .then(() => {
        next();
      })
      .catch((rejRes) => {
        const secs = Math.round(rejRes.msBeforeNext / 1000) || 1;
        res.set('Retry-After', String(secs));
        return res.status(429).json({
          error: 'Too Many Requests',
          message: 'Too many messages sent. Please wait a moment.',
          retryAfter: secs
        });
      });
    return; // Important: return to prevent applying other rate limiters
  }

  // Apply friends rate limiter to friends endpoints (higher limits for polling)
  if (req.path.startsWith('/friends/')) {
    friendsLimiter.consume(key)
      .then(() => {
        next();
      })
      .catch((rejRes) => {
        const secs = Math.round(rejRes.msBeforeNext / 1000) || 1;
        res.set('Retry-After', String(secs));
        return res.status(429).json({
          error: 'Too Many Requests',
          message: 'Too many friend requests. Please wait a moment.',
          retryAfter: secs
        });
      });
    return; // Important: return to prevent applying other rate limiters
  }

  // Apply different rate limits based on the endpoint
  if (req.path.startsWith('/auth/signin') || req.path.startsWith('/auth/signout')) {
    authLimiter.consume(key)
      .then(() => {
        next();
      })
      .catch((rejRes) => {
        const secs = Math.round(rejRes.msBeforeNext / 1000) || 1;
        res.set('Retry-After', String(secs));
        return res.status(429).json({
          error: 'Too Many Requests',
          message: 'Too many authentication attempts. Please try again later.',
          retryAfter: secs
        });
      });
  } else if (req.path.startsWith('/auth/signup')) {
    createAccountLimiter.consume(key)
      .then(() => {
        next();
      })
      .catch((rejRes) => {
        const secs = Math.round(rejRes.msBeforeNext / 1000) || 1;
        res.set('Retry-After', String(secs));
        return res.status(429).json({
          error: 'Too Many Requests',
          message: 'Too many account creation attempts. Please try again later.',
          retryAfter: secs
        });
      });
  } else {
    // General API rate limiting
    apiLimiter.consume(key)
      .then(() => {
        next();
      })
      .catch((rejRes) => {
        const secs = Math.round(rejRes.msBeforeNext / 1000) || 1;
        res.set('Retry-After', String(secs));
        return res.status(429).json({
          error: 'Too Many Requests',
          message: 'API rate limit exceeded. Please slow down.',
          retryAfter: secs
        });
      });
  }
};