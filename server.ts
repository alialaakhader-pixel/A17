import express from 'express';
import http from 'http';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { WebSocketServer, WebSocket } from 'ws';
import { PLAYERS_LIST, GENERAL_TRIVIA, FootballPlayer, TriviaQuestion } from './data/playersData';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;
const server = http.createServer(app);

// CORS must be registered BEFORE the routes below, otherwise the /api responses
// carry no CORS headers and the statically hosted site (GitHub Pages) cannot
// call this server from another origin.
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

app.use(express.json({ limit: '10mb' }));

// Persistence Files
const DATA_DIR = path.resolve(__dirname, 'data');
const TRIVIA_FILE = path.join(DATA_DIR, 'community_trivia.json');
const PLAYERS_FILE = path.join(DATA_DIR, 'community_players.json');
const LEADERBOARD_FILE = path.join(DATA_DIR, 'community_leaderboard.json');

// Initialize in-memory storage from persistent disk files or base sets
function loadJsonFile<T>(filePath: string, defaultData: T): T {
  try {
    if (fs.existsSync(filePath)) {
      const raw = fs.readFileSync(filePath, 'utf-8');
      return JSON.parse(raw) as T;
    }
  } catch (err) {
    console.error(`Error loading file ${filePath}:`, err);
  }
  return defaultData;
}

function saveJsonFile(filePath: string, data: any): void {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
  } catch (err) {
    console.error(`Error saving file ${filePath}:`, err);
  }
}

// In-Memory Data Stores
let serverCustomTrivia: TriviaQuestion[] = loadJsonFile<TriviaQuestion[]>(TRIVIA_FILE, []);
let serverCustomPlayers: FootballPlayer[] = loadJsonFile<FootballPlayer[]>(PLAYERS_FILE, []);
let serverLeaderboard: any[] = loadJsonFile<any[]>(LEADERBOARD_FILE, [
  { id: 'lb-1', name: 'الكابتن طارق - عين الصقر', score: 1480, mode: 'eyes', date: 'اليوم', rankBadge: '🥇 المركز الأول', avatar: '🦅' },
  { id: 'lb-2', name: 'أحمد التكتيكي', score: 1320, mode: 'eyes', date: 'أمس', rankBadge: '🥈 المركز الثاني', avatar: '⚡' },
  { id: 'lb-3', name: 'عمر فوت B11', score: 1190, mode: 'eyes', date: 'منذ يومين', rankBadge: '🥉 المركز الثالث', avatar: '⚽' },
  { id: 'lb-4', name: 'ياسين الملكي', score: 1040, mode: 'eyes', date: 'منذ أسبوع', rankBadge: '⭐ محلل محترف', avatar: '👑' },
  { id: 'lb-5', name: 'موسوعة التشامبيونز', score: 1250, mode: 'trivia', date: 'اليوم', rankBadge: '🥇 ملك الفوازير', avatar: '🏆' },
  { id: 'lb-6', name: 'زياد الكروي', score: 960, mode: 'trivia', date: 'أمس', rankBadge: '🥈 وصيف الفوازير', avatar: '🧠' },
]);

// Helper to get all combined active trivia
function getFullTriviaList(): TriviaQuestion[] {
  const customIds = new Set(serverCustomTrivia.map((q) => q.id));
  const baseFiltered = GENERAL_TRIVIA.filter((q) => !customIds.has(q.id));
  return [...serverCustomTrivia, ...baseFiltered];
}

function getFullPlayersList(): FootballPlayer[] {
  const customIds = new Set(serverCustomPlayers.map((p) => p.id));
  const baseFiltered = PLAYERS_LIST.filter((p) => !customIds.has(p.id));
  return [...serverCustomPlayers, ...baseFiltered];
}

// ---------------------------------------------------------------------------
// Online Arena (1 vs 1 rooms, matchmaking, buzzer rounds)
// ---------------------------------------------------------------------------
// Every client talks to the arena over BOTH a WebSocket and plain HTTP (the HTTP
// calls are a fallback for networks where sockets are flaky). The same action can
// therefore reach the server twice, so every state change below is idempotent:
// it only applies when the room is in the state the action expects.

type GameType = 'eyes' | 'trivia';

