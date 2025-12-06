import { Router } from 'express';
import prisma from '../lib/prisma';
import { authenticate } from '../shared/middleware/auth';

const router = Router();

/**
 * GET /api/dashboard/venue/:venueId
 * Get comprehensive venue dashboard data with zone-based monitoring
 */
router.get('/venue/:venueId', authenticate, async (req, res) => {
  try {
    const { venueId } = req.params;
    const { timeRange = '24h' } = req.query;

    // Calculate time range
    const now = new Date();
    let startTime = new Date();

    switch (timeRange) {
      case '1h':
        startTime = new Date(now.getTime() - 60 * 60 * 1000);
        break;
      case '6h':
        startTime = new Date(now.getTime() - 6 * 60 * 60 * 1000);
        break;
      case '24h':
        startTime = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        break;
      case '7d':
        startTime = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case '30d':
        startTime = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      default:
        startTime = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    }

    // Fetch venue details
    const venue = await prisma.venue.findUnique({
      where: { id: venueId },
      include: {
        zones: {
          where: { isActive: true },
          orderBy: { name: 'asc' }
        }
      }
    });

    if (!venue) {
      return res.status(404).json({ error: 'Venue not found' });
    }

    // Fetch latest beacon data for each zone
    const zoneData = await Promise.all(
      venue.zones.map(async (zone) => {
        // Latest data point
        const latest = await prisma.beaconData.findFirst({
          where: { zoneId: zone.id },
          orderBy: { timestamp: 'desc' }
        });

        // Historical data for time range
        const historical = await prisma.beaconData.findMany({
          where: {
            zoneId: zone.id,
            timestamp: { gte: startTime }
          },
          orderBy: { timestamp: 'asc' },
          select: {
            timestamp: true,
            currentOccupancy: true,
            activeDevices: true,
            peakOccupancy: true
          }
        });

        // Calculate zone metrics
        const totalOccupancy = historical.reduce((sum, d) => sum + d.currentOccupancy, 0);
        const avgOccupancy = historical.length > 0 ? Math.round(totalOccupancy / historical.length) : 0;
        const peakOccupancy = historical.reduce((max, d) => Math.max(max, d.peakOccupancy), 0);

        return {
          zone: {
            id: zone.id,
            name: zone.name,
            description: zone.description,
            floor: zone.floor,
            capacity: zone.capacity
          },
          current: {
            occupancy: latest?.currentOccupancy || 0,
            activeDevices: latest?.activeDevices || 0,
            timestamp: latest?.timestamp || null,
            percentageFull: zone.capacity ? Math.round((latest?.currentOccupancy || 0) / zone.capacity * 100) : null
          },
          metrics: {
            averageOccupancy: avgOccupancy,
            peakOccupancy: peakOccupancy,
            dataPoints: historical.length
          },
          historical: historical.map(d => ({
            timestamp: d.timestamp,
            occupancy: d.currentOccupancy,
            devices: d.activeDevices
          }))
        };
      })
    });

    // Overall venue metrics
    const venueBeaconData = await prisma.beaconData.findMany({
      where: {
        venueId: venueId,
        timestamp: { gte: startTime }
      },
      orderBy: { timestamp: 'asc' }
    });

    const totalVenueOccupancy = venueBeaconData.reduce((sum, d) => sum + d.currentOccupancy, 0);
    const avgVenueOccupancy = venueBeaconData.length > 0
      ? Math.round(totalVenueOccupancy / venueBeaconData.length)
      : 0;
    const peakVenueOccupancy = venueBeaconData.reduce((max, d) => Math.max(max, d.peakOccupancy), 0);

    // Latest overall venue data
    const latestVenueData = await prisma.beaconData.findFirst({
      where: { venueId: venueId },
      orderBy: { timestamp: 'desc' }
    });

    // Device type breakdown from latest data
    const deviceTypes = latestVenueData?.devices as any[] || [];
    const deviceBreakdown = deviceTypes.reduce((acc: any, device: any) => {
      const type = device.type || 'Unknown';
      acc[type] = (acc[type] || 0) + 1;
      return acc;
    }, {});

    res.json({
      venue: {
        id: venue.id,
        name: venue.name,
        capacity: venue.capacity,
        location: venue.location
      },
      overall: {
        current: {
          occupancy: latestVenueData?.currentOccupancy || 0,
          activeDevices: latestVenueData?.activeDevices || 0,
          timestamp: latestVenueData?.timestamp || null,
          percentageFull: Math.round((latestVenueData?.currentOccupancy || 0) / venue.capacity * 100)
        },
        metrics: {
          averageOccupancy: avgVenueOccupancy,
          peakOccupancy: peakVenueOccupancy,
          dataPoints: venueBeaconData.length
        },
        deviceBreakdown
      },
      zones: zoneData,
      timeRange: {
        start: startTime,
        end: now,
        duration: timeRange as string
      }
    });

  } catch (error) {
    console.error('Error fetching venue dashboard:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/dashboard/venue/:venueId/realtime
 * Get real-time data for all zones (last 5 minutes)
 */
router.get('/venue/:venueId/realtime', authenticate, async (req, res) => {
  try {
    const { venueId } = req.params;
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);

    const venue = await prisma.venue.findUnique({
      where: { id: venueId },
      include: {
        zones: {
          where: { isActive: true }
        }
      }
    });

    if (!venue) {
      return res.status(404).json({ error: 'Venue not found' });
    }

    const realtimeData = await Promise.all(
      venue.zones.map(async (zone) => {
        const data = await prisma.beaconData.findMany({
          where: {
            zoneId: zone.id,
            timestamp: { gte: fiveMinutesAgo }
          },
          orderBy: { timestamp: 'desc' },
          take: 10
        });

        return {
          zoneId: zone.id,
          zoneName: zone.name,
          data: data.map(d => ({
            timestamp: d.timestamp,
            occupancy: d.currentOccupancy,
            devices: d.activeDevices
          }))
        };
      })
    });

    res.json({
      venueId,
      venueName: venue.name,
      timestamp: new Date(),
      zones: realtimeData
    });

  } catch (error) {
    console.error('Error fetching realtime data:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/dashboard/venue/:venueId/comparison
 * Compare zones side-by-side
 */
router.get('/venue/:venueId/comparison', authenticate, async (req, res) => {
  try {
    const { venueId } = req.params;
    const { timeRange = '24h' } = req.query;

    const now = new Date();
    let startTime = new Date();

    switch (timeRange) {
      case '1h':
        startTime = new Date(now.getTime() - 60 * 60 * 1000);
        break;
      case '24h':
        startTime = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        break;
      case '7d':
        startTime = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      default:
        startTime = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    }

    const venue = await prisma.venue.findUnique({
      where: { id: venueId },
      include: {
        zones: {
          where: { isActive: true }
        }
      }
    });

    if (!venue) {
      return res.status(404).json({ error: 'Venue not found' });
    }

    const comparison = await Promise.all(
      venue.zones.map(async (zone) => {
        const data = await prisma.beaconData.findMany({
          where: {
            zoneId: zone.id,
            timestamp: { gte: startTime }
          }
        });

        const totalOcc = data.reduce((sum, d) => sum + d.currentOccupancy, 0);
        const avgOcc = data.length > 0 ? totalOcc / data.length : 0;
        const peak = data.reduce((max, d) => Math.max(max, d.peakOccupancy), 0);
        const totalDevices = data.reduce((sum, d) => sum + d.activeDevices, 0);
        const avgDevices = data.length > 0 ? totalDevices / data.length : 0;

        return {
          zone: {
            id: zone.id,
            name: zone.name,
            floor: zone.floor,
            capacity: zone.capacity
          },
          metrics: {
            averageOccupancy: Math.round(avgOcc),
            peakOccupancy: peak,
            averageDevices: Math.round(avgDevices),
            utilizationRate: zone.capacity ? Math.round((avgOcc / zone.capacity) * 100) : null,
            dataPoints: data.length
          }
        };
      })
    });

    res.json({
      venueId,
      venueName: venue.name,
      timeRange: {
        start: startTime,
        end: now,
        duration: timeRange as string
      },
      zones: comparison
    });

  } catch (error) {
    console.error('Error fetching zone comparison:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
