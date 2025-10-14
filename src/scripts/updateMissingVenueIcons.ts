import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Mapping of venue IDs to their new Cloudinary icon URLs
const VENUE_ICON_UPDATES: Record<string, string> = {
  '17': 'https://res.cloudinary.com/dkcma3mo2/image/upload/v1760340210/venue-icons/17.jpg', // Regatta
  '9': 'https://res.cloudinary.com/dkcma3mo2/image/upload/v1760340233/venue-icons/9.jpg',   // The Boundary
  '10': 'https://res.cloudinary.com/dkcma3mo2/image/upload/v1760340245/venue-icons/10.jpg', // Archive
  '29': 'https://res.cloudinary.com/dkcma3mo2/image/upload/v1760340254/venue-icons/29.jpg', // Hotel West End
  '59': 'https://res.cloudinary.com/dkcma3mo2/image/upload/v1760340339/venue-icons/59.jpg', // Summer house
  '42': 'https://res.cloudinary.com/dkcma3mo2/image/upload/v1760340325/venue-icons/42.jpg', // El Camino
  '55': 'https://res.cloudinary.com/dkcma3mo2/image/upload/v1760340358/venue-icons/55.jpg', // Death and Taxes
  '57': 'https://res.cloudinary.com/dkcma3mo2/image/upload/v1760340369/venue-icons/57.jpg', // RG's
  '26': 'https://res.cloudinary.com/dkcma3mo2/image/upload/v1760340393/venue-icons/26.jpg', // Fridays
  '27': 'https://res.cloudinary.com/dkcma3mo2/image/upload/v1760340386/venue-icons/27.jpg', // Riverbar
  '12': 'https://res.cloudinary.com/dkcma3mo2/image/upload/v1760340404/venue-icons/12.jpg', // Birdees
  '5': 'https://res.cloudinary.com/dkcma3mo2/image/upload/v1760340412/venue-icons/5.jpg',   // Honky Tonks
  '18': 'https://res.cloudinary.com/dkcma3mo2/image/upload/v1760340463/venue-icons/18.jpg', // Rics
  '58': 'https://res.cloudinary.com/dkcma3mo2/image/upload/v1760340456/venue-icons/58.jpg', // The Wickham
  '44': 'https://res.cloudinary.com/dkcma3mo2/image/upload/v1760342943/venue-icons/44.jpg', // The Brightside
  '8': 'https://res.cloudinary.com/dkcma3mo2/image/upload/v1760342942/venue-icons/8.jpg',   // The Prince Consort Hotel
  '61': 'https://res.cloudinary.com/dkcma3mo2/image/upload/v1760397454/venue-icons/61.jpg', // Pig n Whistle Indooroopilly
  '63': 'https://res.cloudinary.com/dkcma3mo2/image/upload/v1760397438/venue-icons/63.jpg', // Pig n Whistle West End
  '62': 'https://res.cloudinary.com/dkcma3mo2/image/upload/v1760397437/venue-icons/62.jpg', // Pig n Whistle Riverside
  '32': 'https://res.cloudinary.com/dkcma3mo2/image/upload/v1760397438/venue-icons/32.jpg', // Sound Garden
};

async function updateMissingVenueIcons() {
  try {
    console.log('🖼️  Updating missing venue icon URLs...\n');

    let updated = 0;
    let failed = 0;
    let notFound = 0;

    for (const [venueId, iconUrl] of Object.entries(VENUE_ICON_UPDATES)) {
      try {
        // Check if venue exists
        const venue = await prisma.venue.findUnique({
          where: { id: venueId },
          select: { id: true, name: true, venueIconUrl: true }
        });

        if (!venue) {
          console.log(`❌ Venue not found: ID ${venueId}`);
          notFound++;
          continue;
        }

        // Update venue icon URL
        await prisma.venue.update({
          where: { id: venueId },
          data: { venueIconUrl: iconUrl }
        });

        console.log(`✅ Updated: ${venue.name} (ID: ${venueId})`);
        console.log(`   Old URL: ${venue.venueIconUrl || 'NULL'}`);
        console.log(`   New URL: ${iconUrl}\n`);
        updated++;

      } catch (error) {
        console.error(`❌ Failed to update venue ID ${venueId}:`, error);
        failed++;
      }
    }

    console.log('\n📊 Update Summary:');
    console.log(`  ✅ Updated: ${updated} venues`);
    console.log(`  ❌ Not Found: ${notFound} venues`);
    console.log(`  ❌ Failed: ${failed} venues`);
    console.log(`  📍 Total processed: ${Object.keys(VENUE_ICON_UPDATES).length} venues`);

  } catch (error) {
    console.error('❌ Update failed:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

updateMissingVenueIcons()
  .then(() => {
    console.log('\n✅ Venue icon update completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Venue icon update failed:', error);
    process.exit(1);
  });
