"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireVenueAccess = exports.requireRole = exports.authMiddleware = void 0;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const client_1 = require("@prisma/client");
const prisma = new client_1.PrismaClient();
const authMiddleware = async (req, res, next) => {
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
        const decoded = jsonwebtoken_1.default.verify(token, process.env.JWT_SECRET);
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
        // Update last active time
        await prisma.user.update({
            where: { id: user.id },
            data: { lastActiveAt: new Date() }
        });
        // Attach user to request
        req.user = {
            id: user.id,
            email: user.email,
            role: user.role,
            venueIds: user.venueIds
        };
        next();
    }
    catch (error) {
        if (error instanceof jsonwebtoken_1.default.JsonWebTokenError) {
            return res.status(401).json({
                error: 'Unauthorized',
                message: 'Invalid token'
            });
        }
        if (error instanceof jsonwebtoken_1.default.TokenExpiredError) {
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
exports.authMiddleware = authMiddleware;
const requireRole = (allowedRoles) => {
    return (req, res, next) => {
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
exports.requireRole = requireRole;
const requireVenueAccess = (venueIdParam = 'venueId') => {
    return (req, res, next) => {
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
exports.requireVenueAccess = requireVenueAccess;
//# sourceMappingURL=auth.js.map