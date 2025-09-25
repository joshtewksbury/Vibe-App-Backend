import { HeatMapVenue, GridCell } from '../types/heatmap';
import { WebMercator } from '../utils/projection';
import { heatmapConfig } from '../config/heatmap';

class KDEService {
  private globalMaxIntensity: number = 0;
  private lastVenueUpdate: Date = new Date(0);

  private computeGlobalMaxIntensity(venues: HeatMapVenue[], zoom: number): void {
    const bandwidth = heatmapConfig.kdeBandwidth(zoom);
    let maxIntensity = 0;

    // Sample key locations to find global maximum
    const samplePoints = [
      // Map venue coordinates
      ...venues.map(v => [v.longitude, v.latitude]),
      // Add strategic sampling points (can be customized for different cities)
      [153.0251, -27.4698], // Brisbane center
      [153.0314, -27.4566], // Fortitude Valley
      [153.0357, -27.4612], // Howard Smith Wharves
    ];

    for (const [lng, lat] of samplePoints) {
      const [mx, my] = WebMercator.lngLatToMeters(lng, lat);
      const intensity = this.computeIntensity(mx, my, venues, bandwidth);
      if (intensity > maxIntensity) {
        maxIntensity = intensity;
      }
    }

    this.globalMaxIntensity = maxIntensity;
    this.lastVenueUpdate = new Date();
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

    for (const venue of venues) {
      const [vx, vy] = WebMercator.lngLatToMeters(venue.longitude, venue.latitude);
      const weight = Math.min(venue.currentOccupancy / venue.capacity, 1.0);

      const dx = px - vx;
      const dy = py - vy;
      const distSq = dx * dx + dy * dy;

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

    // Get tile bounds for filtering relevant venues
    const bounds = WebMercator.tileBounds(z, x, y);
    const bufferDistance = bandwidth * 3; // 3-sigma buffer for smooth edges

    // Filter venues that could influence this tile
    const relevantVenues = venues.filter(venue => {
      const [vx, vy] = WebMercator.lngLatToMeters(venue.longitude, venue.latitude);
      return vx >= bounds.minX - bufferDistance &&
             vx <= bounds.maxX + bufferDistance &&
             vy >= bounds.minY - bufferDistance &&
             vy <= bounds.maxY + bufferDistance;
    });

    // Limit venues for performance
    const limitedVenues = relevantVenues.slice(0, heatmapConfig.maxVenuesPerTile);

    for (let py = 0; py < size; py++) {
      for (let px = 0; px < size; px++) {
        const [mx, my] = WebMercator.pixelToMeters(z, x, y, px, py);
        intensities[py * size + px] = this.computeIntensity(mx, my, limitedVenues, bandwidth);
      }
    }

    return this.normalizeWithGlobalMax(intensities);
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