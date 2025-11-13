import { Router } from 'express';
import pushNotificationService from '../services/pushNotificationService';
import { authMiddleware, AuthenticatedRequest } from '../shared/middleware/auth';
import prisma from '../lib/prisma';

const router = Router();

// Register device token
router.post('/register', authMiddleware, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.userId;
    const { token, deviceName, deviceModel, osVersion } = req.body;

    if (!token) {
      return res.status(400).json({
        success: false,
        error: 'Device token is required'
      });
    }

    // Check if token already exists
    const existing = await prisma.deviceToken.findUnique({
      where: { token }
    });

    let deviceToken;
    if (existing) {
      // Update existing token
      deviceToken = await prisma.deviceToken.update({
        where: { id: existing.id },
        data: {
          userId, // Update user if different
          active: true,
          deviceName,
          deviceModel,
          osVersion,
          lastUsed: new Date()
        }
      });
    } else {
      // Create new token
      deviceToken = await prisma.deviceToken.create({
        data: {
          userId,
          token,
          deviceName,
          deviceModel,
          osVersion,
          platform: 'ios'
        }
      });
    }

    res.json({
      success: true,
      data: deviceToken
    });
  } catch (error) {
    console.error('Error registering device token:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to register device token'
    });
  }
});

// Unregister device token
router.post('/unregister', authMiddleware, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.userId;
    const { token } = req.body;

    if (!token) {
      return res.status(400).json({
        success: false,
        error: 'Device token is required'
      });
    }

    await prisma.deviceToken.updateMany({
      where: {
        userId,
        token
      },
      data: {
        active: false
      }
    });

    res.json({
      success: true,
      message: 'Device token unregistered'
    });
  } catch (error) {
    console.error('Error unregistering device token:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to unregister device token'
    });
  }
});

// Get notification preferences
router.get('/preferences', authMiddleware, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.userId;

    const preferences = await prisma.notificationPreferences.findUnique({
      where: { userId }
    });

    // If no preferences exist, return defaults
    if (!preferences) {
      return res.json({
        success: true,
        data: {
          eventReminders: true,
          venueArrivals: true,
          friendActivity: true,
          promotions: true,
          messages: true,
          venueUpdates: true,
          newFollowers: true,
          likes: true,
          comments: true
        }
      });
    }

    res.json({
      success: true,
      data: preferences
    });
  } catch (error) {
    console.error('Error fetching notification preferences:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch notification preferences'
    });
  }
});

// Update notification preferences
router.put('/preferences', authMiddleware, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.userId;
    const preferences = req.body;

    const updated = await prisma.notificationPreferences.upsert({
      where: { userId },
      create: {
        userId,
        ...preferences
      },
      update: preferences
    });

    res.json({
      success: true,
      data: updated
    });
  } catch (error) {
    console.error('Error updating notification preferences:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update notification preferences'
    });
  }
});

// Test notification (development only)
router.post('/test', authMiddleware, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.userId;
    const { title, body, data } = req.body;

    await pushNotificationService.sendPushNotification(userId, {
      title: title || 'Test Notification',
      body: body || 'This is a test notification from Vibe',
      data: data || {}
    });

    res.json({
      success: true,
      message: 'Test notification sent'
    });
  } catch (error) {
    console.error('Error sending test notification:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to send test notification'
    });
  }
});

// Get notification history (admin only)
router.get('/history', authMiddleware, async (req: AuthenticatedRequest, res) => {
  try {
    // TODO: Add admin check
    const limit = parseInt(req.query.limit as string) || 50;
    const offset = parseInt(req.query.offset as string) || 0;

    const logs = await prisma.notificationLog.findMany({
      take: limit,
      skip: offset,
      orderBy: { createdAt: 'desc' }
    });

    const total = await prisma.notificationLog.count();

    res.json({
      success: true,
      data: {
        logs,
        total,
        limit,
        offset
      }
    });
  } catch (error) {
    console.error('Error fetching notification history:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch notification history'
    });
  }
});

export default router;
