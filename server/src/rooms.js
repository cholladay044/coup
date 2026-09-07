import { customAlphabet, nanoid } from 'nanoid';
import { Game } from './game/Game.js';
import { MIN_PLAYERS, MAX_PLAYERS } from './game/constants.js';

const roomCode = customAlphabet('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 4);

export class RoomManager {
  constructor() {
    /** @type {Map<string, Room>} */
    this.rooms = new Map();
  }

  createRoom(hostName) {
    let code;
    do {
      code = roomCode();
    } while (this.rooms.has(code));

    const playerId = nanoid(10);
    const room = {
      code,
      hostId: playerId,
      players: new Map([[playerId, { id: playerId, name: hostName, socketId: null, connected: true }]]),
      game: null,
    };
    this.rooms.set(code, room);
    return { room, playerId };
  }

  joinRoom(code, name) {
    const room = this.rooms.get(code);
    if (!room) throw new Error('Room not found.');
    if (room.game) throw new Error('Game already in progress.');
    if (room.players.size >= MAX_PLAYERS) throw new Error('Room is full.');

    const playerId = nanoid(10);
    room.players.set(playerId, { id: playerId, name, socketId: null, connected: true });
    return { room, playerId };
  }

  rejoin(code, playerId) {
    const room = this.rooms.get(code);
    if (!room) throw new Error('Room not found.');
    const player = room.players.get(playerId);
    if (!player) throw new Error('Player not found in room.');
    player.connected = true;
    return room;
  }

  getRoom(code) {
    return this.rooms.get(code);
  }

  findRoomBySocket(socketId) {
    for (const room of this.rooms.values()) {
      for (const player of room.players.values()) {
        if (player.socketId === socketId) return { room, player };
      }
    }
    return null;
  }

  startGame(code, requesterId) {
    const room = this.rooms.get(code);
    if (!room) throw new Error('Room not found.');
    if (room.hostId !== requesterId) throw new Error('Only the host can start the game.');
    if (room.game) throw new Error('Game already started.');
    const players = [...room.players.values()];
    if (players.length < MIN_PLAYERS) throw new Error(`Need at least ${MIN_PLAYERS} players.`);
    room.game = new Game(players.map((p) => ({ id: p.id, name: p.name })));
    return room;
  }

  removePlayer(code, playerId) {
    const room = this.rooms.get(code);
    if (!room) return;
    room.players.delete(playerId);
    if (room.hostId === playerId) {
      const next = [...room.players.keys()][0];
      room.hostId = next ?? null;
    }
    if (room.players.size === 0) {
      this.rooms.delete(code);
    }
  }

  maybeCleanupEmptyRoom(code) {
    const room = this.rooms.get(code);
    if (room && room.players.size === 0) this.rooms.delete(code);
  }
}
