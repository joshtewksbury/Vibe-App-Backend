"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.WebMercator = void 0;
const EARTH_RADIUS = 6378137;
const ORIGIN_SHIFT = Math.PI * EARTH_RADIUS;
class WebMercator {
    static lngLatToMeters(lng, lat) {
        const x = lng * ORIGIN_SHIFT / 180;
        const y = Math.log(Math.tan((90 + lat) * Math.PI / 360)) / Math.PI * ORIGIN_SHIFT;
        return [x, y];
    }
    static metersToLngLat(x, y) {
        const lng = x / ORIGIN_SHIFT * 180;
        const lat = Math.atan(Math.exp(y / ORIGIN_SHIFT * Math.PI)) * 360 / Math.PI - 90;
        return [lng, lat];
    }
    static tileBounds(z, x, y) {
        const n = Math.pow(2, z);
        const resolution = (2 * ORIGIN_SHIFT) / n;
        const minX = -ORIGIN_SHIFT + x * resolution;
        const maxX = minX + resolution;
        const maxY = ORIGIN_SHIFT - y * resolution;
        const minY = maxY - resolution;
        return { minX, minY, maxX, maxY };
    }
    static pixelToMeters(z, x, y, px, py) {
        const bounds = this.tileBounds(z, x, y);
        const tileSize = 256;
        const mx = bounds.minX + (px / tileSize) * (bounds.maxX - bounds.minX);
        const my = bounds.maxY - (py / tileSize) * (bounds.maxY - bounds.minY);
        return [mx, my];
    }
    // Utility functions for lat/lng to tile coordinates
    static lngLatToTile(lng, lat, z) {
        const n = Math.pow(2, z);
        const x = Math.floor((lng + 180) / 360 * n);
        const latRad = lat * Math.PI / 180;
        const y = Math.floor((1 - Math.asinh(Math.tan(latRad)) / Math.PI) / 2 * n);
        return [x, y];
    }
    static tileToLngLat(x, y, z) {
        const n = Math.pow(2, z);
        const lng = x / n * 360 - 180;
        const latRad = Math.atan(Math.sinh(Math.PI * (1 - 2 * y / n)));
        const lat = latRad * 180 / Math.PI;
        return [lng, lat];
    }
}
exports.WebMercator = WebMercator;
//# sourceMappingURL=projection.js.map