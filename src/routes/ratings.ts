import express, { Request, Response } from 'express';
import prisma from '../lib/prisma';
import { authMiddleware } from '../shared/middleware/auth';

const router = express.Router();

/**
 * POST /api/ratings
 * Submit or update a rating for a venue
 */
router.post('/', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { venueId, rating, review } = req.body;
    const userId = (req as any).userId; // From authMiddleware

    // Validate rating
    if (rating < 1 || rating > 5) {
      return res.status(400).json({
        status: 'error',
        message: 'Rating must be between 1 and 5'
      });
    }

    // Check if venue exists
    const venue = await prisma.venue.findUnique({
      where: { id: venueId }
    });

    if (!venue) {
      return res.status(404).json({
        status: 'error',
        message: 'Venue not found'
      });
    }

    // Upsert rating (create or update)
    const venueRating = await prisma.venueRating.upsert({
      where: {
        venueId_userId: {
          venueId,
          userId
        }
      },
      update: {
        rating,
        review: review || null
      },
      create: {
        venueId,
        userId,
        rating,
        review: review || null
      }
    });

    res.json({
      status: 'success',
      message: 'Rating submitted successfully',
      rating: venueRating
    });

  } catch (error) {
    console.error('Error submitting rating:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to submit rating',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * GET /api/ratings/venue/:venueId
 * Get all ratings and stats for a venue
 */
router.get('/venue/:venueId', async (req: Request, res: Response) => {
  try {
    const { venueId } = req.params;

    // Get all ratings for the venue
    const ratings = await prisma.venueRating.findMany({
      where: { venueId },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            profileImage: true
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    // Calculate stats
    const totalRatings = ratings.length;
    const averageRating = totalRatings > 0
      ? ratings.reduce((sum, r) => sum + r.rating, 0) / totalRatings
      : 0;

    // Rating breakdown (1-5 stars)
    const breakdown = {
      5: ratings.filter(r => r.rating === 5).length,
      4: ratings.filter(r => r.rating >= 4 && r.rating < 5).length,
      3: ratings.filter(r => r.rating >= 3 && r.rating < 4).length,
      2: ratings.filter(r => r.rating >= 2 && r.rating < 3).length,
      1: ratings.filter(r => r.rating < 2).length
    };

    res.json({
      status: 'success',
      stats: {
        totalRatings,
        averageRating: Math.round(averageRating * 10) / 10 // Round to 1 decimal
      },
      breakdown,
      ratings: ratings.map(r => ({
        id: r.id,
        rating: r.rating,
        review: r.review,
        createdAt: r.createdAt,
        user: {
          name: `${r.user.firstName} ${r.user.lastName.charAt(0)}.`,
          profileImage: r.user.profileImage
        }
      }))
    });

  } catch (error) {
    console.error('Error fetching ratings:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to fetch ratings',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * GET /api/ratings/venue/:venueId/user
 * Get current user's rating for a venue (requires auth)
 */
router.get('/venue/:venueId/user', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { venueId } = req.params;
    const userId = (req as any).userId;

    const rating = await prisma.venueRating.findUnique({
      where: {
        venueId_userId: {
          venueId,
          userId
        }
      }
    });

    res.json({
      status: 'success',
      rating
    });

  } catch (error) {
    console.error('Error fetching user rating:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to fetch user rating',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * DELETE /api/ratings/:ratingId
 * Delete a rating (user can only delete their own)
 */
router.delete('/:ratingId', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { ratingId } = req.params;
    const userId = (req as any).userId;

    // Check if rating exists and belongs to user
    const rating = await prisma.venueRating.findUnique({
      where: { id: ratingId }
    });

    if (!rating) {
      return res.status(404).json({
        status: 'error',
        message: 'Rating not found'
      });
    }

    if (rating.userId !== userId) {
      return res.status(403).json({
        status: 'error',
        message: 'Unauthorized to delete this rating'
      });
    }

    await prisma.venueRating.delete({
      where: { id: ratingId }
    });

    res.json({
      status: 'success',
      message: 'Rating deleted successfully'
    });

  } catch (error) {
    console.error('Error deleting rating:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to delete rating',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export default router;
