import { Color } from '../types/heatmap';

export class ColorMap {
  // Updated heatmap colors to match venue status indicators:
  // 0.0-0.3 = QUIET (blue)
  // 0.3-0.6 = MODERATE (cyan/teal)
  // 0.6-0.8 = BUSY (yellow/orange)
  // 0.8-1.0 = VERY_BUSY (red)
  // Increased alpha values for better visibility
  private static readonly HEAT_COLORS = [
    { t: 0.0, r: 0, g: 0, b: 0, a: 0 },           // Transparent (no activity)
    { t: 0.1, r: 70, g: 130, b: 255, a: 140 },    // Light blue (minimal activity) - increased from 60
    { t: 0.3, r: 0, g: 150, b: 255, a: 180 },     // Blue (QUIET - matches status) - increased from 120
    { t: 0.5, r: 0, g: 200, b: 200, a: 200 },     // Cyan (MODERATE - matches status) - increased from 160
    { t: 0.7, r: 255, g: 200, b: 0, a: 220 },     // Yellow (BUSY - matches status) - increased from 200
    { t: 0.85, r: 255, g: 120, b: 0, a: 240 },    // Orange (approaching VERY_BUSY) - increased from 230
    { t: 1.0, r: 255, g: 50, b: 50, a: 255 }      // Red (VERY_BUSY - matches status)
  ];

  static getColor(intensity: number): Color {
    intensity = Math.max(0, Math.min(1, intensity));

    for (let i = 1; i < this.HEAT_COLORS.length; i++) {
      if (intensity <= this.HEAT_COLORS[i].t) {
        const prev = this.HEAT_COLORS[i - 1];
        const curr = this.HEAT_COLORS[i];
        const t = (intensity - prev.t) / (curr.t - prev.t);

        return {
          r: Math.floor(prev.r + (curr.r - prev.r) * t),
          g: Math.floor(prev.g + (curr.g - prev.g) * t),
          b: Math.floor(prev.b + (curr.b - prev.b) * t),
          a: Math.floor(prev.a + (curr.a - prev.a) * t)
        };
      }
    }

    return this.HEAT_COLORS[this.HEAT_COLORS.length - 1];
  }
}