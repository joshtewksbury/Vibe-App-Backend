import express from 'express';
import { PrismaClient } from '@prisma/client';
import { asyncHandler, createError } from '../middleware/errorHandler';
import { AuthenticatedRequest } from '../middleware/auth';

const router = express.Router();
const prisma = new PrismaClient();

// GET /feed - Get personalized feed
router.get('/', asyncHandler(async (req: AuthenticatedRequest, res) => {
  const { city, limit = 20, offset = 0, type } = req.query;

  let whereClause: any = {};

  // Filter by city if provided
  if (city) {
    whereClause.venue = {
      location: {
        contains: city as string,
        mode: 'insensitive'
      }
    };
  }

  // Filter by type if provided (posts, deals, events)
  const feedItems: any[] = [];

  if (!type || type === 'posts') {
    const posts = await prisma.post.findMany({
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
      take: parseInt(limit as string) / 3,
      skip: parseInt(offset as string)
    });

    feedItems.push(...posts.map(post => ({
      id: post.id,
      type: 'post',
      content: post.content,
      imageUrl: post.imageUrl,
      venueId: post.venueId,
      venueName: post.venue.name,
      venueLocation: post.venue.location,
      venueImages: post.venue.images,
      author: post.author,
      likes: post.likes,
      comments: post.comments,
      tags: post.tags,
      timestamp: post.createdAt
    })));
  }

  if (!type || type === 'deals') {
    const deals = await prisma.deal.findMany({
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
      take: parseInt(limit as string) / 3
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
    const events = await prisma.event.findMany({
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
      take: parseInt(limit as string) / 3
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
  const limitedItems = feedItems.slice(0, parseInt(limit as string));

  res.json({
    feed: limitedItems,
    metadata: {
      total: limitedItems.length,
      limit: parseInt(limit as string),
      offset: parseInt(offset as string),
      hasMore: feedItems.length > parseInt(limit as string),
      filters: {
        city: city || null,
        type: type || 'all'
      }
    }
  });
}));

// GET /feed/trending - Get trending content
router.get('/trending', asyncHandler(async (req: AuthenticatedRequest, res) => {
  const { limit = 10 } = req.query;

  // Get trending posts (by likes and recent activity)
  const trendingPosts = await prisma.post.findMany({
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
    take: parseInt(limit as string)
  });

  // Get popular venues (by recent activity)
  const popularVenues = await prisma.venue.findMany({
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
      content: post.content,
      imageUrl: post.imageUrl,
      venue: post.venue,
      author: post.author,
      likes: post.likes,
      comments: post.comments,
      tags: post.tags,
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

export default router;