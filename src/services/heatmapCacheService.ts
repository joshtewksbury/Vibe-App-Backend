import { heatmapConfig } from '../config/heatmap';

interface CacheItem<T> {
  data: T;
  timestamp: number;
  ttl: number;
}

class HeatMapCacheService {
  private tileCache = new Map<string, CacheItem<Buffer>>();
  private dataCache = new Map<string, CacheItem<any>>();
  private stats = {
    hits: 0,
    misses: 0,
    sets: 0,
    clears: 0
  };

  private isExpired<T>(item: CacheItem<T>): boolean {
    return Date.now() - item.timestamp > item.ttl;
  }

  private cleanupExpired(): void {
    const now = Date.now();

    // Clean tile cache
    for (const [key, item] of this.tileCache.entries()) {
      if (now - item.timestamp > item.ttl) {
        this.tileCache.delete(key);
      }
    }

    // Clean data cache
    for (const [key, item] of this.dataCache.entries()) {
      if (now - item.timestamp > item.ttl) {
        this.dataCache.delete(key);
      }
    }
  }

  getTile(key: string): Buffer | null {
    this.cleanupExpired();

    const item = this.tileCache.get(key);
    if (!item || this.isExpired(item)) {
      this.stats.misses++;
      return null;
    }

    this.stats.hits++;
    return item.data;
  }

  setTile(key: string, data: Buffer, ttl: number = heatmapConfig.cacheTTL * 1000): void {
    this.tileCache.set(key, {
      data,
      timestamp: Date.now(),
      ttl
    });
    this.stats.sets++;
  }

  getData(key: string): any | null {
    this.cleanupExpired();

    const item = this.dataCache.get(key);
    if (!item || this.isExpired(item)) {
      this.stats.misses++;
      return null;
    }

    this.stats.hits++;
    return item.data;
  }

  setData(key: string, data: any, ttl: number = heatmapConfig.cacheTTL * 1000): void {
    this.dataCache.set(key, {
      data,
      timestamp: Date.now(),
      ttl
    });
    this.stats.sets++;
  }

  clear(): void {
    this.tileCache.clear();
    this.dataCache.clear();
    this.stats.clears++;
  }

  clearTiles(): void {
    this.tileCache.clear();
  }

  clearData(): void {
    this.dataCache.clear();
  }

  getStats() {
    const hitRate = this.stats.hits + this.stats.misses > 0
      ? (this.stats.hits / (this.stats.hits + this.stats.misses) * 100).toFixed(2)
      : '0.00';

    return {
      ...this.stats,
      hitRate: `${hitRate}%`,
      tileCacheSize: this.tileCache.size,
      dataCacheSize: this.dataCache.size,
      memoryEstimate: this.getMemoryEstimate()
    };
  }

  private getMemoryEstimate(): string {
    let totalBytes = 0;

    // Estimate tile cache memory
    for (const item of this.tileCache.values()) {
      totalBytes += item.data.length;
    }

    // Estimate data cache memory (rough approximation)
    totalBytes += this.dataCache.size * 1000; // Assume ~1KB per data item

    const mb = totalBytes / (1024 * 1024);
    return `${mb.toFixed(2)} MB`;
  }

  // Periodic cleanup - should be called regularly
  performMaintenance(): void {
    this.cleanupExpired();

    // If cache is getting too large, clear older items
    const maxTileItems = 1000; // Adjust based on memory constraints
    const maxDataItems = 5000;

    if (this.tileCache.size > maxTileItems) {
      const entries = Array.from(this.tileCache.entries());
      entries.sort((a, b) => a[1].timestamp - b[1].timestamp);
      const toDelete = entries.slice(0, Math.floor(maxTileItems * 0.2)); // Remove oldest 20%
      toDelete.forEach(([key]) => this.tileCache.delete(key));
    }

    if (this.dataCache.size > maxDataItems) {
      const entries = Array.from(this.dataCache.entries());
      entries.sort((a, b) => a[1].timestamp - b[1].timestamp);
      const toDelete = entries.slice(0, Math.floor(maxDataItems * 0.2)); // Remove oldest 20%
      toDelete.forEach(([key]) => this.dataCache.delete(key));
    }
  }
}

export const heatmapCacheService = new HeatMapCacheService();

// Set up periodic maintenance
setInterval(() => {
  heatmapCacheService.performMaintenance();
}, 5 * 60 * 1000); // Every 5 minutes