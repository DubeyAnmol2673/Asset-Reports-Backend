const mongoose = require('mongoose');

const responseSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    username: {
        type: String,
        required: true
    },
    fileId: {
        type: String,
        required: true
    },
    inputText: {
        type: String,
        required: true
    },
    chatResponse: {
        type: Object,
        required: true
    },
    translations: {
        type: String, // Assuming translations are stored as a concatenated string
        required: true
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

module.exports = mongoose.model('Response', responseSchema);
