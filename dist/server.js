"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.prisma = exports.app = void 0;
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const helmet_1 = __importDefault(require("helmet"));
const morgan_1 = __importDefault(require("morgan"));
const dotenv_1 = require("dotenv");
const Sentry = __importStar(require("@sentry/node"));
const auth_1 = require("./shared/middleware/auth");
const rateLimiting_1 = require("./shared/middleware/rateLimiting");
const errorHandler_1 = require("./shared/middleware/errorHandler");
const auditLogger_1 = require("./shared/middleware/auditLogger");
const tilePrecomputeService_1 = require("./services/tilePrecomputeService");
const prisma_1 = __importDefault(require("./lib/prisma"));
exports.prisma = prisma_1.default;
// Module route imports (new modular structure)
const auth_routes_1 = __importDefault(require("./modules/auth/auth.routes"));
const friends_routes_1 = __importDefault(require("./modules/friends/friends.routes"));
const messaging_routes_1 = __importDefault(require("./modules/messaging/messaging.routes"));
// Legacy route imports (to be refactored)
const venues_1 = __importDefault(require("./routes/venues"));
const venueImages_1 = __importDefault(require("./routes/venueImages"));
const users_1 = __importDefault(require("./routes/users"));
const feed_1 = __importDefault(require("./routes/feed"));
const heatmap_1 = __importDefault(require("./routes/heatmap"));
const images_1 = __importDefault(require("./routes/images"));
const imageProxy_1 = __importDefault(require("./routes/imageProxy"));
const posts_1 = __importDefault(require("./routes/posts"));
const stories_1 = __importDefault(require("./routes/stories"));
const accountSettings_1 = __importDefault(require("./routes/accountSettings"));
const events_1 = __importDefault(require("./routes/events"));
// Load environment variables
(0, dotenv_1.config)();
const app = (0, express_1.default)();
exports.app = app;
const PORT = process.env.PORT || 3000;
// Initialize Sentry for error tracking (production only)
if (process.env.NODE_ENV === 'production' && process.env.SENTRY_DSN) {
    Sentry.init({
        dsn: process.env.SENTRY_DSN,
        environment: process.env.NODE_ENV,
        tracesSampleRate: 1.0, // Capture 100% of transactions for performance monitoring
        integrations: [
            // Enable Express integration for automatic request tracing
            Sentry.expressIntegration(),
        ],
    });
}
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
// HTTP Request Logging
if (process.env.NODE_ENV === 'production') {
    // Apache-style combined logs for production
    app.use((0, morgan_1.default)('combined'));
}
else {
    // Colored concise logs for development
    app.use((0, morgan_1.default)('dev'));
}
// Body parsing
app.use(express_1.default.json({ limit: '10mb' }));
app.use(express_1.default.urlencoded({ extended: true, limit: '10mb' }));
// Serve static files from Railway volume
app.use('/uploads', express_1.default.static('/app/uploads'));
// Audit logging
app.use(auditLogger_1.auditLogger);
// Health check endpoint with database connectivity test
app.get('/health', async (req, res) => {
    try {
        // Test database connection
        await prisma_1.default.$queryRaw `SELECT 1`;
        res.status(200).json({
            status: 'healthy',
            timestamp: new Date().toISOString(),
            uptime: process.uptime(),
            database: 'connected',
            environment: process.env.NODE_ENV || 'development'
        });
    }
    catch (error) {
        console.error('Health check failed:', error);
        res.status(503).json({
            status: 'unhealthy',
            timestamp: new Date().toISOString(),
            uptime: process.uptime(),
            database: 'disconnected',
            error: error instanceof Error ? error.message : 'Unknown error'
        });
    }
});
// API routes
app.use('/auth', auth_routes_1.default);
app.use('/venues', venues_1.default); // Venues endpoint now public (no auth required)
app.use('/', venueImages_1.default); // Image routes include their own auth middleware
app.use('/image-proxy', imageProxy_1.default); // Image proxy for external images (Instagram, etc)
app.use('/users', users_1.default); // Users endpoint now public for search (individual routes can add auth as needed)
app.use('/feed', auth_1.authMiddleware, feed_1.default);
app.use('/heatmap', heatmap_1.default); // Heat map routes include their own auth middleware
app.use('/friends', friends_routes_1.default); // Friends routes include their own auth middleware
app.use('/messages', messaging_routes_1.default); // Messages routes include their own auth middleware
app.use('/posts', posts_1.default); // Posts routes include their own auth middleware
app.use('/stories', stories_1.default); // Stories routes include their own auth middleware
app.use('/account', accountSettings_1.default); // Account settings routes with auth
app.use('/events', events_1.default); // Events routes with auth
// Sentry error handler must be registered before other error handlers
if (process.env.NODE_ENV === 'production' && process.env.SENTRY_DSN) {
    app.use(Sentry.expressErrorHandler());
}
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
    tilePrecomputeService_1.tilePrecomputeService.stopBackgroundRefresh();
    await prisma_1.default.$disconnect();
    process.exit(0);
});
process.on('SIGTERM', async () => {
    console.log('Received SIGTERM. Graceful shutdown...');
    tilePrecomputeService_1.tilePrecomputeService.stopBackgroundRefresh();
    await prisma_1.default.$disconnect();
    process.exit(0);
});
app.use(images_1.default);
// Start server
app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`🔗 Health check: http://localhost:${PORT}/health`);
    // Start background tile precomputation and refresh
    console.log('🔥 Starting heat map tile precomputation service...');
    tilePrecomputeService_1.tilePrecomputeService.startBackgroundRefresh();
});
//# sourceMappingURL=server.js.map