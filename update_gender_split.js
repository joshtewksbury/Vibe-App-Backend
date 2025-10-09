const { PrismaClient } = require('@prisma/client');
const fs = require('fs');

const prisma = new PrismaClient();

async function updateGenderSplit() {
  try {
    // Read venues.json
    const jsonData = JSON.parse(fs.readFileSync('./venues.json', 'utf-8'));
    const venuesData = jsonData.venues || [];

    console.log(`📊 Updating gender split data for ${venuesData.length} venues...`);

    let updated = 0;
    let skipped = 0;

    for (const venueInfo of venuesData) {
      if (venueInfo.genderSplit && (venueInfo.genderSplit.male || venueInfo.genderSplit.female)) {
        // Find venue by name
        const venue = await prisma.venue.findFirst({
          where: { name: venueInfo.name }
        });

        if (venue) {
          await prisma.venue.update({
            where: { id: venue.id },
            data: {
              genderSplit: venueInfo.genderSplit,
              averageAge: venueInfo.averageAge || null
            }
          });
          console.log(`✅ Updated: ${venueInfo.name} - M:${venueInfo.genderSplit.male}% F:${venueInfo.genderSplit.female}%`);
          updated++;
        } else {
          console.log(`⚠️  Venue not found in DB: ${venueInfo.name}`);
          skipped++;
        }
      } else {
        skipped++;
      }
    }

    console.log(`\n✅ Updated ${updated} venues`);
    console.log(`⏭️  Skipped ${skipped} venues`);

  } catch (error) {
    console.error('❌ Error updating gender split:', error);
  } finally {
    await prisma.$disconnect();
  }
}

updateGenderSplit();
