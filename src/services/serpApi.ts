import axios from 'axios';

export interface SerpPopularTimesData {
  venueId: string;
  venueName: string;
  popularTimes: any;
  lastUpdated: Date;
  source: string;
}

// Live busyness data from SerpAPI
export interface SerpLiveBusynessData {
  venueId: string;
  venueName: string;
  liveInfo: string;          // e.g., "Now: Usually not too busy"
  timeSpent: string;          // e.g., "People typically spend 15 min to 1 hr here"
  busynessScore: number;      // 0-100
  timestamp: Date;
  source: 'serp_live' | 'serp_estimated';
}

interface SerpAPIResponse {
  local_results?: Array<{
    title?: string;
    address?: string;
    hours?: string[];
    popular_times?: any;
    open_state?: {
      is_open?: boolean;
      text?: string;
    };
  }>;
  status?: string;
}

interface SerpPlaceDetailsResponse {
  place_results?: {
    title?: string;
    popular_times?: {
      live_hash?: {
        info?: string;        // "Now: Usually not too busy"
        time_spent?: string;  // "People typically spend 15 min to 1 hr here"
      };
      graph_results?: any;
    };
    rating?: number;
    reviews?: number;
  };
  search_metadata?: {
    status?: string;
  };
}

export class SerpAPIService {
  private apiKey: string;
  private baseURL = 'https://serpapi.com/search';

  constructor() {
    this.apiKey = process.env.SERP_API_KEY || '';
    if (!this.apiKey) {
      console.warn('SerpAPI key not configured');
    }
  }

  async fetchPopularTimes(venueName: string, location: string): Promise<SerpPopularTimesData | null> {
    if (!this.apiKey) {
      console.warn('SerpAPI key not configured, skipping');
      return null;
    }

    try {
      const searchQuery = `${venueName} ${location} popular times`;

      const params = {
        engine: 'google_maps',
        q: searchQuery,
        type: 'search',
        api_key: this.apiKey
      };

      const response = await axios.get<SerpAPIResponse>(this.baseURL, { params });

      if (response.data.local_results && response.data.local_results.length > 0) {
        const result = response.data.local_results[0];

        if (result.popular_times) {
          return {
            venueId: '', // Will be set by caller
            venueName,
            popularTimes: result.popular_times,
            lastUpdated: new Date(),
            source: 'SerpAPI'
          };
        }
      }

      return null;
    } catch (error) {
      console.error('SerpAPI error:', error);
      return null;
    }
  }

  async fetchBusinessHours(venueName: string, location: string): Promise<any> {
    if (!this.apiKey) {
      console.warn('SerpAPI key not configured, skipping');
      return null;
    }

    try {
      const searchQuery = `${venueName} ${location} hours business hours`;

      const params = {
        engine: 'google',
        q: searchQuery,
        api_key: this.apiKey
      };

      const response = await axios.get<SerpAPIResponse>(this.baseURL, { params });

      if (response.data.local_results && response.data.local_results.length > 0) {
        const result = response.data.local_results[0];
        return result.hours || null;
      }

      return null;
    } catch (error) {
      console.error('SerpAPI business hours error:', error);
      return null;
    }
  }

  /**
   * Fetch live busyness data using Google Place ID
   * This provides real-time crowd information from Google Maps
   */
  async fetchLiveBusyness(placeId: string, venueName: string): Promise<SerpLiveBusynessData | null> {
    if (!this.apiKey) {
      console.warn('SerpAPI key not configured, skipping live busyness fetch');
      return null;
    }

    try {
      const params = {
        engine: 'google_maps',
        type: 'place',
        place_id: placeId,
        api_key: this.apiKey
      };

      console.log(`📡 Fetching live busyness for ${venueName} (${placeId})...`);
      const response = await axios.get<SerpPlaceDetailsResponse>(this.baseURL, { params });

      const placeResults = response.data.place_results;
      const liveHash = placeResults?.popular_times?.live_hash;

      if (liveHash && liveHash.info) {
        // Extract busyness score from the live info text
        const busynessScore = this.extractBusynessScore(liveHash.info);

        return {
          venueId: '', // Will be set by caller
          venueName,
          liveInfo: liveHash.info,
          timeSpent: liveHash.time_spent || '',
          busynessScore,
          timestamp: new Date(),
          source: 'serp_live'
        };
      }

      console.log(`⚠️  No live busyness data available for ${venueName}`);
      return null;
    } catch (error) {
      console.error(`❌ SerpAPI live busyness error for ${venueName}:`, error);
      return null;
    }
  }

  /**
   * Extract numeric busyness score from text descriptions
   * Maps descriptive text to 0-100 scale
   */
  private extractBusynessScore(liveInfo: string): number {
    const info = liveInfo.toLowerCase();

    // Map text descriptions to scores
    if (info.includes('as busy as it gets') || info.includes('usually as busy')) {
      return 95;
    } else if (info.includes('busier than usual')) {
      return 85;
    } else if (info.includes('a little busy')) {
      return 65;
    } else if (info.includes('not too busy')) {
      return 35;
    } else if (info.includes('quieter than usual')) {
      return 20;
    } else if (info.includes('not busy') || info.includes('quiet')) {
      return 15;
    }

    // Default moderate busyness
    return 50;
  }

