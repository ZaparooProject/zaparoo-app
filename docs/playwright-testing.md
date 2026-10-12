# Playwright Testing Guide

Guide for using `playwright-cli` to do LLM-driven exploratory testing of the Zaparoo App against a live device.

## Setup

### Prerequisites

- Dev server running: `npm run dev` (serves on `http://localhost:8100`)
- A Zaparoo Core device accessible on the network (e.g. `10.0.0.107`)

### Opening a Browser Session

```bash
playwright-cli open http://localhost:8100
```

This opens a headless Chromium browser. The app will load in a disconnected state showing the welcome tour.

### Connecting to a Device

The app keeps saved devices in a device registry stored through Capacitor Preferences (key `deviceRegistryV2`; on web, Preferences is backed by `localStorage`). There are two approaches:

**Option A: Through the UI (recommended for first-time setup)**

1. Skip the welcome tour: click the "Skip Tour" button
2. Navigate to Settings (bottom dock on phone widths, sidebar or menu drawer on wider ones)
3. Open device selection with "Connect" (no selected device) or "Change device"
4. Choose "Add device manually", fill the "Device address" textbox with the device IP (e.g. `10.0.0.107`), then click "Connect"
5. Wait for the summary to show "Connected", then take a snapshot

**Option B: Inject the legacy address key (fresh profiles only)**

```bash
playwright-cli localstorage-set deviceAddress "10.0.0.107"
playwright-cli reload
```

`deviceAddress` is the legacy key. It is only imported when no device registry has been saved yet, so this works in a fresh browser profile and is ignored once any device exists; use Option A after that. After reload, the app will auto-connect. You'll need to skip the welcome tour again since `tourCompleted` resets on reload.

### Verifying Connection

After connecting, confirm by checking the snapshot for:

- Status bar no longer showing "Connecting..."
- Device status shows "Connected": the device pill in the Zap header on phone widths, the device block at the bottom of the sidebar or drawer on wider ones, and the device summary on Settings
- "Now playing" and "Readers" on the Zap page show real data
- Create page options are no longer disabled

## Navigation

### Critical: Use Client-Side Navigation

**Always use link clicks or `go-back` to navigate.** Never use `playwright-cli goto` to change routes within the app — it causes a full page reload which:

- Tears down the WebSocket connection (must reconnect)
- Resets the welcome tour state (must dismiss again)
- Clears any in-memory app state

```bash
# GOOD: client-side navigation
playwright-cli click <nav-link-ref>
playwright-cli go-back

# BAD: causes full page reload
playwright-cli goto http://localhost:8100/settings
```

The only time `goto` is appropriate is for the initial page load or if you intentionally want to test a fresh page load.

### App Routes

| Route                       | Page              | Notes                                                    |
| --------------------------- | ----------------- | -------------------------------------------------------- |
| `/`                         | Zap (home)        | Scan actions, now playing, readers, cover rows           |
| `/zap/scan-history`         | Scan history      | Scanned tokens with copy and replay                      |
| `/zap/play-history`         | Play history      | Chronological play sessions (needs a recent Core)        |
| `/library`                  | Library           | Systems and Collections tabs                             |
| `/library/$system`          | System browse     | Folder browsing, letter jump, media details              |
| `/library/search`           | Search games      | Query and system/tag filters, results list               |
| `/library/favorites`        | Favorites         | Also `/library/liked`, `/play-later`, `/disliked`        |
| `/library/recent`           | Recently Played   | Also `/library/top` (Top Played)                         |
| `/library/decks/$deckId`    | Deck              | Deck items; `/library/decks/new` and `…/add` are editors |
| `/create`                   | Create            | Links to the Create tools                                |
| `/create/search`            | Search for media  | Search box, system/tag filters, write-focused details    |
| `/create/custom`            | Custom ZapScript  | Text editor with command palette                         |
| `/create/mappings`          | Mappings          | Mapping list; `/new` and `/edit/$id` open the editor     |
| `/create/decks/new`         | New deck          | Shared deck editor                                       |
| `/create/nfc`               | NFC utilities     | Native only                                              |
| `/settings`                 | Settings          | Device summary/selection, media database, section tiles  |
| `/settings/devices`         | Manage devices    | Saved devices, discovery, manual entry; `/$recordId`     |
| `/settings/readers`         | Readers           | Device readers, scan mode, in-app reader options         |
| `/settings/play-controls`   | Play Controls     | Playtime limits, launch guard, profiles                  |
| `/settings/media`           | Manage Media      | Database update and metadata scraper controls            |
| `/settings/language-region` | Language & Region | App language and region preferences                      |
| `/settings/accessibility`   | Accessibility     | Appearance, text size, screen reader-friendly lists      |
| `/settings/online`          | Zaparoo Online    | Login form, linked device and Online features            |
| `/settings/advanced`        | Advanced          | Debug logging, error reporting, view logs                |
| `/settings/logs`            | Logs              | Filterable log viewer                                    |
| `/settings/help`            | Help              | Documentation and community links                        |
| `/settings/about`           | About             | Version, credits, `/settings/licenses`                   |

