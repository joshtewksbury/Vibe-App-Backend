"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const client_1 = require("@prisma/client");
const errorHandler_1 = require("../middleware/errorHandler");
const validation_1 = require("../utils/validation");
const router = express_1.default.Router();
const prisma = new client_1.PrismaClient();
// GET /users/me - Get current user profile (handled in auth routes)
// This is just for organization, actual endpoint is in auth.ts
// PUT /users/me - Update current user profile
router.put('/me', (0, errorHandler_1.asyncHandler)(async (req, res) => {
    const { error, value } = (0, validation_1.validateUpdateUser)(req.body);
    if (error) {
        throw (0, errorHandler_1.createError)(error.details[0].message, 400);
    }
    const updatedUser = await prisma.user.update({
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
router.get('/me/activity', (0, errorHandler_1.asyncHandler)(async (req, res) => {
    const userId = req.user.id;
    const { limit = 20, offset = 0 } = req.query;
    const [posts, recentVenues] = await Promise.all([
        prisma.post.findMany({
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
router.delete('/me', (0, errorHandler_1.asyncHandler)(async (req, res) => {
    const userId = req.user.id;
    // In a production app, you might want to soft delete or anonymize data
    await prisma.user.delete({
        where: { id: userId }
    });
    res.json({
        message: 'Account deleted successfully'
    });
}));
exports.default = router;
//# sourceMappingURL=users.js.map