"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.prisma = exports.app = void 0;
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const helmet_1 = __importDefault(require("helmet"));
const morgan_1 = __importDefault(require("morgan"));
const dotenv_1 = require("dotenv");
const Sentry = __importStar(require("@sentry/node"));
const auth_1 = require("./shared/middleware/auth");
const rateLimiting_1 = require("./shared/middleware/rateLimiting");
const errorHandler_1 = require("./shared/middleware/errorHandler");
const auditLogger_1 = require("./shared/middleware/auditLogger");
const tilePrecomputeService_1 = require("./services/tilePrecomputeService");
const busynessScheduler_1 = require("./services/busynessScheduler");
const prisma_1 = __importDefault(require("./lib/prisma"));
exports.prisma = prisma_1.default;
// Module route imports (new modular structure)
const auth_routes_1 = __importDefault(require("./modules/auth/auth.routes"));
const friends_routes_1 = __importDefault(require("./modules/friends/friends.routes"));
const messaging_routes_1 = __importDefault(require("./modules/messaging/messaging.routes"));
// Legacy route imports (to be refactored)
const venues_1 = __importDefault(require("./routes/venues"));
const venueImages_1 = __importDefault(require("./routes/venueImages"));
const users_1 = __importDefault(require("./routes/users"));
const feed_1 = __importDefault(require("./routes/feed"));
const heatmap_1 = __importDefault(require("./routes/heatmap"));
const images_1 = __importDefault(require("./routes/images"));
const imageProxy_1 = __importDefault(require("./routes/imageProxy"));
const posts_1 = __importDefault(require("./routes/posts"));
const stories_1 = __importDefault(require("./routes/stories"));
const accountSettings_1 = __importDefault(require("./routes/accountSettings"));
const events_1 = __importDefault(require("./routes/events"));
// Load environment variables
(0, dotenv_1.config)();
const app = (0, express_1.default)();
exports.app = app;
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
app.use((0, helmet_1.default)());
// CORS configuration
const corsOptions = {
    origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
    credentials: true,
    optionsSuccessStatus: 200
};
app.use((0, cors_1.default)(corsOptions));
// Rate limiting
app.use(rateLimiting_1.rateLimitMiddleware);
// HTTP Request Logging
if (process.env.NODE_ENV === 'production') {
    // Apache-style combined logs for production
    app.use((0, morgan_1.default)('combined'));
}
else {
    // Colored concise logs for development
    app.use((0, morgan_1.default)('dev'));
}
// Body parsing
app.use(express_1.default.json({ limit: '10mb' }));
app.use(express_1.default.urlencoded({ extended: true, limit: '10mb' }));
// Serve static files from Railway volume
app.use('/uploads', express_1.default.static('/app/uploads'));
// Audit logging
app.use(auditLogger_1.auditLogger);
// Health check endpoint with database connectivity test
app.get('/health', async (req, res) => {
    try {
        // Test database connection
        await prisma_1.default.$queryRaw `SELECT 1`;
        res.status(200).json({
            status: 'healthy',
            timestamp: new Date().toISOString(),
            uptime: process.uptime(),
            database: 'connected',
            environment: process.env.NODE_ENV || 'development'
        });
    }
    catch (error) {
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
        const venueMapping = {
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
        const normalizeName = (name) => name.toLowerCase().replace(/[^\w\s]/g, '').replace(/\s+/g, ' ').trim();
        // Get all venues
        const venues = await prisma_1.default.venue.findMany({
            select: { id: true, name: true }
        });
        let updatedCount = 0;
        const results = [];
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
                await prisma_1.default.venue.update({
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
    }
    catch (error) {
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
        const venuesWithImages = backupVenues.filter((v) => v.images && v.images.length > 0);
        console.log(`Found ${venuesWithImages.length} venues with images in backup`);
        // Normalize name for matching
        const normalizeName = (name) => name.toLowerCase().replace(/[^\w\s]/g, '').replace(/\s+/g, ' ').trim();
        // Get all venues from database
        const dbVenues = await prisma_1.default.venue.findMany({
            select: { id: true, name: true, images: true }
        });
        let updatedCount = 0;
        const results = [];
        for (const backupVenue of venuesWithImages) {
            const normalizedBackupName = normalizeName(backupVenue.name);
            // Find matching venue
            const matchingVenue = dbVenues.find((v) => {
                const normalizedVenueName = normalizeName(v.name);
                return normalizedVenueName === normalizedBackupName ||
                    normalizedVenueName.includes(normalizedBackupName) ||
                    normalizedBackupName.includes(normalizedVenueName);
            });
            if (matchingVenue && (!matchingVenue.images || matchingVenue.images.length === 0)) {
                // Update venue with images from backup
                await prisma_1.default.venue.update({
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
    }
    catch (error) {
        console.error('❌ Error restoring venue images:', error);
        res.status(500).json({
            error: 'Image restoration failed',
            message: error instanceof Error ? error.message : 'Unknown error'
        });
    }
});
// Update venue opening hours (admin use only)
app.post('/admin/update-venue-hours', async (req, res) => {
    try {
        // Security: Only allow with correct admin key
        const adminKey = req.headers['x-admin-key'];
        if (adminKey !== process.env.ADMIN_SEED_KEY) {
            return res.status(403).json({ error: 'Unauthorized' });
        }
        const { venueId, openingHours } = req.body;
        if (!venueId || !openingHours) {
            return res.status(400).json({
                error: 'Missing required fields',
                message: 'venueId and openingHours are required'
            });
        }
        console.log(`🔄 Updating opening hours for venue ${venueId}...`);
        const venue = await prisma_1.default.venue.update({
            where: { id: venueId },
            data: { openingHours },
            select: {
                id: true,
                name: true,
                openingHours: true
            }
        });
        console.log(`✅ Successfully updated opening hours for ${venue.name}`);
        res.status(200).json({
            success: true,
            message: 'Opening hours updated successfully',
            venue
        });
    }
    catch (error) {
        console.error('❌ Error updating opening hours:', error);
        res.status(500).json({
            error: 'Failed to update opening hours',
            message: error instanceof Error ? error.message : 'Unknown error'
        });
    }
});
// Manually trigger busyness refresh (admin use only)
app.post('/admin/trigger-busyness-refresh', async (req, res) => {
    try {
        // Security: Only allow with correct admin key
        const adminKey = req.headers['x-admin-key'];
        if (adminKey !== process.env.ADMIN_SEED_KEY) {
            return res.status(403).json({ error: 'Unauthorized' });
        }
        console.log('🔄 Manually triggering busyness refresh...');
        // Import the scheduler
        const { busynessScheduler } = require('./services/busynessScheduler');
        // Check if scheduler is running
        const isRunning = busynessScheduler.isRunning;
        console.log(`Scheduler running status: ${isRunning}`);
        // Get current snapshot count before refresh
        const snapshotCountBefore = await prisma_1.default.busySnapshot.count();
        // Trigger manual refresh asynchronously (don't wait for it to complete)
        busynessScheduler.fetchAndUpdateAllVenues()
            .then(async () => {
            const snapshotCountAfter = await prisma_1.default.busySnapshot.count();
            console.log(`✅ Busyness refresh completed. Snapshots: ${snapshotCountBefore} → ${snapshotCountAfter}`);
        })
            .catch((error) => {
            console.error('❌ Error during background busyness refresh:', error);
        });
        // Return immediately
        res.status(200).json({
            success: true,
            message: 'Busyness refresh started in background',
            schedulerRunning: isRunning,
            currentSnapshots: snapshotCountBefore,
            note: 'Refresh is running in the background. Check logs for completion status.'
        });
    }
    catch (error) {
        console.error('❌ Error triggering busyness refresh:', error);
        res.status(500).json({
            error: 'Failed to trigger busyness refresh',
            message: error instanceof Error ? error.message : 'Unknown error',
            stack: error instanceof Error ? error.stack : undefined
        });
    }
});
// Batch update opening hours for multiple venues (admin use only)
app.post('/admin/batch-update-hours', async (req, res) => {
    try {
        // Security: Only allow with correct admin key
        const adminKey = req.headers['x-admin-key'];
        if (adminKey !== process.env.ADMIN_SEED_KEY) {
            return res.status(403).json({ error: 'Unauthorized' });
        }
        const { updates } = req.body; // Array of { category, hours } or { name, hours }
        if (!updates || !Array.isArray(updates)) {
            return res.status(400).json({ error: 'Invalid request format' });
        }
        let successCount = 0;
        const results = [];
        for (const update of updates) {
            try {
                if (update.name) {
                    // Update specific venue by name
                    const venue = await prisma_1.default.venue.findFirst({
                        where: { name: update.name }
                    });
                    if (venue) {
                        await prisma_1.default.venue.update({
                            where: { id: venue.id },
                            data: { openingHours: update.hours }
                        });
                        results.push({ type: 'name', target: update.name, status: 'success' });
                        successCount++;
                    }
                }
                else if (update.category) {
                    // Update all venues of a category
                    const updateResult = await prisma_1.default.venue.updateMany({
                        where: { category: update.category },
                        data: { openingHours: update.hours }
                    });
                    results.push({ type: 'category', target: update.category, count: updateResult.count, status: 'success' });
                    successCount += updateResult.count;
                }
            }
            catch (error) {
                results.push({ target: update.name || update.category, status: 'error', message: error instanceof Error ? error.message : 'Unknown error' });
            }
        }
        res.json({
            success: true,
            message: 'Batch hours update completed',
            updatedCount: successCount,
            results
        });
    }
    catch (error) {
        console.error('❌ Error in batch update:', error);
        res.status(500).json({
            error: 'Failed to batch update hours',
            message: error instanceof Error ? error.message : 'Unknown error'
        });
    }
});
// Update opening hours for all venues from Google Maps data (admin use only)
app.post('/admin/update-opening-hours', async (req, res) => {
    try {
        // Security: Only allow with correct admin key
        const adminKey = req.headers['x-admin-key'];
        if (adminKey !== process.env.ADMIN_SEED_KEY) {
            return res.status(403).json({ error: 'Unauthorized' });
        }
        console.log('🕐 Fetching opening hours for all venues from Google Maps...');
        // Get all venues
        const venues = await prisma_1.default.venue.findMany({
            select: { id: true, name: true, location: true, placeId: true }
        });
        let successCount = 0;
        let failCount = 0;
        const results = [];
        // Process in batches to avoid rate limiting
        const batchSize = 5;
        for (let i = 0; i < venues.length; i += batchSize) {
            const batch = venues.slice(i, i + batchSize);
            await Promise.all(batch.map(async (venue) => {
                try {
                    if (!venue.placeId) {
                        console.log(`⚠️  No Place ID for ${venue.name}, skipping`);
                        failCount++;
                        return;
                    }
                    // Fetch place details from SerpAPI
                    const { SerpAPIService } = require('./services/serpApi');
                    const serpApi = new SerpAPIService();
                    const params = {
                        engine: 'google_maps',
                        type: 'place',
                        place_id: venue.placeId,
                        api_key: process.env.SERP_API_KEY
                    };
                    const axios = require('axios');
                    const response = await axios.get('https://serpapi.com/search', { params });
                    if (response.data?.place_results?.hours) {
                        const hours = response.data.place_results.hours;
                        // Parse hours into our format
                        const openingHours = {};
                        const dayMap = {
                            'Monday': 'monday',
                            'Tuesday': 'tuesday',
                            'Wednesday': 'wednesday',
                            'Thursday': 'thursday',
                            'Friday': 'friday',
                            'Saturday': 'saturday',
                            'Sunday': 'sunday'
                        };
                        for (const day in dayMap) {
                            const hoursStr = hours[day] || hours[day.toLowerCase()];
                            if (hoursStr) {
                                openingHours[dayMap[day]] = hoursStr;
                            }
                        }
                        // Update venue if we got hours
                        if (Object.keys(openingHours).length > 0) {
                            await prisma_1.default.venue.update({
                                where: { id: venue.id },
                                data: { openingHours }
                            });
                            console.log(`✅ Updated hours for ${venue.name}`);
                            results.push({ venue: venue.name, status: 'success', hours: openingHours });
                            successCount++;
                        }
                        else {
                            console.log(`⚠️  No hours found for ${venue.name}`);
                            failCount++;
                        }
                    }
                    else {
                        console.log(`⚠️  No hours data for ${venue.name}`);
                        failCount++;
                    }
                    // Rate limiting delay
                    await new Promise(resolve => setTimeout(resolve, 200));
                }
                catch (error) {
                    console.error(`❌ Error updating ${venue.name}:`, error);
                    results.push({ venue: venue.name, status: 'error', message: error instanceof Error ? error.message : 'Unknown error' });
                    failCount++;
                }
            }));
            // Delay between batches
            if (i + batchSize < venues.length) {
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }
        res.json({
            success: true,
            message: 'Opening hours update completed',
            totalVenues: venues.length,
            successCount,
            failCount,
            sampleResults: results.slice(0, 10)
        });
    }
    catch (error) {
        console.error('❌ Error updating opening hours:', error);
        res.status(500).json({
            error: 'Failed to update opening hours',
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
        await prisma_1.default.busySnapshot.deleteMany();
        await prisma_1.default.deal.deleteMany();
        await prisma_1.default.event.deleteMany();
        // Note: We do NOT delete posts - these are user-generated content
        await prisma_1.default.story.deleteMany();
        await prisma_1.default.venue.deleteMany();
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
            const createdVenue = await prisma_1.default.venue.create({ data: venueData });
            // Create busy snapshot
            if (venue.currentOccupancy && venue.capacity) {
                const occupancyPercentage = Math.round((venue.currentOccupancy / venue.capacity) * 100);
                let status;
                if (occupancyPercentage < 25)
                    status = 'QUIET';
                else if (occupancyPercentage < 50)
                    status = 'MODERATE';
                else if (occupancyPercentage < 75)
                    status = 'BUSY';
                else
                    status = 'VERY_BUSY';
                await prisma_1.default.busySnapshot.create({
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
        const venueCount = await prisma_1.default.venue.count();
        const busySnapshotCount = await prisma_1.default.busySnapshot.count();
        res.status(200).json({
            success: true,
            message: 'Database seeded successfully',
            statistics: {
                venues: venueCount,
                busySnapshots: busySnapshotCount,
                venuesProcessed: successCount
            }
        });
    }
    catch (error) {
        console.error('❌ Error seeding database:', error);
        res.status(500).json({
            error: 'Seed failed',
            message: error instanceof Error ? error.message : 'Unknown error'
        });
    }
});
// API routes
app.use('/auth', auth_routes_1.default);
app.use('/venues', venues_1.default); // Venues endpoint now public (no auth required)
app.use('/', venueImages_1.default); // Image routes include their own auth middleware
app.use('/image-proxy', imageProxy_1.default); // Image proxy for external images (Instagram, etc)
app.use('/users', users_1.default); // Users endpoint now public for search (individual routes can add auth as needed)
app.use('/feed', auth_1.authMiddleware, feed_1.default);
app.use('/heatmap', heatmap_1.default); // Heat map routes include their own auth middleware
app.use('/friends', friends_routes_1.default); // Friends routes include their own auth middleware
app.use('/messages', messaging_routes_1.default); // Messages routes include their own auth middleware
app.use('/posts', posts_1.default); // Posts routes include their own auth middleware
app.use('/stories', stories_1.default); // Stories routes include their own auth middleware
app.use('/account', accountSettings_1.default); // Account settings routes with auth
app.use('/events', events_1.default); // Events routes with auth
// Sentry error handler must be registered before other error handlers
if (process.env.NODE_ENV === 'production' && process.env.SENTRY_DSN) {
    app.use(Sentry.expressErrorHandler());
}
// Error handling
app.use(errorHandler_1.errorHandler);
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
    tilePrecomputeService_1.tilePrecomputeService.stopBackgroundRefresh();
    busynessScheduler_1.busynessScheduler.stop();
    await prisma_1.default.$disconnect();
    process.exit(0);
});
process.on('SIGTERM', async () => {
    console.log('Received SIGTERM. Graceful shutdown...');
    tilePrecomputeService_1.tilePrecomputeService.stopBackgroundRefresh();
    busynessScheduler_1.busynessScheduler.stop();
    await prisma_1.default.$disconnect();
    process.exit(0);
});
app.use(images_1.default);
// Start server
app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`🔗 Health check: http://localhost:${PORT}/health`);
    // Start background tile precomputation and refresh
    console.log('🔥 Starting heat map tile precomputation service...');
    tilePrecomputeService_1.tilePrecomputeService.startBackgroundRefresh();
    // Start live busyness data scheduler
    console.log('📊 Starting live busyness data scheduler (15-minute intervals)...');
    busynessScheduler_1.busynessScheduler.start();
});
//# sourceMappingURL=server.js.map