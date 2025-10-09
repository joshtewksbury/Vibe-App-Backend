const { PrismaClient } = require('@prisma/client');
const fs = require('fs');

// This script will use the DATABASE_URL from your .env file
// To run on Railway production, set your production DATABASE_URL before running
const prisma = new PrismaClient();

async function updateVenueMetadata() {
  try {
    console.log('🔗 Connecting to database...');

    // Test connection
    await prisma.$connect();
    console.log('✅ Connected to database');

    // Read venues.json
    const jsonData = JSON.parse(fs.readFileSync('./venues.json', 'utf-8'));
    const venuesData = jsonData.venues || [];

    console.log(`\n📊 Updating venue metadata for ${venuesData.length} venues...`);

    let updated = 0;
    let skipped = 0;
    let notFound = 0;

    for (const venueInfo of venuesData) {
      // Find venue by name
      const venue = await prisma.venue.findFirst({
        where: { name: venueInfo.name }
      });

      if (venue) {
        const updateData = {};

        // Add gender split if available
        if (venueInfo.genderSplit && (venueInfo.genderSplit.male || venueInfo.genderSplit.female)) {
          updateData.genderSplit = venueInfo.genderSplit;
        }

        // Add average age if available
        if (venueInfo.averageAge) {
          updateData.averageAge = venueInfo.averageAge;
        }

        // Add venue icon if available
        if (venueInfo.venueIcon) {
          updateData.venueIcon = venueInfo.venueIcon;
        }

        // Only update if we have data to update
        if (Object.keys(updateData).length > 0) {
          await prisma.venue.update({
            where: { id: venue.id },
            data: updateData
          });

          const updates = [];
          if (updateData.genderSplit) updates.push(`Gender: M:${venueInfo.genderSplit.male}% F:${venueInfo.genderSplit.female}%`);
          if (updateData.averageAge) updates.push(`Age: ${venueInfo.averageAge}`);
          if (updateData.venueIcon) {
            const iconPreview = venueInfo.venueIcon.substring(0, 50);
            updates.push(`Icon: ${iconPreview}...`);
          }

          console.log(`✅ Updated: ${venueInfo.name} - ${updates.join(', ')}`);
          updated++;
        } else {
          console.log(`⏭️  No data to update for: ${venueInfo.name}`);
          skipped++;
        }
      } else {
        console.log(`⚠️  Venue not found in DB: ${venueInfo.name}`);
        notFound++;
      }
    }

    console.log(`\n📈 Summary:`);
    console.log(`✅ Updated: ${updated} venues`);
    console.log(`⏭️  Skipped: ${skipped} venues (no data)`);
    console.log(`⚠️  Not found: ${notFound} venues`);

  } catch (error) {
    console.error('❌ Error updating venue metadata:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
    console.log('\n🔌 Disconnected from database');
  }
}

updateVenueMetadata()
  .catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
