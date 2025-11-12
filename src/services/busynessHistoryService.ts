/**
 * Busyness History Service
 *
 * This service handles:
 * - Aggregating busyness snapshots into historical hourly data
 * - Tracking prediction accuracy by comparing predicted vs actual occupancy
 * - Building long-term historical patterns for better predictions
 *
 * Key Features:
 * - Stores every data point collected throughout the day
 * - Aggregates snapshots hourly for efficient querying
 * - Tracks prediction accuracy to improve future predictions
 * - Maintains indefinite historical data (not deleted after 7 days like snapshots)
 */

import prisma from '../lib/prisma';
import { BusyStatus } from '@prisma/client';

interface HourlyAggregationResult {
  avgOccupancyCount: number;
  avgOccupancyPercentage: number;
  avgStatus: BusyStatus;
  dataPointCount: number;
}

/**
 * Aggregates busyness snapshots for a specific venue and hour into historical data
 * This runs periodically (e.g., at the end of each hour) to build long-term patterns
 */
export async function aggregateHourlyBusyness(
  venueId: string,
  date: Date,
  hour: number
): Promise<void> {
  try {
    // Define the time window for this hour
    const startTime = new Date(date);
    startTime.setHours(hour, 0, 0, 0);

    const endTime = new Date(date);
    endTime.setHours(hour, 59, 59, 999);

    // Fetch all snapshots for this venue and hour
    const snapshots = await prisma.busySnapshot.findMany({
      where: {
        venueId,
        timestamp: {
          gte: startTime,
          lte: endTime
        }
      }
    });

    if (snapshots.length === 0) {
      console.log(`No snapshots found for venue ${venueId} at hour ${hour}`);
      return;
    }

    // Calculate averages
    const avgOccupancyCount = Math.round(
      snapshots.reduce((sum, s) => sum + s.occupancyCount, 0) / snapshots.length
    );
    const avgOccupancyPercentage = Math.round(
      snapshots.reduce((sum, s) => sum + s.occupancyPercentage, 0) / snapshots.length
    );

    // Determine the most common status or calculate from percentage
    const avgStatus = calculateBusyStatus(avgOccupancyPercentage);

    // Get day of week (1 = Monday, 7 = Sunday)
    const dayOfWeek = date.getDay() === 0 ? 7 : date.getDay();

    // Fetch the predicted occupancy from popularTimes if available
    const venue = await prisma.venue.findUnique({
      where: { id: venueId },
      select: { popularTimes: true }
    });

    let predictedOccupancyPercentage: number | null = null;
    let predictionAccuracy: number | null = null;

    if (venue?.popularTimes) {
      // Extract predicted percentage for this day and hour from popularTimes
      const popularTimes = venue.popularTimes as any;
      const dayName = getDayName(dayOfWeek);

      if (popularTimes[dayName] && popularTimes[dayName][hour]) {
        predictedOccupancyPercentage = popularTimes[dayName][hour].percentage;

        // Calculate prediction accuracy (percentage difference)
        const difference = Math.abs(avgOccupancyPercentage - predictedOccupancyPercentage);
        predictionAccuracy = difference;
      }
    }

    // Upsert historical data (update if exists, create if not)
    await prisma.busynessHistory.upsert({
      where: {
        venueId_date_hour: {
          venueId,
          date: startTime,
          hour
        }
      },
      update: {
        avgOccupancyCount,
        avgOccupancyPercentage,
        avgStatus,
        dataPointCount: snapshots.length,
        predictedOccupancyPercentage,
        predictionAccuracy,
        updatedAt: new Date()
      },
      create: {
        venueId,
        date: startTime,
        hour,
        dayOfWeek,
        avgOccupancyCount,
        avgOccupancyPercentage,
        avgStatus,
        dataPointCount: snapshots.length,
        predictedOccupancyPercentage,
        predictionAccuracy,
        source: 'aggregated'
      }
    });

    // Update prediction metrics if we have prediction data
    if (predictedOccupancyPercentage !== null && predictionAccuracy !== null) {
      await updatePredictionMetrics(
        venueId,
        date,
        dayOfWeek,
        hour,
        predictionAccuracy
      );
    }

    console.log(`✅ Aggregated busyness data for venue ${venueId} at ${date.toISOString()} hour ${hour}`);
  } catch (error) {
    console.error(`❌ Error aggregating hourly busyness:`, error);
    throw error;
  }
}

/**
 * Updates prediction metrics to track accuracy over time
 */
