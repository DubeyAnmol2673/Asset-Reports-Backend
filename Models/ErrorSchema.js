

// models/ErrorLog.js

const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const errorSchema = new Schema({
  name: {
    type: String,
    required: true,
    // Example values: 'chat-completion', 'audio-processing', 'audio-split', etc.
  },
  message: {
    type: String,
    required: true,
  },
 
  errorCode: {
    type: String,
    required: true,
  },
  statusCode: {
    type: Number,
    default: 500,
  },

  createdAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model('ErrorSchema', errorSchema);
