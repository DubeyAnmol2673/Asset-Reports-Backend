const _ = require('lodash');
const uploadController = require('../Controllers/uploadController');

// Required keys
const requiredKeys = ['category', 'subcategory', 'clean', 'undamaged', 'working', 'comments'];

exports.validateAndFillKeys = (data, keys, defaultValue = null) => {
    return data.map(item => {
        keys.forEach(key => {
            if (!_.has(item, key)) {
                item[key] = defaultValue;
            }
        });
        return item;
    });
};
