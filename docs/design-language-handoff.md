# Design-language work handoff

## Parked state

Work lives on `wip/design-language-overhaul`, rebased onto `main` at v1.15.0 (`cf5875c`), not ready for release. Main's media preferences, Collections/decks, signed-out Online settings and pairing rate-limit UI are ported to the new design language: Now Playing preferences and details live in `NowPlayingCard`, and deck/collection surfaces use the shared tokens, `disabledAppearance`, and `ModalActionBar`. Earlier checkpoints: `4555664` and `06d00d0`. This document accompanies the next preservation commit. Resume page-by-page refinement; do not start the deferred customizable Zap Hub without a new request.

Canonical visual reference: `../zaparoo.com/docs/DESIGN_LANGUAGE.md`; media/component references: `../zaparoo-online`. App contracts live in `docs/design-language.md` and `docs/capacitor.md`.

## Preserved work

- Shared tactile materials, light/dark/system themes, contained artwork, stable Now Playing transports, compact Home header, unified device discovery and History.
- Inline playlist queue with plain position metadata, selectable items, and stable transport positions. Live-device iteration remains parked while the MiSTer is busy.
- Search/selectors, modal gutters, compact accessible tabs, Recent Searches, Create, Commands, Mappings, and NFC Utilities refinements.
- Shared `ReaderActivityControl` replaces `ScanSpinner` and `WriteModal`. All NFC scan/read/write surfaces, including Zap's Tap a tag, share waiting, re-tap, error, cancellation, and reserved status-space behavior. Queue/deep-link writes have a global fallback strip.
- Waiting: latched face, solid expanding blue edge pulse, static NFC icon. Re-tap: amber double pulse. Error: static red halo around a latched Retry, with Cancel (the code latches Retry; the doc now says so). Reduced motion: static edge. Cancellation copy: “Press again to cancel.”
- Settings' Unlock Zaparoo Pro now uses `intent="pro"`. Gold action styling means premium upgrade or paid support, like Patreon—not ordinary emphasis.

## Latest validation

After rebasing onto v1.15.0 and porting main's UI:

- `npm run typecheck`: passed.
- `npm run lint`: passed.
- `npm run format:check`: passed.
- `npm run test -- --run`: 247 files, 4,172 tests passed.
- `npm run build:web` and `npm run build:core`: passed.

Native NFC, camera, re-tap, cancellation, and system UI were not verified on hardware. No release, native sync, or deployment performed.

Latest Zap reader screenshot used a browser-only simulated DOM waiting state, not a real NFC session. It verifies appearance only. Settings' final gold-button change has automated checks but no fresh browser inspection.

## Resume here

1. Continue Settings page review, then remaining pages with user guidance. Latest requested item—gold Unlock Zaparoo Pro—is done.
2. Review reader states in light/dark, narrow/desktop, and enlarged-text layouts. Confirm pulse clearance, reserved status space, cancellation, and reduced motion.
3. Verify NFC read/write, blank-tag re-tap, Retry/Cancel, queued/deep-link writes, and camera flows on Android/iOS hardware before shipping.
4. Resume live playlist checks only when the test device is available; do not interrupt active use.
5. Rerun full checks and relevant builds before PR/release. Preserve `/app/` behavior and legacy browser targets.
6. `docs/design-language.md` was reconciled with source (tokens instead of `bd-*`/`*-pattern`, 20px page titles, 64px bottom dock, Home `ScanActions`, `TabBar`, reader error latch, approved edge-pulse animation). Keep it in step with source; where they differ, source and the latest approved interaction win.
7. Remaining legacy utilities (`bg-button-pattern`, `bg-card-pattern`, `bg-wui-card`, `border-bd-*`) are still defined in `src/index.css` only until their last call sites migrate; remove them then.

## Local-only evidence

Screenshots and agent artifacts are intentionally ignored and are not included in the source commit or push. They remain on this machine:

- `.playwright-screenshots/zap-tap-tag-shared-reader-mobile.png`
- `.playwright-screenshots/reader-activity-edge-pulse-mobile.png` (before final radius adjustment)
- Other page-review captures under `.playwright-screenshots/`.
- `.pi/plans/current.md`: historical plan; this handoff supersedes its outdated uncommitted/unpublished status and stop instructions.
- `.pi/artifacts/theme-split/hub-checkpoint.tar.gz`: deferred Hub prototype archive, if still present. Not required to resume current page refinement; do not restore it into production scope automatically.

Use `playwright-cli` for browser review. Port 5173 belongs to Joey; temporary app review used 4174. Expected local Core WebSocket failures are not evidence of a UI regression. Temporary review browser was closed and its npm server process was stopped; verify port ownership before starting another server.
