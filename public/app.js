import {
  HISTORY_STORAGE_KEY,
  SUSPENDED_LOCAL_STORAGE_KEY,
  restoreSuspendedLocalGame,
  makeSuspendedLocalGame,
  upsertGameHistory,
} from './history.js';

const canvas = document.querySelector('#board');
const ctx = canvas.getContext('2d');
const els = {
  generateRoom: document.querySelector('#generateRoom'),
  joinGeneratedRoom: document.querySelector('#joinGeneratedRoom'),
  newGameTab: document.querySelector('#newGameTab'),
  existingGameTab: document.querySelector('#existingGameTab'),
  newGamePanel: document.querySelector('#newGamePanel'),
  existingGamePanel: document.querySelector('#existingGamePanel'),
  onlineMode: document.querySelector('#onlineMode'),
  localMode: document.querySelector('#localMode'),
  localPanel: document.querySelector('#localPanel'),
  localForm: document.querySelector('#localForm'),
  localP1Name: document.querySelector('#localP1Name'),
  localP2Name: document.querySelector('#localP2Name'),
  onlineMoveTimer: document.querySelector('#onlineMoveTimer'),
  localMoveTimer: document.querySelector('#localMoveTimer'),
  resumeLocalCard: document.querySelector('#resumeLocalCard'),
  resumeLocalText: document.querySelector('#resumeLocalText'),
  resumeLocalSaved: document.querySelector('#resumeLocalSaved'),
  discardLocalSaved: document.querySelector('#discardLocalSaved'),
  existingRoomForm: document.querySelector('#existingRoomForm'),
  existingRoomInput: document.querySelector('#existingRoomInput'),
  copyInviteCard: document.querySelector('#copyInviteCard'),
  playerNameInput: document.querySelector('#playerNameInput'),
  roomText: document.querySelector('#roomText'),
  inviteBox: document.querySelector('#inviteBox'),
  inviteLink: document.querySelector('#inviteLink'),
  qr: document.querySelector('#qr'),
  winnerOverlay: document.querySelector('#winnerOverlay'),
  winnerName: document.querySelector('#winnerName'),
  winnerClose: document.querySelector('#winnerClose'),
  winnerNewRound: document.querySelector('#winnerNewRound'),
  pauseGame: document.querySelector('#pauseGame'),
  playPauseGame: document.querySelector('#playPauseGame'),
  pauseOverlay: document.querySelector('#pauseOverlay'),
  pauseTitle: document.querySelector('#pauseTitle'),
  pauseMessage: document.querySelector('#pauseMessage'),
  pauseTurn: document.querySelector('#pauseTurn'),
  resumeGame: document.querySelector('#resumeGame'),
  pauseNewRound: document.querySelector('#pauseNewRound'),
  status: document.querySelector('#status'),
  playStatus: document.querySelector('#playStatus'),
  p1: document.querySelector('#p1'),
  p2: document.querySelector('#p2'),
  p1Score: document.querySelector('#p1Score'),
  p2Score: document.querySelector('#p2Score'),
  reset: document.querySelector('#reset'),
  replayStart: document.querySelector('#replayStart'),
  replayPrev: document.querySelector('#replayPrev'),
  replayNext: document.querySelector('#replayNext'),
  replayEnd: document.querySelector('#replayEnd'),
  replayRange: document.querySelector('#replayRange'),
  replayText: document.querySelector('#replayText'),
  historyList: document.querySelector('#historyList'),
  menuHistoryList: document.querySelector('#menuHistoryList'),
  clearHistory: document.querySelector('#clearHistory'),
  clearMenuHistory: document.querySelector('#clearMenuHistory'),
  appMenuButton: document.querySelector('#appMenuButton'),
  appMenuDropdown: document.querySelector('#appMenuDropdown'),
  appContentOverlay: document.querySelector('#appContentOverlay'),
  appContentClose: document.querySelector('#appContentClose'),
  appContentTitle: document.querySelector('#appContentTitle'),
  appMenuHistory: document.querySelector('#appMenuHistory'),
  appMenuRules: document.querySelector('#appMenuRules'),
  turnIndicator: document.querySelector('#turnIndicator'),
  toast: document.querySelector('#toast'),
};

const mobileTabs = [...document.querySelectorAll('.mobile-tab')];
const mobilePages = [...document.querySelectorAll('.mobile-page')];

let socket;
let roomId = location.pathname.startsWith('/room/') ? location.pathname.split('/').pop() : null;
let inviteUrl = roomId ? `${location.origin}/room/${roomId}` : '';
let gameMode = roomId ? 'online' : 'online-home';
let playerId = null;
let game = null;
let replayIndex = null;
const clientId = getClientId();
let wantsPlayerSession = false;
let playerName = localStorageSafeGet('traceballPlayerName') || generateRandomPlayerName();
let onlineAction = 'new';
let reconnectTimer = null;
let reconnectDelay = 1000;
let intentionalClose = false;
let lastWinnerKey = '';
let dismissedWinnerKey = '';
let confettiUntil = 0;
let turnMarkerJump = null;
let legalMoveHintFadeRaf = 0;
let legalMoveHintStartedAt = 0;
let legalMoveHintKey = '';
let clockRaf = 0;
let lastTimeoutKey = '';
let localTimeoutTimer = 0;
let viewedHistoryGame = false;

const board = { width: 9, height: 13, goalXMin: 3, goalXMax: 5 };
const margin = 58;
const ROOM_CODE_RE = /^[A-Za-z0-9_-]{6,32}$/;
const MOVE_HINT_ALPHA = 1;
const MOVE_HINT_FADE_IN_MS = 650;
const TURN_MARKER_JUMP_MS = 1400;
const TURN_MARKER_MAX_SCALE = 1.55;
const CONFETTI_MS = 4800;
const MOVE_TIMER_VALUES = [0, 5, 10, 15, 20, 30];
const DEFAULT_MOVE_TIMER_SECONDS = 15;

init();

function init() {
  setMobilePage('invite');
  registerServiceWorker();
  els.playerNameInput.value = playerName;
  initMoveTimerSelects();
  if (!localStorageSafeGet('traceballPlayerName')) persistPlayerName();
  if (roomId) prefillIncomingInviteFromUrl();
  updateModePanels();
  updateRoomText();
  renderHistoryPanel();
  renderSuspendedLocalCard();
  draw();
  if (roomId) connect(() => watchCurrentRoom());
  els.generateRoom.addEventListener('click', createRoom);
  els.joinGeneratedRoom.addEventListener('click', joinGeneratedGame);
  els.newGameTab.addEventListener('click', () => setOnlineAction('new'));
  els.existingGameTab.addEventListener('click', () => setOnlineAction('incoming'));
  els.playerNameInput.addEventListener('input', persistPlayerName);
  els.onlineMode.addEventListener('click', () => setHomeMode('online'));
  els.localMode.addEventListener('click', () => setHomeMode('local'));
  els.localForm.addEventListener('submit', startLocalGame);
  els.resumeLocalSaved.addEventListener('click', resumeSavedLocalGame);
  els.discardLocalSaved.addEventListener('click', discardSavedLocalGame);
  els.existingRoomForm.addEventListener('submit', joinExistingRoom);
  els.copyInviteCard.addEventListener('click', copyInvite);
  els.inviteLink.addEventListener('focus', copyInviteFromField);
  els.inviteLink.addEventListener('pointerdown', copyInviteFromField);

  els.reset.addEventListener('click', resetRound);
  els.pauseGame.addEventListener('click', pauseRound);
  els.playPauseGame.addEventListener('click', pauseRound);
  els.resumeGame.addEventListener('click', resumeRound);
  els.pauseNewRound.addEventListener('click', resetRound);
  els.winnerClose.addEventListener('click', dismissWinnerOverlay);
  els.winnerNewRound.addEventListener('click', resetRound);
  canvas.addEventListener('click', boardClick);
  els.replayStart.addEventListener('click', () => setReplay(0));
  els.replayPrev.addEventListener('click', () => setReplay(Math.max(0, currentReplay() - 1)));
  els.replayNext.addEventListener('click', () => setReplay(Math.min((game?.moves?.length || 0), currentReplay() + 1)));
  els.replayEnd.addEventListener('click', () => setReplay(game?.moves?.length || 0));
  els.replayRange.addEventListener('input', () => setReplay(Number(els.replayRange.value)));
  if (els.historyList) els.historyList.addEventListener('click', historyListClick);
  els.menuHistoryList.addEventListener('click', historyListClick);
  if (els.clearHistory) els.clearHistory.addEventListener('click', clearGameHistory);
  els.clearMenuHistory.addEventListener('click', clearGameHistory);
  els.appMenuButton.addEventListener('click', toggleAppMenu);
  els.appMenuDropdown.addEventListener('click', (event) => {
    const button = event.target.closest('[data-menu-view]');
    if (button) openAppContent(button.dataset.menuView);
  });
  els.appContentClose.addEventListener('click', closeAppContent);
  els.appContentOverlay.addEventListener('click', (event) => {
    if (event.target === els.appContentOverlay) closeAppContent();
  });
  document.addEventListener('click', (event) => {
    if (!els.appMenuDropdown.classList.contains('hidden') && !event.target.closest('#appMenuDropdown') && !event.target.closest('#appMenuButton')) closeAppMenu();
  });
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    if (!els.appContentOverlay.classList.contains('hidden')) closeAppContent();
    else if (!els.appMenuDropdown.classList.contains('hidden')) closeAppMenu();
  });
  mobileTabs.forEach((tab) => tab.addEventListener('click', () => setMobilePage(tab.dataset.pageTarget)));
  window.addEventListener('online', wakeConnection);
  window.addEventListener('focus', wakeConnection);
  window.addEventListener('pageshow', wakeConnection);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) wakeConnection(); });
}

