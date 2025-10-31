import express, { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { authMiddleware, AuthRequest } from '../shared/middleware/auth';

const router = express.Router();
const prisma = new PrismaClient();

// ============================================
// GET USER SETTINGS
// ============================================
router.get('/settings', authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.userId;

    let settings = await prisma.userSettings.findUnique({
      where: { userId }
    });

    // Create default settings if they don't exist
    if (!settings) {
      settings = await prisma.userSettings.create({
        data: { userId }
      });
    }

    res.json({
      success: true,
      settings
    });
  } catch (error) {
    console.error('Get settings error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve settings'
    });
  }
});

// ============================================
// UPDATE USER SETTINGS
// ============================================
router.patch('/settings', authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.userId;
    const updates = req.body;

    // Validate updates object
    if (!updates || typeof updates !== 'object') {
      return res.status(400).json({
        success: false,
        message: 'Invalid settings data'
      });
    }

    // Ensure settings exist
    let settings = await prisma.userSettings.findUnique({
      where: { userId }
    });

    if (!settings) {
      settings = await prisma.userSettings.create({
        data: { userId }
      });
    }

    // Update settings
    const updatedSettings = await prisma.userSettings.update({
      where: { userId },
      data: updates
    });

    res.json({
      success: true,
      settings: updatedSettings,
      message: 'Settings updated successfully'
    });
  } catch (error) {
    console.error('Update settings error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update settings'
    });
  }
});

// ============================================
// CHANGE PASSWORD
// ============================================
router.post('/change-password', authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.userId;
    const { currentPassword, newPassword } = req.body;

    // Validation
    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        message: 'Current password and new password are required'
      });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({
        success: false,
        message: 'New password must be at least 8 characters long'
      });
    }

    // Get user
    const user = await prisma.user.findUnique({
      where: { id: userId }
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Verify current password
    const isValid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!isValid) {
      return res.status(401).json({
        success: false,
        message: 'Current password is incorrect'
      });
    }

    // Check if new password is same as current
    const isSamePassword = await bcrypt.compare(newPassword, user.passwordHash);
    if (isSamePassword) {
      return res.status(400).json({
        success: false,
        message: 'New password must be different from current password'
      });
    }

    // Hash new password
    const newPasswordHash = await bcrypt.hash(newPassword, 10);

    // Update password
    await prisma.user.update({
      where: { id: userId },
      data: {
        passwordHash: newPasswordHash,
        updatedAt: new Date()
      }
    });

    // Invalidate all refresh tokens for security
    await prisma.refreshToken.deleteMany({
      where: { userId }
    });

    // Log password change
    await prisma.loginHistory.create({
      data: {
        userId,
        ipAddress: req.ip || 'unknown',
        userAgent: req.headers['user-agent'] || 'unknown',
        deviceType: getDeviceType(req.headers['user-agent'] || ''),
        success: true,
        createdAt: new Date()
      }
    });

    res.json({
      success: true,
      message: 'Password changed successfully. Please log in again.'
    });
  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to change password'
    });
  }
});

// ============================================
// REQUEST PASSWORD RESET
// ============================================
router.post('/request-password-reset', async (req: Request, res: Response) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: 'Email is required'
      });
    }

    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase() }
    });

    // Don't reveal if user exists or not (security best practice)
    if (!user) {
      return res.json({
        success: true,
        message: 'If an account with that email exists, a password reset link has been sent.'
      });
    }

    // Generate reset token
    const token = crypto.randomBytes(32).toString('hex');
    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');
    const expiresAt = new Date(Date.now() + 3600000); // 1 hour

    // Save token to database
    await prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        token: hashedToken,
        expiresAt
      }
    });

    // TODO: Send email with reset link
    // const resetLink = `${process.env.FRONTEND_URL}/reset-password?token=${token}`;
    // await sendEmail(user.email, 'Password Reset', resetLink);

    console.log(`Password reset token for ${email}: ${token}`);

    res.json({
      success: true,
      message: 'If an account with that email exists, a password reset link has been sent.',
      // In development, return token for testing
      ...(process.env.NODE_ENV === 'development' && { token })
    });
  } catch (error) {
    console.error('Request password reset error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to process password reset request'
    });
  }
});

