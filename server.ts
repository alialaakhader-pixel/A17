import express from 'express';
import http from 'http';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { WebSocketServer, WebSocket } from 'ws';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;
const server = http.createServer(app);

app.use(express.json());

// In-memory Room & Matchmaking Data Store
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
  currentChallengeId: string;
}

const rooms = new Map<string, GameRoom>();
const matchmakingQueue: { ws: WebSocket; playerId: string; playerName: string }[] = [];

// Helper to broadcast to all players in a room
function broadcastToRoom(room: GameRoom, data: any) {
  const message = JSON.stringify(data);
  room.players.forEach((player) => {
    if (player.ws.readyState === WebSocket.OPEN) {
      player.ws.send(message);
    }
  });
}

function cleanPlayerFromRooms(ws: WebSocket) {
  const queueIdx = matchmakingQueue.findIndex((p) => p.ws === ws);
  if (queueIdx !== -1) {
    matchmakingQueue.splice(queueIdx, 1);
  }

  rooms.forEach((room, roomId) => {
    const pIdx = room.players.findIndex((p) => p.ws === ws);
    if (pIdx !== -1) {
      const leavingPlayer = room.players[pIdx];
      room.players.splice(pIdx, 1);
      if (room.players.length === 0) {
        rooms.delete(roomId);
      } else {
        broadcastToRoom(room, {
          type: 'player_left',
          message: `غادر اللاعب ${leavingPlayer.name} الغرفة`,
          players: room.players.map((p) => ({ id: p.id, name: p.name, score: p.score, isHost: p.isHost })),
        });
      }
    }
  });
}

// WebSocket Server for Online Arena Game
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

wss.on('connection', (ws: WebSocket) => {
  ws.on('message', (raw) => {
    try {
      const data = JSON.parse(raw.toString());

      // 1. Quick Matchmaking Queue
      if (data.type === 'find_match') {
        const { playerId, playerName } = data;

        const opponent = matchmakingQueue.shift();
        if (opponent && opponent.ws.readyState === WebSocket.OPEN && opponent.playerId !== playerId) {
          const roomId = 'B11-' + Math.floor(1000 + Math.random() * 9000);
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
            currentChallengeId: 'cr7',
          };
          rooms.set(roomId, newRoom);

          broadcastToRoom(newRoom, {
            type: 'match_started',
            roomId,
            players: newRoom.players.map((p) => ({ id: p.id, name: p.name, score: p.score, isHost: p.isHost })),
            currentRound: 0,
            status: 'playing',
          });
        } else {
          matchmakingQueue.push({ ws, playerId, playerName: playerName || 'لاعب' });
          ws.send(JSON.stringify({ type: 'queued', message: 'جاري البحث عن لاعب حقيقي أونلاين...' }));
        }
      }

      // 2. Create Custom Room
      if (data.type === 'create_room') {
        const { playerId, playerName, roomId: customRoomId } = data;
        const roomId = customRoomId || 'B11-' + Math.floor(1000 + Math.random() * 9000);

        const newRoom: GameRoom = {
          id: roomId,
          players: [{ id: playerId, name: playerName || 'المضيف', score: 0, ws, isHost: true }],
          status: 'waiting',
          currentRound: 0,
          totalRounds: 5,
          buzzedPlayerId: null,
          lastWinnerId: null,
          currentChallengeId: 'cr7',
        };
        rooms.set(roomId, newRoom);

        ws.send(JSON.stringify({
          type: 'room_created',
          roomId,
          players: newRoom.players.map((p) => ({ id: p.id, name: p.name, score: p.score, isHost: p.isHost })),
        }));
      }

      // 3. Join Custom Room
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
        });
      }

      // 4. Start Online Match
      if (data.type === 'start_match') {
        const { roomId } = data;
        const room = rooms.get(roomId);
        if (room) {
          room.status = 'playing';
          room.currentRound = 0;
          room.buzzedPlayerId = null;
          broadcastToRoom(room, {
            type: 'match_started',
            roomId,
            currentRound: 0,
            players: room.players.map((p) => ({ id: p.id, name: p.name, score: p.score, isHost: p.isHost })),
          });
        }
      }

      // 5. Buzzer Press
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
          });
        }
      }

      // 6. Submit Answer
      if (data.type === 'submit_answer') {
        const { roomId, playerId, isCorrect } = data;
        const room = rooms.get(roomId);
        if (room) {
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

      // 7. Next Round
      if (data.type === 'next_round') {
        const { roomId } = data;
        const room = rooms.get(roomId);
        if (room) {
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
            broadcastToRoom(room, {
              type: 'new_round',
              currentRound: room.currentRound,
              players: room.players.map((p) => ({ id: p.id, name: p.name, score: p.score, isHost: p.isHost })),
            });
          }
        }
      }

      // 8. Live Emote / Reaction
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
      console.error('WebSocket Error:', err);
    }
  });

  ws.on('close', () => {
    cleanPlayerFromRooms(ws);
  });
});

// REST API Endpoints
app.get('/api/health', (req, res) => {
  res.json({
    status: 'online',
    timestamp: new Date().toISOString(),
    activeRooms: rooms.size,
    queuedPlayers: matchmakingQueue.length,
  });
});

app.get('/api/rooms/:roomId', (req, res) => {
  const room = rooms.get(req.params.roomId);
  if (!room) return res.status(404).json({ error: 'Room not found' });
  res.json({
    id: room.id,
    playerCount: room.players.length,
    status: room.status,
    currentRound: room.currentRound,
  });
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

    // Fallback to transform and serve index.html for any SPA route (fixes 404 in dev)
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
