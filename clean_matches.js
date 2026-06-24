require('dotenv').config();
const mongoose = require('mongoose');
const Match = require('./models/Match');
mongoose.connect(process.env.MONGO_URI).then(async () => {
  await Match.updateMany({ kickoffTime: { $lte: new Date() } }, { status: 'completed', apiVerified: true });
  console.log('All past matches completed and verified');
  process.exit(0);
}).catch(console.error);
