const mongoose = require('mongoose');

const SystemSettingSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true, index: true },
  value: { type: mongoose.Schema.Types.Mixed }
}, {
  timestamps: true
});

module.exports = mongoose.model('SystemSetting', SystemSettingSchema);
