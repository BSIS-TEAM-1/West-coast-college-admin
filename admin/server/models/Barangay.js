const mongoose = require('mongoose')
const Schema = mongoose.Schema

const barangaySchema = new Schema({
  code: { type: String, required: true, unique: true, trim: true },
  cityCode: { type: String, required: true, trim: true },
  name: { type: String, required: true, trim: true },
  status: { type: String, trim: true, default: '' }
}, {
  timestamps: true
})

barangaySchema.index({ name: 1 })
barangaySchema.index({ cityCode: 1, name: 1 })

module.exports = mongoose.model('Barangay', barangaySchema)
