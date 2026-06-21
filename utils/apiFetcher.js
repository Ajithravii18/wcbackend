const axios = require('axios');
const Match = require('../models/Match');

// Optimized polling: 30 seconds for live matches (Sportmonks allows up to 3000/hr)
const FETCH_INTERVAL = 30 * 1000;
let fetchIntervalId = null;

const startApiFetcher = () => {
  if (fetchIntervalId) return;
  console.log('🌐 Sportmonks API Fetcher started');

  fetchIntervalId = setInterval(async () => {
    try {
      const apiToken = process.env.SPORTMONKS_API_TOKEN;
      
      if (!apiToken || apiToken === 'YOUR_API_KEY_HERE') {
        console.warn('⚠️ SPORTMONKS_API_TOKEN is not set. Live scores will not be updated.');
        return;
      }

      const now = Date.now();
      
      // Find active matches
      const activeMatches = await Match.find({
        kickoffTime: { $lte: new Date() },
        $or: [
          { status: { $ne: 'completed' } },
          { status: 'completed', apiVerified: { $ne: true } }
        ]
      });

      if (activeMatches.length === 0) return;

      // 1. Fetch Live Scores
      // include=participants;scores;state;events
      const liveRes = await axios.get(`https://api.sportmonks.com/v3/football/livescores/inplay?api_token=${apiToken}&include=participants;scores;state;events`);
      const liveFixtures = liveRes.data.data || [];

      // Also fetch fixtures for the day to catch ones that just finished but aren't in 'inplay' anymore
      // To save requests, only fetch if there's a match that's >120 mins old
      const needsHistorical = activeMatches.some(m => now - m.kickoffTime.getTime() > 120 * 60 * 1000);
      let todayFixtures = [];
      if (needsHistorical) {
        const dateStr = new Date().toISOString().split('T')[0];
        const histRes = await axios.get(`https://api.sportmonks.com/v3/football/fixtures/date/${dateStr}?api_token=${apiToken}&include=participants;scores;state;events`);
        todayFixtures = histRes.data.data || [];
      }

      for (const match of activeMatches) {
        // Find corresponding fixture from API using team names
        const findFixture = (fixtures) => {
          return fixtures.find(f => {
            if (!f.participants) return false;
            const homeP = f.participants.find(p => p.meta?.location === 'home');
            const awayP = f.participants.find(p => p.meta?.location === 'away');
            
            if (!homeP || !awayP) return false;
            
            // Check if names match
            const homeMatches = homeP.name.toLowerCase().includes(match.homeTeam.toLowerCase()) || match.homeTeam.toLowerCase().includes(homeP.name.toLowerCase());
            const awayMatches = awayP.name.toLowerCase().includes(match.awayTeam.toLowerCase()) || match.awayTeam.toLowerCase().includes(awayP.name.toLowerCase());
            
            return homeMatches || awayMatches;
          });
        };

        let apiFixture = findFixture(liveFixtures);

        if (!apiFixture && todayFixtures.length > 0) {
           apiFixture = findFixture(todayFixtures);
        }

        let isModified = false;

        if (apiFixture) {
          // Identify participants
          const homeParticipant = apiFixture.participants?.find(p => p.meta?.location === 'home');
          const awayParticipant = apiFixture.participants?.find(p => p.meta?.location === 'away');

          // Extract scores
          if (apiFixture.scores && Array.isArray(apiFixture.scores)) {
            // Find current scores
            const homeScoreObj = apiFixture.scores.find(s => s.participant_id === homeParticipant?.id && (s.description === 'CURRENT' || s.description === 'PENALTIES'));
            const awayScoreObj = apiFixture.scores.find(s => s.participant_id === awayParticipant?.id && (s.description === 'CURRENT' || s.description === 'PENALTIES'));

            if (homeScoreObj && match.homeScore !== homeScoreObj.score.goals) {
              match.homeScore = homeScoreObj.score.goals;
              isModified = true;
            }
            if (awayScoreObj && match.awayScore !== awayScoreObj.score.goals) {
              match.awayScore = awayScoreObj.score.goals;
              isModified = true;
            }
          }

          // Extract state
          if (apiFixture.state) {
            const shortStatus = apiFixture.state.short_name; // '1H', 'HT', 'FT', etc.
            if (match.shortStatus !== shortStatus) {
              match.shortStatus = shortStatus;
              isModified = true;
            }

            // Extract elapsed (sometimes minute is in the fixture itself or state)
            const elapsed = apiFixture.minute || null; // Sportmonks often puts minute on the root fixture
            if (elapsed && match.elapsed !== elapsed) {
              match.elapsed = elapsed;
              isModified = true;
            }

            // Extract events (goals)
            if (apiFixture.events && Array.isArray(apiFixture.events)) {
              // Goals usually have specific type_ids, or just checking for result/player_name
              const goalEvents = apiFixture.events
                .filter(e => e.type_id === 14 || e.type_id === 15 || e.type_id === 16 || e.type?.name?.toLowerCase().includes('goal')) // 14: Goal, 15: Penalty, 16: Own Goal
                .map(e => ({
                  player: e.player_name,
                  time: e.minute,
                  extra: e.extra_minute,
                  team: e.participant_id === homeParticipant?.id ? match.homeTeam : match.awayTeam,
                  detail: e.type_id === 15 ? 'Penalty' : e.type_id === 16 ? 'Own Goal' : 'Goal'
                }));
              
              if (JSON.stringify(match.events) !== JSON.stringify(goalEvents)) {
                match.events = goalEvents;
                isModified = true;
              }
            }

            if (['FT', 'AET', 'PEN', 'POST', 'CANC'].includes(shortStatus)) {
              match.status = 'completed';
              match.apiVerified = true;
              
              if (match.homeScore > match.awayScore) match.winner = match.homeTeam;
              else if (match.awayScore > match.homeScore) match.winner = match.awayTeam;
              else match.winner = 'Draw';
              
              isModified = true;
              console.log(`🏁 Sportmonks Match Completed: ${match.homeTeam} ${match.homeScore} - ${match.awayScore} ${match.awayTeam}`);
            } else {
              if (match.status !== 'live') {
                match.status = 'live';
                isModified = true;
              }
            }
          }
        } else {
           // Fallback logic
           const kickoff = match.kickoffTime.getTime();
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

        if (isModified) {
          await match.save();
          console.log(`🔄 Sportmonks Updated Score: ${match.homeTeam} ${match.homeScore} - ${match.awayScore} ${match.awayTeam}`);
        }
      }
    } catch (err) {
      console.error('❌ Error fetching from Sportmonks:', err.response?.data || err.message);
    }
  }, FETCH_INTERVAL);
};

const stopApiFetcher = () => {
  if (fetchIntervalId) {
    clearInterval(fetchIntervalId);
    fetchIntervalId = null;
    console.log('🌐 Sportmonks API Fetcher stopped');
  }
};

module.exports = { startApiFetcher, stopApiFetcher };
