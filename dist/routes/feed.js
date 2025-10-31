"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const errorHandler_1 = require("../shared/middleware/errorHandler");
const prisma_1 = __importDefault(require("../lib/prisma"));
const router = express_1.default.Router();
// GET /feed - Get personalized feed
router.get('/', (0, errorHandler_1.asyncHandler)(async (req, res) => {
    const { city, limit = 20, offset = 0, type } = req.query;
    let whereClause = {};
    // Filter by city if provided
    if (city) {
        whereClause.venue = {
            location: {
                contains: city,
                mode: 'insensitive'
            }
        };
    }
    // Filter by type if provided (posts, deals, events)
    const feedItems = [];
    if (!type || type === 'posts') {
        const posts = await prisma_1.default.post.findMany({
            where: whereClause,
            include: {
                venue: {
                    select: { id: true, name: true, location: true, images: true }
                },
                author: {
                    select: { id: true, firstName: true, lastName: true, profileImage: true }
                }
            },
            orderBy: { createdAt: 'desc' },
            take: parseInt(limit) / 3,
            skip: parseInt(offset)
        });
        feedItems.push(...posts.map(post => ({
            id: post.id,
            type: 'post',
            title: post.title,
            content: post.content,
            mediaUrl: post.mediaUrl,
            venueId: post.venueId,
            venueName: post.venue?.name,
            venueLocation: post.venue?.location,
            venueImages: post.venue?.images || [],
            author: post.author,
            likes: post.likes,
            comments: post.comments,
            postType: post.postType,
            timestamp: post.createdAt
        })));
    }
    if (!type || type === 'deals') {
        const deals = await prisma_1.default.deal.findMany({
            where: {
                ...whereClause,
                isActive: true,
                validFrom: { lte: new Date() },
                validUntil: { gte: new Date() }
            },
            include: {
                venue: {
                    select: { id: true, name: true, location: true, images: true }
                }
            },
            orderBy: { createdAt: 'desc' },
            take: parseInt(limit) / 3
        });
        feedItems.push(...deals.map(deal => ({
            id: deal.id,
            type: 'deal',
            content: deal.title,
            description: deal.description,
            discountPercentage: deal.discountPercentage,
            validUntil: deal.validUntil,
            venueId: deal.venueId,
            venueName: deal.venue.name,
            venueLocation: deal.venue.location,
            venueImages: deal.venue.images,
            timestamp: deal.createdAt
        })));
    }
    if (!type || type === 'events') {
        const events = await prisma_1.default.event.findMany({
            where: {
                ...whereClause,
                isActive: true,
                startTime: { gte: new Date() }
            },
            include: {
                venue: {
                    select: { id: true, name: true, location: true, images: true }
                }
            },
            orderBy: { startTime: 'asc' },
            take: parseInt(limit) / 3
        });
        feedItems.push(...events.map(event => ({
            id: event.id,
            type: 'event',
            content: event.title,
            description: event.description,
            startTime: event.startTime,
            endTime: event.endTime,
            ticketPrice: event.ticketPrice,
            eventType: event.eventType,
            imageUrl: event.imageUrl,
            venueId: event.venueId,
            venueName: event.venue.name,
            venueLocation: event.venue.location,
            venueImages: event.venue.images,
            timestamp: event.createdAt
        })));
    }
    // Sort all feed items by timestamp
    feedItems.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    // Apply limit
    const limitedItems = feedItems.slice(0, parseInt(limit));
    res.json({
        feed: limitedItems,
        metadata: {
            total: limitedItems.length,
            limit: parseInt(limit),
            offset: parseInt(offset),
            hasMore: feedItems.length > parseInt(limit),
            filters: {
                city: city || null,
                type: type || 'all'
            }
        }
    });
}));
// GET /feed/trending - Get trending content
router.get('/trending', (0, errorHandler_1.asyncHandler)(async (req, res) => {
    const { limit = 10 } = req.query;
    // Get trending posts (by likes and recent activity)
    const trendingPosts = await prisma_1.default.post.findMany({
        where: {
            createdAt: {
                gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) // Last week
            }
        },
        include: {
            venue: {
                select: { id: true, name: true, location: true, images: true }
            },
            author: {
                select: { id: true, firstName: true, lastName: true, profileImage: true }
            }
        },
        orderBy: [
            { likes: 'desc' },
            { comments: 'desc' },
            { createdAt: 'desc' }
        ],
        take: parseInt(limit)
    });
    // Get popular venues (by recent activity)
    const popularVenues = await prisma_1.default.venue.findMany({
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
            _count: {
                select: {
                    posts: {
                        where: {
                            createdAt: {
                                gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
                            }
                        }
                    }
                }
            }
        },
        orderBy: {
            posts: {
                _count: 'desc'
            }
        },
        take: 5
    });
    res.json({
        trendingPosts: trendingPosts.map(post => ({
            id: post.id,
            type: 'post',
            title: post.title,
            content: post.content,
            mediaUrl: post.mediaUrl,
            venue: post.venue,
            author: post.author,
            likes: post.likes,
            comments: post.comments,
            postType: post.postType,
            timestamp: post.createdAt
        })),
        popularVenues: popularVenues.map(venue => ({
            ...venue,
            currentStatus: venue.busySnapshots[0]?.status || 'MODERATE',
            currentOccupancy: venue.busySnapshots[0]?.occupancyPercentage || 0,
            recentPosts: venue._count.posts,
            busySnapshots: undefined,
            _count: undefined
        }))
    });
}));
exports.default = router;
//# sourceMappingURL=feed.js.map