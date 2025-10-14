"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.heatmapTileService = void 0;
const sharp_1 = __importDefault(require("sharp"));
const client_1 = require("@prisma/client");
const kdeService_1 = require("./kdeService");
const heatmapCacheService_1 = require("./heatmapCacheService");
const colormap_1 = require("../utils/colormap");
const heatmap_1 = require("../config/heatmap");
const crypto_1 = __importDefault(require("crypto"));
const prisma = new client_1.PrismaClient();
class HeatMapTileService {
    // Generate hash of venue data to detect changes
    getVenueHash(venues) {
        const data = venues
            .filter(v => v.currentOccupancy > 0)
            .map(v => `${v.id}:${v.currentOccupancy}`)
            .sort()
            .join('|');
        return crypto_1.default.createHash('sha256').update(data).digest('hex').substring(0, 16);
    }
    async getTile(z, x, y, venues) {
        // Validate zoom level
        if (z < heatmap_1.heatmapConfig.minZoom || z > heatmap_1.heatmapConfig.maxZoom) {
            throw new Error(`Zoom level ${z} out of range (${heatmap_1.heatmapConfig.minZoom}-${heatmap_1.heatmapConfig.maxZoom})`);
        }
        const venueHash = this.getVenueHash(venues);
        const now = new Date();
        // 1. Check in-memory cache first (fastest)
        const memKey = `heatmap_tile_${z}_${x}_${y}_${venueHash}`;
        const memCached = heatmapCacheService_1.heatmapCacheService.getTile(memKey);
        if (memCached) {
            console.log(`⚡ Memory cache hit for tile ${z}/${x}/${y}`);
            return memCached;
        }
        // 2. Check database cache (fast)
        try {
            const dbCached = await prisma.heatMapTile.findUnique({
                where: { z_x_y: { z, x, y } }
            });
            if (dbCached && dbCached.expiresAt > now && dbCached.venueHash === venueHash) {
                console.log(`💾 DB cache hit for tile ${z}/${x}/${y}`);
                // Update hit stats
                await prisma.heatMapTile.update({
                    where: { id: dbCached.id },
                    data: {
                        hitCount: { increment: 1 },
                        lastHitAt: now
                    }
                });
                // Store in memory cache
                const buffer = Buffer.from(dbCached.tileData);
                heatmapCacheService_1.heatmapCacheService.setTile(memKey, buffer);
                return buffer;
            }
        }
        catch (error) {
            console.warn(`⚠️ DB cache error for tile ${z}/${x}/${y}:`, error);
        }
        // 3. Compute tile (slow - only when cache miss)
        console.log(`🔥 Computing heat map tile ${z}/${x}/${y}`);
        const startTime = Date.now();
        const intensities = kdeService_1.kdeService.computeTileIntensities(z, x, y, venues);
        const png = await this.renderPNG(intensities);
        const elapsed = Date.now() - startTime;
        console.log(`✅ Heat map tile ${z}/${x}/${y} computed in ${elapsed}ms`);
        // 4. Store in both caches
        heatmapCacheService_1.heatmapCacheService.setTile(memKey, png);
        const expiresAt = new Date(now.getTime() + heatmap_1.heatmapConfig.cacheTTL * 1000);
        try {
            await prisma.heatMapTile.upsert({
                where: { z_x_y: { z, x, y } },
                create: {
                    z, x, y,
                    tileData: png,
                    venueHash,
                    expiresAt,
                    hitCount: 1,
                    lastHitAt: now
                },
                update: {
                    tileData: png,
                    venueHash,
                    expiresAt,
                    hitCount: 1,
                    lastHitAt: now
                }
            });
        }
        catch (error) {
            console.warn(`⚠️ Failed to cache tile ${z}/${x}/${y} in DB:`, error);
        }
        return png;
    }
    async getGrid(z, x, y, venues) {
        const key = `heatmap_grid_${z}_${x}_${y}`;
        const cached = heatmapCacheService_1.heatmapCacheService.getData(key);
        if (cached) {
            console.log(`🔥 Cache hit for heat map grid ${z}/${x}/${y}`);
            return cached;
        }
        console.log(`🔥 Computing heat map grid ${z}/${x}/${y}`);
        const startTime = Date.now();
        // Validate zoom level
        if (z < heatmap_1.heatmapConfig.minZoom || z > heatmap_1.heatmapConfig.maxZoom) {
            throw new Error(`Zoom level ${z} out of range (${heatmap_1.heatmapConfig.minZoom}-${heatmap_1.heatmapConfig.maxZoom})`);
        }
        const cells = kdeService_1.kdeService.computeGrid(z, x, y, venues);
        const grid = {
            z,
            x,
            y,
            cells,
            timestamp: new Date().toISOString()
        };
        heatmapCacheService_1.heatmapCacheService.setData(key, grid);
        const elapsed = Date.now() - startTime;
        console.log(`✅ Heat map grid ${z}/${x}/${y} computed in ${elapsed}ms`);
        return grid;
    }
    async renderPNG(intensities) {
        const size = heatmap_1.heatmapConfig.tileSize;
        const buffer = Buffer.alloc(size * size * 4);
        for (let i = 0; i < intensities.length; i++) {
            const color = colormap_1.ColorMap.getColor(intensities[i]);
            buffer[i * 4] = color.r;
            buffer[i * 4 + 1] = color.g;
            buffer[i * 4 + 2] = color.b;
            buffer[i * 4 + 3] = color.a;
        }
        // Apply Gaussian blur for smoother heat map appearance
        // Sigma value controls blur strength - higher = more blur
        const blurSigma = heatmap_1.heatmapConfig.gaussianBlurSigma || 4;
        return await (0, sharp_1.default)(buffer, {
            raw: {
                width: size,
                height: size,
                channels: 4
            }
        })
            .blur(blurSigma) // Apply Gaussian blur
            .png({
            compressionLevel: 3, // Lower compression for faster processing (was 6)
            palette: false, // Disable palette to maintain colors
            adaptiveFiltering: false, // Disable for speed
            effort: 1 // Minimum effort for faster encoding (1-10 scale)
        })
            .toBuffer();
    }
    // Generate tiles for a geographic region
    async generateTilesForRegion(venues, bounds, zoom) {
        const tiles = [];
        // Convert bounds to tile coordinates
        const minTileX = Math.floor((bounds.west + 180) / 360 * Math.pow(2, zoom));
        const maxTileX = Math.floor((bounds.east + 180) / 360 * Math.pow(2, zoom));
        const minTileY = Math.floor((1 - Math.log(Math.tan(bounds.north * Math.PI / 180) + 1 / Math.cos(bounds.north * Math.PI / 180)) / Math.PI) / 2 * Math.pow(2, zoom));
        const maxTileY = Math.floor((1 - Math.log(Math.tan(bounds.south * Math.PI / 180) + 1 / Math.cos(bounds.south * Math.PI / 180)) / Math.PI) / 2 * Math.pow(2, zoom));
        for (let x = minTileX; x <= maxTileX; x++) {
            for (let y = minTileY; y <= maxTileY; y++) {
                try {
                    const buffer = await this.getTile(zoom, x, y, venues);
                    tiles.push({ z: zoom, x, y, buffer });
                }
                catch (error) {
                    console.error(`Failed to generate tile ${zoom}/${x}/${y}:`, error);
                }
            }
        }
        return tiles;
    }
    // Precompute tiles for better performance
    async precomputeTiles(venues, bounds, zoomLevels = [11, 12, 13, 14, 15, 16]) {
        console.log('🔥 Starting heat map tile precomputation...');
        const startTime = Date.now();
        for (const zoom of zoomLevels) {
            console.log(`🔥 Precomputing tiles for zoom level ${zoom}`);
            await this.generateTilesForRegion(venues, bounds, zoom);
        }
        const elapsed = Date.now() - startTime;
        console.log(`✅ Heat map tile precomputation completed in ${elapsed}ms`);
    }
    getStats() {
        return {
            cache: heatmapCacheService_1.heatmapCacheService.getStats(),
            kde: kdeService_1.kdeService.getStats(),
            config: {
                minZoom: heatmap_1.heatmapConfig.minZoom,
                maxZoom: heatmap_1.heatmapConfig.maxZoom,
                tileSize: heatmap_1.heatmapConfig.tileSize,
                cacheTTL: heatmap_1.heatmapConfig.cacheTTL
            }
        };
    }
    clearCache() {
        heatmapCacheService_1.heatmapCacheService.clear();
        kdeService_1.kdeService.clearCache();
    }
}
exports.heatmapTileService = new HeatMapTileService();
//# sourceMappingURL=heatmapTileService.js.map