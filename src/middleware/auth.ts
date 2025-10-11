import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

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

export const authMiddleware = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'No valid authentication token provided'
      });
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix

    if (!process.env.JWT_SECRET) {
      console.error('JWT_SECRET not configured');
      return res.status(500).json({
        error: 'Internal Server Error',
        message: 'Authentication service not configured'
      });
    }

    // Verify JWT token
    const decoded = jwt.verify(token, process.env.JWT_SECRET) as any;

    // Get user from database to ensure they still exist and get latest data
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: {
        id: true,
        email: true,
        role: true,
        venueIds: true,
        lastActiveAt: true
      }
    });

    if (!user) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'User not found'
      });
    }

    // Update last active time only if it's been more than 1 hour
    // This prevents a database write on every request, improving performance
    const shouldUpdate = (Date.now() - user.lastActiveAt.getTime()) / (1000 * 60 * 60) >= 1;
    if (shouldUpdate) {
      // Fire and forget - don't await to avoid blocking the request
      prisma.user.update({
        where: { id: user.id },
        data: { lastActiveAt: new Date() }
      }).catch(err => console.error('Failed to update lastActiveAt:', err));
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