function setHomeMode(mode) {
  const nextMode = mode === 'local' ? 'local-setup' : 'online-home';
  intentionalClose = true;
  if (socket && socket.readyState <= WebSocket.OPEN) socket.close();
  intentionalClose = false;
  socket = null;
  clearLocalTurnTimeout();
  gameMode = nextMode;
  if (nextMode === 'local-setup') {
    roomId = null;
    inviteUrl = '';
    els.inviteBox.classList.add('hidden');
    toast('Add names, then start the local match.');
  } else if (gameMode !== 'online') {
    roomId = null;
    inviteUrl = '';
    els.inviteBox.classList.add('hidden');
  }
  playerId = null;
  wantsPlayerSession = false;
  viewedHistoryGame = false;
  replayIndex = null;
  game = null;
  if (!roomId) history.pushState({}, '', '/');
  updateModePanels();
  updateRoomText();
  renderSuspendedLocalCard();
  updateUi();
  draw();
  setMobilePage('invite');
}

async function createRoom() {
  setOnlineAction('new');
  const moveTimeLimitSeconds = selectedMoveTimerSeconds(els.onlineMoveTimer);
  localStorageSafeSet('traceballMoveTimerSeconds', String(moveTimeLimitSeconds));
  const res = await fetch('/api/rooms', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ moveTimeLimitSeconds }),
  });
  const data = await res.json();
  openOnlineRoom(data.roomId, data.url, 'Game generated. Copy the invite, then join when ready.');
}

function joinGeneratedGame() {
  const name = requirePlayerName();
  if (!name) return;
  joinOnlinePlayer(name);
}

async function joinExistingRoom(event) {
  event.preventDefault();
  const name = requirePlayerName();
  if (!name) return;
  const parsed = parseRoomInput(els.existingRoomInput.value);
  if (!parsed.ok) return toast(parsed.error);
  const res = await fetch(`/api/rooms/${encodeURIComponent(parsed.roomId)}`, { cache: 'no-store' });
  if (res.status === 404) return toast('Game not found or expired.');
  if (!res.ok) return toast('Could not check that game. Try again.');
  const data = await res.json();
  openOnlineRoom(data.roomId, data.url, 'Game found. Joining now.');
  joinOnlinePlayer(name);
}

function setOnlineAction(action) {
  onlineAction = action === 'incoming' ? 'incoming' : 'new';
  const incoming = onlineAction === 'incoming';
  els.newGamePanel.classList.toggle('hidden', incoming);
  els.existingGamePanel.classList.toggle('hidden', !incoming);
  els.newGameTab.classList.toggle('active', !incoming);
  els.existingGameTab.classList.toggle('active', incoming);
  els.newGameTab.setAttribute('aria-pressed', String(!incoming));
  els.existingGameTab.setAttribute('aria-pressed', String(incoming));
  updateInviteVisibility();
}

function prefillIncomingInviteFromUrl() {
  inviteUrl = `${location.origin}/room/${roomId}`;
  els.existingRoomInput.value = inviteUrl;
  setOnlineAction('incoming');
}

function updateInviteVisibility() {
  const show = Boolean(inviteUrl) && onlineAction === 'new' && gameMode !== 'local-setup';
  els.inviteBox.classList.toggle('hidden', !show);
}

function persistPlayerName() {
  playerName = els.playerNameInput.value.trim();
  localStorageSafeSet('traceballPlayerName', playerName);
}

function requirePlayerName() {
  persistPlayerName();
  if (!playerName) {
    els.playerNameInput.focus();
    toast('Add your name first.');
    return '';
  }
  return playerName;
}

function initMoveTimerSelects() {
  const saved = selectedStoredMoveTimerSeconds();
  if (els.onlineMoveTimer) els.onlineMoveTimer.value = String(saved);
  if (els.localMoveTimer) els.localMoveTimer.value = String(saved);
  els.onlineMoveTimer?.addEventListener('change', () => localStorageSafeSet('traceballMoveTimerSeconds', String(selectedMoveTimerSeconds(els.onlineMoveTimer))));
  els.localMoveTimer?.addEventListener('change', () => localStorageSafeSet('traceballMoveTimerSeconds', String(selectedMoveTimerSeconds(els.localMoveTimer))));
}

function selectedStoredMoveTimerSeconds() {
  const saved = Number(localStorageSafeGet('traceballMoveTimerSeconds'));
  return MOVE_TIMER_VALUES.includes(saved) ? saved : DEFAULT_MOVE_TIMER_SECONDS;
}

function selectedMoveTimerSeconds(select) {
  const value = Number(select?.value);
  return MOVE_TIMER_VALUES.includes(value) ? value : DEFAULT_MOVE_TIMER_SECONDS;
}

function moveTimerLabel(ms) {
  if (!ms) return 'timer off';
  return `${Math.round(ms / 1000)}s clock`;
}

function parseRoomInput(raw) {
  const input = String(raw || '').trim();
  if (!input) return { ok: false, error: 'Paste a Traceball invite link or room code.' };
  if (input.length > 200) return { ok: false, error: 'That invite is too long.' };
  let candidate = input;
  const looksLikeLink = /^[a-z][a-z\d+.-]*:/i.test(input) || input.startsWith('/');
  if (looksLikeLink) {
    let url;
    try {
      url = new URL(input, location.origin);
    } catch {
      return { ok: false, error: 'That invite link is not valid.' };
    }
    if (url.origin !== location.origin) return { ok: false, error: 'Only Traceball invite links from this app can be joined.' };
    const parts = url.pathname.split('/').filter(Boolean);
    if (parts.length !== 2 || parts[0] !== 'room') return { ok: false, error: 'Paste a Traceball room link or room code.' };
    candidate = decodeURIComponent(parts[1]);
  } else if (input.includes('/') || input.includes(':')) {
    return { ok: false, error: 'Paste a Traceball room link or room code.' };
  }
  if (!ROOM_CODE_RE.test(candidate)) return { ok: false, error: 'That room code looks invalid.' };
  return { ok: true, roomId: candidate };
}

function openOnlineRoom(nextRoomId, nextUrl, message) {
  intentionalClose = true;
  if (socket && socket.readyState <= WebSocket.OPEN) socket.close();
  intentionalClose = false;
  socket = null;
  clearLocalTurnTimeout();
  playerId = null;
  game = null;
  viewedHistoryGame = false;
  replayIndex = null;
  wantsPlayerSession = false;
  roomId = nextRoomId;
  gameMode = 'online';
  inviteUrl = nextUrl || `${location.origin}/room/${roomId}`;
  history.pushState({}, '', `/room/${encodeURIComponent(roomId)}`);
  showInvite();
  updateRoomText();
  updateModePanels();
  updateUi();
  draw();
  connect(() => watchCurrentRoom());
  setMobilePage('invite');
  toast(message);
}

function startLocalGame(event) {
  event.preventDefault();
  intentionalClose = true;
  if (socket && socket.readyState <= WebSocket.OPEN) socket.close();
  intentionalClose = false;
  socket = null;
  clearLocalTurnTimeout();
  roomId = null;
  inviteUrl = '';
  playerId = null;
  wantsPlayerSession = false;
  viewedHistoryGame = false;
  replayIndex = null;
  gameMode = 'local';
  const p1Name = cleanLocalName(els.localP1Name.value, 'Blue');
  const p2Name = cleanLocalName(els.localP2Name.value, 'Red');
  const moveTimeLimitSeconds = selectedMoveTimerSeconds(els.localMoveTimer);
  localStorageSafeSet('traceballMoveTimerSeconds', String(moveTimeLimitSeconds));
  localStorageSafeRemove(SUSPENDED_LOCAL_STORAGE_KEY);
  game = createLocalGame(p1Name, p2Name, game?.score, moveTimeLimitSeconds * 1000);
  history.pushState({}, '', '/');
  els.inviteBox.classList.add('hidden');
  updateModePanels();
  updateRoomText();
  renderSuspendedLocalCard();
  updateUi();
  draw();
  scheduleLocalTurnTimeout();
  setMobilePage('play');
  toast('Local same-screen PvP started.');
}

function resetRound() {
  if (gameMode === 'history') return toast('Saved replays are read-only. Start a new match from Home.');
  if (gameMode === 'local') {
    const p1Name = game?.players?.p1?.name || cleanLocalName(els.localP1Name.value, 'Blue');
    const p2Name = game?.players?.p2?.name || cleanLocalName(els.localP2Name.value, 'Red');
    game = createLocalGame(p1Name, p2Name, game?.score, game?.moveTimeLimitMs || 0);
    localStorageSafeRemove(SUSPENDED_LOCAL_STORAGE_KEY);
    replayIndex = null;
    updateUi();
    draw();
    scheduleLocalTurnTimeout();
    toast('New local round.');
    return;
  }
  send({ type: 'reset' });
}

