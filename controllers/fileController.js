const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const filestoreService = require('../services/filestoreService');
const { validateFileType, scanFileForMalware } = require('../utils/fileHelpers');
const TalentProfile = require('../models/TalentProfile');
const ManagerProfile = require('../models/ManagerProfile');
const axios = require('axios');

// Configure multer for temporary local storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadPath = path.join(__dirname, '../temp-uploads');
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'temp-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    // Basic file type check - more validation happens later
    const allowedMimeTypes = [
      'image/jpeg', 'image/png', 'image/gif', 'image/webp',
      'application/pdf', 'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'text/plain', 'application/zip', 'application/x-rar-compressed'
    ];

    if (allowedMimeTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('File type not allowed'), false);
    }
  }
});

class FileController {
  // Upload profile picture
  static uploadProfilePicture = [
    upload.single('profilePicture'),
    async (req, res) => {
      try {
        if (!req.file) {
          return res.status(400).json({ error: 'No file uploaded' });
        }

        const tempFilePath = req.file.path;

        // Validate file type
        const typeValidation = await validateFileType(tempFilePath);
        if (!typeValidation.isValid) {
          await fs.unlink(tempFilePath);
          return res.status(400).json({ error: 'Invalid file type' });
        }

        // Scan for malware
        const scanResult = await scanFileForMalware(tempFilePath);
        if (!scanResult.isClean) {
          await fs.unlink(tempFilePath);
          return res.status(400).json({ error: 'File failed security scan' });
        }

        // Check if it's an image file
        if (!filestoreService.isFileTypeAllowed(req.file.originalname, 'profiles')) {
          await fs.unlink(tempFilePath);
          return res.status(400).json({ error: 'Only image files allowed for profile pictures' });
        }

        // Upload to filestore
        const uploadResult = await filestoreService.uploadProfilePicture(
          tempFilePath,
          req.user.id,
          req.file.originalname
        );

        // Clean up temp file
        await fs.unlink(tempFilePath);

        if (!uploadResult.success) {
          return res.status(500).json({ error: uploadResult.error });
        }

        // Log the upload result for debugging
        console.log('Filestore upload result:', JSON.stringify(uploadResult, null, 2));

        // Use the URL from the filestore response directly
        const imageUrl = uploadResult.data.url || uploadResult.data.fileName;

        // Update user profile with new picture URL
        const profileUpdateResult = await FileController.updateUserProfilePicture(
          req.user.id,
          req.user.role,
          imageUrl
        );

        if (!profileUpdateResult.success) {
          // If profile update fails, try to clean up the uploaded file
          await filestoreService.deleteProfilePicture(uploadResult.data.fileName);
          return res.status(500).json({ error: profileUpdateResult.error });
        }

        res.json({
          message: 'Profile picture uploaded successfully',
          file: {
            fileName: uploadResult.data.fileName,
            originalName: uploadResult.data.originalName,
            url: imageUrl,
            size: uploadResult.data.size
          }
        });
      } catch (error) {
        console.error('Upload profile picture error:', error);

        // Clean up temp file if it exists
        if (req.file?.path) {
          try {
            await fs.unlink(req.file.path);
          } catch (unlinkError) {
            console.error('Error cleaning up temp file:', unlinkError);
          }
        }

        res.status(500).json({ error: 'Internal server error' });
      }
    }
  ];

  // Upload document
  static uploadDocument = [
    upload.single('document'),
    async (req, res) => {
      try {
        if (!req.file) {
          return res.status(400).json({ error: 'No file uploaded' });
        }

        const tempFilePath = req.file.path;

        // Validate file type
        const typeValidation = await validateFileType(tempFilePath);
        if (!typeValidation.isValid) {
          await fs.unlink(tempFilePath);
          return res.status(400).json({ error: 'Invalid file type' });
        }

        // Scan for malware
        const scanResult = await scanFileForMalware(tempFilePath);
        if (!scanResult.isClean) {
          await fs.unlink(tempFilePath);
          return res.status(400).json({ error: 'File failed security scan' });
        }

        // Check if file type is allowed for documents
        if (!filestoreService.isFileTypeAllowed(req.file.originalname, 'documents')) {
          await fs.unlink(tempFilePath);
          return res.status(400).json({ error: 'File type not allowed for documents' });
        }

        // Upload to filestore
        const uploadResult = await filestoreService.uploadDocument(
          tempFilePath,
          req.user.id,
          req.file.originalname
        );

        // Clean up temp file
        await fs.unlink(tempFilePath);

        if (!uploadResult.success) {
          return res.status(500).json({ error: uploadResult.error });
        }

        res.json({
          message: 'Document uploaded successfully',
          file: {
            fileName: uploadResult.data.fileName,
            originalName: uploadResult.data.originalName,
            url: uploadResult.data.url,
            size: uploadResult.data.size
          }
        });
      } catch (error) {
        console.error('Upload document error:', error);

        // Clean up temp file if it exists
        if (req.file?.path) {
          try {
            await fs.unlink(req.file.path);
          } catch (unlinkError) {
            console.error('Error cleaning up temp file:', unlinkError);
          }
        }

        res.status(500).json({ error: 'Internal server error' });
      }
    }
  ];

