const axios = require('axios');
const Match = require('../models/Match');

// Poll every 15 seconds
const FETCH_INTERVAL = 15 * 1000;
let fetchIntervalId = null;

const startApiFetcher = () => {
  if (fetchIntervalId) return;
  console.log('🌐 API-Football Fetcher started');

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

      // In a real scenario, you'd fetch live fixtures from API-Football
      // e.g., GET https://v3.football.api-sports.io/fixtures?live=all
      const response = await axios.get(`https://${apiHost}/fixtures?live=all`, {
        headers: {
          'x-rapidapi-key': apiKey,
          'x-rapidapi-host': apiHost
        }
      });

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
            
            // We use a caching object if declared outside the loop, or just fetch directly. 
            // Since this runs in a loop, let's fetch it if not cached (assuming pastFixturesCache is declared outside the loop, we will declare it below)
            if (!this.pastFixturesCache) this.pastFixturesCache = {};
            
            if (!this.pastFixturesCache[dateStr]) {
              try {
                const pastRes = await axios.get(`https://${apiHost}/fixtures?date=${dateStr}`, {
                  headers: {
                    'x-rapidapi-key': apiKey,
                    'x-rapidapi-host': apiHost
                  }
                });
                this.pastFixturesCache[dateStr] = pastRes.data.response || [];
              } catch (err) {
                console.error(`❌ Failed to fetch fixtures for date ${dateStr}:`, err.message);
                this.pastFixturesCache[dateStr] = [];
              }
            }

            const pastFixture = this.pastFixturesCache[dateStr].find(f => 
              f.teams.home.name.toLowerCase() === match.homeTeam.toLowerCase() ||
              f.teams.away.name.toLowerCase() === match.awayTeam.toLowerCase()
            );

            if (pastFixture) {
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
        }
      }
    } catch (err) {
      console.error('❌ Error fetching from API-Football:', err.response?.data || err.message);
    }
  }, FETCH_INTERVAL);
};

const stopApiFetcher = () => {
  if (fetchIntervalId) {
    clearInterval(fetchIntervalId);
    fetchIntervalId = null;
    console.log('🌐 API-Football Fetcher stopped');
  }
};

module.exports = { startApiFetcher, stopApiFetcher };
