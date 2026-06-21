const axios = require('axios');
const Match = require('../models/Match');
const Prediction = require('../models/Prediction');
const Notification = require('../models/Notification');

async function evaluatePredictionsForMatch(match) {
  try {
    const predictions = await Prediction.find({ match: match._id }).populate('user');
    for (const pred of predictions) {
      if (pred.points !== undefined && pred.points > 0) continue;

      let points = 0;
      let isExact = false;

      if (pred.homeGoals === match.homeScore && pred.awayGoals === match.awayScore) {
        points = 3;
        isExact = true;
      } else {
        const predictedOutcome = pred.homeGoals > pred.awayGoals ? 'home' : (pred.homeGoals < pred.awayGoals ? 'away' : 'draw');
        const actualOutcome = match.homeScore > match.awayScore ? 'home' : (match.homeScore < match.awayScore ? 'away' : 'draw');
        if (predictedOutcome === actualOutcome) points = 1;
      }

      if (points > 0) {
        pred.points = points;
        await pred.save();

        if (isExact) {
          await Notification.create({
            user: pred.user._id,
            message: `🎉 Congratulations! You predicted the exact score (${match.homeScore}-${match.awayScore}) for ${match.homeTeam} vs ${match.awayTeam}! You earned 3 points.`,
            type: 'prediction_correct'
          });
        }
      }
    }
  } catch (err) {
    console.error('❌ Failed to evaluate predictions:', err.message);
  }
}

// Check database every 1 minute, but only hit API every 15 mins for live matches
const CHECK_DB_INTERVAL = 60 * 1000;
const LIVE_API_COOLDOWN = 15 * 60 * 1000; // 15 mins

let fetchIntervalId = null;
let pastFixturesCache = {};

