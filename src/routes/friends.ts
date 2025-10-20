import express, { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { authMiddleware, AuthRequest } from '../middleware/auth';

const router = express.Router();
const prisma = new PrismaClient();

/**
 * GET /friends
 * Get all friends for the authenticated user
 */
router.get('/', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Get all accepted friendships where user is either initiator or receiver
    const friendships = await prisma.friendship.findMany({
      where: {
        OR: [
          { initiatorId: userId, status: 'ACCEPTED' },
          { receiverId: userId, status: 'ACCEPTED' }
        ]
      },
      include: {
        initiator: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            profileImage: true,
            location: true,
            lastActiveAt: true
          }
        },
        receiver: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            profileImage: true,
            location: true,
            lastActiveAt: true
          }
        }
      },
      orderBy: {
        updatedAt: 'desc'
      }
    });

    // Format response to include friend data
    const friends = friendships.map(friendship => {
      const friend = friendship.initiatorId === userId
        ? friendship.receiver
        : friendship.initiator;

      return {
        id: friendship.id,
        userId: userId,
        friendId: friend.id,
        friendUser: friend,
        status: friendship.status,
        requestedAt: friendship.createdAt,
        acceptedAt: friendship.acceptedAt,
        lastKnownLocation: friendship.lastSharedLocation,
        isLocationSharingEnabled: friendship.isLocationSharingEnabled,
        lastSeen: friend.lastActiveAt
      };
    });

    res.json({ friends });
  } catch (error) {
    console.error('Error fetching friends:', error);
    res.status(500).json({ error: 'Failed to fetch friends' });
  }
});

/**
 * GET /friends/requests
 * Get pending friend requests (both incoming and outgoing)
 */
router.get('/requests', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Get all pending requests where user is either initiator or receiver
    const requests = await prisma.friendship.findMany({
      where: {
        OR: [
          { receiverId: userId, status: 'PENDING' },
          { initiatorId: userId, status: 'PENDING' }
        ]
      },
      include: {
        initiator: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            profileImage: true,
            location: true,
            lastActiveAt: true
          }
        },
        receiver: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            profileImage: true,
            location: true,
            lastActiveAt: true
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    res.json({ requests });
  } catch (error) {
    console.error('Error fetching friend requests:', error);
    res.status(500).json({ error: 'Failed to fetch friend requests' });
  }
});

/**
 * POST /friends/request
 * Send a friend request
 */
router.post('/request', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    const { friendId, friendEmail } = req.body;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Determine friend ID from email if provided
    let targetFriendId = friendId;
    if (!targetFriendId && friendEmail) {
      const friend = await prisma.user.findUnique({
        where: { email: friendEmail },
        select: { id: true }
      });

      if (!friend) {
        return res.status(404).json({ error: 'User not found' });
      }

      targetFriendId = friend.id;
    }

    if (!targetFriendId) {
      return res.status(400).json({ error: 'Friend ID or email required' });
    }

    // Can't friend yourself
    if (userId === targetFriendId) {
      return res.status(400).json({ error: 'Cannot send friend request to yourself' });
    }

    // Check if friendship already exists
    const existing = await prisma.friendship.findFirst({
      where: {
        OR: [
          { initiatorId: userId, receiverId: targetFriendId },
          { initiatorId: targetFriendId, receiverId: userId }
        ]
      }
    });

    if (existing) {
      return res.status(400).json({
        error: 'Friendship already exists',
        status: existing.status
      });
    }

    // Create friendship request
    const friendship = await prisma.friendship.create({
      data: {
        initiatorId: userId,
        receiverId: targetFriendId,
        status: 'PENDING'
      },
      include: {
        receiver: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            profileImage: true
          }
        }
      }
    });

    res.status(201).json({ friendship });
  } catch (error) {
    console.error('Error creating friend request:', error);
    res.status(500).json({ error: 'Failed to create friend request' });
  }
});

/**
 * POST /friends/accept/:friendshipId
 * Accept a friend request
 */
router.post('/accept/:friendshipId', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    const { friendshipId } = req.params;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Check if friendship exists and user is the receiver
    const friendship = await prisma.friendship.findUnique({
      where: { id: friendshipId }
    });

    if (!friendship) {
      return res.status(404).json({ error: 'Friend request not found' });
    }

    if (friendship.receiverId !== userId) {
      return res.status(403).json({ error: 'Cannot accept this friend request' });
    }

    if (friendship.status !== 'PENDING') {
      return res.status(400).json({ error: 'Friend request is not pending' });
    }

    // Accept the request
    const updated = await prisma.friendship.update({
      where: { id: friendshipId },
      data: {
        status: 'ACCEPTED',
        acceptedAt: new Date()
      },
      include: {
        initiator: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            profileImage: true
          }
        }
      }
    });

    res.json({ friendship: updated });
  } catch (error) {
    console.error('Error accepting friend request:', error);
    res.status(500).json({ error: 'Failed to accept friend request' });
  }
});

/**
 * POST /friends/reject/:friendshipId
 * Reject a friend request
 */
