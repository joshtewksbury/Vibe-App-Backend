"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ColorMap = void 0;
class ColorMap {
    static getColor(intensity) {
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
exports.ColorMap = ColorMap;
// Updated heatmap colors with better contrast for activity levels:
// 0.0-0.2 = Very quiet (minimal/no blue)
// 0.2-0.4 = QUIET (blue - cool colors)
// 0.4-0.6 = MODERATE (cyan/teal - warming up)
// 0.6-0.8 = BUSY (yellow/orange - hot)
// 0.8-1.0 = VERY_BUSY (red/bright orange - very hot)
ColorMap.HEAT_COLORS = [
    { t: 0.0, r: 0, g: 0, b: 0, a: 0 }, // Transparent (no activity)
    { t: 0.05, r: 50, g: 80, b: 200, a: 120 }, // Very faint blue (minimal activity)
    { t: 0.2, r: 80, g: 120, b: 255, a: 180 }, // Light blue (quiet)
    { t: 0.4, r: 0, g: 180, b: 255, a: 220 }, // Blue (QUIET - cool)
    { t: 0.6, r: 0, g: 220, b: 180, a: 240 }, // Cyan/Teal (MODERATE - warming)
    { t: 0.75, r: 255, g: 220, b: 0, a: 250 }, // Yellow (BUSY - hot)
    { t: 0.88, r: 255, g: 140, b: 0, a: 255 }, // Orange (VERY BUSY - very hot)
    { t: 1.0, r: 255, g: 40, b: 40, a: 255 } // Bright Red (EXTREMELY BUSY - hottest)
];
//# sourceMappingURL=colormap.js.map