interface OnlinePlayer {
  id: string;
  name: string;
  score: number;
  // null for a player who joined through the HTTP fallback and has not opened a
  // socket yet; the socket is attached as soon as that player sends a socket message.
  ws: WebSocket | null;
  isHost: boolean;
}

interface GameRoom {
  id: string;
  gameType: GameType;
  players: OnlinePlayer[];
  status: 'waiting' | 'playing' | 'round_buzzed' | 'round_finished' | 'game_over';
  currentRound: number;
  totalRounds: number;
  buzzedPlayerId: string | null;
  buzzedPlayerName: string | null;
  lastWinnerId: string | null;
  lastResult: { isCorrect: boolean; isTimeout: boolean } | null;
  challengeIds: string[];
  currentChallengeId: string;
  buzzerTimer: NodeJS.Timeout | null;
  createdAt: number;
}

interface QueueEntry {
  ws: WebSocket | null;
  playerId: string;
  playerName: string;
  gameType: GameType;
  seenAt: number;
}

const rooms = new Map<string, GameRoom>();
let matchmakingQueue: QueueEntry[] = [];

const BUZZER_SECONDS = 12;
const QUEUE_HTTP_TTL_MS = 8000;
const ROUND_COUNT = 5;

function normalizeGameType(value: unknown): GameType {
  return value === 'trivia' ? 'trivia' : 'eyes';
}

function publicPlayers(room: GameRoom) {
  return room.players.map((p) => ({ id: p.id, name: p.name, score: p.score, isHost: p.isHost }));
}

function sendTo(ws: WebSocket | null | undefined, data: unknown) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(data));
  }
}

// Broadcast helper to all players in a room (skips players without a live socket)
function broadcastToRoom(room: GameRoom, data: unknown) {
  const message = JSON.stringify(data);
  room.players.forEach((player) => {
    if (player.ws && player.ws.readyState === WebSocket.OPEN) {
      player.ws.send(message);
    }
  });
}

// Broadcast helper to EVERY connected WebSocket client in the app
function broadcastGlobal(data: any) {
  const message = JSON.stringify(data);
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  });
}

// Pick random unique challenge IDs: players for the eyes challenge, questions for trivia
function pickRandomChallengeIds(gameType: GameType, count = ROUND_COUNT): string[] {
  const all: { id: string }[] = gameType === 'trivia' ? getFullTriviaList() : getFullPlayersList();
  const shuffled = [...all].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count).map((item) => item.id);
}

function getChallenge(room: GameRoom, id: string = room.currentChallengeId) {
  const list: { id: string }[] = room.gameType === 'trivia' ? getFullTriviaList() : getFullPlayersList();
  return list.find((item) => item.id === id) || list[0];
}

function newRoomId(): string {
  let id = '';
  do {
    id = 'B11-' + Math.floor(1000 + Math.random() * 9000);
  } while (rooms.has(id));
  return id;
}

function createRoom(opts: {
  id?: string;
  gameType: GameType;
  players: OnlinePlayer[];
  status: GameRoom['status'];
}): GameRoom {
  const challengeIds = pickRandomChallengeIds(opts.gameType, ROUND_COUNT);
  const room: GameRoom = {
    id: opts.id && !rooms.has(opts.id) ? opts.id : newRoomId(),
    gameType: opts.gameType,
    players: opts.players,
    status: opts.status,
    currentRound: 0,
    totalRounds: Math.max(1, Math.min(ROUND_COUNT, challengeIds.length)),
    buzzedPlayerId: null,
    buzzedPlayerName: null,
    lastWinnerId: null,
    lastResult: null,
    challengeIds,
    currentChallengeId: challengeIds[0] || '',
    buzzerTimer: null,
    createdAt: Date.now(),
  };
  rooms.set(room.id, room);
  return room;
}

// Everything a client needs to (re)build its view of a room
function roomSnapshot(room: GameRoom) {
  return {
    roomId: room.id,
    gameType: room.gameType,
    status: room.status,
    players: publicPlayers(room),
    currentRound: room.currentRound,
    totalRounds: room.totalRounds,
    currentChallengeId: room.currentChallengeId,
    challenge: getChallenge(room),
    buzzedPlayerId: room.buzzedPlayerId,
    buzzedPlayerName: room.buzzedPlayerName,
    lastWinnerId: room.lastWinnerId,
    lastResult: room.lastResult,
  };
}

