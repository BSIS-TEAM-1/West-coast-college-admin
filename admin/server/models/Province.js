const mongoose = require('mongoose')
const Schema = mongoose.Schema

const provinceSchema = new Schema({
  code: { type: String, required: true, unique: true, trim: true },
  regionCode: { type: String, required: true, trim: true },
  name: { type: String, required: true, trim: true }
}, {
  timestamps: true
})

provinceSchema.index({ name: 1 })
provinceSchema.index({ regionCode: 1, name: 1 })

module.exports = mongoose.model('Province', provinceSchema)
