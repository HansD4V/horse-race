// server.js
const express = require('express');
const path = require('path');
const app = express();
const http = require('http');
const { Server } = require('socket.io');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const server = http.createServer(app);
const io = new Server(server);

// middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// temporary test route
app.get('/api/test', (req, res) => {
    res.json({ message: "Server is alive" });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});

// in-memory stores for prototype (replace with DB in production)
const users = {}; // username -> { passwordHash, balance, wins, losses }
const matches = {}; // matchId -> match object

const JWT_SECRET = 'replace_with_strong_secret';

// --- simple auth endpoints (for prototype) ---
app.post('/register', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).send({ error: 'bad' });
  const uname = username.toLowerCase();
  if (users[uname]) return res.status(400).send({ error: 'exists' });
  const hash = await bcrypt.hash(password, 10);
  users[uname] = { passwordHash: hash, balance: 100, wins: 0, losses: 0 };
  return res.send({ ok: true });
});

app.post('/login', async (req, res) => {
  const { username, password } = req.body;
  const u = users[username?.toLowerCase()];
  if (!u) return res.status(401).send({ error: 'no_user' });
  const ok = await bcrypt.compare(password, u.passwordHash);
  if (!ok) return res.status(401).send({ error: 'bad_pass' });
  const token = jwt.sign({ username: username.toLowerCase() }, JWT_SECRET, { expiresIn: '2h' });
  res.send({ token, balance: u.balance, wins: u.wins, losses: u.losses });
});

// --- socket auth helper ---
function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (e) {
    return null;
  }
}

// create unique match ids
function genId() { return Math.random().toString(36).slice(2, 9); }

// match object structure (prototype)
function createMatch(hostName) {
  return {
    id: genId(),
    host: hostName,
    players: {}, // username -> { socketId, ready, bet: {type, horse1, horse2, amount} }
    leaders: [], // horse stats for calculating odds, optional
    state: 'lobby', // 'lobby', 'countdown', 'running', 'finished'
    race: null // will hold race runtime data
  };
}

// --- socket.io handlers ---
io.on('connection', socket => {
  console.log('socket connected', socket.id);

  socket.on('auth', (token, cb) => {
    const data = verifyToken(token);
    if (!data) return cb && cb({ ok: false, error: 'unauth' });
    socket.username = data.username;
    users[socket.username] = users[socket.username] || { balance: 100, wins: 0, losses: 0 };
    cb && cb({ ok: true, profile: users[socket.username] });
  });

  socket.on('createMatch', (cb) => {
    if (!socket.username) return cb && cb({ ok: false, error: 'not_auth' });
    const match = createMatch(socket.username);
    match.players[socket.username] = { socketId: socket.id, ready: false };
    matches[match.id] = match;
    socket.join(match.id);
    cb && cb({ ok: true, matchId: match.id });
    io.to(match.id).emit('matchUpdate', getMatchPublic(match));
  });

  socket.on('joinMatch', ({ matchId }, cb) => {
    if (!socket.username) return cb && cb({ ok: false, error: 'not_auth' });
    const match = matches[matchId];
    if (!match) return cb && cb({ ok: false, error: 'no_match' });
    if (match.state !== 'lobby') return cb && cb({ ok: false, error: 'match_not_open' });
    match.players[socket.username] = { socketId: socket.id, ready: false };
    socket.join(match.id);
    cb && cb({ ok: true, match: getMatchPublic(match) });
    io.to(match.id).emit('matchUpdate', getMatchPublic(match));
  });

  socket.on('placeBet', ({ matchId, bet }, cb) => {
    if (!socket.username) return cb && cb({ ok: false, error: 'not_auth' });
    const match = matches[matchId];
    if (!match) return cb && cb({ ok: false, error: 'no_match' });
    if (match.state !== 'lobby') return cb && cb({ ok: false, error: 'no_longer_bets' });

    const profile = users[socket.username];
    if (!profile) return cb && cb({ ok: false, error: 'no_profile' });

    // validate bet
    const amount = Number(bet.amount);
    if (!Number.isFinite(amount) || amount < 3) return cb && cb({ ok: false, error: 'bad_amount' });
    if (profile.balance < amount) return cb && cb({ ok: false, error: 'insufficient' });

    // store bet in match players
    match.players[socket.username].bet = { ...bet };
    cb && cb({ ok: true });
    io.to(match.id).emit('matchUpdate', getMatchPublic(match));
  });

  socket.on('playerReady', ({ matchId }, cb) => {
    if (!socket.username) return cb && cb({ ok: false, error: 'not_auth' });
    const match = matches[matchId];
    if (!match) return cb && cb({ ok: false, error: 'no_match' });
    match.players[socket.username].ready = true;
    io.to(match.id).emit('matchUpdate', getMatchPublic(match));

    // if all ready and min players >=1, start countdown (for demo start when all ready)
    const allReady = Object.values(match.players).every(p => p.ready);
    if (allReady && match.state === 'lobby') {
      startMatchCountdown(match.id);
    }
    cb && cb({ ok: true });
  });

  socket.on('leaveMatch', ({ matchId }) => {
    const match = matches[matchId];
    if (!match) return;
    delete match.players[socket.username];
    socket.leave(matchId);
    io.to(matchId).emit('matchUpdate', getMatchPublic(match));
  });

  socket.on('disconnect', () => {
    // optionally handle removing socket from matches
    console.log('disconnect', socket.id, socket.username);
    // cleanup: remove players with matching socketId from any match
    Object.values(matches).forEach(match => {
      for (const [uname, pdata] of Object.entries(match.players)) {
        if (pdata.socketId === socket.id) {
          delete match.players[uname];
          io.to(match.id).emit('matchUpdate', getMatchPublic(match));
        }
      }
    });
  });
});

