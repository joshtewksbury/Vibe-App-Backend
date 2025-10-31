import { Response } from 'express';
import { friendsService } from './friends.service';
import { validateSendFriendRequest, validateShareLocation, validateSearchQuery } from './friends.dto';
import { AuthRequest } from '../../shared/middleware/auth';

export class FriendsController {
  /**
   * GET /friends
   * Get all friends for the authenticated user
   */
  async getFriends(req: AuthRequest, res: Response): Promise<void> {
    try {
      const userId = req.user?.userId;

      if (!userId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const friends = await friendsService.getFriends(userId);

      res.json({ friends });
    } catch (error) {
      console.error('Error fetching friends:', error);
      res.status(500).json({ error: 'Failed to fetch friends' });
    }
  }

  /**
   * GET /friends/requests
   * Get pending friend requests
   */
  async getFriendRequests(req: AuthRequest, res: Response): Promise<void> {
    try {
      const userId = req.user?.userId;

      if (!userId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const requests = await friendsService.getFriendRequests(userId);

      res.json({ requests });
    } catch (error) {
      console.error('Error fetching friend requests:', error);
      res.status(500).json({ error: 'Failed to fetch friend requests' });
    }
  }

  /**
   * POST /friends/request
   * Send a friend request
   */
  async sendFriendRequest(req: AuthRequest, res: Response): Promise<void> {
    try {
      const userId = req.user?.userId;

      if (!userId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      // Validate request body
      const { error, value } = validateSendFriendRequest(req.body);
      if (error) {
        res.status(400).json({ error: error.details[0].message });
        return;
      }

      const friendship = await friendsService.sendFriendRequest(userId, value);

      res.status(201).json({ friendship });
    } catch (error) {
      if (error instanceof Error) {
        if (error.message.includes('not found')) {
          res.status(404).json({ error: error.message });
          return;
        }
        if (error.message.includes('already exists') || error.message.includes('Cannot')) {
          res.status(400).json({ error: error.message });
          return;
        }
      }
      console.error('Error creating friend request:', error);
      res.status(500).json({ error: 'Failed to create friend request' });
    }
  }

  /**
   * POST /friends/accept/:friendshipId
   * Accept a friend request
   */
  async acceptFriendRequest(req: AuthRequest, res: Response): Promise<void> {
    try {
      const userId = req.user?.userId;
      const { friendshipId } = req.params;

      if (!userId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const friendship = await friendsService.acceptFriendRequest(userId, friendshipId);

      res.json({ friendship });
    } catch (error) {
      if (error instanceof Error) {
        if (error.message.includes('not found')) {
          res.status(404).json({ error: error.message });
          return;
        }
        if (error.message.includes('Cannot') || error.message.includes('not pending')) {
          res.status(400).json({ error: error.message });
          return;
        }
      }
      console.error('Error accepting friend request:', error);
      res.status(500).json({ error: 'Failed to accept friend request' });
    }
  }

  /**
   * POST /friends/reject/:friendshipId
   * Reject a friend request
   */
  async rejectFriendRequest(req: AuthRequest, res: Response): Promise<void> {
    try {
      const userId = req.user?.userId;
      const { friendshipId } = req.params;

      if (!userId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const result = await friendsService.rejectFriendRequest(userId, friendshipId);

      res.json(result);
    } catch (error) {
      if (error instanceof Error) {
        if (error.message.includes('not found')) {
          res.status(404).json({ error: error.message });
          return;
        }
        if (error.message.includes('Cannot') || error.message.includes('not pending')) {
          res.status(400).json({ error: error.message });
          return;
        }
      }
      console.error('Error rejecting friend request:', error);
      res.status(500).json({ error: 'Failed to reject friend request' });
    }
  }

  /**
   * DELETE /friends/:friendshipId
   * Remove a friend
   */
  async removeFriend(req: AuthRequest, res: Response): Promise<void> {
    try {
      const userId = req.user?.userId;
      const { friendshipId } = req.params;

      if (!userId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const result = await friendsService.removeFriend(userId, friendshipId);

      res.json(result);
    } catch (error) {
      if (error instanceof Error) {
        if (error.message.includes('not found')) {
          res.status(404).json({ error: error.message });
          return;
        }
        if (error.message.includes('Cannot')) {
          res.status(403).json({ error: error.message });
          return;
        }
      }
      console.error('Error removing friend:', error);
      res.status(500).json({ error: 'Failed to remove friend' });
    }
  }

  /**
   * POST /friends/:friendshipId/location
   * Share location with a friend
   */
  async shareLocation(req: AuthRequest, res: Response): Promise<void> {
    try {
      const userId = req.user?.userId;
      const { friendshipId } = req.params;

      if (!userId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      // Validate request body
      const { error, value } = validateShareLocation(req.body);
      if (error) {
        res.status(400).json({ error: error.details[0].message });
        return;
      }

      const result = await friendsService.shareLocation(userId, friendshipId, value);

      res.json(result);
    } catch (error) {
      if (error instanceof Error) {
        if (error.message.includes('not found')) {
          res.status(404).json({ error: error.message });
          return;
        }
        if (error.message.includes('Cannot') || error.message.includes('Can only')) {
          res.status(400).json({ error: error.message });
          return;
        }
      }
      console.error('Error sharing location:', error);
      res.status(500).json({ error: 'Failed to share location' });
    }
  }

  /**
   * POST /friends/:friendshipId/location/disable
   * Disable location sharing with a friend
   */
  async disableLocationSharing(req: AuthRequest, res: Response): Promise<void> {
    try {
      const userId = req.user?.userId;
      const { friendshipId } = req.params;

      if (!userId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const result = await friendsService.disableLocationSharing(userId, friendshipId);

      res.json(result);
    } catch (error) {
      if (error instanceof Error) {
        if (error.message.includes('not found')) {
          res.status(404).json({ error: error.message });
          return;
        }
        if (error.message.includes('Cannot')) {
          res.status(403).json({ error: error.message });
          return;
        }
      }
      console.error('Error disabling location sharing:', error);
      res.status(500).json({ error: 'Failed to disable location sharing' });
    }
  }

  /**
   * GET /friends/search
   * Search for users to add as friends
   */
  async searchUsers(req: AuthRequest, res: Response): Promise<void> {
    try {
      const userId = req.user?.userId;

      if (!userId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      // Validate query parameter
      const { error, value } = validateSearchQuery({ query: req.query.query });
      if (error) {
        res.status(400).json({ error: error.details[0].message });
        return;
      }

      const users = await friendsService.searchUsers(userId, value.query);

      res.json({ users });
    } catch (error) {
      console.error('Error searching users:', error);
      res.status(500).json({ error: 'Failed to search users' });
    }
  }
}

// Export singleton instance
export const friendsController = new FriendsController();
