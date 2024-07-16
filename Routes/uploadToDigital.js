const express = require('express');
const router = express.Router();
const digitalOceanController = require('../Controllers/digitalOceanController');
const multer = require('multer');
const finalUploadController = require('../Controllers/fullUploadController');

// Setup multer for handling file uploads in memory
const storage = multer.memoryStorage();
const upload = multer({ storage });

// Route to handle file upload
//router.post('/translate', upload.single('file'), digitalOceanController.uploadFile);

router.post('/translate', finalUploadController.useChatResponse);

module.exports = router;
