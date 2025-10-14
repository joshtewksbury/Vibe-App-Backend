import { HeatMapVenue, GridCell } from '../types/heatmap';
import { WebMercator } from '../utils/projection';
import { heatmapConfig } from '../config/heatmap';

// Spatial grid for fast venue lookup - O(1) instead of O(n)
interface SpatialGrid {
  [key: string]: HeatMapVenue[];
}

class KDEService {
  private globalMaxIntensity: number = 0;
  private lastVenueUpdate: Date = new Date(0);
  private spatialGrid: SpatialGrid = {};
  private gridCellSize: number = 1000; // 1km cells

  // Build spatial index for O(1) venue lookups
  private buildSpatialIndex(venues: HeatMapVenue[]): void {
    this.spatialGrid = {};

    for (const venue of venues) {
      if (venue.currentOccupancy <= 0) continue;

      const [mx, my] = WebMercator.lngLatToMeters(venue.longitude, venue.latitude);
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
  private getNearbyVenues(mx: number, my: number, bandwidth: number): HeatMapVenue[] {
    const cellRadius = Math.ceil((bandwidth * 3) / this.gridCellSize);
    const centerX = Math.floor(mx / this.gridCellSize);
    const centerY = Math.floor(my / this.gridCellSize);

    const nearby: HeatMapVenue[] = [];

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

  private computeGlobalMaxIntensity(venues: HeatMapVenue[], zoom: number): void {
    const bandwidth = heatmapConfig.kdeBandwidth(zoom);
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
    const samplePoints = activeVenues.map(v => [v.longitude, v.latitude] as [number, number]);

    for (const [lng, lat] of samplePoints) {
      const [mx, my] = WebMercator.lngLatToMeters(lng, lat);
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
  private computeIntensityFast(px: number, py: number, bandwidth: number): number {
    const nearbyVenues = this.getNearbyVenues(px, py, bandwidth);
    return this.computeIntensity(px, py, nearbyVenues, bandwidth);
  }

  computeIntensity(
    px: number,
    py: number,
    venues: HeatMapVenue[],
    bandwidth: number
  ): number {
    let sum = 0;
    const variance = bandwidth * bandwidth;
    const normalizer = 1 / (2 * Math.PI * variance);
    const cutoffDist = bandwidth * 3; // 3-sigma cutoff
    const cutoffDistSq = cutoffDist * cutoffDist;

    for (const venue of venues) {
      const [vx, vy] = WebMercator.lngLatToMeters(venue.longitude, venue.latitude);
      const weight = Math.min(venue.currentOccupancy / venue.capacity, 1.0);

      const dx = px - vx;
      const dy = py - vy;
      const distSq = dx * dx + dy * dy;

      // Skip venues outside 3-sigma radius (contributes <1% intensity)
      if (distSq > cutoffDistSq) continue;

      sum += weight * normalizer * Math.exp(-distSq / (2 * variance));
    }

    return sum;
  }

  computeTileIntensities(
    z: number,
    x: number,
    y: number,
    venues: HeatMapVenue[]
  ): Float32Array {
    // Compute global max intensity if needed
    if (this.globalMaxIntensity === 0 ||
        Date.now() - this.lastVenueUpdate.getTime() > 60000) { // Refresh every minute
      this.computeGlobalMaxIntensity(venues, z);
    }

    const size = heatmapConfig.tileSize;
    const intensities = new Float32Array(size * size);
    const bandwidth = heatmapConfig.kdeBandwidth(z);

    // Sample every 2nd pixel for 4x speedup, will blur anyway
    const step = 2;
    const reducedSize = Math.ceil(size / step);

    for (let py = 0; py < reducedSize; py++) {
      for (let px = 0; px < reducedSize; px++) {
        const actualPx = px * step;
        const actualPy = py * step;
        const [mx, my] = WebMercator.pixelToMeters(z, x, y, actualPx, actualPy);

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
  private interpolateMissingPixels(intensities: Float32Array, size: number, step: number): void {
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        if (x % step === 0 && y % step === 0) continue; // Already computed

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

  private normalizeWithGlobalMax(intensities: Float32Array): Float32Array {
    // Use global maximum for consistent scaling across all tiles
    if (this.globalMaxIntensity === 0) {
      return intensities; // No normalization if no global max computed
    }

    // Apply normalization and gamma correction using global max
    for (let i = 0; i < intensities.length; i++) {
      let val = Math.min(intensities[i] / this.globalMaxIntensity, 1.0);
      val = Math.pow(val, heatmapConfig.gamma);
      intensities[i] = val;
    }

    return intensities;
  }

  computeGrid(
    z: number,
    x: number,
    y: number,
    venues: HeatMapVenue[],
    gridSize: number = 16
  ): GridCell[] {
    const bounds = WebMercator.tileBounds(z, x, y);
    const cells: GridCell[] = [];
    const bandwidth = heatmapConfig.kdeBandwidth(z);

    const stepX = (bounds.maxX - bounds.minX) / gridSize;
    const stepY = (bounds.maxY - bounds.minY) / gridSize;

    for (let gy = 0; gy < gridSize; gy++) {
      for (let gx = 0; gx < gridSize; gx++) {
        const mx = bounds.minX + (gx + 0.5) * stepX;
        const my = bounds.minY + (gy + 0.5) * stepY;
        const [lng, lat] = WebMercator.metersToLngLat(mx, my);

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

  clearCache(): void {
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

export const kdeService = new KDEService();