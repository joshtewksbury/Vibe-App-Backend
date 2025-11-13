import prisma from './src/lib/prisma';

// Reasonable default hours by venue category
const defaultHoursByCategory: Record<string, any> = {
  'Brewery': {
    monday: '12pm-10pm',
    tuesday: '12pm-10pm',
    wednesday: '12pm-10pm',
    thursday: '12pm-11pm',
    friday: '12pm-12am',
    saturday: '11am-12am',
    sunday: '11am-10pm'
  },
  'Pub': {
    monday: '10am-12am',
    tuesday: '10am-12am',
    wednesday: '10am-12am',
    thursday: '10am-1am',
    friday: '10am-2am',
    saturday: '10am-2am',
    sunday: '10am-12am'
  },
  'Bar': {
    monday: 'Closed',
    tuesday: '5pm-12am',
    wednesday: '5pm-12am',
    thursday: '5pm-1am',
    friday: '5pm-3am',
    saturday: '5pm-3am',
    sunday: '5pm-12am'
  },
  'Nightclub': {
    monday: 'Closed',
    tuesday: 'Closed',
    wednesday: 'Closed',
    thursday: '10pm-3am',
    friday: '10pm-5am',
    saturday: '10pm-5am',
    sunday: 'Closed'
  },
  'Hotel': {
    monday: '10am-12am',
    tuesday: '10am-12am',
    wednesday: '10am-12am',
    thursday: '10am-1am',
    friday: '10am-2am',
    saturday: '10am-2am',
    sunday: '10am-12am'
  }
};

// Manually verified hours for specific popular venues
const verifiedHours: Record<string, any> = {
  'Breakfast Creek Hotel': {
    monday: '10am-2am',
    tuesday: '10am-2am',
    wednesday: '10am-2am',
    thursday: '10am-2am',
    friday: '10am-2am',
    saturday: '10am-2am',
    sunday: '10am-2am'
  },
  'The Caxton Hotel': {
    monday: '11am-12am',
    tuesday: '11am-12am',
    wednesday: '11am-1am',
    thursday: '11am-1am',
    friday: '11am-3am',
    saturday: '11am-3am',
    sunday: '11am-12am'
  },
  'Netherworld': {
    monday: 'Closed',
    tuesday: '12pm-11pm',
    wednesday: '12pm-11pm',
    thursday: '12pm-11pm',
    friday: '12pm-1am',
    saturday: '12pm-1am',
    sunday: '12pm-11pm'
  },
  'Regatta Hotel': {
    monday: '6:30am-1am',
    tuesday: '6:30am-3am',
    wednesday: '6:30am-3am',
    thursday: '6:30am-3am',
    friday: '6:30am-3am',
    saturday: '6:30am-3am',
    sunday: '6:30am-1am'
  }
};

async function updateVenueHours() {
  try {
    const venues = await prisma.venue.findMany({
      select: { id: true, name: true, category: true }
    });

    let updatedCount = 0;

    for (const venue of venues) {
      let hours = null;

      // First check if we have verified hours for this specific venue
      if (verifiedHours[venue.name]) {
        hours = verifiedHours[venue.name];
        console.log(`✅ Using verified hours for ${venue.name}`);
      }
      // Otherwise use category defaults
      else if (defaultHoursByCategory[venue.category]) {
        hours = defaultHoursByCategory[venue.category];
        console.log(`📋 Using ${venue.category} defaults for ${venue.name}`);
      }

      if (hours) {
        await prisma.venue.update({
          where: { id: venue.id },
          data: { openingHours: hours }
        });
        updatedCount++;
      }
    }

    console.log(`\n✅ Updated ${updatedCount} venues with realistic opening hours`);
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

updateVenueHours();
