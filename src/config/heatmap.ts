export const heatmapConfig = {
  // KDE parameters by zoom level
  kdeBandwidth: (zoom: number): number => {
    // σ at z=16: 150m, scale as σ ∝ 2^(16−z)
    const base = 150;
    return base * Math.pow(2, 16 - zoom);
  },

  tileSize: 256,
  maxZoom: 18,
  minZoom: 11,

  // Normalization parameters
  percentileClip: 0.95,
  gamma: 0.8,

  // Cache settings
  cacheTTL: parseInt(process.env.HEATMAP_CACHE_TTL || '300'), // 5 minutes
  tileUpdateInterval: parseInt(process.env.HEATMAP_UPDATE_INTERVAL || '120'), // 2 minutes

  // Performance settings
  maxVenuesPerTile: 1000, // Limit venues processed per tile

  // Default bounds (can be overridden by user location)
  defaultBounds: {
    north: -27.35,
    south: -27.55,
    east: 153.15,
    west: 152.95
  }
};