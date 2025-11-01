import express from 'express';
import { PrismaClient, RSVPStatus, EventSource } from '@prisma/client';
import { authMiddleware, AuthRequest } from '../shared/middleware/auth';

const router = express.Router();
const prisma = new PrismaClient();

// MARK: - Get Events for Venue
router.get('/venue/:venueId', authMiddleware, async (req: AuthRequest, res) => {
    try {
        const { venueId } = req.params;
        const { startDate, endDate } = req.query;

        // Build filter
        const where: any = {
            venueId,
            isActive: true,
        };

        if (startDate) {
            where.startTime = { gte: new Date(startDate as string) };
        }

        if (endDate) {
            if (where.startTime) {
                where.startTime.lte = new Date(endDate as string);
            } else {
                where.startTime = { lte: new Date(endDate as string) };
            }
        }

        const events = await prisma.event.findMany({
            where,
            include: {
                venue: {
                    select: {
                        id: true,
                        name: true,
                        location: true,
                        latitude: true,
                        longitude: true,
                    },
                },
                createdBy: {
                    select: {
                        id: true,
                        firstName: true,
                        lastName: true,
                        profileImage: true,
                    },
                },
                rsvps: {
                    where: {
                        userId: req.user!.userId,
                    },
                    select: {
                        id: true,
                        status: true,
                    },
                },
                reminders: {
                    where: {
                        userId: req.user!.userId,
                    },
                    select: {
                        id: true,
                        reminderAt: true,
                    },
                },
                _count: {
                    select: {
                        rsvps: true,
                    },
                },
            },
            orderBy: {
                startTime: 'asc',
            },
        });

        res.json({
            success: true,
            events: events.map(event => ({
                ...event,
                userRSVP: event.rsvps[0] || null,
                userReminder: event.reminders[0] || null,
                rsvpCount: event._count.rsvps,
            })),
        });
    } catch (error) {
        console.error('Error fetching venue events:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch events' });
    }
});

// MARK: - Get Event by ID
router.get('/:eventId', authMiddleware, async (req: AuthRequest, res) => {
    try {
        const { eventId } = req.params;

        const event = await prisma.event.findUnique({
            where: { id: eventId },
            include: {
                venue: {
                    select: {
                        id: true,
                        name: true,
                        location: true,
                        latitude: true,
                        longitude: true,
                        images: true,
                    },
                },
                createdBy: {
                    select: {
                        id: true,
                        firstName: true,
                        lastName: true,
                        profileImage: true,
                    },
                },
                rsvps: {
                    where: {
                        userId: req.user!.userId,
                    },
                    select: {
                        id: true,
                        status: true,
                    },
                },
                reminders: {
                    where: {
                        userId: req.user!.userId,
                    },
                    select: {
                        id: true,
                        reminderAt: true,
                    },
                },
                _count: {
                    select: {
                        rsvps: true,
                    },
                },
            },
        });

        if (!event) {
            return res.status(404).json({ success: false, message: 'Event not found' });
        }

        res.json({
            success: true,
            event: {
                ...event,
                userRSVP: event.rsvps[0] || null,
                userReminder: event.reminders[0] || null,
                rsvpCount: event._count.rsvps,
            },
        });
    } catch (error) {
        console.error('Error fetching event:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch event' });
    }
});

// MARK: - Create Event (User-Created)
router.post('/', authMiddleware, async (req: AuthRequest, res) => {
    try {
        const {
            venueId,
            title,
            description,
            startTime,
            endTime,
            eventType,
            ticketPrice,
            capacity,
            imageUrl,
            artist,
            genre,
            isRecurring,
            recurringDays,
        } = req.body;

        // Validation
        if (!venueId || !title || !description || !startTime || !endTime || !eventType) {
            return res.status(400).json({
                success: false,
                message: 'Missing required fields',
            });
        }

        // Verify venue exists
        const venue = await prisma.venue.findUnique({
            where: { id: venueId },
        });

        if (!venue) {
            return res.status(404).json({
                success: false,
                message: 'Venue not found',
            });
        }

        // Create event
        const event = await prisma.event.create({
            data: {
                venueId,
                createdById: req.user!.userId,
                title,
                description,
                startTime: new Date(startTime),
                endTime: new Date(endTime),
                eventType,
                ticketPrice: ticketPrice || null,
                capacity: capacity || null,
                imageUrl: imageUrl || null,
                artist: artist || null,
                genre: genre || null,
                source: EventSource.USER_CREATED,
                isRecurring: isRecurring || false,
                recurringDays: recurringDays || [],
            },
            include: {
                venue: {
                    select: {
                        id: true,
                        name: true,
                        location: true,
                    },
                },
                createdBy: {
                    select: {
                        id: true,
                        firstName: true,
                        lastName: true,
                        profileImage: true,
                    },
                },
            },
        });

        res.status(201).json({
            success: true,
            message: 'Event created successfully',
            event,
        });
    } catch (error) {
        console.error('Error creating event:', error);
        res.status(500).json({ success: false, message: 'Failed to create event' });
    }
});

