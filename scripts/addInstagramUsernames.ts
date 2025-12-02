/**
 * Script to add Instagram usernames to venues
 *
 * Usage:
 * npx ts-node scripts/addInstagramUsernames.ts
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Add your venue Instagram mappings here
const venueInstagramMapping: Record<string, string> = {
  // Format: 'Venue Name': 'instagram_username'

  // Example venues - Brisbane nightlife
  'Regatta Hotel': 'regattahotel',
  'Felons Brewing Co': 'felonsbrewing',
  'Caxton Hotel': 'caxtonhotel',
  'Breakfast Creek Hotel': 'breakfastcreekhotel',
  'The Boundary Hotel': 'theboundaryhotel',
  'Story Bridge Hotel': 'storybridgehotel',
  'The Beat Megaclub': 'thebeatmegaclub',
  'Family Nightclub': 'familybrisbane',
  'Prohibition': 'prohibitionbrisbane',
  'Netherworld': 'netherworldarcade',
  'Archerfield Tavern': 'archerfieldtavern',
  'The RE Hotel': 'therehotel',
  'West End Hotel': 'hotelwestend',
  'The Norman Hotel': 'thenormanhotel',
  'Green Beacon Brewing Co': 'greenbeaconbrewing',

  // Add more venues here...
  // You can get Instagram usernames by:
  // 1. Searching venue name on Instagram
  // 2. Copying the username from their profile
  // 3. Adding to this list
};

async function main() {
  console.log('🚀 Starting Instagram username import...\n');

  let updated = 0;
  let notFound = 0;
  let alreadySet = 0;

  for (const [venueName, instagramUsername] of Object.entries(venueInstagramMapping)) {
    try {
      // Find venue by name
      const venue = await prisma.venue.findFirst({
        where: {
          name: {
            equals: venueName,
            mode: 'insensitive' // Case-insensitive search
          }
        }
      });

      if (!venue) {
        console.log(`❌ Venue not found: "${venueName}"`);
        notFound++;
        continue;
      }

      // Check if already has Instagram username
      if (venue.instagramUsername) {
        console.log(`⏭️  "${venueName}" already has Instagram: @${venue.instagramUsername}`);
        alreadySet++;
        continue;
      }

      // Update with Instagram username
      await prisma.venue.update({
        where: { id: venue.id },
        data: { instagramUsername }
      });

      console.log(`✅ Updated "${venueName}" → @${instagramUsername}`);
      updated++;

    } catch (error) {
      console.error(`❌ Error updating "${venueName}":`, error);
    }
  }

  console.log('\n📊 Import Summary:');
  console.log(`   ✅ Updated: ${updated}`);
  console.log(`   ⏭️  Already set: ${alreadySet}`);
  console.log(`   ❌ Not found: ${notFound}`);
  console.log(`   📝 Total in mapping: ${Object.keys(venueInstagramMapping).length}`);

  // Show venues that still need Instagram usernames
  const venuesWithoutInstagram = await prisma.venue.findMany({
    where: { instagramUsername: null },
    select: { id: true, name: true, category: true }
  });

  if (venuesWithoutInstagram.length > 0) {
    console.log(`\n⚠️  ${venuesWithoutInstagram.length} venues still need Instagram usernames:`);
    venuesWithoutInstagram.slice(0, 10).forEach(venue => {
      console.log(`   - ${venue.name} (${venue.category})`);
    });

    if (venuesWithoutInstagram.length > 10) {
      console.log(`   ... and ${venuesWithoutInstagram.length - 10} more`);
    }

    console.log('\n💡 Tip: Add them to venueInstagramMapping in this script and run again');
  } else {
    console.log('\n🎉 All venues have Instagram usernames!');
  }

  await prisma.$disconnect();
}

main()
  .catch(error => {
    console.error('❌ Script failed:', error);
    process.exit(1);
  });
