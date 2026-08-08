const mongoose = require('mongoose')
const Schema = mongoose.Schema

const citySchema = new Schema({
  code: { type: String, required: true, unique: true, trim: true },
  provinceCode: { type: String, required: true, trim: true },
  name: { type: String, required: true, trim: true },
  type: { type: String, enum: ['City', 'Municipality'], default: 'Municipality' },
  zipCode: { type: String, trim: true }
}, {
  timestamps: true
})

citySchema.index({ name: 1 })
citySchema.index({ provinceCode: 1, name: 1 })

module.exports = mongoose.model('City', citySchema)
