import axios from 'axios';

export interface PlaceDetails {
  name: string;
  rating?: number;
  types: string[];
  formatted_address?: string;
  business_status?: string;
  opening_hours?: {
    open_now?: boolean;
    weekday_text?: string[];
  };
}

export interface PlaceDetailsResponse {
  result?: PlaceDetails;
  status: string;
}

interface PlaceSearchResponse {
  results?: Array<{
    place_id?: string;
    name?: string;
    formatted_address?: string;
    geometry?: {
      location?: {
        lat: number;
        lng: number;
      };
    };
  }>;
  status: string;
}

export class GooglePlacesService {
  private apiKey: string;
  private baseURL = 'https://maps.googleapis.com/maps/api/place';

  constructor() {
    this.apiKey = process.env.GOOGLE_PLACES_API_KEY || '';
    if (!this.apiKey) {
      console.warn('Google Places API key not configured');
    }
  }

  async fetchPlaceDetails(placeId: string): Promise<PlaceDetails | null> {
    if (!this.apiKey) {
      console.warn('Google Places API key not configured, skipping');
      return null;
    }

    try {
      const url = `${this.baseURL}/details/json`;
      const params = {
        place_id: placeId,
        fields: 'name,rating,opening_hours,types,formatted_address,business_status',
        key: this.apiKey
      };

      const response = await axios.get<PlaceDetailsResponse>(url, { params });

      if (response.data.status === 'OK' && response.data.result) {
        return response.data.result;
      }

      console.warn('Google Places API error:', response.data.status);
      return null;
    } catch (error) {
      console.error('Google Places API error:', error);
      return null;
    }
  }

  async searchPlaces(query: string, location?: { lat: number; lng: number }): Promise<any[]> {
    if (!this.apiKey) {
      console.warn('Google Places API key not configured, skipping');
      return [];
    }

    try {
      const url = `${this.baseURL}/textsearch/json`;
      const params: any = {
        query,
        key: this.apiKey
      };

      if (location) {
        params.location = `${location.lat},${location.lng}`;
        params.radius = 5000; // 5km radius
      }

      const response = await axios.get<PlaceSearchResponse>(url, { params });

      if (response.data.status === 'OK') {
        return response.data.results || [];
      }

      console.warn('Google Places search error:', response.data.status);
      return [];
    } catch (error) {
      console.error('Google Places search error:', error);
      return [];
    }
  }

  async findPlaceByName(name: string, location: string): Promise<string | null> {
    if (!this.apiKey) {
      return null;
    }

    try {
      const query = `${name} ${location}`;
      const places = await this.searchPlaces(query);

      if (places.length > 0) {
        // Return the place_id of the first (most relevant) result
        return places[0].place_id || null;
      }

      return null;
    } catch (error) {
      console.error('Error finding place by name:', error);
      return null;
    }
  }

  async enrichVenueData(venue: any): Promise<any> {
    if (!venue.placeId && venue.name && venue.location) {
      // Try to find place ID if we don't have one
      const placeId = await this.findPlaceByName(venue.name, venue.location);
      if (placeId) {
        venue.placeId = placeId;
      }
    }

    if (venue.placeId) {
      const placeDetails = await this.fetchPlaceDetails(venue.placeId);
      if (placeDetails) {
        // Merge Google Places data with venue data
        return {
          ...venue,
          googleRating: placeDetails.rating,
          businessStatus: placeDetails.business_status,
          googleOpeningHours: placeDetails.opening_hours,
          googleTypes: placeDetails.types,
          googleAddress: placeDetails.formatted_address
        };
      }
    }

    return venue;
  }

  categorizeVenueType(types: string[]): string {
    for (const type of types) {
      switch (type.toLowerCase()) {
        case 'bar':
        case 'night_club':
        case 'liquor_store':
          return 'Bar';
        case 'restaurant':
        case 'food':
        case 'meal_takeaway':
          return 'Restaurant';
        case 'cafe':
        case 'coffee':
          return 'Cafe';
        case 'gym':
        case 'fitness':
          return 'Gym';
        case 'shopping_mall':
        case 'store':
          return 'Retail';
        default:
          continue;
      }
    }
    return 'Other';
  }
}