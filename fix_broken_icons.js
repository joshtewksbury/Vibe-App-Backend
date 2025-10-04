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

// Broken venues to fix
const brokenVenues = [
  { id: '10', name: 'Archive', file: 'archive.jpg' },
  { id: '56', name: 'Cloudland', file: 'cloudland.jpg' },
  { id: '60', name: 'Empire Hotel', file: 'empirehotel.jpg' },
  { id: '47', name: 'Enigma', file: 'enigma.jpg' },
  { id: '43', name: 'Felons Brewing Co', file: 'felons.jpg' },
  { id: '26', name: "Friday's Riverside Brisbane", file: 'fridays.jpg' },
  { id: '48', name: 'Greaser', file: 'greaser.jpg' },
  { id: '14', name: "Johnny Ringo's", file: 'johnnyringos.jpg' },
  { id: '16', name: 'Osbourne Hotel', file: 'osbournehotel.jpg' },
  { id: '45', name: 'Pawn & Co Brisbane', file: 'pawn&co.jpg' },
  { id: '27', name: 'Riverbar & Kitchen Brisbane', file: 'riverbarandkitchen.jpg' },
  { id: '24', name: 'Riverland Brisbane', file: 'riverland.jpg' },
  { id: '19', name: 'Royal Exchange Hotel', file: 'royalexchangehotel.jpg' },
  { id: '13', name: 'Sixes and Sevens', file: 'sixesandsevens.jpg' },
  { id: '20', name: 'Sixteen Antlers', file: 'sixteenantlers.jpg' },
  { id: '9', name: 'The Boundary', file: 'theboundary.jpg' },
  { id: '54', name: 'The Caxton Hotel', file: 'thecaxtonhotel.jpg' },
  { id: '22', name: 'The Tax Office', file: 'taxoffice.jpg' },
  { id: '35', name: 'The Triffid', file: 'thetriffid.jpg' },
  { id: '58', name: 'The Wickham', file: 'thewickham.jpg' },
  { id: '23', name: 'Warehouse 25', file: 'warehouse25.jpg' }
];

async function convertImageToBase64DataUrl(imagePath) {
  try {
    const imageBuffer = await fs.readFile(imagePath);
    const ext = path.extname(imagePath).toLowerCase();
    let mimeType = 'image/jpeg';

    if (ext === '.png') mimeType = 'image/png';
    else if (ext === '.gif') mimeType = 'image/gif';
    else if (ext === '.webp') mimeType = 'image/webp';

    const base64 = imageBuffer.toString('base64');
    const dataUrl = `data:${mimeType};base64,${base64}`;

    console.log(`   Base64 length: ${base64.length} characters`);
    console.log(`   Data URL length: ${dataUrl.length} characters`);

    return dataUrl;
  } catch (error) {
    console.error(`Error reading image:`, error.message);
    throw error;
  }
}

async function updateVenueIcon(venueId, imageDataUrl, venueName) {
  try {
    // Update existing icon
    const updateQuery = `
      UPDATE venue_images
      SET url = $1, "altText" = $2, "updatedAt" = NOW()
      WHERE "venueId" = $3 AND "imageType" = 'ICON'
      RETURNING id
    `;
    const result = await dbClient.query(updateQuery, [imageDataUrl, `Icon for ${venueName}`, venueId]);

    if (result.rowCount === 0) {
      throw new Error('No icon record found to update');
    }

    return result.rows[0].id;
  } catch (error) {
    console.error(`Error updating venue ${venueId}:`, error.message);
    throw error;
  }
}

async function fixBrokenIcons() {
  try {
    await dbClient.connect();
    console.log('✓ Connected to database\n');

    let successCount = 0;
    let errorCount = 0;

    for (const venue of brokenVenues) {
      const imagePath = path.join(IMAGE_DIRECTORY, venue.file);

      console.log(`Processing: ${venue.name} (ID: ${venue.id})`);
      console.log(`  Image file: ${venue.file}`);

      try {
        // Check if file exists
        await fs.access(imagePath);

        // Convert to base64
        console.log(`  Converting to base64...`);
        const dataUrl = await convertImageToBase64DataUrl(imagePath);

        // Update database
        console.log(`  Updating database...`);
        await updateVenueIcon(venue.id, dataUrl, venue.name);

        console.log(`✓ Success!\n`);
        successCount++;

      } catch (error) {
        console.error(`✗ Failed: ${error.message}\n`);
        errorCount++;
      }
    }

    console.log('\n=== Summary ===');
    console.log(`Total venues to fix: ${brokenVenues.length}`);
    console.log(`Successfully fixed: ${successCount}`);
    console.log(`Errors: ${errorCount}`);

  } catch (error) {
    console.error('Fatal error:', error.message);
  } finally {
    await dbClient.end();
    console.log('\n✓ Database connection closed');
  }
}

fixBrokenIcons();
