declare class HeatMapCacheService {
    private tileCache;
    private dataCache;
    private stats;
    private isExpired;
    private cleanupExpired;
    getTile(key: string): Buffer | null;
    setTile(key: string, data: Buffer, ttl?: number): void;
    getData(key: string): any | null;
    setData(key: string, data: any, ttl?: number): void;
    clear(): void;
    clearTiles(): void;
    clearData(): void;
    getStats(): {
        hitRate: string;
        tileCacheSize: number;
        dataCacheSize: number;
        memoryEstimate: string;
        hits: number;
        misses: number;
        sets: number;
        clears: number;
    };
    private getMemoryEstimate;
    performMaintenance(): void;
}
export declare const heatmapCacheService: HeatMapCacheService;
export {};
//# sourceMappingURL=heatmapCacheService.d.ts.map