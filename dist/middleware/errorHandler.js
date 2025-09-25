"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.asyncHandler = exports.createError = exports.errorHandler = void 0;
const client_1 = require("@prisma/client");
const errorHandler = (error, req, res, next) => {
    // Log error for debugging
    console.error('Error occurred:', {
        message: error.message,
        stack: error.stack,
        url: req.url,
        method: req.method,
        ip: req.ip,
        userAgent: req.get('User-Agent')
    });
    // Handle Prisma errors
    if (error instanceof client_1.Prisma.PrismaClientKnownRequestError) {
        switch (error.code) {
            case 'P2002':
                return res.status(409).json({
                    error: 'Conflict',
                    message: 'A record with this data already exists'
                });
            case 'P2025':
                return res.status(404).json({
                    error: 'Not Found',
                    message: 'The requested record was not found'
                });
            case 'P2003':
                return res.status(400).json({
                    error: 'Bad Request',
                    message: 'Foreign key constraint failed'
                });
            default:
                return res.status(500).json({
                    error: 'Database Error',
                    message: 'A database error occurred'
                });
        }
    }
    // Handle Prisma validation errors
    if (error instanceof client_1.Prisma.PrismaClientValidationError) {
        return res.status(400).json({
            error: 'Validation Error',
            message: 'Invalid data provided'
        });
    }
    // Handle JWT errors (if not caught by auth middleware)
    if (error.name === 'JsonWebTokenError') {
        return res.status(401).json({
            error: 'Unauthorized',
            message: 'Invalid token'
        });
    }
    if (error.name === 'TokenExpiredError') {
        return res.status(401).json({
            error: 'Unauthorized',
            message: 'Token expired'
        });
    }
    // Handle validation errors from Joi
    if (error.name === 'ValidationError') {
        return res.status(400).json({
            error: 'Validation Error',
            message: error.message
        });
    }
    // Handle custom application errors
    if (error.isOperational && error.statusCode) {
        return res.status(error.statusCode).json({
            error: 'Application Error',
            message: error.message
        });
    }
    // Default to 500 server error
    return res.status(500).json({
        error: 'Internal Server Error',
        message: process.env.NODE_ENV === 'production'
            ? 'Something went wrong'
            : error.message
    });
};
exports.errorHandler = errorHandler;
const createError = (message, statusCode = 500) => {
    const error = new Error(message);
    error.statusCode = statusCode;
    error.isOperational = true;
    return error;
};
exports.createError = createError;
const asyncHandler = (fn) => {
    return (req, res, next) => {
        Promise.resolve(fn(req, res, next)).catch(next);
    };
};
exports.asyncHandler = asyncHandler;
//# sourceMappingURL=errorHandler.js.map