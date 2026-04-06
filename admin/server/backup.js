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
    const normalizedBackupType = String(backupType || 'manual').trim().toLowerCase();
    const normalizedTriggeredBy = normalizedBackupType === 'manual'
      ? String(triggeredBy || '').trim() || 'system'
      : 'system';
    
    try {
      console.log('=== CREATE BACKUP START ===');
      console.log('Database connection state:', mongoose.connection.readyState);
      console.log('Backup model available:', !!Backup);
      
      // Check if database is connected
      if (mongoose.connection.readyState !== 1) {
        console.log('Database not connected, skipping database storage');
        return await this.createBackupFileOnly(normalizedBackupType, normalizedTriggeredBy);
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
          backupType: normalizedBackupType,
          triggeredBy: normalizedTriggeredBy,
          status: 'in_progress'
        });
        
        await backupRecord.save();
        console.log('Backup record created in database:', backupRecord._id);
      } catch (dbError) {
        console.error('Failed to create backup record in database:', dbError);
        console.log('Continuing with file-only backup...');
        return await this.createBackupFileOnly(normalizedBackupType, normalizedTriggeredBy);
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
      const normalizedBackupType = String(backupType || 'manual').trim().toLowerCase();
      const normalizedTriggeredBy = normalizedBackupType === 'manual'
        ? String(triggeredBy || '').trim() || 'system'
        : 'system';
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
      
      // Get all collections - check if connection exists
      if (!mongoose.connection.db) {
        throw new Error('Database not connected');
      }
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
        backupId: null, // No database record
        backupType: normalizedBackupType,
        triggeredBy: normalizedTriggeredBy
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

  /**
   * PRODUCTION-SAFE RESTORE METHOD
   * This method implements a non-destructive restore flow with validation and rollback
   */
  async restoreBackup(backupFileName) {
    let preRestoreBackup = null;
    let tempCollections = [];
    const originalCollections = [];
    
    try {
      console.log('=== PRODUCTION-SAFE RESTORE START ===');
      console.log(`Target backup: ${backupFileName}`);
      
      const backupPath = path.join(this.backupDir, path.basename(backupFileName));
      
      if (!fs.existsSync(backupPath)) {
        throw new Error('Backup file not found');
      }

      // STEP 1: Create pre-restore safety backup
      console.log('STEP 1: Creating pre-restore safety backup...');
      preRestoreBackup = await this.createBackup('pre-restore', 'restore-operation');
      if (!preRestoreBackup.success) {
        throw new Error(`Failed to create pre-restore backup: ${preRestoreBackup.error}`);
      }
      console.log(`Pre-restore backup created: ${preRestoreBackup.fileName}`);

      // STEP 2: Load and validate backup file
      console.log('STEP 2: Loading and validating backup file...');
      const backupData = JSON.parse(fs.readFileSync(backupPath, 'utf8'));
      
      const validation = this.validateBackupData(backupData);
      if (!validation.isValid) {
        throw new Error(`Backup validation failed: ${validation.errors.join(', ')}`);
      }
      console.log('Backup file validation passed:', validation.summary);

      // STEP 3: Get current collection names for rollback
      console.log('STEP 3: Recording current collection structure...');
      const currentCollections = await mongoose.connection.db.listCollections().toArray();
      for (const collection of currentCollections) {
        originalCollections.push(collection.name);
      }

      // STEP 4: Restore to temporary collections
      console.log('STEP 4: Restoring to temporary collections...');
      for (const collectionName in backupData.collections) {
        const tempCollectionName = `temp_restore_${collectionName}_${Date.now()}`;
        const documents = backupData.collections[collectionName];
        
        if (documents.length > 0) {
          console.log(`Restoring ${documents.length} documents to temp collection: ${tempCollectionName}`);
          
          // Create temporary collection and insert data
          await mongoose.connection.db.createCollection(tempCollectionName);
          await mongoose.connection.db.collection(tempCollectionName).insertMany(documents);
          tempCollections.push({
            original: collectionName,
            temporary: tempCollectionName,
            documentCount: documents.length
          });
        }
      }

      // STEP 5: Validate temporary collections
      console.log('STEP 5: Validating temporary collections...');
      const tempValidation = await this.validateTemporaryCollections(tempCollections);
      if (!tempValidation.isValid) {
        throw new Error(`Temporary collection validation failed: ${tempValidation.errors.join(', ')}`);
      }
      console.log('Temporary collections validated successfully:', tempValidation.summary);

      // STEP 6: Atomic swap - backup current collections to temp names
      console.log('STEP 6: Creating atomic swap backup...');
      const swapBackupName = `swap_backup_${Date.now()}`;
      const swapCollections = [];
      
      for (const temp of tempCollections) {
        const originalCollection = temp.original;
        const tempCollection = temp.temporary;
        const swapCollection = `${swapBackupName}_${originalCollection}`;
        
        // Rename original collection to swap name
        if (originalCollections.includes(originalCollection)) {
          await mongoose.connection.db.collection(originalCollection).rename(swapCollection);
          swapCollections.push({
            original: originalCollection,
            swap: swapCollection
          });
        }
        
        // Rename temp collection to original name
        await mongoose.connection.db.collection(tempCollection).rename(originalCollection);
      }

      // STEP 7: Final validation after swap
      console.log('STEP 7: Final validation after swap...');
      const finalValidation = await this.validateFinalRestore(backupData, tempCollections);
      if (!finalValidation.isValid) {
        throw new Error(`Final validation failed: ${finalValidation.errors.join(', ')}`);
      }

      // STEP 8: Cleanup swap collections (success path)
      console.log('STEP 8: Cleanup - removing swap collections...');
      for (const swap of swapCollections) {
        await mongoose.connection.db.collection(swap.swap).drop();
      }

      console.log('=== PRODUCTION-SAFE RESTORE COMPLETED SUCCESSFULLY ===');
      
      return {
        success: true,
        restoredCollections: tempCollections.map(t => t.original),
        totalDocuments: this.getTotalDocumentCount(backupData),
        preRestoreBackup: preRestoreBackup.fileName,
        validationResults: {
          backup: validation,
          temporary: tempValidation,
          final: finalValidation
        }
      };
      
    } catch (error) {
      console.error('PRODUCTION-SAFE RESTORE FAILED:', error.message);
      
      // ROLLBACK: Attempt to restore original state
      try {
        console.log('ATTEMPTING ROLLBACK...');
        
        // Drop any temporary collections that were created
        for (const temp of tempCollections) {
          try {
            await mongoose.connection.db.collection(temp.temporary).drop();
            console.log(`Dropped temporary collection: ${temp.temporary}`);
          } catch (dropError) {
            console.log(`Could not drop temp collection ${temp.temporary}:`, dropError.message);
          }
        }
        
        // Restore from swap collections if they exist
        const swapCollections = await mongoose.connection.db.listCollections().toArray();
        for (const collection of swapCollections) {
          if (collection.name.startsWith('swap_backup_')) {
            const originalName = collection.name.replace(/^swap_backup_\d+_/, '');
            try {
              await mongoose.connection.db.collection(collection.name).rename(originalName);
              console.log(`Restored collection from swap: ${collection.name} -> ${originalName}`);
            } catch (renameError) {
              console.error(`Failed to restore from swap ${collection.name}:`, renameError.message);
            }
          }
        }
        
        console.log('ROLLBACK COMPLETED');
        
      } catch (rollbackError) {
        console.error('ROLLBACK FAILED - DATABASE MAY BE IN INCONSISTENT STATE:', rollbackError.message);
      }
      
      return {
        success: false,
        error: error.message,
        preRestoreBackup: preRestoreBackup ? preRestoreBackup.fileName : null,
        rollbackAttempted: true,
        criticalState: error.message.includes('ROLLBACK FAILED')
      };
    }
  }

  /**
   * Validate backup data before restore
   */
  validateBackupData(backupData) {
    const errors = [];
    const warnings = [];
    
    // Check basic structure
    if (!backupData.collections) {
      errors.push('Missing collections data');
    }
    
    if (!backupData.timestamp) {
      errors.push('Missing backup timestamp');
    }
    
    if (!backupData.version) {
      warnings.push('Missing backup version');
    }
    
    // Check for required collections
    const requiredCollections = ['admins', 'announcements', 'students', 'documents'];
    for (const required of requiredCollections) {
      if (!backupData.collections[required]) {
        warnings.push(`Missing required collection: ${required}`);
      }
    }
    
    // Check document counts are reasonable
    for (const [collectionName, documents] of Object.entries(backupData.collections)) {
      if (!Array.isArray(documents)) {
        errors.push(`Collection ${collectionName} is not an array`);
      } else if (documents.length > 100000) {
        warnings.push(`Collection ${collectionName} has unusually high document count: ${documents.length}`);
      }
    }
    
    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      summary: `Found ${Object.keys(backupData.collections).length} collections, ${errors.length} errors, ${warnings.length} warnings`
    };
  }

  /**
   * Validate temporary collections after restore
   */
  async validateTemporaryCollections(tempCollections) {
    const errors = [];
    let totalDocuments = 0;
    
    for (const temp of tempCollections) {
      try {
        const count = await mongoose.connection.db.collection(temp.temporary).countDocuments();
        totalDocuments += count;
        
        if (count !== temp.documentCount) {
          errors.push(`Document count mismatch in ${temp.original}: expected ${temp.documentCount}, found ${count}`);
        }
      } catch (countError) {
        errors.push(`Failed to count documents in ${temp.temporary}: ${countError.message}`);
      }
    }
    
    return {
      isValid: errors.length === 0,
      errors,
      summary: `Validated ${tempCollections.length} temp collections with ${totalDocuments} total documents`
    };
  }

  /**
   * Final validation after atomic swap
   */
  async validateFinalRestore(backupData, tempCollections) {
    const errors = [];
    
    for (const temp of tempCollections) {
      try {
        const count = await mongoose.connection.db.collection(temp.original).countDocuments();
        const expectedCount = backupData.collections[temp.original].length;
        
        if (count !== expectedCount) {
          errors.push(`Final count mismatch in ${temp.original}: expected ${expectedCount}, found ${count}`);
        }
      } catch (countError) {
        errors.push(`Failed to count final documents in ${temp.original}: ${countError.message}`);
      }
    }
    
    return {
      isValid: errors.length === 0,
      errors,
      summary: `Final validation completed for ${tempCollections.length} collections`
    };
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
