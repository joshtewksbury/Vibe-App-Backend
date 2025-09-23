import { PrismaClient } from '@prisma/client'
import * as fs from 'fs'
import * as path from 'path'

const prisma = new PrismaClient()

async function main() {
  try {
    // Read the venues.json file
    const venuesPath = path.join(process.cwd(), 'venues.json')
    const venuesData = JSON.parse(fs.readFileSync(venuesPath, 'utf8'))
    
    console.log(`Starting to seed ${venuesData.venues.length} venues...`)

    // Clear existing data
    await prisma.busySnapshot.deleteMany()
    await prisma.deal.deleteMany()
    await prisma.event.deleteMany()
    await prisma.post.deleteMany()
    await prisma.story.deleteMany()
    await prisma.venue.deleteMany()
    console.log('Cleared existing venue data')

    // Process each venue (venues only, no deals/events for now)
    for (const venue of venuesData.venues) {
      // Map your JSON structure to the database schema
      const venueData = {
        name: venue.name,
        category: venue.category,
        location: venue.location,
        latitude: venue.latitude,
        longitude: venue.longitude,
        capacity: venue.capacity,
        currentOccupancy: venue.currentOccupancy || 0,
        rating: venue.rating || null,
        priceRange: venue.priceRange || venue.pricing?.tier || '$',
        pricing: venue.pricing || null,
        musicGenres: venue.musicGenres || [],
        openingHours: venue.openingHours || {},
        features: venue.features || [],
        bookingURL: venue.bookingURL === 'PLACEHOLDER_URL' || venue.bookingURL === 'none' ? null : venue.bookingURL,
        phoneNumber: venue.phoneNumber === 'PLACEHOLDER_PHONE' || venue.phoneNumber === 'none' ? null : venue.phoneNumber,
        images: venue.images || [],
        placeId: venue.placeId || null,
        businessStatus: venue.businessStatus || 'OPERATIONAL'
      }

      // Create the venue
      const createdVenue = await prisma.venue.create({
        data: venueData
      })

      console.log(`Created venue: ${venue.name}`)

      // Create busy snapshots only
      if (venue.currentOccupancy && venue.capacity) {
        const occupancyPercentage = Math.round((venue.currentOccupancy / venue.capacity) * 100)
        let status: 'QUIET' | 'MODERATE' | 'BUSY' | 'VERY_BUSY' | 'CLOSED'
        
        if (occupancyPercentage < 25) status = 'QUIET'
        else if (occupancyPercentage < 50) status = 'MODERATE'
        else if (occupancyPercentage < 75) status = 'BUSY'
        else status = 'VERY_BUSY'

        await prisma.busySnapshot.create({
          data: {
            venueId: createdVenue.id,
            occupancyCount: venue.currentOccupancy,
            occupancyPercentage: occupancyPercentage,
            status: status,
            source: 'seed_data'
          }
        })
      }

      // Small delay to avoid overwhelming the database
      await new Promise(resolve => setTimeout(resolve, 10))
    }

    console.log(`Successfully seeded ${venuesData.venues.length} venues!`)
    
    // Print stats
    const venueCount = await prisma.venue.count()
    const busySnapshotCount = await prisma.busySnapshot.count()
    
    console.log('\n=== Database Statistics ===')
    console.log(`Venues: ${venueCount}`)
    console.log(`Busy Snapshots: ${busySnapshotCount}`)

  } catch (error) {
    console.error('Error seeding database:', error)
    throw error
  }
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })