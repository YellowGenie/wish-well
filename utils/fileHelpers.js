const crypto = require('crypto');
const fs = require('fs').promises;
const path = require('path');
const { fileTypeFromFile } = require('file-type');
const sharp = require('sharp');

class FileHelpers {
  static async generateFileHash(filePath) {
    try {
      const fileBuffer = await fs.readFile(filePath);
      return crypto.createHash('md5').update(fileBuffer).digest('hex');
    } catch (error) {
      console.error('Error generating file hash:', error);
      throw error;
    }
  }

  static async validateFileType(filePath) {
    try {
      const fileType = await fileTypeFromFile(filePath);
      
      const allowedTypes = [
        'image/jpeg', 'image/png', 'image/gif', 'image/webp',
        'audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/mp4',
        'text/plain', 'application/pdf',
        'application/json', 'text/javascript', 'text/css', 'text/html'
      ];

      return {
        isValid: allowedTypes.includes(fileType?.mime),
        detectedType: fileType,
        allowedTypes
      };
    } catch (error) {
      console.error('Error validating file type:', error);
      return { isValid: false, error: error.message };
    }
  }

  static async scanFileForMalware(filePath) {
    // Basic file scanning - in production, integrate with proper antivirus
    try {
      const stats = await fs.stat(filePath);
      const fileBuffer = await fs.readFile(filePath);
      
      // Check for suspicious patterns
      const suspiciousPatterns = [
        /\.exe$/i, /\.bat$/i, /\.cmd$/i, /\.sh$/i, /\.scr$/i,
        /\.com$/i, /\.pif$/i, /\.vbs$/i, /\.js$/i, /\.jar$/i
      ];

      const fileName = path.basename(filePath);
      const isSuspicious = suspiciousPatterns.some(pattern => pattern.test(fileName));

      // Check file size (prevent extremely large files)
      const maxSize = 50 * 1024 * 1024; // 50MB
      const isTooLarge = stats.size > maxSize;

      return {
        isClean: !isSuspicious && !isTooLarge,
        isSuspicious,
        isTooLarge,
        fileSize: stats.size,
        scanDate: new Date().toISOString()
      };
    } catch (error) {
      console.error('Error scanning file:', error);
      return { isClean: false, error: error.message };
    }
  }

  static async optimizeImage(filePath, options = {}) {
    try {
      const {
        maxWidth = 1920,
        maxHeight = 1080,
        quality = 80,
        format = 'jpeg'
      } = options;

      const outputPath = filePath.replace(/\.[^/.]+$/, `_optimized.${format}`);
      
      await sharp(filePath)
        .resize(maxWidth, maxHeight, { 
          fit: 'inside',
          withoutEnlargement: true 
        })
        .jpeg({ quality })
        .toFile(outputPath);

      return {
        success: true,
        originalPath: filePath,
        optimizedPath: outputPath
      };
    } catch (error) {
      console.error('Error optimizing image:', error);
      return { success: false, error: error.message };
    }
  }

  static async createThumbnail(imagePath, options = {}) {
    try {
      const {
        width = 200,
        height = 200,
        quality = 70
      } = options;

      const outputPath = imagePath.replace(/\.[^/.]+$/, '_thumb.jpeg');
      
      await sharp(imagePath)
        .resize(width, height, { 
          fit: 'cover',
          position: 'center' 
        })
        .jpeg({ quality })
        .toFile(outputPath);

      return {
        success: true,
        thumbnailPath: outputPath
      };
    } catch (error) {
      console.error('Error creating thumbnail:', error);
      return { success: false, error: error.message };
    }
  }

  static async cleanupTempFiles(directory, maxAge = 24 * 60 * 60 * 1000) {
    try {
      const files = await fs.readdir(directory);
      const now = Date.now();
      let cleanedCount = 0;

      for (const file of files) {
        const filePath = path.join(directory, file);
        const stats = await fs.stat(filePath);
        
        if (now - stats.mtime.getTime() > maxAge) {
          await fs.unlink(filePath);
          cleanedCount++;
        }
      }

      return { success: true, cleanedCount };
    } catch (error) {
      console.error('Error cleaning up temp files:', error);
      return { success: false, error: error.message };
    }
  }

  static getFileInfo(filePath, originalName) {
    const stats = fs.stat(filePath);
    const extension = path.extname(originalName).toLowerCase();
    
    return {
      size: stats.size,
      extension,
      mimeType: this.getMimeType(extension),
      isImage: this.isImageFile(extension),
      isAudio: this.isAudioFile(extension),
      isText: this.isTextFile(extension)
    };
  }

  static getMimeType(extension) {
    const mimeTypes = {
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg', 
      '.png': 'image/png',
      '.gif': 'image/gif',
      '.webp': 'image/webp',
      '.mp3': 'audio/mpeg',
      '.wav': 'audio/wav',
      '.ogg': 'audio/ogg',
      '.pdf': 'application/pdf',
      '.txt': 'text/plain',
      '.json': 'application/json',
      '.js': 'text/javascript',
      '.css': 'text/css',
      '.html': 'text/html'
    };

    return mimeTypes[extension] || 'application/octet-stream';
  }

  static isImageFile(extension) {
    return ['.jpg', '.jpeg', '.png', '.gif', '.webp'].includes(extension);
  }

  static isAudioFile(extension) {
    return ['.mp3', '.wav', '.ogg', '.m4a'].includes(extension);
  }

  static isTextFile(extension) {
    return ['.txt', '.json', '.js', '.css', '.html', '.md'].includes(extension);
  }

  static async ensureDirectoryExists(dirPath) {
    try {
      await fs.access(dirPath);
    } catch (error) {
      if (error.code === 'ENOENT') {
        await fs.mkdir(dirPath, { recursive: true });
      } else {
        throw error;
      }
    }
  }
}

module.exports = {
  generateFileHash: FileHelpers.generateFileHash.bind(FileHelpers),
  validateFileType: FileHelpers.validateFileType.bind(FileHelpers),
  scanFileForMalware: FileHelpers.scanFileForMalware.bind(FileHelpers),
  optimizeImage: FileHelpers.optimizeImage.bind(FileHelpers),
  createThumbnail: FileHelpers.createThumbnail.bind(FileHelpers),
  cleanupTempFiles: FileHelpers.cleanupTempFiles.bind(FileHelpers),
  getFileInfo: FileHelpers.getFileInfo.bind(FileHelpers),
  ensureDirectoryExists: FileHelpers.ensureDirectoryExists.bind(FileHelpers)
};