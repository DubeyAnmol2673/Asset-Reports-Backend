const express = require('express');
const router = express.Router();
const uploadController = require('../Controllers/uploadController');
const digitalOceanController = require('../Controllers/digitalOceanController');


router.post('/translate', (req, res, next) => {
    console.log('abc');
    next(); // Pass control to the next handler
}, uploadController.useChatResponse);


// router.post('/upload', (req, res, next) => {
//     console.log('upload');
//     next(); // Pass control to the next handler
// }, uploadController.useUploadFile);

router.post('/upload', (req, res, next) => {
    console.log('upload');
    next(); // Pass control to the next handler
}, digitalOceanController.uploadFile);



module.exports = router;
