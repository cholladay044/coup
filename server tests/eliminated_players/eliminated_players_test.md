# Eliminated Players Don't Block the Turn

## Purpose

An eliminated player (both influence cards revealed) must never be something the game waits
on. This covers the three cases where that could happen: elimination during their own turn,
elimination while an action is directed at them, and the turn pointer landing on them.

Unlike the suites under `playwright tests/`, this needs no browser — it drives the `Game`
class directly, which is the only practical way to set up these states deterministically
(hands are dealt randomly, so you cannot reliably reach "target has exactly one influence and
the assassin really holds Assassin" by playing a live game).

## Status

Done — all cases pass. Found and fixed one real stall; see **Findings**.

## Prerequisites

None beyond Node. No server or client needs to be running.

## Running it

From the **repo root**:

```bash
node "server tests/eliminated_players/eliminated_players_test.mjs"
```

Exits non-zero if any check fails, so it is CI-friendly.

## What it covers

1. **Target eliminated mid-action.** A assassinates B (one influence left); B challenges, A
   really holds Assassin, so B loses their last card. The block window must not then open on
   B. Asserts no pending action or loss is left open and the turn moves to a living player.
2. **Player eliminated on their own turn.** A bluffs Tax with one influence left and is
   challenged. Asserts the turn advances off A to a living player.
3. **Turn pointer skips the dead.** Runs six turns with a dead player in the middle of the
   order and asserts they never come up.
4. **Targeting the dead is rejected.** A coup declared against an eliminated player throws.

## Findings

**Real bug found and fixed:** `_eligibleBlockers()` returned `[targetId]` for
assassinate/steal without checking whether the target was still alive. Because a target can
be eliminated *after* the action is declared (they challenge the assassin and lose their last
influence), the block window would open on a dead player and the game would hang forever —
the same class of permanent stall as the disconnect bugs fixed in v1.2.0.

Verified the test actually catches it: with the fix reverted, case 1 fails with
`stuck in phase "block-window"`.

Also hardened `_resolveActionEffect()`, which applied steal/assassinate/coup to the target
without re-checking elimination. A targeted action that outlives its target now fizzles with
a log line instead of acting on a dead player.

The rest of the elimination handling was already correct: `_advanceTurnIndex` skips
eliminated players, `_checkGameOver` fires at ≤1 active, `_eligibleChallengers` filters to
active players, `_initiateLoss` no-ops when there is nothing left to reveal, and
`declareAction` already rejected eliminated targets.
