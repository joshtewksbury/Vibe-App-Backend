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
export declare class GooglePlacesService {
    private apiKey;
    private baseURL;
    constructor();
    fetchPlaceDetails(placeId: string): Promise<PlaceDetails | null>;
    searchPlaces(query: string, location?: {
        lat: number;
        lng: number;
    }): Promise<any[]>;
    findPlaceByName(name: string, location: string): Promise<string | null>;
    enrichVenueData(venue: any): Promise<any>;
    categorizeVenueType(types: string[]): string;
}
//# sourceMappingURL=googlePlaces.d.ts.map