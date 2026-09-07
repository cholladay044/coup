# Coup Online

A web-based implementation of the card game **Coup**, following the standard 15-card ruleset (Duke, Assassin, Captain, Ambassador, Contessa).

## Stack

- **Server**: Node.js, Express, Socket.io — authoritative game state, hides opponents' cards from each client.
- **Client**: React (Vite), Socket.io-client — room-code based online multiplayer (2-6 players).

## Project layout

```
coup/
  server/   Express + Socket.io backend, all game rules in src/game/Game.js
  client/   React frontend (Vite)
```

## Running locally

Install dependencies once from the repo root (uses npm workspaces):

```bash
npm install
```

Start both the server (port 3001) and client (port 5173) together:

```bash
npm run dev
```

Or run them separately:

```bash
npm run dev:server
npm run dev:client
```

Open `http://localhost:5173` in multiple browser tabs/devices to play. One player creates a room and shares the 4-letter code; others join with it. The host starts the game once at least 2 players have joined.

## Rules implemented

- Income, Foreign Aid, Coup, Tax (Duke), Assassinate (Assassin), Steal (Captain), Exchange (Ambassador)
- Challenges on any claimed character, including blocks
- Forced coup at 10+ coins
- Elimination when both influence cards are revealed; last player standing wins
- Reconnection: refreshing the page rejoins your seat in an in-progress game (session is stored in your browser's local storage)

## Notes

Game state lives in server memory only — restarting the server clears all rooms. There's no persistence/database, matching the scope of a casual party game.