// MARK: - Update Event
router.patch('/:eventId', authMiddleware, async (req: AuthRequest, res) => {
    try {
        const { eventId } = req.params;
        const {
            title,
            description,
            startTime,
            endTime,
            eventType,
            ticketPrice,
            capacity,
            imageUrl,
            artist,
            genre,
            isRecurring,
            recurringDays,
            isActive,
        } = req.body;

        // Check if event exists and user is the creator
        const existingEvent = await prisma.event.findUnique({
            where: { id: eventId },
        });

        if (!existingEvent) {
            return res.status(404).json({ success: false, message: 'Event not found' });
        }

        if (existingEvent.createdById !== req.user!.userId) {
            return res.status(403).json({
                success: false,
                message: 'You can only edit events you created',
            });
        }

        // Cannot edit external events (Ticketmaster/Eventbrite)
        if (existingEvent.source !== EventSource.USER_CREATED) {
            return res.status(403).json({
                success: false,
                message: 'Cannot edit events from external sources',
            });
        }

        // Update event
        const updateData: any = {};
        if (title !== undefined) updateData.title = title;
        if (description !== undefined) updateData.description = description;
        if (startTime !== undefined) updateData.startTime = new Date(startTime);
        if (endTime !== undefined) updateData.endTime = new Date(endTime);
        if (eventType !== undefined) updateData.eventType = eventType;
        if (ticketPrice !== undefined) updateData.ticketPrice = ticketPrice;
        if (capacity !== undefined) updateData.capacity = capacity;
        if (imageUrl !== undefined) updateData.imageUrl = imageUrl;
        if (artist !== undefined) updateData.artist = artist;
        if (genre !== undefined) updateData.genre = genre;
        if (isRecurring !== undefined) updateData.isRecurring = isRecurring;
        if (recurringDays !== undefined) updateData.recurringDays = recurringDays;
        if (isActive !== undefined) updateData.isActive = isActive;

        const event = await prisma.event.update({
            where: { id: eventId },
            data: updateData,
            include: {
                venue: {
                    select: {
                        id: true,
                        name: true,
                        location: true,
                    },
                },
            },
        });

        res.json({
            success: true,
            message: 'Event updated successfully',
            event,
        });
    } catch (error) {
        console.error('Error updating event:', error);
        res.status(500).json({ success: false, message: 'Failed to update event' });
    }
});

// MARK: - Delete Event
router.delete('/:eventId', authMiddleware, async (req: AuthRequest, res) => {
    try {
        const { eventId } = req.params;

        // Check if event exists and user is the creator
        const event = await prisma.event.findUnique({
            where: { id: eventId },
        });

        if (!event) {
            return res.status(404).json({ success: false, message: 'Event not found' });
        }

        if (event.createdById !== req.user!.userId) {
            return res.status(403).json({
                success: false,
                message: 'You can only delete events you created',
            });
        }

        // Cannot delete external events
        if (event.source !== EventSource.USER_CREATED) {
            return res.status(403).json({
                success: false,
                message: 'Cannot delete events from external sources',
            });
        }

        // Delete event (cascade will delete RSVPs and reminders)
        await prisma.event.delete({
            where: { id: eventId },
        });

        res.json({
            success: true,
            message: 'Event deleted successfully',
        });
    } catch (error) {
        console.error('Error deleting event:', error);
        res.status(500).json({ success: false, message: 'Failed to delete event' });
    }
});

