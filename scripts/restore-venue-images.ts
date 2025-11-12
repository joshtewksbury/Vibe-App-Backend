/**
 * Script to restore venue banner images from backup file
 *
 * This script:
 * 1. Reads venue image URLs from the backup file
 * 2. Matches them to current venues in the database
 * 3. Updates venue records with the image URLs
 */

import prisma from '../src/lib/prisma';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

// Load environment variables
dotenv.config();

interface VenueData {
  name: string;
  images: string[];
}

/**
 * Normalize venue name for matching
 */
function normalizeVenueName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^\w\s]/g, '') // Remove special characters
    .replace(/\s+/g, ' ') // Normalize spaces
    .trim();
}

/**
 * Main restoration function
 */
async function restoreVenueImages() {
  try {
    console.log('🚀 Starting venue image restoration from backup...\n');

    // Load the backup file
    const backupPath = path.join(__dirname, '../venues.json.backup_20251112_101202');
    console.log('📄 Loading backup file...');

    const backupData = JSON.parse(fs.readFileSync(backupPath, 'utf-8'));
    const backupVenues: VenueData[] = backupData.venues;

    console.log(`✅ Loaded ${backupVenues.length} venues from backup\n`);

    // Filter venues that have images
    const venuesWithImages = backupVenues.filter(v => v.images && v.images.length > 0);
    console.log(`📸 Found ${venuesWithImages.length} venues with images\n`);

    // Get all venues from database
    console.log('📊 Fetching venues from database...');
    const dbVenues = await prisma.venue.findMany({
      select: {
        id: true,
        name: true,
        images: true
      }
    });
    console.log(`✅ Found ${dbVenues.length} venues in database\n`);

    console.log('🔄 Matching and updating venues...\n');
    console.log('='.repeat(80));

    let matchedCount = 0;
    let updatedCount = 0;
    let alreadyHasImagesCount = 0;
    let notFoundCount = 0;
    const unmatched: string[] = [];

    for (const backupVenue of venuesWithImages) {
      const normalizedBackupName = normalizeVenueName(backupVenue.name);

      // Find matching venue in database
      const matchingVenue = dbVenues.find(venue => {
        const normalizedVenueName = normalizeVenueName(venue.name);

        // Exact match
        if (normalizedVenueName === normalizedBackupName) {
          return true;
        }

        // Partial match
        if (normalizedVenueName.includes(normalizedBackupName) ||
            normalizedBackupName.includes(normalizedVenueName)) {
          return true;
        }

        return false;
      });

      if (matchingVenue) {
        matchedCount++;

        // Check if venue already has images
        if (matchingVenue.images && matchingVenue.images.length > 0) {
          console.log(`⏭️  ${matchingVenue.name}: Already has ${matchingVenue.images.length} image(s)`);
          alreadyHasImagesCount++;
          continue;
        }

        try {
          // Update venue with images
          await prisma.venue.update({
            where: { id: matchingVenue.id },
            data: { images: backupVenue.images }
          });

          console.log(`✅ ${matchingVenue.name}: Added ${backupVenue.images.length} image(s)`);
          console.log(`   First image: ${backupVenue.images[0].substring(0, 70)}...`);
          updatedCount++;
        } catch (error) {
          console.log(`❌ ${matchingVenue.name}: Update failed - ${error}`);
        }
      } else {
        console.log(`⚠️  ${backupVenue.name}: No matching venue in database`);
        unmatched.push(backupVenue.name);
        notFoundCount++;
      }
    }

    console.log('\n' + '='.repeat(80));
    console.log('📊 Summary:');
    console.log(`   Venues with images in backup: ${venuesWithImages.length}`);
    console.log(`   Matched to database venues: ${matchedCount}`);
    console.log(`   Updated with new images: ${updatedCount}`);
    console.log(`   Already had images: ${alreadyHasImagesCount}`);
    console.log(`   Not found in database: ${notFoundCount}`);

    if (unmatched.length > 0) {
      console.log('\n⚠️  Venues not found in database:');
      unmatched.forEach(name => console.log(`   - ${name}`));
    }

    console.log('='.repeat(80) + '\n');
    console.log('✨ Venue image restoration complete!');

  } catch (error) {
    console.error('❌ Error:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Run the script
restoreVenueImages();
