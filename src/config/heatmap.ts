export const heatmapConfig = {
  // KDE parameters by zoom level
  kdeBandwidth: (zoom: number): number => {
    // Increased base bandwidth for more visible heat at all zoom levels
    // σ at z=14: 300m (doubled from 150m), scale more gradually
    const base = 300;
    // Use gentler scaling: σ ∝ 2^(14−z) instead of 2^(16−z)
    return base * Math.pow(2, 14 - zoom);
  },

  tileSize: 256,
  maxZoom: 20, // Extended to support all zoom levels for better detail
  minZoom: 11,

  // Normalization parameters
  percentileClip: 0.95,
  gamma: 0.6, // Lower gamma = more contrast between hot and cold areas

  // Gaussian blur parameters - increased for better visibility across zoom levels
  gaussianBlurSigma: 8, // Increased from 4 for more visible heat blooms

  // Cache settings - shorter TTL for real-time updates
  cacheTTL: parseInt(process.env.HEATMAP_CACHE_TTL || '300'), // 5 minutes (300 seconds) for real-time feel
  tileUpdateInterval: parseInt(process.env.HEATMAP_UPDATE_INTERVAL || '300'), // 5 minutes for real-time updates

  // Performance settings
  maxVenuesPerTile: 1000, // Limit venues processed per tile

  // Database cache cleanup interval
  dbCacheCleanupInterval: 3600, // 1 hour - remove expired tiles from DB

  // Default bounds (can be overridden by user location)
  defaultBounds: {
    north: -27.35,
    south: -27.55,
    east: 153.15,
    west: 152.95
  }
};