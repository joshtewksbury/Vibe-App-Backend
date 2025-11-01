export interface SerpPopularTimesData {
    venueId: string;
    venueName: string;
    popularTimes: any;
    lastUpdated: Date;
    source: string;
}
export interface SerpLiveBusynessData {
    venueId: string;
    venueName: string;
    liveInfo: string;
    timeSpent: string;
    busynessScore: number;
    timestamp: Date;
    source: 'serp_live' | 'serp_estimated';
}
export declare class SerpAPIService {
    private apiKey;
    private baseURL;
    constructor();
    fetchPopularTimes(venueName: string, location: string): Promise<SerpPopularTimesData | null>;
    fetchBusinessHours(venueName: string, location: string): Promise<any>;
    /**
     * Fetch live busyness data using Google Place ID
     * This provides real-time crowd information from Google Maps
     */
    fetchLiveBusyness(placeId: string, venueName: string): Promise<SerpLiveBusynessData | null>;
    /**
     * Extract numeric busyness score from text descriptions
     * Maps descriptive text to 0-100 scale
     */
    private extractBusynessScore;
    /**
     * Fetch both live busyness and historical popular times in one call
     */
    fetchCompleteBusynessData(placeId: string, venueName: string): Promise<{
        liveData: SerpLiveBusynessData | null;
        popularTimes: any;
    }>;
    generateEstimatedPopularTimes(venueCategory: string): any;
    private generateDayPattern;
    private calculateBarPopularity;
    private calculateRestaurantPopularity;
    private calculateCafePopularity;
    private calculateGenericPopularity;
}
//# sourceMappingURL=serpApi.d.ts.map