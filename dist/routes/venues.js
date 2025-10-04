"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const client_1 = require("@prisma/client");
const errorHandler_1 = require("../middleware/errorHandler");
const auth_1 = require("../middleware/auth");
const validation_1 = require("../utils/validation");
const serpApi_1 = require("../services/serpApi");
const googlePlaces_1 = require("../services/googlePlaces");
const router = express_1.default.Router();
const prisma = new client_1.PrismaClient();
const serpApiService = new serpApi_1.SerpAPIService();
const googlePlacesService = new googlePlaces_1.GooglePlacesService();
// GET /venues - Get all venues with optional filtering
router.get('/', (0, errorHandler_1.asyncHandler)(async (req, res) => {
    const { lat, lng, radius = 10000, category, limit = 50, offset = 0 } = req.query;
    let whereClause = {};
    let orderBy = { name: 'asc' };
    // Filter by category if provided
    if (category) {
        whereClause.category = {
            contains: category,
            mode: 'insensitive'
        };
    }
    // If location provided, we can add distance-based filtering
    // Note: For production, you'd want to use PostGIS or similar for proper geo queries
    if (lat && lng) {
        const latitude = parseFloat(lat);
        const longitude = parseFloat(lng);
        const radiusKm = parseFloat(radius) / 1000;
        // Simple bounding box calculation (not precise but works for demo)
        const latRange = radiusKm / 111; // Rough km to degree conversion
        const lngRange = radiusKm / (111 * Math.cos(latitude * Math.PI / 180));
        whereClause.latitude = {
            gte: latitude - latRange,
            lte: latitude + latRange
        };
        whereClause.longitude = {
            gte: longitude - lngRange,
            lte: longitude + lngRange
        };
    }
    const venues = await prisma.venue.findMany({
        where: whereClause,
        orderBy,
        take: parseInt(limit),
        skip: parseInt(offset),
        include: {
            busySnapshots: {
                where: {
                    timestamp: {
                        gte: new Date(Date.now() - 24 * 60 * 60 * 1000) // Last 24 hours
                    }
                },
                orderBy: { timestamp: 'desc' },
                take: 1
            },
            venueImages: {
                where: {
                    imageType: 'ICON',
                    isActive: true
                },
                take: 1
            }
        }
    });
    // Add current busy status to each venue
    const venuesWithStatus = venues.map(venue => {
        const latestSnapshot = venue.busySnapshots[0];
        const iconImage = venue.venueImages?.[0];
        return {
            ...venue,
            currentStatus: latestSnapshot?.status || 'MODERATE',
            currentOccupancy: latestSnapshot?.occupancyCount || 0,
            occupancyPercentage: latestSnapshot?.occupancyPercentage || 0,
            venueIcon: iconImage?.url || null,
            busySnapshots: undefined, // Remove from response
            venueImages: undefined // Remove from response
        };
    });
    res.json({
        venues: venuesWithStatus,
        metadata: {
            total: venuesWithStatus.length,
            limit: parseInt(limit),
            offset: parseInt(offset),
            hasMore: venuesWithStatus.length === parseInt(limit)
        }
    });
}));
// GET /venues/:id - Get single venue
router.get('/:id', (0, errorHandler_1.asyncHandler)(async (req, res) => {
    const { id } = req.params;
    const venue = await prisma.venue.findUnique({
        where: { id },
        include: {
            busySnapshots: {
                where: {
                    timestamp: {
                        gte: new Date(Date.now() - 24 * 60 * 60 * 1000) // Last 24 hours
                    }
                },
                orderBy: { timestamp: 'desc' },
                take: 24 // Last 24 hours of data
            },
            deals: {
                where: {
                    isActive: true,
                    validFrom: { lte: new Date() },
                    validUntil: { gte: new Date() }
                }
            },
            events: {
                where: {
                    isActive: true,
                    startTime: { gte: new Date() }
                },
                orderBy: { startTime: 'asc' }
            },
            venueImages: {
                where: {
                    isActive: true
                },
                orderBy: {
                    displayOrder: 'asc'
                }
            }
        }
    });
    if (!venue) {
        throw (0, errorHandler_1.createError)('Venue not found', 404);
    }
    // Extract icon image
    const iconImage = venue.venueImages?.find(img => img.imageType === 'ICON');
    const venueWithIcon = {
        ...venue,
        venueIcon: iconImage?.url || null
    };
    res.json({ venue: venueWithIcon });
}));
// GET /venues/:id/busy - Get venue busy data
router.get('/:id/busy', (0, errorHandler_1.asyncHandler)(async (req, res) => {
    const { id } = req.params;
    const { hours = 24 } = req.query;
    const venue = await prisma.venue.findUnique({
        where: { id }
    });
    if (!venue) {
        throw (0, errorHandler_1.createError)('Venue not found', 404);
    }
    const hoursBack = parseInt(hours);
    const snapshots = await prisma.busySnapshot.findMany({
        where: {
            venueId: id,
            timestamp: {
                gte: new Date(Date.now() - hoursBack * 60 * 60 * 1000)
            }
        },
        orderBy: { timestamp: 'asc' }
    });
    res.json({
        venueId: id,
        snapshots,
        lastUpdated: new Date()
    });
}));
// GET /venues/:id/busy/aggregates - Get venue busy aggregates
router.get('/:id/busy/aggregates', (0, errorHandler_1.asyncHandler)(async (req, res) => {
    const { id } = req.params;
    const venue = await prisma.venue.findUnique({
        where: { id }
    });
    if (!venue) {
        throw (0, errorHandler_1.createError)('Venue not found', 404);
    }
    // Get snapshots for the last 30 days for aggregation
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const snapshots = await prisma.busySnapshot.findMany({
        where: {
            venueId: id,
            timestamp: { gte: thirtyDaysAgo }
        }
    });
    // Calculate hourly averages
    const hourlyData = new Map();
    snapshots.forEach(snapshot => {
        const hour = snapshot.timestamp.getHours();
        const current = hourlyData.get(hour) || { total: 0, count: 0, peak: 0 };
        current.total += snapshot.occupancyPercentage;
        current.count += 1;
        current.peak = Math.max(current.peak, snapshot.occupancyPercentage);
        hourlyData.set(hour, current);
    });
    const hourlyAverages = Array.from({ length: 24 }, (_, hour) => {
        const data = hourlyData.get(hour);
        return {
            hour,
            averageOccupancy: data ? data.total / data.count : 0,
            peakOccupancy: data ? data.peak : 0
        };
    });
    // Calculate daily averages
    const dailyData = new Map();
    snapshots.forEach(snapshot => {
        const dayOfWeek = snapshot.timestamp.getDay();
        const current = dailyData.get(dayOfWeek) || { total: 0, count: 0 };
        current.total += snapshot.occupancyPercentage;
        current.count += 1;
        dailyData.set(dayOfWeek, current);
    });
    const dailyAverages = Array.from({ length: 7 }, (_, day) => {
        const data = dailyData.get(day);
        const peakHour = hourlyAverages.reduce((max, curr) => curr.averageOccupancy > max.averageOccupancy ? curr : max);
        return {
            dayOfWeek: day,
            averageOccupancy: data ? data.total / data.count : 0,
            peakHour: peakHour.hour
        };
    });
    res.json({
        venueId: id,
        hourlyAverages,
        dailyAverages,
        weeklyAverages: [] // Would calculate weekly trends over longer periods
    });
}));
// POST /venues - Create new venue (Admin only)
router.post('/', (0, auth_1.requireRole)(['ADMIN']), (0, errorHandler_1.asyncHandler)(async (req, res) => {
    const { error, value } = (0, validation_1.validateCreateVenue)(req.body);
    if (error) {
        throw (0, errorHandler_1.createError)(error.details[0].message, 400);
    }
    const venue = await prisma.venue.create({
        data: value
    });
    res.status(201).json({
        message: 'Venue created successfully',
        venue
    });
}));
// PUT /venues/:id - Update venue (Admin only)
router.put('/:id', (0, auth_1.requireRole)(['ADMIN']), (0, errorHandler_1.asyncHandler)(async (req, res) => {
    const { id } = req.params;
    const { error, value } = (0, validation_1.validateUpdateVenue)(req.body);
    if (error) {
        throw (0, errorHandler_1.createError)(error.details[0].message, 400);
    }
    const venue = await prisma.venue.update({
        where: { id },
        data: value
    });
    res.json({
        message: 'Venue updated successfully',
        venue
    });
}));
// POST /venues/:id/deals - Create deal (Venue Manager or Admin)
router.post('/:id/deals', (0, auth_1.requireRole)(['VENUE_MANAGER', 'ADMIN']), (0, auth_1.requireVenueAccess)(), (0, errorHandler_1.asyncHandler)(async (req, res) => {
    const { id: venueId } = req.params;
    const { error, value } = (0, validation_1.validateCreateDeal)(req.body);
    if (error) {
        throw (0, errorHandler_1.createError)(error.details[0].message, 400);
    }
    const deal = await prisma.deal.create({
        data: {
            ...value,
            venueId,
            createdById: req.user.id
        }
    });
    res.status(201).json({
        message: 'Deal created successfully',
        deal
    });
}));
// POST /venues/:id/events - Create event (Venue Manager or Admin)
router.post('/:id/events', (0, auth_1.requireRole)(['VENUE_MANAGER', 'ADMIN']), (0, auth_1.requireVenueAccess)(), (0, errorHandler_1.asyncHandler)(async (req, res) => {
    const { id: venueId } = req.params;
    const { error, value } = (0, validation_1.validateCreateEvent)(req.body);
    if (error) {
        throw (0, errorHandler_1.createError)(error.details[0].message, 400);
    }
    const event = await prisma.event.create({
        data: {
            ...value,
            venueId,
            createdById: req.user.id
        }
    });
    res.status(201).json({
        message: 'Event created successfully',
        event
    });
}));
// POST /venues/:id/posts - Create post (Venue Manager or Admin)
router.post('/:id/posts', (0, auth_1.requireRole)(['VENUE_MANAGER', 'ADMIN']), (0, auth_1.requireVenueAccess)(), (0, errorHandler_1.asyncHandler)(async (req, res) => {
    const { id: venueId } = req.params;
    const { error, value } = (0, validation_1.validateCreatePost)(req.body);
    if (error) {
        throw (0, errorHandler_1.createError)(error.details[0].message, 400);
    }
    const post = await prisma.post.create({
        data: {
            ...value,
            venueId,
            authorId: req.user.id
        }
    });
    res.status(201).json({
        message: 'Post created successfully',
        post
    });
}));
// GET /venues/:id/analytics/overview - Get venue analytics (Venue Manager or Admin)
router.get('/:id/analytics/overview', (0, auth_1.requireRole)(['VENUE_MANAGER', 'ADMIN']), (0, auth_1.requireVenueAccess)(), (0, errorHandler_1.asyncHandler)(async (req, res) => {
    const { id: venueId } = req.params;
    // Get venue
    const venue = await prisma.venue.findUnique({
        where: { id: venueId }
    });
    if (!venue) {
        throw (0, errorHandler_1.createError)('Venue not found', 404);
    }
    // Calculate analytics
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const [snapshots, deals, events, posts] = await Promise.all([
        prisma.busySnapshot.findMany({
            where: {
                venueId,
                timestamp: { gte: thirtyDaysAgo }
            }
        }),
        prisma.deal.count({
            where: {
                venueId,
                createdAt: { gte: thirtyDaysAgo }
            }
        }),
        prisma.event.count({
            where: {
                venueId,
                createdAt: { gte: thirtyDaysAgo }
            }
        }),
        prisma.post.count({
            where: {
                venueId,
                createdAt: { gte: thirtyDaysAgo }
            }
        })
    ]);
    // Calculate metrics
    const totalVisitors = snapshots.reduce((sum, s) => sum + s.occupancyCount, 0);
    const averageOccupancy = snapshots.length > 0
        ? snapshots.reduce((sum, s) => sum + s.occupancyPercentage, 0) / snapshots.length
        : 0;
    // Find peak hours
    const hourlyData = new Map();
    snapshots.forEach(snapshot => {
        const hour = snapshot.timestamp.getHours();
        if (!hourlyData.has(hour)) {
            hourlyData.set(hour, []);
        }
        hourlyData.get(hour).push(snapshot.occupancyPercentage);
    });
    const peakHours = Array.from(hourlyData.entries())
        .map(([hour, percentages]) => ({
        hour,
        average: percentages.reduce((sum, p) => sum + p, 0) / percentages.length
    }))
        .sort((a, b) => b.average - a.average)
        .slice(0, 3)
        .map(h => `${h.hour}:00`);
    res.json({
        venueId,
        totalVisitors,
        averageOccupancy: Math.round(averageOccupancy),
        peakHours,
        popularDays: ['Friday', 'Saturday'], // Would calculate from data
        period: '30 days',
        dealsCreated: deals,
        eventsCreated: events,
        postsCreated: posts
    });
}));
exports.default = router;
//# sourceMappingURL=venues.js.map