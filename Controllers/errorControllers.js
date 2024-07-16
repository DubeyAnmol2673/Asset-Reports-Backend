// routes/errorLogs.js

const express = require('express');
const router = express.Router();
const ErrorLog = require('../Models/ErrorSchema');

// Route to get all error logs
router.get('/', async (req, res,next) => {
    try {
        const errorLogs = await ErrorLog.find().sort({ createdAt: -1 }); // Sort by newest first
        res.json(errorLogs);
    } catch (error) {
        const err = new Error('Error Data fetched unsuccessfully');
      
        err.name = "Error Controller";
        next(err);
    }
});

module.exports = router;
