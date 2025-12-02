import { ApifyClient } from 'apify-client';
import prisma from '../lib/prisma';

interface ApifyInstagramPost {
  id: string;
  type: string;
  caption?: string;
  hashtags: string[];
  url: string;
  commentsCount: number;
  dimensionsHeight: number;
  dimensionsWidth: number;
  displayUrl: string;
  images?: string[];
  videoUrl?: string;
  firstComment?: string;
  latestComments: any[];
  likesCount: number;
  timestamp: string;
  childPosts?: any[];
  ownerFullName: string;
  ownerUsername: string;
  ownerId: string;
  productType: string;
  videoDuration?: number;
  videoViewCount?: number;
}

interface ApifyScraperInput {
  usernames?: string[];
  urls?: string[];
  resultsLimit?: number;
  searchType?: 'hashtag' | 'user' | 'place';
  searchLimit?: number;
}

export class ApifyInstagramScraperService {
  private client: ApifyClient;
  private actorId = 'apify/instagram-scraper'; // Official Apify Instagram scraper

  constructor() {
    const token = process.env.APIFY_API_TOKEN;

    if (!token) {
      console.warn('⚠️  APIFY_API_TOKEN not configured - Instagram scraping disabled');
      this.client = null as any;
      return;
    }

    this.client = new ApifyClient({ token });
    console.log('✅ Apify Instagram scraper initialized');
  }

  /**
   * Scrape Instagram posts for a specific username
   */
  async scrapeUserPosts(username: string, limit: number = 25): Promise<ApifyInstagramPost[]> {
    if (!this.client) {
      throw new Error('Apify client not initialized - check APIFY_API_TOKEN');
    }

    console.log(`📸 Scraping Instagram posts for @${username}...`);

    try {
      const input: ApifyScraperInput = {
        usernames: [username],
        resultsLimit: limit
      };

      // Start the actor and wait for it to finish
      const run = await this.client.actor(this.actorId).call(input, {
        timeout: 300 // 5 minutes timeout
      });

      console.log(`✅ Scraper finished for @${username}, run ID: ${run.id}`);

      // Fetch results from the dataset
      const { items } = await this.client.dataset(run.defaultDatasetId).listItems();

      console.log(`📊 Found ${items.length} posts for @${username}`);

      return items as ApifyInstagramPost[];
    } catch (error) {
      console.error(`❌ Failed to scrape @${username}:`, error);
      throw error;
    }
  }

  /**
   * Scrape multiple usernames in a single run (more cost-efficient)
   */
  async scrapeMultipleUsers(usernames: string[], limitPerUser: number = 12): Promise<Map<string, ApifyInstagramPost[]>> {
    if (!this.client) {
      throw new Error('Apify client not initialized');
    }

    console.log(`📸 Scraping ${usernames.length} Instagram accounts...`);

    try {
      const input: ApifyScraperInput = {
        usernames,
        resultsLimit: limitPerUser
      };

      const run = await this.client.actor(this.actorId).call(input, {
        timeout: 600 // 10 minutes for multiple users
      });

      console.log(`✅ Bulk scrape finished, run ID: ${run.id}`);

      const { items } = await this.client.dataset(run.defaultDatasetId).listItems();

      // Group posts by username
      const postsByUsername = new Map<string, ApifyInstagramPost[]>();

      for (const item of items as ApifyInstagramPost[]) {
        const username = item.ownerUsername;
        if (!postsByUsername.has(username)) {
          postsByUsername.set(username, []);
        }
        postsByUsername.get(username)!.push(item);
      }

      console.log(`📊 Scraped posts from ${postsByUsername.size} accounts`);

      return postsByUsername;
    } catch (error) {
      console.error('❌ Bulk scrape failed:', error);
      throw error;
    }
  }

  /**
   * Save scraped posts to database
   */
  async savePostsToDatabase(venueId: string, posts: ApifyInstagramPost[]): Promise<number> {
    let savedCount = 0;

    for (const post of posts) {
      try {
        // Skip carousel/album child posts (they're duplicates)
        if (post.productType === 'carousel_container' && post.childPosts) {
          continue;
        }

        await prisma.venueInstagramPost.upsert({
          where: { instagramId: post.id },
          create: {
            instagramId: post.id,
            venueId,
            caption: post.caption || post.firstComment || null,
            mediaType: post.type === 'Video' ? 'VIDEO' : post.type === 'Sidecar' ? 'CAROUSEL_ALBUM' : 'IMAGE',
            mediaUrl: post.displayUrl,
            videoUrl: post.videoUrl || null,
            permalink: post.url,
            username: post.ownerUsername,
            postedAt: new Date(post.timestamp),
            likesCount: post.likesCount || 0,
            commentsCount: post.commentsCount || 0,
            videoViewCount: post.videoViewCount || null
          },
          update: {
            caption: post.caption || post.firstComment || null,
            mediaUrl: post.displayUrl,
            videoUrl: post.videoUrl || null,
            likesCount: post.likesCount || 0,
            commentsCount: post.commentsCount || 0,
            videoViewCount: post.videoViewCount || null
          }
        });

        savedCount++;
      } catch (error) {
        console.error(`Failed to save post ${post.id}:`, error);
      }
    }

    console.log(`💾 Saved ${savedCount}/${posts.length} posts for venue ${venueId}`);
    return savedCount;
  }

