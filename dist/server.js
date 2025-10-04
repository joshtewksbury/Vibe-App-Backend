"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.prisma = exports.app = void 0;
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const helmet_1 = __importDefault(require("helmet"));
const dotenv_1 = require("dotenv");
const client_1 = require("@prisma/client");
const auth_1 = require("./middleware/auth");
const rateLimiting_1 = require("./middleware/rateLimiting");
const errorHandler_1 = require("./middleware/errorHandler");
const auditLogger_1 = require("./middleware/auditLogger");
// Route imports
const auth_2 = __importDefault(require("./routes/auth"));
const venues_1 = __importDefault(require("./routes/venues"));
const venueImages_1 = __importDefault(require("./routes/venueImages"));
const users_1 = __importDefault(require("./routes/users"));
const feed_1 = __importDefault(require("./routes/feed"));
const heatmap_1 = __importDefault(require("./routes/heatmap"));
// Load environment variables
(0, dotenv_1.config)();
const app = (0, express_1.default)();
exports.app = app;
const prisma = new client_1.PrismaClient();
exports.prisma = prisma;
const PORT = process.env.PORT || 3000;
// Security middleware
app.use((0, helmet_1.default)());
// CORS configuration
const corsOptions = {
    origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
    credentials: true,
    optionsSuccessStatus: 200
};
app.use((0, cors_1.default)(corsOptions));
// Rate limiting
app.use(rateLimiting_1.rateLimitMiddleware);
// Body parsing
app.use(express_1.default.json({ limit: '10mb' }));
app.use(express_1.default.urlencoded({ extended: true, limit: '10mb' }));
// Audit logging
app.use(auditLogger_1.auditLogger);
// Health check endpoint
app.get('/health', (req, res) => {
    res.status(200).json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime()
    });
});
// API routes
app.use('/auth', auth_2.default);
app.use('/venues', auth_1.authMiddleware, venues_1.default);
app.use('/', venueImages_1.default); // Image routes include their own auth middleware
app.use('/users', auth_1.authMiddleware, users_1.default);
app.use('/feed', auth_1.authMiddleware, feed_1.default);
app.use('/heatmap', heatmap_1.default); // Heat map routes include their own auth middleware
// Error handling
app.use(errorHandler_1.errorHandler);
// 404 handler
app.use((req, res) => {
    res.status(404).json({
        error: 'Not Found',
        message: `Route ${req.originalUrl} not found`
    });
});
// Graceful shutdown
process.on('SIGINT', async () => {
    console.log('Received SIGINT. Graceful shutdown...');
    await prisma.$disconnect();
    process.exit(0);
});
process.on('SIGTERM', async () => {
    console.log('Received SIGTERM. Graceful shutdown...');
    await prisma.$disconnect();
    process.exit(0);
});
// Start server
app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`🔗 Health check: http://localhost:${PORT}/health`);
});

const imageRoutes = require('./routes/images');
app.use(imageRoutes);
//# sourceMappingURL=server.js.map
