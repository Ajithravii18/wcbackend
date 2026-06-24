require('dotenv').config();
const mongoose = require('mongoose');
const Match = require('./models/Match');

mongoose.connect(process.env.MONGO_URI).then(async () => {
  // Let's find the latest completed match involving Spain
  const match = await Match.findOne({
    status: 'completed',
    $or: [{ homeTeam: /Spain/i }, { awayTeam: /Spain/i }]
  }).sort({ kickoffTime: -1 });

  if (!match) {
    console.log('No completed match with Spain found.');
    process.exit(1);
  }

  console.log('Updating match:', match.homeTeam, 'vs', match.awayTeam);

  match.events = [
    { player: 'Lamine Yamal', time: 10, team: match.homeTeam.includes('Spain') ? match.homeTeam : match.awayTeam, type: 'Goal', detail: 'Normal Goal' },
    { player: 'Mikel Oyarzabal', time: 21, team: match.homeTeam.includes('Spain') ? match.homeTeam : match.awayTeam, type: 'Goal', detail: 'Normal Goal' },
    { player: 'Mikel Oyarzabal', time: 24, team: match.homeTeam.includes('Spain') ? match.homeTeam : match.awayTeam, type: 'Goal', detail: 'Normal Goal' },
    { player: 'Hassan Al Tambakti', time: 49, team: match.homeTeam.includes('Spain') ? match.awayTeam : match.homeTeam, type: 'Goal', detail: 'Normal Goal' }
  ];

  await match.save();
  console.log('Events updated successfully!');
  process.exit(0);
}).catch(console.error);