// ============================================
// RESET PASSWORD WITH TOKEN
// ============================================
router.post('/reset-password', async (req: Request, res: Response) => {
  try {
    const { token, newPassword } = req.body;

    if (!token || !newPassword) {
      return res.status(400).json({
        success: false,
        message: 'Token and new password are required'
      });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 8 characters long'
      });
    }

    // Hash the token to compare with database
    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

    // Find valid token
    const resetToken = await prisma.passwordResetToken.findFirst({
      where: {
        token: hashedToken,
        expiresAt: { gt: new Date() },
        usedAt: null
      }
    });

    if (!resetToken) {
      return res.status(400).json({
        success: false,
        message: 'Invalid or expired reset token'
      });
    }

    // Hash new password
    const newPasswordHash = await bcrypt.hash(newPassword, 10);

    // Update password
    await prisma.user.update({
      where: { id: resetToken.userId },
      data: {
        passwordHash: newPasswordHash,
        updatedAt: new Date()
      }
    });

    // Mark token as used
    await prisma.passwordResetToken.update({
      where: { id: resetToken.id },
      data: { usedAt: new Date() }
    });

    // Invalidate all refresh tokens
    await prisma.refreshToken.deleteMany({
      where: { userId: resetToken.userId }
    });

    res.json({
      success: true,
      message: 'Password reset successfully. Please log in with your new password.'
    });
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to reset password'
    });
  }
});

// ============================================
// REQUEST ACCOUNT DELETION
// ============================================
router.post('/request-deletion', authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.userId;
    const { reason } = req.body;

    // Check if deletion already requested
    const existingRequest = await prisma.accountDeletionRequest.findUnique({
      where: { userId }
    });

    if (existingRequest && existingRequest.status === 'PENDING') {
      return res.status(400).json({
        success: false,
        message: 'Account deletion already requested',
        scheduledFor: existingRequest.scheduledFor
      });
    }

    // Schedule deletion for 30 days from now (grace period)
    const scheduledFor = new Date();
    scheduledFor.setDate(scheduledFor.getDate() + 30);

    const deletionRequest = await prisma.accountDeletionRequest.create({
      data: {
        userId,
        scheduledFor,
        reason: reason || null,
        status: 'PENDING'
      }
    });

    res.json({
      success: true,
      message: 'Account deletion requested. Your account will be deleted in 30 days. You can cancel anytime before then.',
      scheduledFor: deletionRequest.scheduledFor
    });
  } catch (error) {
    console.error('Request deletion error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to request account deletion'
    });
  }
});

// ============================================
// CANCEL ACCOUNT DELETION
// ============================================
router.post('/cancel-deletion', authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.userId;

    const deletionRequest = await prisma.accountDeletionRequest.findUnique({
      where: { userId }
    });

    if (!deletionRequest || deletionRequest.status !== 'PENDING') {
      return res.status(404).json({
        success: false,
        message: 'No pending deletion request found'
      });
    }

    await prisma.accountDeletionRequest.update({
      where: { userId },
      data: {
        status: 'CANCELLED',
        cancelledAt: new Date()
      }
    });

    res.json({
      success: true,
      message: 'Account deletion cancelled successfully'
    });
  } catch (error) {
    console.error('Cancel deletion error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to cancel account deletion'
    });
  }
});

