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

// Online Arena Data Structures
interface OnlinePlayer {
  id: string;
  name: string;
  score: number;
  ws: WebSocket;
  isHost: boolean;
}

interface GameRoom {
  id: string;
  players: OnlinePlayer[];
  status: 'waiting' | 'playing' | 'round_buzzed' | 'round_finished' | 'game_over';
  currentRound: number;
  totalRounds: number;
  buzzedPlayerId: string | null;
  lastWinnerId: string | null;
  challengeIds: string[];
  currentChallengeId: string;
  buzzerTimer: NodeJS.Timeout | null;
}

const rooms = new Map<string, GameRoom>();
let matchmakingQueue: { ws: WebSocket; playerId: string; playerName: string }[] = [];

// Broadcast helper to all players in a room
function broadcastToRoom(room: GameRoom, data: any) {
  const message = JSON.stringify(data);
  room.players.forEach((player) => {
    if (player.ws.readyState === WebSocket.OPEN) {
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

// Clean disconnected or leaving players
function cleanPlayerFromRooms(ws: WebSocket) {
  // 1. Remove from matchmaking queue
  matchmakingQueue = matchmakingQueue.filter((p) => p.ws !== ws && p.ws.readyState === WebSocket.OPEN);

  // 2. Remove from active rooms
  rooms.forEach((room, roomId) => {
    const pIdx = room.players.findIndex((p) => p.ws === ws);
    if (pIdx !== -1) {
      const leavingPlayer = room.players[pIdx];
      if (room.buzzerTimer) clearTimeout(room.buzzerTimer);
      room.players.splice(pIdx, 1);

      if (room.players.length === 0) {
        rooms.delete(roomId);
      } else {
        const remainingPlayer = room.players[0];
        broadcastToRoom(room, {
          type: 'player_left',
          message: `غادر اللاعب ${leavingPlayer.name} المباراة`,
          winnerId: remainingPlayer.id,
          winnerName: remainingPlayer.name,
          players: room.players.map((p) => ({ id: p.id, name: p.name, score: p.score, isHost: p.isHost })),
        });
      }
    }
  });

  // Notify remaining queue users of updated queue count
  broadcastQueueStatus();
}

function broadcastQueueStatus() {
  const payload = {
    type: 'queue_update',
    queueCount: matchmakingQueue.length,
    onlineCount: wss.clients.size,
  };
  matchmakingQueue.forEach((item) => {
    if (item.ws.readyState === WebSocket.OPEN) {
      item.ws.send(JSON.stringify(payload));
    }
  });
}

// Pick 5 random unique challenge IDs from available players list
function pickRandomChallengeIds(count = 5): string[] {
  const all = getFullPlayersList();
  const shuffled = [...all].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count).map((p) => p.id);
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

wss.on('connection', (ws: WebSocket) => {
  (ws as any).isAlive = true;
  ws.on('pong', () => {
    (ws as any).isAlive = true;
  });

  // Send initial online count
  ws.send(JSON.stringify({
    type: 'server_hello',
    onlineCount: wss.clients.size,
    queueCount: matchmakingQueue.length,
  }));

  ws.on('message', (raw) => {
    try {
      const data = JSON.parse(raw.toString());

      // 1. Quick Matchmaking Queue for Real Players
      if (data.type === 'find_match') {
        const { playerId, playerName } = data;

        // Clean out dead sockets first
        matchmakingQueue = matchmakingQueue.filter((p) => p.ws.readyState === WebSocket.OPEN);

        // Check if an available real opponent is waiting
        const opponentIdx = matchmakingQueue.findIndex(
          (p) => p.playerId !== playerId && p.ws.readyState === WebSocket.OPEN
        );

        if (opponentIdx !== -1) {
          const opponent = matchmakingQueue.splice(opponentIdx, 1)[0];
          const roomId = 'B11-' + Math.floor(1000 + Math.random() * 9000);
          const challengeIds = pickRandomChallengeIds(5);
          const firstChallenge = getFullPlayersList().find((p) => p.id === challengeIds[0]) || getFullPlayersList()[0];

          const newRoom: GameRoom = {
            id: roomId,
            players: [
              { id: opponent.playerId, name: opponent.playerName, score: 0, ws: opponent.ws, isHost: true },
              { id: playerId, name: playerName || 'لاعب 2', score: 0, ws, isHost: false },
            ],
            status: 'playing',
            currentRound: 0,
            totalRounds: 5,
            buzzedPlayerId: null,
            lastWinnerId: null,
            challengeIds,
            currentChallengeId: challengeIds[0] || 'salah',
            buzzerTimer: null,
          };
          rooms.set(roomId, newRoom);

          console.log(`[Arena] Real Match Created: ${roomId} between ${opponent.playerName} & ${playerName}`);

          broadcastToRoom(newRoom, {
            type: 'match_started',
            roomId,
            players: newRoom.players.map((p) => ({ id: p.id, name: p.name, score: p.score, isHost: p.isHost })),
            currentRound: 0,
            currentChallengeId: newRoom.currentChallengeId,
            challenge: firstChallenge,
            totalRounds: 5,
            status: 'playing',
          });
        } else {
          // Remove if player already in queue to avoid duplicates
          matchmakingQueue = matchmakingQueue.filter((p) => p.playerId !== playerId);
          matchmakingQueue.push({ ws, playerId, playerName: playerName || 'لاعب' });

          ws.send(JSON.stringify({
            type: 'queued',
            message: 'جاري البحث عن لاعب حقيقي أونلاين...',
            queueCount: matchmakingQueue.length,
            onlineCount: wss.clients.size,
          }));

          broadcastQueueStatus();
        }
      }

      // 2. Leave Queue
      if (data.type === 'leave_queue') {
        matchmakingQueue = matchmakingQueue.filter((p) => p.playerId !== data.playerId);
        broadcastQueueStatus();
        ws.send(JSON.stringify({ type: 'left_queue' }));
      }

      // 3. Create Private/Custom Room
      if (data.type === 'create_room') {
        const { playerId, playerName, roomId: customRoomId } = data;
        const roomId = customRoomId || 'B11-' + Math.floor(1000 + Math.random() * 9000);
        const challengeIds = pickRandomChallengeIds(5);

        const newRoom: GameRoom = {
          id: roomId,
          players: [{ id: playerId, name: playerName || 'المضيف', score: 0, ws, isHost: true }],
          status: 'waiting',
          currentRound: 0,
          totalRounds: 5,
          buzzedPlayerId: null,
          lastWinnerId: null,
          challengeIds,
          currentChallengeId: challengeIds[0] || 'salah',
          buzzerTimer: null,
        };
        rooms.set(roomId, newRoom);

        ws.send(JSON.stringify({
          type: 'room_created',
          roomId,
          players: newRoom.players.map((p) => ({ id: p.id, name: p.name, score: p.score, isHost: p.isHost })),
        }));
      }

      // 4. Join Custom Room
      if (data.type === 'join_room') {
        const { playerId, playerName, roomId } = data;

        const room = rooms.get(roomId);
        if (!room) {
          ws.send(JSON.stringify({ type: 'error', message: 'رمز الغرفة غير موجود أو تم إغلاقها' }));
          return;
        }

        const existing = room.players.find((p) => p.id === playerId);
        if (existing) {
          existing.ws = ws;
        } else {
          room.players.push({ id: playerId, name: playerName || 'لاعب منافس', score: 0, ws, isHost: false });
        }

        broadcastToRoom(room, {
          type: 'room_joined',
          roomId,
          players: room.players.map((p) => ({ id: p.id, name: p.name, score: p.score, isHost: p.isHost })),
          status: room.status,
          currentRound: room.currentRound,
          currentChallengeId: room.currentChallengeId,
        });
      }

      // 5. Start Match (from Waiting Room)
      if (data.type === 'start_match') {
        const { roomId } = data;
        const room = rooms.get(roomId);
        if (room) {
          room.status = 'playing';
          room.currentRound = 0;
          room.buzzedPlayerId = null;
          room.currentChallengeId = room.challengeIds[0] || 'salah';

          broadcastToRoom(room, {
            type: 'match_started',
            roomId,
            currentRound: 0,
            currentChallengeId: room.currentChallengeId,
            totalRounds: room.totalRounds,
            players: room.players.map((p) => ({ id: p.id, name: p.name, score: p.score, isHost: p.isHost })),
            status: 'playing',
          });
        }
      }

      // 6. Buzzer Press with Server Timer (12s limit)
      if (data.type === 'press_buzzer') {
        const { roomId, playerId } = data;
        const room = rooms.get(roomId);
        if (room && room.status === 'playing' && room.buzzedPlayerId === null) {
          room.buzzedPlayerId = playerId;
          room.status = 'round_buzzed';
          const buzzedPlayer = room.players.find((p) => p.id === playerId);

          broadcastToRoom(room, {
            type: 'player_buzzed',
            buzzedPlayerId: playerId,
            buzzedPlayerName: buzzedPlayer ? buzzedPlayer.name : 'لاعب',
            timeLimit: 12,
          });

          // Timeout fallback: if no answer submitted within 12 seconds
          if (room.buzzerTimer) clearTimeout(room.buzzerTimer);
          room.buzzerTimer = setTimeout(() => {
            if (room.status === 'round_buzzed' && room.buzzedPlayerId === playerId) {
              room.status = 'round_finished';
              const opponent = room.players.find((p) => p.id !== playerId);
              if (opponent) opponent.score += 50;
              room.lastWinnerId = opponent ? opponent.id : null;

              broadcastToRoom(room, {
                type: 'round_result',
                isCorrect: false,
                isTimeout: true,
                lastWinnerId: room.lastWinnerId,
                players: room.players.map((p) => ({ id: p.id, name: p.name, score: p.score, isHost: p.isHost })),
              });
            }
          }, 12500);
        }
      }

      // 7. Submit Answer
      if (data.type === 'submit_answer') {
        const { roomId, playerId, isCorrect } = data;
        const room = rooms.get(roomId);
        if (room) {
          if (room.buzzerTimer) clearTimeout(room.buzzerTimer);
          room.status = 'round_finished';

          if (isCorrect) {
            const player = room.players.find((p) => p.id === playerId);
            if (player) player.score += 100;
            room.lastWinnerId = playerId;
          } else {
            const opponent = room.players.find((p) => p.id !== playerId);
            if (opponent) opponent.score += 50;
            room.lastWinnerId = opponent ? opponent.id : null;
          }

          broadcastToRoom(room, {
            type: 'round_result',
            isCorrect,
            lastWinnerId: room.lastWinnerId,
            players: room.players.map((p) => ({ id: p.id, name: p.name, score: p.score, isHost: p.isHost })),
          });
        }
      }

      // 8. Next Round
      if (data.type === 'next_round') {
        const { roomId } = data;
        const room = rooms.get(roomId);
        if (room) {
          if (room.buzzerTimer) clearTimeout(room.buzzerTimer);
          room.currentRound += 1;
          room.buzzedPlayerId = null;

          if (room.currentRound >= room.totalRounds) {
            room.status = 'game_over';
            broadcastToRoom(room, {
              type: 'game_over',
              players: room.players.map((p) => ({ id: p.id, name: p.name, score: p.score, isHost: p.isHost })),
            });
          } else {
            room.status = 'playing';
            room.currentChallengeId = room.challengeIds[room.currentRound] || 'salah';
            const nextChallenge = getFullPlayersList().find((p) => p.id === room.currentChallengeId) || getFullPlayersList()[0];
            broadcastToRoom(room, {
              type: 'new_round',
              currentRound: room.currentRound,
              currentChallengeId: room.currentChallengeId,
              challenge: nextChallenge,
              players: room.players.map((p) => ({ id: p.id, name: p.name, score: p.score, isHost: p.isHost })),
            });
          }
        }
      }

      // 9. Live Reaction Emote
      if (data.type === 'send_reaction') {
        const { roomId, playerId, emoji } = data;
        const room = rooms.get(roomId);
        if (room) {
          broadcastToRoom(room, {
            type: 'reaction',
            playerId,
            emoji,
          });
        }
      }
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
      });
    }
  });
  res.json(openRooms);
});

let triviaVersion = Date.now();
let playersVersion = Date.now();

// 3. Room Status
app.get('/api/rooms/:roomId', (req, res) => {
  const room = rooms.get(req.params.roomId);
  if (!room) return res.status(404).json({ error: 'Room not found' });
  const challengeObj = getFullPlayersList().find((p) => p.id === room.currentChallengeId) || getFullPlayersList()[0];
  res.json({
    id: room.id,
    playerCount: room.players.length,
    status: room.status,
    currentRound: room.currentRound,
    currentChallengeId: room.currentChallengeId,
    challenge: challengeObj,
    buzzedPlayerId: room.buzzedPlayerId,
    players: room.players.map((p) => ({ id: p.id, name: p.name, score: p.score, isHost: p.isHost })),
  });
});

// HTTP Real-Time Matchmaking Fallback API
app.post('/api/matchmaking/find', (req, res) => {
  const { playerId, playerName } = req.body;
  if (!playerId) return res.status(400).json({ error: 'Missing playerId' });

  // Clean inactive entries
  matchmakingQueue = matchmakingQueue.filter((p) => p.ws ? p.ws.readyState === WebSocket.OPEN : true);

  // Check if an available opponent is waiting
  const opponentIdx = matchmakingQueue.findIndex((p) => p.playerId !== playerId);
  if (opponentIdx !== -1) {
    const opponent = matchmakingQueue.splice(opponentIdx, 1)[0];
    const roomId = 'B11-' + Math.floor(1000 + Math.random() * 9000);
    const challengeIds = pickRandomChallengeIds(5);
    const firstChallenge = getFullPlayersList().find((p) => p.id === challengeIds[0]) || getFullPlayersList()[0];

    const newRoom: GameRoom = {
      id: roomId,
      players: [
        { id: opponent.playerId, name: opponent.playerName, score: 0, ws: opponent.ws, isHost: true },
        { id: playerId, name: playerName || 'لاعب 2', score: 0, ws: null as any, isHost: false },
      ],
      status: 'playing',
      currentRound: 0,
      totalRounds: 5,
      buzzedPlayerId: null,
      lastWinnerId: null,
      challengeIds,
      currentChallengeId: challengeIds[0] || 'salah',
      buzzerTimer: null,
    };
    rooms.set(roomId, newRoom);

    broadcastToRoom(newRoom, {
      type: 'match_started',
      roomId,
      players: newRoom.players.map((p) => ({ id: p.id, name: p.name, score: p.score, isHost: p.isHost })),
      currentRound: 0,
      currentChallengeId: newRoom.currentChallengeId,
      challenge: firstChallenge,
      totalRounds: 5,
      status: 'playing',
    });

    return res.json({
      status: 'matched',
      roomId,
      players: newRoom.players.map((p) => ({ id: p.id, name: p.name, score: p.score, isHost: p.isHost })),
      currentRound: 0,
      currentChallengeId: newRoom.currentChallengeId,
      challenge: firstChallenge,
    });
  }

  // Check if another player just matched us into a room
  let activeRoom: GameRoom | undefined;
  rooms.forEach((r) => {
    if (r.players.some((p) => p.id === playerId)) {
      activeRoom = r;
    }
  });

  if (activeRoom) {
    const challengeObj = getFullPlayersList().find((p) => p.id === activeRoom!.currentChallengeId) || getFullPlayersList()[0];
    return res.json({
      status: activeRoom.status === 'playing' ? 'matched' : 'waiting',
      roomId: activeRoom.id,
      players: activeRoom.players.map((p) => ({ id: p.id, name: p.name, score: p.score, isHost: p.isHost })),
      currentRound: activeRoom.currentRound,
      currentChallengeId: activeRoom.currentChallengeId,
      challenge: challengeObj,
    });
  }

  // Add to queue
  matchmakingQueue = matchmakingQueue.filter((p) => p.playerId !== playerId);
  matchmakingQueue.push({ ws: null as any, playerId, playerName: playerName || 'لاعب' });
  broadcastQueueStatus();

  res.json({
    status: 'queued',
    message: 'جاري البحث عن لاعب حقيقي أونلاين...',
    queueCount: matchmakingQueue.length,
    onlineCount: Math.max(1, wss.clients.size),
  });
});

app.post('/api/matchmaking/buzz', (req, res) => {
  const { roomId, playerId } = req.body;
  const room = rooms.get(roomId);
  if (!room || room.status !== 'playing' || room.buzzedPlayerId !== null) {
    return res.json({ success: false, buzzedPlayerId: room?.buzzedPlayerId });
  }

  room.buzzedPlayerId = playerId;
  room.status = 'round_buzzed';
  const buzzedPlayer = room.players.find((p) => p.id === playerId);

  broadcastToRoom(room, {
    type: 'player_buzzed',
    buzzedPlayerId: playerId,
    buzzedPlayerName: buzzedPlayer ? buzzedPlayer.name : 'لاعب',
    timeLimit: 12,
  });

  res.json({ success: true, buzzedPlayerId: playerId });
});

app.post('/api/matchmaking/answer', (req, res) => {
  const { roomId, playerId, isCorrect } = req.body;
  const room = rooms.get(roomId);
  if (!room) return res.status(404).json({ error: 'Room not found' });

  if (room.buzzerTimer) clearTimeout(room.buzzerTimer);
  room.status = 'round_finished';

  if (isCorrect) {
    const player = room.players.find((p) => p.id === playerId);
    if (player) player.score += 100;
    room.lastWinnerId = playerId;
  } else {
    const opponent = room.players.find((p) => p.id !== playerId);
    if (opponent) opponent.score += 50;
    room.lastWinnerId = opponent ? opponent.id : null;
  }

  broadcastToRoom(room, {
    type: 'round_result',
    isCorrect,
    lastWinnerId: room.lastWinnerId,
    players: room.players.map((p) => ({ id: p.id, name: p.name, score: p.score, isHost: p.isHost })),
  });

  res.json({
    success: true,
    lastWinnerId: room.lastWinnerId,
    players: room.players.map((p) => ({ id: p.id, name: p.name, score: p.score, isHost: p.isHost })),
  });
});

app.post('/api/matchmaking/next', (req, res) => {
  const { roomId } = req.body;
  const room = rooms.get(roomId);
  if (!room) return res.status(404).json({ error: 'Room not found' });

  room.currentRound += 1;
  room.buzzedPlayerId = null;

  if (room.currentRound >= room.totalRounds) {
    room.status = 'game_over';
    broadcastToRoom(room, {
      type: 'game_over',
      players: room.players.map((p) => ({ id: p.id, name: p.name, score: p.score, isHost: p.isHost })),
    });
    return res.json({ status: 'game_over' });
  }

  room.status = 'playing';
  room.currentChallengeId = room.challengeIds[room.currentRound] || 'salah';
  const nextChallenge = getFullPlayersList().find((p) => p.id === room.currentChallengeId) || getFullPlayersList()[0];

  broadcastToRoom(room, {
    type: 'new_round',
    currentRound: room.currentRound,
    currentChallengeId: room.currentChallengeId,
    challenge: nextChallenge,
    players: room.players.map((p) => ({ id: p.id, name: p.name, score: p.score, isHost: p.isHost })),
  });

  res.json({
    status: 'playing',
    currentRound: room.currentRound,
    challenge: nextChallenge,
  });
});

app.post('/api/matchmaking/leave', (req, res) => {
  const { playerId, roomId } = req.body;
  matchmakingQueue = matchmakingQueue.filter((p) => p.playerId !== playerId);
  if (roomId) {
    const room = rooms.get(roomId);
    if (room) {
      room.players = room.players.filter((p) => p.id !== playerId);
      if (room.players.length === 0) {
        rooms.delete(roomId);
      } else {
        broadcastToRoom(room, {
          type: 'player_left',
          message: 'غادر المنافس المباراة. تم احتساب الفوز لك! 🏆',
          winnerId: room.players[0].id,
          winnerName: room.players[0].name,
          players: room.players.map((p) => ({ id: p.id, name: p.name, score: p.score, isHost: p.isHost })),
        });
      }
    }
  }
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

  // Global CORS and security headers to prevent 403 Forbidden
  app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', '*');
    if (req.method === 'OPTIONS') {
      return res.sendStatus(200);
    }
    next();
  });

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
