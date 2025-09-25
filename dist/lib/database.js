"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ImagePrismaClient = exports.MainPrismaClient = exports.imageDb = exports.mainDb = void 0;
const client_1 = require("@prisma/client");
Object.defineProperty(exports, "MainPrismaClient", { enumerable: true, get: function () { return client_1.PrismaClient; } });
const images_client_1 = require("../../prisma/generated/images-client");
Object.defineProperty(exports, "ImagePrismaClient", { enumerable: true, get: function () { return images_client_1.PrismaClient; } });
// Main database client (venues, users, etc.)
exports.mainDb = new client_1.PrismaClient({
    datasources: {
        db: {
            url: process.env.DATABASE_URL
        }
    }
});
// Image database client (venue images)
exports.imageDb = new images_client_1.PrismaClient({
    datasources: {
        db: {
            url: process.env.IMAGE_DATABASE_URL
        }
    }
});
// Graceful shutdown handlers
const gracefulShutdown = async () => {
    console.log('🔌 Disconnecting from databases...');
    await Promise.all([
        exports.mainDb.$disconnect(),
        exports.imageDb.$disconnect()
    ]);
};
process.on('SIGINT', gracefulShutdown);
process.on('SIGTERM', gracefulShutdown);
process.on('beforeExit', gracefulShutdown);
//# sourceMappingURL=database.js.map