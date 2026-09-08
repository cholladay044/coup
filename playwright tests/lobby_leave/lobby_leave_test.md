# Leaving a Lobby & Host Succession (browser)

## Purpose

The client half of the leave/succession rules: that other players' rosters update
immediately, and that when the lead leaves, **host-only controls actually move** to the next
player — the start-game button in particular.

Pairs with `server tests/lobby_leave/`, which covers the server rules (join order, room
cleanup, mid-game leave semantics) without a browser.

## Status

Done — all checks pass.

## Prerequisites

```bash
npm run dev   # server on :3001, client on :5173
```

## Approach

Three real browsers, one per player, each in its own context — the client stores its session
in localStorage, so sharing a context would make the second "player" resume the first one's
seat rather than joining as someone new.

## Running it

From the **repo root**:

```bash
node "playwright tests/lobby_leave/lobby_leave_test.cjs"
```

Exits non-zero on failure. Screenshot at
`playwright tests/lobby_leave/lobby_leave_screenshot.png`.

## What it asserts

**Case 1 — lead leaves.** Before: Sloth (lead) has the start control, Liv doesn't and sees
the waiting message, all three are listed. Sloth clicks Leave Lobby → Sloth lands on the
home screen, Liv's roster drops Sloth without a refresh, and Liv gains both the Host badge
and the start control while David still has neither.

**Case 2 — lead leaves again.** David inherits the badge and the start control, is the only
one left, and the button correctly reads "Need at least 2 players" in its disabled state.

**Case 3 — last player leaves.** David returns home, and a fresh visitor trying the old room
code is refused with "Room not found." and stays on the home screen.

Plus: no uncaught client errors across the run.

## Notes

No client changes were needed for succession itself — `Lobby.jsx` already derives host-only
UI from `lobby.hostId === playerId`, so it follows the server automatically once the new
lobby state is broadcast. The only client additions were the Leave Lobby button and its
handler.

The roster assertions read concatenated row text (e.g. `"LivHostYou"`), since the badges are
sibling spans inside the list item — hence the substring checks rather than exact matches.
