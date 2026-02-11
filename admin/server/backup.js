const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const { exec } = require('child_process');
const crypto = require('crypto');
const Backup = require('./models/Backup');

class BackupSystem {
  constructor() {
    this.backupDir = path.join(__dirname, 'backups');
    this.ensureBackupDir();
  }

  ensureBackupDir() {
    if (!fs.existsSync(this.backupDir)) {
      fs.mkdirSync(this.backupDir, { recursive: true });
    }
  }

  async deleteAllBackups() {
    try {
      console.log('=== DELETE ALL BACKUPS DEBUG ===');
      console.log('Backup directory:', this.backupDir);
      
      const allFiles = fs.readdirSync(this.backupDir);
      console.log('All files in directory:', allFiles);
      
      const jsonFiles = allFiles.filter(file => file.endsWith('.json'));
      console.log('JSON files found:', jsonFiles);
      
      if (jsonFiles.length === 0) {
        console.log('No JSON backup files found to delete');
        return;
      }
      
      // Delete all JSON files and their compressed versions
      for (const jsonFile of jsonFiles) {
        const jsonPath = path.join(this.backupDir, jsonFile);
        const compressedPath = jsonPath.replace('.json', '.json.gz');
        
        console.log(`Deleting JSON file: ${jsonFile}`);
        fs.unlinkSync(jsonPath);
        
        if (fs.existsSync(compressedPath)) {
          console.log(`Deleting compressed file: ${path.basename(compressedPath)}`);
          fs.unlinkSync(compressedPath);
        }
      }
      
      // Verify all files are deleted
      const remainingFiles = fs.readdirSync(this.backupDir).filter(file => file.endsWith('.json'));
      console.log('Remaining JSON files after deletion:', remainingFiles.length);
      
      console.log('=== DELETE ALL BACKUPS COMPLETE ===');
      
    } catch (error) {
      console.error('Error deleting all backups:', error);
      console.error('Stack trace:', error.stack);
    }
  }

  async deleteLatestBackup() {
    try {
      console.log('=== DELETE LATEST BACKUP DEBUG ===');
      console.log('Backup directory:', this.backupDir);
      
      const allFiles = fs.readdirSync(this.backupDir);
      console.log('All files in directory:', allFiles);
      
      const jsonFiles = allFiles.filter(file => file.endsWith('.json'));
      console.log('JSON files found:', jsonFiles);
      
      if (jsonFiles.length === 0) {
        console.log('No JSON backup files found to delete');
        return;
      }
      
      const filesWithStats = jsonFiles.map(file => {
        const filePath = path.join(this.backupDir, file);
        const stats = fs.statSync(filePath);
        return {
          name: file,
          path: filePath,
          mtime: stats.mtime,
          size: stats.size
        };
      });
      
      console.log('Files with stats:', filesWithStats);
      
      // Sort by modification time, newest first
      filesWithStats.sort((a, b) => b.mtime - a.mtime);
      
      const latestBackup = filesWithStats[0];
      console.log('Latest backup to delete:', latestBackup);
      
      // Check if file exists before deletion
      const existsBefore = fs.existsSync(latestBackup.path);
      console.log('File exists before deletion:', existsBefore);
      
      if (existsBefore) {
        // Delete the JSON file
        console.log('Attempting to delete:', latestBackup.path);
        fs.unlinkSync(latestBackup.path);
        console.log('Successfully deleted JSON file');
        
        // Verify deletion
        const existsAfter = fs.existsSync(latestBackup.path);
        console.log('File exists after deletion:', existsAfter);
      }
      
      // Also delete the compressed version
      const compressedPath = latestBackup.path.replace('.json', '.json.gz');
      console.log('Checking for compressed file:', compressedPath);
      
      if (fs.existsSync(compressedPath)) {
        console.log('Deleting compressed file');
        fs.unlinkSync(compressedPath);
        console.log('Successfully deleted compressed file');
      } else {
        console.log('No compressed file found');
      }
      
      // Check final file count
      const finalFiles = fs.readdirSync(this.backupDir).filter(file => file.endsWith('.json'));
      console.log('Final JSON file count:', finalFiles.length);
      
      console.log('=== DELETE LATEST BACKUP COMPLETE ===');
      
    } catch (error) {
      console.error('Error deleting latest backup:', error);
      console.error('Stack trace:', error.stack);
    }
  }

