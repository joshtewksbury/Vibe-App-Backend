import prisma from '../../lib/prisma';
import { SendFriendRequestDTO, ShareLocationDTO, FriendshipDTO } from './friends.dto';

export class FriendsService {
  /**
   * Get all accepted friends for a user
   */
  async getFriends(userId: string): Promise<FriendshipDTO[]> {
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
    return friendships.map(friendship => {
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
        isLocationSharingEnabled: friendship.isLocationSharingEnabled || false,
        lastSeen: friend.lastActiveAt
      };
    });
  }

  /**
   * Get pending friend requests for a user
   */
  async getFriendRequests(userId: string) {
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

    return requests;
  }

  /**
   * Send a friend request
   */
  async sendFriendRequest(userId: string, data: SendFriendRequestDTO) {
    const { friendId, friendEmail } = data;

    // Determine friend ID from email if provided
    let targetFriendId = friendId;
    if (!targetFriendId && friendEmail) {
      const friend = await prisma.user.findUnique({
        where: { email: friendEmail },
        select: { id: true }
      });

      if (!friend) {
        throw new Error('User not found');
      }

      targetFriendId = friend.id;
    }

    if (!targetFriendId) {
      throw new Error('Friend ID or email required');
    }

    // Can't friend yourself
    if (userId === targetFriendId) {
      throw new Error('Cannot send friend request to yourself');
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
      throw new Error(`Friendship already exists with status: ${existing.status}`);
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

    return friendship;
  }

  /**
   * Accept a friend request
   */
  async acceptFriendRequest(userId: string, friendshipId: string) {
    // Check if friendship exists and user is the receiver
    const friendship = await prisma.friendship.findUnique({
      where: { id: friendshipId }
    });

    if (!friendship) {
      throw new Error('Friend request not found');
    }

    if (friendship.receiverId !== userId) {
      throw new Error('Cannot accept this friend request');
    }

    if (friendship.status !== 'PENDING') {
      throw new Error('Friend request is not pending');
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

    return updated;
  }

  /**
   * Reject a friend request
   */
  async rejectFriendRequest(userId: string, friendshipId: string) {
    // Check if friendship exists and user is the receiver
    const friendship = await prisma.friendship.findUnique({
      where: { id: friendshipId }
    });

    if (!friendship) {
      throw new Error('Friend request not found');
    }

    if (friendship.receiverId !== userId) {
      throw new Error('Cannot reject this friend request');
    }

    if (friendship.status !== 'PENDING') {
      throw new Error('Friend request is not pending');
    }

    // Reject the request
    await prisma.friendship.update({
      where: { id: friendshipId },
      data: {
        status: 'REJECTED'
      }
    });

    return { message: 'Friend request rejected' };
  }

  /**
   * Remove a friend
   */
  async removeFriend(userId: string, friendshipId: string) {
    // Check if friendship exists and user is part of it
    const friendship = await prisma.friendship.findUnique({
      where: { id: friendshipId }
    });

    if (!friendship) {
      throw new Error('Friendship not found');
    }

    if (friendship.initiatorId !== userId && friendship.receiverId !== userId) {
      throw new Error('Cannot delete this friendship');
    }

    // Delete the friendship
    await prisma.friendship.delete({
      where: { id: friendshipId }
    });

    return { message: 'Friendship removed' };
  }

  /**
   * Share location with a friend
   */
  async shareLocation(userId: string, friendshipId: string, data: ShareLocationDTO) {
    const { latitude, longitude, venueId, venueName, accuracy } = data;

    // Check if friendship exists and user is part of it
    const friendship = await prisma.friendship.findUnique({
      where: { id: friendshipId }
    });

    if (!friendship) {
      throw new Error('Friendship not found');
    }

    if (friendship.initiatorId !== userId && friendship.receiverId !== userId) {
      throw new Error('Cannot update this friendship');
    }

    if (friendship.status !== 'ACCEPTED') {
      throw new Error('Can only share location with accepted friends');
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

    await prisma.friendship.update({
      where: { id: friendshipId },
      data: {
        lastSharedLocation: locationData as any,
        isLocationSharingEnabled: true
      }
    });

    return { success: true, location: locationData };
  }

  /**
   * Disable location sharing with a friend
   */
  async disableLocationSharing(userId: string, friendshipId: string) {
    // Check if friendship exists and user is part of it
    const friendship = await prisma.friendship.findUnique({
      where: { id: friendshipId }
    });

    if (!friendship) {
      throw new Error('Friendship not found');
    }

    if (friendship.initiatorId !== userId && friendship.receiverId !== userId) {
      throw new Error('Cannot update this friendship');
    }

    // Disable location sharing
    await prisma.friendship.update({
      where: { id: friendshipId },
      data: {
        isLocationSharingEnabled: false
      }
    });

    return { success: true, message: 'Location sharing disabled' };
  }

  /**
   * Search for users to add as friends
   */
  async searchUsers(userId: string, query: string) {
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

    return users;
  }
}

// Export singleton instance
export const friendsService = new FriendsService();