// --- Helpers & race flow ---
function getMatchPublic(match) {
  return {
    id: match.id,
    host: match.host,
    state: match.state,
    players: Object.fromEntries(Object.entries(match.players).map(([u, p]) => [u, {
      ready: p.ready,
      hasBet: !!p.bet,
      bet: p.bet ? { type: p.bet.type, amount: p.bet.amount, horses: [p.bet.horse1, p.bet.horse2] } : null
    }])),
    leaders: match.leaders
  };
}

function startMatchCountdown(matchId) {
  const match = matches[matchId];
  if (!match) return;
  match.state = 'countdown';
  let t = 3;
  const countdownInterval = setInterval(() => {
    io.to(matchId).emit('countdown', t);
    t--;
    if (t < 0) {
      clearInterval(countdownInterval);
      startRaceServerSide(matchId);
    }
  }, 1000);
}

function startRaceServerSide(matchId) {
  const match = matches[matchId];
  if (!match) return;
  match.state = 'running';
  // initialize race data
  const finishLine = 800;
  const positions = [0,0,0,0,0];
  const speeds = [1,1,1,1,1].map((s,i) => 1 + Math.random()*3); // more sophisticated later
  match.race = { positions, speeds, finishLine, winner: null };

  const tick = () => {
    // move horses
    for (let i=0;i<5;i++){
      let move = Math.random() * speeds[i];
      // small chance to trip
      if (Math.random() < 0.03) move *= 0.2;
      // burst
      if (Math.random() < 0.1) move += Math.random()*5;
      positions[i] += move;
      if (positions[i] >= finishLine && !match.race.winner) {
        match.race.winner = i+1;
      }
    }
    // broadcast
    io.to(matchId).emit('raceFrame', { positions: [...positions] });
    if (!match.race.winner) {
      setTimeout(tick, 50); // ~20fps
    } else {
      // finish
      finishMatch(matchId, match.race.winner);
    }
  };
  tick();
}

function finishMatch(matchId, winner) {
  const match = matches[matchId];
  match.state = 'finished';
  match.race.winner = winner;

  // compute payouts: naive example using simple odds based on in-match bets (server decides)
  // build a simple odds map based on total bet amounts per horse
  const horseTotals = [0,0,0,0,0]; // bets placed on each
  for (const [uname, p] of Object.entries(match.players)) {
    if (p.bet) {
      const amt = Number(p.bet.amount) || 0;
      if (p.bet.type === '1') {
        horseTotals[p.bet.horse1 - 1] += amt;
      } else if (p.bet.type === '2') {
        // split amount between two horses for example
        horseTotals[p.bet.horse1 - 1] += amt / 2;
        horseTotals[p.bet.horse2 - 1] += amt / 2;
      }
    }
  }
  // naive odds: low total => higher payout. Calculate multiplier
  const tot = horseTotals.reduce((s,x)=>s+x,0) || 1;
  const multipliers = horseTotals.map(h => ( (tot + 5) / (h + 1) ));

  // settle each player's bets and update balances
  const results = {};
  for (const [uname, p] of Object.entries(match.players)) {
    const profile = users[uname];
    if (!profile) continue;
    let betAmt = 0;
    if (p.bet) betAmt = Number(p.bet.amount) || 0;
    // take bet
    profile.balance -= betAmt;
    let won = 0;
    if (p.bet) {
      if (p.bet.type === '1' && Number(p.bet.horse1) === winner) {
        const payout = Math.round(betAmt * multipliers[winner-1]);
        profile.balance += payout;
        profile.wins++;
        won = payout - betAmt;
      } else if (p.bet.type === '2' && (Number(p.bet.horse1) === winner || Number(p.bet.horse2) === winner)) {
        const payout = Math.round(betAmt * multipliers[winner-1]);
        profile.balance += payout;
        profile.wins++;
        won = payout - betAmt;
      } else {
        profile.losses++;
      }
    }
    results[uname] = { balance: profile.balance, won };
  }

  io.to(matchId).emit('raceResult', { winner, results, multipliers });
}
 
// start server
server.listen(3000, () => console.log('Server listening on :3000'));
