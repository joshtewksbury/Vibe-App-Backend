import sharp from 'sharp';
import { kdeService } from './kdeService';
import { heatmapCacheService } from './heatmapCacheService';
import { ColorMap } from '../utils/colormap';
import { heatmapConfig } from '../config/heatmap';
import { HeatMapVenue, GridResponse } from '../types/heatmap';

class HeatMapTileService {
  async getTile(z: number, x: number, y: number, venues: HeatMapVenue[]): Promise<Buffer> {
    const key = `heatmap_tile_${z}_${x}_${y}`;
    const cached = heatmapCacheService.getTile(key);

    if (cached) {
      console.log(`🔥 Cache hit for heat map tile ${z}/${x}/${y}`);
      return cached;
    }

    console.log(`🔥 Computing heat map tile ${z}/${x}/${y}`);
    const startTime = Date.now();

    // Validate zoom level
    if (z < heatmapConfig.minZoom || z > heatmapConfig.maxZoom) {
      throw new Error(`Zoom level ${z} out of range (${heatmapConfig.minZoom}-${heatmapConfig.maxZoom})`);
    }

    const intensities = kdeService.computeTileIntensities(z, x, y, venues);
    const png = await this.renderPNG(intensities);

    heatmapCacheService.setTile(key, png);

    const elapsed = Date.now() - startTime;
    console.log(`✅ Heat map tile ${z}/${x}/${y} computed in ${elapsed}ms`);

    return png;
  }

  async getGrid(z: number, x: number, y: number, venues: HeatMapVenue[]): Promise<GridResponse> {
    const key = `heatmap_grid_${z}_${x}_${y}`;
    const cached = heatmapCacheService.getData(key);

    if (cached) {
      console.log(`🔥 Cache hit for heat map grid ${z}/${x}/${y}`);
      return cached;
    }

    console.log(`🔥 Computing heat map grid ${z}/${x}/${y}`);
    const startTime = Date.now();

    // Validate zoom level
    if (z < heatmapConfig.minZoom || z > heatmapConfig.maxZoom) {
      throw new Error(`Zoom level ${z} out of range (${heatmapConfig.minZoom}-${heatmapConfig.maxZoom})`);
    }

    const cells = kdeService.computeGrid(z, x, y, venues);

    const grid: GridResponse = {
      z,
      x,
      y,
      cells,
      timestamp: new Date().toISOString()
    };

    heatmapCacheService.setData(key, grid);

    const elapsed = Date.now() - startTime;
    console.log(`✅ Heat map grid ${z}/${x}/${y} computed in ${elapsed}ms`);

    return grid;
  }

  private async renderPNG(intensities: Float32Array): Promise<Buffer> {
    const size = heatmapConfig.tileSize;
    const buffer = Buffer.alloc(size * size * 4);

    for (let i = 0; i < intensities.length; i++) {
      const color = ColorMap.getColor(intensities[i]);
      buffer[i * 4] = color.r;
      buffer[i * 4 + 1] = color.g;
      buffer[i * 4 + 2] = color.b;
      buffer[i * 4 + 3] = color.a;
    }

    return await sharp(buffer, {
      raw: {
        width: size,
        height: size,
        channels: 4
      }
    })
    .png({
      compressionLevel: 6, // Balance between file size and speed
      palette: false // Disable palette to maintain colors
    })
    .toBuffer();
  }

  // Generate tiles for a geographic region
  async generateTilesForRegion(
    venues: HeatMapVenue[],
    bounds: { north: number; south: number; east: number; west: number },
    zoom: number
  ): Promise<{ z: number; x: number; y: number; buffer: Buffer }[]> {
    const tiles: { z: number; x: number; y: number; buffer: Buffer }[] = [];

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
        } catch (error) {
          console.error(`Failed to generate tile ${zoom}/${x}/${y}:`, error);
        }
      }
    }

    return tiles;
  }

  // Precompute tiles for better performance
  async precomputeTiles(
    venues: HeatMapVenue[],
    bounds: { north: number; south: number; east: number; west: number },
    zoomLevels: number[] = [11, 12, 13, 14, 15, 16]
  ): Promise<void> {
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
      cache: heatmapCacheService.getStats(),
      kde: kdeService.getStats(),
      config: {
        minZoom: heatmapConfig.minZoom,
        maxZoom: heatmapConfig.maxZoom,
        tileSize: heatmapConfig.tileSize,
        cacheTTL: heatmapConfig.cacheTTL
      }
    };
  }

  clearCache(): void {
    heatmapCacheService.clear();
    kdeService.clearCache();
  }
}

export const heatmapTileService = new HeatMapTileService();