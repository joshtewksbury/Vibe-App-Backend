export declare class WebMercator {
    static lngLatToMeters(lng: number, lat: number): [number, number];
    static metersToLngLat(x: number, y: number): [number, number];
    static tileBounds(z: number, x: number, y: number): {
        minX: number;
        minY: number;
        maxX: number;
        maxY: number;
    };
    static pixelToMeters(z: number, x: number, y: number, px: number, py: number): [number, number];
    static lngLatToTile(lng: number, lat: number, z: number): [number, number];
    static tileToLngLat(x: number, y: number, z: number): [number, number];
}
//# sourceMappingURL=projection.d.ts.map