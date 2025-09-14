const express = require('express');
const multer = require('multer');
const router = express.Router();
const FileController = require('../controllers/fileController');
const { auth } = require('../middleware/auth');

// All file routes require authentication
router.use(auth);

// Upload routes
router.post('/upload/profile-picture', FileController.uploadProfilePicture);
router.post('/upload/document', FileController.uploadDocument);
router.post('/upload/attachment', FileController.uploadAttachment);

// Delete route
router.delete('/:category/:fileName', FileController.deleteFile);

// Error handling middleware for multer errors
router.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'File too large. Maximum size is 10MB.' });
    }
    if (error.code === 'LIMIT_UNEXPECTED_FILE') {
      return res.status(400).json({ error: 'Unexpected file field.' });
    }
  }

  if (error.message === 'File type not allowed') {
    return res.status(400).json({ error: 'File type not allowed.' });
  }

  console.error('File upload error:', error);
  res.status(500).json({ error: 'File upload failed.' });
});

module.exports = router;