function clearBuzzTimer(room: GameRoom) {
  if (room.buzzerTimer) {
    clearTimeout(room.buzzerTimer);
    room.buzzerTimer = null;
  }
}

function startRoom(room: GameRoom) {
  clearBuzzTimer(room);
  room.status = 'playing';
  room.currentRound = 0;
  room.buzzedPlayerId = null;
  room.buzzedPlayerName = null;
  room.lastWinnerId = null;
  room.lastResult = null;
  room.currentChallengeId = room.challengeIds[0] || '';
  broadcastToRoom(room, { type: 'match_started', ...roomSnapshot(room) });
}

function finishRound(room: GameRoom, answeringPlayerId: string, isCorrect: boolean, isTimeout: boolean) {
  clearBuzzTimer(room);
  room.status = 'round_finished';

  const answering = room.players.find((p) => p.id === answeringPlayerId);
  const other = room.players.find((p) => p.id !== answeringPlayerId);

  if (isCorrect) {
    if (answering) answering.score += 100;
    room.lastWinnerId = answeringPlayerId;
  } else {
    if (other) other.score += 50;
    room.lastWinnerId = other ? other.id : null;
  }
  room.lastResult = { isCorrect, isTimeout };

  broadcastToRoom(room, {
    type: 'round_result',
    isCorrect,
    isTimeout,
    lastWinnerId: room.lastWinnerId,
    players: publicPlayers(room),
  });
}

// First player to press wins the right to answer. Pressing again as the same
// player is a no-op that still reports success (WebSocket + HTTP both send it).
function buzzIn(room: GameRoom, playerId: string): boolean {
  if (room.status === 'round_buzzed' && room.buzzedPlayerId === playerId) return true;
  if (room.status !== 'playing' || room.buzzedPlayerId !== null) return false;

  const player = room.players.find((p) => p.id === playerId);
  if (!player) return false;

  room.status = 'round_buzzed';
  room.buzzedPlayerId = playerId;
  room.buzzedPlayerName = player.name;

  broadcastToRoom(room, {
    type: 'player_buzzed',
    buzzedPlayerId: playerId,
    buzzedPlayerName: player.name,
    timeLimit: BUZZER_SECONDS,
  });

  // Timeout fallback: no answer within the time limit
  clearBuzzTimer(room);
  room.buzzerTimer = setTimeout(() => {
    if (room.status === 'round_buzzed' && room.buzzedPlayerId === playerId) {
      finishRound(room, playerId, false, true);
    }
  }, (BUZZER_SECONDS + 0.5) * 1000);

  return true;
}

// Only the player who buzzed can answer, and only once per round.
function submitAnswer(room: GameRoom, playerId: string, isCorrect: boolean): boolean {
  if (room.status !== 'round_buzzed' || room.buzzedPlayerId !== playerId) return false;
  finishRound(room, playerId, !!isCorrect, false);
  return true;
}

// Only moves on from a finished round, so two "next round" requests for the same
// round (socket + HTTP, or both players) advance it once.
function advanceRound(room: GameRoom): boolean {
  if (room.status !== 'round_finished') return false;

  clearBuzzTimer(room);
  room.currentRound += 1;
  room.buzzedPlayerId = null;
  room.buzzedPlayerName = null;
  room.lastWinnerId = null;
  room.lastResult = null;

  if (room.currentRound >= room.totalRounds) {
    room.status = 'game_over';
    broadcastToRoom(room, { type: 'game_over', players: publicPlayers(room) });
  } else {
    room.status = 'playing';
    room.currentChallengeId = room.challengeIds[room.currentRound] || '';
    broadcastToRoom(room, {
      type: 'new_round',
      currentRound: room.currentRound,
      currentChallengeId: room.currentChallengeId,
      challenge: getChallenge(room),
      players: publicPlayers(room),
    });
  }
  return true;
}

function removePlayerFromRoom(room: GameRoom, playerId: string) {
  const idx = room.players.findIndex((p) => p.id === playerId);
  if (idx === -1) return;

  const leaving = room.players[idx];
  clearBuzzTimer(room);
  room.players.splice(idx, 1);

  if (room.players.length === 0) {
    rooms.delete(room.id);
    return;
  }
  if (room.status === 'game_over') return;

  const remaining = room.players[0];
  if (room.status !== 'waiting') {
    room.status = 'game_over';
  }
  broadcastToRoom(room, {
    type: 'player_left',
    message: `غادر اللاعب ${leaving.name} المباراة`,
    winnerId: remaining.id,
    winnerName: remaining.name,
    players: publicPlayers(room),
  });
}

