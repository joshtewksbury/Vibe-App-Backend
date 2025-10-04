const { Client } = require('pg');
const fs = require('fs').promises;
const path = require('path');

// Database configuration
const dbClient = new Client({
  connectionString: 'postgresql://postgres:ZGPKsGTLKzEjghOWcljLSYeXDGjDdoSn@caboose.proxy.rlwy.net:42965/railway',
  ssl: {
    rejectUnauthorized: false
  }
});

// Image directory
const IMAGE_DIRECTORY = '/Users/joshtewksbury/Desktop/Venue Icons';

// Map image filenames to venue names (case-insensitive matching)
const filenameToVenueName = {
  'heychica.jpg': 'Hey Chica',
  'irisrooftop.jpg': 'Iris Rooftop',
  'themet.jpg': 'The MET',
  'thebeat.jpg': 'The Beat',
  'honkytonks.jpg': 'Honky Tonks',
  'blackbearlodge.jpg': 'Black Bear Lodge',
  'sucasa.jpg': 'Su Casa',
  'theboundary.jpg': 'The Boundary',
  'archive.jpg': 'Archive',
  'prohibition.jpg': 'Prohibition',
  'birdees.jpg': 'Birdees',
  'sixesandsevens.jpg': 'Sixes and Sevens',
  'johnnyringos.jpg': "Johnny Ringo's",
  'maya.jpg': 'Maya Rooftop Bar',
  'osbournehotel.jpg': 'Osbourne Hotel',
  'regatta.jpg': 'Regatta Hotel',
  'ricsbar.jpg': 'Rics Bar',
  'royalexchangehotel.jpg': 'Royal Exchange Hotel',
  'sixteenantlers.jpg': 'Sixteen Antlers',
  'soko.jpg': 'Soko',
  'taxoffice.jpg': 'The Tax Office',
  'warehouse25.jpg': 'Warehouse 25',
  'riverland.jpg': 'Riverland Brisbane',
  'blackbird.jpg': 'Blackbird Brisbane',
  'fridays.jpg': "Friday's Riverside Brisbane",
  'riverbarandkitchen.jpg': 'Riverbar & Kitchen Brisbane',
  'barpacino.jpg': 'Bar Pacino Brisbane',
  'hotelwestend.jpg': 'Hotel West End',
  'thenormanbyhotel.jpg': 'The Normanby Hotel',
  'newmarkethotel.jpg': 'The Newmarket Hotel',
  'eclipse.jpg': 'Eclipse Nightclub',
  'retros.jpg': 'Retros',
  'thetriffid.jpg': 'The Triffid',
  'thetivoli.jpg': 'The Tivoli',
  'mrpercivals.jpg': "Mr Percival's",
  'lobbybar.jpg': 'The Lobby Bar',
  'jubileehotel.jpg': 'Jubilee Hotel',
  'alfredandconstance.jpg': 'Alfred & Constance',
  'thestarbrisbane.jpg': 'The Star Brisbane',
  'felons.jpg': 'Felons Brewing Co',
  'pawn&co.jpg': 'Pawn & Co Brisbane',
  'wonderland.jpg': 'Wonderland',
  'enigma.jpg': 'Enigma',
  'greaser.jpg': 'Greaser',
  'qahotel.jpg': 'QA Hotel',
  'themagee.jpg': 'The Magee',
  'indooroopillyhotel.jpg': 'Indooroopilly Hotel',
  'thepaddo.jpg': 'The Paddo',
  'leftysmusichall.jpg': "Lefty's Music Hall",
  'thecaxtonhotel.jpg': 'The Caxton Hotel',
  'deathandtaxes.jpg': 'Death and Taxes Brisbane',
  'cloudland.jpg': 'Cloudland',
  'thewickham.jpg': 'The Wickham',
  'summahouse.jpg': 'Summer House',
  'empirehotel.jpg': 'Empire Hotel',
  'pignwhistle.jpg': "Pig 'N' Whistle",
  'netherworld.jpg': 'Netherworld',
  'darling&co.jpg': 'Darling & Co.'
};

async function convertImageToBase64DataUrl(imagePath) {
  try {
    const imageBuffer = await fs.readFile(imagePath);
    const ext = path.extname(imagePath).toLowerCase();
    let mimeType = 'image/jpeg';

    if (ext === '.png') mimeType = 'image/png';
    else if (ext === '.gif') mimeType = 'image/gif';
    else if (ext === '.webp') mimeType = 'image/webp';

    const base64 = imageBuffer.toString('base64');
    return `data:${mimeType};base64,${base64}`;
  } catch (error) {
    console.error(`Error reading image:`, error.message);
    throw error;
  }
}

