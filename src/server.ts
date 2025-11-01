import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { config } from 'dotenv';
import * as Sentry from '@sentry/node';
import { authMiddleware } from './shared/middleware/auth';
import { rateLimitMiddleware } from './shared/middleware/rateLimiting';
import { errorHandler } from './shared/middleware/errorHandler';
import { auditLogger } from './shared/middleware/auditLogger';
import { tilePrecomputeService } from './services/tilePrecomputeService';
import { busynessScheduler } from './services/busynessScheduler';
import prisma from './lib/prisma';

// Module route imports (new modular structure)
import authRoutes from './modules/auth/auth.routes';
import friendsRoutes from './modules/friends/friends.routes';
import messagesRoutes from './modules/messaging/messaging.routes';

// Legacy route imports (to be refactored)
import venueRoutes from './routes/venues';
import venueImageRoutes from './routes/venueImages';
import userRoutes from './routes/users';
import feedRoutes from './routes/feed';
import heatmapRoutes from './routes/heatmap';
import imageRoutes from './routes/images';
import imageProxyRoutes from './routes/imageProxy';
import postsRoutes from './routes/posts';
import storiesRoutes from './routes/stories';
import accountSettingsRoutes from './routes/accountSettings';
import eventsRoutes from './routes/events';

// Load environment variables
config();

const app = express();
const PORT = process.env.PORT || 3000;

// Initialize Sentry for error tracking (production only)
if (process.env.NODE_ENV === 'production' && process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV,
    tracesSampleRate: 1.0, // Capture 100% of transactions for performance monitoring
    integrations: [
      // Enable Express integration for automatic request tracing
      Sentry.expressIntegration(),
    ],
  });
}

// Security middleware
app.use(helmet());

// CORS configuration
const corsOptions = {
  origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
  credentials: true,
  optionsSuccessStatus: 200
};
app.use(cors(corsOptions));

// Rate limiting
app.use(rateLimitMiddleware);

// HTTP Request Logging
if (process.env.NODE_ENV === 'production') {
  // Apache-style combined logs for production
  app.use(morgan('combined'));
} else {
  // Colored concise logs for development
  app.use(morgan('dev'));
}

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Serve static files from Railway volume
app.use('/uploads', express.static('/app/uploads'));

// Audit logging
app.use(auditLogger);

// Health check endpoint with database connectivity test
app.get('/health', async (req, res) => {
  try {
    // Test database connection
    await prisma.$queryRaw`SELECT 1`;

    res.status(200).json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      database: 'connected',
      environment: process.env.NODE_ENV || 'development'
    });
  } catch (error) {
    console.error('Health check failed:', error);
    res.status(503).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      database: 'disconnected',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// API routes
app.use('/auth', authRoutes);
app.use('/venues', venueRoutes); // Venues endpoint now public (no auth required)
app.use('/', venueImageRoutes); // Image routes include their own auth middleware
app.use('/image-proxy', imageProxyRoutes); // Image proxy for external images (Instagram, etc)
app.use('/users', userRoutes); // Users endpoint now public for search (individual routes can add auth as needed)
app.use('/feed', authMiddleware, feedRoutes);
app.use('/heatmap', heatmapRoutes); // Heat map routes include their own auth middleware
app.use('/friends', friendsRoutes); // Friends routes include their own auth middleware
app.use('/messages', messagesRoutes); // Messages routes include their own auth middleware
app.use('/posts', postsRoutes); // Posts routes include their own auth middleware
app.use('/stories', storiesRoutes); // Stories routes include their own auth middleware
app.use('/account', accountSettingsRoutes); // Account settings routes with auth
app.use('/events', eventsRoutes); // Events routes with auth

// Sentry error handler must be registered before other error handlers
if (process.env.NODE_ENV === 'production' && process.env.SENTRY_DSN) {
  app.use(Sentry.expressErrorHandler());
}

// Error handling
app.use(errorHandler);

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: 'Not Found',
    message: `Route ${req.originalUrl} not found`
  });
});

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('Received SIGINT. Graceful shutdown...');
  tilePrecomputeService.stopBackgroundRefresh();
  busynessScheduler.stop();
  await prisma.$disconnect();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('Received SIGTERM. Graceful shutdown...');
  tilePrecomputeService.stopBackgroundRefresh();
  busynessScheduler.stop();
  await prisma.$disconnect();
  process.exit(0);
});
app.use(imageRoutes);
// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🔗 Health check: http://localhost:${PORT}/health`);

  // Start background tile precomputation and refresh
  console.log('🔥 Starting heat map tile precomputation service...');
  tilePrecomputeService.startBackgroundRefresh();

  // Start live busyness data scheduler
  console.log('📊 Starting live busyness data scheduler (15-minute intervals)...');
  busynessScheduler.start();
});

export { app, prisma };