  /**
   * Fetch both live busyness and historical popular times in one call
   */
  async fetchCompleteBusynessData(placeId: string, venueName: string): Promise<{
    liveData: SerpLiveBusynessData | null;
    popularTimes: any;
  }> {
    if (!this.apiKey) {
      console.warn('SerpAPI key not configured, skipping');
      return { liveData: null, popularTimes: null };
    }

    try {
      const params = {
        engine: 'google_maps',
        type: 'place',
        place_id: placeId,
        api_key: this.apiKey
      };

      const response = await axios.get<SerpPlaceDetailsResponse>(this.baseURL, { params });
      const placeResults = response.data.place_results;

      // Extract live data
      let liveData: SerpLiveBusynessData | null = null;
      const liveHash = placeResults?.popular_times?.live_hash;

      if (liveHash && liveHash.info) {
        liveData = {
          venueId: '',
          venueName,
          liveInfo: liveHash.info,
          timeSpent: liveHash.time_spent || '',
          busynessScore: this.extractBusynessScore(liveHash.info),
          timestamp: new Date(),
          source: 'serp_live'
        };
      }

      // Extract popular times
      const popularTimes = placeResults?.popular_times || null;

      return { liveData, popularTimes };
    } catch (error) {
      console.error(`❌ SerpAPI complete busyness error for ${venueName}:`, error);
      return { liveData: null, popularTimes: null };
    }
  }

  generateEstimatedPopularTimes(venueCategory: string): any {
    // Generate intelligent estimates based on venue category
    const dayNames = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
    const weeklyData: Record<string, number[]> = {};

    dayNames.forEach((dayName, index) => {
      const dayOfWeek = index + 1;
      weeklyData[dayName] = this.generateDayPattern(venueCategory, dayOfWeek);
    });

    return {
      graph_results: {
        data: weeklyData
      }
    };
  }

  private generateDayPattern(category: string, dayOfWeek: number): number[] {
    const isWeekend = dayOfWeek === 6 || dayOfWeek === 7; // Friday or Saturday
    const isFriday = dayOfWeek === 6;
    const hourlyData: number[] = Array(24).fill(0);

    const categoryLower = category.toLowerCase();

    for (let hour = 0; hour < 24; hour++) {
      let popularity = 0;

      if (categoryLower.includes('bar') || categoryLower.includes('nightclub')) {
        popularity = this.calculateBarPopularity(hour, isWeekend, isFriday);
      } else if (categoryLower.includes('restaurant')) {
        popularity = this.calculateRestaurantPopularity(hour, isWeekend);
      } else if (categoryLower.includes('cafe')) {
        popularity = this.calculateCafePopularity(hour, isWeekend);
      } else {
        popularity = this.calculateGenericPopularity(hour, isWeekend);
      }

      hourlyData[hour] = Math.max(0, Math.min(100, popularity));
    }

    return hourlyData;
  }

  private calculateBarPopularity(hour: number, isWeekend: boolean, isFriday: boolean): number {
    switch (hour) {
      case 0: case 1: case 2: case 3: case 4: case 5:
        return isWeekend || isFriday ? 30 : 10;
      case 6: case 7: case 8: case 9: case 10: case 11:
        return 5;
      case 12: case 13: case 14: case 15: case 16:
        return isWeekend ? 35 : 20;
      case 17: case 18: case 19:
        return isWeekend ? 65 : 50;
      case 20: case 21: case 22:
        return isWeekend || isFriday ? 90 : 75;
      case 23:
        return isWeekend || isFriday ? 95 : 70;
      default:
        return 15;
    }
  }

  private calculateRestaurantPopularity(hour: number, isWeekend: boolean): number {
    switch (hour) {
      case 0: case 1: case 2: case 3: case 4: case 5: case 6:
        return 5;
      case 7: case 8: case 9:
        return isWeekend ? 45 : 35;
      case 10: case 11:
        return 20;
      case 12: case 13: case 14:
        return 85;
      case 15: case 16: case 17:
        return 30;
      case 18: case 19: case 20:
        return isWeekend ? 95 : 80;
      case 21: case 22:
        return isWeekend ? 65 : 45;
      default:
        return 10;
    }
  }

  private calculateCafePopularity(hour: number, isWeekend: boolean): number {
    switch (hour) {
      case 0: case 1: case 2: case 3: case 4: case 5: case 6:
        return 5;
      case 7: case 8: case 9:
        return isWeekend ? 60 : 80;
      case 10: case 11:
        return 50;
      case 12: case 13: case 14:
        return 65;
      case 15: case 16: case 17:
        return 45;
      case 18: case 19: case 20:
        return 30;
      default:
        return 10;
    }
  }

  private calculateGenericPopularity(hour: number, isWeekend: boolean): number {
    if (hour >= 0 && hour <= 7) return 15;
    if (hour >= 8 && hour <= 11) return 45;
    if (hour >= 12 && hour <= 17) return 70;
    if (hour >= 18 && hour <= 22) return isWeekend ? 80 : 60;
    return 25;
  }
}