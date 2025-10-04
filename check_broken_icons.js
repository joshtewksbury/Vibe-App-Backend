const { Client } = require('pg');

// Database configuration
const dbClient = new Client({
  connectionString: 'postgresql://postgres:ZGPKsGTLKzEjghOWcljLSYeXDGjDdoSn@caboose.proxy.rlwy.net:42965/railway',
  ssl: {
    rejectUnauthorized: false
  }
});

async function checkBrokenIcons() {
  try {
    await dbClient.connect();
    console.log('✓ Connected to database\n');

    // Query venue_images where url is incomplete (just the header)
    const query = `
      SELECT vi.id, vi."venueId", vi.url, v.name as venue_name, LENGTH(vi.url) as url_length
      FROM venue_images vi
      JOIN venues v ON vi."venueId" = v.id
      WHERE vi."imageType" = 'ICON'
      ORDER BY v.name
    `;

    const result = await dbClient.query(query);

    console.log(`Found ${result.rows.length} venue icon records:\n`);

    const brokenIcons = [];
    const workingIcons = [];

    result.rows.forEach(row => {
      const isBroken = row.url_length < 100 || !row.url.includes(',');

      if (isBroken) {
        brokenIcons.push(row);
        console.log(`❌ ${row.venue_name} (ID: ${row.venueId})`);
        console.log(`   URL: ${row.url}`);
        console.log(`   Length: ${row.url_length} characters\n`);
      } else {
        workingIcons.push(row);
        console.log(`✓ ${row.venue_name} (ID: ${row.venueId}) - ${row.url_length} characters`);
      }
    });

    console.log(`\n=== Summary ===`);
    console.log(`Total icons: ${result.rows.length}`);
    console.log(`Working icons: ${workingIcons.length}`);
    console.log(`Broken icons: ${brokenIcons.length}`);

    if (brokenIcons.length > 0) {
      console.log(`\nBroken venue IDs: ${brokenIcons.map(i => i.venueId).join(', ')}`);
      console.log(`Broken venue names: ${brokenIcons.map(i => i.venue_name).join(', ')}`);
    }

  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await dbClient.end();
    console.log('\n✓ Database connection closed');
  }
}

checkBrokenIcons();
