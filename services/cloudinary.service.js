import dotenv from 'dotenv';
import { v2 as cloudinary } from 'cloudinary';
import fs from 'fs';
import path from 'path';

dotenv.config();

// Configure Cloudinary with credentials from environment variables
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

/**
 * Upload a file to Cloudinary
 * @param {String} filePath - Path to the local file
 * @param {Object} options - Additional upload options
 * @returns {Promise} - Cloudinary upload result
 */
export const uploadFile = async (filePath, options = {}) => {
  try {
    // Set default folder if not provided
    const folder = options.folder || 'marketplace';
    
    // Upload the file to Cloudinary
    const result = await cloudinary.uploader.upload(filePath, {
      folder,
      resource_type: 'auto', // Auto-detect resource type
      ...options
    });
    
    // Remove the local file after successful upload
    fs.unlinkSync(filePath);
    
    return result;
  } catch (error) {
    console.error('Cloudinary upload error:', error);
    throw error;
  }
};

/**
 * Upload multiple files to Cloudinary
 * @param {Array} filePaths - Array of local file paths
 * @param {Object} options - Additional upload options
 * @returns {Promise<Array>} - Array of Cloudinary upload results
 */
export const uploadMultipleFiles = async (filePaths, options = {}) => {
  try {
    const uploadPromises = filePaths.map(filePath => uploadFile(filePath, options));
    return await Promise.all(uploadPromises);
  } catch (error) {
    console.error('Cloudinary multiple upload error:', error);
    throw error;
  }
};

/**
 * Delete a file from Cloudinary
 * @param {String} publicId - Cloudinary public ID of the file
 * @returns {Promise} - Cloudinary deletion result
 */
export const deleteFile = async (publicId) => {
  try {
    return await cloudinary.uploader.destroy(publicId);
  } catch (error) {
    console.error('Cloudinary delete error:', error);
    throw error;
  }
};

export default {
  uploadFile,
  uploadMultipleFiles,
  deleteFile
}; 