// Function to generate a cuid-like ID
function generateCuid() {
  const timestamp = Date.now().toString(36);
  const randomStr = Math.random().toString(36).substring(2, 15);
  return `c${timestamp}${randomStr}`;
}

async function updateVenueIcon(venueId, imageDataUrl, venueName) {
  try {
    // First, check if an ICON image already exists for this venue
    const checkQuery = `
      SELECT id FROM venue_images
      WHERE "venueId" = $1 AND "imageType" = 'ICON'
      LIMIT 1
    `;
    const checkResult = await dbClient.query(checkQuery, [venueId]);

    if (checkResult.rows.length > 0) {
      // Update existing icon
      const updateQuery = `
        UPDATE venue_images
        SET url = $1, "altText" = $2, "updatedAt" = NOW()
        WHERE id = $3
      `;
      await dbClient.query(updateQuery, [imageDataUrl, `Icon for ${venueName}`, checkResult.rows[0].id]);
    } else {
      // Insert new icon with generated ID
      const newId = generateCuid();
      const insertQuery = `
        INSERT INTO venue_images
        (id, "venueId", "imageType", url, "altText", "isActive", "displayOrder", "createdAt", "updatedAt")
        VALUES
        ($1, $2, 'ICON', $3, $4, true, 0, NOW(), NOW())
      `;
      await dbClient.query(insertQuery, [newId, venueId, imageDataUrl, `Icon for ${venueName}`]);
    }
  } catch (error) {
    console.error(`Error updating venue ${venueId}:`, error.message);
    throw error;
  }
}

async function processVenueIcons() {
  try {
    await dbClient.connect();
    console.log('✓ Connected to database\n');

    // Get all venues
    const venuesResult = await dbClient.query('SELECT id, name FROM venues ORDER BY id');
    const venues = venuesResult.rows;
    console.log(`Found ${venues.length} venues in database\n`);

    // Read image directory
    const files = await fs.readdir(IMAGE_DIRECTORY);
    const imageFiles = files.filter(file => {
      const ext = path.extname(file).toLowerCase();
      return ['.jpg', '.jpeg', '.png', '.gif', '.webp'].includes(ext);
    });

    console.log(`Found ${imageFiles.length} images in directory\n`);
    console.log('Starting upload process...\n');
    console.log('⚠️  Note: This will store images as base64 data URLs directly in the database\n');

    let successCount = 0;
    let errorCount = 0;
    const results = [];

    for (const imageFile of imageFiles) {
      const imagePath = path.join(IMAGE_DIRECTORY, imageFile);
      const normalizedFilename = imageFile.toLowerCase();

      // Find matching venue
      const venueName = filenameToVenueName[normalizedFilename];
      const venue = venues.find(v => v.name === venueName);

      if (!venue) {
        console.log(`⚠ No venue match for image: ${imageFile}`);
        errorCount++;
        continue;
      }

      try {
        console.log(`Processing: ${venue.name} (ID: ${venue.id})`);

        // Convert to base64 data URL
        console.log(`  Converting ${imageFile} to base64...`);
        const dataUrl = await convertImageToBase64DataUrl(imagePath);

        // Update database
        console.log(`  Updating database...`);
        await updateVenueIcon(venue.id, dataUrl, venue.name);

        console.log(`✓ Success! Stored as base64 data URL\n`);
        successCount++;

        results.push({
          venueId: venue.id,
          venueName: venue.name,
          imageFile: imageFile,
          stored: 'base64',
          success: true
        });
      } catch (error) {
        console.error(`✗ Failed: ${venue.name} - ${error.message}\n`);
        errorCount++;

        results.push({
          venueId: venue.id,
          venueName: venue.name,
          imageFile: imageFile,
          error: error.message,
          success: false
        });
      }
    }

    console.log('\n=== Summary ===');
    console.log(`Total images: ${imageFiles.length}`);
    console.log(`Successfully uploaded: ${successCount}`);
    console.log(`Errors: ${errorCount}`);

    // Save results to file
    await fs.writeFile(
      './venue_icon_upload_results_local.json',
      JSON.stringify({ results, summary: { total: imageFiles.length, success: successCount, errors: errorCount } }, null, 2)
    );
    console.log('\n✓ Results saved to venue_icon_upload_results_local.json');

  } catch (error) {
    console.error('Fatal error:', error.message);
  } finally {
    await dbClient.end();
    console.log('\n✓ Database connection closed');
  }
}

processVenueIcons();
