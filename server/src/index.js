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

// When everyone but one player has left, that player wins — but not instantly: refreshing
// the page is a disconnect immediately followed by a rejoin, and that shouldn't hand away
// the game. Wait out a short grace period and re-check before calling it.
const FORFEIT_GRACE_MS = 30000;
// The waiting player can push the deadline out if they know their opponent is coming back,
// but only up to a hard cap measured from the moment of the disconnect — long enough for a
// router reboot, short enough that an abandoned room still terminates on its own.
const FORFEIT_EXTENSION_MS = 60000;
const FORFEIT_MAX_WAIT_MS = 5 * 60 * 1000;
const forfeitTimers = new Map(); // room code -> timeout

function cancelForfeit(room) {
  const timer = forfeitTimers.get(room.code);
  if (timer) {
    clearTimeout(timer);
    forfeitTimers.delete(room.code);
  }
  room.game?.setForfeitState(null);
}

// (Re)arms the countdown and publishes the deadline, so the remaining player sees a live
// countdown rather than a stalled board. The deadline is always clamped to `capAt`.
function armForfeitTimer(room, requestedDurationMs, capAt) {
  const existing = forfeitTimers.get(room.code);
  if (existing) clearTimeout(existing);

  const deadline = Math.min(Date.now() + requestedDurationMs, capAt);
  const durationMs = Math.max(0, deadline - Date.now());
  room.game.setForfeitState(deadline, capAt);
  forfeitTimers.set(
    room.code,
    setTimeout(() => {
      forfeitTimers.delete(room.code);
      const current = roomManager.getRoom(room.code);
      // Re-check: whoever was missing may have reconnected during the grace period.
      const winnerId = current?.game?.lastPlayerStandingId();
      if (!winnerId) {
        current?.game?.setForfeitState(null);
        return;
      }
      current.game.endByForfeit(winnerId);
      broadcastGame(current);
    }, durationMs),
  );
}

// Re-evaluates whether a forfeit countdown should be running, and is safe to call from
// anywhere that could change who is left: a disconnect, a rejoin, or a game action that
// eliminates someone. Idempotent — an already-running countdown is left alone rather than
// restarted, so taking your turn doesn't reset the clock on the player you're waiting for.
function refreshForfeitTimer(room) {
  if (!room.game || !room.game.lastPlayerStandingId()) {
    cancelForfeit(room);
    return;
  }
  if (forfeitTimers.has(room.code)) return;
  // The cap is anchored here, when the countdown starts, and preserved across extensions.
  armForfeitTimer(room, FORFEIT_GRACE_MS, Date.now() + FORFEIT_MAX_WAIT_MS);
}

function extendForfeit(room) {
  const capAt = room.game.forfeitCapAt ?? Date.now() + FORFEIT_MAX_WAIT_MS;
  const remaining = Math.max(0, (room.game.forfeitDeadline ?? 0) - Date.now());
  armForfeitTimer(room, remaining + FORFEIT_EXTENSION_MS, capAt);
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
      room.game?.setConnected(playerId, true);
      // Re-evaluate rather than just cancelling: if this player is rejoining after their
      // own refresh while someone else is still away, the countdown needs to resume.
      refreshForfeitTimer(room);
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
        room.game.settleDisconnected();
        // An action can eliminate the last connected opponent, leaving the actor alone
        // against players who already left — that needs a countdown too.
        refreshForfeitTimer(room);
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

  socket.on('game:extendForfeit', (_payload, cb) => {
    try {
      const { roomCode, playerId } = socket.data;
      const room = roomManager.getRoom(roomCode);
      if (!room || !room.game) throw new Error('No active game.');
      // Only the player who stands to win by forfeit may grant more time — which also
      // means the button can only ever delay the presser's own win, never grief anyone.
      if (room.game.lastPlayerStandingId() !== playerId) {
        throw new Error('There is no reconnect timer for you to extend.');
      }
      if (!room.game.canExtendForfeit()) {
        throw new Error('The maximum reconnect wait has already been reached.');
      }
      extendForfeit(room);
      cb?.({ ok: true });
      broadcastGame(room);
    } catch (err) {
      cb?.({ ok: false, error: err.message });
    }
  });

  socket.on('disconnect', () => {
    const { roomCode, playerId } = socket.data;
    if (!roomCode || !playerId) return;
    const room = roomManager.getRoom(roomCode);
    if (!room) return;
    const player = room.players.get(playerId);
    if (!player) return;

    if (room.game) {
      player.connected = false;
      room.game.setConnected(playerId, false);
      refreshForfeitTimer(room);
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
