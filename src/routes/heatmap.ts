import express from 'express';
import { PrismaClient } from '@prisma/client';
import { heatmapTileService } from '../services/heatmapTileService';
import { heatmapCacheService } from '../services/heatmapCacheService';
import { kdeService } from '../services/kdeService';
import { heatmapConfig } from '../config/heatmap';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth';
import { HeatMapVenue } from '../types/heatmap';

const router = express.Router();
const prisma = new PrismaClient();

// Convert venue database model to heat map format
function convertVenueToHeatMap(venue: any): HeatMapVenue {
  return {
    id: venue.id,
    name: venue.name,
    latitude: venue.latitude,
    longitude: venue.longitude,
    capacity: venue.capacity,
    currentOccupancy: venue.currentOccupancy,
    rating: venue.rating,
    currentEvents: [] // Could be populated from events table if needed
  };
}

// Cache venues in memory for 30 seconds to avoid DB queries
let venueCache: { venues: HeatMapVenue[]; timestamp: number } | null = null;
const VENUE_CACHE_TTL = 30000; // 30 seconds

// Get venues for heat map processing
async function getHeatMapVenues(): Promise<HeatMapVenue[]> {
  const now = Date.now();

  // Return cached venues if still fresh
  if (venueCache && now - venueCache.timestamp < VENUE_CACHE_TTL) {
    return venueCache.venues;
  }

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
      capacity: { gt: 0 }, // Only venues with known capacity
      currentOccupancy: { gt: 0 } // Only venues with occupancy > 0
    }
  });

  const heatMapVenues = venues.map(venue => ({
    id: venue.id,
    name: venue.name,
    latitude: venue.latitude,
    longitude: venue.longitude,
    capacity: venue.capacity,
    currentOccupancy: venue.currentOccupancy,
    rating: venue.rating,
    currentEvents: []
  }));

  // Update cache
  venueCache = {
    venues: heatMapVenues,
    timestamp: now
  };

  return heatMapVenues;
}

// Route 1: GET /heatmap/tiles/:z/:x/:y.png - Get heat map tile
// No auth required for tile access - tiles are public
router.get('/tiles/:z/:x/:y.png', async (req, res) => {
  try {
    const z = parseInt(req.params.z);
    const x = parseInt(req.params.x);
    const y = parseInt(req.params.y);

    console.log(`🔥 Heat map tile request: ${z}/${x}/${y}`);

    // Validate parameters
    if (isNaN(z) || isNaN(x) || isNaN(y)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid tile coordinates'
      });
    }

    if (z < heatmapConfig.minZoom || z > heatmapConfig.maxZoom) {
      return res.status(404).json({
        success: false,
        message: `Zoom level out of range (${heatmapConfig.minZoom}-${heatmapConfig.maxZoom})`
      });
    }

    const venues = await getHeatMapVenues();
    const tile = await heatmapTileService.getTile(z, x, y, venues);

    res.set({
      'Content-Type': 'image/png',
      // Aggressive caching for CDN/browsers - tiles update every 5 min
      'Cache-Control': `public, max-age=300, s-maxage=300, stale-while-revalidate=60`,
      'X-Tile-Coords': `${z}/${x}/${y}`,
      'X-Venue-Count': venues.length.toString(),
      'Vary': 'Accept-Encoding', // Enable compression
      'X-Content-Type-Options': 'nosniff'
    });

    res.send(tile);
  } catch (error) {
    console.error('❌ Error generating heat map tile:', error);
    res.status(500).json({
      success: false,
      message: 'Heat map tile generation failed',
      error: process.env.NODE_ENV === 'development' ? (error as Error).message : undefined
    });
  }
});