  async createBackup(backupType = 'manual', triggeredBy = 'system') {
    let backupRecord = null;
    
    try {
      console.log('=== CREATE BACKUP START ===');
      console.log('Database connection state:', mongoose.connection.readyState);
      console.log('Backup model available:', !!Backup);
      
      // Check if database is connected
      if (mongoose.connection.readyState !== 1) {
        console.log('Database not connected, skipping database storage');
        return await this.createBackupFileOnly(backupType, triggeredBy);
      }
      
      // Delete the most recent backup before creating a new one
      console.log('Calling deleteLatestBackup...');
      await this.deleteLatestBackup();
      console.log('deleteLatestBackup completed');
      
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupFileName = `backup-${timestamp}.json`;
      const backupPath = path.join(this.backupDir, backupFileName);
      
      console.log('Starting backup process...');
      console.log('Creating backup file:', backupFileName);
      
      // Create backup record in database
      try {
        backupRecord = new Backup({
          fileName: backupFileName,
          originalFileName: backupFileName,
          filePath: backupPath,
          compressedPath: path.join(this.backupDir, `backup-${timestamp}.json.gz`),
          backupType: backupType,
          triggeredBy: triggeredBy,
          status: 'in_progress'
        });
        
        await backupRecord.save();
        console.log('Backup record created in database:', backupRecord._id);
      } catch (dbError) {
        console.error('Failed to create backup record in database:', dbError);
        console.log('Continuing with file-only backup...');
        return await this.createBackupFileOnly(backupType, triggeredBy);
      }
      
      // Get all collections
      const collections = await mongoose.connection.db.listCollections().toArray();
      const backupData = {
        timestamp: new Date().toISOString(),
        version: '1.0',
        collections: {}
      };

      const collectionStats = [];

      // Backup each collection
      for (const collection of collections) {
        const collectionName = collection.name;
        console.log(`Backing up collection: ${collectionName}`);
        
        const documents = await mongoose.connection.db
          .collection(collectionName)
          .find({})
          .toArray();
        
        backupData.collections[collectionName] = documents;
        
        collectionStats.push({
          name: collectionName,
          count: documents.length
        });
        
        console.log(`Backed up ${documents.length} documents from ${collectionName}`);
      }

      // Save backup to file
      fs.writeFileSync(backupPath, JSON.stringify(backupData, null, 2));
      
      // Create compressed version
      const compressedPath = path.join(this.backupDir, `backup-${timestamp}.json.gz`);
      await this.compressBackup(backupPath, compressedPath);
      
      // Get file sizes
      const fileSize = fs.statSync(backupPath).size;
      const compressedFileSize = fs.statSync(compressedPath).size;
      
      // Update backup record with completion details
      console.log('Updating backup record with completion details...');
      console.log('File size:', fileSize);
      console.log('Compressed file size:', compressedFileSize);
      console.log('Document count:', this.getTotalDocumentCount(backupData));
      
      backupRecord.status = 'completed';
      backupRecord.completedAt = new Date();
      backupRecord.size = fileSize;
      backupRecord.compressedSize = compressedFileSize;
      backupRecord.documentCount = this.getTotalDocumentCount(backupData);
      backupRecord.collections = collectionStats;
      
      try {
        await backupRecord.save();
        console.log('Backup record updated with completion details');
      } catch (saveError) {
        console.error('Failed to save completed backup record:', saveError);
        throw saveError;
      }
      
      // Clean up old backups (keep last 10)
      await this.cleanupOldBackups();
      
      console.log(`Backup completed successfully: ${backupFileName}`);
      
      return {
        success: true,
        fileName: backupFileName,
        size: fileSize,
        compressedSize: compressedFileSize,
        documentCount: this.getTotalDocumentCount(backupData),
        backupId: backupRecord._id
      };
      
    } catch (error) {
      console.error('Backup failed:', error);
      
      // Update backup record with error
      if (backupRecord) {
        backupRecord.status = 'failed';
        backupRecord.error = error.message;
        backupRecord.completedAt = new Date();
        await backupRecord.save();
        console.log('Backup record updated with error details');
      }
      
      return {
        success: false,
        error: error.message
      };
    }
  }

  async createBackupFileOnly(backupType = 'manual', triggeredBy = 'system') {
    try {
      console.log('=== CREATE BACKUP FILE-ONLY START ===');
      
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupFileName = `backup-${timestamp}.json`;
      const backupPath = path.join(this.backupDir, backupFileName);
      
      console.log('Starting file-only backup process...');
      console.log('Creating backup file:', backupFileName);
      
      // Delete ALL existing backups when fallback is activated
      console.log('Fallback mode: Deleting all existing backups...');
      await this.deleteAllBackups();
      console.log('All existing backups deleted');
      
      // Get all collections
      const collections = await mongoose.connection.db.listCollections().toArray();
      const backupData = {
        timestamp: new Date().toISOString(),
        version: '1.0',
        collections: {}
      };

      // Backup each collection
      for (const collection of collections) {
        const collectionName = collection.name;
        console.log(`Backing up collection: ${collectionName}`);
        
        const documents = await mongoose.connection.db
          .collection(collectionName)
          .find({})
          .toArray();
        
        backupData.collections[collectionName] = documents;
        console.log(`Backed up ${documents.length} documents from ${collectionName}`);
      }

      // Save backup to file
      fs.writeFileSync(backupPath, JSON.stringify(backupData, null, 2));
      
      // Create compressed version
      const compressedPath = path.join(this.backupDir, `backup-${timestamp}.json.gz`);
      await this.compressBackup(backupPath, compressedPath);
      
      // Get file sizes
      const fileSize = fs.statSync(backupPath).size;
      const compressedFileSize = fs.statSync(compressedPath).size;
      
      console.log(`File-only backup completed successfully: ${backupFileName}`);
      console.log(`Backup size: ${fileSize} bytes (compressed: ${compressedFileSize} bytes)`);
      
      return {
        success: true,
        fileName: backupFileName,
        size: fileSize,
        compressedSize: compressedFileSize,
        documentCount: this.getTotalDocumentCount(backupData),
        backupId: null // No database record
      };
      
    } catch (error) {
      console.error('File-only backup failed:', error);
      
      return {
        success: false,
        error: error.message
      };
    }
  }

