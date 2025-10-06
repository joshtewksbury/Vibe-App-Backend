import express, { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { encryptMessage, decryptMessage } from '../utils/encryption';

const router = express.Router();
const prisma = new PrismaClient();

/**
 * GET /messages/conversations
 * Get all conversations for the authenticated user
 */
router.get('/conversations', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Get all conversations where user is a participant
    const participations = await prisma.conversationParticipant.findMany({
      where: {
        userId: userId,
        isActive: true
      },
      include: {
        conversation: {
          include: {
            participants: {
              include: {
                user: {
                  select: {
                    id: true,
                    email: true,
                    firstName: true,
                    lastName: true,
                    profileImage: true,
                    lastActiveAt: true
                  }
                }
              },
              where: {
                isActive: true
              }
            },
            messages: {
              orderBy: {
                createdAt: 'desc'
              },
              take: 1,
              include: {
                sender: {
                  select: {
                    id: true,
                    firstName: true,
                    lastName: true
                  }
                }
              }
            }
          }
        }
      },
      orderBy: {
        conversation: {
          updatedAt: 'desc'
        }
      }
    });

    // Format conversations
    const conversations = participations.map(participation => {
      const conversation = participation.conversation;
      const lastMessage = conversation.messages[0] || null;

      // Calculate unread count
      const unreadCount = lastMessage && lastMessage.createdAt > participation.lastReadAt
        ? 1 // Simplified - would need to count all unread messages
        : 0;

      return {
        id: conversation.id,
        type: conversation.type,
        name: conversation.name,
        participants: conversation.participants.map(p => p.user),
        lastMessage: lastMessage ? {
          id: lastMessage.id,
          senderId: lastMessage.senderId,
          senderName: `${lastMessage.sender.firstName} ${lastMessage.sender.lastName}`,
          encryptedContent: lastMessage.encryptedContent,
          iv: lastMessage.iv,
          authTag: lastMessage.authTag,
          messageType: lastMessage.messageType,
          createdAt: lastMessage.createdAt
        } : null,
        lastActivity: conversation.updatedAt,
        unreadCount,
        lastReadAt: participation.lastReadAt
      };
    });

    res.json({ conversations });
  } catch (error) {
    console.error('Error fetching conversations:', error);
    res.status(500).json({ error: 'Failed to fetch conversations' });
  }
});

/**
 * GET /messages/conversations/:conversationId
 * Get messages in a conversation
 */
router.get('/conversations/:conversationId', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    const { conversationId } = req.params;
    const { limit = 50, before } = req.query;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Verify user is a participant
    const participant = await prisma.conversationParticipant.findFirst({
      where: {
        conversationId,
        userId,
        isActive: true
      }
    });

    if (!participant) {
      return res.status(403).json({ error: 'Not a participant in this conversation' });
    }

    // Build query for messages
    const where: any = {
      conversationId,
      isDeleted: false
    };

    if (before) {
      where.createdAt = {
        lt: new Date(before as string)
      };
    }

    // Get messages
    const messages = await prisma.message.findMany({
      where,
      include: {
        sender: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            profileImage: true
          }
        },
        readReceipts: {
          select: {
            userId: true,
            readAt: true
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      },
      take: Number(limit)
    });

    // Format messages
    const formattedMessages = messages.map(msg => ({
      id: msg.id,
      conversationId: msg.conversationId,
      senderId: msg.senderId,
      sender: msg.sender,
      recipientId: msg.recipientId,
      encryptedContent: msg.encryptedContent,
      iv: msg.iv,
      authTag: msg.authTag,
      messageType: msg.messageType,
      venueId: msg.venueId,
      mediaUrl: msg.mediaUrl,
      isEdited: msg.isEdited,
      createdAt: msg.createdAt,
      editedAt: msg.editedAt,
      readReceipts: msg.readReceipts
    }));

    res.json({ messages: formattedMessages.reverse() });
  } catch (error) {
    console.error('Error fetching messages:', error);
    res.status(500).json({ error: 'Failed to fetch messages' });
  }
});

/**
 * POST /messages/conversations
 * Create or get a conversation with a friend
 */
router.post('/conversations', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    const { friendId, type = 'DIRECT' } = req.body;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    if (!friendId) {
      return res.status(400).json({ error: 'Friend ID required' });
    }

    // Verify friendship exists
    const friendship = await prisma.friendship.findFirst({
      where: {
        OR: [
          { initiatorId: userId, receiverId: friendId, status: 'ACCEPTED' },
          { initiatorId: friendId, receiverId: userId, status: 'ACCEPTED' }
        ]
      }
    });

    if (!friendship) {
      return res.status(403).json({ error: 'Must be friends to start a conversation' });
    }

    // Check if conversation already exists
    const existingParticipation = await prisma.conversationParticipant.findFirst({
      where: {
        userId: userId,
        isActive: true,
        conversation: {
          type: 'DIRECT',
          participants: {
            some: {
              userId: friendId,
              isActive: true
            }
          }
        }
      },
      include: {
        conversation: {
          include: {
            participants: {
              include: {
                user: {
                  select: {
                    id: true,
                    email: true,
                    firstName: true,
                    lastName: true,
                    profileImage: true
                  }
                }
              },
              where: {
                isActive: true
              }
            }
          }
        }
      }
    });

    if (existingParticipation) {
      return res.json({ conversation: existingParticipation.conversation });
    }

    // Create new conversation
    const conversation = await prisma.conversation.create({
      data: {
        type: type as 'DIRECT' | 'GROUP',
        participants: {
          create: [
            { userId: userId },
            { userId: friendId }
          ]
        }
      },
      include: {
        participants: {
          include: {
            user: {
              select: {
                id: true,
                email: true,
                firstName: true,
                lastName: true,
                profileImage: true
              }
            }
          }
        }
      }
    });

    res.status(201).json({ conversation });
  } catch (error) {
    console.error('Error creating conversation:', error);
    res.status(500).json({ error: 'Failed to create conversation' });
  }
});