function pauseRound() {
  if (!game || game.status !== 'playing') return toast('Game is not playing.');
  if (gameMode === 'local') {
    pauseLocalGame('manual', null);
    toast('Game paused.');
    return;
  }
  if (!playerId) return toast('Join as a player to pause.');
  send({ type: 'pause' });
}

function resumeRound() {
  if (!game || game.status !== 'paused') return toast('Game is not paused.');
  if (gameMode === 'local') {
    game.status = 'playing';
    game.turn = game.pause?.resumeTurn || game.turn;
    game.pause = null;
    game.consecutiveTimeouts = 0;
    localStorageSafeRemove(SUSPENDED_LOCAL_STORAGE_KEY);
    renderSuspendedLocalCard();
    restartLocalTurnClock();
    updateUi();
    draw();
    toast('Game resumed.');
    return;
  }
  if (!playerId) return toast('Join as a player to resume.');
  send({ type: 'resume' });
}

function pauseLocalGame(reason = 'manual', byPlayerId = null) {
  if (!game || game.status !== 'playing') return;
  game.status = 'paused';
  game.turnStartedAt = null;
  clearLocalTurnTimeout();
  game.pause = {
    reason,
    byPlayerId,
    pausedAt: Date.now(),
    resumeTurn: game.turn,
  };
  replayIndex = null;
  saveSuspendedLocalGame();
  updateUi();
  draw();
}

function createLocalGame(p1Name, p2Name, score = { p1: 0, p2: 0 }, moveTimeLimitMs = 0) {
  const localGame = {
    roomId: 'local',
    status: 'playing',
    players: {
      p1: { id: 'p1', name: p1Name, color: '#0b7cff' },
      p2: { id: 'p2', name: p2Name, color: '#ff3b30' },
    },
    turn: 'p1',
    ball: { x: 4, y: 6 },
    visited: ['4,6'],
    segments: [],
    moves: [],
    score: { p1: score?.p1 || 0, p2: score?.p2 || 0 },
    winner: null,
    endReason: null,
    moveTimeLimitMs,
    turnStartedAt: moveTimeLimitMs > 0 ? Date.now() : null,
    lastTimeout: null,
    consecutiveTimeouts: 0,
    pause: null,
    legalMoves: [],
  };
  localGame.legalMoves = localLegalMoves(localGame);
  return localGame;
}

function saveSuspendedLocalGame() {
  const suspended = makeSuspendedLocalGame(game, { mode: gameMode, savedAt: Date.now() });
  if (!suspended) return;
  localStorageJsonSet(SUSPENDED_LOCAL_STORAGE_KEY, suspended);
  renderSuspendedLocalCard();
}

function renderSuspendedLocalCard() {
  const suspended = restoreSuspendedLocalGame(localStorageJsonGet(SUSPENDED_LOCAL_STORAGE_KEY));
  els.resumeLocalCard.classList.toggle('hidden', !suspended);
  if (!suspended) return;
  const saved = formatHistoryDate(suspended.savedAt);
  const p1 = suspended.game.players.p1?.name || 'Blue';
  const p2 = suspended.game.players.p2?.name || 'Red';
  const turnName = suspended.game.players[suspended.game.turn]?.name || suspended.game.turn;
  els.resumeLocalText.textContent = `${p1} vs ${p2} · ${turnName} to move · saved ${saved}.`;
}

function resumeSavedLocalGame() {
  const suspended = restoreSuspendedLocalGame(localStorageJsonGet(SUSPENDED_LOCAL_STORAGE_KEY));
  if (!suspended) {
    renderSuspendedLocalCard();
    return toast('No paused local game saved.');
  }
  intentionalClose = true;
  if (socket && socket.readyState <= WebSocket.OPEN) socket.close();
  intentionalClose = false;
  socket = null;
  clearLocalTurnTimeout();
  roomId = null;
  inviteUrl = '';
  playerId = null;
  wantsPlayerSession = false;
  viewedHistoryGame = false;
  gameMode = 'local';
  game = suspended.game;
  replayIndex = null;
  history.pushState({}, '', '/');
  els.inviteBox.classList.add('hidden');
  updateModePanels();
  updateRoomText();
  updateUi();
  draw();
  setMobilePage('play');
  toast('Paused local game restored.');
}

function discardSavedLocalGame() {
  localStorageSafeRemove(SUSPENDED_LOCAL_STORAGE_KEY);
  renderSuspendedLocalCard();
  toast('Paused local game discarded.');
}

function saveFinishedGameIfNeeded() {
  if (!game || game.status !== 'finished' || viewedHistoryGame) return;
  const history = localStorageJsonGet(HISTORY_STORAGE_KEY, []);
  const nextHistory = upsertGameHistory(history, game, { mode: gameMode === 'local' ? 'local' : 'online', roomId: roomId || game.roomId || 'local', savedAt: Date.now() });
  localStorageJsonSet(HISTORY_STORAGE_KEY, nextHistory);
  if (gameMode === 'local') {
    localStorageSafeRemove(SUSPENDED_LOCAL_STORAGE_KEY);
    renderSuspendedLocalCard();
  }
  renderHistoryPanel();
}

function renderHistoryPanel() {
  const history = localStorageJsonGet(HISTORY_STORAGE_KEY, []);
  if (els.clearHistory) els.clearHistory.disabled = history.length === 0;
  els.clearMenuHistory.disabled = history.length === 0;
  const emptyHtml = '<p class="history-empty">Finished games will appear here. Online games are saved on every device that sees the result.</p>';
  const listHtml = history.length ? history.slice(0, 8).map((entry, index) => historyItemHtml(entry, index)).join('') : emptyHtml;
  if (els.historyList) els.historyList.innerHTML = listHtml;
  els.menuHistoryList.innerHTML = listHtml;
}

function historyItemHtml(entry, index) {
  const winnerName = entry.players?.[entry.winner]?.name || entry.winner || 'Unknown';
  const p1 = entry.players?.p1?.name || 'Blue';
  const p2 = entry.players?.p2?.name || 'Red';
  const score = `${entry.score?.p1 || 0}-${entry.score?.p2 || 0}`;
  return `<article class="history-item">
    <div class="history-item-title"><span>${escapeHtml(winnerName)} won</span><span>${escapeHtml(score)}</span></div>
    <div class="history-meta">${escapeHtml(entry.mode)} · ${escapeHtml(p1)} vs ${escapeHtml(p2)} · ${entry.moveCount || 0} moves · ${escapeHtml(formatHistoryDate(entry.playedAt))}</div>
    <button type="button" data-history-index="${index}">Replay</button>
  </article>`;
}

function historyListClick(event) {
  const button = event.target.closest('[data-history-index]');
  if (!button) return;
  const index = Number(button.dataset.historyIndex);
  const entry = localStorageJsonGet(HISTORY_STORAGE_KEY, [])[index];
  if (!entry?.game) return toast('That saved game could not be loaded.');
  loadHistoryReplay(entry);
}

function loadHistoryReplay(entry) {
  intentionalClose = true;
  if (socket && socket.readyState <= WebSocket.OPEN) socket.close();
  intentionalClose = false;
  socket = null;
  clearLocalTurnTimeout();
  roomId = null;
  inviteUrl = '';
  playerId = null;
  wantsPlayerSession = false;
  viewedHistoryGame = true;
  gameMode = 'history';
  game = entry.game;
  replayIndex = 0;
  history.pushState({}, '', '/');
  els.inviteBox.classList.add('hidden');
  updateModePanels();
  updateRoomText();
  updateUi();
  draw();
  setMobilePage('play');
  closeAppContent();
  toast('Loaded saved replay.');
}

function clearGameHistory() {
  localStorageSafeRemove(HISTORY_STORAGE_KEY);
  renderHistoryPanel();
  toast('Game history cleared on this device.');
}

function toggleAppMenu() {
  if (els.appMenuDropdown.classList.contains('hidden')) openAppMenu();
  else closeAppMenu();
}

function openAppMenu() {
  els.appMenuDropdown.classList.remove('hidden');
  els.appMenuButton.setAttribute('aria-expanded', 'true');
}

function closeAppMenu() {
  els.appMenuDropdown.classList.add('hidden');
  els.appMenuButton.setAttribute('aria-expanded', 'false');
}

function openAppContent(view) {
  const selected = view === 'rules' ? 'rules' : 'history';
  closeAppMenu();
  els.appMenuHistory.classList.toggle('hidden', selected !== 'history');
  els.appMenuRules.classList.toggle('hidden', selected !== 'rules');
  els.appContentTitle.textContent = selected === 'history' ? 'Play History' : 'Rules';
  if (selected === 'history') renderHistoryPanel();
  els.appContentOverlay.classList.remove('hidden');
  document.body.classList.add('menu-open');
  requestAnimationFrame(() => els.appContentClose.focus());
}

function closeAppContent() {
  els.appContentOverlay.classList.add('hidden');
  document.body.classList.remove('menu-open');
  els.appMenuButton.focus();
}