// MARK: - RSVP to Event
router.post('/:eventId/rsvp', authMiddleware, async (req: AuthRequest, res) => {
    try {
        const { eventId } = req.params;
        const { status } = req.body;

        // Validate status
        if (!status || !['GOING', 'INTERESTED', 'NOT_GOING'].includes(status)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid RSVP status',
            });
        }

        // Check if event exists
        const event = await prisma.event.findUnique({
            where: { id: eventId },
        });

        if (!event) {
            return res.status(404).json({ success: false, message: 'Event not found' });
        }

        // Upsert RSVP (create or update)
        const rsvp = await prisma.eventRSVP.upsert({
            where: {
                eventId_userId: {
                    eventId,
                    userId: req.user!.userId,
                },
            },
            create: {
                eventId,
                userId: req.user!.userId,
                status: status as RSVPStatus,
            },
            update: {
                status: status as RSVPStatus,
            },
        });

        res.json({
            success: true,
            message: 'RSVP updated successfully',
            rsvp,
        });
    } catch (error) {
        console.error('Error creating RSVP:', error);
        res.status(500).json({ success: false, message: 'Failed to RSVP' });
    }
});

// MARK: - Cancel RSVP
router.delete('/:eventId/rsvp', authMiddleware, async (req: AuthRequest, res) => {
    try {
        const { eventId } = req.params;

        // Delete RSVP
        await prisma.eventRSVP.deleteMany({
            where: {
                eventId,
                userId: req.user!.userId,
            },
        });

        res.json({
            success: true,
            message: 'RSVP cancelled successfully',
        });
    } catch (error) {
        console.error('Error cancelling RSVP:', error);
        res.status(500).json({ success: false, message: 'Failed to cancel RSVP' });
    }
});

// MARK: - Get RSVPs for Event
router.get('/:eventId/rsvps', authMiddleware, async (req: AuthRequest, res) => {
    try {
        const { eventId } = req.params;
        const { status } = req.query;

        // Build filter
        const where: any = { eventId };
        if (status) {
            where.status = status as RSVPStatus;
        }

        const rsvps = await prisma.eventRSVP.findMany({
            where,
            include: {
                event: {
                    select: {
                        id: true,
                        title: true,
                        startTime: true,
                    },
                },
            },
            orderBy: {
                createdAt: 'desc',
            },
        });

        // Get RSVP counts by status
        const counts = await prisma.eventRSVP.groupBy({
            by: ['status'],
            where: { eventId },
            _count: true,
        });

        res.json({
            success: true,
            rsvps,
            counts: counts.reduce((acc, curr) => {
                acc[curr.status] = curr._count;
                return acc;
            }, {} as any),
        });
    } catch (error) {
        console.error('Error fetching RSVPs:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch RSVPs' });
    }
});

// MARK: - Set Event Reminder
router.post('/:eventId/reminder', authMiddleware, async (req: AuthRequest, res) => {
    try {
        const { eventId } = req.params;
        const { reminderAt } = req.body;

        if (!reminderAt) {
            return res.status(400).json({
                success: false,
                message: 'reminderAt is required',
            });
        }

        // Check if event exists
        const event = await prisma.event.findUnique({
            where: { id: eventId },
        });

        if (!event) {
            return res.status(404).json({ success: false, message: 'Event not found' });
        }

        // Reminder time must be before event start
        const reminderTime = new Date(reminderAt);
        if (reminderTime >= event.startTime) {
            return res.status(400).json({
                success: false,
                message: 'Reminder time must be before event start time',
            });
        }

        // Upsert reminder (create or update)
        const reminder = await prisma.eventReminder.upsert({
            where: {
                eventId_userId: {
                    eventId,
                    userId: req.user!.userId,
                },
            },
            create: {
                eventId,
                userId: req.user!.userId,
                reminderAt: reminderTime,
            },
            update: {
                reminderAt: reminderTime,
                notified: false, // Reset notified flag if updating
            },
        });

        res.json({
            success: true,
            message: 'Reminder set successfully',
            reminder,
        });
    } catch (error) {
        console.error('Error setting reminder:', error);
        res.status(500).json({ success: false, message: 'Failed to set reminder' });
    }
});

// MARK: - Cancel Reminder
router.delete('/:eventId/reminder', authMiddleware, async (req: AuthRequest, res) => {
    try {
        const { eventId } = req.params;

        // Delete reminder
        await prisma.eventReminder.deleteMany({
            where: {
                eventId,
                userId: req.user!.userId,
            },
        });

        res.json({
            success: true,
            message: 'Reminder cancelled successfully',
        });
    } catch (error) {
        console.error('Error cancelling reminder:', error);
        res.status(500).json({ success: false, message: 'Failed to cancel reminder' });
    }
});

