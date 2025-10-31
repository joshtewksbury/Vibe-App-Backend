import prisma from '../../lib/prisma';
import { CreateConversationDTO, SendMessageDTO, GetMessagesDTO } from './messaging.dto';

export class MessagingService {
  /**
   * Get all conversations for a user
   */
  async getConversations(userId: string) {
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

      // Calculate unread count (simplified)
      const unreadCount = lastMessage && lastMessage.createdAt > participation.lastReadAt
        ? 1
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

    return conversations;
  }

  /**
   * Get messages in a conversation
   */
  async getMessages(userId: string, params: GetMessagesDTO) {
    const { conversationId, limit = 50, before } = params;

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

    return formattedMessages.reverse();
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
   * Send an encrypted message
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

    // Update conversation timestamp
    await prisma.conversation.update({
      where: { id: conversationId },
      data: { updatedAt: new Date() }
    });

    return message;
  }

  /**
   * Mark a message as read
   */
  async markMessageAsRead(userId: string, messageId: string) {
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
      throw new Error('Message not found');
    }

    // Can't mark own messages as read
    if (message.senderId === userId) {
      throw new Error('Cannot mark own message as read');
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
      throw new Error('Not a participant in this conversation');
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
}

// Export singleton instance
export const messagingService = new MessagingService();
