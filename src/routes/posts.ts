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

    // Format posts to match iOS expectations
    const formattedPosts = posts.map(post => ({
      id: post.id,
      authorId: post.authorId,
      authorName: `${post.author.firstName} ${post.author.lastName}`,
      authorProfileImage: post.author.profileImage || null,
      authorType: post.authorType,
      venueId: post.venueId,
      venueName: post.venue?.name || null,
      postType: post.postType,
      title: post.title,
      content: post.content,
      imageURL: post.mediaUrl,
      timestamp: post.createdAt.toISOString(),
      likes: post.likes,
      isLiked: false, // TODO: Check if current user liked this post
      comments: post.comments,
      eventId: post.eventId,
      dealId: post.dealId,
      startTime: post.startTime?.toISOString() || null,
      endTime: post.endTime?.toISOString() || null,
      originalPrice: post.originalPrice,
      discountPrice: post.discountPrice,
      style: post.postStyle,
      imageLayout: post.imageLayout
    }));

    res.json({ posts: formattedPosts });
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
    // Log body keys to see what's available
    console.log('📝 Request body keys:', Object.keys(req.body));

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
      discountPrice: post.discountPrice,
      style: post.postStyle,
      imageLayout: post.imageLayout
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

    // Format post to match iOS expectations
    const formattedPost = {
      id: post.id,
      authorId: post.authorId,
      authorName: `${post.author.firstName} ${post.author.lastName}`,
      authorProfileImage: post.author.profileImage || null,
      authorType: post.authorType,
      venueId: post.venueId,
      venueName: post.venue?.name || null,
      postType: post.postType,
      title: post.title,
      content: post.content,
      imageURL: post.mediaUrl,
      timestamp: post.createdAt.toISOString(),
      likes: post.likes,
      isLiked: false, // TODO: Check if current user liked this post
      comments: post.comments,
      eventId: post.eventId,
      dealId: post.dealId,
      startTime: post.startTime?.toISOString() || null,
      endTime: post.endTime?.toISOString() || null,
      originalPrice: post.originalPrice,
      discountPrice: post.discountPrice,
      style: post.postStyle,
      imageLayout: post.imageLayout,
      postComments: post.postComments
    };

    res.json({ post: formattedPost });
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

/**
 * GET /posts/user/me
 * Get posts created by the authenticated user
 */
