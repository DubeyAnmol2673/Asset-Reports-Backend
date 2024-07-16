const ErrorLog = require('../Models/ErrorSchema');

const errorMiddleware = async (err, req, res, next) => {
  const statusCode = err.status || 500;
  const message = err.message || 'Internal Server Error';
  const time = new Date().toISOString();

  // Save error to the database
  const errorLog = new ErrorLog({
    name: err.name || 'Error',
    message: message,
    errorCode: statusCode,
    statusCode: statusCode,
  });

  try {
    await errorLog.save();
    console.log("error saved successfully");
  } catch (saveError) {
    console.error('Failed to save error log to database:', saveError);
  }

  // Respond to the client
  res.status(statusCode).json({
    time,
    name: err.name || 'Error',
    errorCode: statusCode,
    message,
  });
};

module.exports = errorMiddleware;
