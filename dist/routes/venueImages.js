"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const multer_1 = __importDefault(require("multer"));
const imageStorageService_1 = require("../services/imageStorageService");
const auth_1 = require("../shared/middleware/auth");
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
// Validation middleware
const validateImageType = (req, res, next) => {
    const { imageType } = req.body;
    const validTypes = ['ICON', 'BANNER', 'GALLERY', 'MENU', 'INTERIOR', 'EXTERIOR', 'FOOD', 'DRINKS', 'ATMOSPHERE', 'EVENTS'];
    if (!imageType || !validTypes.includes(imageType)) {
        return res.status(400).json({
            success: false,
            message: 'Valid imageType is required',
            validTypes
        });
    }
    next();
};
// Route 1: GET /venues/:venueId/images - Get all images for a venue
router.get('/venues/:venueId/images', auth_1.authMiddleware, async (req, res) => {
    try {
        const { venueId } = req.params;
        console.log(`🖼️ Fetching images for venue: ${venueId}`);
        // Verify venue exists
        const venue = await prisma_1.default.venue.findUnique({
            where: { id: venueId }
        });
        if (!venue) {
            return res.status(404).json({
                success: false,
                message: 'Venue not found'
            });
        }
        // Fetch all active images for the venue
        const images = await prisma_1.default.venueImage.findMany({
            where: {
                venueId,
                isActive: true
            },
            orderBy: [
                { displayOrder: 'asc' },
                { createdAt: 'desc' }
            ]
        });
        // Group images by type for VenueImageCollection format
        const collection = {
            venue_id: venueId,
            icon: images.find(img => img.imageType === 'ICON') || null,
            banner: images.find(img => img.imageType === 'BANNER') || null,
            gallery: images.filter(img => img.imageType === 'GALLERY'),
            menu: images.filter(img => img.imageType === 'MENU'),
            interior: images.filter(img => img.imageType === 'INTERIOR'),
            exterior: images.filter(img => img.imageType === 'EXTERIOR'),
            food: images.filter(img => img.imageType === 'FOOD'),
            drinks: images.filter(img => img.imageType === 'DRINKS'),
            atmosphere: images.filter(img => img.imageType === 'ATMOSPHERE'),
            events: images.filter(img => img.imageType === 'EVENTS'),
            last_updated: new Date().toISOString()
        };
        res.json({
            success: true,
            data: collection,
            timestamp: new Date().toISOString()
        });
        console.log(`✅ Successfully fetched ${images.length} images for venue ${venueId}`);
    }
    catch (error) {
        console.error('❌ Error fetching venue images:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch venue images',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined,
            timestamp: new Date().toISOString()
        });
    }
});
// Route 2: POST /venues/:venueId/images/upload - Upload new image
router.post('/venues/:venueId/images/upload', auth_1.authMiddleware, upload.single('image'), validateImageType, async (req, res) => {
    try {
        const { venueId } = req.params;
        const { imageType, caption, altText, displayOrder } = req.body;
        const file = req.file;
        const userId = req.user?.id;
        console.log(`🖼️ Uploading ${imageType} image for venue: ${venueId}`);
        if (!file) {
            return res.status(400).json({
                success: false,
                message: 'No image file provided'
            });
        }
        // Verify venue exists
        const venue = await prisma_1.default.venue.findUnique({
            where: { id: venueId }
        });
        if (!venue) {
            return res.status(404).json({
                success: false,
                message: 'Venue not found'
            });
        }
        // For ICON and BANNER types, deactivate existing images
        if (imageType === 'ICON' || imageType === 'BANNER') {
            await prisma_1.default.venueImage.updateMany({
                where: {
                    venueId,
                    imageType: imageType,
                    isActive: true
                },
                data: {
                    isActive: false
                }
            });
            console.log(`🔄 Deactivated existing ${imageType} images for venue ${venueId}`);
        }
        // Process and upload image
        const uploadResult = await imageStorageService_1.imageStorageService.processAndUpload(file.buffer, venueId, imageType, file.originalname);
        // Save to database
        const venueImage = await prisma_1.default.venueImage.create({
            data: {
                venueId,
                imageType: imageType,
                url: uploadResult.url,
                thumbnailUrl: uploadResult.thumbnailUrl,
                altText: altText || null,
                caption: caption || null,
                uploadedBy: userId || 'system',
                displayOrder: parseInt(displayOrder) || 0,
                width: uploadResult.metadata.width,
                height: uploadResult.metadata.height,
                fileSize: uploadResult.metadata.fileSize,
                format: uploadResult.metadata.format,
                isPortrait: uploadResult.metadata.isPortrait,
                aspectRatio: uploadResult.metadata.aspectRatio
            }
        });
        res.status(201).json({
            success: true,
            data: venueImage,
            message: 'Image uploaded successfully',
            timestamp: new Date().toISOString()
        });
        console.log(`✅ Successfully uploaded ${imageType} image for venue ${venueId}`);
    }
    catch (error) {
        console.error('❌ Error uploading image:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to upload image',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined,
            timestamp: new Date().toISOString()
        });
    }
});
// Route 3: PUT /venues/:venueId/images/:imageId - Update image metadata
router.put('/venues/:venueId/images/:imageId', auth_1.authMiddleware, async (req, res) => {
    try {
        const { venueId, imageId } = req.params;
        const { caption, altText, displayOrder, isActive } = req.body;
        console.log(`🖼️ Updating image ${imageId} for venue ${venueId}`);
        // Verify image belongs to venue
        const existingImage = await prisma_1.default.venueImage.findFirst({
            where: {
                id: imageId,
                venueId
            }
        });
        if (!existingImage) {
            return res.status(404).json({
                success: false,
                message: 'Image not found'
            });
        }
        // Update image metadata
        const updatedImage = await prisma_1.default.venueImage.update({
            where: { id: imageId },
            data: {
                caption: caption !== undefined ? caption : undefined,
                altText: altText !== undefined ? altText : undefined,
                displayOrder: displayOrder !== undefined ? parseInt(displayOrder) : undefined,
                isActive: isActive !== undefined ? isActive : undefined
            }
        });
        res.json({
            success: true,
            data: updatedImage,
            message: 'Image updated successfully',
            timestamp: new Date().toISOString()
        });
        console.log(`✅ Successfully updated image ${imageId}`);
    }
    catch (error) {
        console.error('❌ Error updating image:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update image',
            timestamp: new Date().toISOString()
        });
    }
});
// Route 4: DELETE /venues/:venueId/images/:imageId - Delete image
router.delete('/venues/:venueId/images/:imageId', auth_1.authMiddleware, async (req, res) => {
    try {
        const { venueId, imageId } = req.params;
        const { permanent } = req.query;
        console.log(`🗑️ Deleting image ${imageId} for venue ${venueId} (permanent: ${permanent})`);
        // Verify image belongs to venue
        const existingImage = await prisma_1.default.venueImage.findFirst({
            where: {
                id: imageId,
                venueId
            }
        });
        if (!existingImage) {
            return res.status(404).json({
                success: false,
                message: 'Image not found'
            });
        }
        if (permanent === 'true') {
            // Hard delete - remove from database and cloud storage
            await Promise.all([
                // Delete from cloud storage
                imageStorageService_1.imageStorageService.deleteImages([existingImage.url, existingImage.thumbnailUrl].filter(Boolean)),
                // Delete from database
                prisma_1.default.venueImage.delete({ where: { id: imageId } })
            ]);
            res.json({
                success: true,
                message: 'Image permanently deleted',
                timestamp: new Date().toISOString()
            });
        }
        else {
            // Soft delete - mark as inactive
            await prisma_1.default.venueImage.update({
                where: { id: imageId },
                data: { isActive: false }
            });
            res.json({
                success: true,
                message: 'Image deactivated',
                timestamp: new Date().toISOString()
            });
        }
        console.log(`✅ Successfully deleted image ${imageId}`);
    }
    catch (error) {
        console.error('❌ Error deleting image:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to delete image',
            timestamp: new Date().toISOString()
        });
    }
});
// Route 5: GET /venues/images/bulk - Get images for multiple venues
router.get('/venues/images/bulk', auth_1.authMiddleware, async (req, res) => {
    try {
        const { venueIds } = req.query;
        if (!venueIds || typeof venueIds !== 'string') {
            return res.status(400).json({
                success: false,
                message: 'venueIds parameter is required'
            });
        }
        const venueIdArray = venueIds.split(',').filter(id => id.trim());
        if (venueIdArray.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'At least one venue ID is required'
            });
        }
        console.log(`🖼️ Fetching bulk images for ${venueIdArray.length} venues`);
        // Fetch images for all venues
        const images = await prisma_1.default.venueImage.findMany({
            where: {
                venueId: { in: venueIdArray },
                isActive: true
            },
            orderBy: [
                { venueId: 'asc' },
                { displayOrder: 'asc' },
                { createdAt: 'desc' }
            ]
        });
        // Group by venue_id
        const collections = {};
        venueIdArray.forEach(venueId => {
            const venueImages = images.filter(img => img.venueId === venueId);
            collections[venueId] = {
                venue_id: venueId,
                icon: venueImages.find(img => img.imageType === 'ICON') || null,
                banner: venueImages.find(img => img.imageType === 'BANNER') || null,
                gallery: venueImages.filter(img => img.imageType === 'GALLERY'),
                menu: venueImages.filter(img => img.imageType === 'MENU'),
                interior: venueImages.filter(img => img.imageType === 'INTERIOR'),
                exterior: venueImages.filter(img => img.imageType === 'EXTERIOR'),
                food: venueImages.filter(img => img.imageType === 'FOOD'),
                drinks: venueImages.filter(img => img.imageType === 'DRINKS'),
                atmosphere: venueImages.filter(img => img.imageType === 'ATMOSPHERE'),
                events: venueImages.filter(img => img.imageType === 'EVENTS'),
                last_updated: new Date().toISOString()
            };
        });
        res.json({
            success: true,
            data: Object.values(collections),
            count: venueIdArray.length,
            timestamp: new Date().toISOString()
        });
        console.log(`✅ Successfully fetched bulk images for ${venueIdArray.length} venues`);
    }
    catch (error) {
        console.error('❌ Error fetching bulk venue images:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch venue images',
            timestamp: new Date().toISOString()
        });
    }
});
// Route 6: GET /venues/:venueId/images/stats - Get image statistics
router.get('/venues/:venueId/images/stats', auth_1.authMiddleware, async (req, res) => {
    try {
        const { venueId } = req.params;
        // Get statistics
        const [stats, totalStats] = await Promise.all([
            prisma_1.default.venueImage.groupBy({
                by: ['imageType'],
                where: {
                    venueId,
                    isActive: true
                },
                _count: { id: true },
                _sum: { fileSize: true },
                _avg: { width: true, height: true }
            }),
            prisma_1.default.venueImage.aggregate({
                where: {
                    venueId,
                    isActive: true
                },
                _count: { id: true },
                _sum: { fileSize: true }
            })
        ]);
        res.json({
            success: true,
            data: {
                venue_id: venueId,
                total_images: totalStats._count.id || 0,
                total_size_bytes: totalStats._sum.fileSize || 0,
                by_type: stats.map(stat => ({
                    image_type: stat.imageType,
                    count: stat._count.id,
                    total_size: stat._sum.fileSize || 0,
                    avg_width: Math.round(stat._avg.width || 0),
                    avg_height: Math.round(stat._avg.height || 0)
                }))
            },
            timestamp: new Date().toISOString()
        });
    }
    catch (error) {
        console.error('❌ Error fetching image stats:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch image statistics',
            timestamp: new Date().toISOString()
        });
    }
});
// Route 7: POST /admin/images/test-storage - Test cloud storage connection (admin only)
router.post('/admin/images/test-storage', auth_1.authMiddleware, async (req, res) => {
    try {
        // TODO: Add admin role check
        const isConnected = await imageStorageService_1.imageStorageService.testConnection();
        res.json({
            success: true,
            data: {
                storage_connected: isConnected,
                bucket: process.env.AWS_S3_BUCKET,
                region: process.env.AWS_REGION
            },
            timestamp: new Date().toISOString()
        });
    }
    catch (error) {
        console.error('❌ Error testing storage:', error);
        res.status(500).json({
            success: false,
            message: 'Storage test failed',
            timestamp: new Date().toISOString()
        });
    }
});
// Error handling middleware
router.use((error, req, res, next) => {
    if (error instanceof multer_1.default.MulterError) {
        if (error.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({
                success: false,
                message: 'File too large. Maximum size is 10MB.'
            });
        }
    }
    console.error('🚨 Image route error:', error);
    res.status(500).json({
        success: false,
        message: error.message || 'Internal server error',
        timestamp: new Date().toISOString()
    });
});
exports.default = router;
//# sourceMappingURL=venueImages.js.map