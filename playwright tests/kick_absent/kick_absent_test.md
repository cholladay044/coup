# Drop Absent Players & Return to Lobby (browser)

## Purpose

The "Drop them & return to lobby" button on the reconnect countdown banner: when the other
players have plainly gone, the one player left should not have to sit out the full 30s
countdown before they can play again.

Pairs with `server tests/kick_absent/`, which covers the rule and its authorization without
a browser.

## Status

Done — all checks pass.

## Prerequisites

```bash
npm run dev   # server on :3001, client on :5173
```

## Approach

One real browser as the lead, plus two Socket.io bots. The game starts as a three-player
game and both bots disconnect, which leaves exactly one connected player — the condition
that starts the forfeit countdown.

## Running it

From the **repo root**:

```bash
node "playwright tests/kick_absent/kick_absent_test.cjs"
```

Exits non-zero on failure. Screenshot at
`playwright tests/kick_absent/kick_absent_screenshot.png`.

## What it asserts

**Case 1 — the banner offers both choices.** The countdown banner appears with *both*
"Give them more time" and the new drop button, which are deliberate opposites: *they are
coming back* versus *they are not*. The label pluralises correctly ("Drop them all &
return to lobby" for two absentees). The game is still mid-play at this point — no winner
has been declared yet, which is the wait being complained about.

**Case 2 — clicking it returns to the lobby at once.** Measured against the 30s countdown:
the run asserts it completes in under 5s and it typically lands in well under 100ms. Then:
it is the same room code, the absent players are dropped from the roster, the lead can
start another game, and no stale win modal is left on screen.

Plus: no uncaught client errors.

## Notes

The wait this removes is **not** a missing post-win step. The game has not ended at that
point — the forfeit countdown only runs while `phase === 'playing'` with exactly one
connected player. After a *natural* win with someone disconnected there is no wait at all,
because `room:returnToLobby` prunes absent players immediately; that path is covered by
`server tests/return_to_lobby/`.
