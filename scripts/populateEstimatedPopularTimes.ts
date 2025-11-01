import prisma from '../src/lib/prisma';

/**
 * Generate estimated popular times based on venue category and opening hours
 * This provides fallback data when Google/SerpAPI data is not available
 */
async function populateEstimatedPopularTimes() {
  console.log('🚀 Populating estimated popular times for all venues...\n');

  const venues = await prisma.venue.findMany({
    select: {
      id: true,
      name: true,
      category: true,
      openingHours: true
    }
  });

  console.log(`📊 Found ${venues.length} venues to update\n`);

  let successCount = 0;

  for (const venue of venues) {
    try {
      const popularTimes = generateEstimatedPopularTimes(venue.category);

      await prisma.venue.update({
        where: { id: venue.id },
        data: {
          popularTimes: popularTimes as any,
          popularTimesUpdated: new Date()
        }
      });

      console.log(`✅ ${venue.name}: Generated estimated popular times`);
      successCount++;
    } catch (error) {
      console.error(`❌ Error updating ${venue.name}:`, error);
    }
  }

  console.log(`\n✨ Complete! Updated ${successCount}/${venues.length} venues`);
  await prisma.$disconnect();
}

function generateEstimatedPopularTimes(venueCategory: string): any {
  // Generate intelligent estimates based on venue category
  // iOS expects format: { graph_results: { data: { "Monday": [0-100], ... } } }
  const dayNames = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  const data: any = {};

  dayNames.forEach((dayName, index) => {
    const dayOfWeek = index + 1; // Monday = 1, Sunday = 7
    // Extract just the scores from the pattern (iOS expects array of integers)
    const pattern = generateDayPattern(venueCategory, dayOfWeek);
    data[dayName] = pattern.map(entry => entry.busyness_score);
  });

  return {
    graph_results: {
      data
    }
  };
}

function generateDayPattern(category: string, dayOfWeek: number): Array<{time: string, busyness_score: number}> {
  const isWeekend = dayOfWeek === 5 || dayOfWeek === 6; // Friday or Saturday
  const isFriday = dayOfWeek === 5;
  const isSunday = dayOfWeek === 7;

  // Generate hourly pattern
  const hours = [];
  for (let hour = 0; hour < 24; hour++) {
    const timeStr = formatHourToTimeString(hour);
    let busynessScore = 0;

    // Nightlife venues (bars, nightclubs, etc.)
    if (category.toLowerCase().includes('bar') ||
        category.toLowerCase().includes('nightclub') ||
        category.toLowerCase().includes('club')) {

      if (hour >= 6 && hour < 11) {
        // Morning: closed/empty
        busynessScore = 0;
      } else if (hour >= 11 && hour < 17) {
        // Daytime: light activity
        busynessScore = isWeekend ? 25 : 15;
      } else if (hour >= 17 && hour < 20) {
        // Early evening: building up
        busynessScore = isWeekend ? 50 : 35;
      } else if (hour >= 20 && hour < 23) {
        // Prime time
        busynessScore = isWeekend ? 85 : 65;
      } else if (hour >= 23 || hour < 2) {
        // Late night peak
        busynessScore = isWeekend ? 90 : (isFriday ? 80 : 45);
      } else if (hour >= 2 && hour < 6) {
        // Very late/early morning
        busynessScore = isWeekend ? 40 : 10;
      }
    }
    // Restaurants
    else if (category.toLowerCase().includes('restaurant') ||
             category.toLowerCase().includes('dining')) {

      if (hour >= 6 && hour < 11) {
        // Breakfast time
        busynessScore = 30;
      } else if (hour >= 11 && hour < 15) {
        // Lunch peak
        busynessScore = 75;
      } else if (hour >= 15 && hour < 18) {
        // Afternoon lull
        busynessScore = 20;
      } else if (hour >= 18 && hour < 22) {
        // Dinner peak
        busynessScore = isWeekend ? 90 : 80;
      } else {
        // Closed
        busynessScore = 0;
      }
    }
    // Breweries/Pubs
    else if (category.toLowerCase().includes('brewery') ||
             category.toLowerCase().includes('pub') ||
             category.toLowerCase().includes('hotel')) {

      if (hour >= 6 && hour < 12) {
        busynessScore = 10;
      } else if (hour >= 12 && hour < 17) {
        busynessScore = isWeekend ? 60 : 40;
      } else if (hour >= 17 && hour < 21) {
        busynessScore = isWeekend ? 85 : 70;
      } else if (hour >= 21 && hour < 24) {
        busynessScore = isWeekend ? 90 : 75;
      } else if (hour < 2) {
        busynessScore = isWeekend ? 70 : 40;
      } else {
        busynessScore = 5;
      }
    }
    // Default pattern
    else {
      if (hour >= 18 && hour < 23) {
        busynessScore = isWeekend ? 75 : 55;
      } else if (hour >= 23 || hour < 2) {
        busynessScore = isWeekend ? 80 : 45;
      } else if (hour >= 11 && hour < 18) {
        busynessScore = 30;
      } else {
        busynessScore = 10;
      }
    }

    // Sunday adjustment (quieter overall)
    if (isSunday) {
      busynessScore = Math.floor(busynessScore * 0.7);
    }

    hours.push({
      time: timeStr,
      busyness_score: busynessScore
    });
  }

  return hours;
}

function formatHourToTimeString(hour: number): string {
  if (hour === 0) return '12 AM';
  if (hour < 12) return `${hour} AM`;
  if (hour === 12) return '12 PM';
  return `${hour - 12} PM`;
}

// Run the script
populateEstimatedPopularTimes().catch(console.error);
