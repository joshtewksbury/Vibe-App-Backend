import express from 'express';
import { PrismaClient } from '@prisma/client';
import { asyncHandler, createError } from '../middleware/errorHandler';
import { AuthenticatedRequest } from '../middleware/auth';
import { validateUpdateUser } from '../utils/validation';

const router = express.Router();
const prisma = new PrismaClient();

// GET /users/me - Get current user profile (handled in auth routes)
// This is just for organization, actual endpoint is in auth.ts

// PUT /users/me - Update current user profile
router.put('/me', asyncHandler(async (req: AuthenticatedRequest, res) => {
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
router.get('/me/activity', asyncHandler(async (req: AuthenticatedRequest, res) => {
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
router.delete('/me', asyncHandler(async (req: AuthenticatedRequest, res) => {
  const userId = req.user!.id;

  // In a production app, you might want to soft delete or anonymize data
  await prisma.user.delete({
    where: { id: userId }
  });

  res.json({
    message: 'Account deleted successfully'
  });
}));

export default router;