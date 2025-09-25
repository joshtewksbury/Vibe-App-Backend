import { HeatMapVenue, GridResponse } from '../types/heatmap';
declare class HeatMapTileService {
    getTile(z: number, x: number, y: number, venues: HeatMapVenue[]): Promise<Buffer>;
    getGrid(z: number, x: number, y: number, venues: HeatMapVenue[]): Promise<GridResponse>;
    private renderPNG;
    generateTilesForRegion(venues: HeatMapVenue[], bounds: {
        north: number;
        south: number;
        east: number;
        west: number;
    }, zoom: number): Promise<{
        z: number;
        x: number;
        y: number;
        buffer: Buffer;
    }[]>;
    precomputeTiles(venues: HeatMapVenue[], bounds: {
        north: number;
        south: number;
        east: number;
        west: number;
    }, zoomLevels?: number[]): Promise<void>;
    getStats(): {
        cache: {
            hitRate: string;
            tileCacheSize: number;
            dataCacheSize: number;
            memoryEstimate: string;
            hits: number;
            misses: number;
            sets: number;
            clears: number;
        };
        kde: {
            globalMaxIntensity: number;
            lastUpdate: Date;
            hasCache: boolean;
        };
        config: {
            minZoom: number;
            maxZoom: number;
            tileSize: number;
            cacheTTL: number;
        };
    };
    clearCache(): void;
}
export declare const heatmapTileService: HeatMapTileService;
export {};
//# sourceMappingURL=heatmapTileService.d.ts.map