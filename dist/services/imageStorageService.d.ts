import { VenueImageType } from '@prisma/client';
export interface ImageProcessingOptions {
    maxWidth?: number;
    maxHeight?: number;
    quality?: number;
}
export interface ImageMetadata {
    width: number;
    height: number;
    fileSize: number;
    format: string;
    isPortrait: boolean;
    aspectRatio: number;
}
export interface UploadResult {
    url: string;
    thumbnailUrl: string;
    metadata: ImageMetadata;
}
export declare class ImageStorageService {
    private readonly bucketName;
    private readonly cdnBaseUrl?;
    constructor();
    /**
     * Process and upload image with automatic thumbnail generation
     */
    processAndUpload(buffer: Buffer, venueId: string, imageType: VenueImageType, originalName?: string): Promise<UploadResult>;
    /**
     * Delete image from S3
     */
    deleteImage(imageUrl: string): Promise<void>;
    /**
     * Delete multiple images
     */
    deleteImages(imageUrls: string[]): Promise<void>;
    /**
     * Get processing options based on image type
     */
    private getProcessingOptions;
    /**
     * Process image with Sharp
     */
    private processImage;
    /**
     * Create thumbnail
     */
    private createThumbnail;
    /**
     * Upload buffer to S3
     */
    private uploadToS3;
    /**
     * Extract S3 key from URL
     */
    private extractKeyFromUrl;
    /**
     * Generate pre-signed URL for direct uploads (for future use)
     */
    generatePresignedUrl(filename: string, contentType: string): Promise<string>;
    /**
     * Check if S3 is configured properly
     */
    testConnection(): Promise<boolean>;
}
export declare const imageStorageService: ImageStorageService;
//# sourceMappingURL=imageStorageService.d.ts.map