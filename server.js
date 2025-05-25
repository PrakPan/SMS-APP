const express = require('express');
const bodyParser = require('body-parser');
const mongoose = require('mongoose');
require('dotenv').config();

const app = express();
const port = 3000;
const connectDB = require('./db');
const adminRoutes = require('./routes/admin');
const userRoutes = require('./routes/user');
const Admin = require('./models/Admin');
const bcrypt = require('bcryptjs');

// Connect to MongoDB
connectDB();

app.use(bodyParser.json());

// Use routes
app.use('/api/admin', adminRoutes);
app.use('/api/user', userRoutes);

// Create default admin if not exists
const createDefaultAdmin = async () => {
    const adminExists = await Admin.findOne({ username: 'admin' });

    if (!adminExists) {
        const hashedPassword = bcrypt.hashSync('Admin#2050', 8);
        const admin = new Admin({ username: 'admin', password: hashedPassword });
        await admin.save();
        console.log('Default admin created');
    }
};

createDefaultAdmin();

app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});
