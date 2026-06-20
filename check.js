const mongoose = require('mongoose');
require('dotenv').config();

mongoose.connect(process.env.MONGO_URI).then(async () => {
  const Match = require('./models/Match');
  const m = await Match.find({ $or: [{homeTeam: 'France'}, {awayTeam: 'France'}] });
  console.log(m.map(x => `${x.homeTeam} ${x.homeScore} - ${x.awayScore} ${x.awayTeam} | Winner: ${x.winner}`));
  process.exit(0);
});