### App Navigation

Four destinations: **Zap** (`/`), **Library** (`/library`), **Create** (`/create`) and **Settings** (`/settings`). How they are presented depends on viewport width:

- **Below 760px (phone)** — a bottom dock with the four destinations
- **760–1279px (tablet)** — a top bar with a menu button; it opens a side drawer with the four sections and their child pages
- **From 1280px (desktop)** — a persistent sidebar with the same sections and child pages

In the drawer and sidebar, section labels are links and the chevron beside each one expands its child pages without navigating. Navigation is always accessible unless a modal dialog is open (modals intentionally block background interaction). From 1100px, selected Library media opens in a docked details pane rather than a dialog.

## Working with Snapshots

Snapshots are YAML files that describe the accessibility tree of the current page. They are the primary way to understand page structure and find element refs for interaction.

### Reading Snapshots

After every command, `playwright-cli` outputs a snapshot path. Read it to find element refs:

```bash
playwright-cli snapshot
# Then read the snapshot file to find refs
```

Key things to look for in snapshots:

- `[ref=eNNN]` — element reference for click/fill/etc commands
- `[disabled]` — element is not interactive
- `[active]` — element is currently active/focused
- `[cursor=pointer]` — element is clickable
- `button`, `link`, `textbox`, `searchbox` — element roles
- `dialog` — modal dialogs (may be hidden in DOM but present in tree)

### Common Patterns

```bash
# Click by ref
playwright-cli click e123

# Fill a text input
playwright-cli fill e456 "some text"

# Press keyboard keys
playwright-cli press Escape
playwright-cli press Enter

# Close dialogs — use the Close/Cancel button ref, NOT Escape
# (Escape may not work for all dialogs in this app)
playwright-cli click <close-button-ref>
```

## Screenshots

Save all screenshots to `.playwright-screenshots/` (gitignored):

```bash
playwright-cli screenshot --filename=.playwright-screenshots/descriptive-name.png
```

Use descriptive filenames that indicate what's being captured:

- `01-home-connected.png`
- `search-results-mario.png`
- `bug-dialog-not-closing.png`

## Scrolling

The `mousewheel` command in `playwright-cli` has swapped X/Y arguments. Use `run-code` for reliable vertical scrolling:

```bash
playwright-cli run-code "async page => { await page.mouse.wheel(0, 500); }"
```

## Console and Network

Check browser console for errors:

```bash
playwright-cli console          # all console output
playwright-cli console error    # errors only
playwright-cli console warning  # warnings only
```

Check network requests:

```bash
playwright-cli network
```

## Dialogs and Modals

The app uses modal dialogs for confirmations, device selection, history, game details, system selection, etc. They are bottom sheets below 760px and centered dialogs from 760px. When a dialog is open:

- Background elements are intentionally blocked from interaction
- Find the dialog's Close or Cancel button ref in the snapshot
- Click that button to dismiss
- Escape closes dismissible dialogs; mandatory blocking dialogs ignore it

## State Management Notes

- **Connection state** lives in the Zustand store (`useStatusStore`), not persisted — lost on reload
- **Saved devices** are persisted in the device registry through Capacitor Preferences — survive reload
- **Tour completed** is persisted in the preferences store — survives reload only if the store has hydrated before the page unloads
- **Search results, now playing, scan history** come from the WebSocket connection — lost on disconnect

## Platform-Specific Behavior

When testing in headless Chromium (web platform):

- NFC features are disabled (no NFC hardware)
- Camera/barcode scanning is disabled
- Network scan (mDNS discovery) is disabled
- Haptic feedback is a no-op
- The "NFC utilities" option on the Create page is always disabled

## Known Quirks

- After a full page reload, the app may show "Connecting..." briefly while the WebSocket reconnects. Wait a few seconds before interacting.
- The welcome tour will reappear after a full reload if it wasn't completed/dismissed in a prior session that persisted properly.
- Console will show WebSocket-related errors during reconnection attempts — these are expected during the reconnect cycle.
- Element refs (`eNNN`) change between snapshots. Always take a fresh snapshot before interacting if refs might be stale.

## Example: Full Test Session

