const express = require('express');
const axios = require('axios');
const router = express.Router();

// Proxy route for filestore images to handle authentication
router.get('/filestore/*', async (req, res) => {
  try {
    const filePath = req.params[0]; // This captures everything after /filestore/
    const filestoreUrl = `https://filestore.dozyr.co/api/file/${filePath}`;

    console.log('Proxying filestore request:', filestoreUrl);

    // Make request to filestore with API key
    const response = await axios.get(filestoreUrl, {
      headers: {
        'X-API-Key': process.env.FILESTORE_API_KEY || 'dozyr_filestore_2024_main_api_key_secure_token_xyz789'
      },
      responseType: 'stream' // Stream the file data
    });

    // Forward content type and other headers
    if (response.headers['content-type']) {
      res.set('Content-Type', response.headers['content-type']);
    }
    if (response.headers['content-length']) {
      res.set('Content-Length', response.headers['content-length']);
    }

    // Cache headers for better performance
    res.set('Cache-Control', 'public, max-age=31536000'); // 1 year

    // Pipe the file data to response
    response.data.pipe(res);

  } catch (error) {
    console.error('Proxy error:', error.response?.status, error.message);

    if (error.response?.status === 404) {
      res.status(404).json({ error: 'File not found' });
    } else if (error.response?.status === 401) {
      res.status(500).json({ error: 'Authentication failed with filestore' });
    } else {
      res.status(500).json({ error: 'Failed to proxy file' });
    }
  }
});

module.exports = router;