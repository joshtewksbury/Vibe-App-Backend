"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.GooglePlacesService = void 0;
const axios_1 = __importDefault(require("axios"));
class GooglePlacesService {
    constructor() {
        this.baseURL = 'https://maps.googleapis.com/maps/api/place';
        this.apiKey = process.env.GOOGLE_PLACES_API_KEY || '';
        if (!this.apiKey) {
            console.warn('Google Places API key not configured');
        }
    }
    async fetchPlaceDetails(placeId) {
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
            const response = await axios_1.default.get(url, { params });
            if (response.data.status === 'OK' && response.data.result) {
                return response.data.result;
            }
            console.warn('Google Places API error:', response.data.status);
            return null;
        }
        catch (error) {
            console.error('Google Places API error:', error);
            return null;
        }
    }
    async searchPlaces(query, location) {
        if (!this.apiKey) {
            console.warn('Google Places API key not configured, skipping');
            return [];
        }
        try {
            const url = `${this.baseURL}/textsearch/json`;
            const params = {
                query,
                key: this.apiKey
            };
            if (location) {
                params.location = `${location.lat},${location.lng}`;
                params.radius = 5000; // 5km radius
            }
            const response = await axios_1.default.get(url, { params });
            if (response.data.status === 'OK') {
                return response.data.results || [];
            }
            console.warn('Google Places search error:', response.data.status);
            return [];
        }
        catch (error) {
            console.error('Google Places search error:', error);
            return [];
        }
    }
    async findPlaceByName(name, location) {
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
        }
        catch (error) {
            console.error('Error finding place by name:', error);
            return null;
        }
    }
    async enrichVenueData(venue) {
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
    categorizeVenueType(types) {
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
exports.GooglePlacesService = GooglePlacesService;
//# sourceMappingURL=googlePlaces.js.map