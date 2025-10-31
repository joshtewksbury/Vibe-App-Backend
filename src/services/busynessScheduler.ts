import { SerpAPIService, SerpLiveBusynessData } from './serpApi';
import prisma from '../lib/prisma';
import { BusyStatus } from '@prisma/client';

/**
 * Service to periodically fetch live busyness data and create snapshots
 * Runs every 15 minutes to keep data fresh
 */
export class BusynessSchedulerService {
  private serpApiService: SerpAPIService;
  private intervalId: NodeJS.Timeout | null = null;
  private isRunning = false;

  // Refresh interval: 15 minutes (900,000 ms)
  private readonly REFRESH_INTERVAL = 15 * 60 * 1000;

  // Place ID mapping from iOS app (RealTimeBusynessService.swift)
  private readonly placeIdMapping: Record<string, string> = {
    '1': 'ChIJWYPpUxNZkWsRaJOv74h0iT8',   // Hey Chica
    '2': 'ChIJw990El9ZkWsRLtnMlazxUA0',   // Iris rooftop
    '3': 'ChIJqachSvJZkWsRNFdQHClnEhI',   // The Met
    '4': 'ChIJO8J1BvNZkWsRpAd7kaQZlSY',   // The beat
    '5': 'ChIJ0daustRZkWsR9YMab5hO0qY',   // Honky Tonks
    '6': 'ChIJSeqIrvNZkWsRTEz6Sj_mk6Q',   // Black bear lodge
    '7': 'ChIJ5z4CeVVZkWsRKAsOMz0mFLg',   // Su casa
    '8': 'ChIJySa3zfNZkWsRzHC_6iTdK9Y',   // The prince consort hotel
    '9': 'ChIJAZeM5KBQkWsRfQzggQRyn1w',   // The boundary
    '10': 'ChIJm6m_5aBQkWsRdQLfbx8Hj4A',  // Archive
    '11': 'ChIJh_lR0fNZkWsR4YM60JDA8Jg',  // Prohibition
    '12': 'ChIJGerLSvJZkWsRnGEO9Xvq-vQ',  // Birdees
    '13': 'ChIJj-zxDo1ZkWsRrn5m1z2Fd1E',  // Sixes and Sevens
    '14': 'ChIJYxxyZ_ZZkWsRnUBj74LASVk',  // Johnny Ringo's
    '15': 'ChIJG_0nwvJZkWsRlEtqw044e9M',  // Maya Rooftop Bar
    '16': 'ChIJm05xlfJZkWsRbM5krnTsTdc',  // Osbourne Hotel
    '17': 'ChIJldCUOpRQkWsRPicMchEGD60',  // Regatta Hotel
    '18': 'ChIJO8twpfNZkWsRavdvh0VKp1E',  // Rics
    '19': 'ChIJC_qaGZNQkWsRLEu3KsT5nW0',  // Royal Exchange Hotel
    '20': 'ChIJo7F8jwNakWsR1Oe_Jk-lhDY',  // Sixteen Antlers
    '21': 'ChIJc_Ht8qBZkWsRdG1eV_CieAo',  // Soko
    '22': 'ChIJDVih1itZkWsRZu1jDCEqj4c',  // Tax Office
    '23': 'ChIJmUNLW4FRkWsR_Z9TlLnPiQ4',  // Warehouse 25
    '24': 'ChIJAQAwlB1akWsRErkT6pNQCtk',  // Riverland Brisbane
    '25': 'ChIJs7bkxx1akWsR-w85F6TC2Ho',  // Blackbird Brisbane
    '26': 'ChIJ6YwPrh1akWsRD9YOh0D_EDA',  // Friday's Riverside Brisbane
    '27': 'ChIJ2QLaRBxakWsRHnTRui9Q1ho',  // Riverbar & Kitchen Brisbane
    '28': 'ChIJEexjkR1akWsRpWAYNtAKDXs',  // Bar Pacino Brisbane
    '29': 'ChIJqXH8yqBQkWsRdNlatzqk6KM',  // Hotel West End
    '30': 'ChIJO9yuY1VXkWsRc_sm49LcF5M',  // The Normanby Hotel
    '31': 'ChIJf6KubGdXkWsReqs_2Dn97QU',  // The Newmarket Hotel
    '32': 'ChIJ2xXvF7hZkWsRBRd_tZ8IKz0',  // The Sound Garden
    '33': 'ChIJbddmpWZZkWsRAAWf6yle4XU',  // Eclipse Nightclub
    '34': 'ChIJXU_2r_NZkWsRB2QcaBJTpzg',  // Retros Fortitude Valley
    '35': 'ChIJB3fumZNZkWsR0ckW-35rNlI',  // The Triffid
    '36': 'ChIJLfFCZe5ZkWsRjzp3_2yzs2c',  // The Tivoli
    '37': 'ChIJ5THBHWVZkWsR9SOykETGNiQ',  // Mr Percival's
    '38': 'ChIJVVVlZY1ZkWsRRxVnGnlwW8E',  // The Lobby Bar James Street
    '39': 'ChIJU49SWFFZkWsR6tG3K6Ug1eY',  // Jubilee Hotel
    '40': 'ChIJVaJDie1ZkWsRFgW5wpahE7A',  // Alfred & Constance
    '41': 'ChIJP-xyDsJbkWsRZkjxFB_uhoc'   // El Camino Cantina Brisbane
  };

