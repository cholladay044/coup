# Return to Lobby After a Game (server)

## Purpose

Covers `room:returnToLobby`: ending a session and putting everyone back in the lobby they
played from, with the roster reconciled so they can start again immediately.

Pairs with `playwright tests/return_to_lobby/`, which covers the end-of-game screen itself.

## Status

Done — all cases pass.

## Prerequisites

A running server (`npm run dev`). No browser needed.

## Running it

From the **repo root**:

```bash
node "server tests/return_to_lobby/return_to_lobby_test.mjs"
```

Exits non-zero on failure. Override the target with `COUP_SERVER_URL` if not on :3001.
Cases 2 and 3 wait out real forfeit countdowns, so the run takes about a minute.

## Does the lobby need to persist server-side?

**No — it already does.** The room object and its player Map live in `RoomManager` for the
whole life of the room and are never torn down when a game starts or finishes. What was
missing was a *transition*, not persistence:

- `room.game` was never cleared, so `broadcastRoom` kept sending game state and `joinRoom`
  kept rejecting newcomers with "Game already in progress".
- Nothing reconciled the roster afterwards.

So the work was: clear `room.game`, prune players who never came back, reassign the lead if
it was one of them, cancel any outstanding forfeit timer, and broadcast lobby state. On the
client this needed almost nothing — `App.jsx` already switches to the lobby screen whenever
`lobby:state` arrives, so every player follows automatically.

## What it covers

1. **The lead returns everyone, roster intact.** Four players; one leaves mid-game, the
   other three play to a real finish. Afterwards all three who are still present remain on
   the roster — *including eliminated ones*, since being knocked out is not the same as
   leaving — the player who left is pruned, and a new game can be started straight away.
2. **A non-lead is refused** while the lead is present, and the lead can still do it. A
   player who rejoined before the transition comes back to the lobby with everyone else.
3. **If the lead is gone, a remaining player may act.** Otherwise a finished game would
   strand everyone on the end screen with nobody able to move it on. Absent players are
   pruned and the lead passes to whoever is left.
4. **Refused mid-game** — the transition only applies to a finished game.

## Notes

A forfeit only fires when exactly **one** connected player remains, so it cannot be used to
end a game that still has several players present. Case 1 therefore plays a real game to
completion via `playToCompletion()`; this was a genuine bug in the first draft of this file,
where a three-player game with one leaver simply carried on and the test asserted against a
game that had never ended.

`hostId` is merged into the game-state broadcast in `broadcastGame` rather than being added
to `Game`, since it is a room concept — the end screen needs it to decide who may take
everyone back.