// Clean disconnected or leaving players
function cleanPlayerFromRooms(ws: WebSocket) {
  // 1. Remove from matchmaking queue
  matchmakingQueue = matchmakingQueue.filter((p) => p.ws !== ws);

  // 2. Remove from active rooms
  Array.from(rooms.values()).forEach((room) => {
    const player = room.players.find((p) => p.ws === ws);
    if (player) removePlayerFromRoom(room, player.id);
  });

  // Notify remaining queue users of updated queue count
  broadcastQueueStatus();
}

function pruneQueue() {
  const now = Date.now();
  matchmakingQueue = matchmakingQueue.filter((p) =>
    p.ws ? p.ws.readyState === WebSocket.OPEN : now - p.seenAt < QUEUE_HTTP_TTL_MS
  );
}

function broadcastQueueStatus() {
  const payload = {
    type: 'queue_update',
    queueCount: matchmakingQueue.length,
    onlineCount: wss.clients.size,
  };
  matchmakingQueue.forEach((item) => sendTo(item.ws, payload));
}

function findActiveRoomFor(playerId: string): GameRoom | null {
  const active = Array.from(rooms.values()).find(
    (room) =>
      room.status !== 'waiting' &&
      room.status !== 'game_over' &&
      room.players.some((p) => p.id === playerId)
  );
  return active || null;
}

// Pair the caller with a waiting player of the same game type, or put the caller in
// the queue. `created` is true only for a room made by this very call.
function matchOrQueue(
  playerId: string,
  playerName: string,
  gameType: GameType,
  ws: WebSocket | null
): { room: GameRoom | null; created: boolean } {
  pruneQueue();

  // Someone else may already have matched this player (their HTTP poll finds out here)
  const active = findActiveRoomFor(playerId);
  if (active) {
    const me = active.players.find((p) => p.id === playerId);
    if (me && ws) me.ws = ws;
    return { room: active, created: false };
  }

  const mine = matchmakingQueue.find((p) => p.playerId === playerId);
  const myWs = ws || mine?.ws || null;

  const opponentIdx = matchmakingQueue.findIndex((p) => p.playerId !== playerId && p.gameType === gameType);
  if (opponentIdx !== -1) {
    const opponent = matchmakingQueue.splice(opponentIdx, 1)[0];
    matchmakingQueue = matchmakingQueue.filter((p) => p.playerId !== playerId);

    const room = createRoom({
      gameType,
      status: 'playing',
      players: [
        { id: opponent.playerId, name: opponent.playerName, score: 0, ws: opponent.ws, isHost: true },
        { id: playerId, name: playerName, score: 0, ws: myWs, isHost: false },
      ],
    });
    console.log(`[Arena] Real match created: ${room.id} (${gameType}) ${opponent.playerName} vs ${playerName}`);
    return { room, created: true };
  }

  matchmakingQueue = matchmakingQueue.filter((p) => p.playerId !== playerId);
  matchmakingQueue.push({ ws: myWs, playerId, playerName, gameType, seenAt: Date.now() });
  return { room: null, created: false };
}

function announceMatch(room: GameRoom) {
  room.status = 'playing';
  broadcastToRoom(room, { type: 'match_started', ...roomSnapshot(room) });
}

// WebSocket Server for Realtime Arena & Global Event Broadcasting
const wss = new WebSocketServer({ noServer: true });

server.on('upgrade', (request, socket, head) => {
  const url = request.url || '';
  const pathname = url.split('?')[0];

  if (pathname === '/ws' || pathname === '/api/ws') {
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, request);
    });
  } else {
    socket.destroy();
  }
});

// Ping-pong heartbeat to keep connections alive
setInterval(() => {
  wss.clients.forEach((ws: any) => {
    if (ws.isAlive === false) return ws.terminate();
    ws.isAlive = false;
    ws.ping();
  });
}, 30000);

// Drop rooms nobody finished and stale queue entries
setInterval(() => {
  const cutoff = Date.now() - 3 * 60 * 60 * 1000;
  Array.from(rooms.values()).forEach((room) => {
    if (room.createdAt < cutoff) {
      clearBuzzTimer(room);
      rooms.delete(room.id);
    }
  });
  pruneQueue();
}, 10 * 60 * 1000);

