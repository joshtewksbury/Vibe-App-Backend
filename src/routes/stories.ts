import express, { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import multer from 'multer';
import { uploadFile, getVideoThumbnail } from '../services/cloudinaryService';

const router = express.Router();
const prisma = new PrismaClient();

// Configure multer for memory storage
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 100 * 1024 * 1024, // 100MB limit for stories (videos can be large)
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/') || file.mimetype.startsWith('video/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image and video files are allowed'));
    }
  }
});

/**
 * GET /stories
 * Get all active stories (not expired), grouped by author/venue
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const { venueId } = req.query;

    const where: any = {
      isActive: true,
      expiresAt: {
        gt: new Date() // Only get non-expired stories
      }
    };

    if (venueId) {
      where.venueId = venueId;
    }

    const stories = await prisma.story.findMany({
      where,
      include: {
        venue: {
          select: {
            id: true,
            name: true,
            category: true,
            venueIconUrl: true,
            location: true
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    // Group stories by author/venue
    const groupedStories = stories.reduce((acc: any, story) => {
      const key = story.venueId || story.authorId;
      if (!acc[key]) {
        acc[key] = {
          id: key,
          venueId: story.venueId,
          venueName: story.venue?.name || 'User',
          venueCategory: story.venue?.category,
          venueLogoURL: story.venue?.venueIconUrl,
          stories: []
        };
      }
      acc[key].stories.push(story);
      return acc;
    }, {});

    res.json({ storyGroups: Object.values(groupedStories) });
  } catch (error) {
    console.error('Error fetching stories:', error);
    res.status(500).json({ error: 'Failed to fetch stories' });
  }
});

/**
 * POST /stories
 * Create a new story with media upload (required)
 */
router.post('/', authMiddleware, upload.single('media'), async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'Media file is required for stories' });
    }

    const { venueId, caption, location } = req.body;

    // Upload media to Cloudinary
    const isVideo = req.file.mimetype.startsWith('video/');
    const resourceType = isVideo ? 'video' : 'image';

    const uploadResult = await uploadFile(
      req.file.buffer,
      'stories',
      resourceType
    );

    let thumbnailUrl: string | undefined;
    if (isVideo) {
      thumbnailUrl = getVideoThumbnail(uploadResult.publicId);
    }

    // Determine author type
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { role: true, venueIds: true }
    });

    const authorType = user?.role === 'VENUE_MANAGER' && venueId ? 'VENUE' : 'USER';

    // Stories expire after 24 hours
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 24);

    // Create story
    const story = await prisma.story.create({
      data: {
        authorId: userId,
        authorType,
        venueId: venueId || null,
        mediaUrl: uploadResult.secureUrl,
        mediaType: isVideo ? 'VIDEO' : 'IMAGE',
        thumbnailUrl,
        caption: caption || null,
        location: location || null,
        expiresAt
      },
      include: {
        venue: {
          select: {
            id: true,
            name: true,
            category: true,
            venueIconUrl: true,
            location: true
          }
        }
      }
    });

    res.status(201).json({ story });
  } catch (error) {
    console.error('Error creating story:', error);
    res.status(500).json({ error: 'Failed to create story' });
  }
});

/**
 * GET /stories/:storyId
 * Get a specific story by ID
 */
router.get('/:storyId', async (req: Request, res: Response) => {
  try {
    const { storyId } = req.params;

    const story = await prisma.story.findUnique({
      where: { id: storyId },
      include: {
        venue: {
          select: {
            id: true,
            name: true,
            category: true,
            venueIconUrl: true,
            location: true
          }
        }
      }
    });

    if (!story) {
      return res.status(404).json({ error: 'Story not found' });
    }

    // Check if story has expired
    if (story.expiresAt < new Date()) {
      return res.status(410).json({ error: 'Story has expired' });
    }

    res.json({ story });
  } catch (error) {
    console.error('Error fetching story:', error);
    res.status(500).json({ error: 'Failed to fetch story' });
  }
});

/**
 * POST /stories/:storyId/view
 * Record a story view
 */
router.post('/:storyId/view', async (req: Request, res: Response) => {
  try {
    const { storyId } = req.params;
    const { userId } = req.body; // Optional - can be null for anonymous views

    // Check if story exists and is not expired
    const story = await prisma.story.findUnique({
      where: { id: storyId }
    });

    if (!story || story.expiresAt < new Date()) {
      return res.status(404).json({ error: 'Story not found or expired' });
    }

    // Record view
    await prisma.storyView.create({
      data: {
        storyId,
        userId: userId || null
      }
    });

    // Increment view count
    await prisma.story.update({
      where: { id: storyId },
      data: { views: { increment: 1 } }
    });

    res.json({ message: 'Story view recorded' });
  } catch (error) {
    console.error('Error recording story view:', error);
    res.status(500).json({ error: 'Failed to record story view' });
  }
});

/**
 * DELETE /stories/:storyId
 * Delete a story (soft delete)
 */
router.delete('/:storyId', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    const { storyId } = req.params;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const story = await prisma.story.findUnique({
      where: { id: storyId },
      select: { authorId: true }
    });

    if (!story) {
      return res.status(404).json({ error: 'Story not found' });
    }

    if (story.authorId !== userId) {
      return res.status(403).json({ error: 'You can only delete your own stories' });
    }

    await prisma.story.update({
      where: { id: storyId },
      data: { isActive: false }
    });

    res.json({ message: 'Story deleted successfully' });
  } catch (error) {
    console.error('Error deleting story:', error);
    res.status(500).json({ error: 'Failed to delete story' });
  }
});

/**
 * DELETE /stories/cleanup/expired
 * Cleanup expired stories (called by cron job)
 */
router.delete('/cleanup/expired', async (req: Request, res: Response) => {
  try {
    const result = await prisma.story.updateMany({
      where: {
        expiresAt: {
          lt: new Date()
        },
        isActive: true
      },
      data: {
        isActive: false
      }
    });

    res.json({ message: `Cleaned up ${result.count} expired stories` });
  } catch (error) {
    console.error('Error cleaning up expired stories:', error);
    res.status(500).json({ error: 'Failed to cleanup expired stories' });
  }
});

export default router;
