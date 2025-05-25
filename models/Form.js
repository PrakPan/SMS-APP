const mongoose = require('mongoose');

const formSchema = new mongoose.Schema({
    // name: {
    //     type: String,
    //     required: true,
    // },
    contactNo: {
        type: String,
        required: true,
    },
    city: String,
    remarks: String,
    selectedEmoji: String,
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },
});

const Form = mongoose.model('Form', formSchema);

module.exports = Form;