function handleSocketMessage(ws: WebSocket, data: any) {
  // Any message that names a room + player (re)attaches this socket to that player,
  // so a player who was matched over HTTP starts receiving live events.
  if (data && data.roomId && data.playerId) {
    const room = rooms.get(data.roomId);
    const player = room?.players.find((p) => p.id === data.playerId);
    if (player && player.ws !== ws) player.ws = ws;
  }

  switch (data?.type) {
    // 1. Quick matchmaking for real players
    case 'find_match': {
      const { playerId, playerName } = data;
      if (!playerId) return;
      const result = matchOrQueue(playerId, playerName || 'لاعب', normalizeGameType(data.gameType), ws);

      if (result.room && result.created) {
        announceMatch(result.room);
      } else if (result.room) {
        sendTo(ws, { type: 'match_started', ...roomSnapshot(result.room) });
      } else {
        sendTo(ws, {
          type: 'queued',
          message: 'جاري البحث عن لاعب حقيقي أونلاين...',
          queueCount: matchmakingQueue.length,
          onlineCount: wss.clients.size,
        });
        broadcastQueueStatus();
      }
      break;
    }

    // 2. Leave queue
    case 'leave_queue': {
      matchmakingQueue = matchmakingQueue.filter((p) => p.playerId !== data.playerId);
      broadcastQueueStatus();
      sendTo(ws, { type: 'left_queue' });
      break;
    }

    // 3. Create private/custom room
    case 'create_room': {
      const { playerId, playerName } = data;
      if (!playerId) return;
      const room = createRoom({
        id: data.roomId,
        gameType: normalizeGameType(data.gameType),
        status: 'waiting',
        players: [{ id: playerId, name: playerName || 'المضيف', score: 0, ws, isHost: true }],
      });
      sendTo(ws, { type: 'room_created', roomId: room.id, gameType: room.gameType, players: publicPlayers(room) });
      break;
    }

    // 4. Join custom room
    case 'join_room': {
      const { playerId, playerName, roomId } = data;
      const room = rooms.get(roomId);
      if (!room) {
        sendTo(ws, { type: 'error', message: 'رمز الغرفة غير موجود أو تم إغلاقها' });
        return;
      }

      const existing = room.players.find((p) => p.id === playerId);
      if (existing) {
        existing.ws = ws;
      } else if (room.status !== 'waiting' || room.players.length >= 2) {
        sendTo(ws, { type: 'error', message: 'الغرفة ممتلئة أو بدأت المباراة بالفعل' });
        return;
      } else {
        room.players.push({ id: playerId, name: playerName || 'لاعب منافس', score: 0, ws, isHost: false });
      }

      broadcastToRoom(room, {
        type: 'room_joined',
        roomId: room.id,
        gameType: room.gameType,
        players: publicPlayers(room),
        status: room.status,
        currentRound: room.currentRound,
        currentChallengeId: room.currentChallengeId,
      });
      break;
    }

    // 5. Start match (from waiting room)
    case 'start_match': {
      const room = rooms.get(data.roomId);
      if (room && room.status === 'waiting' && room.players.length >= 2) startRoom(room);
      break;
    }

    // 6. Explicitly attach this socket to a room (HTTP-matched players)
    case 'attach_room':
      break; // handled by the attach step above

    // 7. Buzzer press (server timer limits the answer time)
    case 'press_buzzer': {
      const room = rooms.get(data.roomId);
      if (room) buzzIn(room, data.playerId);
      break;
    }

    // 8. Submit answer
    case 'submit_answer': {
      const room = rooms.get(data.roomId);
      if (room) submitAnswer(room, data.playerId, !!data.isCorrect);
      break;
    }

    // 9. Next round
    case 'next_round': {
      const room = rooms.get(data.roomId);
      if (room) advanceRound(room);
      break;
    }

    // 10. Live reaction emote
    case 'send_reaction': {
      const room = rooms.get(data.roomId);
      if (room) {
        broadcastToRoom(room, { type: 'reaction', playerId: data.playerId, emoji: data.emoji });
      }
      break;
    }
  }
}

