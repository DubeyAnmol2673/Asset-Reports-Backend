const User = require('../Models/User');
const crypto = require('crypto');
const { sendEmail } = require('../Utils/email');
const jwt = require('jsonwebtoken');

const generateOTP = () => {
    return crypto.randomBytes(3).toString('hex');
};



exports.register = async (req, res, next) => {
  const { username, password, email, access } = req.body;

  if (!['admin', 'agent'].includes(access)) {
    const err = new Error('Invalid role. Must be admin or agent.');
    err.status = 400;
    err.name = "User Registration";
    return next(err);
  }

  try {
    const existingUser = await User.findOne({ $or: [{ username }, { email }] });
    if (existingUser) {
      const err = new Error('Username or email already exists.');
      err.name = "User Registration";
      err.status = 400;
      return next(err);
    }

    const newUser = new User({ username, password, email, access });
    await newUser.save();

    res.status(201).json({ message: 'User registered successfully.' });
  } catch (err) {
    next(err);
  }
};

exports.login = async (req, res, next) => {
  const { username, password } = req.body;

  try {
    const user = await User.findOne({ username });

    if (!user || !(await user.comparePassword(password))) {
      const err = new Error('Invalid credentials');
      err.status = 401;
      err.name = "User Login";
      return next(err);
    }

    // Generate JWT token
    const token = jwt.sign(
      { userId: user._id, username: user.username, access: user.access },
      process.env.JWT_SECRET,
      { expiresIn: '1h' } // Token expires in 1 hour
    );

    res.json({
      message: 'Login successful',
      token: token,
      userId: user._id,
      username: user.username,
      access: user.access
    });
  } catch (error) {
    next(error);
  }
};


exports.forgetPassword = async (req, res, next) => {
  const { email } = req.body;

  try {
    const user = await User.findOne({ email });

    if (!user) {
      const err = new Error('User not found');
      err.status = 404;
      err.name = "User Forget Password";
      return next(err);
    }

    const otp = generateOTP();
    user.otp = otp;
    user.otpExpiry = Date.now() + 3600000;
    await user.save();

    const mailOptions = {
      to: email,
      subject: 'Password Reset OTP',
      text: `Your OTP for password reset is: ${otp}`
    };

    sendEmail(mailOptions);

    res.status(200).json({ message: 'OTP sent to email' });
  } catch (error) {
    next(error);
  }
};

exports.resetPassword = async (req, res, next) => {
  const { email, otp, newPassword } = req.body;

  try {
    const user = await User.findOne({ email });

    if (!user || user.otp !== otp || user.otpExpiry < Date.now()) {
      const err = new Error('Invalid or expired OTP');
      err.status = 400;
      err.name = "User Reset Password";
      return next(err);
    }

    user.password = newPassword;
    user.otp = undefined;
    user.otpExpiry = undefined;
    await user.save();

    res.status(200).json({ message: 'Password reset successful' });
  } catch (error) {
    next(error);
  }
};
