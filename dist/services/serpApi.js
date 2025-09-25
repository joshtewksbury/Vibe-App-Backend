"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SerpAPIService = void 0;
const axios_1 = __importDefault(require("axios"));
class SerpAPIService {
    constructor() {
        this.baseURL = 'https://serpapi.com/search';
        this.apiKey = process.env.SERP_API_KEY || '';
        if (!this.apiKey) {
            console.warn('SerpAPI key not configured');
        }
    }
    async fetchPopularTimes(venueName, location) {
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
            const response = await axios_1.default.get(this.baseURL, { params });
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
        }
        catch (error) {
            console.error('SerpAPI error:', error);
            return null;
        }
    }
    async fetchBusinessHours(venueName, location) {
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
            const response = await axios_1.default.get(this.baseURL, { params });
            if (response.data.local_results && response.data.local_results.length > 0) {
                const result = response.data.local_results[0];
                return result.hours || null;
            }
            return null;
        }
        catch (error) {
            console.error('SerpAPI business hours error:', error);
            return null;
        }
    }
    generateEstimatedPopularTimes(venueCategory) {
        // Generate intelligent estimates based on venue category
        const dayNames = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
        const weeklyData = {};
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
    generateDayPattern(category, dayOfWeek) {
        const isWeekend = dayOfWeek === 6 || dayOfWeek === 7; // Friday or Saturday
        const isFriday = dayOfWeek === 6;
        const hourlyData = Array(24).fill(0);
        const categoryLower = category.toLowerCase();
        for (let hour = 0; hour < 24; hour++) {
            let popularity = 0;
            if (categoryLower.includes('bar') || categoryLower.includes('nightclub')) {
                popularity = this.calculateBarPopularity(hour, isWeekend, isFriday);
            }
            else if (categoryLower.includes('restaurant')) {
                popularity = this.calculateRestaurantPopularity(hour, isWeekend);
            }
            else if (categoryLower.includes('cafe')) {
                popularity = this.calculateCafePopularity(hour, isWeekend);
            }
            else {
                popularity = this.calculateGenericPopularity(hour, isWeekend);
            }
            hourlyData[hour] = Math.max(0, Math.min(100, popularity));
        }
        return hourlyData;
    }
    calculateBarPopularity(hour, isWeekend, isFriday) {
        switch (hour) {
            case 0:
            case 1:
            case 2:
            case 3:
            case 4:
            case 5:
                return isWeekend || isFriday ? 30 : 10;
            case 6:
            case 7:
            case 8:
            case 9:
            case 10:
            case 11:
                return 5;
            case 12:
            case 13:
            case 14:
            case 15:
            case 16:
                return isWeekend ? 35 : 20;
            case 17:
            case 18:
            case 19:
                return isWeekend ? 65 : 50;
            case 20:
            case 21:
            case 22:
                return isWeekend || isFriday ? 90 : 75;
            case 23:
                return isWeekend || isFriday ? 95 : 70;
            default:
                return 15;
        }
    }
    calculateRestaurantPopularity(hour, isWeekend) {
        switch (hour) {
            case 0:
            case 1:
            case 2:
            case 3:
            case 4:
            case 5:
            case 6:
                return 5;
            case 7:
            case 8:
            case 9:
                return isWeekend ? 45 : 35;
            case 10:
            case 11:
                return 20;
            case 12:
            case 13:
            case 14:
                return 85;
            case 15:
            case 16:
            case 17:
                return 30;
            case 18:
            case 19:
            case 20:
                return isWeekend ? 95 : 80;
            case 21:
            case 22:
                return isWeekend ? 65 : 45;
            default:
                return 10;
        }
    }
    calculateCafePopularity(hour, isWeekend) {
        switch (hour) {
            case 0:
            case 1:
            case 2:
            case 3:
            case 4:
            case 5:
            case 6:
                return 5;
            case 7:
            case 8:
            case 9:
                return isWeekend ? 60 : 80;
            case 10:
            case 11:
                return 50;
            case 12:
            case 13:
            case 14:
                return 65;
            case 15:
            case 16:
            case 17:
                return 45;
            case 18:
            case 19:
            case 20:
                return 30;
            default:
                return 10;
        }
    }
    calculateGenericPopularity(hour, isWeekend) {
        if (hour >= 0 && hour <= 7)
            return 15;
        if (hour >= 8 && hour <= 11)
            return 45;
        if (hour >= 12 && hour <= 17)
            return 70;
        if (hour >= 18 && hour <= 22)
            return isWeekend ? 80 : 60;
        return 25;
    }
}
exports.SerpAPIService = SerpAPIService;
//# sourceMappingURL=serpApi.js.map