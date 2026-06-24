require('dotenv').config();
const mongoose = require('mongoose');
const Prediction = require('./models/Prediction');
const User = require('./models/User');

mongoose.connect(process.env.MONGO_URI).then(async () => {
  const users = await User.find({});
  console.log('Users:');
  users.forEach(u => console.log(u.email, u.role));

  const predictions = await Prediction.find({}).populate('user').populate('match');
  console.log('\nPredictions:');
  predictions.forEach(p => {
    console.log(`User: ${p.user.email}, Match: ${p.match.homeTeam} vs ${p.match.awayTeam}, Predicted: ${p.homeGoals}-${p.awayGoals}, Points: ${p.points}`);
  });
  
  process.exit(0);
}).catch(console.error);