  // Upload attachment
  static uploadAttachment = [
    upload.single('attachment'),
    async (req, res) => {
      try {
        if (!req.file) {
          return res.status(400).json({ error: 'No file uploaded' });
        }

        const tempFilePath = req.file.path;

        // Validate file type
        const typeValidation = await validateFileType(tempFilePath);
        if (!typeValidation.isValid) {
          await fs.unlink(tempFilePath);
          return res.status(400).json({ error: 'Invalid file type' });
        }

        // Scan for malware
        const scanResult = await scanFileForMalware(tempFilePath);
        if (!scanResult.isClean) {
          await fs.unlink(tempFilePath);
          return res.status(400).json({ error: 'File failed security scan' });
        }

        // Check if file type is allowed for attachments
        if (!filestoreService.isFileTypeAllowed(req.file.originalname, 'attachments')) {
          await fs.unlink(tempFilePath);
          return res.status(400).json({ error: 'File type not allowed for attachments' });
        }

        // Upload to filestore
        const uploadResult = await filestoreService.uploadAttachment(
          tempFilePath,
          req.user.id,
          req.file.originalname
        );

        // Clean up temp file
        await fs.unlink(tempFilePath);

        if (!uploadResult.success) {
          return res.status(500).json({ error: uploadResult.error });
        }

        res.json({
          message: 'Attachment uploaded successfully',
          file: {
            fileName: uploadResult.data.fileName,
            originalName: uploadResult.data.originalName,
            url: uploadResult.data.url,
            size: uploadResult.data.size
          }
        });
      } catch (error) {
        console.error('Upload attachment error:', error);

        // Clean up temp file if it exists
        if (req.file?.path) {
          try {
            await fs.unlink(req.file.path);
          } catch (unlinkError) {
            console.error('Error cleaning up temp file:', unlinkError);
          }
        }

        res.status(500).json({ error: 'Internal server error' });
      }
    }
  ];

  // Delete file
  static async deleteFile(req, res) {
    try {
      const { category, fileName } = req.params;

      if (!filestoreService.isValidCategory(category)) {
        return res.status(400).json({ error: 'Invalid file category' });
      }

      // TODO: Add authorization check to ensure user owns the file

      const deleteResult = await filestoreService.deleteFile(category, fileName);

      if (!deleteResult.success) {
        return res.status(500).json({ error: deleteResult.error });
      }

      res.json({ message: 'File deleted successfully' });
    } catch (error) {
      console.error('Delete file error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  // Image proxy for development - serves images from cPanel hosting
  static async imageProxy(req, res) {
    try {
      // Extract the file path from the URL params
      const filePath = req.params[0]; // This captures everything after /image-proxy/

      if (!filePath) {
        return res.status(400).json({ error: 'File path is required' });
      }

      console.log('Proxying image request for:', filePath);

      // Construct the full filestore URL
      const imageUrl = `https://filestore.dozyr.co/${filePath}`;

      console.log('Fetching from filestore:', imageUrl);

      // Fetch the image from cPanel hosting with proper headers
      const response = await axios({
        method: 'GET',
        url: imageUrl,
        headers: {
          'X-API-Key': 'dozyr_filestore_2024_main_api_key_secure_token_xyz789',
          'User-Agent': 'Dozyr-Backend-Proxy/1.0'
        },
        responseType: 'arraybuffer',
        timeout: 10000 // 10 second timeout
      });

      // Get the image buffer
      const imageBuffer = Buffer.from(response.data);
      const contentType = response.headers['content-type'] || 'image/jpeg';

      console.log(`Successfully proxied image: ${filePath}, size: ${imageBuffer.length} bytes, type: ${contentType}`);

      // Set appropriate headers
      res.set({
        'Content-Type': contentType,
        'Content-Length': imageBuffer.length,
        'Cache-Control': 'public, max-age=3600', // Cache for 1 hour
        'Access-Control-Allow-Origin': '*', // Allow CORS for development
      });

      // Send the image
      res.send(imageBuffer);

    } catch (error) {
      console.error('Image proxy error:', error);

      // Handle axios errors
      if (error.response) {
        // The request was made and the server responded with a status code outside of 2xx
        console.error(`Filestore returned ${error.response.status}: ${error.response.statusText}`);
        return res.status(error.response.status).json({
          error: `Failed to fetch image: ${error.response.status} ${error.response.statusText}`
        });
      } else if (error.request) {
        // The request was made but no response was received
        console.error('No response received from filestore:', error.message);
        return res.status(503).json({ error: 'Filestore service unavailable' });
      } else if (error.code === 'ECONNABORTED') {
        // Request timeout
        return res.status(504).json({ error: 'Request timeout' });
      }

      res.status(500).json({ error: 'Proxy server error' });
    }
  }

  // Helper method to update user profile picture
  static async updateUserProfilePicture(userId, userRole, pictureUrl) {
    try {
      if (userRole === 'talent') {
        const updated = await TalentProfile.update(userId, { profile_picture: pictureUrl });
        return { success: !!updated };
      } else if (userRole === 'manager') {
        const updated = await ManagerProfile.update(userId, { profile_picture: pictureUrl });
        return { success: !!updated };
      } else if (userRole === 'admin') {
        // For admin users, we'll skip profile table update for now
        // You may want to create an AdminProfile table later
        return { success: true };
      }

      return { success: false, error: 'Invalid user role' };
    } catch (error) {
      console.error('Update user profile picture error:', error);
      return { success: false, error: error.message };
    }
  }

  // Ensure temp upload directory exists
  static async ensureTempUploadDir() {
    try {
      const tempDir = path.join(__dirname, '../temp-uploads');
      await fs.access(tempDir);
    } catch (error) {
      if (error.code === 'ENOENT') {
        const tempDir = path.join(__dirname, '../temp-uploads');
        await fs.mkdir(tempDir, { recursive: true });
      }
    }
  }
}

// Ensure temp directory exists on startup
FileController.ensureTempUploadDir().catch(console.error);

module.exports = FileController;