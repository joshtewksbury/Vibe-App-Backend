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
    fileSize: 50 * 1024 * 1024, // 50MB limit
  },
  fileFilter: (req, file, cb) => {
    // Accept images and videos
    if (file.mimetype.startsWith('image/') || file.mimetype.startsWith('video/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image and video files are allowed'));
    }
  }
});

/**
 * GET /posts
 * Get all posts (discovery feed)
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const { limit = 20, offset = 0, postType, venueId } = req.query;

    const where: any = {
      isActive: true
    };

    if (postType) {
      where.postType = postType;
    }

    if (venueId) {
      where.venueId = venueId;
    }

    const posts = await prisma.post.findMany({
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
        },
        author: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            profileImage: true
          }
        }
      },
      orderBy: [
        { isPinned: 'desc' },
        { createdAt: 'desc' }
      ],
      take: Number(limit),
      skip: Number(offset)
    });

    res.json({ posts });
  } catch (error) {
    console.error('Error fetching posts:', error);
    res.status(500).json({ error: 'Failed to fetch posts' });
  }
});

/**
 * POST /posts
 * Create a new post with optional media upload
 */
router.post('/', authMiddleware, upload.single('media'), async (req: AuthRequest, res: Response) => {
  try {
    console.log('📝 POST /posts - Creating new post');
    console.log('📝 User ID:', req.user?.userId);
    console.log('📝 Request body:', JSON.stringify(req.body, null, 2));
    console.log('📝 File present:', !!req.file);
    if (req.file) {
      console.log('📝 File mimetype:', req.file.mimetype);
      console.log('📝 File size:', req.file.size);
    }

    const userId = req.user?.userId;

    if (!userId) {
      console.log('❌ No userId found in request');
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const {
      venueId,
      postType,
      postStyle,
      title,
      content,
      imageLayout,
      eventId,
      dealId,
      startTime,
      endTime,
      originalPrice,
      discountPrice
    } = req.body;

    console.log('📝 Extracted fields:', {
      venueId,
      postType,
      postStyle,
      title: title?.substring(0, 50),
      content: content?.substring(0, 50),
      imageLayout
    });

    if (!title || !content) {
      console.log('❌ Missing title or content');
      return res.status(400).json({ error: 'Title and content are required' });
    }

    let mediaUrl: string | undefined;
    let mediaType: 'IMAGE' | 'VIDEO' | undefined;
    let thumbnailUrl: string | undefined;

    // Handle media upload if present
    if (req.file) {
      const isVideo = req.file.mimetype.startsWith('video/');
      const resourceType = isVideo ? 'video' : 'image';

      const uploadResult = await uploadFile(
        req.file.buffer,
        'posts',
        resourceType
      );

      mediaUrl = uploadResult.secureUrl;
      mediaType = isVideo ? 'VIDEO' : 'IMAGE';

      // Generate thumbnail for videos
      if (isVideo) {
        thumbnailUrl = getVideoThumbnail(uploadResult.publicId);
      }
    }

    // Determine author type based on whether they're a venue manager
    console.log('🔍 Looking up user:', userId);
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { role: true, venueIds: true }
    });
    console.log('👤 User found:', user);

    const authorType = user?.role === 'VENUE_MANAGER' && venueId ? 'VENUE' : 'USER';
    console.log('✍️ Author type:', authorType);

    // Create post
    console.log('💾 Creating post in database...');
    const post = await prisma.post.create({
      data: {
        authorId: userId,
        authorType,
        venueId: venueId || null,
        postType: postType || 'GENERAL',
        postStyle: postStyle || 'STANDARD',
        title,
        content,
        mediaUrl,
        mediaType,
        imageLayout: imageLayout || 'FULL_WIDTH',
        eventId: eventId || null,
        dealId: dealId || null,
        startTime: startTime ? new Date(startTime) : null,
        endTime: endTime ? new Date(endTime) : null,
        originalPrice: originalPrice || null,
        discountPrice: discountPrice || null
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
        },
        author: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            profileImage: true
          }
        }
      }
    });

    // Format response to match iOS expectations
    const formattedPost = {
      id: post.id,
      authorId: post.authorId,
      authorName: `${post.author.firstName} ${post.author.lastName}`,
      authorType: post.authorType,
      venueId: post.venueId,
      venueName: post.venue?.name || null,
      postType: post.postType,
      title: post.title,
      content: post.content,
      imageURL: post.mediaUrl,
      timestamp: post.createdAt.toISOString(),
      likes: post.likes,
      isLiked: false, // New posts are not liked by creator
      comments: post.comments,
      eventId: post.eventId,
      dealId: post.dealId,
      startTime: post.startTime?.toISOString() || null,
      endTime: post.endTime?.toISOString() || null,
      originalPrice: post.originalPrice,
      discountPrice: post.discountPrice
    };

    res.status(201).json({ post: formattedPost });
  } catch (error) {
    console.error('❌ Error creating post:', error);
    console.error('❌ Error details:', JSON.stringify(error, null, 2));
    if (error instanceof Error) {
      console.error('❌ Error message:', error.message);
      console.error('❌ Error stack:', error.stack);
    }
    res.status(500).json({
      error: 'Failed to create post',
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

/**
 * GET /posts/:postId
 * Get a specific post by ID
 */
router.get('/:postId', async (req: Request, res: Response) => {
  try {
    const { postId } = req.params;

    const post = await prisma.post.findUnique({
      where: { id: postId },
      include: {
        venue: {
          select: {
            id: true,
            name: true,
            category: true,
            venueIconUrl: true,
            location: true
          }
        },
        author: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            profileImage: true
          }
        },
        postComments: {
          orderBy: {
            createdAt: 'desc'
          },
          take: 10
        }
      }
    });

    if (!post) {
      return res.status(404).json({ error: 'Post not found' });
    }

    // Increment view count
    await prisma.post.update({
      where: { id: postId },
      data: { views: { increment: 1 } }
    });

    res.json({ post });
  } catch (error) {
    console.error('Error fetching post:', error);
    res.status(500).json({ error: 'Failed to fetch post' });
  }
});

/**
 * POST /posts/:postId/like
 * Like or unlike a post
 */
router.post('/:postId/like', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    const { postId } = req.params;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Check if already liked
    const existingLike = await prisma.postLike.findUnique({
      where: {
        postId_userId: {
          postId,
          userId
        }
      }
    });

    if (existingLike) {
      // Unlike
      await prisma.postLike.delete({
        where: {
          postId_userId: {
            postId,
            userId
          }
        }
      });

      await prisma.post.update({
        where: { id: postId },
        data: { likes: { decrement: 1 } }
      });

      res.json({ liked: false, message: 'Post unliked' });
    } else {
      // Like
      await prisma.postLike.create({
        data: {
          postId,
          userId
        }
      });

      await prisma.post.update({
        where: { id: postId },
        data: { likes: { increment: 1 } }
      });

      res.json({ liked: true, message: 'Post liked' });
    }
  } catch (error) {
    console.error('Error liking post:', error);
    res.status(500).json({ error: 'Failed to like post' });
  }
});

