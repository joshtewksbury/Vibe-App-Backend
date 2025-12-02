import express, { Request, Response } from 'express';
import { authMiddleware, AuthRequest } from '../shared/middleware/auth';
import multer from 'multer';
import { uploadFile, getVideoThumbnail } from '../services/cloudinaryService';
import prisma from '../lib/prisma';

const router = express.Router();

// Configure multer for memory storage
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB limit for snapshots (15-second videos)
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
 * Get all active snapshots (not expired), grouped by author/venue
 * Snapshots are 15-second videos showing real-time venue vibes
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const { venueId } = req.query;

    const where: any = {
      isActive: true,
      expiresAt: {
        gt: new Date() // Only get non-expired snapshots
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

    // Group snapshots by author/venue
    const groupedStories = stories.reduce((acc: any, story) => {
      const key = story.venueId || story.authorId;
      if (!acc[key]) {
        acc[key] = {
          id: key,
          venueId: story.venueId,
          venueName: story.venue?.name || 'User Story',
          venueCategory: story.venue?.category,
          venueLogoURL: story.venue?.venueIconUrl || null,
          stories: []
        };
      }
      acc[key].stories.push({
        id: story.id,
        venueId: story.venueId,
        venueName: story.venue?.name || 'User Story',
        authorId: story.authorId,
        authorName: 'User',
        authorType: story.authorType.toLowerCase(),
        mediaURL: story.mediaUrl,
        mediaType: story.mediaType.toLowerCase(),
        thumbnailUrl: story.thumbnailUrl,
        timestamp: story.createdAt.toISOString(),
        expiresAt: story.expiresAt.toISOString(),
        caption: story.caption,
        viewers: story.views,
        isViewed: false
      });
      return acc;
    }, {});

    res.json({ storyGroups: Object.values(groupedStories) });
  } catch (error) {
    console.error('Error fetching snapshots:', error);
    res.status(500).json({ error: 'Failed to fetch snapshots' });
  }
});

/**
 * POST /stories
 * Create a new snapshot with video upload (required)
 * Snapshots are 15-second videos showing real-time venue vibes
 */
router.post('/', authMiddleware, upload.single('media'), async (req: AuthRequest, res: Response) => {
  try {
    console.log('📸 POST /stories - Creating new snapshot');
    console.log('📸 User ID:', req.user?.userId);
    console.log('📸 File present:', !!req.file);
    if (req.file) {
      console.log('📸 File mimetype:', req.file.mimetype);
      console.log('📸 File size:', req.file.size, 'bytes');
    }

    const userId = req.user?.userId;

    if (!userId) {
      console.log('❌ No userId found in request');
      return res.status(401).json({ error: 'Unauthorized' });
    }

    if (!req.file) {
      console.log('❌ No media file provided');
      return res.status(400).json({ error: 'Video file is required for snapshots' });
    }

    const { venueId, caption, location } = req.body;

    // Snapshots should be videos only
    const isVideo = req.file.mimetype.startsWith('video/');
    if (!isVideo) {
      console.log('❌ Invalid file type - snapshots must be videos');
      return res.status(400).json({ error: 'Snapshots must be video files (15 seconds max)' });
    }

    console.log('☁️ Uploading video to Cloudinary...');
    // Upload video to Cloudinary with optimizations for 15-second snapshots
    const uploadResult = await uploadFile(
      req.file.buffer,
      'snapshots',
      'video'
    );
    console.log('✅ Video uploaded:', uploadResult.secureUrl);

    // Generate thumbnail for video
    const thumbnailUrl = getVideoThumbnail(uploadResult.publicId);
    console.log('✅ Thumbnail generated:', thumbnailUrl);

    // Determine author type
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { role: true, venueIds: true, firstName: true, lastName: true }
    });

    const authorType = user?.role === 'VENUE_MANAGER' && venueId ? 'VENUE' : 'USER';
    console.log('✍️ Author type:', authorType);

    // Snapshots expire after 24 hours
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 24);

    // Create snapshot
    console.log('💾 Creating snapshot in database...');
    const story = await prisma.story.create({
      data: {
        authorId: userId,
        authorType,
        venueId: venueId || null,
        mediaUrl: uploadResult.secureUrl,
        mediaType: 'VIDEO',
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

    console.log('✅ Snapshot created successfully:', story.id);

    // Format response
    const formattedStory = {
      id: story.id,
      venueId: story.venueId,
      venueName: story.venue?.name || 'User Story',
      authorId: story.authorId,
      authorName: 'User',
      authorType: story.authorType.toLowerCase(),
      mediaURL: story.mediaUrl,
      mediaType: story.mediaType.toLowerCase(),
      thumbnailUrl: story.thumbnailUrl,
      timestamp: story.createdAt.toISOString(),
      expiresAt: story.expiresAt.toISOString(),
      caption: story.caption,
      viewers: story.views,
      isViewed: false
    };

    res.status(201).json({ story: formattedStory });
  } catch (error) {
    console.error('❌ Error creating snapshot:', error);
    console.error('❌ Error details:', JSON.stringify(error, null, 2));
    if (error instanceof Error) {
      console.error('❌ Error message:', error.message);
      console.error('❌ Error stack:', error.stack);
    }
    res.status(500).json({
      error: 'Failed to create snapshot',
      details: error instanceof Error ? error.message : String(error)
    });
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
