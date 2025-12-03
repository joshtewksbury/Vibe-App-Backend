import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import prisma from '../../lib/prisma';

export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    userId: string; // Alias for id
    email: string;
    role: string;
    venueIds: string[];
  };
}

// Alias for compatibility
export type AuthRequest = AuthenticatedRequest;

// Simple in-memory cache for user data to reduce database queries
// Cache user data for 5 minutes to balance freshness and performance
interface CachedUser {
  user: {
    id: string;
    email: string;
    role: string;
    venueIds: string[];
  };
  timestamp: number;
}

const userCache = new Map<string, CachedUser>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes in milliseconds

// Clean up old cache entries periodically
setInterval(() => {
  const now = Date.now();
  for (const [userId, cached] of userCache.entries()) {
    if (now - cached.timestamp > CACHE_TTL) {
      userCache.delete(userId);
    }
  }
}, 60 * 1000); // Clean every minute

export const authMiddleware = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const authHeader = req.headers.authorization;

    console.log('🔐 Auth middleware - Path:', req.path);
    console.log('🔐 Auth middleware - Method:', req.method);
    console.log('🔐 Auth middleware - Has auth header:', !!authHeader);

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      console.log('❌ Auth middleware - Invalid or missing Bearer token');
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'No valid authentication token provided'
      });
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix
    console.log('🔐 Auth middleware - Token length:', token.length);
    console.log('🔐 Auth middleware - Token preview:', token.substring(0, 20) + '...');

    // Check if this is the admin API key (for N8N/automation tools)
    if (process.env.ADMIN_API_KEY && token === process.env.ADMIN_API_KEY) {
      // Create a synthetic admin user for API key authentication
      req.user = {
        id: 'admin-api-key',
        userId: 'admin-api-key',
        email: 'api@vibeapp.com',
        role: 'ADMIN',
        venueIds: []
      };
      return next();
    }

    if (!process.env.JWT_SECRET) {
      console.error('JWT_SECRET not configured');
      return res.status(500).json({
        error: 'Internal Server Error',
        message: 'Authentication service not configured'
      });
    }

    // Verify JWT token
    console.log('🔐 Auth middleware - Verifying JWT token with secret');
    const decoded = jwt.verify(token, process.env.JWT_SECRET) as any;
    console.log('✅ Auth middleware - Token verified, userId:', decoded.userId);

    // Check cache first to avoid database query
    const now = Date.now();
    const cached = userCache.get(decoded.userId);
    console.log('🔐 Auth middleware - Cache check:', cached ? 'HIT' : 'MISS');

    let user: {
      id: string;
      email: string;
      role: string;
      venueIds: string[];
      lastActiveAt?: Date;
    };

    if (cached && (now - cached.timestamp) < CACHE_TTL) {
      // Use cached data
      user = cached.user;
    } else {
      // Get user from database
      const dbUser = await prisma.user.findUnique({
        where: { id: decoded.userId },
        select: {
          id: true,
          email: true,
          role: true,
          venueIds: true,
          lastActiveAt: true
        }
      });

      if (!dbUser) {
        console.log('❌ Auth middleware - User not found in database:', decoded.userId);
        return res.status(401).json({
          error: 'Unauthorized',
          message: 'User not found'
        });
      }

      console.log('✅ Auth middleware - User found in database:', dbUser.id);
      user = dbUser;

      // Update cache
      userCache.set(decoded.userId, {
        user: {
          id: dbUser.id,
          email: dbUser.email,
          role: dbUser.role,
          venueIds: dbUser.venueIds
        },
        timestamp: now
      });
    }

    // Update last active time only if it's been more than 1 hour
    // This prevents a database write on every request, improving performance
    // Only update if we have lastActiveAt (from database, not cache)
    if (user.lastActiveAt) {
      const shouldUpdate = (Date.now() - user.lastActiveAt.getTime()) / (1000 * 60 * 60) >= 1;
      if (shouldUpdate) {
        // Fire and forget - don't await to avoid blocking the request
        prisma.user.update({
          where: { id: user.id },
          data: { lastActiveAt: new Date() }
        }).catch(err => console.error('Failed to update lastActiveAt:', err));
      }
    }

    // Attach user to request
    req.user = {
      id: user.id,
      userId: user.id, // Alias for compatibility
      email: user.email,
      role: user.role,
      venueIds: user.venueIds
    };

    next();
  } catch (error) {
    if (error instanceof jwt.JsonWebTokenError) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Invalid token'
      });
    }

    if (error instanceof jwt.TokenExpiredError) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Token expired'
      });
    }

    console.error('Auth middleware error:', error);
    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'Authentication service error'
    });
  }
};

export const requireRole = (allowedRoles: string[]) => {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Authentication required'
      });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Insufficient permissions'
      });
    }

    next();
  };
};

export const requireVenueAccess = (venueIdParam: string = 'venueId') => {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Authentication required'
      });
    }

    // Admins have access to all venues
    if (req.user.role === 'ADMIN') {
      return next();
    }

    // Venue managers can only access their assigned venues
    if (req.user.role === 'VENUE_MANAGER') {
      const venueId = req.params[venueIdParam];

      if (!venueId) {
        return res.status(400).json({
          error: 'Bad Request',
          message: 'Venue ID required'
        });
      }

      if (!req.user.venueIds.includes(venueId)) {
        return res.status(403).json({
          error: 'Forbidden',
          message: 'No access to this venue'
        });
      }
    }

    next();
  };
};