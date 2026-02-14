const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const counterSchema = new Schema({
  // Counter identifier (e.g., 'student_BSIT_2024-2025')
  _id: { 
    type: String, 
    required: true 
  },
  // Current sequence number
  sequence: { 
    type: Number, 
    default: 0 
  },
  // Last updated timestamp
  lastUpdated: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: {
    createdAt: 'createdAt',
    updatedAt: 'updatedAt'
  }
});

// Method to increment and get next sequence number
counterSchema.statics.getNextSequence = async function(counterId) {
  const result = await this.findOneAndUpdate(
    { _id: counterId },
    { 
      $inc: { sequence: 1 },
      $set: { lastUpdated: new Date() }
    },
    { 
      new: true,
      upsert: true,
      setDefaultsOnInsert: true
    }
  );
  return result.sequence;
};

// Static method to get current sequence number
counterSchema.statics.getCurrentSequence = async function(counterId) {
  const counter = await this.findById(counterId);
  return counter ? counter.sequence : 0;
};

// Method to reset counter
counterSchema.statics.resetCounter = async function(counterId, newValue = 0) {
  await this.findOneAndUpdate(
    { _id: counterId },
    { 
      $set: { 
        sequence: newValue,
        lastUpdated: new Date()
      }
    },
    { 
      upsert: true,
      setDefaultsOnInsert: true
    }
  );
};

const Counter = mongoose.model('Counter', counterSchema);

module.exports = Counter;