function makeLocalMove(to) {
  if (!game || game.status !== 'playing') return;
  if (expireLocalTurnIfNeeded()) return;
  const player = game.turn;
  game.consecutiveTimeouts = 0;
  game.pause = null;
  const from = { ...game.ball };
  const target = { x: Number(to.x), y: Number(to.y) };
  if (!localIsLegalTarget(game, target)) return toast('That move is not legal.');
  const visitedBefore = game.visited.includes(localPointKey(target));
  const boundaryBounce = isBoundaryPoint(target);
  const segment = localSegmentKey(from, target);
  game.segments.push(segment);
  game.ball = target;
  if (!visitedBefore) game.visited.push(localPointKey(target));
  const move = { playerId: player, from, to: target, segment, bounce: false, at: Date.now() };
  const goal = localGoalForMove(player, target);
  if (goal) {
    game.status = 'finished';
    game.turnStartedAt = null;
    clearLocalTurnTimeout();
    game.winner = goal.winner;
    game.endReason = goal.reason;
    game.score[goal.winner] = (game.score[goal.winner] || 0) + 1;
    move.goal = true;
    game.moves.push(move);
    game.legalMoves = [];
    replayIndex = null;
    updateUi();
    draw();
    return;
  }
  const getsBounce = visitedBefore || boundaryBounce;
  move.bounce = getsBounce;
  game.moves.push(move);
  if (!getsBounce) game.turn = otherLocalPlayer(player);
  if (game.turn !== player && game.status === 'playing') startTurnMarkerJump(player, game.turn);
  restartLocalTurnClock();
  game.legalMoves = localLegalMoves(game);
  if (game.legalMoves.length === 0) {
    const winner = otherLocalPlayer(game.turn);
    game.status = 'finished';
    game.turnStartedAt = null;
    clearLocalTurnTimeout();
    game.winner = winner;
    game.endReason = `${game.players[game.turn]?.name || game.turn} is stuck — ${game.players[winner]?.name || winner} wins.`;
    game.score[winner] = (game.score[winner] || 0) + 1;
  }
  replayIndex = null;
  updateUi();
  draw();
}

function localLegalMoves(localGame) {
  const moves = [];
  for (let dy = -1; dy <= 1; dy += 1) {
    for (let dx = -1; dx <= 1; dx += 1) {
      if (dx === 0 && dy === 0) continue;
      const to = { x: localGame.ball.x + dx, y: localGame.ball.y + dy };
      if (localIsLegalTarget(localGame, to)) moves.push(to);
    }
  }
  return moves;
}

function localIsLegalTarget(localGame, to) {
  return isOnBoardOrGoal(to)
    && isOneStep(localGame.ball, to)
    && !localGame.segments.includes(localSegmentKey(localGame.ball, to))
    && !isTracedMarginSegment(localGame.ball, to)
    && !isBlockedCornerCut(localGame.ball, to);
}

function restartLocalTurnClock() {
  if (!game || game.status !== 'playing') return;
  game.turnStartedAt = game.moveTimeLimitMs > 0 ? Date.now() : null;
  scheduleLocalTurnTimeout();
}

function clearLocalTurnTimeout() {
  clearTimeout(localTimeoutTimer);
  localTimeoutTimer = 0;
}

function scheduleLocalTurnTimeout() {
  clearLocalTurnTimeout();
  if (!game || gameMode !== 'local' || game.status !== 'playing' || !game.moveTimeLimitMs || !game.turnStartedAt) return;
  const delay = Math.max(0, game.turnStartedAt + game.moveTimeLimitMs - Date.now() + 30);
  localTimeoutTimer = setTimeout(() => {
    localTimeoutTimer = 0;
    if (expireLocalTurnIfNeeded()) return;
    scheduleLocalTurnTimeout();
  }, delay);
}

function expireLocalTurnIfNeeded() {
  if (!game || gameMode !== 'local' || game.status !== 'playing' || !game.moveTimeLimitMs || !game.turnStartedAt) return false;
  if (Date.now() - game.turnStartedAt < game.moveTimeLimitMs) return false;
  const timedOutPlayer = game.turn;
  const now = Date.now();
  game.lastTimeout = { playerId: timedOutPlayer, at: now, ball: { ...game.ball } };
  if ((game.consecutiveTimeouts || 0) >= 1) {
    pauseLocalGame('idle', timedOutPlayer);
    toast('Both players timed out. Game paused.');
    return true;
  }
  const nextPlayer = otherLocalPlayer(timedOutPlayer);
  game.consecutiveTimeouts = 1;
  game.turn = nextPlayer;
  game.legalMoves = localLegalMoves(game);
  if (game.legalMoves.length === 0) {
    game.status = 'finished';
    game.turnStartedAt = null;
    clearLocalTurnTimeout();
    game.winner = timedOutPlayer;
    game.endReason = `${game.players[nextPlayer]?.name || nextPlayer} is stuck after ${game.players[timedOutPlayer]?.name || timedOutPlayer} timed out — ${game.players[timedOutPlayer]?.name || timedOutPlayer} wins.`;
    game.score[timedOutPlayer] = (game.score[timedOutPlayer] || 0) + 1;
  } else {
    restartLocalTurnClock();
    startTurnMarkerJump(timedOutPlayer, nextPlayer);
    toast(`${game.players[timedOutPlayer]?.name || timedOutPlayer} timed out — ${game.players[nextPlayer]?.name || nextPlayer}'s turn.`);
  }
  replayIndex = null;
  updateUi();
  draw();
  return true;
}

function localGoalForMove(player, target) {
  if (target.y !== 0 && target.y !== 12) return null;
  const scoredOpponentGoal = (player === 'p1' && target.y === 0) || (player === 'p2' && target.y === 12);
  if (scoredOpponentGoal) return { winner: player, reason: `${game.players[player]?.name || player} scored!` };
  const winner = otherLocalPlayer(player);
  return { winner, reason: `Own goal by ${game.players[player]?.name || player}.` };
}

function cleanLocalName(name, fallback) {
  return String(name || '').trim().slice(0, 24) || fallback;
}

function otherLocalPlayer(id) { return id === 'p1' ? 'p2' : 'p1'; }
function localPointKey(p) { return `${p.x},${p.y}`; }
function localSegmentKey(a, b) {
  const ak = localPointKey(a);
  const bk = localPointKey(b);
  return ak < bk ? `${ak}|${bk}` : `${bk}|${ak}`;
}

function joinOnlinePlayer(name = playerName) {
  if (!roomId) return toast('Generate or choose a game first.');
  playerName = String(name || '').trim();
  if (!playerName) return toast('Add your name first.');
  wantsPlayerSession = true;
  localStorageSafeSet('traceballPlayerName', playerName);
  const joinRoom = () => send({ type: 'join', roomId, name: playerName, clientId });
  if (!socket || socket.readyState > WebSocket.OPEN) connect(joinRoom);
  else if (socket.readyState === WebSocket.CONNECTING) socket.addEventListener('open', joinRoom, { once: true });
  else joinRoom();
  setMobilePage('play');
}

function connect(onOpen) {
  clearTimeout(reconnectTimer);
  const protocol = location.protocol === 'https:' ? 'wss' : 'ws';
  intentionalClose = false;
  socket = new WebSocket(`${protocol}://${location.host}/ws`);
  const activeSocket = socket;
  if (onOpen) socket.addEventListener('open', onOpen, { once: true });
  socket.addEventListener('open', () => { reconnectDelay = 1000; });
  socket.addEventListener('message', (event) => {
    const msg = JSON.parse(event.data);
    if (msg.type === 'joined') {
      playerId = msg.playerId;
      wantsPlayerSession = true;
      setMobilePage('play');
      toast(`Joined as ${playerId === 'p1' ? 'Blue' : 'Red'}.`);
    }
    if (msg.type === 'state') {
      applyRemoteGameState(msg.game);
      if (replayIndex !== null && replayIndex > game.moves.length) replayIndex = game.moves.length;
      updateUi();
      draw();
    }
    if (msg.type === 'error') toast(msg.error);
  });
  socket.addEventListener('close', () => {
    if (socket !== activeSocket) return;
    if (!intentionalClose && roomId) {
      toast('Connection paused — reconnecting…');
      scheduleReconnect();
    }
  });
}

function applyRemoteGameState(nextGame) {
  const previousTurn = game?.turn;
  const previousStatus = game?.status;
  game = nextGame;
  const timeout = game.lastTimeout;
  const timeoutKey = timeout ? `${timeout.playerId}:${timeout.at}` : '';
  if (timeoutKey && timeoutKey !== lastTimeoutKey) {
    lastTimeoutKey = timeoutKey;
    const timedOutName = game.players[timeout.playerId]?.name || timeout.playerId;
    if (game.status === 'paused' && game.pause?.reason === 'idle') {
      toast(`Both players timed out. Game paused.`);
    } else {
      const turnName = game.players[game.turn]?.name || game.turn;
      toast(`${timedOutName} timed out — ${turnName}'s turn.`);
    }
  }
  if (previousStatus === 'playing' && game.status === 'paused' && game.pause?.reason === 'manual') {
    const pausedBy = game.players[game.pause?.byPlayerId]?.name || game.pause?.byPlayerId;
    toast(pausedBy ? `Game paused by ${pausedBy}.` : 'Game paused.');
  }
  if (previousStatus === 'paused' && game.status === 'playing') toast('Game resumed.');
  if (previousStatus === 'playing' && game.status === 'playing' && previousTurn && previousTurn !== game.turn) {
    startTurnMarkerJump(previousTurn, game.turn);
  }
}