router.get('/user/me', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const posts = await prisma.post.findMany({
      where: {
        authorId: userId,
        isActive: true
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
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    // Format posts to match iOS expectations
    const formattedPosts = posts.map(post => ({
      id: post.id,
      authorId: post.authorId,
      authorName: `${post.author.firstName} ${post.author.lastName}`,
      authorProfileImage: post.author.profileImage || null,
      authorType: post.authorType,
      venueId: post.venueId,
      venueName: post.venue?.name || null,
      venueIcon: post.venue?.venueIconUrl || null,
      postType: post.postType,
      postStyle: post.postStyle,
      title: post.title,
      content: post.content,
      imageURL: post.mediaUrl,
      imageLayout: post.imageLayout,
      timestamp: post.createdAt.toISOString(),
      createdAt: post.createdAt.toISOString(),
      likes: post.likes,
      likesCount: post.likes,
      isLiked: false,
      comments: post.comments,
      commentsCount: post.comments,
      eventId: post.eventId,
      dealId: post.dealId,
      startTime: post.startTime?.toISOString() || null,
      endTime: post.endTime?.toISOString() || null,
      originalPrice: post.originalPrice,
      discountPrice: post.discountPrice
    }));

    res.json({ posts: formattedPosts });
  } catch (error) {
    console.error('Error fetching user posts:', error);
    res.status(500).json({ error: 'Failed to fetch user posts' });
  }
});

/**
 * GET /posts/liked
 * Get posts liked by the authenticated user
 */
router.get('/liked', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Get posts liked by user
    const likedPosts = await prisma.postLike.findMany({
      where: {
        userId: userId
      },
      include: {
        post: {
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
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    // Format posts
    const formattedPosts = likedPosts
      .filter(like => like.post.isActive)
      .map(like => ({
        id: like.post.id,
        authorId: like.post.authorId,
        authorName: `${like.post.author.firstName} ${like.post.author.lastName}`,
        authorProfileImage: like.post.author.profileImage || null,
        authorType: like.post.authorType,
        venueId: like.post.venueId,
        venueName: like.post.venue?.name || null,
        venueIcon: like.post.venue?.venueIconUrl || null,
        postType: like.post.postType,
        postStyle: like.post.postStyle,
        title: like.post.title,
        content: like.post.content,
        imageURL: like.post.mediaUrl,
        imageLayout: like.post.imageLayout,
        timestamp: like.post.createdAt.toISOString(),
        createdAt: like.post.createdAt.toISOString(),
        likes: like.post.likes,
        likesCount: like.post.likes,
        isLiked: true,
        comments: like.post.comments,
        commentsCount: like.post.comments,
        eventId: like.post.eventId,
        dealId: like.post.dealId,
        startTime: like.post.startTime?.toISOString() || null,
        endTime: like.post.endTime?.toISOString() || null,
        originalPrice: like.post.originalPrice,
        discountPrice: like.post.discountPrice
      }));

    res.json({ posts: formattedPosts });
  } catch (error) {
    console.error('Error fetching liked posts:', error);
    res.status(500).json({ error: 'Failed to fetch liked posts' });
  }
});

/**
 * POST /posts/:postId/share
 * Share a post with friends via messages
 */
router.post('/:postId/share', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    const { postId } = req.params;
    const { recipientIds, message } = req.body;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    if (!recipientIds || !Array.isArray(recipientIds) || recipientIds.length === 0) {
      return res.status(400).json({ error: 'At least one recipient is required' });
    }

    // Verify post exists
    const post = await prisma.post.findUnique({
      where: { id: postId },
      select: {
        id: true,
        title: true,
        authorId: true,
        author: {
          select: {
            firstName: true,
            lastName: true
          }
        }
      }
    });

    if (!post) {
      return res.status(404).json({ error: 'Post not found' });
    }

    console.log(`📤 Sharing post ${postId} with ${recipientIds.length} recipients`);

    // For now, we'll just track the share without actually creating messages
    // In a full implementation, you'd create messages or notifications here

    // Increment share count
    await prisma.post.update({
      where: { id: postId },
      data: { shares: { increment: recipientIds.length } }
    });

    res.json({
      message: 'Post shared successfully',
      sharedWith: recipientIds.length
    });
  } catch (error) {
    console.error('Error sharing post:', error);
    res.status(500).json({ error: 'Failed to share post' });
  }
});

/**
 * POST /posts/:postId/save
 * Save a post
 */
router.post('/:postId/save', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    const { postId } = req.params;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Check if already saved
    const existing = await prisma.savedPost.findUnique({
      where: {
        userId_postId: {
          userId,
          postId
        }
      }
    });

    if (existing) {
      return res.json({ success: true, message: 'Post already saved' });
    }

    await prisma.savedPost.create({
      data: {
        userId,
        postId
      }
    });

    res.json({ success: true, message: 'Post saved' });
  } catch (error) {
    console.error('Error saving post:', error);
    res.status(500).json({ error: 'Failed to save post' });
  }
});

/**
 * DELETE /posts/:postId/save
 * Unsave a post
 */
router.delete('/:postId/save', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    const { postId } = req.params;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    await prisma.savedPost.delete({
      where: {
        userId_postId: {
          userId,
          postId
        }
      }
    });

    res.json({ success: true, message: 'Post unsaved' });
  } catch (error) {
    console.error('Error unsaving post:', error);
    res.status(500).json({ error: 'Failed to unsave post' });
  }
});

/**
 * POST /posts/:postId/report
 * Report a post
 */
router.post('/:postId/report', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    const { postId } = req.params;
    const { reason } = req.body;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    if (!reason) {
      return res.status(400).json({ error: 'Reason is required' });
    }

    await prisma.reportedPost.create({
      data: {
        userId,
        postId,
        reason
      }
    });

    res.json({ success: true, message: 'Post reported' });
  } catch (error) {
    console.error('Error reporting post:', error);
    res.status(500).json({ error: 'Failed to report post' });
  }
});

/**
 * POST /posts/:postId/hide
 * Hide a post
 */
router.post('/:postId/hide', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    const { postId } = req.params;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Check if already hidden
    const existing = await prisma.hiddenPost.findUnique({
      where: {
        userId_postId: {
          userId,
          postId
        }
      }
    });

    if (existing) {
      return res.json({ success: true, message: 'Post already hidden' });
    }

    await prisma.hiddenPost.create({
      data: {
        userId,
        postId
      }
    });

    res.json({ success: true, message: 'Post hidden' });
  } catch (error) {
    console.error('Error hiding post:', error);
    res.status(500).json({ error: 'Failed to hide post' });
  }
});

export default router;
