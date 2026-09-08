# Drop Absent Players & Return to Lobby (server)

## Purpose

Covers `room:kickAbsentAndReturn`: letting the last connected player skip the rest of the
reconnect countdown when the others have plainly gone, rather than waiting out 30s for
opponents who are not coming back.

Pairs with `playwright tests/kick_absent/`, which covers the button itself.

## Status

Done — all cases pass.

## Prerequisites

A running server (`npm run dev`). No browser needed.

## Running it

From the **repo root**:

```bash
node "server tests/kick_absent/kick_absent_test.mjs"
```

Exits non-zero on failure. Override the target with `COUP_SERVER_URL` if not on :3001.

## What this actually fixes

The wait is **not** a missing post-win step, which is worth stating because it changes the
fix. The game has not ended at that point: the forfeit countdown only runs while
`phase === 'playing'` with exactly one connected player, via `lastPlayerStandingId()`. After
a *natural* win with someone disconnected there is no wait at all — `room:returnToLobby`
prunes absent players immediately. So what was needed was a way to *end the countdown
early*, not new end-of-game logic.

## What it covers

1. **The happy path.** Three players, two disconnect, a countdown starts. The remaining
   player calls the event and is in the lobby in ~300ms rather than 30,000ms, with the
   absent players dropped, the lead reassigned to them, and a new game startable at once.
   The win is still recorded via `endByForfeit` — it just isn't sat through.
2. **Refused when there is nobody to drop.** With everyone connected there is no countdown
   and nothing to skip.
3. **Refused when the game is still playable.** With one player gone but two still present,
   no countdown is running, and a player cannot use this to cut short a game the others are
   still playing.

## Notes

Authorization is `lastPlayerStandingId() === playerId` — the same condition that starts the
countdown. That deliberately makes the permission and the countdown inseparable: if there is
no countdown, there is nothing to skip and nobody who may skip it.
