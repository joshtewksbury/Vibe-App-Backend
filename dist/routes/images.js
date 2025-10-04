"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const multer_1 = __importDefault(require("multer"));
const path_1 = __importDefault(require("path"));
const promises_1 = __importDefault(require("fs/promises"));
const router = express_1.default.Router();
// Configure multer for file uploads to the Railway volume
const storage = multer_1.default.diskStorage({
    destination: async (req, file, cb) => {
        const uploadDir = '/app/uploads'; // This matches your Railway volume path
        // Ensure directory exists
        try {
            await promises_1.default.mkdir(uploadDir, { recursive: true });
        }
        catch (error) {
            console.error('Error creating upload directory:', error);
        }
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        // Generate unique filename
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const ext = path_1.default.extname(file.originalname);
        const baseName = path_1.default.basename(file.originalname, ext).toLowerCase().replace(/\s+/g, '-');
        cb(null, `${baseName}-${uniqueSuffix}${ext}`);
    }
});
// File filter - only allow images
const fileFilter = (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
    if (allowedTypes.includes(file.mimetype)) {
        cb(null, true);
    }
    else {
        cb(new Error('Invalid file type. Only JPEG, PNG, GIF, and WebP are allowed.'));
    }
};
const upload = (0, multer_1.default)({
    storage: storage,
    fileFilter: fileFilter,
    limits: {
        fileSize: 10 * 1024 * 1024 // 10MB limit
    }
});
// POST: Upload image endpoint
router.post('/api/upload-image', upload.single('image'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }
        // Construct the URL where the image will be accessible
        const imageUrl = `${req.protocol}://${req.get('host')}/images/${req.file.filename}`;
        res.json({
            success: true,
            url: imageUrl,
            filename: req.file.filename,
            originalName: req.file.originalname,
            size: req.file.size,
            mimeType: req.file.mimetype
        });
    }
    catch (error) {
        console.error('Upload error:', error);
        res.status(500).json({ error: 'Failed to upload image' });
    }
});
// GET: Serve images from the volume
router.get('/images/:filename', async (req, res) => {
    try {
        const filename = req.params.filename;
        const filepath = path_1.default.join('/app/uploads', filename);
        // Check if file exists
        try {
            await promises_1.default.access(filepath);
        }
        catch {
            return res.status(404).json({ error: 'Image not found' });
        }
        // Send the file
        res.sendFile(filepath);
    }
    catch (error) {
        console.error('Error serving image:', error);
        res.status(500).json({ error: 'Failed to serve image' });
    }
});
// GET: List all uploaded images (optional - for debugging)
router.get('/api/images/list', async (req, res) => {
    try {
        const uploadDir = '/app/uploads';
        const files = await promises_1.default.readdir(uploadDir);
        const imageFiles = files.filter(file => {
            const ext = path_1.default.extname(file).toLowerCase();
            return ['.jpg', '.jpeg', '.png', '.gif', '.webp'].includes(ext);
        });
        const images = imageFiles.map(file => ({
            filename: file,
            url: `${req.protocol}://${req.get('host')}/images/${file}`
        }));
        res.json({ count: images.length, images });
    }
    catch (error) {
        console.error('Error listing images:', error);
        res.status(500).json({ error: 'Failed to list images' });
    }
});
// DELETE: Remove an image (optional)
router.delete('/api/images/:filename', async (req, res) => {
    try {
        const filename = req.params.filename;
        const filepath = path_1.default.join('/app/uploads', filename);
        await promises_1.default.unlink(filepath);
        res.json({ success: true, message: 'Image deleted' });
    }
    catch (error) {
        console.error('Error deleting image:', error);
        res.status(500).json({ error: 'Failed to delete image' });
    }
});
exports.default = router;
//# sourceMappingURL=images.js.map