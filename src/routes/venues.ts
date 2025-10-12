import express, { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { asyncHandler, createError } from '../middleware/errorHandler';
import { AuthenticatedRequest, requireRole, requireVenueAccess } from '../middleware/auth';
import {
  validateCreateVenue,
  validateUpdateVenue,
  validateCreateDeal,
  validateCreateEvent,
  validateCreatePost
} from '../utils/validation';
import { SerpAPIService } from '../services/serpApi';
import { GooglePlacesService } from '../services/googlePlaces';
import { calculateVenueStatus, getStatusColor } from '../utils/venueStatusColors';

const router = express.Router();
const prisma = new PrismaClient();
const serpApiService = new SerpAPIService();
const googlePlacesService = new GooglePlacesService();

// GET /venues - Get all venues with optional filtering
router.get('/', asyncHandler(async (req: Request, res: Response) => {
  const { lat, lng, radius = 10000, category, limit = 50, offset = 0 } = req.query;

  let whereClause: any = {};
  let orderBy: any = { name: 'asc' };

  // Filter by category if provided
  if (category) {
    whereClause.category = {
      contains: category as string,
      mode: 'insensitive'
    };
  }

  // If location provided, we can add distance-based filtering
  // Note: For production, you'd want to use PostGIS or similar for proper geo queries
  if (lat && lng) {
    const latitude = parseFloat(lat as string);
    const longitude = parseFloat(lng as string);
    const radiusKm = parseFloat(radius as string) / 1000;

    // Simple bounding box calculation (not precise but works for demo)
    const latRange = radiusKm / 111; // Rough km to degree conversion
    const lngRange = radiusKm / (111 * Math.cos(latitude * Math.PI / 180));

    whereClause.latitude = {
      gte: latitude - latRange,
      lte: latitude + latRange
    };
    whereClause.longitude = {
      gte: longitude - lngRange,
      lte: longitude + lngRange
    };
  }

  const venues = await prisma.venue.findMany({
    where: whereClause,
    orderBy,
    take: parseInt(limit as string),
    skip: parseInt(offset as string),
    include: {
      busySnapshots: {
        where: {
          timestamp: {
            gte: new Date(Date.now() - 24 * 60 * 60 * 1000) // Last 24 hours
          }
        },
        orderBy: { timestamp: 'desc' },
        take: 1
      },
      venueImages: {
        where: {
          imageType: 'ICON',
          isActive: true
        },
        take: 1
      }
    }
  });

  // Add current busy status and ensure popular times for each venue
  const venuesWithStatus = await Promise.all(venues.map(async (venue) => {
    const latestSnapshot = venue.busySnapshots[0];
    const iconImage = venue.venueImages?.[0];

    // Ensure venue has popular times (fetch if missing or outdated)
    const venueWithPopularTimes = await ensurePopularTimes(venue);

    // Get icon URL from hosted images in /uploads
    // Map venue names to their actual filenames (from upload_venue_icons.js)
    const venueNameToFilename: { [key: string]: string } = {
      'Hey Chica': 'heychica.jpg',
      'Iris Rooftop': 'irisrooftop.jpg',
      'The MET': 'themet.jpg',
      'The Beat': 'thebeat.jpg',
      'Honky Tonks': 'honkytonks.jpg',
      'Black Bear Lodge': 'blackbearlodge.jpg',
      'Su Casa': 'sucasa.jpg',
      'The Boundary': 'theboundary.jpg',
      'Archive': 'archive.jpg',
      'Prohibition': 'prohibition.jpg',
      'Birdees': 'birdees.jpg',
      'Sixes and Sevens': 'sixesandsevens.jpg',
      "Johnny Ringo's": 'johnnyringos.jpg',
      'Maya Rooftop Bar': 'maya.jpg',
      'Osbourne Hotel': 'osbournehotel.jpg',
      'Regatta Hotel': 'regatta.jpg',
      'Rics Bar': 'ricsbar.jpg',
      'Royal Exchange Hotel': 'royalexchangehotel.jpg',
      'Sixteen Antlers': 'sixteenantlers.jpg',
      'Soko': 'soko.jpg',
      'The Tax Office': 'taxoffice.jpg',
      'Warehouse 25': 'warehouse25.jpg',
      'Riverland Brisbane': 'riverland.jpg',
      'Blackbird Brisbane': 'blackbird.jpg',
      "Friday's Riverside Brisbane": 'fridays.jpg',
      'Riverbar & Kitchen Brisbane': 'riverbarandkitchen.jpg',
      'Bar Pacino Brisbane': 'barpacino.jpg',
      'Hotel West End': 'hotelwestend.jpg',
      'The Normanby Hotel': 'thenormanbyhotel.jpg',
      'The Newmarket Hotel': 'newmarkethotel.jpg',
      'Eclipse Nightclub': 'eclipse.jpg',
      'Retros': 'retros.jpg',
      'The Triffid': 'thetriffid.jpg',
      'The Tivoli': 'thetivoli.jpg',
      "Mr Percival's": 'mrpercivals.jpg',
      'The Lobby Bar': 'lobbybar.jpg',
      'Jubilee Hotel': 'jubileehotel.jpg',
      'Alfred & Constance': 'alfredandconstance.jpg',
      'The Star Brisbane': 'thestarbrisbane.jpg',
      'Felons Brewing Co': 'felons.jpg',
      'Pawn & Co Brisbane': 'pawn&co.jpg',
      'Wonderland': 'wonderland.jpg',
      'Enigma': 'enigma.jpg',
      'Greaser': 'greaser.jpg',
      'QA Hotel': 'qahotel.jpg',
      'The Magee': 'themagee.jpg',
      'Indooroopilly Hotel': 'indooroopillyhotel.jpg',
      'The Paddo': 'thepaddo.jpg',
      "Lefty's Music Hall": 'leftysmusichall.jpg',
      'The Caxton Hotel': 'thecaxtonhotel.jpg',
      'Death and Taxes Brisbane': 'deathandtaxes.jpg',
      'Cloudland': 'cloudland.jpg',
      'The Wickham': 'thewickham.jpg',
      'Summer House': 'summahouse.jpg',
      'Empire Hotel': 'empirehotel.jpg',
      "Pig 'N' Whistle": 'pignwhistle.jpg',
      'Netherworld': 'netherworld.jpg',
      'Darling & Co.': 'darling&co.jpg',
      'The Brightside': 'thebrightside.jpg',
      'Greens': 'greens.jpg',
      "RG's": 'rgs.jpg',
      'The Sound Garden': 'thesoundgarden.jpg',
      'El Camino Cantina Brisbane': 'elcamino.jpg',
      "Pig 'N' Whistle Riverside": 'pignwhistle.jpg',
      "Pig 'N' Whistle West End": 'pignwhistle.jpg',
      "Pig 'N' Whistle Indooroopilly": 'pignwhistle.jpg',
      'The Prince Consort Hotel': 'princeconsort.jpg'
    };

    // Prioritize: 1) venueIconUrl (Cloudinary), 2) venueIcon (Instagram URLs), 3) local uploads, 4) VenueImage table
    let venueIconURL = venueWithPopularTimes.venueIconUrl ||
                       venueWithPopularTimes.venueIcon ||
                       (venueNameToFilename[venue.name] ? `/uploads/${venueNameToFilename[venue.name]}` : null) ||
                       iconImage?.url ||
                       null;

    // Calculate status and color based on actual occupancy
    const currentOcc = latestSnapshot?.occupancyCount || venue.currentOccupancy || 0;
    const status = calculateVenueStatus(currentOcc, venue.capacity);
    const statusColor = getStatusColor(status);

    return {
      ...venueWithPopularTimes,
      currentStatus: latestSnapshot?.status || status,
      currentOccupancy: currentOcc,
      occupancyPercentage: latestSnapshot?.occupancyPercentage || Math.round((currentOcc / venue.capacity) * 100),
      statusColor: statusColor.hex,
      statusColorRgb: statusColor.rgb,
      venueIcon: venueIconURL,
      busySnapshots: undefined, // Remove from response
      venueImages: undefined // Remove from response
    };
  }));

  res.json({
    venues: venuesWithStatus,
    metadata: {
      total: venuesWithStatus.length,
      limit: parseInt(limit as string),
      offset: parseInt(offset as string),
      hasMore: venuesWithStatus.length === parseInt(limit as string)
    }
  });
}));

// GET /venues/:id - Get single venue
router.get('/:id', asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;

  const venue = await prisma.venue.findUnique({
    where: { id },
    include: {
      busySnapshots: {
        where: {
          timestamp: {
            gte: new Date(Date.now() - 24 * 60 * 60 * 1000) // Last 24 hours
          }
        },
        orderBy: { timestamp: 'desc' },
        take: 24 // Last 24 hours of data
      },
      deals: {
        where: {
          isActive: true,
          validFrom: { lte: new Date() },
          validUntil: { gte: new Date() }
        }
      },
      events: {
        where: {
          isActive: true,
          startTime: { gte: new Date() }
        },
        orderBy: { startTime: 'asc' }
      },
      venueImages: {
        where: {
          isActive: true
        },
        orderBy: {
          displayOrder: 'asc'
        }
      }
    }
  });

  if (!venue) {
    throw createError('Venue not found', 404);
  }

  // Ensure venue has popular times
  const venueWithPopularTimes = await ensurePopularTimes(venue);

  // Extract icon image
  const iconImage = venueWithPopularTimes.venueImages?.find(img => img.imageType === 'ICON');

  // Prioritize: 1) venueIconUrl (Cloudinary), 2) venueIcon (Instagram URLs), 3) VenueImage table
  const venueIconURL = venueWithPopularTimes.venueIconUrl ||
                       venueWithPopularTimes.venueIcon ||
                       iconImage?.url ||
                       null;

  const venueWithIcon = {
    ...venueWithPopularTimes,
    venueIcon: venueIconURL
  };

  res.json({ venue: venueWithIcon });
}));

