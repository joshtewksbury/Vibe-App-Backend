"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.kdeService = void 0;
const projection_1 = require("../utils/projection");
const heatmap_1 = require("../config/heatmap");
class KDEService {
    constructor() {
        this.globalMaxIntensity = 0;
        this.lastVenueUpdate = new Date(0);
    }
    computeGlobalMaxIntensity(venues, zoom) {
        const bandwidth = heatmap_1.heatmapConfig.kdeBandwidth(zoom);
        let maxIntensity = 0;
        // Filter out venues with zero occupancy
        const activeVenues = venues.filter(v => v.currentOccupancy > 0);
        // If no venues are active, set max intensity to a small value to avoid division by zero
        if (activeVenues.length === 0) {
            this.globalMaxIntensity = 0.001;
            this.lastVenueUpdate = new Date();
            return;
        }
        // Sample at actual venue locations to find maximum intensity
        // This ensures the heatmap reflects actual occupancy patterns
        const samplePoints = activeVenues.map(v => [v.longitude, v.latitude]);
        for (const [lng, lat] of samplePoints) {
            const [mx, my] = projection_1.WebMercator.lngLatToMeters(lng, lat);
            const intensity = this.computeIntensity(mx, my, venues, bandwidth);
            if (intensity > maxIntensity) {
                maxIntensity = intensity;
            }
        }
        // Ensure we have a minimum threshold to avoid overly sensitive heatmaps
        this.globalMaxIntensity = Math.max(maxIntensity, 0.001);
        this.lastVenueUpdate = new Date();
    }
    computeIntensity(px, py, venues, bandwidth) {
        let sum = 0;
        const variance = bandwidth * bandwidth;
        const normalizer = 1 / (2 * Math.PI * variance);
        for (const venue of venues) {
            const [vx, vy] = projection_1.WebMercator.lngLatToMeters(venue.longitude, venue.latitude);
            const weight = Math.min(venue.currentOccupancy / venue.capacity, 1.0);
            const dx = px - vx;
            const dy = py - vy;
            const distSq = dx * dx + dy * dy;
            sum += weight * normalizer * Math.exp(-distSq / (2 * variance));
        }
        return sum;
    }
    computeTileIntensities(z, x, y, venues) {
        // Compute global max intensity if needed
        if (this.globalMaxIntensity === 0 ||
            Date.now() - this.lastVenueUpdate.getTime() > 60000) { // Refresh every minute
            this.computeGlobalMaxIntensity(venues, z);
        }
        const size = heatmap_1.heatmapConfig.tileSize;
        const intensities = new Float32Array(size * size);
        const bandwidth = heatmap_1.heatmapConfig.kdeBandwidth(z);
        // Get tile bounds for filtering relevant venues
        const bounds = projection_1.WebMercator.tileBounds(z, x, y);
        const bufferDistance = bandwidth * 3; // 3-sigma buffer for smooth edges
        // Filter venues that could influence this tile
        const relevantVenues = venues.filter(venue => {
            const [vx, vy] = projection_1.WebMercator.lngLatToMeters(venue.longitude, venue.latitude);
            return vx >= bounds.minX - bufferDistance &&
                vx <= bounds.maxX + bufferDistance &&
                vy >= bounds.minY - bufferDistance &&
                vy <= bounds.maxY + bufferDistance;
        });
        // Limit venues for performance
        const limitedVenues = relevantVenues.slice(0, heatmap_1.heatmapConfig.maxVenuesPerTile);
        for (let py = 0; py < size; py++) {
            for (let px = 0; px < size; px++) {
                const [mx, my] = projection_1.WebMercator.pixelToMeters(z, x, y, px, py);
                intensities[py * size + px] = this.computeIntensity(mx, my, limitedVenues, bandwidth);
            }
        }
        return this.normalizeWithGlobalMax(intensities);
    }
    normalizeWithGlobalMax(intensities) {
        // Use global maximum for consistent scaling across all tiles
        if (this.globalMaxIntensity === 0) {
            return intensities; // No normalization if no global max computed
        }
        // Apply normalization and gamma correction using global max
        for (let i = 0; i < intensities.length; i++) {
            let val = Math.min(intensities[i] / this.globalMaxIntensity, 1.0);
            val = Math.pow(val, heatmap_1.heatmapConfig.gamma);
            intensities[i] = val;
        }
        return intensities;
    }
    computeGrid(z, x, y, venues, gridSize = 16) {
        const bounds = projection_1.WebMercator.tileBounds(z, x, y);
        const cells = [];
        const bandwidth = heatmap_1.heatmapConfig.kdeBandwidth(z);
        const stepX = (bounds.maxX - bounds.minX) / gridSize;
        const stepY = (bounds.maxY - bounds.minY) / gridSize;
        for (let gy = 0; gy < gridSize; gy++) {
            for (let gx = 0; gx < gridSize; gx++) {
                const mx = bounds.minX + (gx + 0.5) * stepX;
                const my = bounds.minY + (gy + 0.5) * stepY;
                const [lng, lat] = projection_1.WebMercator.metersToLngLat(mx, my);
                const intensity = this.computeIntensity(mx, my, venues, bandwidth);
                cells.push({
                    lat,
                    lng,
                    intensity: Math.min(intensity, 1.0)
                });
            }
        }
        return cells;
    }
    clearCache() {
        this.globalMaxIntensity = 0;
        this.lastVenueUpdate = new Date(0);
    }
    getStats() {
        return {
            globalMaxIntensity: this.globalMaxIntensity,
            lastUpdate: this.lastVenueUpdate,
            hasCache: this.globalMaxIntensity > 0
        };
    }
}
exports.kdeService = new KDEService();
//# sourceMappingURL=kdeService.js.map