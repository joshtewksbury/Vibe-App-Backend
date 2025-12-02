import express from 'express';
import { asyncHandler } from '../shared/middleware/errorHandler';
import { authMiddleware, requireRole } from '../shared/middleware/auth';
import { apifyInstagramScraper } from '../services/apifyInstagramScraper';
import prisma from '../lib/prisma';

const router = express.Router();

/**
 * GET /instagram/posts
 * Get all Instagram posts for Discovery page
 * Public endpoint (no auth required)
 */
router.get('/posts', asyncHandler(async (req, res) => {
  const { limit = 50, offset = 0, venueId } = req.query;

  const where = venueId ? { venueId: venueId as string } : {};

  const posts = await prisma.venueInstagramPost.findMany({
    where,
    take: parseInt(limit as string),
    skip: parseInt(offset as string),
    orderBy: { postedAt: 'desc' },
    include: {
      venue: {
        select: {
          id: true,
          name: true,
          venueIconUrl: true,
          location: true,
          category: true
        }
      }
    }
  });

  const total = await prisma.venueInstagramPost.count({ where });

  res.json({
    posts,
    pagination: {
      total,
      limit: parseInt(limit as string),
      offset: parseInt(offset as string),
      hasMore: total > parseInt(offset as string) + posts.length
    }
  });
}));

/**
 * GET /instagram/posts/:postId
 * Get a specific Instagram post
 */
router.get('/posts/:postId', asyncHandler(async (req, res) => {
  const { postId } = req.params;

  const post = await prisma.venueInstagramPost.findUnique({
    where: { id: postId },
    include: {
      venue: {
        select: {
          id: true,
          name: true,
          venueIconUrl: true,
          location: true,
          category: true,
          instagramUsername: true
        }
      }
    }
  });

  if (!post) {
    return res.status(404).json({ error: 'Post not found' });
  }

  res.json({ post });
}));

/**
 * POST /instagram/sync/:venueId
 * Manually trigger Instagram sync for a specific venue
 * Admin only
 */
router.post('/sync/:venueId',
  authMiddleware,
  requireRole(['ADMIN']),
  asyncHandler(async (req, res) => {
    const { venueId } = req.params;

    // Get venue
    const venue = await prisma.venue.findUnique({
      where: { id: venueId },
      select: { id: true, name: true, instagramUsername: true }
    });

    if (!venue) {
      return res.status(404).json({ error: 'Venue not found' });
    }

    if (!venue.instagramUsername) {
      return res.status(400).json({
        error: 'Venue does not have Instagram username configured'
      });
    }

    console.log(`📸 Manual sync requested for ${venue.name} (@${venue.instagramUsername})`);

    // Sync posts
    const savedCount = await apifyInstagramScraper.syncVenuePosts(
      venue.id,
      venue.instagramUsername
    );

    res.json({
      success: true,
      message: `Synced ${savedCount} Instagram posts for ${venue.name}`,
      venueId: venue.id,
      postsCount: savedCount
    });
  })
);

/**
 * POST /instagram/sync-all
 * Trigger bulk Instagram sync for all venues
 * Admin only
 */
router.post('/sync-all',
  authMiddleware,
  requireRole(['ADMIN']),
  asyncHandler(async (req, res) => {
    console.log('🚀 Bulk sync requested by admin');

    // Start sync asynchronously
    apifyInstagramScraper.syncAllVenues()
      .then(summary => {
        console.log('✅ Bulk sync completed:', summary);
      })
      .catch(error => {
        console.error('❌ Bulk sync failed:', error);
      });

    res.json({
      success: true,
      message: 'Bulk Instagram sync started in background'
    });
  })
);

/**
 * GET /instagram/stats
 * Get Instagram sync statistics
 * Admin only
 */
router.get('/stats',
  authMiddleware,
  requireRole(['ADMIN']),
  asyncHandler(async (req, res) => {
    const totalPosts = await prisma.venueInstagramPost.count();

    const venuesWithInstagram = await prisma.venue.count({
      where: { instagramUsername: { not: null } }
    });

    const venuesWithPosts = await prisma.venueInstagramPost.groupBy({
      by: ['venueId']
    });

    const recentPosts = await prisma.venueInstagramPost.count({
      where: {
        postedAt: {
          gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) // Last 7 days
        }
      }
    });

    const lastSyncedVenue = await prisma.venue.findFirst({
      where: { instagramLastSynced: { not: null } },
      orderBy: { instagramLastSynced: 'desc' },
      select: {
        name: true,
        instagramUsername: true,
        instagramLastSynced: true
      }
    });

    res.json({
      stats: {
        totalPosts,
        venuesWithInstagram,
        venuesWithPosts: venuesWithPosts.length,
        recentPosts,
        lastSync: lastSyncedVenue
      }
    });
  })
);

/**
 * PATCH /instagram/venues/:venueId/username
 * Update venue's Instagram username
 * Admin or Venue Manager only
 */
router.patch('/venues/:venueId/username',
  authMiddleware,
  requireRole(['ADMIN', 'VENUE_MANAGER']),
  asyncHandler(async (req, res) => {
    const { venueId } = req.params;
    const { instagramUsername } = req.body;

    if (!instagramUsername) {
      return res.status(400).json({ error: 'Instagram username required' });
    }

    // Remove @ if provided
    const cleanUsername = instagramUsername.replace('@', '');

    // Update venue
    const venue = await prisma.venue.update({
      where: { id: venueId },
      data: { instagramUsername: cleanUsername }
    });

    res.json({
      success: true,
      message: `Instagram username updated to @${cleanUsername}`,
      venue: {
        id: venue.id,
        name: venue.name,
        instagramUsername: venue.instagramUsername
      }
    });
  })
);

/**
 * DELETE /instagram/posts/:postId
 * Delete a specific Instagram post
 * Admin only (for moderation)
 */
router.delete('/posts/:postId',
  authMiddleware,
  requireRole(['ADMIN']),
  asyncHandler(async (req, res) => {
    const { postId } = req.params;

    await prisma.venueInstagramPost.delete({
      where: { id: postId }
    });

    res.json({
      success: true,
      message: 'Instagram post deleted'
    });
  })
);

export default router;
