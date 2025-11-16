import prisma from '../../lib/prisma';
import { CreateConversationDTO, SendMessageDTO, GetMessagesDTO } from './messaging.dto';

export class MessagingService {
  /**
   * Get all conversations for a user (OPTIMIZED - reduced nesting)
   */
  async getConversations(userId: string) {
    // Step 1: Get user's conversation participations (lightweight query)
    const participations = await prisma.conversationParticipant.findMany({
      where: {
        userId: userId,
        isActive: true
      },
      select: {
        conversationId: true,
        lastReadAt: true,
        conversation: {
          select: {
            id: true,
            type: true,
            name: true,
            updatedAt: true
          }
        }
      },
      orderBy: {
        conversation: {
          updatedAt: 'desc'
        }
      },
      take: 50 // Limit to recent 50 conversations for performance
    });

    if (participations.length === 0) {
      return [];
    }

    const conversationIds = participations.map(p => p.conversationId);

    // Step 2: Get participants for these conversations (single query with IN clause)
    const allParticipants = await prisma.conversationParticipant.findMany({
      where: {
        conversationId: { in: conversationIds },
        isActive: true
      },
      select: {
        conversationId: true,
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
      }
    });

    // Step 3: Get last message for each conversation (single query)
    const lastMessages = await prisma.message.findMany({
      where: {
        conversationId: { in: conversationIds },
        isDeleted: false
      },
      orderBy: {
        createdAt: 'desc'
      },
      distinct: ['conversationId'],
      select: {
        id: true,
        conversationId: true,
        senderId: true,
        encryptedContent: true,
        iv: true,
        authTag: true,
        messageType: true,
        createdAt: true,
        sender: {
          select: {
            id: true,
            firstName: true,
            lastName: true
          }
        }
      }
    });

    // Step 4: Map participants by conversation ID (in memory - fast)
    const participantsByConversation = new Map<string, any[]>();
    for (const participant of allParticipants) {
      const existing = participantsByConversation.get(participant.conversationId) || [];
      existing.push(participant.user);
      participantsByConversation.set(participant.conversationId, existing);
    }

    // Step 5: Map last messages by conversation ID (in memory - fast)
    const lastMessageByConversation = new Map<string, any>();
    for (const msg of lastMessages) {
      // Only keep the most recent message per conversation
      if (!lastMessageByConversation.has(msg.conversationId)) {
        lastMessageByConversation.set(msg.conversationId, msg);
      }
    }

    // Step 6: Format conversations (in memory - fast)
    const conversations = participations.map(participation => {
      const conversation = participation.conversation;
      const participants = participantsByConversation.get(conversation.id) || [];
      const lastMessage = lastMessageByConversation.get(conversation.id);

      // Calculate unread count (simplified)
      const unreadCount = lastMessage && lastMessage.createdAt > participation.lastReadAt
        ? 1
        : 0;

      return {
        id: conversation.id,
        type: conversation.type,
        name: conversation.name,
        participants,
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

    return conversations;
  }

  /**
   * Get messages in a conversation (OPTIMIZED - removed readReceipts for performance)
   */
  async getMessages(userId: string, params: GetMessagesDTO) {
    const { conversationId, limit = 50, before } = params;

    // Verify user is a participant
    const participant = await prisma.conversationParticipant.findFirst({
      where: {
        conversationId,
        userId,
        isActive: true
      },
      select: {
        id: true // Only need ID for verification
      }
    });

    if (!participant) {
      throw new Error('Not a participant in this conversation');
    }

    // Build query for messages
    const where: any = {
      conversationId,
      isDeleted: false
    };

    if (before) {
      where.createdAt = {
        lt: new Date(before)
      };
    }

    // Get messages (removed readReceipts to improve performance)
    const messages = await prisma.message.findMany({
      where,
      select: {
        id: true,
        conversationId: true,
        senderId: true,
        recipientId: true,
        encryptedContent: true,
        iv: true,
        authTag: true,
        messageType: true,
        venueId: true,
        mediaUrl: true,
        isEdited: true,
        createdAt: true,
        editedAt: true,
        sender: {
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
      },
      take: Number(limit)
    });

    // Messages are already properly formatted
    return messages.reverse();
  }

  /**
   * Create or get a conversation with a friend
   */
  async createConversation(userId: string, data: CreateConversationDTO) {
    const { friendId, type = 'DIRECT', sharedEncryptionKey } = data;

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
      throw new Error('Must be friends to start a conversation');
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
      return existingParticipation.conversation;
    }

    // Create new conversation
    const conversation = await prisma.conversation.create({
      data: {
        type: type as 'DIRECT' | 'GROUP',
        sharedEncryptionKey: sharedEncryptionKey || null,
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

    return conversation;
  }

  /**
   * Send an encrypted message (OPTIMIZED - reduced queries, fire-and-forget updates)
   */
  async sendMessage(userId: string, data: SendMessageDTO) {
    const {
      conversationId,
      encryptedContent,
      iv,
      authTag,
      messageType = 'TEXT',
      venueId,
      mediaUrl
    } = data;

    // Combined query: check participant AND get conversation in parallel
    const [participant, conversation] = await Promise.all([
      prisma.conversationParticipant.findFirst({
        where: {
          conversationId,
          userId,
          isActive: true
        }
      }),
      prisma.conversation.findUnique({
        where: { id: conversationId },
        select: {
          id: true,
          type: true,
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
      })
    ]);

    if (!participant) {
      throw new Error('Not a participant in this conversation');
    }

    if (!conversation) {
      throw new Error('Conversation not found');
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

    // Update conversation timestamp (fire-and-forget to avoid blocking response)
    // Don't await this - let it happen in the background
    prisma.conversation.update({
      where: { id: conversationId },
      data: { updatedAt: new Date() }
    }).catch(err => console.error('Failed to update conversation timestamp:', err));

    return message;
  }

  /**
   * Mark a message as read (OPTIMIZED - parallel queries)
   */
  async markMessageAsRead(userId: string, messageId: string) {
    // Get message and verify participant in parallel
    const [message, participant] = await Promise.all([
      prisma.message.findUnique({
        where: { id: messageId },
        select: {
          id: true,
          conversationId: true,
          senderId: true
        }
      }),
      prisma.$queryRaw`
        SELECT cp.id, cp."conversationId"
        FROM conversation_participants cp
        JOIN messages m ON m."conversationId" = cp."conversationId"
        WHERE m.id = ${messageId}
        AND cp."userId" = ${userId}
        AND cp."isActive" = true
        LIMIT 1
      ` as Promise<any[]>
    ]);

    if (!message) {
      throw new Error('Message not found');
    }

    // Can't mark own messages as read
    if (message.senderId === userId) {
      throw new Error('Cannot mark own message as read');
    }

    if (!participant || participant.length === 0) {
      throw new Error('Not a participant in this conversation');
    }

    // Create/update read receipt and update last read time in parallel (fire-and-forget for last read)
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

    // Update participant's last read time (fire-and-forget to avoid blocking)
    prisma.conversationParticipant.update({
      where: { id: participant[0].id },
      data: { lastReadAt: new Date() }
    }).catch(err => console.error('Failed to update lastReadAt:', err));

    return readReceipt;
  }

  /**
   * Delete a message (soft delete)
   */
  async deleteMessage(userId: string, messageId: string) {
    // Get message
    const message = await prisma.message.findUnique({
      where: { id: messageId }
    });

    if (!message) {
      throw new Error('Message not found');
    }

    // Only sender can delete
    if (message.senderId !== userId) {
      throw new Error('Can only delete your own messages');
    }

    // Soft delete
    await prisma.message.update({
      where: { id: messageId },
      data: {
        isDeleted: true,
        deletedAt: new Date()
      }
    });

    return { success: true, message: 'Message deleted' };
  }

  /**
   * Send typing indicator
   */
  async sendTypingIndicator(userId: string, conversationId: string) {
    // Verify user is a participant
    const participant = await prisma.conversationParticipant.findFirst({
      where: {
        conversationId,
        userId,
        isActive: true
      }
    });

    if (!participant) {
      throw new Error('Not a participant in this conversation');
    }

    // In a real implementation, this would emit a WebSocket event
    return { success: true, message: 'Typing indicator sent' };
  }

  /**
   * Delete an entire conversation (hard delete)
   */
  async deleteConversation(userId: string, conversationId: string) {
    // Verify user is a participant
    const participant = await prisma.conversationParticipant.findFirst({
      where: {
        conversationId,
        userId,
        isActive: true
      }
    });

    if (!participant) {
      throw new Error('Not a participant in this conversation');
    }

    // Delete all messages in the conversation
    await prisma.message.deleteMany({
      where: { conversationId }
    });

    // Delete all conversation participants
    await prisma.conversationParticipant.deleteMany({
      where: { conversationId }
    });

    // Delete the conversation
    await prisma.conversation.delete({
      where: { id: conversationId }
    });

    console.log(`✅ Deleted conversation ${conversationId} for user ${userId}`);
    return { success: true, message: 'Conversation deleted' };
  }
}

// Export singleton instance
export const messagingService = new MessagingService();