// GET /venues/:id/busy - Get venue busy data
router.get('/:id/busy', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { hours = 24 } = req.query;

  const venue = await prisma.venue.findUnique({
    where: { id }
  });

  if (!venue) {
    throw createError('Venue not found', 404);
  }

  const hoursBack = parseInt(hours as string);
  const snapshots = await prisma.busySnapshot.findMany({
    where: {
      venueId: id,
      timestamp: {
        gte: new Date(Date.now() - hoursBack * 60 * 60 * 1000)
      }
    },
    orderBy: { timestamp: 'asc' }
  });

  res.json({
    venueId: id,
    snapshots,
    lastUpdated: new Date()
  });
}));

// GET /venues/:id/busy/aggregates - Get venue busy aggregates
router.get('/:id/busy/aggregates', asyncHandler(async (req, res) => {
  const { id } = req.params;

  const venue = await prisma.venue.findUnique({
    where: { id }
  });

  if (!venue) {
    throw createError('Venue not found', 404);
  }

  // Get snapshots for the last 30 days for aggregation
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const snapshots = await prisma.busySnapshot.findMany({
    where: {
      venueId: id,
      timestamp: { gte: thirtyDaysAgo }
    }
  });

  // Calculate hourly averages
  const hourlyData = new Map<number, { total: number; count: number; peak: number }>();

  snapshots.forEach(snapshot => {
    const hour = snapshot.timestamp.getHours();
    const current = hourlyData.get(hour) || { total: 0, count: 0, peak: 0 };

    current.total += snapshot.occupancyPercentage;
    current.count += 1;
    current.peak = Math.max(current.peak, snapshot.occupancyPercentage);

    hourlyData.set(hour, current);
  });

  const hourlyAverages = Array.from({ length: 24 }, (_, hour) => {
    const data = hourlyData.get(hour);
    return {
      hour,
      averageOccupancy: data ? data.total / data.count : 0,
      peakOccupancy: data ? data.peak : 0
    };
  });

  // Calculate daily averages
  const dailyData = new Map<number, { total: number; count: number }>();

  snapshots.forEach(snapshot => {
    const dayOfWeek = snapshot.timestamp.getDay();
    const current = dailyData.get(dayOfWeek) || { total: 0, count: 0 };

    current.total += snapshot.occupancyPercentage;
    current.count += 1;

    dailyData.set(dayOfWeek, current);
  });

  const dailyAverages = Array.from({ length: 7 }, (_, day) => {
    const data = dailyData.get(day);
    const peakHour = hourlyAverages.reduce((max, curr) =>
      curr.averageOccupancy > max.averageOccupancy ? curr : max
    );

    return {
      dayOfWeek: day,
      averageOccupancy: data ? data.total / data.count : 0,
      peakHour: peakHour.hour
    };
  });

  res.json({
    venueId: id,
    hourlyAverages,
    dailyAverages,
    weeklyAverages: [] // Would calculate weekly trends over longer periods
  });
}));

