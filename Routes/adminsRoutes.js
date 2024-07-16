// adminsRoutes.js

const express = require('express');
const router = express.Router();
const User = require('../Models/User');

// Route to get all admins
router.get('/', async (req, res,next) => {
    try {
        const admins = await User.find({ access: 'admin' }).select('username email access');
        res.json(admins);
    } catch (err) {
        console.error('Error fetching admins:', err);
      //  res.status(500).json({ message: 'Server error' });
      next(err);
    }
});

// Route to delete an admin by ID
router.delete('/:id', async (req, res,next) => {
    const { id } = req.params;
    try {
        const deletedAdmin = await User.findByIdAndDelete(id);
        if (!deletedAdmin) {
            return res.status(404).json({ message: 'Admin not found' });
        }
        res.json({ message: 'Admin deleted successfully' });
    } catch (err) {
        console.error('Error deleting admin:', err);
       // res.status(500).json({ message: 'Server error' });
       next(err);
    }
});

module.exports = router;