/**
 * POST /posts/:postId/comments
 * Add a comment to a post
 */
router.post('/:postId/comments', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    const { postId } = req.params;
    const { content } = req.body;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    if (!content || content.trim().length === 0) {
      return res.status(400).json({ error: 'Comment content is required' });
    }

    const comment = await prisma.postComment.create({
      data: {
        postId,
        userId,
        content: content.trim()
      }
    });

    // Increment comment count
    await prisma.post.update({
      where: { id: postId },
      data: { comments: { increment: 1 } }
    });

    res.status(201).json({ comment });
  } catch (error) {
    console.error('Error creating comment:', error);
    res.status(500).json({ error: 'Failed to create comment' });
  }
});

/**
 * DELETE /posts/:postId
 * Delete a post (soft delete)
 */
router.delete('/:postId', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    const { postId } = req.params;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const post = await prisma.post.findUnique({
      where: { id: postId },
      select: { authorId: true }
    });

    if (!post) {
      return res.status(404).json({ error: 'Post not found' });
    }

    if (post.authorId !== userId) {
      return res.status(403).json({ error: 'You can only delete your own posts' });
    }

    await prisma.post.update({
      where: { id: postId },
      data: { isActive: false }
    });

    res.json({ message: 'Post deleted successfully' });
  } catch (error) {
    console.error('Error deleting post:', error);
    res.status(500).json({ error: 'Failed to delete post' });
  }
});

export default router;
