import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';
import { uploadBase64Image } from '../services/cloudinaryService';

const prisma = new PrismaClient();

// Mapping of icon file names to venue names in the database
const ICON_MAPPING: Record<string, string> = {
  'alfredandconstance.jpg': 'Alfred & Constance',
  'archive.jpg': 'The Archive',
  'barpacino.jpg': 'Bar Pacino',
  'birdees.jpg': "Birdee's",
  'blackbearlodge.jpg': 'Black Bear Lodge',
  'blackbird.jpg': 'Blackbird',
  'cloudland.jpg': 'Cloudland',
  'darling&co.jpg': 'Darling & Co',
  'deathandtaxes.jpg': 'Death & Taxes',
  'eclipse.jpg': 'Eclipse',
  'empirehotel.jpg': 'Empire Hotel',
  'enigma.jpg': 'Enigma',
  'felons.jpg': 'Felons Brewing Co',
  'fridays.jpg': "Fridays Riverside",
  'greaser.jpg': 'Greaser',
  'heychica.jpg': 'Hey Chica',
  'honkytonks.jpg': 'Honkytonks',
  'hotelwestend.jpg': 'West End Hotel',
  'Indooroopillyhotel.jpg': 'Indooroopilly Hotel',
  'irisrooftop.jpg': 'Iris Rooftop',
  'johnnyringos.jpg': "Johnny Ringo's",
  'jubileehotel.jpg': 'Jubilee Hotel',
  'leftysmusichall.jpg': "Lefty's Music Hall",
  'lobbybar.jpg': 'Lobby Bar',
  'maya.jpg': 'Maya',
  'mrpercivals.jpg': 'Mr Percival\'s',
  'netherworld.jpg': 'Netherworld',
  'newmarkethotel.jpg': 'Newmarket Hotel',
  'osbournehotel.jpg': 'Osbourne Hotel',
  'pawn&co.jpg': 'Pawn & Co',
  'pignwhistle.jpg': 'Pig N Whistle',
  'prohibition.jpg': 'Prohibition',
  'qahotel.jpg': 'QA Hotel',
  'regatta.jpg': 'The Regatta Hotel',
  'retros.jpg': 'Retros',
  'ricsbar.jpg': "Ric's Bar",
  'riverbarandkitchen.jpg': 'River Bar and Kitchen',
  'riverland.jpg': 'Riverland',
  'royalexchangehotel.jpg': 'Royal Exchange Hotel',
  'royalgeorgehotel.jpg': 'Royal George Hotel',
  'sixesandsevens.jpg': 'Sixes and Sevens',
  'sixteenantlers.jpg': 'Sixteen Antlers',
  'soko.jpg': 'Soko',
  'sucasa.jpg': 'Su Casa',
  'summahouse.jpg': 'Summa House',
  'taxoffice.jpg': 'Tax Office',
  'thebeat.jpg': 'The Beat',
  'theboundary.jpg': 'The Boundary Hotel',
  'thecaxtonhotel.jpg': 'The Caxton Hotel',
  'themagee.jpg': 'The Magee',
  'themet.jpg': 'The Met',
  'thenormanbyhotel.jpg': 'The Normanby Hotel',
  'thepaddo.jpg': 'The Paddo',
  'thestarbrisbane.jpg': 'The Star Brisbane',
  'thetivoli.jpg': 'The Tivoli',
  'thetriffid.jpg': 'The Triffid',
  'thewickham.jpg': 'The Wickham Hotel',
  'warehouse25.jpg': 'Warehouse 25',
  'wonderland.jpg': 'Wonderland',
};

async function uploadVenueIcons() {
  try {
    console.log('🖼️  Starting venue icon upload to Cloudinary...\n');

    const iconsDir = '/Users/joshtewksbury/Desktop/Venue Icons';
    const iconFiles = fs.readdirSync(iconsDir).filter(f => f.endsWith('.jpg') && f !== '.DS_Store');

    let uploaded = 0;
    let skipped = 0;
    let failed = 0;

    for (const iconFile of iconFiles) {
      const venueName = ICON_MAPPING[iconFile];

      if (!venueName) {
        console.log(`⚠️  No mapping found for: ${iconFile}`);
        skipped++;
        continue;
      }

      try {
        // Find venue in database
        const venue = await prisma.venue.findFirst({
          where: {
            name: {
              contains: venueName,
              mode: 'insensitive'
            }
          }
        });

        if (!venue) {
          console.log(`❌ Venue not found in database: ${venueName} (${iconFile})`);
          failed++;
          continue;
        }

        // Check if icon already uploaded
        if (venue.venueIconUrl) {
          console.log(`⏭️  Icon already exists for: ${venueName}`);
          skipped++;
          continue;
        }

        // Read image file and convert to base64
        const iconPath = path.join(iconsDir, iconFile);
        const imageBuffer = fs.readFileSync(iconPath);
        const base64Image = `data:image/jpeg;base64,${imageBuffer.toString('base64')}`;

        // Upload to Cloudinary
        console.log(`📤 Uploading: ${venueName}...`);
        const result = await uploadBase64Image(
          base64Image,
          'venue-icons',
          venue.id // Use venue ID as public ID for easy reference
        );

        // Update venue with Cloudinary URL
        await prisma.venue.update({
          where: { id: venue.id },
          data: { venueIconUrl: result.secureUrl }
        });

        console.log(`✅ Uploaded icon for: ${venueName}`);
        console.log(`   URL: ${result.secureUrl}\n`);
        uploaded++;

      } catch (error) {
        console.error(`❌ Failed to upload icon for ${venueName}:`, error);
        failed++;
      }
    }

    console.log('\n📊 Upload Summary:');
    console.log(`  ✅ Uploaded: ${uploaded} icons`);
    console.log(`  ⏭️  Skipped: ${skipped} venues`);
    console.log(`  ❌ Failed: ${failed} venues`);
    console.log(`  📍 Total processed: ${iconFiles.length} files`);
  } catch (error) {
    console.error('❌ Upload failed:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

uploadVenueIcons()
  .then(() => {
    console.log('\n✅ Icon upload completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Icon upload failed:', error);
    process.exit(1);
  });
