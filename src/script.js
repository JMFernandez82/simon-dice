/* ═══════════════════════════════════════════════════════
   CONFIG
═══════════════════════════════════════════════════════ */
const COLORS = ['red', 'blue', 'green', 'yellow'];

const DIFFICULTY_CFG = {
  easy:   { label: 'Fácil',        startDelay: 800, minDelay: 500, stepEvery: 5, stepAmount: 50,  timerSec: 8  },
  normal: { label: 'Normal',       startDelay: 600, minDelay: 300, stepEvery: 3, stepAmount: 75,  timerSec: 5  },
  hard:   { label: 'Difícil',      startDelay: 400, minDelay: 180, stepEvery: 3, stepAmount: 100, timerSec: 3  },
};

const NOTES = { red: 261.63, blue: 293.66, green: 329.63, yellow: 392.00 };
const STORAGE_KEY = 'simon-dice-v2';

/* ═══════════════════════════════════════════════════════
   AUDIO — single shared context
═══════════════════════════════════════════════════════ */
let audioCtx = null;

function getAudioCtx() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  if (audioCtx.state === 'suspended') audioCtx.resume();
  return audioCtx;
}

function playNote(frequency, duration = 300) {
  const ctx  = getAudioCtx();
  const osc  = ctx.createOscillator();
  const gain = ctx.createGain();
  const now  = ctx.currentTime;

  osc.type = 'sine';
  osc.frequency.value = frequency;
  osc.connect(gain);
  gain.connect(ctx.destination);

  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(0.45, now + 0.05);
  gain.gain.linearRampToValueAtTime(0,    now + duration / 1000);

  osc.start(now);
  osc.stop(now + duration / 1000);
}

/* ═══════════════════════════════════════════════════════
   PERSISTENCE
═══════════════════════════════════════════════════════ */
function loadData() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); }
  catch { return {}; }
}

function saveResult(difficulty, mode, level, extra = {}) {
  const data = loadData();
  const key  = `${difficulty}-${mode}`;
  if (!data[key]) data[key] = { best: 0, history: [] };

  const isNew = level > data[key].best;
  if (isNew) data[key].best = level;

  data[key].history.unshift({ level, date: new Date().toISOString(), ...extra });
  data[key].history = data[key].history.slice(0, 5);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  return isNew;
}

function getBest(difficulty, mode) {
  return loadData()[`${difficulty}-${mode}`]?.best ?? 0;
}

function getHistory(difficulty, mode) {
  return loadData()[`${difficulty}-${mode}`]?.history ?? [];
}

/* ═══════════════════════════════════════════════════════
   DOM REFS
═══════════════════════════════════════════════════════ */
const setupScreen    = document.getElementById('setupScreen');
const gameScreen     = document.getElementById('gameScreen');
const gameOverScreen = document.getElementById('gameOverScreen');

const startButton  = document.getElementById('startButton');
const quitButton   = document.getElementById('quitButton');
const replayButton = document.getElementById('replayButton');
const menuButton   = document.getElementById('menuButton');
const themeToggle  = document.getElementById('themeToggle');

const gameBoard  = document.getElementById('gameBoard');
const colorBtns  = document.querySelectorAll('.color-btn');

const levelDisplay   = document.getElementById('levelDisplay');
const bestDisplay    = document.getElementById('bestDisplay');
const playerCell     = document.getElementById('playerCell');
const playerDisplay  = document.getElementById('playerDisplay');
const gameMsg        = document.getElementById('gameMsg');

const timerWrap = document.getElementById('timerWrap');
const timerFill = document.getElementById('timerFill');
const timerNum  = document.getElementById('timerNum');

const readyOverlay = document.getElementById('readyOverlay');
const readyPlayer  = document.getElementById('readyPlayer');
const readyButton  = document.getElementById('readyButton');

const bestStrip    = document.getElementById('bestStrip');
const resultEmoji  = document.getElementById('resultEmoji');
const resultTitle  = document.getElementById('resultTitle');
const resultSub    = document.getElementById('resultSub');
const statLevel    = document.getElementById('statLevel');
const statBest     = document.getElementById('statBest');
const statNew      = document.getElementById('statNew');
const historyCard  = document.getElementById('historyCard');

