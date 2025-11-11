import express from 'express';
import multer from 'multer';
import { asyncHandler, createError } from '../shared/middleware/errorHandler';
import { authMiddleware, AuthenticatedRequest } from '../shared/middleware/auth';
import { validateUpdateUser } from '../shared/utils/validation';
import { uploadFile } from '../services/cloudinaryService';
import prisma from '../lib/prisma';

const router = express.Router();

// Configure multer for memory storage
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'));
    }
  }
});

// GET /users/search - Search for users (public endpoint for friend search)
router.get('/search', asyncHandler(async (req, res) => {
  const { query } = req.query;

  if (!query || typeof query !== 'string' || query.trim().length < 2) {
    return res.json({ users: [], message: 'Query must be at least 2 characters' });
  }

  const searchTerm = query.trim().toLowerCase();

  // Search users by first name, last name, or email
  const users = await prisma.user.findMany({
    where: {
      OR: [
        { firstName: { contains: searchTerm, mode: 'insensitive' } },
        { lastName: { contains: searchTerm, mode: 'insensitive' } },
        { email: { contains: searchTerm, mode: 'insensitive' } }
      ]
    },
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      profileImage: true,
      location: true,
      musicPreferences: true,
      venuePreferences: true,
      goingOutFrequency: true,
      createdAt: true,
      lastActiveAt: true
    },
    take: 20 // Limit results
  });

  res.json({ users });
}));

// GET /users/me - Get current user profile (handled in auth routes)
// This is just for organization, actual endpoint is in auth.ts

// PATCH /users/profile - Update profile image
router.patch('/profile', authMiddleware, upload.single('profileImage'), asyncHandler(async (req: AuthenticatedRequest, res) => {
  const userId = req.user!.id;

  if (!req.file) {
    throw createError('No image file provided', 400);
  }

  console.log(`📤 Uploading profile image for user: ${userId}`);
  console.log(`📦 File size: ${(req.file.size / 1024).toFixed(2)}KB`);

  try {
    // Upload to Cloudinary
    const uploadResult = await uploadFile(
      req.file.buffer,
      'profile-images',
      'image',
      `profile_${userId}`
    );

    console.log(`✅ Uploaded to Cloudinary: ${uploadResult.secureUrl}`);

    // Update user in database
    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: { profileImage: uploadResult.secureUrl },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        profileImage: true,
        dateOfBirth: true,
        gender: true,
        musicPreferences: true,
        venuePreferences: true,
        goingOutFrequency: true,
        location: true,
        phoneNumber: true,
        isEmailVerified: true,
        createdAt: true,
        lastActiveAt: true
      }
    });

    console.log(`✅ Updated user profile image in database`);

    res.json({
      message: 'Profile image updated successfully',
      profileImage: uploadResult.secureUrl,
      user: updatedUser
    });
  } catch (error) {
    console.error('❌ Error uploading profile image:', error);
    throw createError('Failed to upload profile image', 500);
  }
}));

// PUT /users/me - Update current user profile
router.put('/me', authMiddleware, asyncHandler(async (req: AuthenticatedRequest, res) => {
  const { error, value } = validateUpdateUser(req.body);
  if (error) {
    throw createError(error.details[0].message, 400);
  }

  const updatedUser = await prisma.user.update({
    where: { id: req.user!.id },
    data: value,
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      dateOfBirth: true,
      gender: true,
      profileImage: true,
      musicPreferences: true,
      venuePreferences: true,
      goingOutFrequency: true,
      location: true,
      phoneNumber: true,
      role: true,
      updatedAt: true
    }
  });

  res.json({
    message: 'Profile updated successfully',
    user: updatedUser
  });
}));

// GET /users/me/activity - Get user activity
router.get('/me/activity', authMiddleware, asyncHandler(async (req: AuthenticatedRequest, res) => {
  const userId = req.user!.id;
  const { limit = 20, offset = 0 } = req.query;

  const [posts, recentVenues] = await Promise.all([
    prisma.post.findMany({
      where: { authorId: userId },
      include: {
        venue: {
          select: { id: true, name: true, location: true }
        }
      },
      orderBy: { createdAt: 'desc' },
      take: parseInt(limit as string),
      skip: parseInt(offset as string)
    }),
    // This would typically be from a visits/check-ins table
    // For now, we'll return empty array
    []
  ]);

  res.json({
    posts,
    recentVenues,
    metadata: {
      postsCount: posts.length,
      limit: parseInt(limit as string),
      offset: parseInt(offset as string)
    }
  });
}));

// DELETE /users/me - Delete user account
router.delete('/me', authMiddleware, asyncHandler(async (req: AuthenticatedRequest, res) => {
  const userId = req.user!.id;

  // In a production app, you might want to soft delete or anonymize data
  await prisma.user.delete({
    where: { id: userId }
  });

  res.json({
    message: 'Account deleted successfully'
  });
}));

// POST /users/device-token - Register device token for push notifications
router.post('/device-token', authMiddleware, asyncHandler(async (req: AuthenticatedRequest, res) => {
  const userId = req.user!.id;
  const { deviceToken, platform = 'ios' } = req.body;

  if (!deviceToken) {
    return res.status(400).json({ error: 'Device token is required' });
  }

  console.log(`📲 Registering device token for user ${userId}: ${deviceToken.substring(0, 10)}...`);

  // Check if token already exists
  const existing = await prisma.deviceToken.findUnique({
    where: {
      userId_token: {
        userId,
        token: deviceToken
      }
    }
  });

  if (existing) {
    // Reactivate if it was deactivated
    await prisma.deviceToken.update({
      where: { id: existing.id },
      data: { isActive: true, updatedAt: new Date() }
    });
    console.log(`✅ Device token reactivated for user ${userId}`);
  } else {
    // Create new device token
    await prisma.deviceToken.create({
      data: {
        userId,
        token: deviceToken,
        platform
      }
    });
    console.log(`✅ New device token registered for user ${userId}`);
  }

  res.json({
    success: true,
    message: 'Device token registered successfully'
  });
}));

// DELETE /users/device-token - Unregister device token
router.delete('/device-token', authMiddleware, asyncHandler(async (req: AuthenticatedRequest, res) => {
  const userId = req.user!.id;
  const { deviceToken } = req.body;

  if (!deviceToken) {
    return res.status(400).json({ error: 'Device token is required' });
  }

  console.log(`📲 Unregistering device token for user ${userId}`);

  // Deactivate the token instead of deleting
  await prisma.deviceToken.updateMany({
    where: {
      userId,
      token: deviceToken
    },
    data: {
      isActive: false
    }
  });

  console.log(`✅ Device token deactivated for user ${userId}`);

  res.json({
    success: true,
    message: 'Device token unregistered successfully'
  });
}));

export default router;