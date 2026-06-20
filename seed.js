/**
 * Seed script for LUCKY STAR FC — World Cup 2026 match data from iCalendar.
 * Run with: node seed.js
 * WARNING: This will clear and re-insert all match, prediction, and user data!
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const Match = require('./models/Match');
const User = require('./models/User');
const Prediction = require('./models/Prediction');

const icsPath = path.join(__dirname, '../World Cup.ics');

function parseTeam(teamStr) {
  // Matches leading emojis/flags and then the team name
  const match = teamStr.match(/^([^\w]*)\s*(.*)$/);
  if (match) {
    const flag = match[1].trim() || '🏳️';
    const name = match[2].trim();
    return { flag, name };
  }
  return { flag: '🏳️', name: teamStr.trim() };
}

// Map ICS fixture codes to human-readable labels
function resolveTeamName(rawName) {
  const n = rawName.trim();

  // Pattern: "Winner Group X" or "Runner-up Group X" — already readable
  if (/^(Winner|Runner-up|Loser)\s+Group\s+[A-Z]$/i.test(n)) return n;

  // Pattern: "1A", "2B" etc — group position codes
  const posMatch = n.match(/^(\d+)([A-L])$/);
  if (posMatch) {
    const pos = parseInt(posMatch[1], 10);
    const grp = posMatch[2].toUpperCase();
    const label = pos === 1 ? 'Winner' : pos === 2 ? 'Runner-up' : `#${pos}`;
    return `${label} Group ${grp}`;
  }

  // Pattern: "W49", "W50" — winner of match number
  const winnerMatch = n.match(/^W(\d+)$/i);
  if (winnerMatch) return `Winner Match ${winnerMatch[1]}`;

  // Pattern: "RU Group A" or "RU-A"
  const ruMatch = n.match(/^RU[\s-]?([A-L])$/i);
  if (ruMatch) return `Runner-up Group ${ruMatch[1].toUpperCase()}`;

  // Pattern: "Loser M49" etc
  const loserMatch = n.match(/^Loser\s+M?(\d+)$/i);
  if (loserMatch) return `Loser Match ${loserMatch[1]}`;

  // Any remaining code-like strings (all caps, short) — wrap in TBD label
  if (/^[A-Z0-9\s\-]{2,8}$/.test(n) && !/^[A-Z][a-z]/.test(n)) {
    return `TBD (${n})`;
  }

  return n;
}

const parseIcs = () => {
  if (!fs.existsSync(icsPath)) {
    throw new Error(`iCalendar file not found at ${icsPath}`);
  }

  const content = fs.readFileSync(icsPath, 'utf8');
  // Unfold lines: Replace newline + space/tab with nothing
  const unfolded = content.replace(/\r?\n[ \t]/g, '');
  const blocks = unfolded.split('BEGIN:VEVENT');
  const matches = [];

  for (let i = 1; i < blocks.length; i++) {
    const block = blocks[i].split('END:VEVENT')[0];
    const lines = block.split(/\r?\n/);
    const event = {};
    for (let line of lines) {
      const colIndex = line.indexOf(':');
      if (colIndex === -1) continue;
      const key = line.substring(0, colIndex).trim();
      const val = line.substring(colIndex + 1).trim();
      event[key] = val;
    }

    if (!event.SUMMARY || !event.DTSTART) continue;

    // Parse DTSTART format (e.g. 20260611T190000Z)
    const dtStart = event.DTSTART;
    const matchTime = dtStart.match(/(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z?/);
    if (!matchTime) continue;
    const kickoffTime = new Date(Date.UTC(
      parseInt(matchTime[1], 10),
      parseInt(matchTime[2], 10) - 1,
      parseInt(matchTime[3], 10),
      parseInt(matchTime[4], 10),
      parseInt(matchTime[5], 10),
      parseInt(matchTime[6], 10)
    ));

    // Parse SUMMARY format (e.g. "🇲🇽 Mexico - 🇿🇦 South Africa  (2-0)")
    const summary = event.SUMMARY;
    const parts = summary.split(/\s+-\s+/);
    if (parts.length < 2) continue;

    const team1Str = parts[0];
    let team2Str = parts[1];

    let homeScore = null;
    let awayScore = null;
    let status = 'upcoming';
    let winner = null;

    // Check for score format (X-Y)
    const scoreMatch = team2Str.match(/\s*\((\d+)-(\d+)\)\s*$/);
    if (scoreMatch) {
      homeScore = parseInt(scoreMatch[1], 10);
      awayScore = parseInt(scoreMatch[2], 10);
      status = 'completed';
      team2Str = team2Str.replace(/\s*\((\d+)-(\d+)\)\s*$/, '');
    }
    const home = parseTeam(team1Str);
    const away = parseTeam(team2Str);

    // Resolve any fixture codes to readable names
    home.name = resolveTeamName(home.name);
    away.name = resolveTeamName(away.name);

    if (status === 'completed' && homeScore !== null && awayScore !== null) {
      if (homeScore > awayScore) winner = home.name;
      else if (awayScore > homeScore) winner = away.name;
      else winner = 'Draw';
    } else {
      // Check if kickoff is in the past to classify as live or completed
      const now = new Date();
      const durationMs = 2 * 60 * 60 * 1000; // 2 hours duration
      if (now.getTime() > kickoffTime.getTime()) {
        if (now.getTime() < kickoffTime.getTime() + durationMs) {
          status = 'live';
        } else {
          status = 'completed';
        }
      } else {
        status = 'upcoming';
      }
    }


    // Assign generic groups/venues based on calendar date or default
    let group = 'Group Stage';
    if (kickoffTime.getMonth() === 6 && kickoffTime.getDate() > 27) {
      group = 'Knockout Stage';
    }

    matches.push({
      homeTeam: home.name,
      homeFlag: home.flag,
      awayTeam: away.name,
      awayFlag: away.flag,
      venue: 'World Cup Arena',
      kickoffTime,
      status,
      homeScore,
      awayScore,
      winner,
      group,
      matchday: kickoffTime.getDate() - 10 // Mock matchday based on date
    });
  }

  // Sort matches by kickoff time ascending
  return matches.sort((a, b) => a.kickoffTime - b.kickoffTime);
};

const seed = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ Connected to MongoDB');

    // Clear existing data
    await Prediction.deleteMany({});
    await Match.deleteMany({});
    await User.deleteMany({});
    console.log('🗑️  Cleared database collections');

    // Create default test user
    const defaultUser = new User({
      name: 'Test User',
      email: 'test@test.com',
      password: '123456',
      role: 'admin'
    });
    await defaultUser.save();
    console.log('👤 Created default user: test@test.com (password: 123456)');

    // Create mock legend users for prediction stats
    const mockUserData = [
      { name: 'Pele 👑', email: 'pele@legend.com', password: 'password123', avatar: 'br_dribbler' },
      { name: 'Maradona 🔟', email: 'diego@legend.com', password: 'password123', avatar: 'ar_champion' },
      { name: 'Leo Messi 🐐', email: 'leo@legend.com', password: 'password123', avatar: 'ar_champion' },
      { name: 'Cristiano ⚡', email: 'cr7@legend.com', password: 'password123', avatar: 'pt_champion' },
      { name: 'Zidane 🪄', email: 'zizou@legend.com', password: 'password123', avatar: 'fr_silent' },
      { name: 'Cruyff 🇳🇱', email: 'johan@legend.com', password: 'password123', avatar: 'eng_silent' },
      { name: 'Beckham 🎯', email: 'david@legend.com', password: 'password123', avatar: 'eng_silent' }
    ];

    const seededUsers = [];
    for (const u of mockUserData) {
      const user = new User(u);
      await user.save();
      seededUsers.push(user);
    }
    console.log(`👥 Seeded ${seededUsers.length} mock legend users`);

    // Parse matches from iCalendar
    const matchesToInsert = parseIcs();
    console.log(`📅 Parsed ${matchesToInsert.length} matches from World Cup.ics`);

    const insertedMatches = await Match.insertMany(matchesToInsert);
    console.log(`🎉 Seeded ${insertedMatches.length} matches into database`);

    // Generate mock predictions for legend users
    const predictionsToInsert = [];
    for (const match of insertedMatches) {
      for (const user of seededUsers) {
        // 80% chance of predicting a match
        if (Math.random() > 0.2) {
          // Generate a realistic score
          const homeGoals = Math.floor(Math.random() * 4);
          const awayGoals = Math.floor(Math.random() * 4);
          
          predictionsToInsert.push({
            user: user._id,
            match: match._id,
            homeGoals,
            awayGoals,
            submittedAt: new Date(match.kickoffTime.getTime() - Math.random() * 8 * 60 * 60 * 1000)
          });
        }
      }
    }

    const insertedPredictions = await Prediction.insertMany(predictionsToInsert);
    console.log(`🎯 Seeded ${insertedPredictions.length} mock predictions for statistics`);

    console.log('🏁 Seeding completed successfully!');
    process.exit(0);
  } catch (err) {
    console.error('❌ Seed failed:', err.message);
    process.exit(1);
  }
};

seed();
