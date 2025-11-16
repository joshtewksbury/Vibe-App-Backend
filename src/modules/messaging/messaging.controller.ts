import { Response } from 'express';
import { messagingService } from './messaging.service';
import { validateCreateConversation, validateSendMessage, validateGetMessages } from './messaging.dto';
import { AuthRequest } from '../../shared/middleware/auth';

export class MessagingController {
  /**
   * GET /messages/conversations
   * Get all conversations for the authenticated user
   */
  async getConversations(req: AuthRequest, res: Response): Promise<void> {
    try {
      const userId = req.user?.userId;

      if (!userId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const conversations = await messagingService.getConversations(userId);

      res.json({ conversations });
    } catch (error) {
      console.error('Error fetching conversations:', error);
      res.status(500).json({ error: 'Failed to fetch conversations' });
    }
  }

  /**
   * GET /messages/conversations/:conversationId
   * Get messages in a conversation
   */
  async getMessages(req: AuthRequest, res: Response): Promise<void> {
    try {
      const userId = req.user?.userId;
      const { conversationId } = req.params;

      if (!userId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      // Validate query parameters
      const { error, value } = validateGetMessages(req.query);
      if (error) {
        res.status(400).json({ error: error.details[0].message });
        return;
      }

      const messages = await messagingService.getMessages(userId, {
        conversationId,
        ...value
      });

      res.json({ messages });
    } catch (error) {
      if (error instanceof Error) {
        if (error.message.includes('Not a participant')) {
          res.status(403).json({ error: error.message });
          return;
        }
      }
      console.error('Error fetching messages:', error);
      res.status(500).json({ error: 'Failed to fetch messages' });
    }
  }

  /**
   * POST /messages/conversations
   * Create or get a conversation with a friend
   */
  async createConversation(req: AuthRequest, res: Response): Promise<void> {
    try {
      const userId = req.user?.userId;

      if (!userId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      // Validate request body
      const { error, value } = validateCreateConversation(req.body);
      if (error) {
        res.status(400).json({ error: error.details[0].message });
        return;
      }

      const conversation = await messagingService.createConversation(userId, value);

      res.status(201).json({ conversation });
    } catch (error) {
      if (error instanceof Error) {
        if (error.message.includes('Must be friends')) {
          res.status(403).json({ error: error.message });
          return;
        }
      }
      console.error('Error creating conversation:', error);
      res.status(500).json({ error: 'Failed to create conversation' });
    }
  }

  /**
   * POST /messages/send
   * Send an encrypted message
   */
  async sendMessage(req: AuthRequest, res: Response): Promise<void> {
    try {
      const userId = req.user?.userId;

      if (!userId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      // Validate request body
      const { error, value } = validateSendMessage(req.body);
      if (error) {
        res.status(400).json({ error: error.details[0].message });
        return;
      }

      const message = await messagingService.sendMessage(userId, value);

      res.status(201).json({ message });
    } catch (error) {
      if (error instanceof Error) {
        if (error.message.includes('Not a participant')) {
          res.status(403).json({ error: error.message });
          return;
        }
        if (error.message.includes('not found')) {
          res.status(404).json({ error: error.message });
          return;
        }
      }
      console.error('Error sending message:', error);
      res.status(500).json({ error: 'Failed to send message' });
    }
  }

  /**
   * POST /messages/:messageId/read
   * Mark a message as read
   */
  async markMessageAsRead(req: AuthRequest, res: Response): Promise<void> {
    try {
      const userId = req.user?.userId;
      const { messageId } = req.params;

      if (!userId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const readReceipt = await messagingService.markMessageAsRead(userId, messageId);

      res.json({ success: true, readReceipt });
    } catch (error) {
      if (error instanceof Error) {
        if (error.message.includes('not found')) {
          res.status(404).json({ error: error.message });
          return;
        }
        if (error.message.includes('Cannot') || error.message.includes('Not a participant')) {
          res.status(400).json({ error: error.message });
          return;
        }
      }
      console.error('Error marking message as read:', error);
      res.status(500).json({ error: 'Failed to mark message as read' });
    }
  }

  /**
   * DELETE /messages/:messageId
   * Delete a message (soft delete)
   */
  async deleteMessage(req: AuthRequest, res: Response): Promise<void> {
    try {
      const userId = req.user?.userId;
      const { messageId } = req.params;

      if (!userId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const result = await messagingService.deleteMessage(userId, messageId);

      res.json(result);
    } catch (error) {
      if (error instanceof Error) {
        if (error.message.includes('not found')) {
          res.status(404).json({ error: error.message });
          return;
        }
        if (error.message.includes('Can only')) {
          res.status(403).json({ error: error.message });
          return;
        }
      }
      console.error('Error deleting message:', error);
      res.status(500).json({ error: 'Failed to delete message' });
    }
  }

  /**
   * POST /messages/conversations/:conversationId/typing
   * Send typing indicator
   */
  async sendTypingIndicator(req: AuthRequest, res: Response): Promise<void> {
    try {
      const userId = req.user?.userId;
      const { conversationId } = req.params;

      if (!userId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const result = await messagingService.sendTypingIndicator(userId, conversationId);

      res.json(result);
    } catch (error) {
      if (error instanceof Error) {
        if (error.message.includes('Not a participant')) {
          res.status(403).json({ error: error.message });
          return;
        }
      }
      console.error('Error sending typing indicator:', error);
      res.status(500).json({ error: 'Failed to send typing indicator' });
    }
  }

  /**
   * DELETE /messages/conversations/:conversationId
   * Delete an entire conversation (hard delete)
   */
  async deleteConversation(req: AuthRequest, res: Response): Promise<void> {
    try {
      const userId = req.user?.userId;
      const { conversationId } = req.params;

      if (!userId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const result = await messagingService.deleteConversation(userId, conversationId);

      res.json(result);
    } catch (error) {
      if (error instanceof Error) {
        if (error.message.includes('Not a participant')) {
          res.status(403).json({ error: error.message });
          return;
        }
      }
      console.error('Error deleting conversation:', error);
      res.status(500).json({ error: 'Failed to delete conversation' });
    }
  }
}

// Export singleton instance
export const messagingController = new MessagingController();
