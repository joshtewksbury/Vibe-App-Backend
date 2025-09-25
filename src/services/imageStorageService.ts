import AWS from 'aws-sdk';
import sharp from 'sharp';
import { v4 as uuidv4 } from 'uuid';
import { VenueImageType } from '@prisma/client';

// Configure AWS S3
const s3 = new AWS.S3({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region: process.env.AWS_REGION || 'us-east-1'
});

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

export class ImageStorageService {
  private readonly bucketName: string;
  private readonly cdnBaseUrl?: string;

  constructor() {
    this.bucketName = process.env.AWS_S3_BUCKET || 'vibe-app-venue-images';
    this.cdnBaseUrl = process.env.CDN_BASE_URL;
  }

  /**
   * Process and upload image with automatic thumbnail generation
   */
  async processAndUpload(
    buffer: Buffer,
    venueId: string,
    imageType: VenueImageType,
    originalName?: string
  ): Promise<UploadResult> {
    try {
      // Generate unique filenames
      const timestamp = Date.now();
      const imageId = uuidv4();
      const extension = 'jpg'; // We'll convert all to JPEG for consistency

      const filename = `${venueId}_${imageType.toLowerCase()}_${timestamp}_${imageId}.${extension}`;
      const thumbnailFilename = `${venueId}_${imageType.toLowerCase()}_${timestamp}_${imageId}_thumb.${extension}`;

      // Get original image metadata
      const originalMetadata = await sharp(buffer).metadata();
      console.log(`📊 Processing image: ${originalMetadata.width}x${originalMetadata.height}, ${originalMetadata.format}`);

      // Process main image based on type
      const processingOptions = this.getProcessingOptions(imageType);
      const processedImageBuffer = await this.processImage(buffer, processingOptions);

      // Create thumbnail
      const thumbnailBuffer = await this.createThumbnail(buffer, imageType);

      // Upload both images in parallel
      console.log('☁️ Uploading to S3...');
      const [imageUrl, thumbnailUrl] = await Promise.all([
        this.uploadToS3(processedImageBuffer, filename, 'image/jpeg'),
        this.uploadToS3(thumbnailBuffer, thumbnailFilename, 'image/jpeg')
      ]);

      // Get final image metadata
      const finalMetadata = await sharp(processedImageBuffer).metadata();

      const metadata: ImageMetadata = {
        width: finalMetadata.width || 0,
        height: finalMetadata.height || 0,
        fileSize: processedImageBuffer.length,
        format: 'jpg',
        isPortrait: (finalMetadata.height || 0) > (finalMetadata.width || 0),
        aspectRatio: finalMetadata.width && finalMetadata.height
          ? parseFloat((finalMetadata.width / finalMetadata.height).toFixed(2))
          : 1.0
      };

      console.log(`✅ Successfully uploaded: ${imageUrl}`);

      return {
        url: this.cdnBaseUrl ? imageUrl.replace(this.bucketName + '.s3.amazonaws.com', this.cdnBaseUrl) : imageUrl,
        thumbnailUrl: this.cdnBaseUrl ? thumbnailUrl.replace(this.bucketName + '.s3.amazonaws.com', this.cdnBaseUrl) : thumbnailUrl,
        metadata
      };

    } catch (error) {
      console.error('❌ Image processing/upload error:', error);
      throw new Error(`Failed to process and upload image: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Delete image from S3
   */
  async deleteImage(imageUrl: string): Promise<void> {
    try {
      const key = this.extractKeyFromUrl(imageUrl);
      if (!key) {
        console.warn(`⚠️ Could not extract key from URL: ${imageUrl}`);
        return;
      }

      await s3.deleteObject({
        Bucket: this.bucketName,
        Key: key
      }).promise();

      console.log(`🗑️ Deleted image: ${key}`);
    } catch (error) {
      console.error('❌ Error deleting image:', error);
      throw new Error(`Failed to delete image: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Delete multiple images
   */
  async deleteImages(imageUrls: string[]): Promise<void> {
    try {
      const keys = imageUrls
        .map(url => this.extractKeyFromUrl(url))
        .filter(key => key !== null) as string[];

      if (keys.length === 0) {
        console.log('🤷 No valid keys to delete');
        return;
      }

      const deleteParams = {
        Bucket: this.bucketName,
        Delete: {
          Objects: keys.map(key => ({ Key: key })),
          Quiet: false
        }
      };

      const result = await s3.deleteObjects(deleteParams).promise();
      console.log(`🗑️ Deleted ${result.Deleted?.length || 0} images`);

      if (result.Errors && result.Errors.length > 0) {
        console.error('❌ Some deletions failed:', result.Errors);
      }
    } catch (error) {
      console.error('❌ Error deleting images:', error);
      throw new Error(`Failed to delete images: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get processing options based on image type
   */
  private getProcessingOptions(imageType: VenueImageType): ImageProcessingOptions {
    switch (imageType) {
      case 'ICON':
        return { maxWidth: 400, maxHeight: 400, quality: 90 };
      case 'BANNER':
        return { maxWidth: 1200, maxHeight: 800, quality: 85 };
      case 'GALLERY':
        return { maxWidth: 1000, maxHeight: 1000, quality: 85 };
      case 'MENU':
        return { maxWidth: 800, maxHeight: 1200, quality: 85 };
      case 'INTERIOR':
      case 'EXTERIOR':
      case 'ATMOSPHERE':
        return { maxWidth: 1200, maxHeight: 800, quality: 85 };
      case 'FOOD':
      case 'DRINKS':
        return { maxWidth: 600, maxHeight: 600, quality: 85 };
      case 'EVENTS':
        return { maxWidth: 1200, maxHeight: 800, quality: 85 };
      default:
        return { maxWidth: 1000, maxHeight: 1000, quality: 85 };
    }
  }

  /**
   * Process image with Sharp
   */
  private async processImage(
    buffer: Buffer,
    options: ImageProcessingOptions = {}
  ): Promise<Buffer> {
    const { maxWidth = 1200, maxHeight = 800, quality = 85 } = options;

    return await sharp(buffer)
      .resize(maxWidth, maxHeight, {
        fit: 'inside',
        withoutEnlargement: true
      })
      .jpeg({
        quality,
        progressive: true,
        mozjpeg: true
      })
      .toBuffer();
  }

  /**
   * Create thumbnail
   */
  private async createThumbnail(buffer: Buffer, imageType: VenueImageType): Promise<Buffer> {
    // Different thumbnail sizes based on image type
    const thumbnailSize = imageType === 'ICON' ? { width: 100, height: 100 } : { width: 300, height: 200 };

    return await sharp(buffer)
      .resize(thumbnailSize.width, thumbnailSize.height, {
        fit: 'cover',
        position: 'center'
      })
      .jpeg({
        quality: 80,
        progressive: true
      })
      .toBuffer();
  }

  /**
   * Upload buffer to S3
   */
  private async uploadToS3(buffer: Buffer, filename: string, contentType: string): Promise<string> {
    const params = {
      Bucket: this.bucketName,
      Key: `venue-images/${filename}`,
      Body: buffer,
      ContentType: contentType,
      ACL: 'public-read',
      CacheControl: 'public, max-age=31536000', // 1 year cache
      Metadata: {
        'uploaded-by': 'vibe-app',
        'upload-timestamp': new Date().toISOString()
      }
    };

    try {
      const result = await s3.upload(params).promise();
      return result.Location;
    } catch (error) {
      console.error('❌ S3 upload error:', error);
      throw error;
    }
  }

  /**
   * Extract S3 key from URL
   */
  private extractKeyFromUrl(url: string): string | null {
    try {
      const urlParts = url.split('/');
      const venueImagesIndex = urlParts.findIndex(part => part === 'venue-images');

      if (venueImagesIndex !== -1 && venueImagesIndex < urlParts.length - 1) {
        return `venue-images/${urlParts[venueImagesIndex + 1]}`;
      }

      // Fallback: try to extract everything after the domain
      const urlObj = new URL(url);
      return urlObj.pathname.startsWith('/') ? urlObj.pathname.substring(1) : urlObj.pathname;
    } catch (error) {
      console.error('❌ Error extracting key from URL:', url, error);
      return null;
    }
  }

  /**
   * Generate pre-signed URL for direct uploads (for future use)
   */
  async generatePresignedUrl(filename: string, contentType: string): Promise<string> {
    const params = {
      Bucket: this.bucketName,
      Key: `venue-images/${filename}`,
      Expires: 3600, // 1 hour
      ContentType: contentType,
      ACL: 'public-read'
    };

    return s3.getSignedUrl('putObject', params);
  }

  /**
   * Check if S3 is configured properly
   */
  async testConnection(): Promise<boolean> {
    try {
      await s3.headBucket({ Bucket: this.bucketName }).promise();
      console.log(`✅ S3 connection successful: ${this.bucketName}`);
      return true;
    } catch (error) {
      console.error(`❌ S3 connection failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return false;
    }
  }
}

// Export singleton instance
export const imageStorageService = new ImageStorageService();