/* ═══════════════════════════════════════════════════════
   GAME STATE
═══════════════════════════════════════════════════════ */
let sequence       = [];
let playerSequence = [];
let level          = 0;
let playing        = false;
let computerTurn   = false;
let currentPlayer  = 1;
let gameDifficulty = 'normal';
let gameMode       = 'classic';
let timerInterval  = null;
let timerTimeout   = null;
let readyCb        = null;

/* ═══════════════════════════════════════════════════════
   SCREENS
═══════════════════════════════════════════════════════ */
function showScreen(id) {
  setupScreen.hidden    = id !== 'setup';
  gameScreen.hidden     = id !== 'game';
  gameOverScreen.hidden = id !== 'gameover';
}

/* ═══════════════════════════════════════════════════════
   SETUP HELPERS
═══════════════════════════════════════════════════════ */
function getSelectedDifficulty() {
  return document.querySelector('input[name="difficulty"]:checked').value;
}

function getSelectedMode() {
  return document.querySelector('input[name="mode"]:checked').value;
}

function getModeLabel(mode) {
  return { classic: 'Clásico', timed: 'Contrarreloj', multiplayer: '2 Jugadores' }[mode] ?? mode;
}

function refreshBestStrip() {
  const d = getSelectedDifficulty();
  const m = getSelectedMode();
  const b = getBest(d, m);
  bestStrip.innerHTML = b > 0
    ? `<span class="best-chip">${DIFFICULTY_CFG[d].label} · ${getModeLabel(m)}: <strong>${b}</strong></span>`
    : '';
}

document.querySelectorAll('input[name="difficulty"], input[name="mode"]')
  .forEach(el => el.addEventListener('change', refreshBestStrip));

/* ═══════════════════════════════════════════════════════
   GAME FLOW
═══════════════════════════════════════════════════════ */
function startGame() {
  gameDifficulty = getSelectedDifficulty();
  gameMode       = getSelectedMode();

  sequence       = [];
  playerSequence = [];
  level          = 0;
  playing        = true;
  computerTurn   = false;
  currentPlayer  = 1;

  playerCell.hidden   = gameMode !== 'multiplayer';
  playerDisplay.textContent = 'J1';
  bestDisplay.textContent   = getBest(gameDifficulty, gameMode);
  levelDisplay.textContent  = '—';

  readyOverlay.hidden = true;

  // Reserve timer space from the start in timed mode to avoid layout jumps
  if (gameMode === 'timed') {
    const totalSec = DIFFICULTY_CFG[gameDifficulty].timerSec;
    timerWrap.hidden = false;
    timerWrap.classList.add('timer-idle');
    timerFill.style.transition = 'none';
    timerFill.style.width = '100%';
    timerNum.textContent = totalSec;
  } else {
    timerWrap.hidden = true;
  }

  showScreen('game');
  nextRound();
}

function getDelay() {
  const cfg = DIFFICULTY_CFG[gameDifficulty];
  const steps = Math.floor((level - 1) / cfg.stepEvery);
  return Math.max(cfg.minDelay, cfg.startDelay - steps * cfg.stepAmount);
}

function nextRound() {
  playerSequence = [];
  currentPlayer  = 1;
  if (gameMode === 'multiplayer') playerDisplay.textContent = 'J1';

  level++;
  levelDisplay.textContent = level;

  sequence.push(COLORS[Math.floor(Math.random() * COLORS.length)]);

  // Simon plays the sequence
  computerTurn = true;
  gameBoard.classList.add('computer-turn');
  gameMsg.textContent = `Nivel ${level} — Observa...`;

  const delay = getDelay();
  sequence.forEach((color, i) => {
    setTimeout(() => flashButton(color), delay * (i + 1));
  });

  setTimeout(() => {
    computerTurn = false;
    gameBoard.classList.remove('computer-turn');

    if (gameMode === 'multiplayer') {
      showReadyModal(1, () => {
        gameMsg.textContent = 'Jugador 1 — Repite la secuencia';
      });
    } else {
      gameMsg.textContent = 'Repite la secuencia...';
      startTimer();
    }
  }, delay * sequence.length + 500);
}