wss.on('connection', (ws: WebSocket) => {
  (ws as any).isAlive = true;
  ws.on('pong', () => {
    (ws as any).isAlive = true;
  });

  // Send initial online count
  sendTo(ws, {
    type: 'server_hello',
    onlineCount: wss.clients.size,
    queueCount: matchmakingQueue.length,
  });

  ws.on('message', (raw) => {
    let data: any;
    try {
      data = JSON.parse(raw.toString());
    } catch {
      return;
    }
    try {
      handleSocketMessage(ws, data);
    } catch (err) {
      console.error('[Arena WS Error]:', err);
    }
  });

  ws.on('close', () => {
    cleanPlayerFromRooms(ws);
  });
});

// REST API Endpoints

// 1. Health & Server Stats
app.get('/api/health', (req, res) => {
  res.json({
    status: 'online',
    timestamp: new Date().toISOString(),
    activeRooms: rooms.size,
    queuedPlayers: matchmakingQueue.length,
    onlineSockets: wss.clients.size,
    totalCommunityTrivia: serverCustomTrivia.length,
    totalCommunityPlayers: serverCustomPlayers.length,
  });
});

app.get('/api/stats', (req, res) => {
  res.json({
    onlinePlayers: wss.clients.size,
    queuedPlayers: matchmakingQueue.length,
    activeRooms: rooms.size,
    totalTrivia: getFullTriviaList().length,
    totalPlayers: getFullPlayersList().length,
  });
});

// 2. Open Public Rooms (Allows players to view & join games directly)
app.get('/api/open-rooms', (req, res) => {
  const openRooms: any[] = [];
  rooms.forEach((room, id) => {
    if (room.status === 'waiting' && room.players.length < 2) {
      openRooms.push({
        id,
        hostName: room.players[0]?.name || 'لاعب',
        playerCount: room.players.length,
        status: room.status,
        gameType: room.gameType,
      });
    }
  });
  res.json(openRooms);
});

let triviaVersion = Date.now();
let playersVersion = Date.now();

// 3. Room Status (clients poll this as a fallback when socket events are missed)
app.get('/api/rooms/:roomId', (req, res) => {
  const room = rooms.get(req.params.roomId);
  if (!room) return res.status(404).json({ error: 'Room not found' });
  res.setHeader('Cache-Control', 'no-store');
  res.json({ id: room.id, playerCount: room.players.length, ...roomSnapshot(room) });
});

// HTTP versions of create / join / start so private rooms also work without a socket
app.post('/api/rooms/create', (req, res) => {
  const { playerId, playerName } = req.body || {};
  if (!playerId) return res.status(400).json({ error: 'Missing playerId' });
  const room = createRoom({
    gameType: normalizeGameType(req.body.gameType),
    status: 'waiting',
    players: [{ id: playerId, name: playerName || 'المضيف', score: 0, ws: null, isHost: true }],
  });
  res.json({ success: true, ...roomSnapshot(room) });
});

app.post('/api/rooms/join', (req, res) => {
  const { playerId, playerName } = req.body || {};
  const roomId = String(req.body?.roomId || '').trim().toUpperCase();
  const room = rooms.get(roomId);
  if (!playerId) return res.status(400).json({ error: 'Missing playerId' });
  if (!room) return res.status(404).json({ error: 'رمز الغرفة غير موجود أو تم إغلاقها' });

  const existing = room.players.find((p) => p.id === playerId);
  if (!existing) {
    if (room.status !== 'waiting' || room.players.length >= 2) {
      return res.status(409).json({ error: 'الغرفة ممتلئة أو بدأت المباراة بالفعل' });
    }
    room.players.push({ id: playerId, name: playerName || 'لاعب منافس', score: 0, ws: null, isHost: false });
    broadcastToRoom(room, { type: 'room_joined', ...roomSnapshot(room) });
  }
  res.json({ success: true, ...roomSnapshot(room) });
});

app.post('/api/rooms/start', (req, res) => {
  const room = rooms.get(req.body?.roomId);
  if (!room) return res.status(404).json({ error: 'Room not found' });
  if (room.status === 'waiting' && room.players.length >= 2) startRoom(room);
  res.json({ success: true, ...roomSnapshot(room) });
});

