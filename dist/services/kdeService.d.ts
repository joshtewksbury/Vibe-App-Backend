import { HeatMapVenue, GridCell } from '../types/heatmap';
declare class KDEService {
    private globalMaxIntensity;
    private lastVenueUpdate;
    private computeGlobalMaxIntensity;
    computeIntensity(px: number, py: number, venues: HeatMapVenue[], bandwidth: number): number;
    computeTileIntensities(z: number, x: number, y: number, venues: HeatMapVenue[]): Float32Array;
    private normalizeWithGlobalMax;
    computeGrid(z: number, x: number, y: number, venues: HeatMapVenue[], gridSize?: number): GridCell[];
    clearCache(): void;
    getStats(): {
        globalMaxIntensity: number;
        lastUpdate: Date;
        hasCache: boolean;
    };
}
export declare const kdeService: KDEService;
export {};
//# sourceMappingURL=kdeService.d.ts.map