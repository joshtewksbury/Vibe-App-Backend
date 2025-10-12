import { PrismaClient } from '@prisma/client';
import { config } from 'dotenv';
import { uploadBase64Image } from '../src/services/cloudinaryService';

// Load environment variables
config();

const prisma = new PrismaClient();

interface MigrationStats {
  total: number;
  migrated: number;
  skipped: number;
  failed: number;
  errors: Array<{ venueId: string; venueName: string; error: string }>;
}

async function migrateImagesToCloudinary() {
  console.log('🚀 Starting migration of venue icons to Cloudinary...\n');

  // Check Cloudinary credentials
  if (
    !process.env.CLOUDINARY_CLOUD_NAME ||
    !process.env.CLOUDINARY_API_KEY ||
    !process.env.CLOUDINARY_API_SECRET
  ) {
    console.error('❌ Cloudinary credentials not found in environment variables!');
    console.error('Please set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET');
    process.exit(1);
  }

  const stats: MigrationStats = {
    total: 0,
    migrated: 0,
    skipped: 0,
    failed: 0,
    errors: [],
  };

  try {
    // Fetch all venues with venue icons (base64 data)
    const venues = await prisma.venue.findMany({
      where: {
        venueIcon: {
          not: null,
        },
      },
      select: {
        id: true,
        name: true,
        venueIcon: true,
        venueIconUrl: true,
      },
    });

    stats.total = venues.length;
    console.log(`Found ${stats.total} venues with icons to migrate\n`);

    for (const venue of venues) {
      try {
        // Skip if already has Cloudinary URL
        if (venue.venueIconUrl && venue.venueIconUrl.includes('cloudinary.com')) {
          console.log(`⏭️  Skipping "${venue.name}" - already migrated`);
          stats.skipped++;
          continue;
        }

        // Skip if no venue icon data
        if (!venue.venueIcon) {
          console.log(`⏭️  Skipping "${venue.name}" - no icon data`);
          stats.skipped++;
          continue;
        }

        console.log(`📤 Uploading icon for "${venue.name}"...`);

        // Upload to Cloudinary
        const result = await uploadBase64Image(
          venue.venueIcon,
          'venue-icons',
          `venue-${venue.id}` // Use venue ID as public ID for consistency
        );

        // Update venue with Cloudinary URL
        await prisma.venue.update({
          where: { id: venue.id },
          data: {
            venueIconUrl: result.secureUrl,
            // Optionally clear the base64 data to save database space
            // venueIcon: null,
          },
        });

        console.log(`✅ Migrated "${venue.name}" - ${result.secureUrl}`);
        stats.migrated++;
      } catch (error) {
        console.error(`❌ Failed to migrate "${venue.name}":`, error);
        stats.failed++;
        stats.errors.push({
          venueId: venue.id,
          venueName: venue.name,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }

      // Add small delay to avoid rate limiting
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    // Print summary
    console.log('\n' + '='.repeat(60));
    console.log('📊 Migration Summary:');
    console.log('='.repeat(60));
    console.log(`Total venues:     ${stats.total}`);
    console.log(`✅ Migrated:     ${stats.migrated}`);
    console.log(`⏭️  Skipped:      ${stats.skipped}`);
    console.log(`❌ Failed:       ${stats.failed}`);
    console.log('='.repeat(60));

    if (stats.errors.length > 0) {
      console.log('\n❌ Errors:');
      stats.errors.forEach((error) => {
        console.log(`  - ${error.venueName} (ID: ${error.venueId}): ${error.error}`);
      });
    }

    if (stats.migrated > 0) {
      console.log('\n💡 Next steps:');
      console.log('1. Verify images are displaying correctly in your app');
      console.log('2. Once verified, you can run the cleanup script to remove base64 data');
      console.log('   from the database to save space');
    }
  } catch (error) {
    console.error('\n❌ Migration failed:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// Run migration
migrateImagesToCloudinary()
  .then(() => {
    console.log('\n✅ Migration completed!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Migration error:', error);
    process.exit(1);
  });
