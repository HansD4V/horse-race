/**
 * Horse Racing Game - Main JavaScript
 * Handles player management, race logic, live updates, betting system, odds calculation, and UI updates.
 */

//For hash password
async function hashPassword(password) {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  return hashHex;
}

window.onload = () => {
  // Helper function for element selection
  const el = id => document.getElementById(id);

  // Initialize data
  // Load players from localStorage
  let players = JSON.parse(localStorage.getItem('players')) || {};
  let currentPlayer = '';
  let leaders = JSON.parse(localStorage.getItem('leaders')) || [];

  const savedPlayer = localStorage.getItem('currentPlayer');
  const savedHash = localStorage.getItem('currentHash');

  if (savedPlayer && savedHash && players[savedPlayer]) {
    if (players[savedPlayer].passwordHash === savedHash) {
      currentPlayer = savedPlayer;
      console.log(`Auto-logged in as ${currentPlayer}`);
      el('result').textContent = `Welcome back, ${currentPlayer}! Ready to race.`;
    } else {
      // Clear saved credentials if hash mismatch
      localStorage.removeItem('currentPlayer');
      localStorage.removeItem('currentHash');
    }
  }
  
  updateLeaderboard();
  updatePlayersList();
  updateOddsDisplay();
  updatePlayerStats();

  // Enable/Disable Horse 2 selection based on Bet Type
  el('betType').addEventListener('change', () => {
    const isTwoHorse = el('betType').value === '2';
    el('betHorse2').disabled = !isTwoHorse;
    if (!isTwoHorse) el('betHorse2').value = '';
  });


  // Replay
  let raceReplayData = [];

  el('replayBtn').addEventListener('click', () => {
  // Reset horses to starting position
  for (let i = 1; i <= 5; i++) {
    el('horse' + i).style.left = '0px';
  }

  let frameIndex = 0;

  function replayStep() {
    if (frameIndex >= raceReplayData.length) return;

    const currentPositions = raceReplayData[frameIndex];
    for (let i = 1; i <= 5; i++) {
      el('horse' + i).style.left = currentPositions[i - 1] + 'px';
    }

    frameIndex++;
    requestAnimationFrame(replayStep);
  }

  replayStep();
});


  // ----- UI Update Functions -----
  function updatePlayerStats() {
    const player = players[currentPlayer] || { balance: 0, wins: 0, losses: 0 };
    el('playerDisplay').textContent = currentPlayer || '-';
    el('money').textContent = player.balance;
    el('playerWins').textContent = player.wins;
    el('playerLosses').textContent = player.losses;
  }

  function updatePlayersList() {
    const ul = el('playersList');
    ul.innerHTML = '';
    Object.entries(players).forEach(([name, data]) => {
      const li = document.createElement('li');
      li.textContent = `${name} — Wins: ${data.wins}, Losses: ${data.losses}`;
      ul.appendChild(li);
    });
  }

  function updateLeaderboard() {
    const ol = el('leaders');
    ol.innerHTML = '';
    leaders.forEach(l => {
      const li = document.createElement('li');
      li.textContent = `Horse ${l.horse} - Wins: ${l.wins}`;
      ol.appendChild(li);
    });
  }

  function updateOddsDisplay() {
    const odds = calculateOdds();
    const ul = el('horseOdds');
    ul.innerHTML = '';
    for (let i = 1; i <= 5; i++) {
      const li = document.createElement('li');
      li.textContent = `Horse ${i}: ${odds[i]}x`;
      ul.appendChild(li);
    }
  }

  // ----- Data Persistence -----
  function savePlayers() {
    localStorage.setItem('players', JSON.stringify(players));
  }

  function saveLeaders() {
    localStorage.setItem('leaders', JSON.stringify(leaders));
  }

  // ----- Odds Calculation -----
  function calculateOdds() {
    const totalWins = leaders.reduce((sum, l) => sum + l.wins, 0) || 1;
    const odds = {};
    for (let i = 1; i <= 5; i++) {
      const wins = leaders.find(l => l.horse === i)?.wins || 0;
      odds[i] = ((totalWins + 5) / (wins + 1)).toFixed(2);
    }
    return odds;
  }

  // ----- Player Actions -----
  async function switchPlayer() {
  const name = el('playerName').value.trim().toLowerCase();
  const password = el('playerPassword').value;

  if (!name || !password) {
    alert('Enter a valid name and password.');
    return;
  }

  const hashedPassword = await hashPassword(password);

  if (!players[name]) {
    // Create new player with hashed password
    players[name] = {
      passwordHash: hashedPassword,
      balance: 100,
      wins: 0,
      losses: 0
    };
    alert(`New player "${name}" created with $100 starting balance.`);
  } else {
    // Existing player — verify hashed password
    if (players[name].passwordHash !== hashedPassword) {
      alert('Incorrect password.');
      return;
    }
  }

  currentPlayer = name;
  localStorage.setItem('currentPlayer', currentPlayer);
  localStorage.setItem('currentHash', hashedPassword);

  savePlayers();
  updatePlayerStats();
  updatePlayersList();
  el('result').textContent = '';
}

  function removePlayerData() {
    const name = el('removePlayerName').value.trim().toLowerCase();
    if (!name || !players[name]) {
      alert('Player not found');
      return;
    }
    if (confirm(`Are you sure you want to delete "${name}"?`)) {
      delete players[name];
      if (currentPlayer === name) {
        currentPlayer = '';
        updatePlayerStats();
      }
      savePlayers();
      updatePlayersList();
      alert('Player data removed.');
    }
  }

  function clearAllData() {
    if (confirm('Clear all data?')) {
      players = {};
      leaders = [];
      currentPlayer = '';
      savePlayers();
      saveLeaders();
      updatePlayerStats();
      updatePlayersList();
      updateLeaderboard();
      updateOddsDisplay();
      el('result').textContent = '';
    }
  }

  // ----- Race Logic -----
  function finishRace(winner) {
    // Enable start button
    el('raceBtn').disabled = false;

    // Show replay button
    el('replayBtn').style.display = 'block';

    // Celebration animation
    confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 } });

    // Update finish lines' colors
    document.querySelectorAll('.finish-line').forEach((line, idx) => {
      line.style.background = (idx + 1 === winner) ? 'green' : 'red';
      line.style.boxShadow = (idx + 1 === winner) ? '0 0 10px green' : '0 0 10px red';
    });

    // Update horse wins (leaderboard)
    let leader = leaders.find(l => l.horse === winner);
    if (leader) leader.wins++;
    else leaders.push({ horse: winner, wins: 1 });
    leaders.sort((a, b) => b.wins - a.wins);
    saveLeaders();
    updateLeaderboard();
    updateOddsDisplay();

    // Player result
    if (!currentPlayer) {
      el('result').textContent = `Horse ${winner} won! (No player loaded)`;
      return;
    }
    const player = players[currentPlayer];
    const betHorse1 = player.betHorse1;
    const betHorse2 = player.betHorse2;
    const betAmount = player.betAmount;

    player.balance -= betAmount; // Always deduct total bet first

    if (winner === betHorse1 || winner === betHorse2) {
      const winAmount = Math.round(betAmount * Number(calculateOdds()[winner]));
      player.balance += winAmount;
      player.wins++;
      el('result').textContent = `You WON $${winAmount - betAmount}! Horse ${winner} was the winner!`;
    } else {
      player.losses++;
      el('result').textContent = `You LOST $${betAmount}. Horse ${winner} won.`;
    }

    savePlayers();
    updatePlayerStats();
    updatePlayersList();
  }

  function startRace() {
    // Reset replay data
    raceReplayData = [];
    el('replayBtn').style.display = 'none';

    if (!currentPlayer) {
      alert('Please switch/load a player first.');
      return;
    }
    const betHorse1 = parseInt(el('betHorse1').value, 10);
    const betHorse2Raw = el('betHorse2').value;
    const betHorse2 = betHorse2Raw ? parseInt(betHorse2Raw, 10) : null;
    let baseAmount = parseInt(el('betAmount').value, 10);
    let betAmount = baseAmount;

    if (el('betType').value === '2') {
      betAmount *= 2; // Charge double for two-horse bets
    }


    if (
      isNaN(betHorse1) || betHorse1 < 1 || betHorse1 > 5 ||
      (el('betType').value === '2' && (betHorse2 === null || isNaN(betHorse2) || betHorse2 < 1 || betHorse2 > 5 || betHorse1 === betHorse2)) ||
      isNaN(betAmount) || betAmount < 3 ||
      players[currentPlayer].balance < betAmount
    ) {
      alert("Invalid bet: bet must be at least $3.");
      return;
    }

    players[currentPlayer].betHorse1 = betHorse1;
    players[currentPlayer].betHorse2 = betHorse2;
    players[currentPlayer].betAmount = betAmount;
    players[currentPlayer].originalBetAmount = baseAmount;

    // Disable start race button after game start
    el('raceBtn').disabled = true;

    for (let i = 1; i <= 5; i++) {
      el('horse' + i).style.left = '0px';
    }
    el('livePositionsList').innerHTML = '';
    el('result').textContent = '';
    el('countdown').textContent = '';

    // Reset finish lines to default red
    document.querySelectorAll('.finish-line').forEach(line => {
      line.style.background = 'red';
      line.style.boxShadow = '0 0 10px red';
    });

    const finishLine = 800;
    const positions = [0, 0, 0, 0, 0];
    const speeds = [];
    const maxSpeed = 5;
    const minSpeed = 1.5;

    for (let i = 1; i <= 5; i++) {
      const wins = leaders.find(l => l.horse === i)?.wins || 0;
      const baseSpeed = 3 / (wins + 1);

      // More unpredictable: randomFactor & bursts
      let randomFactor = 0.5 + Math.random() * 1.0;
      if (Math.random() < 0.1) {
        randomFactor += (Math.random() < 0.5 ? -0.5 : 0.5);
      }

      speeds[i - 1] = Math.min(maxSpeed, Math.max(minSpeed, baseSpeed)) * randomFactor;
    }

    let winner = null;
    el('startSound').play();

    let countdown = 3;
    el('countdown').textContent = countdown;
    const interval = setInterval(() => {
      countdown--;
      if (countdown === 0) {
        el('countdown').textContent = 'GO!';
        clearInterval(interval);
        runRace();
      } else {
        el('countdown').textContent = countdown;
      }
    }, 1000);

    // Run race animation
    function runRace() {
      function step() {
        // Save current positions
        raceReplayData.push([...positions]);
        // Find leading horse
        const leadingIndex = positions.indexOf(Math.max(...positions));


        // Existing logic to move horses
        for (let i = 0; i < 5; i++) {
          let move = Math.random() * speeds[i];

          // 💥 Tripping logic
          const isLeading = i === leadingIndex;
          const tripChance = isLeading ? 0.05 : 0.03;

          if (Math.random() < tripChance) {
            move *= 0.2; // Trip: slow down drastically
          }

          // Burst
          if (Math.random() < 0.1) move += Math.random() * 5;
          positions[i] += move;

          if (positions[i] >= finishLine && !winner) {
            winner = i + 1;
          }

          const horseEl = el('horse' + (i + 1));
          const jitterY = (Math.random() - 0.5) * 4;
          const facingRight = true; // or false if you want to flip later
          const scaleX = facingRight ? -1 : 1;
          horseEl.style.transform = `scaleX(${scaleX}) translateY(${jitterY}px)`;
        }

        // Rubberband trailing horse
        const trailingHorse = positions.indexOf(Math.min(...positions));
        positions[trailingHorse] += Math.random() * 0.3;

        for (let i = 1; i <= 5; i++) {
          el('horse' + i).style.left = positions[i - 1] + 'px';
        }

        updateLivePositions();

        if (!winner) requestAnimationFrame(step);
        else {
          for (let i = 1; i <= 5; i++) el('horse' + i).style.transform = 'scaleX(-1) translateY(0)';
          el('finishSound').play();
          el('countdown').textContent = '';
          finishRace(winner);
        }
      }
      step();
    }

    // Update live positions
    function updateLivePositions() {
      const sorted = positions
        .map((pos, i) => ({ horse: i + 1, pos }))
        .sort((a, b) => b.pos - a.pos);
      el('livePositionsList').innerHTML = '';
      sorted.forEach(h => {
        const li = document.createElement('li');
        li.textContent = `Horse ${h.horse}`;
        el('livePositionsList').appendChild(li);
      });
    }
  }

  // ----- Initial UI load -----
  updateLeaderboard();
  updatePlayersList();
  updateOddsDisplay();
  updatePlayerStats();

  // ----- Event Listeners -----
  el('raceBtn').addEventListener('click', startRace);
  el('clearDataBtn').addEventListener('click', clearAllData);
  el('removePlayerBtn').addEventListener('click', removePlayerData);
  el('switchPlayerBtn').addEventListener('click', switchPlayer);
};
