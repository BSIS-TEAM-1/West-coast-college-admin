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

  // ... (keep all existing methods: deleteAllBackups, deleteLatestBackup, createBackup, etc.)

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

  // ... (keep all other existing methods unchanged)
  async deleteAllBackups() {
    // existing implementation unchanged
  }

  async deleteLatestBackup() {
    // existing implementation unchanged
  }

  async createBackup(backupType = 'manual', triggeredBy = 'system') {
    // existing implementation unchanged
  }

  async createBackupFileOnly(backupType = 'manual', triggeredBy = 'system') {
    // existing implementation unchanged
  }

  async compressBackup(inputPath, outputPath) {
    // existing implementation unchanged
  }

  getTotalDocumentCount(backupData) {
    // existing implementation unchanged
  }

  async cleanupOldBackups() {
    // existing implementation unchanged
  }

  async getBackupHistory() {
    // existing implementation unchanged
  }

  async getBackupStats() {
    // existing implementation unchanged
  }
}

module.exports = BackupSystem;
