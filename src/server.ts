import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { config } from 'dotenv';
import { PrismaClient } from '@prisma/client';
import { authMiddleware } from './middleware/auth';
import { rateLimitMiddleware } from './middleware/rateLimiting';
import { errorHandler } from './middleware/errorHandler';
import { auditLogger } from './middleware/auditLogger';

// Route imports
import authRoutes from './routes/auth';
import venueRoutes from './routes/venues';
import venueImageRoutes from './routes/venueImages';
import userRoutes from './routes/users';
import feedRoutes from './routes/feed';
import heatmapRoutes from './routes/heatmap';
import imageRoutes from './routes/images';
import friendsRoutes from './routes/friends';
import messagesRoutes from './routes/messages';

// Load environment variables
config();

const app = express();
const prisma = new PrismaClient();
const PORT = process.env.PORT || 3000;

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

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Audit logging
app.use(auditLogger);

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// API routes
app.use('/auth', authRoutes);
app.use('/venues', venueRoutes); // Venues endpoint now public (no auth required)
app.use('/', venueImageRoutes); // Image routes include their own auth middleware
app.use('/users', userRoutes); // Users endpoint now public for search (individual routes can add auth as needed)
app.use('/feed', authMiddleware, feedRoutes);
app.use('/heatmap', heatmapRoutes); // Heat map routes include their own auth middleware
app.use('/friends', friendsRoutes); // Friends routes include their own auth middleware
app.use('/messages', messagesRoutes); // Messages routes include their own auth middleware

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
  await prisma.$disconnect();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('Received SIGTERM. Graceful shutdown...');
  await prisma.$disconnect();
  process.exit(0);
});
app.use(imageRoutes);
// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🔗 Health check: http://localhost:${PORT}/health`);
});

export { app, prisma };