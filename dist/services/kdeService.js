"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.kdeService = void 0;
const projection_1 = require("../utils/projection");
const heatmap_1 = require("../config/heatmap");
class KDEService {
    constructor() {
        this.globalMaxIntensity = 0;
        this.lastVenueUpdate = new Date(0);
        this.spatialGrid = {};
        this.gridCellSize = 1000; // 1km cells
    }
    // Build spatial index for O(1) venue lookups
    buildSpatialIndex(venues) {
        this.spatialGrid = {};
        for (const venue of venues) {
            if (venue.currentOccupancy <= 0)
                continue;
            const [mx, my] = projection_1.WebMercator.lngLatToMeters(venue.longitude, venue.latitude);
            const cellX = Math.floor(mx / this.gridCellSize);
            const cellY = Math.floor(my / this.gridCellSize);
            const key = `${cellX},${cellY}`;
            if (!this.spatialGrid[key]) {
                this.spatialGrid[key] = [];
            }
            this.spatialGrid[key].push(venue);
        }
    }
    // Get venues near a point - only checks nearby grid cells
    getNearbyVenues(mx, my, bandwidth) {
        const cellRadius = Math.ceil((bandwidth * 3) / this.gridCellSize);
        const centerX = Math.floor(mx / this.gridCellSize);
        const centerY = Math.floor(my / this.gridCellSize);
        const nearby = [];
        for (let dx = -cellRadius; dx <= cellRadius; dx++) {
            for (let dy = -cellRadius; dy <= cellRadius; dy++) {
                const key = `${centerX + dx},${centerY + dy}`;
                if (this.spatialGrid[key]) {
                    nearby.push(...this.spatialGrid[key]);
                }
            }
        }
        return nearby;
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
        // Build spatial index for fast lookups
        this.buildSpatialIndex(venues);
        // Sample at actual venue locations to find maximum intensity
        // This ensures the heatmap reflects actual occupancy patterns
        const samplePoints = activeVenues.map(v => [v.longitude, v.latitude]);
        for (const [lng, lat] of samplePoints) {
            const [mx, my] = projection_1.WebMercator.lngLatToMeters(lng, lat);
            const intensity = this.computeIntensityFast(mx, my, bandwidth);
            if (intensity > maxIntensity) {
                maxIntensity = intensity;
            }
        }
        // Ensure we have a minimum threshold to avoid overly sensitive heatmaps
        this.globalMaxIntensity = Math.max(maxIntensity, 0.001);
        this.lastVenueUpdate = new Date();
    }
    // Fast intensity computation using spatial index
    computeIntensityFast(px, py, bandwidth) {
        const nearbyVenues = this.getNearbyVenues(px, py, bandwidth);
        return this.computeIntensity(px, py, nearbyVenues, bandwidth);
    }
    computeIntensity(px, py, venues, bandwidth) {
        let sum = 0;
        const variance = bandwidth * bandwidth;
        const normalizer = 1 / (2 * Math.PI * variance);
        const cutoffDist = bandwidth * 3; // 3-sigma cutoff
        const cutoffDistSq = cutoffDist * cutoffDist;
        for (const venue of venues) {
            const [vx, vy] = projection_1.WebMercator.lngLatToMeters(venue.longitude, venue.latitude);
            const weight = Math.min(venue.currentOccupancy / venue.capacity, 1.0);
            const dx = px - vx;
            const dy = py - vy;
            const distSq = dx * dx + dy * dy;
            // Skip venues outside 3-sigma radius (contributes <1% intensity)
            if (distSq > cutoffDistSq)
                continue;
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
        // Sample every 2nd pixel for 4x speedup, will blur anyway
        const step = 2;
        const reducedSize = Math.ceil(size / step);
        for (let py = 0; py < reducedSize; py++) {
            for (let px = 0; px < reducedSize; px++) {
                const actualPx = px * step;
                const actualPy = py * step;
                const [mx, my] = projection_1.WebMercator.pixelToMeters(z, x, y, actualPx, actualPy);
                // Use spatial index for fast lookup
                const intensity = this.computeIntensityFast(mx, my, bandwidth);
                intensities[actualPy * size + actualPx] = intensity;
            }
        }
        // Bilinear interpolation to fill in skipped pixels
        this.interpolateMissingPixels(intensities, size, step);
        return this.normalizeWithGlobalMax(intensities);
    }
    // Bilinear interpolation for missing pixels
    interpolateMissingPixels(intensities, size, step) {
        for (let y = 0; y < size; y++) {
            for (let x = 0; x < size; x++) {
                if (x % step === 0 && y % step === 0)
                    continue; // Already computed
                // Find surrounding computed pixels
                const x0 = Math.floor(x / step) * step;
                const x1 = Math.min(x0 + step, size - 1);
                const y0 = Math.floor(y / step) * step;
                const y1 = Math.min(y0 + step, size - 1);
                const tx = (x - x0) / step;
                const ty = (y - y0) / step;
                const v00 = intensities[y0 * size + x0];
                const v10 = intensities[y0 * size + x1];
                const v01 = intensities[y1 * size + x0];
                const v11 = intensities[y1 * size + x1];
                // Bilinear interpolation
                const v = v00 * (1 - tx) * (1 - ty) +
                    v10 * tx * (1 - ty) +
                    v01 * (1 - tx) * ty +
                    v11 * tx * ty;
                intensities[y * size + x] = v;
            }
        }
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