function watchCurrentRoom() {
  if (roomId) send({ type: 'watch', roomId });
}

function resumeRoomSession() {
  if (!roomId) return;
  if (wantsPlayerSession && playerName) send({ type: 'join', roomId, name: playerName, clientId });
  else watchCurrentRoom();
}

function scheduleReconnect() {
  clearTimeout(reconnectTimer);
  reconnectTimer = setTimeout(() => connect(resumeRoomSession), reconnectDelay);
  reconnectDelay = Math.min(reconnectDelay * 1.6, 8000);
}

function wakeConnection() {
  if (!roomId) return;
  if (!socket || socket.readyState === WebSocket.CLOSED || socket.readyState === WebSocket.CLOSING) connect(resumeRoomSession);
  else if (socket.readyState === WebSocket.OPEN) resumeRoomSession();
}

function send(payload) {
  if (!socket || socket.readyState !== WebSocket.OPEN) return toast('Not connected yet.');
  socket.send(JSON.stringify(payload));
}

function boardClick(event) {
  if (!game || game.status !== 'playing' || replayIndex !== null) return;
  if (gameMode !== 'local' && game.turn !== playerId) return toast('Wait for your turn.');
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  const rawClick = { x: (event.clientX - rect.left) * scaleX, y: (event.clientY - rect.top) * scaleY };
  const click = boardSpacePoint(rawClick);
  const target = nearestPoint(click);
  if (!target) return;
  const legal = game.legalMoves.some((p) => p.x === target.x && p.y === target.y);
  if (!legal) return toast('That move is not legal.');
  if (gameMode === 'local') return makeLocalMove(target);
  send({ type: 'move', to: target });
}

function nearestPoint(click) {
  let best = null;
  let bestDist = Infinity;
  const candidates = game?.legalMoves || gridPoints();
  for (const p of candidates) {
    const px = screenX(p.x);
    const py = screenY(p.y);
    const dist = Math.hypot(click.x - px, click.y - py);
    if (dist < bestDist) { bestDist = dist; best = p; }
  }
  return bestDist < 32 ? best : null;
}

function updateUi() {
  if (!game) {
    updateWinnerOverlay();
    els.p1.textContent = 'Waiting for blue';
    els.p2.textContent = 'Waiting for red';
    els.p1Score.textContent = '0';
    els.p2Score.textContent = '0';
    els.status.textContent = roomId ? 'Choose a name to join this room.' : 'Use Home to create an online game or start a local match.';
    els.playStatus.textContent = roomId ? 'Join this room, then play full-screen here.' : 'Use Home to start a match.';
    els.replayRange.max = 0;
    els.replayRange.value = 0;
    els.replayText.textContent = 'Replay appears once moves are made.';
    els.turnIndicator.textContent = 'Waiting for players';
    els.turnIndicator.className = 'turn-indicator';
    updatePauseOverlay();
    return;
  }
  const score = game.score || { p1: 0, p2: 0 };
  saveFinishedGameIfNeeded();
  els.p1.textContent = game.players.p1?.name || 'Waiting for blue';
  els.p2.textContent = game.players.p2?.name || 'Waiting for red';
  els.p1Score.textContent = score.p1 || 0;
  els.p2Score.textContent = score.p2 || 0;
  const turnName = game.players[game.turn]?.name || game.turn;
  if (gameMode === 'local' && game.status === 'playing') els.status.textContent = `${turnName}'s turn — ${moveTimerLabel(game.moveTimeLimitMs)}.`;
  else if (game.status === 'waiting') els.status.textContent = 'Waiting for a friend to join. Share the link or QR code.';
  else if (game.status === 'playing') els.status.textContent = `${turnName}'s turn${game.turn === playerId ? ' — your move.' : '.'} ${moveTimerLabel(game.moveTimeLimitMs)}.`;
  else if (game.status === 'paused') els.status.textContent = pauseStatusText();
  else if (game.status === 'finished') els.status.textContent = `${game.players[game.winner]?.name || game.winner} wins. ${game.endReason}`;
  els.playStatus.textContent = els.status.textContent;
  updateWinnerOverlay();
  updatePauseOverlay();
  updateTurnIndicator();
  els.replayRange.max = game.moves.length;
  els.replayRange.value = currentReplay();
  els.replayText.textContent = game.moves.length ? `Move ${currentReplay()} of ${game.moves.length}` : 'Replay appears once moves are made.';
  syncClockAnimation();
}

function updateWinnerOverlay() {
  const winnerId = game?.status === 'finished' ? game.winner : null;
  if (!winnerId) {
    els.winnerOverlay.classList.add('hidden');
    lastWinnerKey = '';
    dismissedWinnerKey = '';
    return;
  }
  const winnerName = game.players[winnerId]?.name || (winnerId === 'p1' ? 'Blue' : 'Red');
  const winnerKey = `${roomId || 'local'}:${winnerId}:${game.moves?.length || 0}:${winnerName}`;
  if (winnerKey !== lastWinnerKey) {
    lastWinnerKey = winnerKey;
    dismissedWinnerKey = '';
    confettiUntil = Date.now() + CONFETTI_MS;
    requestAnimationFrame(animateConfetti);
  }
  els.winnerName.textContent = winnerName;
  els.winnerOverlay.classList.toggle('hidden', dismissedWinnerKey === winnerKey);
}

function dismissWinnerOverlay() {
  if (!lastWinnerKey) return;
  dismissedWinnerKey = lastWinnerKey;
  els.winnerOverlay.classList.add('hidden');
}

function updatePauseOverlay() {
  const paused = game?.status === 'paused';
  els.pauseOverlay.classList.toggle('hidden', !paused);
  document.querySelector('.board-stage')?.classList.toggle('paused', paused);
  els.pauseGame.disabled = !game || game.status !== 'playing' || (gameMode !== 'local' && !playerId);
  els.playPauseGame.disabled = els.pauseGame.disabled;
  els.reset.disabled = gameMode === 'history' || (!game && !playerId);
  els.pauseNewRound.disabled = gameMode === 'history';
  els.winnerNewRound.disabled = gameMode === 'history';
  els.resumeGame.disabled = !paused || (gameMode !== 'local' && !playerId);
  if (!paused) return;
  const pause = game.pause || {};
  const turnName = game.players[game.turn]?.name || game.turn;
  const byName = pause.byPlayerId ? game.players[pause.byPlayerId]?.name || pause.byPlayerId : '';
  els.pauseTitle.textContent = pause.reason === 'idle' ? 'Game paused for inactivity' : 'Game paused';
  els.pauseMessage.textContent = pause.reason === 'idle'
    ? 'Both players timed out. Board hidden while paused.'
    : byName ? `Paused by ${byName}. Board hidden while paused.` : 'Board hidden while paused.';
  els.pauseTurn.textContent = `${turnName} to move when resumed.`;
}

function pauseStatusText() {
  if (!game) return 'Game paused.';
  const turnName = game.players[game.turn]?.name || game.turn;
  if (game.pause?.reason === 'idle') return `Both players timed out. Game paused — ${turnName} to move when resumed.`;
  const byName = game.pause?.byPlayerId ? game.players[game.pause.byPlayerId]?.name || game.pause.byPlayerId : null;
  return `${byName ? `Paused by ${byName}.` : 'Game paused.'} ${turnName} to move when resumed.`;
}

function animateConfetti() {
  if (Date.now() <= confettiUntil) {
    draw();
    requestAnimationFrame(animateConfetti);
  }
}

function syncClockAnimation() {
  if (clockRaf || !shouldAnimateClock()) return;
  const tick = () => {
    clockRaf = 0;
    if (!shouldAnimateClock()) return;
    if (gameMode === 'local') expireLocalTurnIfNeeded();
    updateTurnIndicator();
    draw();
    clockRaf = requestAnimationFrame(tick);
  };
  clockRaf = requestAnimationFrame(tick);
}

function shouldAnimateClock() {
  return Boolean(game && game.status === 'playing' && game.moveTimeLimitMs > 0 && game.turnStartedAt && replayIndex === null);
}

function showInvite() {
  inviteUrl = `${location.origin}/room/${roomId}`;
  els.inviteLink.value = inviteUrl;
  els.qr.src = `/api/qr?url=${encodeURIComponent(inviteUrl)}`;
  updateInviteVisibility();
}

function updateRoomText() {
  if (gameMode === 'history') {
    els.roomText.textContent = 'Viewing a saved replay from this device. Start or join a match from Home when ready.';
    return;
  }
  if (gameMode === 'local' || gameMode === 'local-setup') {
    els.roomText.textContent = 'Local same-screen match — Players face each other and use this device.';
    return;
  }
  els.roomText.textContent = roomId ? `Room ${roomId}. Use Home to copy the invite, or Play to move.` : 'Choose a name, then generate a new game or join an existing one.';
}

