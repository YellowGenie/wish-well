const FormData = require('form-data');
const fs = require('fs');
const axios = require('axios');

class FilestoreService {
  constructor() {
    this.baseUrl = process.env.FILESTORE_API_URL || 'https://filestore.dozyr.co';
    this.apiKey = process.env.FILESTORE_API_KEY || 'dozyr_filestore_2024_main_api_key_secure_token_xyz789';
  }

  async uploadFile(filePath, category, userId, originalName) {
    try {
      const formData = new FormData();
      formData.append('file', fs.createReadStream(filePath), {
        filename: originalName
      });
      formData.append('userId', userId);

      const response = await axios.post(
        `${this.baseUrl}/api/upload/${category}`,
        formData,
        {
          headers: {
            ...formData.getHeaders(),
            'X-API-Key': this.apiKey
          },
          maxContentLength: Infinity,
          maxBodyLength: Infinity
        }
      );

      // Log the response for debugging
      console.log('Filestore API response:', JSON.stringify(response.data, null, 2));

      const responseData = response.data.data;

      // Replace filestore API URLs with direct upload URLs for public access
      if (responseData.url && responseData.url.includes('filestore.dozyr.co/api/file/')) {
        responseData.url = responseData.url.replace('/api/file/', '/uploads/');
        console.log('Converted filestore API URL to direct URL:', responseData.url);
      }

      return {
        success: true,
        data: responseData
      };
    } catch (error) {
      console.error('Filestore upload error:', error.response?.data || error.message);
      return {
        success: false,
        error: error.response?.data?.error || error.message
      };
    }
  }

  async deleteFile(category, fileName) {
    try {
      const response = await axios.delete(
        `${this.baseUrl}/api/file/${category}/${fileName}`,
        {
          headers: {
            'X-API-Key': this.apiKey
          }
        }
      );

      return {
        success: true,
        data: response.data.data
      };
    } catch (error) {
      console.error('Filestore delete error:', error.response?.data || error.message);
      return {
        success: false,
        error: error.response?.data?.error || error.message
      };
    }
  }

  getFileUrl(category, fileName) {
    return `${this.baseUrl}/api/file/${category}/${fileName}`;
  }

  // Upload profile picture
  async uploadProfilePicture(filePath, userId, originalName) {
    return this.uploadFile(filePath, 'profiles', userId, originalName);
  }

  // Upload document (contracts, proposals, etc.)
  async uploadDocument(filePath, userId, originalName) {
    return this.uploadFile(filePath, 'documents', userId, originalName);
  }

  // Upload attachment (message attachments, etc.)
  async uploadAttachment(filePath, userId, originalName) {
    return this.uploadFile(filePath, 'attachments', userId, originalName);
  }

  // Delete profile picture
  async deleteProfilePicture(fileName) {
    return this.deleteFile('profiles', fileName);
  }

  // Delete document
  async deleteDocument(fileName) {
    return this.deleteFile('documents', fileName);
  }

  // Delete attachment
  async deleteAttachment(fileName) {
    return this.deleteFile('attachments', fileName);
  }

  // Get profile picture URL
  getProfilePictureUrl(fileName) {
    return this.getFileUrl('profiles', fileName);
  }

  // Get document URL
  getDocumentUrl(fileName) {
    return this.getFileUrl('documents', fileName);
  }

  // Get attachment URL
  getAttachmentUrl(fileName) {
    return this.getFileUrl('attachments', fileName);
  }

  // Extract filename from filestore URL
  extractFileNameFromUrl(url) {
    if (!url || !url.includes(this.baseUrl)) {
      return null;
    }

    const urlParts = url.split('/');
    return urlParts[urlParts.length - 1];
  }

  // Validate file category
  isValidCategory(category) {
    return ['profiles', 'documents', 'attachments'].includes(category);
  }

  // Get file extension from filename
  getFileExtension(fileName) {
    return fileName.split('.').pop().toLowerCase();
  }

  // Check if file type is allowed for category
  isFileTypeAllowed(fileName, category) {
    const extension = this.getFileExtension(fileName);

    const allowedTypes = {
      profiles: ['jpg', 'jpeg', 'png', 'gif', 'webp'],
      documents: ['pdf', 'doc', 'docx', 'txt', 'rtf'],
      attachments: ['jpg', 'jpeg', 'png', 'gif', 'pdf', 'doc', 'docx', 'zip', 'rar']
    };

    return allowedTypes[category]?.includes(extension) || false;
  }
}

module.exports = new FilestoreService();