/* ═══════════════════════════════════════════════════════
   PLAYER INPUT
═══════════════════════════════════════════════════════ */
function handlePlayerClick(event) {
  if (!playing || computerTurn || !readyOverlay.hidden) return;

  const color = event.target.dataset.color;
  if (!color) return;

  playerSequence.push(color);
  flashButton(color);

  const idx = playerSequence.length - 1;

  // Wrong color
  if (playerSequence[idx] !== sequence[idx]) {
    stopTimer();
    endGame('wrong');
    return;
  }

  // Completed the sequence
  if (playerSequence.length === sequence.length) {
    stopTimer();

    if (gameMode === 'multiplayer' && currentPlayer === 1) {
      // Hand off to Player 2 with the same sequence
      currentPlayer = 2;
      playerDisplay.textContent = 'J2';
      playerSequence = [];

      showReadyModal(2, () => {
        gameMsg.textContent = 'Jugador 2 — Repite la secuencia';
      });
    } else {
      // Round won
      triggerVictoryFlash();
      gameMsg.textContent = '¡Perfecto! Siguiente nivel...';
      setTimeout(nextRound, 1200);
    }
  }
}

/* ═══════════════════════════════════════════════════════
   READY MODAL (2 jugadores)
═══════════════════════════════════════════════════════ */
function showReadyModal(player, callback) {
  readyCb = callback;
  readyPlayer.textContent = `Turno de Jugador ${player}`;
  readyOverlay.hidden = false;
}

readyButton.addEventListener('click', () => {
  readyOverlay.hidden = true;
  if (readyCb) { readyCb(); readyCb = null; }
});

/* ═══════════════════════════════════════════════════════
   TIMER (contrarreloj)
═══════════════════════════════════════════════════════ */
function startTimer() {
  if (gameMode !== 'timed') return;

  const totalSec = DIFFICULTY_CFG[gameDifficulty].timerSec;
  let timeLeft   = totalSec;

  timerWrap.classList.remove('timer-idle');
  timerNum.textContent = timeLeft;

  // Reset bar without transition, then animate
  timerFill.style.transition = 'none';
  timerFill.style.width = '100%';
  requestAnimationFrame(() => requestAnimationFrame(() => {
    timerFill.style.transition = `width ${totalSec}s linear`;
    timerFill.style.width = '0%';
  }));

  timerInterval = setInterval(() => {
    timeLeft--;
    timerNum.textContent = Math.max(0, timeLeft);
  }, 1000);

  timerTimeout = setTimeout(() => {
    resetTimerIdle();
    endGame('timeout');
  }, totalSec * 1000);
}

function resetTimerIdle() {
  clearInterval(timerInterval);
  clearTimeout(timerTimeout);
  timerInterval = timerTimeout = null;
  timerFill.style.transition = 'none';
  timerFill.style.width = '100%';
  const totalSec = DIFFICULTY_CFG[gameDifficulty].timerSec;
  timerNum.textContent = totalSec;
  timerWrap.classList.add('timer-idle');
}

function stopTimer() {
  if (gameMode === 'timed') {
    resetTimerIdle();
  } else {
    clearInterval(timerInterval);
    clearTimeout(timerTimeout);
    timerInterval = timerTimeout = null;
    timerWrap.hidden = true;
  }
}