function updateModePanels() {
  const localVisible = gameMode === 'local' || gameMode === 'local-setup';
  els.localPanel.classList.toggle('hidden', !localVisible);
  document.querySelector('#joinPanel').classList.toggle('hidden', localVisible);
  els.copyInviteCard.disabled = !inviteUrl;
  els.onlineMode.classList.toggle('active', !localVisible);
  els.localMode.classList.toggle('active', localVisible);
  els.onlineMode.setAttribute('aria-pressed', String(!localVisible));
  els.localMode.setAttribute('aria-pressed', String(localVisible));
  els.joinGeneratedRoom.classList.toggle('hidden', !roomId || localVisible);
}

async function copyInvite() {
  if (!inviteUrl) return toast('Create a game first.');
  await navigator.clipboard.writeText(inviteUrl);
  toast('Invite link copied.');
}

async function copyInviteFromField() {
  if (!inviteUrl) return;
  els.inviteLink.select();
  try {
    await navigator.clipboard.writeText(inviteUrl);
    toast('Invite link copied.');
  } catch {
    toast('Invite selected — copy it from the field.');
  }
}

function updateTurnIndicator() {
  const turn = game && game.turn;
  const player = game && game.players && game.players[turn];
  const colorName = turn === 'p1' ? 'Blue' : 'Red';
  const name = player && player.name ? player.name : colorName;
  let message;
  if (!game || game.status === 'waiting') message = 'Waiting for players';
  else if (game.status === 'paused') message = `Paused — ${name} resumes`;
  else if (game.status === 'finished') message = `Match finished — ${game.players[game.winner]?.name || game.winner} wins`;
  else if (gameMode === 'local') message = `${colorName} turn — ${name} · pass screen across`;
  else if (turn === playerId) message = `${colorName} turn — your move`;
  else message = `${colorName} turn — waiting for ${name}`;
  els.turnIndicator.textContent = message;
  els.turnIndicator.className = `turn-indicator ${turn === 'p2' ? 'red' : 'blue'}`;
}

function setReplay(index) {
  if (!game) return;
  replayIndex = index === game.moves.length ? null : index;
  els.replayRange.value = index;
  els.replayText.textContent = `Move ${index} of ${game.moves.length}${replayIndex === null ? ' — live board' : ''}`;
  draw();
}

function currentReplay() {
  if (!game) return 0;
  return replayIndex === null ? game.moves.length : replayIndex;
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.save();
  applyBoardTransform();
  drawPitch();
  const moves = replayMoves();
  drawSegments(moves);
  drawPoints(moves);
  drawBall(moves);
  drawLegalMoves();
  ctx.restore();
  drawGatePlayerLabels();
  drawTurnGateBall();
  drawMoveClock();
  drawWinnerGateConfetti();
}

function applyBoardTransform() {
  if (!isPlayerInverted()) return;
  ctx.translate(canvas.width, canvas.height);
  ctx.rotate(Math.PI);
}

function boardSpacePoint(point) {
  if (!isPlayerInverted()) return point;
  return { x: canvas.width - point.x, y: canvas.height - point.y };
}

function replayMoves() {
  if (!game) return [];
  return game.moves.slice(0, currentReplay());
}

function drawPitch() {
  const grd = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
  grd.addColorStop(0, '#0cb240');
  grd.addColorStop(1, '#03651e');
  ctx.fillStyle = grd;
  roundRect(ctx, 12, 12, canvas.width - 24, canvas.height - 24, 28);
  ctx.fill();
  ctx.save();
  ctx.globalAlpha = .22;
  for (let i = -canvas.height; i < canvas.width; i += 150) {
    ctx.fillStyle = i % 300 === 0 ? '#75ff8a' : '#004b12';
    ctx.beginPath();
    ctx.moveTo(i, 12); ctx.lineTo(i + 100, 12); ctx.lineTo(i + canvas.height + 100, canvas.height - 12); ctx.lineTo(i + canvas.height, canvas.height - 12); ctx.closePath(); ctx.fill();
  }
  ctx.restore();

  ctx.strokeStyle = '#f8fff8';
  ctx.lineWidth = 8;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(screenX(0), screenY(1));
  ctx.lineTo(screenX(3), screenY(1));
  ctx.moveTo(screenX(5), screenY(1));
  ctx.lineTo(screenX(8), screenY(1));
  ctx.lineTo(screenX(8), screenY(11));
  ctx.lineTo(screenX(5), screenY(11));
  ctx.moveTo(screenX(3), screenY(11));
  ctx.lineTo(screenX(0), screenY(11));
  ctx.closePath();
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(screenX(0), screenY(1)); ctx.lineTo(screenX(0), screenY(11));
  ctx.moveTo(screenX(8), screenY(1)); ctx.lineTo(screenX(8), screenY(11));
  ctx.stroke();
  drawGoal(0); drawGoal(12);
  drawFlags();
}

function drawGoal(y) {
  const top = y === 0;
  const x1 = screenX(3), x2 = screenX(5), gy = screenY(y);
  const mouthY = top ? screenY(1) : screenY(11);
  ctx.strokeStyle = '#f8fff8'; ctx.lineWidth = 8;
  ctx.beginPath(); ctx.moveTo(x1, mouthY); ctx.lineTo(x1, gy); ctx.lineTo(x2, gy); ctx.lineTo(x2, mouthY); ctx.stroke();
  drawGoalMesh(x1, x2, gy, mouthY);
}

function drawGoalMesh(x1, x2, backY, mouthY) {
  const top = backY < mouthY;
  const insetTop = top ? backY + 9 : mouthY + 9;
  const insetBottom = top ? mouthY - 9 : backY - 9;
  const postInset = 11;
  const innerLeft = x1 + postInset;
  const innerRight = x2 - postInset;
  const meshHeight = Math.abs(insetBottom - insetTop);
  ctx.save();
  ctx.beginPath();
  ctx.rect(innerLeft, insetTop, innerRight - innerLeft, insetBottom - insetTop);
  ctx.clip();
  ctx.strokeStyle = 'rgba(255,255,255,.18)';
  ctx.lineWidth = 1;
  for (let x = innerLeft - meshHeight; x <= innerRight + meshHeight; x += 12) {
    ctx.beginPath(); ctx.moveTo(x, insetTop); ctx.lineTo(x + meshHeight, insetBottom); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x + meshHeight, insetTop); ctx.lineTo(x, insetBottom); ctx.stroke();
  }
  for (let meshY = insetTop + 8; meshY < insetBottom; meshY += 12) {
    ctx.beginPath(); ctx.moveTo(innerLeft, meshY); ctx.lineTo(innerRight, meshY); ctx.stroke();
  }
  ctx.restore();
}

function drawGatePlayerLabels() {
  if (!game) return;
  drawGatePlayerLabel('p2', 0);
  drawGatePlayerLabel('p1', 12);
}

function drawGatePlayerLabel(id, gateY) {
  const center = displayPoint(4, gateY);
  const edge = displayPoint(4, gateY === 0 ? -0.45 : 12.45);
  const player = game.players[id];
  const score = game.score?.[id] || 0;
  const text = `${player?.name || (id === 'p1' ? 'Blue' : 'Red')} ${score}`;
  const color = id === 'p1' ? '#0b7cff' : '#ff3b30';
  ctx.save();
  ctx.font = '700 22px system-ui, -apple-system, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const metrics = ctx.measureText(text);
  const padX = 16;
  const boxW = Math.min(210, metrics.width + padX * 2);
  const boxH = 32;
  const x = Math.max(126, Math.min(canvas.width - 126, center.x));
  const y = Math.max(24, Math.min(canvas.height - 24, edge.y));
  ctx.fillStyle = 'rgba(3, 24, 11, .52)';
  roundRect(ctx, x - boxW / 2, y - boxH / 2, boxW, boxH, 15);
  ctx.fill();
  ctx.strokeStyle = color;
  ctx.globalAlpha = .75;
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.fillStyle = '#f8fff8';
  ctx.fillText(text, x, y + 1);
  ctx.restore();
}

function drawFlags() {
  const flags = [
    { x: 0, y: 1, c: '#ff3b30' },
    { x: 8, y: 1, c: '#ff3b30' },
    { x: 0, y: 11, c: '#0b7cff' },
    { x: 8, y: 11, c: '#0b7cff' },
  ];
  for (const p of flags) {
    const x = screenX(p.x), y = screenY(p.y);
    const dirX = p.x ? 1 : -1;
    const dirY = p.y < 6 ? -1 : 1;
    const hoist = { x: x + dirX * 18, y: y + dirY * 48 };
    const poleVector = { x: hoist.x - x, y: hoist.y - y };
    const poleLength = Math.hypot(poleVector.x, poleVector.y);
    const poleUnit = { x: poleVector.x / poleLength, y: poleVector.y / poleLength };
    let flagNormal = { x: -poleUnit.y, y: poleUnit.x };
    if (flagNormal.x * dirX < 0) {
      flagNormal = { x: -flagNormal.x, y: -flagNormal.y };
    }
    const flagBaseHalf = 13;
    const flagDepth = 30;
    const baseA = { x: hoist.x - poleUnit.x * flagBaseHalf, y: hoist.y - poleUnit.y * flagBaseHalf };
    const baseB = { x: hoist.x + poleUnit.x * flagBaseHalf, y: hoist.y + poleUnit.y * flagBaseHalf };
    const flagTip = { x: hoist.x + flagNormal.x * flagDepth, y: hoist.y + flagNormal.y * flagDepth };
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(hoist.x, hoist.y);
    ctx.stroke();
    ctx.fillStyle = p.c;
    ctx.beginPath();
    ctx.moveTo(baseA.x, baseA.y);
    ctx.lineTo(flagTip.x, flagTip.y);
    ctx.lineTo(baseB.x, baseB.y);
    ctx.closePath();
    ctx.fill();
  }
}