const startApiFetcher = () => {
  if (fetchIntervalId) return;
  console.log('🌐 API-Football Fetcher started (Optimized)');

  fetchIntervalId = setInterval(async () => {
    try {
      const apiKey = process.env.API_FOOTBALL_KEY;
      const apiHost = process.env.API_FOOTBALL_HOST || 'v3.football.api-sports.io';
      
      if (!apiKey || apiKey === 'YOUR_API_KEY_HERE') {
        console.warn('⚠️ API_FOOTBALL_KEY is not set. Live scores will not be updated.');
        return;
      }

      const now = Date.now();
      
      // Find matches where kickoff time is in the past AND (status is NOT 'completed' OR not apiVerified)
      const activeMatches = await Match.find({
        kickoffTime: { $lte: new Date() },
        $or: [
          { status: { $ne: 'completed' } },
          { status: 'completed', apiVerified: { $ne: true } }
        ]
      });

      if (activeMatches.length === 0) return;

      const System = require('../models/System');
      let systemState = await System.findOne({ key: 'lastLiveFetch' });
      if (!systemState) {
        systemState = await System.create({ key: 'lastLiveFetch', value: 0 });
      }
      
      const lastLiveFetchDB = systemState.value;

      if (now - lastLiveFetchDB < LIVE_API_COOLDOWN) {
        return; // Skip fetching from API until 15 mins have passed since LAST global fetch
      }
      
      // Update the DB timestamp so other instances/restarts respect the cooldown
      systemState.value = now;
      await systemState.save();

      // In a real scenario, you'd fetch live fixtures from API-Football
      // e.g., GET https://v3.football.api-sports.io/fixtures?live=all
      const response = await axios.get(`https://${apiHost}/fixtures?live=all`, {
        headers: {
          'x-rapidapi-key': apiKey,
          'x-apisports-key': apiKey,
          'x-rapidapi-host': apiHost
        }
      });

      if (response.data.errors && Object.keys(response.data.errors).length > 0) {
        console.error('❌ API-Football Error:', response.data.errors);
        return;
      }

      const liveFixtures = response.data.response || [];

      for (const match of activeMatches) {
        // Find corresponding live fixture from API using team names
        // Note: In production, it is safer to map matches by API Fixture ID,
        // but string matching works as a fallback.
        const apiFixture = liveFixtures.find(f => 
          f.teams.home.name.toLowerCase() === match.homeTeam.toLowerCase() ||
          f.teams.away.name.toLowerCase() === match.awayTeam.toLowerCase()
        );

        let isModified = false;

        if (apiFixture) {
          // Update score
          if (apiFixture.goals.home !== null && match.homeScore !== apiFixture.goals.home) {
            match.homeScore = apiFixture.goals.home;
            isModified = true;
          }
          if (apiFixture.goals.away !== null && match.awayScore !== apiFixture.goals.away) {
            match.awayScore = apiFixture.goals.away;
            isModified = true;
          }

          // Update status based on API
          // 'FT' = Full Time, 'AET' = After Extra Time, 'PEN' = Penalties
          const shortStatus = apiFixture.fixture.status.short;
          const elapsed = apiFixture.fixture.status.elapsed;

          if (apiFixture.events && Array.isArray(apiFixture.events)) {
            const goalEvents = apiFixture.events
              .filter(e => e.type === 'Goal')
              .map(e => ({
                player: e.player?.name,
                time: e.time?.elapsed,
                extra: e.time?.extra,
                team: e.team?.name,
                detail: e.detail
              }));
            
            if (JSON.stringify(match.events) !== JSON.stringify(goalEvents)) {
              match.events = goalEvents;
              isModified = true;
            }
          }

          if (match.shortStatus !== shortStatus) {
            match.shortStatus = shortStatus;
            isModified = true;
          }
          if (match.elapsed !== elapsed) {
            match.elapsed = elapsed;
            isModified = true;
          }

          if (['FT', 'AET', 'PEN'].includes(shortStatus)) {
            match.status = 'completed';
            
            // Determine winner
            if (match.homeScore > match.awayScore) match.winner = match.homeTeam;
            else if (match.awayScore > match.homeScore) match.winner = match.awayTeam;
            else match.winner = 'Draw';
            
            isModified = true;
            console.log(`🏁 API Match Completed: ${match.homeTeam} ${match.homeScore} - ${match.awayScore} ${match.awayTeam}`);
          } else {
            if (match.status !== 'live') {
              match.status = 'live';
              isModified = true;
            }
          }
        } else {
          // If the match is not in the live fixtures, check if it's over 120 minutes past kickoff
          const kickoff = match.kickoffTime.getTime();
          if (now - kickoff > 120 * 60 * 1000) {
            // Match is likely finished, fetch final score from its specific date
            const dateStr = match.kickoffTime.toISOString().split('T')[0];
            
            if (!pastFixturesCache) {
              // Note: declared at the top of the file
            }
            
            if (!pastFixturesCache[dateStr]) {
              try {
                const pastRes = await axios.get(`https://${apiHost}/fixtures?date=${dateStr}`, {
                  headers: {
                    'x-rapidapi-key': apiKey,
                    'x-apisports-key': apiKey,
                    'x-rapidapi-host': apiHost
                  }
                });
                pastFixturesCache[dateStr] = pastRes.data.response || [];
              } catch (err) {
                console.error(`❌ Failed to fetch fixtures for date ${dateStr}:`, err.message);
                pastFixturesCache[dateStr] = [];
              }
            }

            const pastFixture = pastFixturesCache[dateStr].find(f => 
              f.teams.home.name.toLowerCase() === match.homeTeam.toLowerCase() ||
              f.teams.away.name.toLowerCase() === match.awayTeam.toLowerCase()
            );

            if (pastFixture) {
              if (pastFixture.events && Array.isArray(pastFixture.events)) {
                const goalEvents = pastFixture.events
                  .filter(e => e.type === 'Goal')
                  .map(e => ({
                    player: e.player?.name,
                    time: e.time?.elapsed,
                    extra: e.time?.extra,
                    team: e.team?.name,
                    detail: e.detail
                  }));
                
                if (JSON.stringify(match.events) !== JSON.stringify(goalEvents)) {
                  match.events = goalEvents;
                  isModified = true;
                }
              }

              const shortStatus = pastFixture.fixture.status.short;
              if (['FT', 'AET', 'PEN'].includes(shortStatus)) {
                match.homeScore = pastFixture.goals.home !== null ? pastFixture.goals.home : match.homeScore;
                match.awayScore = pastFixture.goals.away !== null ? pastFixture.goals.away : match.awayScore;
                match.status = 'completed';
                match.apiVerified = true;
                
                if (match.homeScore > match.awayScore) match.winner = match.homeTeam;
                else if (match.awayScore > match.homeScore) match.winner = match.awayTeam;
                else match.winner = 'Draw';
                
                isModified = true;
                console.log(`🏁 API Match Missed & Completed: ${match.homeTeam} ${match.homeScore} - ${match.awayScore} ${match.awayTeam}`);
              } else if (['PST', 'CANC', 'ABD'].includes(shortStatus)) {
                // Handle Postponed or Cancelled by marking completed so it doesn't loop forever
                match.status = 'completed';
                match.apiVerified = true;
                isModified = true;
                console.log(`⚠️ Match Postponed/Cancelled: ${match.homeTeam} vs ${match.awayTeam}`);
              }
            } else {
              // If we STILL can't find it in the API response, and it's 5 hours past kickoff, force complete to avoid a permanent loop
              if (now - kickoff > 5 * 60 * 60 * 1000) {
                 match.status = 'completed';
                 match.apiVerified = true;
                 if (match.homeScore > match.awayScore) match.winner = match.homeTeam;
                 else if (match.awayScore > match.homeScore) match.winner = match.awayTeam;
                 else match.winner = 'Draw';
                 isModified = true;
                 console.log(`⚠️ Force completing unmatched match: ${match.homeTeam} vs ${match.awayTeam}`);
              }
            }
          } else if (match.status === 'completed' && match.apiVerified !== true) {
             // If it's already marked completed but not verified, and it's not >120m past kickoff,
             // wait until it IS >120m past kickoff so we don't prematurely verify it before API updates.
             // If we really want to verify it immediately, we'd do it here, but it's handled above when >120m.
          }
        }

        if (isModified) {
          await match.save();
          console.log(`🔄 API Updated Score: ${match.homeTeam} ${match.homeScore} - ${match.awayScore} ${match.awayTeam}`);
          
          if (match.status === 'completed') {
            await evaluatePredictionsForMatch(match);
          }
        }
      }
    } catch (err) {
      console.error('❌ Error fetching from API-Football:', err.response?.data || err.message);
    }
  }, CHECK_DB_INTERVAL);
};

const stopApiFetcher = () => {
  if (fetchIntervalId) {
    clearInterval(fetchIntervalId);
    fetchIntervalId = null;
    console.log('🌐 API-Football Fetcher stopped');
  }
};

module.exports = { startApiFetcher, stopApiFetcher };
