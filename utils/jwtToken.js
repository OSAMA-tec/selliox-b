// create token and send it in json response
const sendToken = (user, statusCode, res, additionalData = {}) => {
  const token = user.getJwtToken();
  
  // Create the response object
  const response = {
    success: true,
    token,
    user: {
      id: user._id,
      fullName: user.fullName,
      email: user.email,
      userType: user.userType,
      avatar: user.profileImage,
      phone: user.phoneNumber,
      username: user.username,
      about: user.about
    },
    ...additionalData // Include any additional data passed to the function
  };
  
  res.status(statusCode).json(response);
};

export default sendToken;
