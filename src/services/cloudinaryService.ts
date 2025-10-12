import { v2 as cloudinary } from 'cloudinary';

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

export interface UploadResult {
  publicId: string;
  url: string;
  secureUrl: string;
  width: number;
  height: number;
  format: string;
}

/**
 * Upload a base64 image to Cloudinary
 * @param base64Data - Base64 encoded image data (with or without data URI prefix)
 * @param folder - Cloudinary folder path (e.g., 'venue-icons')
 * @param publicId - Optional custom public ID for the image
 * @returns Upload result with URL and metadata
 */
export async function uploadBase64Image(
  base64Data: string,
  folder: string = 'venue-icons',
  publicId?: string
): Promise<UploadResult> {
  try {
    // Ensure base64 data has the proper data URI format
    const base64String = base64Data.startsWith('data:')
      ? base64Data
      : `data:image/png;base64,${base64Data}`;

    const uploadOptions: any = {
      folder,
      resource_type: 'image',
      transformation: [
        { width: 512, height: 512, crop: 'limit' }, // Limit max size
        { quality: 'auto', fetch_format: 'auto' }, // Optimize quality and format
      ],
    };

    if (publicId) {
      uploadOptions.public_id = publicId;
    }

    const result = await cloudinary.uploader.upload(base64String, uploadOptions);

    return {
      publicId: result.public_id,
      url: result.url,
      secureUrl: result.secure_url,
      width: result.width,
      height: result.height,
      format: result.format,
    };
  } catch (error) {
    console.error('Cloudinary upload error:', error);
    throw new Error(
      `Failed to upload image to Cloudinary: ${
        error instanceof Error ? error.message : 'Unknown error'
      }`
    );
  }
}

/**
 * Delete an image from Cloudinary
 * @param publicId - Public ID of the image to delete
 */
export async function deleteImage(publicId: string): Promise<void> {
  try {
    await cloudinary.uploader.destroy(publicId);
  } catch (error) {
    console.error('Cloudinary delete error:', error);
    throw new Error(
      `Failed to delete image from Cloudinary: ${
        error instanceof Error ? error.message : 'Unknown error'
      }`
    );
  }
}

/**
 * Get optimized image URL with transformations
 * @param publicId - Public ID of the image
 * @param width - Desired width
 * @param height - Desired height
 * @returns Optimized image URL
 */
export function getOptimizedImageUrl(
  publicId: string,
  width?: number,
  height?: number
): string {
  const transformations: any = {
    quality: 'auto',
    fetch_format: 'auto',
  };

  if (width) transformations.width = width;
  if (height) transformations.height = height;
  if (width && height) transformations.crop = 'fill';

  return cloudinary.url(publicId, transformations);
}

export default {
  uploadBase64Image,
  deleteImage,
  getOptimizedImageUrl,
};