  async compressBackup(inputPath, outputPath) {
    return new Promise((resolve, reject) => {
      const gzip = require('zlib').createGzip();
      const inp = fs.createReadStream(inputPath);
      const out = fs.createWriteStream(outputPath);
      
      inp.pipe(gzip).pipe(out)
        .on('finish', resolve)
        .on('error', reject);
    });
  }

  getTotalDocumentCount(backupData) {
    let count = 0;
    for (const collectionName in backupData.collections) {
      count += backupData.collections[collectionName].length;
    }
    return count;
  }

  async cleanupOldBackups() {
    try {
      const files = fs.readdirSync(this.backupDir)
        .filter(file => file.endsWith('.json'))
        .map(file => ({
          name: file,
          path: path.join(this.backupDir, file),
          mtime: fs.statSync(path.join(this.backupDir, file)).mtime
        }))
        .sort((a, b) => b.mtime - a.mtime);

      // Keep only the latest 10 backups
      if (files.length > 10) {
        const filesToDelete = files.slice(10);
        for (const file of filesToDelete) {
          fs.unlinkSync(file.path);
          // Also delete compressed version
          const compressedPath = file.path.replace('.json', '.json.gz');
          if (fs.existsSync(compressedPath)) {
            fs.unlinkSync(compressedPath);
          }
          console.log(`Deleted old backup: ${file.name}`);
        }
      }
    } catch (error) {
      console.error('Error cleaning up old backups:', error);
    }
  }

  async getBackupHistory() {
    try {
      const files = fs.readdirSync(this.backupDir)
        .filter(file => file.endsWith('.json'))
        .map(file => {
          const filePath = path.join(this.backupDir, file);
          const stats = fs.statSync(filePath);
          return {
            fileName: file,
            createdAt: stats.mtime,
            size: stats.size,
            compressedSize: fs.existsSync(filePath.replace('.json', '.json.gz')) 
              ? fs.statSync(filePath.replace('.json', '.json.gz')).size 
              : null
          };
        })
        .sort((a, b) => b.createdAt - a.createdAt);

      return files;
    } catch (error) {
      console.error('Error getting backup history:', error);
      return [];
    }
  }

  async restoreBackup(backupFileName) {
    try {
      const backupPath = path.join(this.backupDir, backupFileName);
      
      if (!fs.existsSync(backupPath)) {
        throw new Error('Backup file not found');
      }

      console.log(`Starting restore from: ${backupFileName}`);
      
      const backupData = JSON.parse(fs.readFileSync(backupPath, 'utf8'));
      
      // Clear existing data
      for (const collectionName in backupData.collections) {
        console.log(`Clearing collection: ${collectionName}`);
        await mongoose.connection.db.collection(collectionName).deleteMany({});
      }

      // Restore data
      for (const collectionName in backupData.collections) {
        const documents = backupData.collections[collectionName];
        if (documents.length > 0) {
          console.log(`Restoring ${documents.length} documents to ${collectionName}`);
          await mongoose.connection.db.collection(collectionName).insertMany(documents);
        }
      }

      console.log('Restore completed successfully');
      
      return {
        success: true,
        restoredCollections: Object.keys(backupData.collections),
        totalDocuments: this.getTotalDocumentCount(backupData)
      };
      
    } catch (error) {
      console.error('Restore failed:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  async getBackupStats() {
    try {
      const history = await this.getBackupHistory();
      const latestBackup = history[0];
      
      return {
        totalBackups: history.length,
        latestBackup: latestBackup ? {
          fileName: latestBackup.fileName,
          createdAt: latestBackup.createdAt,
          size: latestBackup.size
        } : null,
        totalSize: history.reduce((sum, backup) => sum + backup.size, 0),
        backupEnabled: true
      };
    } catch (error) {
      console.error('Error getting backup stats:', error);
      return {
        totalBackups: 0,
        latestBackup: null,
        totalSize: 0,
        backupEnabled: false
      };
    }
  }
}

module.exports = BackupSystem;
