const jwt = require('jsonwebtoken');
const Admin = require('../models/Admin');
const User = require('../models/User');

require('dotenv').config();

module.exports.adminAuth = async (req, res, next) => {
    const token = req.header('Authorization').replace('Bearer ', '');

    try {
        const decoded = jwt.verify(token, process.env.SECRET_KEY);
        const admin = await Admin.findOne({ _id: decoded.userId });

        if (!admin) {
            throw new Error();
        }

        req.admin = admin;
        next();
    } catch (error) {
        res.status(401).send({ error: 'Please authenticate as admin' });
    }
};


module.exports.userAuth = async (req, res, next) => {
    const token = req.header('Authorization')?.replace('Bearer ', '');

    if (!token) {
        return res.status(401).json({ error: 'Authentication token is required' });
    }

    try {
        const decoded = jwt.verify(token, process.env.SECRET_KEY);
        const user = await User.findById(decoded.userId);

        if (!user) {
            throw new Error();
        }

        req.user = user;
        next();
    } catch (error) {
        res.status(401).json({ error: 'Please authenticate' });
    }
};

