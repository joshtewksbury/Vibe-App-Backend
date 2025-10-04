const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;

const router = express.Router();

const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    const uploadDir = '/app/uploads';
    try {
      await fs.mkdir(uploadDir, { recursive: true });
    } catch (error) {
      console.error('Error creating upload directory:', error);
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    const baseName = path.basename(file.originalname, ext).toLowerCase().replace(/\s+/g, '-');
    cb(null, `${baseName}-${uniqueSuffix}${ext}`);
  }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 }
});

router.post('/api/upload-image', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }
    
    const imageUrl = `${req.protocol}://${req.get('host')}/images/${req.file.filename}`;
    
    res.json({
      success: true,
      url: imageUrl,
      filename: req.file.filename
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to upload image' });
  }
});

router.get('/images/:filename', async (req, res) => {
  try {
    const filepath = path.join('/app/uploads', req.params.filename);
    res.sendFile(filepath);
  } catch (error) {
    res.status(404).json({ error: 'Image not found' });
  }
});

module.exports = router;
