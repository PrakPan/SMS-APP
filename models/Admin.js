// models/Admin.js
const mongoose = require('mongoose');

const adminSchema = new mongoose.Schema({
    username: {
        type: String,
        required: true,
    },
    password: {
        type: String,
        required: true,
    },
    customMessage: {
        type: String,
        default: 'Thank you for submitting the form!',
    },
    users: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
    }],
});

module.exports = mongoose.model('Admin', adminSchema);
