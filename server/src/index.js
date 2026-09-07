import express from 'express';
import http from 'node:http';
import cors from 'cors';
import { Server } from 'socket.io';
import { RoomManager } from './rooms.js';

const PORT = process.env.PORT || 3001;
// In dev, Vite may pick a different port if 5173 is busy (5174, 5175, ...).
// Allow any localhost/127.0.0.1 origin unless CLIENT_ORIGIN is explicitly set (e.g. in production).
const LOCALHOST_ORIGIN = /^https?:\/\/(localhost|127\.0\.0\.1):\d+$/;
const corsOrigin = process.env.CLIENT_ORIGIN || LOCALHOST_ORIGIN;

const app = express();
app.use(cors({ origin: corsOrigin }));
app.get('/health', (_req, res) => res.json({ ok: true }));

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: corsOrigin },
});

const roomManager = new RoomManager();

function lobbyView(room) {
  return {
    code: room.code,
    hostId: room.hostId,
    started: !!room.game,
    players: [...room.players.values()].map((p) => ({
      id: p.id,
      name: p.name,
      connected: p.connected,
    })),
  };
}

function broadcastLobby(room) {
  for (const player of room.players.values()) {
    if (player.socketId) {
      io.to(player.socketId).emit('lobby:state', lobbyView(room));
    }
  }
}

function broadcastGame(room) {
  if (!room.game) return;
  for (const player of room.players.values()) {
    if (player.socketId) {
      io.to(player.socketId).emit('game:state', room.game.getPublicState(player.id));
    }
  }
}

function broadcastRoom(room) {
  if (room.game) broadcastGame(room);
  else broadcastLobby(room);
}

io.on('connection', (socket) => {
  socket.on('room:create', ({ name }, cb) => {
    try {
      const cleanName = String(name || '').trim().slice(0, 20) || 'Player';
      const { room, playerId } = roomManager.createRoom(cleanName);
      room.players.get(playerId).socketId = socket.id;
      socket.data.roomCode = room.code;
      socket.data.playerId = playerId;
      socket.join(room.code);
      cb({ ok: true, roomCode: room.code, playerId });
      broadcastLobby(room);
    } catch (err) {
      cb({ ok: false, error: err.message });
    }
  });

  socket.on('room:join', ({ code, name }, cb) => {
    try {
      const cleanCode = String(code || '').trim().toUpperCase();
      const cleanName = String(name || '').trim().slice(0, 20) || 'Player';
      const { room, playerId } = roomManager.joinRoom(cleanCode, cleanName);
      room.players.get(playerId).socketId = socket.id;
      socket.data.roomCode = room.code;
      socket.data.playerId = playerId;
      socket.join(room.code);
      cb({ ok: true, roomCode: room.code, playerId });
      broadcastLobby(room);
    } catch (err) {
      cb({ ok: false, error: err.message });
    }
  });

  socket.on('room:rejoin', ({ code, playerId }, cb) => {
    try {
      const cleanCode = String(code || '').trim().toUpperCase();
      const room = roomManager.rejoin(cleanCode, playerId);
      room.players.get(playerId).socketId = socket.id;
      socket.data.roomCode = room.code;
      socket.data.playerId = playerId;
      socket.join(room.code);
      cb({ ok: true, roomCode: room.code, playerId });
      broadcastRoom(room);
    } catch (err) {
      cb({ ok: false, error: err.message });
    }
  });

  socket.on('room:start', (_payload, cb) => {
    try {
      const { roomCode, playerId } = socket.data;
      const room = roomManager.startGame(roomCode, playerId);
      cb({ ok: true });
      broadcastGame(room);
    } catch (err) {
      cb({ ok: false, error: err.message });
    }
  });

  function withGame(handler) {
    return (payload, cb) => {
      try {
        const { roomCode, playerId } = socket.data;
        const room = roomManager.getRoom(roomCode);
        if (!room || !room.game) throw new Error('No active game.');
        handler(room, playerId, payload || {});
        cb?.({ ok: true });
        broadcastGame(room);
      } catch (err) {
        cb?.({ ok: false, error: err.message });
      }
    };
  }

  socket.on(
    'game:action',
    withGame((room, playerId, { type, targetId }) => room.game.declareAction(playerId, { type, targetId })),
  );
  socket.on(
    'game:pass',
    withGame((room, playerId) => room.game.pass(playerId)),
  );
  socket.on(
    'game:challenge',
    withGame((room, playerId) => room.game.challenge(playerId)),
  );
  socket.on(
    'game:block',
    withGame((room, playerId, { character }) => room.game.block(playerId, character)),
  );
  socket.on(
    'game:chooseLoss',
    withGame((room, playerId, { cardId }) => room.game.chooseLoss(playerId, cardId)),
  );
  socket.on(
    'game:exchangeSelect',
    withGame((room, playerId, { keepCardIds }) => room.game.exchangeSelect(playerId, keepCardIds)),
  );

  socket.on('disconnect', () => {
    const { roomCode, playerId } = socket.data;
    if (!roomCode || !playerId) return;
    const room = roomManager.getRoom(roomCode);
    if (!room) return;
    const player = room.players.get(playerId);
    if (!player) return;

    if (room.game) {
      player.connected = false;
      broadcastGame(room);
    } else {
      roomManager.removePlayer(roomCode, playerId);
      if (room.players.size > 0) broadcastLobby(room);
    }
  });
});

server.listen(PORT, () => {
  console.log(`Coup server listening on http://localhost:${PORT}`);
});