// MARK: - Get User's RSVPs
router.get('/user/rsvps', authMiddleware, async (req: AuthRequest, res) => {
    try {
        const { status, upcoming } = req.query;

        // Build filter
        const where: any = {
            userId: req.user!.userId,
        };

        if (status) {
            where.status = status as RSVPStatus;
        }

        // Filter for upcoming events only
        if (upcoming === 'true') {
            where.event = {
                startTime: { gte: new Date() },
            };
        }

        const rsvps = await prisma.eventRSVP.findMany({
            where,
            include: {
                event: {
                    include: {
                        venue: {
                            select: {
                                id: true,
                                name: true,
                                location: true,
                                latitude: true,
                                longitude: true,
                                images: true,
                            },
                        },
                    },
                },
            },
            orderBy: {
                event: {
                    startTime: 'asc',
                },
            },
        });

        res.json({
            success: true,
            rsvps,
        });
    } catch (error) {
        console.error('Error fetching user RSVPs:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch RSVPs' });
    }
});

// MARK: - Get User's Reminders
router.get('/user/reminders', authMiddleware, async (req: AuthRequest, res) => {
    try {
        const { upcoming } = req.query;

        // Build filter
        const where: any = {
            userId: req.user!.userId,
            notified: false, // Only show pending reminders
        };

        // Filter for upcoming events only
        if (upcoming === 'true') {
            where.reminderAt = { gte: new Date() };
        }

        const reminders = await prisma.eventReminder.findMany({
            where,
            include: {
                event: {
                    include: {
                        venue: {
                            select: {
                                id: true,
                                name: true,
                                location: true,
                                images: true,
                            },
                        },
                    },
                },
            },
            orderBy: {
                reminderAt: 'asc',
            },
        });

        res.json({
            success: true,
            reminders,
        });
    } catch (error) {
        console.error('Error fetching user reminders:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch reminders' });
    }
});

// MARK: - Sync External Event (Ticketmaster/Eventbrite)
// This endpoint is called by the iOS app when displaying Ticketmaster/Eventbrite events
router.post('/sync-external', authMiddleware, async (req: AuthRequest, res) => {
    try {
        const {
            externalId,
            source,
            venueId,
            title,
            description,
            startTime,
            endTime,
            eventType,
            ticketPrice,
            ticketURL,
            imageUrl,
            artist,
            genre,
        } = req.body;

        // Validation
        if (!externalId || !source || !venueId || !title || !startTime || !endTime) {
            return res.status(400).json({
                success: false,
                message: 'Missing required fields',
            });
        }

        if (!['TICKETMASTER', 'EVENTBRITE', 'VENUE_WEBSITE'].includes(source)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid event source',
            });
        }

        // Check if event already synced
        const existingEvent = await prisma.event.findFirst({
            where: {
                externalId,
                source: source as EventSource,
            },
        });

        if (existingEvent) {
            return res.json({
                success: true,
                message: 'Event already synced',
                event: existingEvent,
            });
        }

        // Create event
        // For automated events (API key auth), don't set createdById
        const isApiKeyAuth = req.user!.userId === 'admin-api-key';

        const event = await prisma.event.create({
            data: {
                venueId,
                ...(isApiKeyAuth ? {} : { createdById: req.user!.userId }),
                externalId,
                source: source as EventSource,
                title,
                description: description || '',
                startTime: new Date(startTime),
                endTime: new Date(endTime),
                eventType: eventType || 'Live Music',
                ticketPrice: ticketPrice || null,
                ticketURL: ticketURL || null,
                imageUrl: imageUrl || null,
                artist: artist || null,
                genre: genre || null,
            },
        });

        res.status(201).json({
            success: true,
            message: 'Event synced successfully',
            event,
        });
    } catch (error) {
        console.error('❌ Error syncing external event:', error);
        console.error('❌ Error details:', JSON.stringify(error, null, 2));
        console.error('❌ Request body:', JSON.stringify(req.body, null, 2));
        res.status(500).json({ success: false, message: 'Failed to sync event' });
    }
});

export default router;
