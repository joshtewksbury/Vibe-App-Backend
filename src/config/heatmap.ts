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

  // Gaussian blur parameters - reduced for better performance
  gaussianBlurSigma: 4, // Reduced from 8 for faster rendering

  // Cache settings - longer cache for better performance
  cacheTTL: parseInt(process.env.HEATMAP_CACHE_TTL || '3600'), // 1 hour (was 5 min)
  tileUpdateInterval: parseInt(process.env.HEATMAP_UPDATE_INTERVAL || '300'), // 5 minutes

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