// Route 2: GET /heatmap/grid/:z/:x/:y.json - Get heat map grid data
router.get('/grid/:z/:x/:y.json', authMiddleware, async (req: AuthenticatedRequest, res) => {
  try {
    const z = parseInt(req.params.z);
    const x = parseInt(req.params.x);
    const y = parseInt(req.params.y);

    console.log(`🔥 Heat map grid request: ${z}/${x}/${y}`);

    // Validate parameters
    if (isNaN(z) || isNaN(x) || isNaN(y)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid tile coordinates'
      });
    }

    if (z < heatmapConfig.minZoom || z > heatmapConfig.maxZoom) {
      return res.status(404).json({
        success: false,
        message: `Zoom level out of range (${heatmapConfig.minZoom}-${heatmapConfig.maxZoom})`
      });
    }

    const venues = await getHeatMapVenues();
    const grid = await heatmapTileService.getGrid(z, x, y, venues);

    res.set({
      'Cache-Control': `public, max-age=${heatmapConfig.cacheTTL}`,
      'X-Venue-Count': venues.length.toString()
    });

    res.json({
      success: true,
      data: grid
    });
  } catch (error) {
    console.error('❌ Error generating heat map grid:', error);
    res.status(500).json({
      success: false,
      message: 'Heat map grid generation failed',
      error: process.env.NODE_ENV === 'development' ? (error as Error).message : undefined
    });
  }
});

// Route 3: GET /heatmap/venues - Get venues data for heat map
router.get('/venues', authMiddleware, async (req: AuthenticatedRequest, res) => {
  try {
    const venues = await getHeatMapVenues();

    res.json({
      success: true,
      data: venues,
      count: venues.length,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('❌ Error fetching heat map venues:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch venues for heat map',
      error: process.env.NODE_ENV === 'development' ? (error as Error).message : undefined
    });
  }
});

// Route 4: POST /heatmap/precompute - Precompute tiles for better performance
router.post('/precompute', authMiddleware, async (req: AuthenticatedRequest, res) => {
  try {
    const { bounds, zoomLevels } = req.body;

    // Use default bounds if not provided
    const computeBounds = bounds || heatmapConfig.defaultBounds;
    const computeZooms = zoomLevels || [11, 12, 13, 14, 15, 16];

    console.log('🔥 Starting heat map precomputation...', { computeBounds, computeZooms });

    const venues = await getHeatMapVenues();
    await heatmapTileService.precomputeTiles(venues, computeBounds, computeZooms);

    res.json({
      success: true,
      message: 'Heat map tiles precomputed successfully',
      bounds: computeBounds,
      zoomLevels: computeZooms,
      venueCount: venues.length,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('❌ Error precomputing heat map tiles:', error);
    res.status(500).json({
      success: false,
      message: 'Heat map precomputation failed',
      error: process.env.NODE_ENV === 'development' ? (error as Error).message : undefined
    });
  }
});

// Route 5: GET /heatmap/stats - Get heat map system statistics
router.get('/stats', authMiddleware, async (req: AuthenticatedRequest, res) => {
  try {
    const stats = heatmapTileService.getStats();
    const venueCount = await prisma.venue.count({
      where: {
        capacity: { gt: 0 },
        currentOccupancy: { gte: 0 }
      }
    });

    res.json({
      success: true,
      data: {
        ...stats,
        venueCount,
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('❌ Error fetching heat map stats:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch heat map statistics',
      error: process.env.NODE_ENV === 'development' ? (error as Error).message : undefined
    });
  }
});

// Route 6: POST /heatmap/clear-cache - Clear heat map cache
router.post('/clear-cache', authMiddleware, async (req: AuthenticatedRequest, res) => {
  try {
    heatmapTileService.clearCache();

    res.json({
      success: true,
      message: 'Heat map cache cleared successfully',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('❌ Error clearing heat map cache:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to clear heat map cache',
      error: process.env.NODE_ENV === 'development' ? (error as Error).message : undefined
    });
  }
});

// Route 7: GET /heatmap/health - Heat map system health check
router.get('/health', async (req, res) => {
  try {
    const venues = await getHeatMapVenues();
    const stats = heatmapTileService.getStats();

    const health = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      venueCount: venues.length,
      cacheStats: stats.cache,
      kdeStats: stats.kde,
      config: stats.config,
      uptime: process.uptime()
    };

    res.json({
      success: true,
      data: health
    });
  } catch (error) {
    console.error('❌ Heat map health check failed:', error);
    res.status(500).json({
      success: false,
      message: 'Heat map system unhealthy',
      error: process.env.NODE_ENV === 'development' ? (error as Error).message : undefined
    });
  }
});

export default router;