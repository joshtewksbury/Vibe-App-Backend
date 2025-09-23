import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const venuesData = [
  {
    id: '1',
    name: 'Hey Chica',
    category: 'Latin Bar & Nightclub',
    location: '315 Brunswick St, Fortitude Valley',
    latitude: -27.4580512,
    longitude: 153.0343356,
    capacity: 230,
    currentOccupancy: 180,
    rating: 4.3,
    priceRange: '$$',
    pricing: {
      tier: '$$',
      beers: '$8-12',
      basics: '$12-16',
      cocktails: '$16-22'
    },
    musicGenres: [
      { id: '1', name: 'Salsa', icon: 'music.note', color: 'red' },
      { id: '2', name: 'Latin', icon: 'guitars', color: 'orange' },
      { id: '3', name: 'Reggaeton', icon: 'waveform', color: 'green' }
    ],
    openingHours: {
      monday: 'Closed',
      tuesday: '11am-12am',
      wednesday: '11am-1am',
      thursday: '11am-1am',
      friday: '11am-3am',
      saturday: '11am-3am',
      sunday: 'Closed'
    },
    features: [
      { name: 'Dance Floor', icon: 'figure.dance' },
      { name: 'Live Music', icon: 'music.note' },
      { name: 'Latin Vibes', icon: 'heart.fill' }
    ],
    bookingURL: 'https://www.heychica.com.au/',
    phoneNumber: '(07) 3852 4776',
    images: ['https://example.com/hey-chica-1.jpg'],
    placeId: 'ChIJWYPpUxNZkWsRaJOv74h0iT8'
  },
  {
    id: '2',
    name: 'The Met Brisbane',
    category: 'Cocktail Bar',
    location: 'Level 2, 8 Edward St, Brisbane City',
    latitude: -27.4678,
    longitude: 153.0281,
    capacity: 150,
    currentOccupancy: 95,
    rating: 4.5,
    priceRange: '$$$$',
    pricing: {
      tier: '$$$$',
      beers: '$12-16',
      basics: '$16-22',
      cocktails: '$20-28'
    },
    musicGenres: [
      { id: '3', name: 'Jazz', icon: 'music.note', color: 'gold' },
      { id: '4', name: 'Lounge', icon: 'waveform', color: 'brown' }
    ],
    openingHours: {
      monday: 'Closed',
      tuesday: '5pm-Late',
      wednesday: '5pm-Late',
      thursday: '5pm-Late',
      friday: '5pm-Late',
      saturday: '5pm-Late',
      sunday: 'Closed'
    },
    features: [
      { name: 'Craft Cocktails', icon: 'wineglass' },
      { name: 'City Views', icon: 'building.2' },
      { name: 'Premium Bar', icon: 'star.fill' }
    ],
    bookingURL: 'https://www.themetbrisbane.com/',
    phoneNumber: '(07) 3211 8015',
    images: ['https://example.com/met-brisbane-1.jpg'],
    placeId: 'ChIJw990El9ZkWsRLtnMlazxUA0'
  },
  {
    id: '3',
    name: 'Osbourne Hotel',
    category: 'Pub & Live Music',
    location: '355 Brunswick St, Fortitude Valley',
    latitude: -27.4587,
    longitude: 153.0344,
    capacity: 300,
    currentOccupancy: 220,
    rating: 4.2,
    priceRange: '$$',
    pricing: {
      tier: '$$',
      beers: '$6-10',
      basics: '$10-14',
      cocktails: '$14-18'
    },
    musicGenres: [
      { id: '5', name: 'Rock', icon: 'guitars', color: 'red' },
      { id: '6', name: 'Indie', icon: 'music.note', color: 'blue' },
      { id: '7', name: 'Acoustic', icon: 'guitars.fill', color: 'brown' }
    ],
    openingHours: {
      monday: '12pm-12am',
      tuesday: '12pm-12am',
      wednesday: '12pm-12am',
      thursday: '12pm-1am',
      friday: '12pm-3am',
      saturday: '12pm-3am',
      sunday: '12pm-12am'
    },
    features: [
      { name: 'Live Music', icon: 'music.note' },
      { name: 'Beer Garden', icon: 'leaf.fill' },
      { name: 'Pool Tables', icon: 'sportscourt' }
    ],
    bookingURL: 'https://www.osbournehotel.com.au/',
    phoneNumber: '(07) 3852 1503',
    images: ['https://example.com/osbourne-1.jpg'],
    placeId: 'ChIJm05xlfJZkWsRbM5krnTsTdc'
  }
];