  constructor() {
    this.serpApiService = new SerpAPIService();
  }

  /**
   * Start the periodic busyness data refresh
   */
  start(): void {
    if (this.isRunning) {
      console.log('⚠️  Busyness scheduler already running');
      return;
    }

    console.log('🚀 Starting busyness scheduler (15-minute intervals)...');
    this.isRunning = true;

    // Run immediately on start
    this.fetchAndUpdateAllVenues().catch(err => {
      console.error('❌ Error in initial busyness fetch:', err);
    });

    // Then run every 15 minutes
    this.intervalId = setInterval(() => {
      this.fetchAndUpdateAllVenues().catch(err => {
        console.error('❌ Error in scheduled busyness fetch:', err);
      });
    }, this.REFRESH_INTERVAL);

    console.log('✅ Busyness scheduler started successfully');
  }

  /**
   * Stop the scheduler
   */
  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      this.isRunning = false;
      console.log('⏹️  Busyness scheduler stopped');
    }
  }

  /**
   * Fetch live busyness data for all venues and create snapshots
   */
  private async fetchAndUpdateAllVenues(): Promise<void> {
    console.log('\n🔄 [Busyness Scheduler] Starting refresh cycle...');
    const startTime = Date.now();

    try {
      // Get all venues from database
      const venues = await prisma.venue.findMany({
        select: {
          id: true,
          name: true,
          placeId: true,
          capacity: true
        }
      });

      console.log(`📊 Found ${venues.length} venues to update`);

      let successCount = 0;
      let failedCount = 0;
      let skippedCount = 0;

      // Process venues sequentially to avoid rate limiting
      for (const venue of venues) {
        try {
          // Use placeId from database first, fallback to mapping
          const placeId = venue.placeId || this.placeIdMapping[venue.id];

          if (!placeId) {
            console.log(`⏭️  Skipping ${venue.name} - no Place ID configured`);
            skippedCount++;
            continue;
          }

          // Fetch both live busyness data AND popular times from SerpAPI
          const { liveData, popularTimes } = await this.serpApiService.fetchCompleteBusynessData(placeId, venue.name);

          // If we got popular times data, store it in the venue
          if (popularTimes) {
            await prisma.venue.update({
              where: { id: venue.id },
              data: {
                popularTimes: popularTimes as any,
                popularTimesUpdated: new Date()
              }
            });
            console.log(`📊 ${venue.name}: Updated popular times data`);
          }

          if (liveData) {
            // Convert busyness score to occupancy percentage
            const occupancyPercentage = liveData.busynessScore;
            const occupancyCount = Math.round((occupancyPercentage / 100) * venue.capacity);

            // Determine status based on percentage
            const status = this.calculateBusyStatus(occupancyPercentage);

            // Create snapshot in database
            await prisma.busySnapshot.create({
              data: {
                venueId: venue.id,
                timestamp: liveData.timestamp,
                occupancyCount,
                occupancyPercentage,
                status,
                source: 'serp' // Mark as coming from SerpAPI
              }
            });

            console.log(`✅ ${venue.name}: ${status} (${occupancyPercentage}%) - ${liveData.liveInfo}`);
            successCount++;
          } else {
            console.log(`⚠️  ${venue.name}: No live data available (but may have popular times)`);
            // Still count as partial success if we got popular times
            if (popularTimes) {
              successCount++;
            } else {
              failedCount++;
            }
          }

          // Rate limiting: wait 500ms between requests to avoid hitting API limits
          await this.delay(500);

        } catch (error) {
          console.error(`❌ Error updating ${venue.name}:`, error);
          failedCount++;
        }
      }

      const duration = ((Date.now() - startTime) / 1000).toFixed(2);
      console.log(`\n✨ Refresh cycle complete in ${duration}s`);
      console.log(`   Success: ${successCount} | Failed: ${failedCount} | Skipped: ${skippedCount}`);

      // Clean up old snapshots (keep last 7 days)
      await this.cleanupOldSnapshots();

    } catch (error) {
      console.error('❌ Error in fetchAndUpdateAllVenues:', error);
    }
  }

  /**
   * Calculate BusyStatus from occupancy percentage
   */
  private calculateBusyStatus(percentage: number): BusyStatus {
    if (percentage >= 90) return 'VERY_BUSY';
    if (percentage >= 70) return 'BUSY';
    if (percentage >= 40) return 'MODERATE';
    if (percentage >= 20) return 'QUIET';
    return 'QUIET'; // Default to QUIET for very low percentages
  }

  /**
   * Delete snapshots older than 7 days to prevent database bloat
   */
  private async cleanupOldSnapshots(): Promise<void> {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    try {
      const result = await prisma.busySnapshot.deleteMany({
        where: {
          timestamp: {
            lt: sevenDaysAgo
          }
        }
      });

      if (result.count > 0) {
        console.log(`🗑️  Cleaned up ${result.count} old snapshots`);
      }
    } catch (error) {
      console.error('❌ Error cleaning up old snapshots:', error);
    }
  }

  /**
   * Utility to delay execution
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Manually trigger a refresh (useful for testing)
   */
  async triggerRefresh(): Promise<void> {
    console.log('🔄 Manual refresh triggered');
    await this.fetchAndUpdateAllVenues();
  }
}

// Export singleton instance
export const busynessScheduler = new BusynessSchedulerService();