// POST /venues - Create new venue (Admin only)
router.post('/', requireRole(['ADMIN']), asyncHandler(async (req: AuthenticatedRequest, res) => {
  const { error, value } = validateCreateVenue(req.body);
  if (error) {
    throw createError(error.details[0].message, 400);
  }

  const venue = await prisma.venue.create({
    data: value
  });

  res.status(201).json({
    message: 'Venue created successfully',
    venue
  });
}));

// PUT /venues/:id - Update venue (Admin only)
router.put('/:id', requireRole(['ADMIN']), asyncHandler(async (req: AuthenticatedRequest, res) => {
  const { id } = req.params;
  const { error, value } = validateUpdateVenue(req.body);
  if (error) {
    throw createError(error.details[0].message, 400);
  }

  const venue = await prisma.venue.update({
    where: { id },
    data: value
  });

  res.json({
    message: 'Venue updated successfully',
    venue
  });
}));

// POST /venues/:id/deals - Create deal (Venue Manager or Admin)
router.post('/:id/deals',
  requireRole(['VENUE_MANAGER', 'ADMIN']),
  requireVenueAccess(),
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const { id: venueId } = req.params;
    const { error, value } = validateCreateDeal(req.body);
    if (error) {
      throw createError(error.details[0].message, 400);
    }

    const deal = await prisma.deal.create({
      data: {
        ...value,
        venueId,
        createdById: req.user!.id
      }
    });

    res.status(201).json({
      message: 'Deal created successfully',
      deal
    });
  })
);

