import { Request, Response, NextFunction } from 'express';
import { PrismaClient } from '@prisma/client';
import { AuthenticatedRequest } from './auth';

const prisma = new PrismaClient();

// Actions that should be audited
const AUDITABLE_ACTIONS = [
  'POST', 'PUT', 'PATCH', 'DELETE'
];

// Sensitive endpoints that should always be audited
const SENSITIVE_ENDPOINTS = [
  '/auth',
  '/venues',
  '/users'
];

export const auditLogger = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  // Only audit certain actions and endpoints
  const shouldAudit = AUDITABLE_ACTIONS.includes(req.method) ||
    SENSITIVE_ENDPOINTS.some(endpoint => req.path.startsWith(endpoint));

  if (!shouldAudit) {
    return next();
  }

  // Store original res.json to intercept response
  const originalJson = res.json;
  let responseBody: any;
  let statusCode: number;

  res.json = function(body: any) {
    responseBody = body;
    statusCode = res.statusCode;
    return originalJson.call(this, body);
  };

  // Continue with request processing
  next();

  // After response is sent, log to audit trail
  res.on('finish', async () => {
    try {
      const action = `${req.method} ${req.path}`;
      const resource = extractResourceFromPath(req.path);
      const resourceId = extractResourceId(req.params);

      // Don't log sensitive data like passwords
      const sanitizedBody = sanitizeRequestBody(req.body);

      const auditData = {
        userId: req.user?.id || null,
        action,
        resource,
        resourceId,
        metadata: {
          method: req.method,
          path: req.path,
          statusCode,
          requestBody: sanitizedBody,
          query: req.query,
          params: req.params,
          success: statusCode < 400
        },
        ipAddress: req.ip || req.connection.remoteAddress,
        userAgent: req.get('User-Agent')
      };

      await prisma.auditLog.create({
        data: auditData
      });
    } catch (error) {
      // Don't fail the request if audit logging fails
      console.error('Failed to create audit log:', error);
    }
  });
};

function extractResourceFromPath(path: string): string {
  const segments = path.split('/').filter(Boolean);
  if (segments.length === 0) return 'unknown';

  // Return the first meaningful segment
  return segments[0];
}

function extractResourceId(params: any): string | null {
  // Common ID parameter names
  const idKeys = ['id', 'venueId', 'userId', 'dealId', 'eventId', 'postId'];

  for (const key of idKeys) {
    if (params[key]) {
      return params[key];
    }
  }

  return null;
}

function sanitizeRequestBody(body: any): any {
  if (!body || typeof body !== 'object') {
    return body;
  }

  const sensitiveFields = [
    'password',
    'passwordHash',
    'token',
    'refreshToken',
    'secret',
    'apiKey'
  ];

  const sanitized = { ...body };

  for (const field of sensitiveFields) {
    if (sanitized[field]) {
      sanitized[field] = '[REDACTED]';
    }
  }

  return sanitized;
}