function drawSegments(moves) {
  ctx.lineWidth = 7; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  for (const m of moves) {
    ctx.strokeStyle = m.playerId === 'p1' ? '#0b7cff' : '#ff3b30';
    ctx.beginPath(); ctx.moveTo(screenX(m.from.x), screenY(m.from.y)); ctx.lineTo(screenX(m.to.x), screenY(m.to.y)); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,.84)'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(screenX(m.from.x), screenY(m.from.y)); ctx.lineTo(screenX(m.to.x), screenY(m.to.y)); ctx.stroke();
    ctx.lineWidth = 7;
  }
}

function drawPoints(moves) {
  const visited = new Set(['4,6']);
  for (const m of moves) visited.add(`${m.to.x},${m.to.y}`);
  for (const p of gridPoints()) {
    const hit = visited.has(`${p.x},${p.y}`);
    const gateBounce = isGateMouthBouncePoint(p);
    ctx.fillStyle = hit ? '#0b7cff' : gateBounce ? '#050505' : '#f5fff7';
    ctx.beginPath(); ctx.arc(screenX(p.x), screenY(p.y), hit ? 10 : gateBounce ? 8 : 7, 0, Math.PI * 2); ctx.fill();
    if (hit || gateBounce) {
      ctx.strokeStyle = hit ? 'rgba(255,255,255,.45)' : 'rgba(255,255,255,.82)';
      ctx.lineWidth = gateBounce ? 2.5 : 2;
      ctx.stroke();
    }
  }
}

function drawBall(moves) {
  const p = moves.length ? moves[moves.length - 1].to : (game?.ball || { x: 4, y: 6 });
  drawSoccerBall(screenX(p.x), screenY(p.y), 15);
}

function drawTurnGateBall() {
  if (!game || game.status !== 'playing') return;
  const target = turnMarkerSpot(game.turn);
  if (turnMarkerJump) {
    drawTurnMarkerJump(target);
    return;
  }
  drawTurnMarker(target.x, target.y, currentPlayerColor(game.turn));
}

function turnMarkerSpot(player) {
  const ownGateMarginY = player === 'p1' ? 12 : 0;
  const leftPost = displayPoint(3, ownGateMarginY);
  const rightPost = displayPoint(5, ownGateMarginY);
  const center = displayPoint(4, ownGateMarginY);
  return {
    x: Math.min(canvas.width - 26, Math.max(leftPost.x, rightPost.x) + 34),
    y: center.y,
  };
}

function turnClockSpot(player) {
  const ownGateMarginY = player === 'p1' ? 12 : 0;
  const leftPost = displayPoint(3, ownGateMarginY);
  const rightPost = displayPoint(5, ownGateMarginY);
  const center = displayPoint(4, ownGateMarginY);
  return {
    x: Math.max(26, Math.min(leftPost.x, rightPost.x) - 54),
    y: center.y,
  };
}

function drawMoveClock() {
  if (!game || game.status !== 'playing' || !game.moveTimeLimitMs || !game.turnStartedAt || replayIndex !== null) return;
  const spot = turnClockSpot(game.turn);
  const remaining = Math.max(0, game.turnStartedAt + game.moveTimeLimitMs - Date.now());
  const seconds = Math.max(0, Math.ceil(remaining / 1000));
  const warning = remaining <= Math.min(5000, game.moveTimeLimitMs * .34);
  const danger = remaining <= 3000;
  const color = danger ? '#ff3b30' : warning ? '#ffe66d' : '#8dffae';
  ctx.save();
  ctx.fillStyle = 'rgba(0, 8, 3, .78)';
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  roundRect(ctx, spot.x - 39, spot.y - 21, 78, 42, 10);
  ctx.fill();
  ctx.shadowColor = color;
  ctx.shadowBlur = danger ? 16 : 9;
  ctx.stroke();
  drawSevenSegmentNumber(String(seconds).padStart(2, '0'), spot.x - 25, spot.y - 15, color);
  ctx.restore();
}

function drawSevenSegmentNumber(text, x, y, color) {
  let cursor = x;
  for (const char of text) {
    drawSevenSegmentDigit(char, cursor, y, 19, 30, color);
    cursor += 25;
  }
}

function drawSevenSegmentDigit(char, x, y, w, h, color) {
  const segments = {
    0: ['a', 'b', 'c', 'd', 'e', 'f'],
    1: ['b', 'c'],
    2: ['a', 'b', 'g', 'e', 'd'],
    3: ['a', 'b', 'g', 'c', 'd'],
    4: ['f', 'g', 'b', 'c'],
    5: ['a', 'f', 'g', 'c', 'd'],
    6: ['a', 'f', 'g', 'e', 'c', 'd'],
    7: ['a', 'b', 'c'],
    8: ['a', 'b', 'c', 'd', 'e', 'f', 'g'],
    9: ['a', 'b', 'c', 'd', 'f', 'g'],
  }[char] || [];
  const t = 4;
  const half = h / 2;
  const segmentRects = {
    a: [x + t, y, w - t * 2, t],
    b: [x + w - t, y + t, t, half - t],
    c: [x + w - t, y + half, t, half - t],
    d: [x + t, y + h - t, w - t * 2, t],
    e: [x, y + half, t, half - t],
    f: [x, y + t, t, half - t],
    g: [x + t, y + half - t / 2, w - t * 2, t],
  };
  ctx.fillStyle = 'rgba(141,255,174,.11)';
  for (const rect of Object.values(segmentRects)) {
    roundRect(ctx, ...rect, 2);
    ctx.fill();
  }
  ctx.fillStyle = color;
  for (const key of segments) {
    roundRect(ctx, ...segmentRects[key], 2);
    ctx.fill();
  }
}

function startTurnMarkerJump(fromPlayer, toPlayer) {
  if (!fromPlayer || !toPlayer || fromPlayer === toPlayer) return;
  turnMarkerJump = {
    from: turnMarkerSpot(fromPlayer),
    to: turnMarkerSpot(toPlayer),
    fromPlayer,
    toPlayer,
    startedAt: performance.now(),
  };
  requestAnimationFrame(animateTurnMarkerJump);
}

function animateTurnMarkerJump() {
  if (!turnMarkerJump) return;
  draw();
  if (performance.now() - turnMarkerJump.startedAt < TURN_MARKER_JUMP_MS) requestAnimationFrame(animateTurnMarkerJump);
  else {
    turnMarkerJump = null;
    draw();
  }
}

function drawTurnMarkerJump(fallbackTarget) {
  const elapsed = Math.min(TURN_MARKER_JUMP_MS, performance.now() - turnMarkerJump.startedAt);
  const t = easeInOut(elapsed / TURN_MARKER_JUMP_MS);
  const arc = Math.sin(Math.PI * t) * 106;
  const x = lerp(turnMarkerJump.from.x, fallbackTarget.x, t);
  const y = lerp(turnMarkerJump.from.y, fallbackTarget.y, t) - arc;
  const color = mixPlayerColors(turnMarkerJump.fromPlayer, turnMarkerJump.toPlayer, Math.min(1, t * 1.18));
  const scale = 1 + Math.sin(Math.PI * t) * (TURN_MARKER_MAX_SCALE - 1);
  drawTurnMarker(x, y, color, scale);
}

function drawTurnMarker(x, y, color, scale = 1) {
  const markerRadius = 22 * scale;
  const ballRadius = 13 * scale;
  ctx.save();
  ctx.shadowColor = color;
  ctx.shadowBlur = 18 * scale;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, markerRadius, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 3 * scale;
  ctx.stroke();
  drawSoccerBall(x, y, ballRadius);
  ctx.restore();
}

function currentPlayerColor(player) {
  return player === 'p2' ? '#ff3b30' : '#0b7cff';
}

function mixPlayerColors(fromPlayer, toPlayer, t) {
  return mixHex(currentPlayerColor(fromPlayer), currentPlayerColor(toPlayer), t);
}

function mixHex(a, b, t) {
  const ca = hexToRgb(a), cb = hexToRgb(b);
  const mix = (x, y) => Math.round(x + (y - x) * t);
  return `rgb(${mix(ca.r, cb.r)}, ${mix(ca.g, cb.g)}, ${mix(ca.b, cb.b)})`;
}

function hexToRgb(hex) {
  const value = Number.parseInt(hex.slice(1), 16);
  return { r: (value >> 16) & 255, g: (value >> 8) & 255, b: value & 255 };
}

function lerp(a, b, t) { return a + (b - a) * t; }
function easeInOut(t) { return t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; }

