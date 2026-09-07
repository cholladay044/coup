# Changelog

All notable changes to this project are documented here. Each version tag marks the exact
commit that was deployed to production (Render for the server, Vercel for the client) — so
"what's live" is always traceable to a tag and a dated entry below.

Format loosely follows [Keep a Changelog](https://keepachangelog.com/), and versioning follows
[Semantic Versioning](https://semver.org/).

## [Unreleased]

Committed to `master` but **not yet deployed** to production.

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

[Unreleased]: https://github.com/cholladay044/coup/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/cholladay044/coup/releases/tag/v1.0.0
