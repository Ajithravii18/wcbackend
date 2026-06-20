const mongoose = require('mongoose');
require('dotenv').config();

mongoose.connect(process.env.MONGO_URI).then(async () => {
  const Match = require('./models/Match');
  const m = await Match.findOne({ homeTeam: 'France', awayTeam: 'Senegal' });
  if (m) {
    m.homeScore = 3;
    m.awayScore = 1;
    m.winner = 'France';
    await m.save();
    console.log('Successfully updated France vs Senegal to 3-1 for France!');
  }
  process.exit(0);
});
