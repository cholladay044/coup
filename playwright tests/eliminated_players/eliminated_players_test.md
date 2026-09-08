# Eliminated Players Don't Block the Turn (browser)

## Purpose

End-to-end cover for the rule that an eliminated player must never be something the game
waits on. This drives the full stack — real browser, real client, real Socket.io server —
and complements `server tests/eliminated_players/`, which covers the same rule
deterministically against the `Game` class.

The split exists because hands are dealt randomly: you cannot reliably *arrange* the exact
"target has one influence left and the assassin genuinely holds Assassin" situation through
a live game. So the unit test proves the specific case, and this suite plays whole games to
prove the property holds under real play, including the client rendering.

## Status

Done — passes. Verified it actually catches the bug (see **Findings**).

## Prerequisites

Same as the other Playwright suites, plus a running dev stack:

```bash
npm run dev   # server on :3001, client on :5173
```

## Approach

One browser seat plus two Socket.io bots, playing `ROUNDS` (default 4) complete games.

- **Bots play to cause eliminations.** They assassinate/coup whenever they can afford it,
  always target whoever is *closest to elimination*, and challenge every claim. That
  combination reliably produces the dangerous case: the target of an assassination
  challenges it and loses their last influence mid-action.
- **The browser seat plays a deliberately simple policy** so every choice is reachable via
  real UI controls: Income, Coup + target pick when forced at 10 coins, Allow on responses,
  first option in the loss/exchange modals.
- **Nobody ever answers for an eliminated seat.** This matters — see Findings.
- A watchdog fails the run if the game makes no progress for 10s.

Each round uses a fresh browser context, because the client stores a session in
localStorage and would otherwise auto-rejoin the previous room.

## Running it

From the **repo root**:

```bash
node "playwright tests/eliminated_players/eliminated_players_test.cjs"
```

Exits non-zero on failure. Final-round screenshot is written to
`playwright tests/eliminated_players/eliminated_players_screenshot.png`.

## What it asserts

Per round:
- The game reaches a winner without stalling.
- The game never lists an **eliminated player as an eligible responder** (the direct
  statement of the rule — without this, a stall only surfaces as a timeout).
- The turn pointer never rests on an eliminated player.
- The winner modal renders.
- No "Current Turn" badge on an eliminated seat, and eliminated seats carry the eliminated
  styling — i.e. the client agrees with the server about who is out.

Plus: no uncaught client errors across the run. The run also reports whether the
target-died-mid-action ("fizzles") path came up, since that depends on the deal.

## Findings

**The first version of this suite passed even with the bug reinstated** — worth recording,
because it was a flaw in the test rather than evidence of correctness. The driver was
answering on behalf of eliminated bots, so the block window opened on a dead player and was
then immediately cleared by a response that a real knocked-out player would never send.

Two changes fixed it, and both reflect reality better:
1. The driver now refuses to act for an eliminated seat.
2. An explicit assertion that `eligibleResponderIds` never contains an eliminated player,
   so the failure is reported precisely instead of as an opaque timeout.

With those in place, reverting `_eligibleBlockers()` to its old behaviour fails the run on
round 1 with:

```
STALL in round 1: no progress for 10000ms. phase=block-window pendingLoss=none current=BotB
```

which is exactly the hang the fix removes.

**Note for future work:** the client currently offers Challenge/Allow buttons to an
eliminated player if the server lists them as eligible. The server no longer does, so this
is unreachable today, but `ResponsePanel` does not itself check elimination — worth
hardening if that logic is ever touched.