```bash
# 1. Open browser
playwright-cli open http://localhost:8100

# 2. Skip welcome tour
playwright-cli snapshot
# Find "Skip Tour" button ref, then:
playwright-cli click <skip-tour-ref>

# 3. Connect to device via Settings and shared device sheet
playwright-cli click <settings-nav-ref>
playwright-cli snapshot
playwright-cli click <connect-or-change-device-ref>
playwright-cli snapshot
playwright-cli click <enter-address-ref>
playwright-cli snapshot
playwright-cli fill <textbox-ref> "10.0.0.107"
playwright-cli click <connect-button-ref>

# 4. Wait and verify connection
sleep 3
playwright-cli snapshot
# Confirm "Connected" in snapshot

# 5. Navigate and test
playwright-cli click <zap-nav-ref>
playwright-cli screenshot --filename=.playwright-screenshots/home-connected.png

# 6. Clean up
playwright-cli close
```

## Exploratory Testing Prompts

### QA Tester Persona

When running exploratory test sessions, use an aggressive QA persona. This produces meaningfully different (better) results than generic "test this app" instructions:

```
You are an aggressive QA tester. Your job is to thoroughly test the Zaparoo web app
and find bugs, UX issues, edge cases, and accessibility problems. You interact through
the browser ONLY — like a real user.

Rules:
- Trust nothing. If it looks like it works, try to break it.
- Screenshot every bug you find.
- Finding a bug is not the end — document it and KEEP TESTING.
- Edge cases are where bugs hide. The happy path is boring.
- Try phone (375x667), tablet (820x1180) and desktop (1440x900) viewports.
```

### Test Areas to Cover

Structure prompts around specific areas for thorough coverage:

**Input Validation & Edge Cases**

- Empty inputs, single characters, very long strings (100+ chars)
- Special characters, unicode, emoji
- Injection strings (SQL, HTML/XSS) — these should be handled safely
- Invalid formats (bad IP addresses, malformed data)

**Navigation & State**

- Rapid navigation between tabs
- Back/forward browser navigation — does state persist?
- Keyboard navigation (Tab, Enter, Escape)
- Dialog opening/closing sequences

**Responsive Layout**

- Phone (bottom dock): `playwright-cli resize 375 667`
- Narrow: `playwright-cli resize 320 480`
- Tablet (top bar and drawer): `playwright-cli resize 820 1180`
- Desktop (sidebar): `playwright-cli resize 1440 900`
- Layout boundaries: 759/760, 1023/1024, 1099/1100 and 1279/1280 wide

**Accessibility**

- Tab order through pages
- All interactive elements should have accessible names
- Heading hierarchy should be logical (h1 > h2 > h3)
- Images should have alt text
- Dialogs should trap focus

**Stress & Performance**

- Scroll through large lists (search results, scan history)
- Rapid repeated clicks on the same button
- Open and close dialogs quickly

### Report Format

Test sessions should produce a report (saved to `.playwright-screenshots/test-report.md`) with:

1. **Bugs** — clearly broken behavior with reproduction steps
2. **UX Issues** — things that work but feel wrong
3. **Accessibility Issues** — missing labels, bad focus, etc.
4. **Edge Cases Handled Well** — things that correctly handled weird input
5. **Screenshots** — referenced by filename

## Techniques & Patterns

### Snapshot-First Interaction

Always read the snapshot YAML before interacting. The accessibility tree tells you exactly what's on screen, what's clickable, what's disabled, and what dialogs are open. This is more reliable than screenshots for understanding page state.

### State Preservation

Use `state-save` and `state-load` to snapshot browser state (cookies, localStorage) for faster session setup:

```bash
# After connecting to device and dismissing tour:
playwright-cli state-save connected.json

# In a future session:
playwright-cli open http://localhost:8100
playwright-cli state-load connected.json
playwright-cli reload
```

### Console Error Monitoring

Check console errors periodically during testing. Errors during WebSocket reconnection are expected, but other errors may indicate real bugs:

```bash
playwright-cli console error
```

### Avoiding Common Pitfalls

- **Stale refs**: Element refs change between snapshots. Never reuse a ref from a previous snapshot without re-snapshotting.
- **Dialog blocking**: When a modal is open, clicks on background elements will fail with "intercepts pointer events". This is correct behavior — dismiss the dialog first.
- **Context exhaustion**: For long test sessions, summarize completed test areas periodically so the LLM doesn't lose track of what's been tested.
- **Never modify source code**: The tester agent should only interact through the browser UI. It should not read or modify application source code during a test session.

## References

- [Building an AI QA Engineer with Claude Code (alexop.dev)](https://alexop.dev/posts/building_ai_qa_engineer_claude_code_playwright)
- [Playwright CLI: Token-Efficient Alternative (TestCollab)](https://testcollab.com/blog/playwright-cli)
- [Letting Playwright MCP Explore Your Site (Debs O'Brien / Microsoft)](https://dev.to/debs_obrien/letting-playwright-mcp-explore-your-site-and-write-your-tests-mf1)
- [Playwright Test Agents: AI Testing Explained (Bug0)](https://bug0.com/blog/playwright-test-agents)
