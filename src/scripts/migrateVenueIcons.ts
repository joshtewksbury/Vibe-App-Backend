import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();

interface VenueJSON {
  id: string;
  name: string;
  venueIcon?: string;
}

async function migrateVenueIcons() {
  try {
    console.log('🖼️ Starting venue icon migration to venue_images table...');

    // Read venues.json
    const venuesPath = path.join(process.cwd(), 'venues.json');
    const venuesData = JSON.parse(fs.readFileSync(venuesPath, 'utf-8'));
    const venues: VenueJSON[] = venuesData.venues;

    let migrated = 0;
    let skipped = 0;

    for (const venue of venues) {
      if (venue.venueIcon) {
        try {
          // Check if icon already exists
          const existing = await prisma.venueImage.findFirst({
            where: {
              venueId: venue.id,
              imageType: 'ICON'
            }
          });

          if (existing) {
            console.log(`⏭️  Icon already exists for: ${venue.name}`);
            skipped++;
          } else {
            // Create venue image entry
            await prisma.venueImage.create({
              data: {
                venueId: venue.id,
                imageType: 'ICON',
                url: venue.venueIcon,
                isActive: true,
                displayOrder: 0
              }
            });
            console.log(`✅ Migrated icon for: ${venue.name}`);
            migrated++;
          }
        } catch (error) {
          console.error(`❌ Failed to migrate icon for ${venue.name}:`, error);
        }
      } else {
        console.log(`⚠️  No icon for: ${venue.name}`);
        skipped++;
      }
    }

    console.log('\n📊 Migration Summary:');
    console.log(`  ✅ Migrated: ${migrated} icons`);
    console.log(`  ⏭️  Skipped: ${skipped} venues`);
    console.log(`  📍 Total: ${venues.length} venues`);
  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

migrateVenueIcons()
  .then(() => {
    console.log('✅ Icon migration completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Icon migration failed:', error);
    process.exit(1);
  });