function drawWinnerGateConfetti() {
  if (!game || game.status !== 'finished' || Date.now() > confettiUntil) return;
  const winnerGateY = winnerOwnGateY(game.winner);
  const gate = displayPoint(4, winnerGateY);
  const elapsed = CONFETTI_MS - Math.max(0, confettiUntil - Date.now());
  const colors = ['#ffe784', '#ffffff', '#11bf46', '#0b7cff', '#ff3b30', '#ff8bd1'];
  ctx.save();
  for (let i = 0; i < 54; i += 1) {
    const angle = ((i * 137.5) % 360) * Math.PI / 180;
    const burst = 18 + ((i * 23) % 96);
    const fall = (elapsed / CONFETTI_MS) * (86 + (i % 7) * 16);
    const wobble = Math.sin((elapsed / 210) + i) * 18;
    const x = gate.x + Math.cos(angle) * burst + wobble;
    const y = gate.y + Math.sin(angle) * burst + (winnerGateY === 0 ? fall : -fall);
    ctx.translate(x, y);
    ctx.rotate(angle + elapsed / 220);
    ctx.fillStyle = colors[i % colors.length];
    ctx.globalAlpha = Math.max(0, 1 - elapsed / (CONFETTI_MS + 400));
    ctx.fillRect(-4, -7, 8, 14);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }
  ctx.restore();
}

function winnerOwnGateY(winnerId) {
  return winnerId === 'p1' ? 12 : 0;
}

function displayPoint(x, y) {
  const point = { x: screenX(x), y: screenY(y) };
  if (!isPlayerInverted()) return point;
  return { x: canvas.width - point.x, y: canvas.height - point.y };
}

function drawSoccerBall(x, y, radius) {
  ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(x, y, radius, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#111'; ctx.font = `${Math.round(radius * 1.33)}px system-ui`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('⚽', x, y + 1);
}

function isPlayerInverted() { return gameMode !== 'local' && playerId === 'p2'; }

function drawLegalMoves() {
  if (!game || game.status !== 'playing' || replayIndex !== null) return;
  if (gameMode !== 'local' && game.turn !== playerId) return;
  syncLegalMoveHintFade();
  const alpha = legalMoveHintAlpha();
  const hintColor = legalMoveHintColor();
  ctx.save();
  ctx.strokeStyle = hintColor;
  ctx.fillStyle = hintColor;
  ctx.globalAlpha = alpha;
  ctx.lineWidth = 4;
  for (const p of game.legalMoves) {
    ctx.beginPath(); ctx.arc(screenX(p.x), screenY(p.y), 17, 0, Math.PI * 2); ctx.stroke();
    ctx.globalAlpha = alpha * .26;
    ctx.beginPath(); ctx.arc(screenX(p.x), screenY(p.y), 12, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = alpha;
  }
  ctx.restore();
  scheduleLegalMoveHintFadeFrame(alpha);
}

function legalMoveHintColor() {
  return gameMode === 'local' ? currentPlayerColor(game.turn) : '#ffe66d';
}

function legalMoveHintAlpha(now = performance.now()) {
  if (!legalMoveHintStartedAt) return MOVE_HINT_ALPHA;
  const progress = Math.min(1, Math.max(0, (now - legalMoveHintStartedAt) / MOVE_HINT_FADE_IN_MS));
  const eased = 1 - Math.pow(1 - progress, 3);
  return MOVE_HINT_ALPHA * eased;
}

function syncLegalMoveHintFade() {
  const nextKey = `${gameMode}:${game.turn}:${game.ball.x},${game.ball.y}:${game.legalMoves.map((p) => `${p.x},${p.y}`).join('|')}`;
  if (nextKey === legalMoveHintKey) return;
  startLegalMoveHintFade(nextKey);
}

function startLegalMoveHintFade(nextKey) {
  legalMoveHintKey = nextKey;
  legalMoveHintStartedAt = performance.now();
}

function scheduleLegalMoveHintFadeFrame(alpha) {
  if (alpha >= MOVE_HINT_ALPHA || legalMoveHintFadeRaf || !game || game.status !== 'playing' || replayIndex !== null) return;
  legalMoveHintFadeRaf = requestAnimationFrame(() => {
    legalMoveHintFadeRaf = 0;
    if (!game || game.status !== 'playing' || replayIndex !== null) return;
    draw();
  });
}

function gridPoints() {
  const pts = [];
  for (let y = 1; y <= 11; y++) for (let x = 0; x <= 8; x++) pts.push({ x, y });
  for (let y of [0, 12]) for (let x = 3; x <= 5; x++) pts.push({ x, y });
  return pts;
}

function isOneStep(a, b) {
  const dx = Math.abs(a.x - b.x);
  const dy = Math.abs(a.y - b.y);
  return dx <= 1 && dy <= 1 && (dx + dy > 0);
}

function isOnBoardOrGoal(p) {
  const inMain = p.x >= 0 && p.x < board.width && p.y > 0 && p.y < board.height - 1;
  const inGate = p.x >= board.goalXMin && p.x <= board.goalXMax && (p.y === 0 || p.y === board.height - 1);
  return inMain || inGate;
}

function isBoundaryPoint(p) {
  return p.x === 0 || p.x === board.width - 1 || p.y === 1 || p.y === board.height - 2;
}

function isGateMouthBouncePoint(p) {
  return p.x === 4 && (p.y === 1 || p.y === board.height - 2);
}

function isTracedMarginSegment(from, to) {
  const dx = Math.abs(from.x - to.x);
  const dy = Math.abs(from.y - to.y);
  if (dx + dy !== 1) return false;
  const verticalSide = from.x === to.x
    && (from.x === 0 || from.x === board.width - 1)
    && from.y >= 1 && from.y <= board.height - 2
    && to.y >= 1 && to.y <= board.height - 2;
  if (verticalSide) return true;
  const horizontalPitchEdge = from.y === to.y
    && (from.y === 1 || from.y === board.height - 2)
    && from.x >= 0 && from.x < board.width
    && to.x >= 0 && to.x < board.width;
  if (!horizontalPitchEdge) return false;
  const inGateMouth = Math.min(from.x, to.x) >= board.goalXMin && Math.max(from.x, to.x) <= board.goalXMax;
  return !inGateMouth;
}

function isBlockedCornerCut(from, to) {
  const diagonal = Math.abs(from.x - to.x) === 1 && Math.abs(from.y - to.y) === 1;
  if (!diagonal) return false;
  const touchesTopOutside = (from.y === 1 && to.y === 0) || (from.y === 0 && to.y === 1);
  const touchesBottomOutside = (from.y === board.height - 2 && to.y === board.height - 1) || (from.y === board.height - 1 && to.y === board.height - 2);
  return (touchesTopOutside || touchesBottomOutside)
    && (to.x < board.goalXMin || to.x > board.goalXMax || from.x < board.goalXMin || from.x > board.goalXMax);
}
function screenX(x) { return margin + x * ((canvas.width - margin * 2) / (board.width - 1)); }
function screenY(y) { return margin + y * ((canvas.height - margin * 2) / (board.height - 1)); }
function roundRect(context, x, y, w, h, r) { context.beginPath(); context.roundRect(x, y, w, h, r); }
function toast(message) { els.toast.textContent = message; els.toast.classList.add('show'); setTimeout(() => els.toast.classList.remove('show'), 2300); }

function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  let refreshing = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (refreshing) return;
    refreshing = true;
    location.reload();
  });
  navigator.serviceWorker.register('/sw.js').then((registration) => {
    registration.update().catch(() => {});
    if (registration.waiting) registration.waiting.postMessage({ type: 'SKIP_WAITING' });
  }).catch(() => {});
}

function localStorageSafeGet(key) {
  try { return localStorage.getItem(key); } catch { return null; }
}

function localStorageSafeSet(key, value) {
  try { localStorage.setItem(key, value); } catch {}
}

function localStorageSafeRemove(key) {
  try { localStorage.removeItem(key); } catch {}
}

function localStorageJsonGet(key, fallback = null) {
  const raw = localStorageSafeGet(key);
  if (!raw) return fallback;
  try { return JSON.parse(raw); } catch { return fallback; }
}

function localStorageJsonSet(key, value) {
  localStorageSafeSet(key, JSON.stringify(value));
}

function formatHistoryDate(value) {
  const date = new Date(Number(value) || Date.now());
  return date.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[char]));
}

function generateRandomPlayerName() {
  const adjectives = ['Neon', 'Turbo', 'Cosmic', 'Lucky', 'Zigzag', 'Pixel', 'Rocket', 'Nimble', 'Thunder', 'Glitch'];
  const nouns = ['Striker', 'Ranger', 'Falcon', 'Comet', 'Dribbler', 'Phantom', 'Kicker', 'Ace', 'Tiger', 'Wizard'];
  const pick = (items) => items[Math.floor(Math.random() * items.length)];
  return `${pick(adjectives)} ${pick(nouns)}`;
}

function getClientId() {
  const key = 'traceballClientId';
  let id = localStorageSafeGet(key);
  if (!id) {
    id = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    localStorageSafeSet(key, id);
  }
  return id;
}

function setMobilePage(page = 'play') {
  const selected = ['play', 'invite', 'match'].includes(page) ? page : 'play';
  document.body.dataset.mobilePage = selected;
  mobileTabs.forEach((tab) => tab.classList.toggle('active', tab.dataset.pageTarget === selected));
  mobilePages.forEach((panel) => panel.classList.toggle('active', panel.dataset.mobilePage === selected));
  if (selected === 'play') requestAnimationFrame(draw);
}
