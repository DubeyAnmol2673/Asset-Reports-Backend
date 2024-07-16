// Assuming you have already set up Express and imported necessary modules
const express = require('express');
const router = express.Router();
const Response = require('../Models/ResponseSchema');

// Endpoint to fetch inputText from database
router.get('/fetch-input-text', async (req, res,next) => {
    try {
        // Fetch inputText from the database
        const inputTexts = await Response.find({}, 'inputText');

        // Extract inputTexts from the query result
        const inputTextList = inputTexts.map(response => response.inputText);

        console.log('Fetched inputTexts:', inputTextList); // Console log fetched inputTexts

        res.status(200).json(inputTextList);
    } catch (error) {
        console.error('Error fetching inputText:', error);
       // res.status(500).json({ message: 'Internal server error' });
        next(error);
    }
});

module.exports = router;
