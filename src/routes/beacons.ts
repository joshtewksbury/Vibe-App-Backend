import express, { Request, Response } from 'express';
import prisma from '../lib/prisma';

const router = express.Router();

/**
 * POST /api/beacons/data
 * Receives data from ESP32 beacon devices
 * Stores foot traffic and user demographic data
 */
router.post('/data', async (req: Request, res: Response) => {
  try {
    const {
      venue_id,
      timestamp,
      current_occupancy,
      peak_occupancy,
      unique_devices_total,
      active_devices,
      devices,
      user_data
    } = req.body;

    console.log('\n📡 Received from beacon:');
    console.log('Venue:', venue_id);
    console.log('Timestamp:', new Date(timestamp * 1000).toLocaleString());
    console.log('Current occupancy:', current_occupancy);
    console.log('Peak occupancy:', peak_occupancy);

    // Try to find zone first (for multi-zone venues like The Star)
    let zone = await prisma.venueZone.findFirst({
      where: { id: venue_id },
      include: { venue: true }
    });

    let venue;
    let zoneId: string | null = null;

    if (zone) {
      // This is a zone ID
      venue = zone.venue;
      zoneId = zone.id;
      console.log(`📍 Zone: ${zone.name}`);
    } else {
      // Try to find venue by name
      venue = await prisma.venue.findFirst({
        where: { name: venue_id }
      });

      if (!venue) {
        console.log(`⚠️  Venue "${venue_id}" not found in database. Creating placeholder...`);
        // Create a placeholder venue
        venue = await prisma.venue.create({
          data: {
            name: venue_id,
            location: 'To be configured',
            latitude: 0,
            longitude: 0,
            category: 'bar',
            capacity: 100,
            priceRange: '$',
            openingHours: {}
          }
        });
      }
    }

    // Store beacon data
    const beaconData = await prisma.beaconData.create({
      data: {
        venueId: venue.id,
        zoneId: zoneId,
        timestamp: new Date(timestamp * 1000),
        currentOccupancy: current_occupancy,
        peakOccupancy: peak_occupancy,
        uniqueDevicesTotal: unique_devices_total,
        activeDevices: active_devices,
        devices: devices || [],
        userData: user_data || []
      }
    });

    // Update zone occupancy if applicable
    if (zoneId) {
      await prisma.venueZone.update({
        where: { id: zoneId },
        data: {
          currentOccupancy: current_occupancy
        }
      });
    }

    // Update venue's live busyness score
    // Convert occupancy to a 0-100 scale (you can adjust this logic)
    const busynessScore = Math.min(Math.round((current_occupancy / 50) * 100), 100);

    await prisma.venue.update({
      where: { id: venue.id },
      data: {
        currentBusyness: busynessScore,
        lastBeaconUpdate: new Date()
      }
    });

    if (devices && devices.length > 0) {
      console.log(`🔍 Detected ${devices.length} devices`);
    }

    if (user_data && user_data.length > 0) {
      console.log(`👤 User data: ${user_data.length} users`);

      // Calculate demographics
      const genderCount: Record<string, number> = {};
      const ageGroups = { '18-24': 0, '25-34': 0, '35-44': 0, '45+': 0 };
      let conversions = 0;

      user_data.forEach((user: any) => {
        genderCount[user.gender] = (genderCount[user.gender] || 0) + 1;

        if (user.age < 25) ageGroups['18-24']++;
        else if (user.age < 35) ageGroups['25-34']++;
        else if (user.age < 45) ageGroups['35-44']++;
        else ageGroups['45+']++;

        if (user.converted) conversions++;
      });

      console.log('📊 Demographics:');
      console.log('  Gender:', genderCount);
      console.log('  Age groups:', ageGroups);
      console.log('  Conversions:', conversions, '/', user_data.length);
    }

    res.json({
      status: 'success',
      message: 'Beacon data stored successfully',
      venueId: venue.id,
      beaconDataId: beaconData.id
    });

  } catch (error) {
    console.error('Error processing beacon data:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to process beacon data',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * GET /api/beacons/venue/:venueId/live
 * Returns live occupancy data for a venue
 */
router.get('/venue/:venueId/live', async (req: Request, res: Response) => {
  try {
    const { venueId } = req.params;

    const venue = await prisma.venue.findUnique({
      where: { id: venueId },
      select: {
        id: true,
        name: true,
        currentBusyness: true,
        lastBeaconUpdate: true
      }
    });

    if (!venue) {
      return res.status(404).json({
        status: 'error',
        message: 'Venue not found'
      });
    }

    // Get the latest beacon data (last 10 minutes)
    const latestData = await prisma.beaconData.findFirst({
      where: {
        venueId: venueId,
        timestamp: {
          gte: new Date(Date.now() - 10 * 60 * 1000)
        }
      },
      orderBy: {
        timestamp: 'desc'
      }
    });

    res.json({
      status: 'success',
      venue: {
        id: venue.id,
        name: venue.name,
        currentBusyness: venue.currentBusyness,
        lastUpdate: venue.lastBeaconUpdate
      },
      liveData: latestData ? {
        timestamp: latestData.timestamp,
        currentOccupancy: latestData.currentOccupancy,
        peakOccupancy: latestData.peakOccupancy,
        activeDevices: latestData.activeDevices,
        userData: latestData.userData
      } : null
    });

  } catch (error) {
    console.error('Error fetching live venue data:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to fetch live venue data'
    });
  }
});

/**
 * GET /api/beacons/venue/:venueId/history
 * Returns historical occupancy data for a venue
 */
router.get('/venue/:venueId/history', async (req: Request, res: Response) => {
  try {
    const { venueId } = req.params;
    const { hours = 24 } = req.query;

    const hoursAgo = parseInt(hours as string);
    const startTime = new Date(Date.now() - hoursAgo * 60 * 60 * 1000);

    const history = await prisma.beaconData.findMany({
      where: {
        venueId: venueId,
        timestamp: {
          gte: startTime
        }
      },
      orderBy: {
        timestamp: 'asc'
      },
      select: {
        timestamp: true,
        currentOccupancy: true,
        peakOccupancy: true,
        activeDevices: true
      }
    });

    res.json({
      status: 'success',
      venueId,
      period: `${hoursAgo} hours`,
      dataPoints: history.length,
      history
    });

  } catch (error) {
    console.error('Error fetching venue history:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to fetch venue history'
    });
  }
});

export default router;
