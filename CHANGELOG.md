# Changelog

All notable changes to this project are documented here. Each version tag marks the exact
commit that was deployed to production (Render for the server, Vercel for the client) — so
"what's live" is always traceable to a tag and a dated entry below.

Format loosely follows [Keep a Changelog](https://keepachangelog.com/), and versioning follows
[Semantic Versioning](https://semver.org/).

## [Unreleased]

Committed to `master` but **not yet deployed** to production.

## [1.2.0] - 2026-09-07

Deployed to Render (`coup-server`) and Vercel (`coup`, alias `coup-canopy.vercel.app`).
First release to include server-side changes.

### Added
- Games now resolve when players leave instead of stalling. If everyone but one player has
  disconnected, that player wins by default after a grace period, and the remaining player
  sees a live countdown banner naming who they're waiting on.
- "Give them more time" button on that banner, adding 60s per press for a player known to be
  reconnecting. Capped at 5 minutes total from the disconnect so an abandoned room still
  terminates; the button disables at the cap and the server independently rejects extending
  past it. Only the player who would win can extend, so it can only delay their own win.
- Disconnects and reconnects are now reported in the activity log as they happen, styled as
  neutral system notices (⚠ / ↩) distinct from the gameplay colours.
- Tab title changes to "Your turn! — Coup" whenever the game is waiting on you specifically —
  your turn, an unanswered challenge/block window, choosing a card to lose, or an exchange.
- Icons alongside the colour-coded log entries (▶ turn, ⚔ challenge, ✕ bluff caught,
  ✓ claim genuine) so the log is scannable without relying on colour alone.
- Playwright regression suites for min (2), mid (4) and max (6) player counts, each with its
  own directory, notes and screenshots under `playwright tests/`.

### Changed
- Narrow screens (≤980px) now put the activity log above the board and the action panel
  below the player's own cards, so the controls sit within thumb reach; the log is capped at
  160px with its own scrollbar and centred at up to 480px wide instead of stretching.

### Fixed
- A disconnected player could stall a game indefinitely: the server never propagated
  connection state into the running `Game`, so the "Disconnected" badge was inaccurate
  mid-game and nothing ever resolved around an absent player. Pending challenge/block
  windows, card-loss choices and exchanges belonging to a disconnected player are now
  auto-resolved, and their turns are skipped.
- Refreshing as the last remaining player permanently cancelled the forfeit countdown,
  leaving a game that could never end. Whether a countdown should run is now re-evaluated on
  disconnect, on rejoin, and after game actions.
- Eliminating the last *connected* opponent while another player was already disconnected hit
  the same permanent stall, and now starts a countdown.
- Page title was the Vite placeholder "client".

## [1.1.0] - 2026-09-07

Deployed to Render (`coup-server`) and Vercel (`coup`, alias `coup-canopy.vercel.app`).

### Added
- In-game "How to Play" rules modal — a "?" button (bottom-right) opens a scrollable overlay
  covering the objective, actions, and character abilities, sourced from the same data the
  action panel uses.
- Playwright-based max-players formatting test suite (`playwright tests/max_players_test.md`,
  `.cjs`) — drives a real browser player plus 5 Socket.io bot players to fill a 6-player room
  and screenshot the board.

### Changed
- Brightened the Assassin character's card color; it previously blended into the table felt.
- "X's turn." activity log entries now render as a highlighted callout instead of plain text.
- Activity log is capped at a shorter 160px (scrollable) on narrow screens instead of the full
  420px, which used to dominate the page.

### Fixed
- Background gradient no longer clips to one viewport height. `html`/`body`/`#root` used a fixed
  `height: 100%` while `.screen` can grow taller (e.g. 6-player games), so the gradient stopped
  short and left a visible seam/shade change partway down the page.

## [1.0.0] - 2026-09-06

Initial public release. Deployed to Render (`coup-server`) and Vercel (`coup`).

### Added
- Full Coup game: room creation/joining, lobby, all 5 characters and 7 actions, challenges,
  blocks, influence loss, elimination, and win detection.
- Reconnection support: refreshing the page rejoins an in-progress game via a session stored in
  localStorage.
- Deployment config: Render web service via `render.yaml`; Vercel static client build; CORS
  wired between the two via `CLIENT_ORIGIN`.
- Hover-preview and bluff indicators on the action panel — hovering (or declaring) an action
  glows the matching character card, and actions you can't legitimately back are flagged.

### Fixed
- Vite build dependencies were in `devDependencies`, which Vercel's install step was skipping —
  moved `vite`/`@vitejs/plugin-react` into `dependencies`.
- Player name/"(you)" tag overlapping the cards below it when a card is in its "claimed" glow
  state.

[Unreleased]: https://github.com/cholladay044/coup/compare/v1.2.0...HEAD
[1.2.0]: https://github.com/cholladay044/coup/compare/v1.1.0...v1.2.0
[1.1.0]: https://github.com/cholladay044/coup/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/cholladay044/coup/releases/tag/v1.0.0
