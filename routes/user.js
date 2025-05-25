const express = require('express');
const { signInUser, submitForm, selectEmoji } = require('../controllers/userController');
const { userAuth } = require('../middleware/auth');
const router = express.Router();

router.post('/sign-in', signInUser);
router.post('/submit-form', userAuth, submitForm);
router.post('/select-emoji', userAuth, selectEmoji);

module.exports = router;
