require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./models/User');

mongoose.connect(process.env.MONGO_URI).then(async () => {
  const users = await User.find({});
  for (const user of users) {
    console.log(user.name, user.email);
  }
  process.exit(0);
}).catch(console.error);
