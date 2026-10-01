# Handoff: design-language overhaul

Branch: `wip/design-language-overhaul` (rebased on main v1.15.0). Read `docs/design-language.md` and `docs/design-language-handoff.md` before touching UI.

## Git state

- Remote tip is `ebf82c8`. Two local commits are not pushed: `f3e0400` (audit fixes) and `26047e0` (focus ring, back-to-top, button icons).
- Everything listed under "Uncommitted work" below is in the working tree only. `.worktrees/` is untracked on purpose; leave it out.
- Last full run on the working tree: typecheck, lint, format:check and `npm run test -- --run` all pass (247 files, 4,134 tests). The tests were not re-run after the final `scan.lastPlayed` translation restore (format check was).

## Uncommitted work (this session)

- **Library collections**
  - Collection tiles on the Library Collections view are now `outline` buttons, in a 2-column grid: Favorites, Recent, Top Played, Liked, Play Later, Disliked (`LibraryCollectionList.tsx`).
  - New pages `/library/recent` and `/library/top` (`library.recent.tsx`, `library.top.tsx`) share `LibraryHistoryCollection.tsx`. Recent uses `media.history` (distinct media, cursor paging, local dedupe below Core 2.17). Top uses the new `CoreAPI.mediaHistoryTop` (`media.history.top`, no paging). Both are gated on the `mediaRecents` feature (Core 2.12.0+).
  - Rows show a muted detail line under the system name: last-played date/time (Recent) or total play time such as "2h 15m" (Top), with no prefix. `LibraryBrowseList` takes an optional `entryDetail` prop. Top rows drop tags so the row fits.
  - Row height for rows showing a system name is 96px (was 104px), and every collection page pulls the list up with `-mt-4` so the first item sits at the standard page inset. Applies to Favorites, Liked, Play Later, Disliked, Recent and Top Played.
  - New translation keys (`recentlyPlayed`, `recentlyPlayedShort`, `topPlayed`, and their list/loading/error/empty/hint variants) are in all 9 locale files. The tile label is "Recent" (`recentlyPlayedShort`); the page title is "Recently Played".
  - New tests: `src/__tests__/unit/routes/library.history.test.tsx`; `library.index.test.tsx` updated for the extra tiles.
  - `routeTree.gen.ts` was regenerated for the two routes.
- **Header:** `.page-header-shell` side padding on phones is 12px (was 4px), so the back button's visible edge and a no-back title sit on the 16px content margin (`components.css`). The desktop floating header is unchanged.
- **Selects:** new `src/components/wui/Select.tsx` (native select with `appearance-none` and a drawn chevron 12px from the right). All selects use it: Language & Region (2), Advanced (2), Online backup schedule, media scraper, library systems filter modal (2), and `SimpleSystemSelect`. They are now all full width.
- **Action rail (`ModalActionRail`, game detail modals):**
  - Captions are single-line sentence case, 13px semibold, 12px side padding. Columns are `minmax(max-content,1fr)`, so buttons fit their caption and the rail scrolls with its chevrons. The `itemWidth` prop is removed (deck page caller updated).
  - Toggled-on Favourite / Like / Dislike / Play Later buttons use the accent colour on icon and caption with no background change, with a 150ms colour fade (`MediaPreferenceActions.tsx`, `FavoriteButton.tsx`). It is scoped to those buttons, not a global rule.
- **Translation fix:** `scan.lastPlayed` ("Last played: {{media}}", en-US only) was accidentally deleted and then restored. Other locales have never had it and fall back to English.

## Not verified

- Only the action rail was rendered in a browser (a temporary copy with the real `ModalActionRail` and `Button`, 390px, light and dark, en-GB captions; since deleted). Not verified: German and other long-label languages, the real modal, and anything against a connected Core.
- Unchecked visually: header margin change, `Select` chevron in every place it is used, collection list rows (96px height, `-mt-4`, the new date/time and play-time lines), the earlier tab-bar chevrons/fade, modal `BackToTop` gap, and `SlideModal` inset.
- Top Played only shows the total play time; Core also returns session count, unused.

## Things to know

- A bottom-nav change was made and reverted this session: "action bar" means the action rail in the game detail modals, not the bottom nav. The bottom nav is untouched.
- Working style the product owner expects: on visual work, ask first when the right answer is not clear and discuss one question at a time in plain text; check the rendered result before reporting done; do not make speculative changes. Plain-text questions, not the ask-tool.
- Shell is fish: avoid multi-file `sed` with shell variables. `git stash` is off limits. Do not run `npx tsr` (it runs an unrelated dead-code tool); route files regenerate through the Vite/TanStack plugin.
- Left as-is on purpose: page-level `ModalActionRail` on the deck detail page (owner's call), Warp "Manage" button without an external icon, status displays using raw `Loader2`, the eraser on ZapScript Clear, transport icons in lucide, bottom-nav and settings-tile lucide icons.
- Other Core methods the app does not use: `media.history.latest`, `media.lookup.candidates`, `media.title.parse`, `media.meta.update`, `media.asset`. Owner decided to stick with only Recent and Top Played for now.
