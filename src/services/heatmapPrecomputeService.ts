import { heatmapTileService } from './heatmapTileService';
import { heatmapConfig } from '../config/heatmap';
import prisma from '../lib/prisma';
import { HeatMapVenue } from '../shared/types/heatmap';

class HeatmapPrecomputeService {
  private isRunning = false;
  private lastRun: Date | null = null;
  private intervalId: NodeJS.Timeout | null = null;

  // Get all active venues for heatmap
  private async getActiveVenues(): Promise<HeatMapVenue[]> {
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

    return venues.map(v => ({
      id: v.id,
      name: v.name,
      latitude: v.latitude,
      longitude: v.longitude,
      capacity: v.capacity,
      currentOccupancy: v.currentOccupancy,
      rating: v.rating,
      currentEvents: []
    }));
  }

  // Precompute all tiles for Brisbane area
  async precomputeTiles(): Promise<void> {
    if (this.isRunning) {
      console.log('⚠️  Heatmap precomputation already running, skipping...');
      return;
    }

    this.isRunning = true;
    const startTime = Date.now();

    try {
      console.log('🔥 Starting heatmap tile precomputation...');

      const venues = await this.getActiveVenues();
      console.log(`📍 Found ${venues.length} active venues`);

      if (venues.length === 0) {
        console.log('⚠️  No active venues, skipping precomputation');
        return;
      }

      const bounds = heatmapConfig.defaultBounds;
      const zoomLevels = [11, 12, 13, 14, 15, 16, 17, 18]; // Precompute common zoom levels

      let totalTiles = 0;

      for (const zoom of zoomLevels) {
        console.log(`📊 Precomputing zoom level ${zoom}...`);

        // Calculate tile range for this zoom level
        const minTileX = Math.floor((bounds.west + 180) / 360 * Math.pow(2, zoom));
        const maxTileX = Math.floor((bounds.east + 180) / 360 * Math.pow(2, zoom));
        const minTileY = Math.floor(
          (1 - Math.log(Math.tan(bounds.north * Math.PI / 180) + 1 / Math.cos(bounds.north * Math.PI / 180)) / Math.PI) / 2 * Math.pow(2, zoom)
        );
        const maxTileY = Math.floor(
          (1 - Math.log(Math.tan(bounds.south * Math.PI / 180) + 1 / Math.cos(bounds.south * Math.PI / 180)) / Math.PI) / 2 * Math.pow(2, zoom)
        );

        const tilesInZoom = (maxTileX - minTileX + 1) * (maxTileY - minTileY + 1);
        console.log(`🔢 Zoom ${zoom}: ${tilesInZoom} tiles (x: ${minTileX}-${maxTileX}, y: ${minTileY}-${maxTileY})`);

        // Precompute tiles in batches to avoid memory issues
        const batchSize = 10;
        let batchCount = 0;

        for (let x = minTileX; x <= maxTileX; x++) {
          for (let y = minTileY; y <= maxTileY; y++) {
            try {
              await heatmapTileService.getTile(zoom, x, y, venues);
              totalTiles++;
              batchCount++;

              // Log progress every batch
              if (batchCount % batchSize === 0) {
                console.log(`  ✅ Processed ${batchCount}/${tilesInZoom} tiles for zoom ${zoom}`);
              }
            } catch (error) {
              console.error(`  ❌ Failed to generate tile ${zoom}/${x}/${y}:`, error);
            }
          }
        }

        console.log(`✅ Completed zoom level ${zoom}: ${batchCount} tiles`);
      }

      const elapsed = Date.now() - startTime;
      this.lastRun = new Date();

      console.log(`🎉 Heatmap precomputation completed!`);
      console.log(`   📊 Total tiles: ${totalTiles}`);
      console.log(`   ⏱️  Time taken: ${(elapsed / 1000).toFixed(1)}s`);
      console.log(`   🕐 Next run in 15 minutes`);

    } catch (error) {
      console.error('❌ Heatmap precomputation failed:', error);
    } finally {
      this.isRunning = false;
    }
  }

  // Start background precomputation every 15 minutes
  start(): void {
    if (this.intervalId) {
      console.log('⚠️  Heatmap precompute service already running');
      return;
    }

    console.log('🚀 Starting heatmap precompute service (every 15 minutes)');

    // Run immediately on startup
    this.precomputeTiles().catch(error => {
      console.error('❌ Initial heatmap precomputation failed:', error);
    });

    // Then run every 15 minutes
    const FIFTEEN_MINUTES = 15 * 60 * 1000;
    this.intervalId = setInterval(() => {
      this.precomputeTiles().catch(error => {
        console.error('❌ Scheduled heatmap precomputation failed:', error);
      });
    }, FIFTEEN_MINUTES);
  }

  // Stop background precomputation
  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      console.log('🛑 Heatmap precompute service stopped');
    }
  }

  // Get service status
  getStatus() {
    return {
      running: this.isRunning,
      lastRun: this.lastRun,
      nextRun: this.lastRun
        ? new Date(this.lastRun.getTime() + 15 * 60 * 1000)
        : null
    };
  }
}

export const heatmapPrecomputeService = new HeatmapPrecomputeService();
