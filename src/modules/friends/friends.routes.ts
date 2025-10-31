import express from 'express';
import { friendsController } from './friends.controller';
import { authMiddleware } from '../../shared/middleware/auth';

const router = express.Router();

/**
 * @route   GET /friends
 * @desc    Get all friends for the authenticated user
 * @access  Private
 */
router.get('/', authMiddleware, (req, res) => friendsController.getFriends(req, res));

/**
 * @route   GET /friends/requests
 * @desc    Get pending friend requests
 * @access  Private
 */
router.get('/requests', authMiddleware, (req, res) => friendsController.getFriendRequests(req, res));

/**
 * @route   GET /friends/search
 * @desc    Search for users to add as friends
 * @access  Private
 */
router.get('/search', authMiddleware, (req, res) => friendsController.searchUsers(req, res));

/**
 * @route   POST /friends/request
 * @desc    Send a friend request
 * @access  Private
 */
router.post('/request', authMiddleware, (req, res) => friendsController.sendFriendRequest(req, res));

/**
 * @route   POST /friends/accept/:friendshipId
 * @desc    Accept a friend request
 * @access  Private
 */
router.post('/accept/:friendshipId', authMiddleware, (req, res) => friendsController.acceptFriendRequest(req, res));

/**
 * @route   POST /friends/reject/:friendshipId
 * @desc    Reject a friend request
 * @access  Private
 */
router.post('/reject/:friendshipId', authMiddleware, (req, res) => friendsController.rejectFriendRequest(req, res));

/**
 * @route   DELETE /friends/:friendshipId
 * @desc    Remove a friend
 * @access  Private
 */
router.delete('/:friendshipId', authMiddleware, (req, res) => friendsController.removeFriend(req, res));

/**
 * @route   POST /friends/:friendshipId/location
 * @desc    Share location with a friend
 * @access  Private
 */
router.post('/:friendshipId/location', authMiddleware, (req, res) => friendsController.shareLocation(req, res));

/**
 * @route   POST /friends/:friendshipId/location/disable
 * @desc    Disable location sharing with a friend
 * @access  Private
 */
router.post('/:friendshipId/location/disable', authMiddleware, (req, res) => friendsController.disableLocationSharing(req, res));

export default router;
