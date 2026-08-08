const mongoose = require('mongoose')
const Schema = mongoose.Schema

const regionSchema = new Schema({
  code: { type: String, required: true, unique: true, trim: true },
  name: { type: String, required: true, trim: true }
}, {
  timestamps: true
})

regionSchema.index({ name: 1 })

module.exports = mongoose.model('Region', regionSchema)