// POST /venues/:id/events - Create event (Venue Manager or Admin)
router.post('/:id/events',
  requireRole(['VENUE_MANAGER', 'ADMIN']),
  requireVenueAccess(),
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const { id: venueId } = req.params;
    const { error, value } = validateCreateEvent(req.body);
    if (error) {
      throw createError(error.details[0].message, 400);
    }

    const event = await prisma.event.create({
      data: {
        ...value,
        venueId,
        createdById: req.user!.id
      }
    });

    res.status(201).json({
      message: 'Event created successfully',
      event
    });
  })
);

// POST /venues/:id/posts - Create post (Venue Manager or Admin)
router.post('/:id/posts',
  requireRole(['VENUE_MANAGER', 'ADMIN']),
  requireVenueAccess(),
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const { id: venueId } = req.params;
    const { error, value } = validateCreatePost(req.body);
    if (error) {
      throw createError(error.details[0].message, 400);
    }

    const post = await prisma.post.create({
      data: {
        ...value,
        venueId,
        authorId: req.user!.id
      }
    });

    res.status(201).json({
      message: 'Post created successfully',
      post
    });
  })
);

// GET /venues/:id/analytics/overview - Get venue analytics (Venue Manager or Admin)
router.get('/:id/analytics/overview',
  requireRole(['VENUE_MANAGER', 'ADMIN']),
  requireVenueAccess(),
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const { id: venueId } = req.params;

    // Get venue
    const venue = await prisma.venue.findUnique({
      where: { id: venueId }
    });

    if (!venue) {
      throw createError('Venue not found', 404);
    }

    // Calculate analytics
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const [snapshots, deals, events, posts] = await Promise.all([
      prisma.busySnapshot.findMany({
        where: {
          venueId,
          timestamp: { gte: thirtyDaysAgo }
        }
      }),
      prisma.deal.count({
        where: {
          venueId,
          createdAt: { gte: thirtyDaysAgo }
        }
      }),
      prisma.event.count({
        where: {
          venueId,
          createdAt: { gte: thirtyDaysAgo }
        }
      }),
      prisma.post.count({
        where: {
          venueId,
          createdAt: { gte: thirtyDaysAgo }
        }
      })
    ]);

    // Calculate metrics
    const totalVisitors = snapshots.reduce((sum, s) => sum + s.occupancyCount, 0);
    const averageOccupancy = snapshots.length > 0
      ? snapshots.reduce((sum, s) => sum + s.occupancyPercentage, 0) / snapshots.length
      : 0;

    // Find peak hours
    const hourlyData = new Map<number, number[]>();
    snapshots.forEach(snapshot => {
      const hour = snapshot.timestamp.getHours();
      if (!hourlyData.has(hour)) {
        hourlyData.set(hour, []);
      }
      hourlyData.get(hour)!.push(snapshot.occupancyPercentage);
    });

    const peakHours = Array.from(hourlyData.entries())
      .map(([hour, percentages]) => ({
        hour,
        average: percentages.reduce((sum, p) => sum + p, 0) / percentages.length
      }))
      .sort((a, b) => b.average - a.average)
      .slice(0, 3)
      .map(h => `${h.hour}:00`);

    res.json({
      venueId,
      totalVisitors,
      averageOccupancy: Math.round(averageOccupancy),
      peakHours,
      popularDays: ['Friday', 'Saturday'], // Would calculate from data
      period: '30 days',
      dealsCreated: deals,
      eventsCreated: events,
      postsCreated: posts
    });
  })
);

