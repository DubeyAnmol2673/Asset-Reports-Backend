

const express = require('express');
const router = express.Router();
const User = require('../Models/User');

// Route to get all agents
router.get('/', async (req, res,next) => {
    try {
        const agents = await User.find({ access: 'agent' }).select('username email access');
        res.json(agents);
    } catch (err) {
        console.error('Error fetching agents:', err);
      //  res.status(500).json({ message: 'Server error' });
      next(err);
    }
});

// Route to delete an admin by ID
router.delete('/:id', async (req, res,next) => {
    const { id } = req.params;
    try {
        const deletedAgent = await User.findByIdAndDelete(id);
        if (!deletedAgent) {
            return res.status(404).json({ message: 'Agent not found' });
        }
        res.json({ message: 'Agent deleted successfully' });
    } catch (err) {
        console.error('Error deleting agent:', err);
        //res.status(500).json({ message: 'Server error' });
        next(err);
    }
});

module.exports = router;
