"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const errorHandler_1 = require("../shared/middleware/errorHandler");
const auth_1 = require("../shared/middleware/auth");
const validation_1 = require("../shared/utils/validation");
const prisma_1 = __importDefault(require("../lib/prisma"));
const router = express_1.default.Router();
// Sign up
router.post('/signup', (0, errorHandler_1.asyncHandler)(async (req, res) => {
    const { error, value } = (0, validation_1.validateSignUp)(req.body);
    if (error) {
        throw (0, errorHandler_1.createError)(error.details[0].message, 400);
    }
    const { email, password, firstName, lastName } = value;
    // Check if user already exists
    const existingUser = await prisma_1.default.user.findUnique({
        where: { email: email.toLowerCase() }
    });
    if (existingUser) {
        throw (0, errorHandler_1.createError)('User with this email already exists', 409);
    }
    // Hash password
    const saltRounds = parseInt(process.env.BCRYPT_ROUNDS || '12');
    const passwordHash = await bcryptjs_1.default.hash(password, saltRounds);
    // Create user
    const user = await prisma_1.default.user.create({
        data: {
            email: email.toLowerCase(),
            firstName,
            lastName,
            passwordHash
        },
        select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            role: true,
            createdAt: true
        }
    });
    // Generate JWT token
    if (!process.env.JWT_SECRET) {
        throw (0, errorHandler_1.createError)('JWT configuration error', 500);
    }
    const token = jsonwebtoken_1.default.sign({ userId: user.id, email: user.email }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || '7d' });
    res.status(201).json({
        message: 'User created successfully',
        token,
        user,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days
    });
}));
// Sign in
router.post('/signin', (0, errorHandler_1.asyncHandler)(async (req, res) => {
    const { error, value } = (0, validation_1.validateSignIn)(req.body);
    if (error) {
        throw (0, errorHandler_1.createError)(error.details[0].message, 400);
    }
    const { email, password } = value;
    // Find user
    const user = await prisma_1.default.user.findUnique({
        where: { email: email.toLowerCase() }
    });
    if (!user) {
        throw (0, errorHandler_1.createError)('Invalid email or password', 401);
    }
    // Verify password
    const isValidPassword = await bcryptjs_1.default.compare(password, user.passwordHash);
    if (!isValidPassword) {
        throw (0, errorHandler_1.createError)('Invalid email or password', 401);
    }
    // Generate JWT token
    if (!process.env.JWT_SECRET) {
        throw (0, errorHandler_1.createError)('JWT configuration error', 500);
    }
    const token = jsonwebtoken_1.default.sign({ userId: user.id, email: user.email }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || '7d' });
    // Update last active time
    await prisma_1.default.user.update({
        where: { id: user.id },
        data: { lastActiveAt: new Date() }
    });
    res.json({
        message: 'Signed in successfully',
        token,
        user: {
            id: user.id,
            email: user.email,
            firstName: user.firstName,
            lastName: user.lastName,
            role: user.role,
            profileImage: user.profileImage,
            createdAt: user.createdAt
        },
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days
    });
}));
// Sign out
router.post('/signout', auth_1.authMiddleware, (0, errorHandler_1.asyncHandler)(async (req, res) => {
    // In a more complex implementation, you might want to blacklist the JWT token
    // For now, we'll just return success as the client will discard the token
    res.json({
        message: 'Signed out successfully'
    });
}));
// Refresh token
router.post('/refresh', auth_1.authMiddleware, (0, errorHandler_1.asyncHandler)(async (req, res) => {
    const userId = req.user.id;
    if (!process.env.JWT_SECRET) {
        throw (0, errorHandler_1.createError)('JWT configuration error', 500);
    }
    // Generate new JWT token
    const token = jsonwebtoken_1.default.sign({ userId, email: req.user.email }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || '7d' });
    res.json({
        token,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days
    });
}));
// Get current user profile
router.get('/me', auth_1.authMiddleware, (0, errorHandler_1.asyncHandler)(async (req, res) => {
    const user = await prisma_1.default.user.findUnique({
        where: { id: req.user.id },
        select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            dateOfBirth: true,
            gender: true,
            profileImage: true,
            musicPreferences: true,
            venuePreferences: true,
            goingOutFrequency: true,
            location: true,
            phoneNumber: true,
            role: true,
            venueIds: true,
            createdAt: true,
            lastActiveAt: true
        }
    });
    if (!user) {
        throw (0, errorHandler_1.createError)('User not found', 404);
    }
    res.json({ user });
}));
exports.default = router;
//# sourceMappingURL=auth.js.map