// ============================================
// IMMEDIATE ACCOUNT DELETION (PERMANENT)
// ============================================
router.delete('/delete-now', authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.userId;
    const { password, confirmation } = req.body;

    // Require password confirmation
    if (!password || confirmation !== 'DELETE MY ACCOUNT') {
      return res.status(400).json({
        success: false,
        message: 'Password and confirmation required'
      });
    }

    // Verify password
    const user = await prisma.user.findUnique({
      where: { id: userId }
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    const isValid = await bcrypt.compare(password, user.passwordHash);
    if (!isValid) {
      return res.status(401).json({
        success: false,
        message: 'Incorrect password'
      });
    }

    // Delete user and all related data (cascade)
    await prisma.user.delete({
      where: { id: userId }
    });

    res.json({
      success: true,
      message: 'Account deleted successfully'
    });
  } catch (error) {
    console.error('Delete account error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete account'
    });
  }
});

// ============================================
// BLOCK USER
// ============================================
router.post('/block-user', authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.userId;
    const { blockedUserId, reason } = req.body;

    if (!blockedUserId) {
      return res.status(400).json({
        success: false,
        message: 'User ID to block is required'
      });
    }

    if (blockedUserId === userId) {
      return res.status(400).json({
        success: false,
        message: 'Cannot block yourself'
      });
    }

    // Check if already blocked
    const existing = await prisma.blockedUser.findUnique({
      where: {
        userId_blockedUserId: {
          userId,
          blockedUserId
        }
      }
    });

    if (existing) {
      return res.status(400).json({
        success: false,
        message: 'User already blocked'
      });
    }

    // Block user
    await prisma.blockedUser.create({
      data: {
        userId,
        blockedUserId,
        reason: reason || null
      }
    });

    // Remove friendship if exists
    await prisma.friendship.deleteMany({
      where: {
        OR: [
          { initiatorId: userId, receiverId: blockedUserId },
          { initiatorId: blockedUserId, receiverId: userId }
        ]
      }
    });

    res.json({
      success: true,
      message: 'User blocked successfully'
    });
  } catch (error) {
    console.error('Block user error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to block user'
    });
  }
});

// ============================================
// UNBLOCK USER
// ============================================
router.delete('/unblock-user/:blockedUserId', authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.userId;
    const { blockedUserId } = req.params;

    await prisma.blockedUser.deleteMany({
      where: {
        userId,
        blockedUserId
      }
    });

    res.json({
      success: true,
      message: 'User unblocked successfully'
    });
  } catch (error) {
    console.error('Unblock user error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to unblock user'
    });
  }
});

// ============================================
// GET BLOCKED USERS
// ============================================
router.get('/blocked-users', authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.userId;

    const blockedUsers = await prisma.blockedUser.findMany({
      where: { userId },
      orderBy: { blockedAt: 'desc' }
    });

    res.json({
      success: true,
      blockedUsers
    });
  } catch (error) {
    console.error('Get blocked users error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve blocked users'
    });
  }
});

// ============================================
// GET LOGIN HISTORY
// ============================================
router.get('/login-history', authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.userId;
    const limit = parseInt(req.query.limit as string) || 20;

    const history = await prisma.loginHistory.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: limit
    });

    res.json({
      success: true,
      history
    });
  } catch (error) {
    console.error('Get login history error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve login history'
    });
  }
});

// ============================================
// EXPORT USER DATA (GDPR)
// ============================================
router.post('/export-data', authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.userId;

    // Gather all user data
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        posts: true,
        settings: true,
        friendshipsInitiated: true,
        friendshipsReceived: true,
        sentMessages: true,
        receivedMessages: true
      }
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Remove sensitive data
    const exportData = {
      ...user,
      passwordHash: '[REDACTED]',
      encryptedPrivateKey: '[REDACTED]',
      exportedAt: new Date()
    };

    res.json({
      success: true,
      data: exportData,
      message: 'User data exported successfully'
    });
  } catch (error) {
    console.error('Export data error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to export user data'
    });
  }
});

// Helper function to determine device type
function getDeviceType(userAgent: string): string {
  if (/iPhone|iPad|iPod/.test(userAgent)) return 'iOS';
  if (/Android/.test(userAgent)) return 'Android';
  if (/Windows/.test(userAgent)) return 'Windows';
  if (/Mac/.test(userAgent)) return 'MacOS';
  return 'Unknown';
}

export default router;
