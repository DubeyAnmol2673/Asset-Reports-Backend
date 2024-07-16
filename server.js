// app.js

const express = require('express');
const cors = require('cors');
const connectDB = require('./dbConnect/Config');

const authRoutes = require('./Routes/authRoutes');
const uploadRouter = require('./Routes/uploadRoutes');
const fetchInputText = require('./Routes/fetchInputText');
const adminRoutes = require('./Routes/adminsRoutes'); // Import admin routes
const agentRoutes = require('./Routes/agentRoutes');
const errorMiddleware = require('./Middlewares/errorMiddleware');
const errorControllers = require('./Controllers/errorControllers');
const reportRoutes = require('./Routes/reportRoutes');


const app = express();
app.use(express.json());
app.use(cors());

// Routes
app.use('/api/auth', authRoutes);
app.use('/api', uploadRouter); // Registering the upload router
//app.use('/api', audioRoutes); // Registering the upload router
app.use('/api/input', fetchInputText);
app.use('/api/admins', adminRoutes); // Use the admin routes
app.use('/api/agents', agentRoutes); // Use the admin routes
app.use('/api/errorLogs', errorControllers);
app.use('/api/reports', reportRoutes);


// Connect to the database
connectDB().catch(err => {
    console.error('Database connection error:', err);
    process.exit(1); // Exit process if database connection fails
});


app.use(errorMiddleware);


const port = process.env.PORT || 9000;

app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});
