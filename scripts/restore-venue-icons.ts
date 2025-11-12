/**
 * Script to restore venue icons from Cloudinary
 *
 * This script:
 * 1. Lists all venue icon images from Cloudinary
 * 2. Matches them to venue names in the database
 * 3. Updates venue records with the correct Cloudinary URLs
 */

import { v2 as cloudinary } from 'cloudinary';
import prisma from '../src/lib/prisma';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

interface CloudinaryImage {
  public_id: string;
  secure_url: string;
  format: string;
  created_at: string;
}

/**
 * List all venue icon images from Cloudinary
 */
async function listVenueIcons(): Promise<CloudinaryImage[]> {
  try {
    console.log('📥 Fetching venue icons from Cloudinary...');

    const result = await cloudinary.api.resources({
      type: 'upload',
      prefix: 'venue-icons/', // Folder where venue icons are stored
      max_results: 500,
      resource_type: 'image'
    });

    console.log(`✅ Found ${result.resources.length} images in Cloudinary`);

    return result.resources.map((resource: any) => ({
      public_id: resource.public_id,
      secure_url: resource.secure_url,
      format: resource.format,
      created_at: resource.created_at
    }));
  } catch (error) {
    console.error('❌ Error fetching from Cloudinary:', error);
    throw error;
  }
}

/**
 * Extract venue name from Cloudinary public_id
 * e.g., "venue-icons/the-met" -> "the met"
 */
function extractVenueName(publicId: string): string {
  const parts = publicId.split('/');
  const filename = parts[parts.length - 1];

  // Remove file extension and replace hyphens/underscores with spaces
  return filename
    .replace(/\.(jpg|jpeg|png|gif|webp)$/i, '')
    .replace(/[-_]/g, ' ')
    .toLowerCase()
    .trim();
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
 * Match Cloudinary images to venues in database
 */
async function matchAndUpdateVenues(cloudinaryImages: CloudinaryImage[]): Promise<void> {
  console.log('\n🔍 Matching images to venues in database...\n');

  // Get all venues from database
  const venues = await prisma.venue.findMany({
    select: {
      id: true,
      name: true,
      venueIconUrl: true
    }
  });

  console.log(`📊 Found ${venues.length} venues in database`);

  let matchedCount = 0;
  let updatedCount = 0;
  let alreadySetCount = 0;
  const unmatched: string[] = [];

  for (const image of cloudinaryImages) {
    const cloudinaryVenueName = extractVenueName(image.public_id);
    const normalizedCloudinaryName = normalizeVenueName(cloudinaryVenueName);

    // Try to find matching venue
    const matchingVenue = venues.find(venue => {
      const normalizedVenueName = normalizeVenueName(venue.name);

      // Exact match
      if (normalizedVenueName === normalizedCloudinaryName) {
        return true;
      }

      // Partial match (venue name contains the cloudinary name or vice versa)
      if (normalizedVenueName.includes(normalizedCloudinaryName) ||
          normalizedCloudinaryName.includes(normalizedVenueName)) {
        return true;
      }

      return false;
    });

    if (matchingVenue) {
      matchedCount++;

      // Check if venue already has this URL
      if (matchingVenue.venueIconUrl === image.secure_url) {
        console.log(`⏭️  ${matchingVenue.name}: Already has correct icon`);
        alreadySetCount++;
        continue;
      }

      // Update venue with Cloudinary URL
      await prisma.venue.update({
        where: { id: matchingVenue.id },
        data: { venueIconUrl: image.secure_url }
      });

      console.log(`✅ ${matchingVenue.name}: Updated with icon from ${image.public_id}`);
      updatedCount++;
    } else {
      console.log(`⚠️  No match found for: ${image.public_id} (extracted name: "${cloudinaryVenueName}")`);
      unmatched.push(image.public_id);
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log('📊 Summary:');
  console.log(`   Total images in Cloudinary: ${cloudinaryImages.length}`);
  console.log(`   Matched to venues: ${matchedCount}`);
  console.log(`   Updated: ${updatedCount}`);
  console.log(`   Already set: ${alreadySetCount}`);
  console.log(`   Unmatched: ${unmatched.length}`);

  if (unmatched.length > 0) {
    console.log('\n⚠️  Unmatched images:');
    unmatched.forEach(id => console.log(`   - ${id}`));
  }

  console.log('='.repeat(60) + '\n');
}

/**
 * Main function
 */
async function main() {
  try {
    console.log('🚀 Starting venue icon restoration...\n');

    // Check if Cloudinary is configured
    if (!process.env.CLOUDINARY_CLOUD_NAME ||
        !process.env.CLOUDINARY_API_KEY ||
        !process.env.CLOUDINARY_API_SECRET) {
      throw new Error('Cloudinary credentials not found in .env file');
    }

    // List all venue icons from Cloudinary
    const cloudinaryImages = await listVenueIcons();

    if (cloudinaryImages.length === 0) {
      console.log('⚠️  No venue icons found in Cloudinary');
      return;
    }

    // Match and update venues
    await matchAndUpdateVenues(cloudinaryImages);

    console.log('✨ Venue icon restoration complete!');
  } catch (error) {
    console.error('❌ Error in main:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Run the script
main();
