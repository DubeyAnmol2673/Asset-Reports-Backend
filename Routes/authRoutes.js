const express = require('express');
const router = express.Router();
const authController = require('../Controllers/authControllers');

router.post('/register', authController.register);
router.post('/login', authController.login);
router.post('/forget-password', authController.forgetPassword);
router.post('/reset-password', authController.resetPassword);

module.exports = router;