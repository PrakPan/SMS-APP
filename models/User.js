const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    username: {
        type: String,
        required: true,
        unique: true,
    },
    password: {
        type: String,
        required: true,
    },
    admin: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Admin',
        required: true,
    },
    forms: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Form' }],
});

const User = mongoose.model('User', userSchema);

module.exports = User;
