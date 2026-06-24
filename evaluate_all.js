require('dotenv').config();
const mongoose = require('mongoose');
const Match = require('./models/Match');
const Prediction = require('./models/Prediction');

mongoose.connect(process.env.MONGO_URI).then(async () => {
  const matches = await Match.find({ status: 'completed' });
  let count = 0;

  for (const match of matches) {
    const predictions = await Prediction.find({ match: match._id });
    for (const pred of predictions) {
      if (pred.points > 0) continue; // Already calculated

      let points = 0;
      if (pred.homeGoals === match.homeScore && pred.awayGoals === match.awayScore) {
        points = 3;
      } else {
        const predictedOutcome = pred.homeGoals > pred.awayGoals ? 'home' : (pred.homeGoals < pred.awayGoals ? 'away' : 'draw');
        const actualOutcome = match.homeScore > match.awayScore ? 'home' : (match.homeScore < match.awayScore ? 'away' : 'draw');
        if (predictedOutcome === actualOutcome) points = 1;
      }

      if (points > 0) {
        pred.points = points;
        await pred.save();
        console.log(`Awarded ${points} points to user for predicting ${pred.homeGoals}-${pred.awayGoals}`);
        count++;
      }
    }
  }
  
  console.log(`Finished! Awarded points to ${count} predictions.`);
  process.exit(0);
}).catch(console.error);