  /**
   * Sync Instagram posts for a specific venue
   */
  async syncVenuePosts(venueId: string, instagramUsername: string): Promise<number> {
    console.log(`\n🔄 Syncing Instagram for venue ${venueId} (@${instagramUsername})`);

    try {
      // Scrape latest posts
      const posts = await this.scrapeUserPosts(instagramUsername, 25);

      // Save to database
      const savedCount = await this.savePostsToDatabase(venueId, posts);

      // Update venue's last sync time
      await prisma.venue.update({
        where: { id: venueId },
        data: {
          instagramLastSynced: new Date()
        }
      });

      console.log(`✅ Sync complete for ${instagramUsername}: ${savedCount} posts saved`);

      return savedCount;
    } catch (error) {
      console.error(`❌ Sync failed for venue ${venueId}:`, error);
      throw error;
    }
  }

  /**
   * Sync all venues with Instagram usernames (bulk operation)
   */
  async syncAllVenues(): Promise<{ total: number; successful: number; failed: number }> {
    console.log('\n🚀 Starting bulk Instagram sync for all venues...\n');

    // Get all venues with Instagram usernames
    const venues = await prisma.venue.findMany({
      where: {
        instagramUsername: { not: null }
      },
      select: {
        id: true,
        name: true,
        instagramUsername: true
      }
    });

    if (venues.length === 0) {
      console.log('⚠️  No venues with Instagram usernames found');
      return { total: 0, successful: 0, failed: 0 };
    }

    console.log(`📋 Found ${venues.length} venues with Instagram accounts`);

    // Batch process in groups of 20 (Apify handles multiple accounts efficiently)
    const batchSize = 20;
    let successful = 0;
    let failed = 0;

    for (let i = 0; i < venues.length; i += batchSize) {
      const batch = venues.slice(i, i + batchSize);
      const usernames = batch.map(v => v.instagramUsername!);

      console.log(`\n📦 Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(venues.length / batchSize)}`);
      console.log(`   Accounts: ${usernames.join(', ')}`);

      try {
        // Scrape all accounts in this batch
        const postsByUsername = await this.scrapeMultipleUsers(usernames, 12);

        // Save posts for each venue
        for (const venue of batch) {
          const posts = postsByUsername.get(venue.instagramUsername!) || [];

          if (posts.length > 0) {
            await this.savePostsToDatabase(venue.id, posts);

            // Update last sync time
            await prisma.venue.update({
              where: { id: venue.id },
              data: { instagramLastSynced: new Date() }
            });

            console.log(`   ✅ ${venue.name}: ${posts.length} posts`);
            successful++;
          } else {
            console.log(`   ⚠️  ${venue.name}: No posts found`);
            failed++;
          }
        }

        // Rate limiting: Wait 10 seconds between batches
        if (i + batchSize < venues.length) {
          console.log('   ⏳ Waiting 10 seconds before next batch...');
          await new Promise(resolve => setTimeout(resolve, 10000));
        }

      } catch (error) {
        console.error(`❌ Batch failed:`, error);
        failed += batch.length;
      }
    }

    const summary = {
      total: venues.length,
      successful,
      failed
    };

    console.log('\n📊 Sync Summary:');
    console.log(`   Total venues: ${summary.total}`);
    console.log(`   Successful: ${summary.successful}`);
    console.log(`   Failed: ${summary.failed}`);
    console.log('   ✅ Sync complete!\n');

    return summary;
  }

  /**
   * Get cost estimate for scraping
   */
  estimateCost(numVenues: number, postsPerVenue: number = 12): { compute: string; cost: string } {
    // Apify pricing: ~$0.25 per 1000 results
    // Each venue = postsPerVenue results
    const totalResults = numVenues * postsPerVenue;
    const estimatedCost = (totalResults / 1000) * 0.25;

    // Compute units: ~0.01 per account
    const computeUnits = numVenues * 0.01;

    return {
      compute: `~${computeUnits.toFixed(2)} CUs`,
      cost: `~$${estimatedCost.toFixed(2)}`
    };
  }
}

export const apifyInstagramScraper = new ApifyInstagramScraperService();
