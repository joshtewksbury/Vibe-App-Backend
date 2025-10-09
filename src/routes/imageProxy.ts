import express from 'express';
import axios from 'axios';

const router = express.Router();

// Proxy endpoint to fetch images from external sources (like Instagram)
// This bypasses CORS and authentication issues
router.get('/proxy', async (req, res) => {
  try {
    const { url } = req.query;

    if (!url || typeof url !== 'string') {
      return res.status(400).json({
        success: false,
        message: 'URL parameter is required'
      });
    }

    console.log(`🖼️ Proxying image: ${url.substring(0, 80)}...`);

    // Fetch the image with proper headers
    const response = await axios.get(url, {
      responseType: 'arraybuffer',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Accept': 'image/webp,image/apng,image/*,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Cache-Control': 'no-cache',
        'Referer': 'https://www.instagram.com/'
      },
      timeout: 10000
    });

    const imageBuffer = Buffer.from(response.data as ArrayBuffer);

    // Set appropriate cache headers
    res.set({
      'Content-Type': response.headers['content-type'] || 'image/jpeg',
      'Cache-Control': 'public, max-age=86400', // Cache for 24 hours
      'Content-Length': imageBuffer.length.toString()
    });

    res.send(imageBuffer);
  } catch (error: any) {
    console.error('❌ Image proxy error:', error.message);
    res.status(error.response?.status || 500).json({
      success: false,
      message: 'Failed to fetch image',
      error: error.message
    });
  }
});

export default router;
