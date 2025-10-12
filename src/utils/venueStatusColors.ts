/**
 * Venue Status Color Mapping
 *
 * This utility provides consistent color mapping for venue busy status
 * across the entire application (API responses, heatmaps, markers, etc.)
 */

export interface StatusColor {
  hex: string;
  rgb: { r: number; g: number; b: number };
  name: string;
}

export const VENUE_STATUS_COLORS: Record<string, StatusColor> = {
  QUIET: {
    hex: '#0096FF',
    rgb: { r: 0, g: 150, b: 255 },
    name: 'Blue'
  },
  MODERATE: {
    hex: '#00C8C8',
    rgb: { r: 0, g: 200, b: 200 },
    name: 'Cyan'
  },
  BUSY: {
    hex: '#FFC800',
    rgb: { r: 255, g: 200, b: 0 },
    name: 'Yellow'
  },
  VERY_BUSY: {
    hex: '#FF3232',
    rgb: { r: 255, g: 50, b: 50 },
    name: 'Red'
  },
  CLOSED: {
    hex: '#808080',
    rgb: { r: 128, g: 128, b: 128 },
    name: 'Gray'
  }
};

/**
 * Calculate venue status based on occupancy percentage
 */
export function calculateVenueStatus(currentOccupancy: number, capacity: number): string {
  if (capacity === 0 || currentOccupancy === 0) {
    return 'QUIET';
  }

  const occupancyPercentage = currentOccupancy / capacity;

  if (occupancyPercentage < 0.3) return 'QUIET';
  if (occupancyPercentage < 0.6) return 'MODERATE';
  if (occupancyPercentage < 0.8) return 'BUSY';
  return 'VERY_BUSY';
}

/**
 * Get color for a specific status
 */
export function getStatusColor(status: string): StatusColor {
  return VENUE_STATUS_COLORS[status] || VENUE_STATUS_COLORS.QUIET;
}

/**
 * Get color for occupancy percentage
 */
export function getOccupancyColor(currentOccupancy: number, capacity: number): StatusColor {
  const status = calculateVenueStatus(currentOccupancy, capacity);
  return getStatusColor(status);
}