router.post('/reject/:friendshipId', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    const { friendshipId } = req.params;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Check if friendship exists and user is the receiver
    const friendship = await prisma.friendship.findUnique({
      where: { id: friendshipId }
    });

    if (!friendship) {
      return res.status(404).json({ error: 'Friend request not found' });
    }

    if (friendship.receiverId !== userId) {
      return res.status(403).json({ error: 'Cannot reject this friend request' });
    }

    if (friendship.status !== 'PENDING') {
      return res.status(400).json({ error: 'Friend request is not pending' });
    }

    // Reject the request (or delete it)
    await prisma.friendship.update({
      where: { id: friendshipId },
      data: {
        status: 'REJECTED'
      }
    });

    res.json({ message: 'Friend request rejected' });
  } catch (error) {
    console.error('Error rejecting friend request:', error);
    res.status(500).json({ error: 'Failed to reject friend request' });
  }
});

/**
 * DELETE /friends/:friendshipId
 * Remove a friend
 */
router.delete('/:friendshipId', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    const { friendshipId } = req.params;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Check if friendship exists and user is part of it
    const friendship = await prisma.friendship.findUnique({
      where: { id: friendshipId }
    });

    if (!friendship) {
      return res.status(404).json({ error: 'Friendship not found' });
    }

    if (friendship.initiatorId !== userId && friendship.receiverId !== userId) {
      return res.status(403).json({ error: 'Cannot delete this friendship' });
    }

    // Delete the friendship
    await prisma.friendship.delete({
      where: { id: friendshipId }
    });

    res.json({ message: 'Friendship removed' });
  } catch (error) {
    console.error('Error removing friend:', error);
    res.status(500).json({ error: 'Failed to remove friend' });
  }
});

/**
 * POST /friends/:friendshipId/location
 * Share location with a friend
 */
router.post('/:friendshipId/location', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    const { friendshipId } = req.params;
    const { latitude, longitude, venueId, venueName, accuracy } = req.body;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Validate location data
    if (!latitude || !longitude) {
      return res.status(400).json({ error: 'Latitude and longitude required' });
    }

    // Check if friendship exists and user is part of it
    const friendship = await prisma.friendship.findUnique({
      where: { id: friendshipId }
    });

    if (!friendship) {
      return res.status(404).json({ error: 'Friendship not found' });
    }

    if (friendship.initiatorId !== userId && friendship.receiverId !== userId) {
      return res.status(403).json({ error: 'Cannot update this friendship' });
    }

    if (friendship.status !== 'ACCEPTED') {
      return res.status(400).json({ error: 'Can only share location with accepted friends' });
    }

    // Update location
    const locationData = {
      latitude,
      longitude,
      venueId: venueId || null,
      venueName: venueName || null,
      timestamp: new Date().toISOString(),
      accuracy: accuracy || 10.0
    };

    const updated = await prisma.friendship.update({
      where: { id: friendshipId },
      data: {
        lastSharedLocation: locationData as any,
        isLocationSharingEnabled: true
      }
    });

    res.json({ success: true, location: locationData });
  } catch (error) {
    console.error('Error sharing location:', error);
    res.status(500).json({ error: 'Failed to share location' });
  }
});

/**
 * POST /friends/:friendshipId/location/disable
 * Disable location sharing with a friend
 */
router.post('/:friendshipId/location/disable', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    const { friendshipId } = req.params;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Check if friendship exists and user is part of it
    const friendship = await prisma.friendship.findUnique({
      where: { id: friendshipId }
    });

    if (!friendship) {
      return res.status(404).json({ error: 'Friendship not found' });
    }

    if (friendship.initiatorId !== userId && friendship.receiverId !== userId) {
      return res.status(403).json({ error: 'Cannot update this friendship' });
    }

    // Disable location sharing
    await prisma.friendship.update({
      where: { id: friendshipId },
      data: {
        isLocationSharingEnabled: false
      }
    });

    res.json({ success: true, message: 'Location sharing disabled' });
  } catch (error) {
    console.error('Error disabling location sharing:', error);
    res.status(500).json({ error: 'Failed to disable location sharing' });
  }
});

/**
 * GET /friends/search
 * Search for users to add as friends
 */
router.get('/search', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    const { query } = req.query;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    if (!query || typeof query !== 'string') {
      return res.status(400).json({ error: 'Search query required' });
    }

    // Search for users by email, firstName, or lastName
    const users = await prisma.user.findMany({
      where: {
        AND: [
          { id: { not: userId } }, // Exclude current user
          {
            OR: [
              { email: { contains: query, mode: 'insensitive' } },
              { firstName: { contains: query, mode: 'insensitive' } },
              { lastName: { contains: query, mode: 'insensitive' } }
            ]
          }
        ]
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        profileImage: true,
        location: true
      },
      take: 20
    });

    res.json({ users });
  } catch (error) {
    console.error('Error searching users:', error);
    res.status(500).json({ error: 'Failed to search users' });
  }
});

export default router;
