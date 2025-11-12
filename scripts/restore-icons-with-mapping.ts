/**
 * Script to restore venue icons using the mapping file
 *
 * Uses venue_icon_upload_results.json to map old venue IDs to venue names,
 * then matches them to current database venues and updates with Cloudinary URLs
 */

import { v2 as cloudinary } from 'cloudinary';
import prisma from '../src/lib/prisma';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

// Load environment variables
dotenv.config();

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

interface VenueIconMapping {
  venueId: string;
  venueName: string;
  imageFile: string;
}

interface CloudinaryImage {
  public_id: string;
  secure_url: string;
}

/**
 * Load the venue icon mapping from the results file
 */
function loadVenueMapping(): VenueIconMapping[] {
  const mappingPath = path.join(__dirname, '../venue_icon_upload_results.json');
  const data = JSON.parse(fs.readFileSync(mappingPath, 'utf-8'));
  return data.results;
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
 * Get Cloudinary URL for a venue icon number
 */
function getCloudinaryUrl(venueId: string): string {
  return cloudinary.url(`venue-icons/${venueId}`, {
    secure: true,
    transformation: [
      { width: 512, height: 512, crop: 'limit' },
      { quality: 'auto', fetch_format: 'auto' }
    ]
  });
}

/**
 * Main restoration function
 */
async function restoreVenueIcons() {
  try {
    console.log('🚀 Starting venue icon restoration with mapping...\n');

    // Load the mapping file
    console.log('📄 Loading venue mapping file...');
    const mappings = loadVenueMapping();
    console.log(`✅ Loaded ${mappings.length} venue mappings\n`);

    // Get all venues from database
    console.log('📊 Fetching venues from database...');
    const venues = await prisma.venue.findMany({
      select: {
        id: true,
        name: true,
        venueIconUrl: true
      }
    });
    console.log(`✅ Found ${venues.length} venues in database\n`);

    console.log('🔄 Matching and updating venues...\n');
    console.log('='.repeat(80));

    let matchedCount = 0;
    let updatedCount = 0;
    let alreadySetCount = 0;
    let notFoundCount = 0;
    const unmatched: string[] = [];

    for (const mapping of mappings) {
      const normalizedMappingName = normalizeVenueName(mapping.venueName);

      // Find matching venue in database
      const matchingVenue = venues.find(venue => {
        const normalizedVenueName = normalizeVenueName(venue.name);

        // Exact match
        if (normalizedVenueName === normalizedMappingName) {
          return true;
        }

        // Partial match
        if (normalizedVenueName.includes(normalizedMappingName) ||
            normalizedMappingName.includes(normalizedVenueName)) {
          return true;
        }

        // Special cases
        if (normalizedMappingName.includes('iris') && normalizedVenueName.includes('iris')) return true;
        if (normalizedMappingName.includes('met') && normalizedVenueName.includes('met')) return true;
        if (normalizedMappingName.includes('beat') && normalizedVenueName.includes('beat')) return true;

        return false;
      });

      if (matchingVenue) {
        matchedCount++;

        // Generate Cloudinary URL from the old venue ID
        const cloudinaryUrl = getCloudinaryUrl(mapping.venueId);

        // Check if venue already has this URL
        if (matchingVenue.venueIconUrl === cloudinaryUrl) {
          console.log(`⏭️  ${matchingVenue.name}: Already has correct icon`);
          alreadySetCount++;
          continue;
        }

        try {
          // Update venue with Cloudinary URL
          await prisma.venue.update({
            where: { id: matchingVenue.id },
            data: { venueIconUrl: cloudinaryUrl }
          });

          console.log(`✅ ${matchingVenue.name}: Updated (ID: ${mapping.venueId})`);
          console.log(`   URL: ${cloudinaryUrl}`);
          updatedCount++;
        } catch (error) {
          console.log(`❌ ${matchingVenue.name}: Update failed - ${error}`);
        }
      } else {
        console.log(`⚠️  ${mapping.venueName}: No matching venue in database`);
        unmatched.push(mapping.venueName);
        notFoundCount++;
      }
    }

    console.log('\n' + '='.repeat(80));
    console.log('📊 Summary:');
    console.log(`   Total mappings: ${mappings.length}`);
    console.log(`   Matched to database venues: ${matchedCount}`);
    console.log(`   Updated: ${updatedCount}`);
    console.log(`   Already had correct icon: ${alreadySetCount}`);
    console.log(`   Not found in database: ${notFoundCount}`);

    if (unmatched.length > 0) {
      console.log('\n⚠️  Venues not found in database:');
      unmatched.forEach(name => console.log(`   - ${name}`));
    }

    console.log('='.repeat(80) + '\n');
    console.log('✨ Venue icon restoration complete!');

  } catch (error) {
    console.error('❌ Error:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Run the script
restoreVenueIcons();