// HTTP Real-Time Matchmaking Fallback API
app.post('/api/matchmaking/find', (req, res) => {
  const { playerId, playerName } = req.body || {};
  if (!playerId) return res.status(400).json({ error: 'Missing playerId' });

  const gameType = normalizeGameType(req.body.gameType);
  const result = matchOrQueue(playerId, playerName || 'لاعب', gameType, null);

  if (result.room) {
    if (result.created) announceMatch(result.room);
    return res.json({ status: 'matched', ...roomSnapshot(result.room) });
  }

  broadcastQueueStatus();
  res.json({
    status: 'queued',
    message: 'جاري البحث عن لاعب حقيقي أونلاين...',
    queueCount: matchmakingQueue.length,
    onlineCount: Math.max(1, wss.clients.size),
  });
});

app.post('/api/matchmaking/buzz', (req, res) => {
  const { roomId, playerId } = req.body || {};
  const room = rooms.get(roomId);
  if (!room) return res.json({ success: false });

  const success = buzzIn(room, playerId);
  res.json({
    success,
    status: room.status,
    buzzedPlayerId: room.buzzedPlayerId,
    buzzedPlayerName: room.buzzedPlayerName,
  });
});

app.post('/api/matchmaking/answer', (req, res) => {
  const { roomId, playerId, isCorrect } = req.body || {};
  const room = rooms.get(roomId);
  if (!room) return res.status(404).json({ error: 'Room not found' });

  const success = submitAnswer(room, playerId, !!isCorrect);
  res.json({
    success,
    status: room.status,
    lastWinnerId: room.lastWinnerId,
    lastResult: room.lastResult,
    players: publicPlayers(room),
  });
});

app.post('/api/matchmaking/next', (req, res) => {
  const { roomId } = req.body || {};
  const room = rooms.get(roomId);
  if (!room) return res.status(404).json({ error: 'Room not found' });

  const success = advanceRound(room);
  res.json({
    success,
    status: room.status,
    currentRound: room.currentRound,
    challenge: room.status === 'playing' ? getChallenge(room) : null,
    players: publicPlayers(room),
  });
});

app.post('/api/matchmaking/leave', (req, res) => {
  const { playerId } = req.body || {};
  matchmakingQueue = matchmakingQueue.filter((p) => p.playerId !== playerId);
  Array.from(rooms.values()).forEach((room) => {
    if (room.players.some((p) => p.id === playerId)) removePlayerFromRoom(room, playerId);
  });
  broadcastQueueStatus();
  res.json({ success: true });
});

// Versions for instant client-side sync
app.get('/api/trivia/version', (req, res) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.json({ version: triviaVersion, count: getFullTriviaList().length });
});

app.get('/api/players/version', (req, res) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.json({ version: playersVersion, count: getFullPlayersList().length });
});

// 4. Global Community Trivia API (Instant sync for Owner Mode)
app.get('/api/trivia', (req, res) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.json(getFullTriviaList());
});

