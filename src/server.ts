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

// Restore venue icons from Cloudinary (admin use only)
app.post('/admin/restore-venue-icons', async (req, res) => {
  try {
    // Security: Only allow with correct admin key
    const adminKey = req.headers['x-admin-key'];
    if (adminKey !== process.env.ADMIN_SEED_KEY) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    console.log('🔄 Starting venue icon restoration...');

    const { v2: cloudinary } = require('cloudinary');

    // Configure Cloudinary
    cloudinary.config({
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
      api_key: process.env.CLOUDINARY_API_KEY,
      api_secret: process.env.CLOUDINARY_API_SECRET,
    });

    // Venue ID to Name mapping (from venue_icon_upload_results.json)
    const venueMapping: Record<string, string> = {
      '51': 'Indooroopilly Hotel', '40': 'Alfred & Constance', '10': 'Archive',
      '28': 'Bar Pacino Brisbane', '12': 'Birdees', '6': 'Black Bear Lodge',
      '25': 'Blackbird Brisbane', '56': 'Cloudland', '65': 'Darling & Co.',
      '55': 'Death and Taxes Brisbane', '33': 'Eclipse Nightclub', '60': 'Empire Hotel',
      '47': 'Enigma', '43': 'Felons Brewing Co', '26': 'Friday\'s Riverside Brisbane',
      '48': 'Greaser', '1': 'Hey Chica', '5': 'Honky Tonks',
      '29': 'Hotel West End', '2': 'Iris Rooftop', '14': 'Johnny Ringo\'s',
      '39': 'Jubilee Hotel', '53': 'Lefty\'s Music Hall', '38': 'The Lobby Bar',
      '15': 'Maya Rooftop Bar', '37': 'Mr Percival\'s', '64': 'Netherworld',
      '31': 'The Newmarket Hotel', '16': 'Osbourne Hotel', '45': 'Pawn & Co Brisbane',
      '11': 'Prohibition', '49': 'QA Hotel', '17': 'Regatta Hotel',
      '34': 'Retros', '18': 'Rics Bar', '27': 'Riverbar & Kitchen Brisbane',
      '24': 'Riverland Brisbane', '19': 'Royal Exchange Hotel', '13': 'Sixes and Sevens',
      '20': 'Sixteen Antlers', '21': 'Soko', '7': 'Su Casa',
      '59': 'Summer House', '22': 'The Tax Office', '4': 'The Beat',
      '9': 'The Boundary', '54': 'The Caxton Hotel', '50': 'The Magee',
      '3': 'The MET', '30': 'The Normanby Hotel', '52': 'The Paddo',
      '41': 'The Star Brisbane', '36': 'The Tivoli', '35': 'The Triffid',
      '58': 'The Wickham', '23': 'Warehouse 25', '46': 'Wonderland',
      '44': 'El Camino Cantina Brisbane', '8': 'The Prince Consort Hotel',
      '63': 'Brooklyn Standard', '42': 'Pig N Whistle', '57': 'The Story Bridge Hotel'
    };

    // Normalize name for matching
    const normalizeName = (name: string) => name.toLowerCase().replace(/[^\w\s]/g, '').replace(/\s+/g, ' ').trim();

    // Get all venues
    const venues = await prisma.venue.findMany({
      select: { id: true, name: true }
    });

    let updatedCount = 0;
    const results: any[] = [];

    for (const [venueId, venueName] of Object.entries(venueMapping)) {
      const normalizedMappingName = normalizeName(venueName);

      // Find matching venue
      const matchingVenue = venues.find(v => {
        const normalizedVenueName = normalizeName(v.name);
        return normalizedVenueName === normalizedMappingName ||
               normalizedVenueName.includes(normalizedMappingName) ||
               normalizedMappingName.includes(normalizedVenueName);
      });

      if (matchingVenue) {
        // Generate Cloudinary URL
        const cloudinaryUrl = cloudinary.url(`venue-icons/${venueId}`, {
          secure: true,
          transformation: [
            { width: 512, height: 512, crop: 'limit' },
            { quality: 'auto', fetch_format: 'auto' }
          ]
        });

        // Update venue
        await prisma.venue.update({
          where: { id: matchingVenue.id },
          data: { venueIconUrl: cloudinaryUrl }
        });

        updatedCount++;
        results.push({
          venue: matchingVenue.name,
          iconId: venueId,
          url: cloudinaryUrl
        });
      }
    }

    console.log(`✅ Successfully restored ${updatedCount} venue icons!`);

    res.status(200).json({
      success: true,
      message: 'Venue icons restored successfully',
      statistics: {
        totalMappings: Object.keys(venueMapping).length,
        updated: updatedCount
      },
      results: results.slice(0, 10) // Return first 10 as sample
    });

  } catch (error) {
    console.error('❌ Error restoring venue icons:', error);
    res.status(500).json({
      error: 'Icon restoration failed',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Restore venue banner images from backup (admin use only)
app.post('/admin/restore-venue-images', async (req, res) => {
  try {
    // Security: Only allow with correct admin key
    const adminKey = req.headers['x-admin-key'];
    if (adminKey !== process.env.ADMIN_SEED_KEY) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    console.log('🔄 Starting venue image restoration from backup...');

    const fs = require('fs');
    const path = require('path');

    // Read backup file with images
    const backupPath = path.join(process.cwd(), 'venues.json.backup_20251112_101202');

    if (!fs.existsSync(backupPath)) {
      return res.status(404).json({
        error: 'Backup file not found',
        message: 'venues.json.backup_20251112_101202 does not exist'
      });
    }

    const backupData = JSON.parse(fs.readFileSync(backupPath, 'utf-8'));
    const backupVenues = backupData.venues;

    // Filter venues that have images
    const venuesWithImages = backupVenues.filter((v: any) => v.images && v.images.length > 0);

    console.log(`Found ${venuesWithImages.length} venues with images in backup`);

    // Normalize name for matching
    const normalizeName = (name: string) => name.toLowerCase().replace(/[^\w\s]/g, '').replace(/\s+/g, ' ').trim();

    // Get all venues from database
    const dbVenues = await prisma.venue.findMany({
      select: { id: true, name: true, images: true }
    });

    let updatedCount = 0;
    const results: any[] = [];

    for (const backupVenue of venuesWithImages) {
      const normalizedBackupName = normalizeName(backupVenue.name);

      // Find matching venue
      const matchingVenue = dbVenues.find((v: any) => {
        const normalizedVenueName = normalizeName(v.name);
        return normalizedVenueName === normalizedBackupName ||
               normalizedVenueName.includes(normalizedBackupName) ||
               normalizedBackupName.includes(normalizedVenueName);
      });

      if (matchingVenue && (!matchingVenue.images || matchingVenue.images.length === 0)) {
        // Update venue with images from backup
        await prisma.venue.update({
          where: { id: matchingVenue.id },
          data: { images: backupVenue.images }
        });

        updatedCount++;
        results.push({
          venue: matchingVenue.name,
          imageCount: backupVenue.images.length,
          firstImage: backupVenue.images[0].substring(0, 50) + '...'
        });
      }
    }

    console.log(`✅ Successfully restored images for ${updatedCount} venues!`);

    res.status(200).json({
      success: true,
      message: 'Venue images restored successfully',
      statistics: {
        venuesWithImagesInBackup: venuesWithImages.length,
        updated: updatedCount
      },
      results: results.slice(0, 10) // Return first 10 as sample
    });

  } catch (error) {
    console.error('❌ Error restoring venue images:', error);
    res.status(500).json({
      error: 'Image restoration failed',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Database seed endpoint (admin use only - secured with environment variable)
app.post('/admin/seed-database', async (req, res) => {
  try {
    // Security: Only allow seeding with correct admin key
    const adminKey = req.headers['x-admin-key'];
    if (adminKey !== process.env.ADMIN_SEED_KEY) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    console.log('🌱 Starting database seed...');

    // Import seed function dynamically
    const fs = require('fs');
    const path = require('path');

    // Read venues.json
    const venuesPath = path.join(process.cwd(), 'venues.json');
    const venuesData = JSON.parse(fs.readFileSync(venuesPath, 'utf8'));

    console.log(`Seeding ${venuesData.venues.length} venues...`);

    // Clear existing venue-related data (preserve user posts)
    await prisma.busySnapshot.deleteMany();
    await prisma.deal.deleteMany();
    await prisma.event.deleteMany();
    // Note: We do NOT delete posts - these are user-generated content
    await prisma.story.deleteMany();
    await prisma.venue.deleteMany();
    console.log('Cleared existing venue data (preserved user posts)');

    // Process each venue
    let successCount = 0;
    for (const venue of venuesData.venues) {
      const venueData = {
        name: venue.name,
        category: venue.category,
        location: venue.location,
        latitude: venue.latitude,
        longitude: venue.longitude,
        capacity: venue.capacity,
        currentOccupancy: venue.currentOccupancy || 0,
        rating: venue.rating || null,
        priceRange: venue.priceRange || venue.pricing?.tier || '$',
        pricing: venue.pricing || null,
        musicGenres: venue.musicGenres || [],
        openingHours: venue.openingHours || {},
        features: venue.features || [],
        bookingURL: venue.bookingURL === 'PLACEHOLDER_URL' || venue.bookingURL === 'none' ? null : venue.bookingURL,
        phoneNumber: venue.phoneNumber === 'PLACEHOLDER_PHONE' || venue.phoneNumber === 'none' ? null : venue.phoneNumber,
        images: venue.images || [],
        placeId: venue.placeId || null,
        businessStatus: venue.businessStatus || 'OPERATIONAL'
      };

      const createdVenue = await prisma.venue.create({ data: venueData });

      // Create busy snapshot
      if (venue.currentOccupancy && venue.capacity) {
        const occupancyPercentage = Math.round((venue.currentOccupancy / venue.capacity) * 100);
        let status: 'QUIET' | 'MODERATE' | 'BUSY' | 'VERY_BUSY' | 'CLOSED';

        if (occupancyPercentage < 25) status = 'QUIET';
        else if (occupancyPercentage < 50) status = 'MODERATE';
        else if (occupancyPercentage < 75) status = 'BUSY';
        else status = 'VERY_BUSY';

        await prisma.busySnapshot.create({
          data: {
            venueId: createdVenue.id,
            occupancyCount: venue.currentOccupancy,
            occupancyPercentage: occupancyPercentage,
            status: status,
            source: 'seed_data'
          }
        });
      }

      successCount++;
    }

    console.log(`✅ Successfully seeded ${successCount} venues!`);

    // Get statistics
    const venueCount = await prisma.venue.count();
    const busySnapshotCount = await prisma.busySnapshot.count();

    res.status(200).json({
      success: true,
      message: 'Database seeded successfully',
      statistics: {
        venues: venueCount,
        busySnapshots: busySnapshotCount,
        venuesProcessed: successCount
      }
    });

  } catch (error) {
    console.error('❌ Error seeding database:', error);
    res.status(500).json({
      error: 'Seed failed',
      message: error instanceof Error ? error.message : 'Unknown error'
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