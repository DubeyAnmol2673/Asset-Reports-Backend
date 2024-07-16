const mongoose = require('mongoose');
require('dotenv').config();

const connectDB = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI, {});
        console.log("DB Connection Successful");
    } catch (err) {
        console.error("Error while connecting to DB:", err);
        throw new Error("Database connection error"); // Throw error to be caught by error middleware
    }
};

module.exports = connectDB;
