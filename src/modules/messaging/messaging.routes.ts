import express from 'express';
import { messagingController } from './messaging.controller';
import { authMiddleware } from '../../shared/middleware/auth';

const router = express.Router();

/**
 * @route   GET /messages/conversations
 * @desc    Get all conversations for the authenticated user
 * @access  Private
 */
router.get('/conversations', authMiddleware, (req, res) => messagingController.getConversations(req, res));

/**
 * @route   GET /messages/conversations/:conversationId
 * @desc    Get messages in a conversation
 * @access  Private
 */
router.get('/conversations/:conversationId', authMiddleware, (req, res) => messagingController.getMessages(req, res));

/**
 * @route   POST /messages/conversations
 * @desc    Create or get a conversation with a friend
 * @access  Private
 */
router.post('/conversations', authMiddleware, (req, res) => messagingController.createConversation(req, res));

/**
 * @route   POST /messages/send
 * @desc    Send an encrypted message
 * @access  Private
 */
router.post('/send', authMiddleware, (req, res) => messagingController.sendMessage(req, res));

/**
 * @route   POST /messages/:messageId/read
 * @desc    Mark a message as read
 * @access  Private
 */
router.post('/:messageId/read', authMiddleware, (req, res) => messagingController.markMessageAsRead(req, res));

/**
 * @route   DELETE /messages/:messageId
 * @desc    Delete a message (soft delete)
 * @access  Private
 */
router.delete('/:messageId', authMiddleware, (req, res) => messagingController.deleteMessage(req, res));

/**
 * @route   POST /messages/conversations/:conversationId/typing
 * @desc    Send typing indicator
 * @access  Private
 */
router.post('/conversations/:conversationId/typing', authMiddleware, (req, res) => messagingController.sendTypingIndicator(req, res));

export default router;