/**
 * POST /messages/send
 * Send an encrypted message
 */
router.post('/send', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    const {
      conversationId,
      encryptedContent,
      iv,
      authTag,
      messageType = 'TEXT',
      venueId,
      mediaUrl
    } = req.body;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    if (!conversationId || !encryptedContent || !iv) {
      return res.status(400).json({
        error: 'Conversation ID, encrypted content, and IV required'
      });
    }

    // Verify user is a participant
    const participant = await prisma.conversationParticipant.findFirst({
      where: {
        conversationId,
        userId,
        isActive: true
      }
    });

    if (!participant) {
      return res.status(403).json({ error: 'Not a participant in this conversation' });
    }

    // Get conversation to determine recipient
    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId },
      include: {
        participants: {
          where: {
            userId: { not: userId },
            isActive: true
          },
          select: {
            userId: true
          }
        }
      }
    });

    if (!conversation) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    const recipientId = conversation.type === 'DIRECT'
      ? conversation.participants[0]?.userId
      : null;

    // Create message
    const message = await prisma.message.create({
      data: {
        conversationId,
        senderId: userId,
        recipientId,
        encryptedContent,
        iv,
        authTag: authTag || null,
        messageType: messageType as any,
        venueId: venueId || null,
        mediaUrl: mediaUrl || null
      },
      include: {
        sender: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            profileImage: true
          }
        }
      }
    });

    // Update conversation timestamp
    await prisma.conversation.update({
      where: { id: conversationId },
      data: { updatedAt: new Date() }
    });

    res.status(201).json({ message });
  } catch (error) {
    console.error('Error sending message:', error);
    res.status(500).json({ error: 'Failed to send message' });
  }
});

/**
 * POST /messages/:messageId/read
 * Mark a message as read
 */
router.post('/:messageId/read', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    const { messageId } = req.params;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Get message
    const message = await prisma.message.findUnique({
      where: { id: messageId },
      select: {
        id: true,
        conversationId: true,
        senderId: true
      }
    });

    if (!message) {
      return res.status(404).json({ error: 'Message not found' });
    }

    // Can't mark own messages as read
    if (message.senderId === userId) {
      return res.status(400).json({ error: 'Cannot mark own message as read' });
    }

    // Verify user is a participant
    const participant = await prisma.conversationParticipant.findFirst({
      where: {
        conversationId: message.conversationId,
        userId,
        isActive: true
      }
    });

    if (!participant) {
      return res.status(403).json({ error: 'Not a participant in this conversation' });
    }

    // Create or update read receipt
    const readReceipt = await prisma.messageReadReceipt.upsert({
      where: {
        messageId_userId: {
          messageId,
          userId
        }
      },
      create: {
        messageId,
        userId
      },
      update: {
        readAt: new Date()
      }
    });

    // Update participant's last read time
    await prisma.conversationParticipant.update({
      where: { id: participant.id },
      data: { lastReadAt: new Date() }
    });

    res.json({ success: true, readReceipt });
  } catch (error) {
    console.error('Error marking message as read:', error);
    res.status(500).json({ error: 'Failed to mark message as read' });
  }
});

/**
 * DELETE /messages/:messageId
 * Delete a message (soft delete)
 */
router.delete('/:messageId', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    const { messageId } = req.params;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Get message
    const message = await prisma.message.findUnique({
      where: { id: messageId }
    });

    if (!message) {
      return res.status(404).json({ error: 'Message not found' });
    }

    // Only sender can delete
    if (message.senderId !== userId) {
      return res.status(403).json({ error: 'Can only delete your own messages' });
    }

    // Soft delete
    await prisma.message.update({
      where: { id: messageId },
      data: {
        isDeleted: true,
        deletedAt: new Date()
      }
    });

    res.json({ success: true, message: 'Message deleted' });
  } catch (error) {
    console.error('Error deleting message:', error);
    res.status(500).json({ error: 'Failed to delete message' });
  }
});

/**
 * POST /messages/conversations/:conversationId/typing
 * Send typing indicator (would typically use WebSocket in production)
 */
router.post('/conversations/:conversationId/typing', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    const { conversationId } = req.params;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Verify user is a participant
    const participant = await prisma.conversationParticipant.findFirst({
      where: {
        conversationId,
        userId,
        isActive: true
      }
    });

    if (!participant) {
      return res.status(403).json({ error: 'Not a participant in this conversation' });
    }

    // In a real implementation, this would emit a WebSocket event
    // For now, just return success
    res.json({ success: true, message: 'Typing indicator sent' });
  } catch (error) {
    console.error('Error sending typing indicator:', error);
    res.status(500).json({ error: 'Failed to send typing indicator' });
  }
});

export default router;
