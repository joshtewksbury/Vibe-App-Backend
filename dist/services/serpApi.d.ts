export interface SerpPopularTimesData {
    venueId: string;
    venueName: string;
    popularTimes: any;
    lastUpdated: Date;
    source: string;
}
export declare class SerpAPIService {
    private apiKey;
    private baseURL;
    constructor();
    fetchPopularTimes(venueName: string, location: string): Promise<SerpPopularTimesData | null>;
    fetchBusinessHours(venueName: string, location: string): Promise<any>;
    generateEstimatedPopularTimes(venueCategory: string): any;
    private generateDayPattern;
    private calculateBarPopularity;
    private calculateRestaurantPopularity;
    private calculateCafePopularity;
    private calculateGenericPopularity;
}
//# sourceMappingURL=serpApi.d.ts.map