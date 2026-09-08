# Leaving a Lobby & Host Succession (server)

## Purpose

Covers the `room:leave` event and the rules around it: removal from the roster, host
succession by join order, room cleanup when the last player leaves, and the different
behaviour of leaving mid-game.

Pairs with `playwright tests/lobby_leave/`, which covers the same rules through real
browsers (notably that host-only controls actually move in the UI).

## Status

Done — all cases pass.

## Prerequisites

A running server (`npm run dev`, or just the server workspace). No browser needed.

## Running it

From the **repo root**:

```bash
node "server tests/lobby_leave/lobby_leave_test.mjs"
```

Exits non-zero on failure. Override the target with `COUP_SERVER_URL` if not on :3001.

## What it covers

1. **Succession follows join order** — the Sloth → Liv → David example from the brief.
   Sloth leaves and Liv leads; Liv leaves and David leads.
2. **A non-host leaving doesn't move the lead**, and the removal is visible to *other*
   players, not just the one who left.
3. **Join order is stable.** A player who leaves and rejoins is a genuinely new player and
   goes to the back of the queue, so they can't jump ahead of someone who was already
   there.
4. **Last player out deletes the room** — the code stops resolving.
5. **Leaving mid-game keeps the seat.** Per the agreed behaviour, an explicit leave during
   a live game is treated as a disconnect: the seat is held, the player shows as
   disconnected, and they can rejoin while the session is still active.

## Design notes

**Join position is now explicit.** The room model previously relied on `Map` insertion
order, which does happen to give the right answer (Maps are insertion-ordered and `delete`
preserves the order of the rest). That was correct but implicit, and host succession depends
on it, so each player now carries a `joinIndex` assigned from a per-room counter. Succession
sorts on that field instead of trusting iteration order.

**Succession prefers a connected player.** `reassignHost` picks the earliest-joined player
who is still connected, falling back to the earliest-joined overall. In a pure lobby this
makes no difference (a lobby-phase disconnect removes the player outright), but it matters
once players return to a lobby after a game, where a disconnected player can still be on the
roster — otherwise the lobby could end up led by someone who isn't there.

**Leaving is mode-dependent**, which is why the handler branches:
- *In a lobby* — permanent. The player is dropped and the lead moves on if it was theirs.
- *Mid-game* — treated as a disconnect, so the seat is held and the existing
  forfeit/reconnect machinery applies.
- *After a game has ended* — permanent, same as a lobby.
