import { Color } from '../types/heatmap';

export class ColorMap {
  private static readonly HEAT_COLORS = [
    { t: 0.0, r: 0, g: 0, b: 0, a: 0 },
    { t: 0.2, r: 0, g: 0, b: 255, a: 80 },
    { t: 0.4, r: 0, g: 255, b: 255, a: 120 },
    { t: 0.6, r: 0, g: 255, b: 0, a: 160 },
    { t: 0.8, r: 255, g: 255, b: 0, a: 200 },
    { t: 1.0, r: 255, g: 0, b: 0, a: 255 }
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