// POST /venues/populate-popular-times - Populate all venues with popular times data
router.post('/populate-popular-times', asyncHandler(async (req: Request, res: Response) => {
  console.log('🔄 Starting popular times population for all venues...');

  const venues = await prisma.venue.findMany({
    select: {
      id: true,
      name: true,
      location: true,
      popularTimes: true,
      popularTimesUpdated: true
    }
  });

  let updated = 0;
  let skipped = 0;
  let failed = 0;

  for (const venue of venues) {
    try {
      // Skip if updated within last 7 days
      if (venue.popularTimesUpdated) {
        const daysSinceUpdate = (Date.now() - venue.popularTimesUpdated.getTime()) / (1000 * 60 * 60 * 24);
        if (daysSinceUpdate < 7) {
          console.log(`⏭️  Skipping ${venue.name} - updated ${Math.floor(daysSinceUpdate)} days ago`);
          skipped++;
          continue;
        }
      }

      console.log(`📡 Fetching popular times for ${venue.name}...`);

      // Try SerpAPI first
      const popularTimesData = await serpApiService.fetchPopularTimes(venue.name, venue.location);

      if (popularTimesData && popularTimesData.popularTimes) {
        await prisma.venue.update({
          where: { id: venue.id },
          data: {
            popularTimes: popularTimesData.popularTimes,
            popularTimesUpdated: new Date()
          }
        });
        console.log(`✅ Updated ${venue.name} with real popular times data`);
        updated++;
      } else {
        // Generate estimated data based on venue category
        const venueWithCategory = await prisma.venue.findUnique({
          where: { id: venue.id },
          select: { category: true }
        });

        const estimatedData = serpApiService.generateEstimatedPopularTimes(venueWithCategory?.category || 'bar');

        await prisma.venue.update({
          where: { id: venue.id },
          data: {
            popularTimes: estimatedData,
            popularTimesUpdated: new Date()
          }
        });
        console.log(`📊 Updated ${venue.name} with estimated data (real data unavailable)`);
        updated++;
      }

      // Add delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 1000));

    } catch (error) {
      console.error(`❌ Failed to update ${venue.name}:`, error);
      failed++;
    }
  }

  res.json({
    message: 'Popular times population complete',
    totalVenues: venues.length,
    updated,
    skipped,
    failed
  });
}));

// Helper function to check if popular times need refresh
async function ensurePopularTimes(venue: any): Promise<any> {
  // If no popular times or outdated (>7 days), fetch new data
  const needsRefresh = !venue.popularTimes ||
    !venue.popularTimesUpdated ||
    (Date.now() - new Date(venue.popularTimesUpdated).getTime()) > (7 * 24 * 60 * 60 * 1000);

  if (needsRefresh) {
    try {
      console.log(`🔄 Fetching popular times for ${venue.name}...`);

      const popularTimesData = await serpApiService.fetchPopularTimes(venue.name, venue.location);

      if (popularTimesData && popularTimesData.popularTimes) {
        // Update in background
        prisma.venue.update({
          where: { id: venue.id },
          data: {
            popularTimes: popularTimesData.popularTimes,
            popularTimesUpdated: new Date()
          }
        }).catch(err => console.error('Failed to update popular times:', err));

        venue.popularTimes = popularTimesData.popularTimes;
      } else {
        // Use estimated data
        const estimatedData = serpApiService.generateEstimatedPopularTimes(venue.category);
        venue.popularTimes = estimatedData;
      }
    } catch (error) {
      console.error(`Failed to fetch popular times for ${venue.name}:`, error);
      // Use estimated data as fallback
      venue.popularTimes = serpApiService.generateEstimatedPopularTimes(venue.category);
    }
  }

  return venue;
}

export default router;