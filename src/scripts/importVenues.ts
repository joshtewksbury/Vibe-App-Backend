import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();

interface VenueJSON {
  id: string;
  name: string;
  category: string;
  location: string;
  latitude: number;
  longitude: number;
  genderSplit: {
    male: number;
    female: number;
  };
  averageAge: number;
  capacity: number;
  currentOccupancy: number;
  rating: number;
  priceRange: string;
  [key: string]: any;
}

async function importVenues() {
  try {
    console.log('📂 Reading venues.json...');
    const venuesPath = path.join(__dirname, '../../venues.json');
    const venuesData = JSON.parse(fs.readFileSync(venuesPath, 'utf-8'));
    const venues: VenueJSON[] = venuesData.venues;

    console.log(`📊 Found ${venues.length} venues to import`);

    let imported = 0;
    let updated = 0;

    for (const venue of venues) {
      try {
        // Check if venue already exists
        const existing = await prisma.venue.findUnique({
          where: { id: venue.id }
        });

        if (existing) {
          // Update existing venue
          await prisma.venue.update({
            where: { id: venue.id },
            data: {
              name: venue.name,
              category: venue.category,
              location: venue.location,
              latitude: venue.latitude,
              longitude: venue.longitude,
              capacity: venue.capacity,
              currentOccupancy: venue.currentOccupancy,
              rating: venue.rating,
              priceRange: venue.priceRange,
              musicGenres: venue.musicGenres || [],
              openingHours: venue.openingHours || {},
              features: venue.features || [],
              pricing: venue.pricing || null,
              images: venue.images || [],
              venueIcon: venue.venueIcon || null
            }
          });
          updated++;
          console.log(`✅ Updated: ${venue.name}`);
        } else {
          // Create new venue
          await prisma.venue.create({
            data: {
              id: venue.id,
              name: venue.name,
              category: venue.category,
              location: venue.location,
              latitude: venue.latitude,
              longitude: venue.longitude,
              capacity: venue.capacity,
              currentOccupancy: venue.currentOccupancy,
              rating: venue.rating,
              priceRange: venue.priceRange,
              musicGenres: venue.musicGenres || [],
              openingHours: venue.openingHours || {},
              features: venue.features || [],
              pricing: venue.pricing || null,
              images: venue.images || [],
              venueIcon: venue.venueIcon || null
            }
          });
          imported++;
          console.log(`✅ Imported: ${venue.name}`);
        }
      } catch (error) {
        console.error(`❌ Failed to import ${venue.name}:`, error);
      }
    }

    console.log('\n📊 Import Summary:');
    console.log(`  ✅ Imported: ${imported} venues`);
    console.log(`  🔄 Updated: ${updated} venues`);
    console.log(`  📍 Total: ${imported + updated} venues`);
  } catch (error) {
    console.error('❌ Import failed:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

importVenues()
  .then(() => {
    console.log('✅ Venue import completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Venue import failed:', error);
    process.exit(1);
  });
