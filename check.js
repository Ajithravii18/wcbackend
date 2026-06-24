require('dotenv').config();
const mongoose = require('mongoose');
const Match = require('./models/Match');
mongoose.connect(process.env.MONGO_URI).then(async () => {
  const matches = await Match.find({});
  const matchesWithEvents = matches.filter(m => m.events && m.events.length > 0);
  console.log('Matches with events:', matchesWithEvents.length);
  if(matchesWithEvents.length) console.log(matchesWithEvents[0].events);
  process.exit(0);
}).catch(console.error);