/* ═══════════════════════════════════════════════════════
   GAME OVER
═══════════════════════════════════════════════════════ */
function endGame(reason) {
  playing = false;
  computerTurn = false;
  gameBoard.classList.remove('computer-turn');
  readyOverlay.hidden = true;
  timerWrap.hidden = true;
  timerWrap.classList.remove('timer-idle');

  const extra = gameMode === 'multiplayer'
    ? { winner: currentPlayer === 1 ? 2 : 1 }
    : {};

  const isNew = saveResult(gameDifficulty, gameMode, level, extra);

  // Result card content
  let emoji, title, sub;

  if (gameMode === 'multiplayer') {
    const winner = currentPlayer === 1 ? 2 : 1;
    emoji = '🏆';
    title = `¡Jugador ${winner} gana!`;
    sub   = reason === 'timeout'
      ? `Jugador ${currentPlayer} se quedó sin tiempo en el nivel ${level}`
      : `Jugador ${currentPlayer} cometió un error en el nivel ${level}`;
  } else if (reason === 'timeout') {
    emoji = '⏰';
    title = '¡Tiempo agotado!';
    sub   = `Llegaste al nivel ${level}`;
  } else {
    emoji = level >= 15 ? '🔥' : level >= 8 ? '⭐' : '💫';
    title = '¡Fin del juego!';
    sub   = `Fallaste en el nivel ${level}`;
  }

  resultEmoji.textContent = emoji;
  resultTitle.textContent = title;
  resultSub.textContent   = sub;
  statLevel.textContent   = level;
  statBest.textContent    = getBest(gameDifficulty, gameMode);
  statNew.hidden          = !isNew;

  renderHistory();
  showScreen('gameover');
}

function renderHistory() {
  const history = getHistory(gameDifficulty, gameMode);

  if (!history.length) {
    historyCard.innerHTML = `
      <p class="history-header">Historial</p>
      <p class="history-empty">Sin partidas anteriores</p>
    `;
    return;
  }

  const items = history.map(entry => {
    const d    = new Date(entry.date);
    const date = d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
    const time = d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
    const winnerBadge = entry.winner ? ` · J${entry.winner} ganó` : '';
    return `
      <li class="history-item">
        <span class="history-level">Nivel <em>${entry.level}</em>${winnerBadge}</span>
        <span class="history-meta">${date} · ${time}</span>
      </li>
    `;
  }).join('');

  historyCard.innerHTML = `
    <p class="history-header">Últimas partidas</p>
    <ul class="history-list">${items}</ul>
  `;
}

/* ═══════════════════════════════════════════════════════
   VICTORY FLASH
═══════════════════════════════════════════════════════ */
function triggerVictoryFlash() {
  gameBoard.classList.add('victory-flash');
  gameBoard.addEventListener('animationend', () => {
    gameBoard.classList.remove('victory-flash');
  }, { once: true });
}

/* ═══════════════════════════════════════════════════════
   FLASH BUTTON
═══════════════════════════════════════════════════════ */
function flashButton(color) {
  const btn = document.querySelector(`.color-btn--${color}`);
  if (!btn) return;
  btn.classList.add('flash');
  playNote(NOTES[color]);
  setTimeout(() => btn.classList.remove('flash'), 400);
}

/* ═══════════════════════════════════════════════════════
   THEME
═══════════════════════════════════════════════════════ */
const themeIcon = document.querySelector('.theme-icon');

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  themeIcon.textContent = theme === 'dark' ? '☀️' : '🌙';
  localStorage.setItem('simon-dice-theme', theme);
}

themeToggle.addEventListener('click', () => {
  applyTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark');
});

/* ═══════════════════════════════════════════════════════
   EVENT LISTENERS
═══════════════════════════════════════════════════════ */
startButton.addEventListener('click', startGame);
gameBoard.addEventListener('click', handlePlayerClick);

quitButton.addEventListener('click', () => {
  clearInterval(timerInterval);
  clearTimeout(timerTimeout);
  timerInterval = timerTimeout = null;
  timerWrap.hidden = true;
  playing = false;
  showScreen('setup');
  refreshBestStrip();
});

replayButton.addEventListener('click', startGame);

menuButton.addEventListener('click', () => {
  showScreen('setup');
  refreshBestStrip();
});

/* ═══════════════════════════════════════════════════════
   INIT
═══════════════════════════════════════════════════════ */
applyTheme(localStorage.getItem('simon-dice-theme') || 'dark');
refreshBestStrip();
