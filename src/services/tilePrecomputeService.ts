import { heatmapTileService } from './heatmapTileService';
import { heatmapConfig } from '../config/heatmap';
import { HeatMapVenue } from '../shared/types/heatmap';
import prisma from '../lib/prisma';

// Tile precomputation and background refresh service
class TilePrecomputeService {
  private refreshInterval: NodeJS.Timeout | null = null;
  private isPrecomputing = false;
  private lastPrecomputeTime: Date | null = null;

  // Get venues for heat map processing
  async getHeatMapVenues(): Promise<HeatMapVenue[]> {
    const venues = await prisma.venue.findMany({
      select: {
        id: true,
        name: true,
        latitude: true,
        longitude: true,
        capacity: true,
        currentOccupancy: true,
        rating: true
      },
      where: {
        capacity: { gt: 0 },
        currentOccupancy: { gt: 0 }
      }
    });

    return venues.map(venue => ({
      id: venue.id,
      name: venue.name,
      latitude: venue.latitude,
      longitude: venue.longitude,
      capacity: venue.capacity,
      currentOccupancy: venue.currentOccupancy,
      rating: venue.rating,
      currentEvents: []
    }));
  }

  // Calculate tile coordinates for a bounding box
  private getTileRange(bounds: { north: number; south: number; east: number; west: number }, zoom: number) {
    const lat2tile = (lat: number, zoom: number) => {
      return Math.floor(((1 - Math.log(Math.tan((lat * Math.PI) / 180) + 1 / Math.cos((lat * Math.PI) / 180)) / Math.PI) / 2) * Math.pow(2, zoom));
    };

    const lon2tile = (lon: number, zoom: number) => {
      return Math.floor(((lon + 180) / 360) * Math.pow(2, zoom));
    };

    const minX = lon2tile(bounds.west, zoom);
    const maxX = lon2tile(bounds.east, zoom);
    const minY = lat2tile(bounds.north, zoom);
    const maxY = lat2tile(bounds.south, zoom);

    return { minX, maxX, minY, maxY };
  }

  // Precompute tiles for specified bounds and zoom levels
  async precomputeTiles(bounds?: { north: number; south: number; east: number; west: number }, zoomLevels?: number[]) {
    if (this.isPrecomputing) {
      console.log('⏳ Tile precomputation already in progress, skipping...');
      return;
    }

    this.isPrecomputing = true;
    const startTime = Date.now();

    try {
      const computeBounds = bounds || heatmapConfig.defaultBounds;
      // Precompute ALL zoom levels from 11 to 20 for zero-lag experience
      const computeZooms = zoomLevels || [11, 12, 13, 14, 15, 16, 17, 18, 19, 20];

      console.log('🔥 Starting heat map tile precomputation...');
      console.log(`📍 Bounds: ${JSON.stringify(computeBounds)}`);
      console.log(`🔢 Zoom levels: ${computeZooms.join(', ')}`);

      const venues = await this.getHeatMapVenues();
      console.log(`🏢 Found ${venues.length} venues with occupancy > 0`);

      let totalTiles = 0;

      for (const zoom of computeZooms) {
        const { minX, maxX, minY, maxY } = this.getTileRange(computeBounds, zoom);
        const tilesAtZoom = (maxX - minX + 1) * (maxY - minY + 1);

        console.log(`📊 Zoom ${zoom}: Precomputing ${tilesAtZoom} tiles (x: ${minX}-${maxX}, y: ${minY}-${maxY})`);

        // Precompute tiles for this zoom level
        for (let x = minX; x <= maxX; x++) {
          for (let y = minY; y <= maxY; y++) {
            try {
              await heatmapTileService.getTile(zoom, x, y, venues);
              totalTiles++;
            } catch (error) {
              console.error(`❌ Error precomputing tile ${zoom}/${x}/${y}:`, error);
            }
          }
        }

        console.log(`✅ Completed zoom level ${zoom}`);
      }

      const duration = Date.now() - startTime;
      this.lastPrecomputeTime = new Date();

      console.log(`🎉 Heat map precomputation complete!`);
      console.log(`📊 Total tiles precomputed: ${totalTiles}`);
      console.log(`⏱️  Duration: ${(duration / 1000).toFixed(2)}s (${(duration / 60000).toFixed(1)} minutes)`);
      console.log(`🕐 Next refresh in ${heatmapConfig.tileUpdateInterval / 60} minutes`);
      console.log(`💾 All tiles cached and ready for zero-lag delivery`);

    } catch (error) {
      console.error('❌ Error during tile precomputation:', error);
    } finally {
      this.isPrecomputing = false;
    }
  }

  // Start background refresh job
  startBackgroundRefresh() {
    if (this.refreshInterval) {
      console.log('⏳ Background refresh already running');
      return;
    }

    console.log(`🔄 Starting background tile refresh (every ${heatmapConfig.tileUpdateInterval / 60}min)`);

    // Initial precomputation on startup
    this.precomputeTiles().catch(error => {
      console.error('❌ Initial tile precomputation failed:', error);
    });

    // Schedule periodic refresh
    this.refreshInterval = setInterval(() => {
      console.log('🔄 Running scheduled tile refresh...');
      this.precomputeTiles().catch(error => {
        console.error('❌ Scheduled tile refresh failed:', error);
      });
    }, heatmapConfig.tileUpdateInterval * 1000);

    console.log('✅ Background tile refresh service started');
  }

  // Stop background refresh job
  stopBackgroundRefresh() {
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
      this.refreshInterval = null;
      console.log('🛑 Background tile refresh stopped');
    }
  }

  // Get service status
  getStatus() {
    return {
      isPrecomputing: this.isPrecomputing,
      lastPrecomputeTime: this.lastPrecomputeTime,
      refreshIntervalActive: this.refreshInterval !== null,
      refreshIntervalSeconds: heatmapConfig.tileUpdateInterval
    };
  }
}

export const tilePrecomputeService = new TilePrecomputeService();
