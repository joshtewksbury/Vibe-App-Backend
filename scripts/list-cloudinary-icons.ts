/**
 * Script to list all venue icons from Cloudinary with their metadata
 * This helps us understand the naming structure and potentially find venue info
 */

import { v2 as cloudinary } from 'cloudinary';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

async function listAllIcons() {
  try {
    console.log('📥 Fetching all venue icons from Cloudinary...\n');

    const result = await cloudinary.api.resources({
      type: 'upload',
      prefix: 'venue-icons/',
      max_results: 500,
      resource_type: 'image'
    });

    console.log(`Found ${result.resources.length} images\n`);
    console.log('='.repeat(80));

    result.resources.forEach((resource: any, index: number) => {
      console.log(`\n${index + 1}. ${resource.public_id}`);
      console.log(`   URL: ${resource.secure_url}`);
      console.log(`   Format: ${resource.format}`);
      console.log(`   Size: ${resource.bytes} bytes`);
      console.log(`   Created: ${resource.created_at}`);

      if (resource.context) {
        console.log(`   Context: ${JSON.stringify(resource.context)}`);
      }

      if (resource.metadata) {
        console.log(`   Metadata: ${JSON.stringify(resource.metadata)}`);
      }
    });

    console.log('\n' + '='.repeat(80));
    console.log(`\nTotal: ${result.resources.length} images`);

  } catch (error) {
    console.error('❌ Error:', error);
  }
}

listAllIcons();