async function main() {
  console.log('🌱 Starting database seed...');

  // Clear existing data (be careful in production!)
  await prisma.busySnapshot.deleteMany();
  await prisma.post.deleteMany();
  await prisma.deal.deleteMany();
  await prisma.event.deleteMany();
  await prisma.story.deleteMany();
  await prisma.venue.deleteMany();
  await prisma.refreshToken.deleteMany();
  await prisma.user.deleteMany();

  // Create venues
  console.log('📍 Creating venues...');
  for (const venueData of venuesData) {
    const venue = await prisma.venue.create({
      data: venueData
    });
    console.log(`✅ Created venue: ${venue.name}`);

    // Create some sample busy snapshots for each venue
    const now = new Date();
    for (let i = 0; i < 24; i++) {
      const timestamp = new Date(now.getTime() - i * 60 * 60 * 1000); // Every hour for last 24 hours
      const hour = timestamp.getHours();

      // Generate realistic occupancy based on time of day
      let occupancyPercentage = 0;
      if (hour >= 18 && hour <= 23) {
        // Peak hours
        occupancyPercentage = Math.floor(Math.random() * 30) + 60; // 60-90%
      } else if (hour >= 12 && hour <= 17) {
        // Afternoon
        occupancyPercentage = Math.floor(Math.random() * 30) + 30; // 30-60%
      } else if (hour >= 0 && hour <= 2) {
        // Late night
        occupancyPercentage = Math.floor(Math.random() * 40) + 40; // 40-80%
      } else {
        // Other hours
        occupancyPercentage = Math.floor(Math.random() * 20) + 10; // 10-30%
      }

      const occupancyCount = Math.floor((occupancyPercentage / 100) * venue.capacity);

      let status: any = 'MODERATE';
      if (occupancyPercentage >= 80) status = 'VERY_BUSY';
      else if (occupancyPercentage >= 60) status = 'BUSY';
      else if (occupancyPercentage >= 30) status = 'MODERATE';
      else status = 'QUIET';

      await prisma.busySnapshot.create({
        data: {
          venueId: venue.id,
          timestamp,
          occupancyCount,
          occupancyPercentage,
          status,
          source: 'seed'
        }
      });
    }
  }

  // Create admin user
  console.log('👤 Creating admin user...');
  const bcrypt = require('bcryptjs');
  const adminPassword = await bcrypt.hash('admin123', 12);

  const adminUser = await prisma.user.create({
    data: {
      email: 'admin@vibe.app',
      firstName: 'Admin',
      lastName: 'User',
      passwordHash: adminPassword,
      role: 'ADMIN',
      isEmailVerified: true,
      location: 'Brisbane, QLD'
    }
  });
  console.log(`✅ Created admin user: ${adminUser.email}`);

  // Create venue manager
  console.log('👤 Creating venue manager...');
  const managerPassword = await bcrypt.hash('manager123', 12);

  const managerUser = await prisma.user.create({
    data: {
      email: 'manager@vibe.app',
      firstName: 'Venue',
      lastName: 'Manager',
      passwordHash: managerPassword,
      role: 'VENUE_MANAGER',
      venueIds: ['1', '2'], // Can manage Hey Chica and The Met
      isEmailVerified: true,
      location: 'Brisbane, QLD'
    }
  });
  console.log(`✅ Created venue manager: ${managerUser.email}`);

  // Create regular user
  console.log('👤 Creating regular user...');
  const userPassword = await bcrypt.hash('user123', 12);

  const regularUser = await prisma.user.create({
    data: {
      email: 'user@vibe.app',
      firstName: 'Demo',
      lastName: 'User',
      passwordHash: userPassword,
      role: 'USER',
      isEmailVerified: true,
      location: 'Brisbane, QLD',
      musicPreferences: ['Electronic', 'House', 'Techno'],
      venuePreferences: ['Nightclub', 'Bar', 'Lounge'],
      goingOutFrequency: 'REGULARLY'
    }
  });
  console.log(`✅ Created regular user: ${regularUser.email}`);

  // Create sample deals
  console.log('🎯 Creating sample deals...');
  await prisma.deal.create({
    data: {
      venueId: '1',
      createdById: managerUser.id,
      title: 'Happy Hour Special',
      description: '2-for-1 cocktails every Tuesday and Wednesday from 5pm-7pm',
      discountPercentage: 50,
      validFrom: new Date(),
      validUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
      termsAndConditions: 'Cannot be combined with other offers'
    }
  });

  // Create sample events
  console.log('🎉 Creating sample events...');
  await prisma.event.create({
    data: {
      venueId: '3',
      createdById: managerUser.id,
      title: 'Live Acoustic Night',
      description: 'Join us for an intimate acoustic session with local artists',
      startTime: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // Next week
      endTime: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000 + 3 * 60 * 60 * 1000), // 3 hours later
      ticketPrice: 25.00,
      capacity: 100,
      eventType: 'Live Music'
    }
  });

  // Create sample posts
  console.log('📱 Creating sample posts...');
  await prisma.post.create({
    data: {
      venueId: '1',
      authorId: regularUser.id,
      content: 'Amazing night at Hey Chica! The Latin music was incredible 🎵💃',
      tags: ['latin', 'dancing', 'nightlife']
    }
  });

  console.log('🎉 Database seeded successfully!');
  console.log('\n📋 Test accounts:');
  console.log('Admin: admin@vibe.app / admin123');
  console.log('Manager: manager@vibe.app / manager123');
  console.log('User: user@vibe.app / user123');
}

main()
  .catch((e) => {
    console.error('❌ Seeding failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });