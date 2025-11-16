import express from 'express';
import { authController } from './auth.controller';
import { authMiddleware } from '../../shared/middleware/auth';
import { asyncHandler } from '../../shared/middleware/errorHandler';

const router = express.Router();

/**
 * @route   POST /auth/signup
 * @desc    Register a new user
 * @access  Public
 */
router.post('/signup', asyncHandler((req, res) => authController.signUp(req, res)));

/**
 * @route   POST /auth/signin
 * @desc    Sign in an existing user
 * @access  Public
 */
router.post('/signin', asyncHandler((req, res) => authController.signIn(req, res)));

/**
 * @route   POST /auth/apple
 * @desc    Sign in with Apple
 * @access  Public
 */
router.post('/apple', asyncHandler((req, res) => authController.signInWithApple(req, res)));

/**
 * @route   POST /auth/signout
 * @desc    Sign out current user
 * @access  Private
 */
router.post('/signout', authMiddleware, asyncHandler((req, res) => authController.signOut(req, res)));

/**
 * @route   POST /auth/refresh
 * @desc    Refresh authentication token
 * @access  Private
 */
router.post('/refresh', authMiddleware, asyncHandler((req, res) => authController.refreshToken(req, res)));

/**
 * @route   GET /auth/me
 * @desc    Get current user profile
 * @access  Private
 */
router.get('/me', authMiddleware, asyncHandler((req, res) => authController.getCurrentUser(req, res)));

export default router;
