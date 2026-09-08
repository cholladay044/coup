# Known Issues

Behaviours we have decided to live with for now, plus latent problems worth knowing about
before touching nearby code. Anything actively being fixed belongs in a commit, not here.

Fixed issues are removed from this file — the history lives in `CHANGELOG.md`.

---

## Disconnected players can be assassinated or couped with no defence

**Status:** accepted, by decision. Not a bug we intend to fix right now.

**Behaviour.** A player who is disconnected is still in the game and can still be targeted.
They get no say in what follows: the server auto-passes their block window and auto-picks
which influence they lose. Traced:

```
A's assassination of B succeeds.
B must choose an influence to give up (assassinated).
B reveals Captain (assassinated).
```

Because refreshing the page is a disconnect followed by a rejoin, a player who refreshes at
the wrong moment can come back having quietly lost an influence.

**Why it is left alone.** It is consistent with how disconnection already works everywhere
else — turns are skipped, responses are auto-passed — and the obvious alternative is worse.
Making disconnected players untargetable would let anyone dodge an assassination by pulling
their network, which is a real exploit rather than a fairness fix. The third option, pausing
the action for the reconnect window, stalls every other player for up to 30s on one absent
person.

**Not to be confused with:** targeting an *eliminated* player, which is already blocked in
both layers — the UI filters them out of the target list and the server rejects it with
`Invalid target.` See `server tests/eliminated_players/`.

---

*Nothing else outstanding. Two entries — the `ResponsePanel` elimination check and the
unused `roomCode` state in `App.jsx` — were fixed and removed from this file; see
`CHANGELOG.md`.*