async function updatePredictionMetrics(
  venueId: string,
  date: Date,
  dayOfWeek: number,
  hour: number,
  predictionError: number
): Promise<void> {
  const year = date.getFullYear();
  const weekOfYear = getWeekOfYear(date);

  // Check if prediction was accurate (within 10% margin)
  const isAccurate = predictionError <= 10;

  // Fetch existing metrics
  const existing = await prisma.predictionMetrics.findUnique({
    where: {
      venueId_year_weekOfYear_dayOfWeek_hour: {
        venueId,
        year,
        weekOfYear,
        dayOfWeek,
        hour
      }
    }
  });

  if (existing) {
    // Update existing metrics with new data point
    const newTotalPredictions = existing.totalPredictions + 1;
    const newAccuratePredictions = existing.accuratePredictions + (isAccurate ? 1 : 0);
    const newAvgError =
      (existing.avgPredictionError * existing.totalPredictions + predictionError) /
      newTotalPredictions;

    await prisma.predictionMetrics.update({
      where: {
        venueId_year_weekOfYear_dayOfWeek_hour: {
          venueId,
          year,
          weekOfYear,
          dayOfWeek,
          hour
        }
      },
      data: {
        avgPredictionError: newAvgError,
        totalPredictions: newTotalPredictions,
        accuratePredictions: newAccuratePredictions,
        lastUpdated: new Date()
      }
    });
  } else {
    // Create new metrics record
    await prisma.predictionMetrics.create({
      data: {
        venueId,
        year,
        weekOfYear,
        dayOfWeek,
        hour,
        avgPredictionError: predictionError,
        totalPredictions: 1,
        accuratePredictions: isAccurate ? 1 : 0
      }
    });
  }
}

/**
 * Aggregates busyness data for all venues for the previous hour
 * This should be called every hour by a scheduler
 */
export async function aggregatePreviousHourForAllVenues(): Promise<void> {
  try {
    console.log('🔄 Starting hourly aggregation for all venues...');

    const now = new Date();
    const previousHour = now.getHours() - 1;
    const date = new Date(now);

    // If previous hour is negative, go to yesterday's last hour
    if (previousHour < 0) {
      date.setDate(date.getDate() - 1);
      date.setHours(23, 0, 0, 0);
    } else {
      date.setHours(previousHour, 0, 0, 0);
    }

    // Get all venues
    const venues = await prisma.venue.findMany({
      select: { id: true, name: true }
    });

    console.log(`📊 Aggregating data for ${venues.length} venues at hour ${previousHour}`);

    // Aggregate data for each venue
    let successCount = 0;
    let errorCount = 0;

    for (const venue of venues) {
      try {
        await aggregateHourlyBusyness(venue.id, date, previousHour < 0 ? 23 : previousHour);
        successCount++;
      } catch (error) {
        console.error(`Failed to aggregate for venue ${venue.name}:`, error);
        errorCount++;
      }
    }

    console.log(`✅ Hourly aggregation complete: ${successCount} succeeded, ${errorCount} failed`);
  } catch (error) {
    console.error('❌ Error in aggregatePreviousHourForAllVenues:', error);
    throw error;
  }
}

/**
 * Calculate busy status from occupancy percentage
 */
function calculateBusyStatus(percentage: number): BusyStatus {
  if (percentage >= 75) return BusyStatus.VERY_BUSY;
  if (percentage >= 50) return BusyStatus.BUSY;
  if (percentage >= 25) return BusyStatus.MODERATE;
  return BusyStatus.QUIET;
}

/**
 * Get day name from day of week number
 */
function getDayName(dayOfWeek: number): string {
  const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  return days[dayOfWeek === 7 ? 0 : dayOfWeek];
}

/**
 * Get ISO week number of the year
 */
function getWeekOfYear(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}

/**
 * Get prediction accuracy stats for a venue
 */
export async function getVenuePredictionAccuracy(venueId: string): Promise<{
  overallAccuracy: number;
  totalPredictions: number;
  accuratePredictions: number;
  avgError: number;
}> {
  const metrics = await prisma.predictionMetrics.findMany({
    where: { venueId }
  });

  if (metrics.length === 0) {
    return {
      overallAccuracy: 0,
      totalPredictions: 0,
      accuratePredictions: 0,
      avgError: 0
    };
  }

  const totalPredictions = metrics.reduce((sum, m) => sum + m.totalPredictions, 0);
  const accuratePredictions = metrics.reduce((sum, m) => sum + m.accuratePredictions, 0);
  const avgError = metrics.reduce((sum, m) => sum + (m.avgPredictionError * m.totalPredictions), 0) / totalPredictions;
  const overallAccuracy = (accuratePredictions / totalPredictions) * 100;

  return {
    overallAccuracy,
    totalPredictions,
    accuratePredictions,
    avgError
  };
}

/**
 * Get historical busyness patterns for a venue
 * Useful for showing trends and improving predictions
 */
export async function getHistoricalPattern(
  venueId: string,
  dayOfWeek: number,
  hour: number,
  weeksBack: number = 4
): Promise<number[]> {
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - (weeksBack * 7));

  const history = await prisma.busynessHistory.findMany({
    where: {
      venueId,
      dayOfWeek,
      hour,
      date: {
        gte: startDate,
        lte: endDate
      }
    },
    orderBy: {
      date: 'asc'
    },
    select: {
      avgOccupancyPercentage: true
    }
  });

  return history.map(h => h.avgOccupancyPercentage);
}
