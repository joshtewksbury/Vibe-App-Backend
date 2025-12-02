"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const multer_1 = __importDefault(require("multer"));
const errorHandler_1 = require("../shared/middleware/errorHandler");
const auth_1 = require("../shared/middleware/auth");
const validation_1 = require("../shared/utils/validation");
const cloudinaryService_1 = require("../services/cloudinaryService");
const prisma_1 = __importDefault(require("../lib/prisma"));
const router = express_1.default.Router();
// Configure multer for memory storage
const upload = (0, multer_1.default)({
    storage: multer_1.default.memoryStorage(),
    limits: {
        fileSize: 10 * 1024 * 1024, // 10MB limit
    },
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith('image/')) {
            cb(null, true);
        }
        else {
            cb(new Error('Only image files are allowed'));
        }
    }
});
// GET /users/search - Search for users (public endpoint for friend search)
router.get('/search', (0, errorHandler_1.asyncHandler)(async (req, res) => {
    const { query } = req.query;
    if (!query || typeof query !== 'string' || query.trim().length < 2) {
        return res.json({ users: [], message: 'Query must be at least 2 characters' });
    }
    const searchTerm = query.trim().toLowerCase();
    // Search users by first name, last name, or email
    const users = await prisma_1.default.user.findMany({
        where: {
            OR: [
                { firstName: { contains: searchTerm, mode: 'insensitive' } },
                { lastName: { contains: searchTerm, mode: 'insensitive' } },
                { email: { contains: searchTerm, mode: 'insensitive' } }
            ]
        },
        select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            profileImage: true,
            location: true,
            musicPreferences: true,
            venuePreferences: true,
            goingOutFrequency: true,
            createdAt: true,
            lastActiveAt: true
        },
        take: 20 // Limit results
    });
    res.json({ users });
}));
// GET /users/me - Get current user profile (handled in auth routes)
// This is just for organization, actual endpoint is in auth.ts
// PATCH /users/profile - Update profile image
router.patch('/profile', auth_1.authMiddleware, upload.single('profileImage'), (0, errorHandler_1.asyncHandler)(async (req, res) => {
    const userId = req.user.id;
    if (!req.file) {
        throw (0, errorHandler_1.createError)('No image file provided', 400);
    }
    console.log(`📤 Uploading profile image for user: ${userId}`);
    console.log(`📦 File size: ${(req.file.size / 1024).toFixed(2)}KB`);
    try {
        // Upload to Cloudinary
        const uploadResult = await (0, cloudinaryService_1.uploadFile)(req.file.buffer, 'profile-images', 'image', `profile_${userId}`);
        console.log(`✅ Uploaded to Cloudinary: ${uploadResult.secureUrl}`);
        // Update user in database
        const updatedUser = await prisma_1.default.user.update({
            where: { id: userId },
            data: { profileImage: uploadResult.secureUrl },
            select: {
                id: true,
                email: true,
                firstName: true,
                lastName: true,
                profileImage: true,
                dateOfBirth: true,
                gender: true,
                musicPreferences: true,
                venuePreferences: true,
                goingOutFrequency: true,
                location: true,
                phoneNumber: true,
                isEmailVerified: true,
                createdAt: true,
                lastActiveAt: true
            }
        });
        console.log(`✅ Updated user profile image in database`);
        res.json({
            message: 'Profile image updated successfully',
            profileImage: uploadResult.secureUrl,
            user: updatedUser
        });
    }
    catch (error) {
        console.error('❌ Error uploading profile image:', error);
        throw (0, errorHandler_1.createError)('Failed to upload profile image', 500);
    }
}));
// PUT /users/me - Update current user profile
router.put('/me', auth_1.authMiddleware, (0, errorHandler_1.asyncHandler)(async (req, res) => {
    const { error, value } = (0, validation_1.validateUpdateUser)(req.body);
    if (error) {
        throw (0, errorHandler_1.createError)(error.details[0].message, 400);
    }
    const updatedUser = await prisma_1.default.user.update({
        where: { id: req.user.id },
        data: value,
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
            updatedAt: true
        }
    });
    res.json({
        message: 'Profile updated successfully',
        user: updatedUser
    });
}));
// GET /users/me/activity - Get user activity
router.get('/me/activity', auth_1.authMiddleware, (0, errorHandler_1.asyncHandler)(async (req, res) => {
    const userId = req.user.id;
    const { limit = 20, offset = 0 } = req.query;
    const [posts, recentVenues] = await Promise.all([
        prisma_1.default.post.findMany({
            where: { authorId: userId },
            include: {
                venue: {
                    select: { id: true, name: true, location: true }
                }
            },
            orderBy: { createdAt: 'desc' },
            take: parseInt(limit),
            skip: parseInt(offset)
        }),
        // This would typically be from a visits/check-ins table
        // For now, we'll return empty array
        []
    ]);
    res.json({
        posts,
        recentVenues,
        metadata: {
            postsCount: posts.length,
            limit: parseInt(limit),
            offset: parseInt(offset)
        }
    });
}));
// DELETE /users/me - Delete user account
router.delete('/me', auth_1.authMiddleware, (0, errorHandler_1.asyncHandler)(async (req, res) => {
    const userId = req.user.id;
    // In a production app, you might want to soft delete or anonymize data
    await prisma_1.default.user.delete({
        where: { id: userId }
    });
    res.json({
        message: 'Account deleted successfully'
    });
}));
// POST /users/device-token - Register device token for push notifications
router.post('/device-token', auth_1.authMiddleware, (0, errorHandler_1.asyncHandler)(async (req, res) => {
    const userId = req.user.id;
    const { deviceToken, platform = 'ios' } = req.body;
    if (!deviceToken) {
        return res.status(400).json({ error: 'Device token is required' });
    }
    console.log(`📲 Registering device token for user ${userId}: ${deviceToken.substring(0, 10)}...`);
    // Check if token already exists
    const existing = await prisma_1.default.deviceToken.findUnique({
        where: {
            token: deviceToken
        }
    });
    if (existing) {
        // Reactivate if it was deactivated
        await prisma_1.default.deviceToken.update({
            where: { id: existing.id },
            data: { active: true, lastUsed: new Date() }
        });
        console.log(`✅ Device token reactivated for user ${userId}`);
    }
    else {
        // Create new device token
        await prisma_1.default.deviceToken.create({
            data: {
                userId,
                token: deviceToken,
                platform
            }
        });
        console.log(`✅ New device token registered for user ${userId}`);
    }
    res.json({
        success: true,
        message: 'Device token registered successfully'
    });
}));
// DELETE /users/device-token - Unregister device token
router.delete('/device-token', auth_1.authMiddleware, (0, errorHandler_1.asyncHandler)(async (req, res) => {
    const userId = req.user.id;
    const { deviceToken } = req.body;
    if (!deviceToken) {
        return res.status(400).json({ error: 'Device token is required' });
    }
    console.log(`📲 Unregistering device token for user ${userId}`);
    // Deactivate the token instead of deleting
    await prisma_1.default.deviceToken.updateMany({
        where: {
            userId,
            token: deviceToken
        },
        data: {
            active: false
        }
    });
    console.log(`✅ Device token deactivated for user ${userId}`);
    res.json({
        success: true,
        message: 'Device token unregistered successfully'
    });
}));
exports.default = router;
//# sourceMappingURL=users.js.map