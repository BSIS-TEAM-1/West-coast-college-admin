const mongoose = require('mongoose')
const Schema = mongoose.Schema

const schoolSchema = new Schema({
  schoolId: { type: String, trim: true, index: true },
  name: { type: String, required: true, trim: true },
  region: { type: String, trim: true, index: true },
  division: { type: String, trim: true, index: true },
  district: { type: String, trim: true },
  streetAddress: { type: String, trim: true },
  municipality: { type: String, trim: true, index: true },
  legislativeDistrict: { type: String, trim: true },
  barangay: { type: String, trim: true },
  sector: { type: String, trim: true },
  urbanRuralClassification: { type: String, trim: true },
  subclassification: { type: String, trim: true },
  modifiedCurricularOffering: { type: String, trim: true }
}, {
  timestamps: true
})

schoolSchema.index({ name: 1 })
schoolSchema.index({ name: 'text' })

module.exports = mongoose.model('School', schoolSchema)