app.post('/api/trivia', (req, res) => {
  try {
    const question = req.body as TriviaQuestion;
    if (!question || !question.question || !question.options || !question.correctAnswer) {
      return res.status(400).json({ error: 'بيانات السؤال غير مكتملة' });
    }

    const questionToSave: TriviaQuestion = {
      ...question,
      id: question.id || 'q-server-' + Date.now(),
    };

    // Remove existing with same id if any, and add to beginning
    serverCustomTrivia = [questionToSave, ...serverCustomTrivia.filter((q) => q.id !== questionToSave.id)];
    saveJsonFile(TRIVIA_FILE, serverCustomTrivia);
    triviaVersion = Date.now();

    // Broadcast instantly to all active connected players
    broadcastGlobal({
      type: 'trivia_added',
      question: questionToSave,
      totalCount: getFullTriviaList().length,
      version: triviaVersion,
      message: 'تمت إضافة سؤال كروي جديد من المالك! ⚽',
    });

    console.log(`[Owner Mode] New Question added & broadcasted to all: "${questionToSave.question}"`);
    res.json({ success: true, question: questionToSave, totalCount: getFullTriviaList().length });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/trivia/:id', (req, res) => {
  try {
    const id = req.params.id;
    serverCustomTrivia = serverCustomTrivia.filter((q) => q.id !== id);
    saveJsonFile(TRIVIA_FILE, serverCustomTrivia);
    triviaVersion = Date.now();

    broadcastGlobal({
      type: 'trivia_deleted',
      id,
      version: triviaVersion,
    });

    res.json({ success: true, deletedId: id });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 5. Global Community Players API (Instant sync for Owner Mode)
app.get('/api/players', (req, res) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.json(getFullPlayersList());
});

app.post('/api/players', (req, res) => {
  try {
    const player = req.body as FootballPlayer;
    if (!player || !player.name || !player.photoUrl) {
      return res.status(400).json({ error: 'بيانات اللاعب غير مكتملة' });
    }

    const playerToSave: FootballPlayer = {
      ...player,
      id: player.id || 'player-server-' + Date.now(),
    };

    serverCustomPlayers = [playerToSave, ...serverCustomPlayers.filter((p) => p.id !== playerToSave.id)];
    saveJsonFile(PLAYERS_FILE, serverCustomPlayers);
    playersVersion = Date.now();

    broadcastGlobal({
      type: 'player_added',
      player: playerToSave,
      totalCount: getFullPlayersList().length,
      version: playersVersion,
      message: `تمت إضافة لاعب جديد من المالك: ${playerToSave.name}! 🌟`,
    });

    console.log(`[Owner Mode] New Player added & broadcasted to all: "${playerToSave.name}"`);
    res.json({ success: true, player: playerToSave, totalCount: getFullPlayersList().length });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/players/:id', (req, res) => {
  try {
    const id = req.params.id;
    serverCustomPlayers = serverCustomPlayers.filter((p) => p.id !== id);
    saveJsonFile(PLAYERS_FILE, serverCustomPlayers);
    playersVersion = Date.now();

    broadcastGlobal({
      type: 'player_deleted',
      id,
      version: playersVersion,
    });

    res.json({ success: true, deletedId: id });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 6. Global Leaderboard API
app.get('/api/leaderboard', (req, res) => {
  const mode = req.query.mode as string | undefined;
  let list = [...serverLeaderboard];
  if (mode && mode !== 'total') {
    list = list.filter((item) => item.mode === mode);
  }
  res.json(list.sort((a, b) => b.score - a.score));
});

app.post('/api/leaderboard', (req, res) => {
  try {
    const entry = req.body;
    if (!entry || !entry.name || typeof entry.score !== 'number') {
      return res.status(400).json({ error: 'بيانات النتيجة غير صالحة' });
    }

    const newEntry = {
      ...entry,
      id: 'lb-' + Date.now(),
      date: new Date().toLocaleDateString('ar-EG', { month: 'short', day: 'numeric' }),
    };

    serverLeaderboard = [newEntry, ...serverLeaderboard].sort((a, b) => b.score - a.score).slice(0, 100);
    saveJsonFile(LEADERBOARD_FILE, serverLeaderboard);

    broadcastGlobal({
      type: 'leaderboard_updated',
      entry: newEntry,
    });

    res.json({ success: true, leaderboard: serverLeaderboard });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Production or Vite Dev Middlewares - With robust 404 & 403 handling
async function startServer() {
  app.set('trust proxy', 1);

  if (process.env.NODE_ENV !== 'production') {
    const { createServer } = await import('vite');
    const vite = await createServer({
      configFile: path.resolve(__dirname, 'vite.config.ts'),
      server: {
        middlewareMode: true,
        hmr: false,
        allowedHosts: true,
        cors: true,
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);

    // Fallback to transform and serve index.html for any SPA route
    app.use('*', async (req, res, next) => {
      const url = req.originalUrl;
      if (url.startsWith('/api')) {
        return res.status(404).json({ error: 'Endpoint not found' });
      }
      try {
        let template = fs.readFileSync(path.resolve(__dirname, 'index.html'), 'utf-8');
        template = await vite.transformIndexHtml(url, template);
        res.status(200).set({ 'Content-Type': 'text/html' }).end(template);
      } catch (e) {
        next(e);
      }
    });
  } else {
    app.use(express.static(path.join(__dirname, 'dist')));
    app.get('*', (req, res) => {
      const distIndex = path.join(__dirname, 'dist', 'index.html');
      if (fs.existsSync(distIndex)) {
        res.sendFile(distIndex);
      } else {
        res.sendFile(path.join(__dirname, 'index.html'));
      }
    });
  }

  server.listen(Number(PORT), '0.0.0.0', () => {
    console.log(`B11 Football Trivia Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
