"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.heatmapConfig = void 0;
exports.heatmapConfig = {
    // KDE parameters by zoom level
    kdeBandwidth: (zoom) => {
        // Increased base bandwidth for more visible heat at all zoom levels
        // σ at z=14: 300m (doubled from 150m), scale more gradually
        const base = 300;
        // Use gentler scaling: σ ∝ 2^(14−z) instead of 2^(16−z)
        return base * Math.pow(2, 14 - zoom);
    },
    tileSize: 256,
    maxZoom: 18,
    minZoom: 11,
    // Normalization parameters
    percentileClip: 0.95,
    gamma: 0.8,
    // Gaussian blur parameters - increased for better visibility across zoom levels
    gaussianBlurSigma: 8, // Increased from 4 for more visible heat blooms
    // Cache settings - longer cache for better performance
    cacheTTL: parseInt(process.env.HEATMAP_CACHE_TTL || '3600'), // 1 hour (was 5 min)
    tileUpdateInterval: parseInt(process.env.HEATMAP_UPDATE_INTERVAL || '300'), // 5 minutes
    // Performance settings
    maxVenuesPerTile: 1000, // Limit venues processed per tile
    // Default bounds (can be overridden by user location)
    defaultBounds: {
        north: -27.35,
        south: -27.55,
        east: 153.15,
        west: 152.95
    }
};
//# sourceMappingURL=heatmap.js.map