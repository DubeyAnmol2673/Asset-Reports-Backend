const express = require('express');
const router = express.Router();
const reportController = require('../Controllers/reportController');


router.get('/', (req, res, next) => {
    console.log('get reports endpoint hit');
    next(); // Pass control to the next handler
}, reportController.getReports);


// Dynamic route for downloading reports with reportId and format parameters
router.get('/download/:reportId/:format', reportController.downloadReport);

module.exports = router;