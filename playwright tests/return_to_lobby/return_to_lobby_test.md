# Return to Lobby After a Game (browser)

## Purpose

The end-of-game screen: the lead takes everyone back to the lobby they played from, and
anyone else gets a confirmation before leaving for the home screen.

Pairs with `server tests/return_to_lobby/`, which covers the transition rules themselves.

## Status

Done — all checks pass.

## Prerequisites

```bash
npm run dev   # server on :3001, client on :5173
```

## Approach

Two real browsers (a context each — the client keeps its session in localStorage, so a
shared context would make the second browser resume the first one's seat), plus a socket bot
as a third player.

Ending the game is the fiddly part. A forfeit needs exactly **one** connected player, so it
cannot end a game while both browsers are still present — and both need to be present to
check what the lead and non-lead each see. So the bot joins, the game starts as a
three-player game, the bot drops out immediately (its seat is held, no forfeit), and the two
browser seats then play a real game to a winner. `driveSeat()` prefers Assassinate so this
finishes in a handful of turns rather than grinding to a Coup. The dropped bot doubles as
the subject of the pruning assertion.

## Running it

From the **repo root**:

```bash
node "playwright tests/return_to_lobby/return_to_lobby_test.cjs"
```

Exits non-zero on failure. Screenshot at
`playwright tests/return_to_lobby/return_to_lobby_screenshot.png`.

## What it asserts

**Case 1 — the lead returns everyone.** The lead sees "Back to Lobby" and the non-lead does
not; the non-lead is told who they are waiting on ("Waiting for Lead to take everyone back
to the lobby…"); the old "Back to Home" wording is gone from the lead's primary action.
After the click: both land in the **lobby**, not the home screen; it is the **same** room
code; both players are still on the roster; the bot that dropped out is pruned; and the
Start Game control is available so they can play again immediately.

**Case 2 — a non-lead leaving.** "Back to Home" opens a confirmation rather than leaving
outright, and they are still in the session while it is up. "Stay" returns them to the
result screen. Confirming sends them home, and when the lead then returns to the lobby, the
player who left is no longer on the roster.

Plus: no uncaught client errors across the run.

## Notes

Only the leaver is removed when a non-lead backs out — the rest of the lobby is untouched,
which is what makes "Back to Home" an escape hatch rather than an alternative way to end the
session for everyone.
