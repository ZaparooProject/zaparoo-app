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

The app stores the device address in `localStorage` under the key `deviceAddress`. There are two approaches:

**Option A: Through the UI (recommended for first-time setup)**

1. Skip the welcome tour: click the "Skip Tour" button
2. Navigate to Settings (bottom nav bar)
3. Fill the "Device address" textbox with the device IP (e.g. `10.0.0.107`)
4. Click the "Save" button
5. Wait a few seconds, then take a snapshot to confirm "Connected" status

**Option B: Inject localStorage directly**

```bash
playwright-cli localstorage-set deviceAddress "10.0.0.107"
playwright-cli reload
```

After reload, the app will auto-connect. You'll need to skip the welcome tour again since `tourCompleted` resets on reload.

### Verifying Connection

After connecting, confirm by checking the snapshot for:

- Status bar no longer showing "Connecting..."
- Home page shows "Connected" with the device address
- "Last scanned" and "Now playing" sections show real data
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

| Route                | Page             | Notes                                             |
| -------------------- | ---------------- | ------------------------------------------------- |
| `/`                  | Home (Zap)       | Connection status, last scanned, now playing      |
| `/create`            | Create a New Tag | Links to sub-pages, "Current media" button        |
| `/create/search`     | Search for Media | Search box, system/tag filters, results list      |
| `/create/custom`     | Custom ZapScript | Text editor with command palette                  |
| `/create/mappings`   | Add a Mapping    | Token ID input, NFC/Camera scan, ZapScript editor |
| `/settings`          | Settings         | Device connection, media database, language       |
| `/settings/readers`  | Readers          | Device readers, scan mode, chat/AI config         |
| `/settings/playtime` | Playtime         | Playtime limits configuration                     |
| `/settings/advanced` | Advanced         | Debug logging, error reporting, view logs         |
| `/settings/logs`     | Logs             | Filterable log viewer                             |
| `/settings/help`     | Help             | Documentation and community links                 |
| `/settings/about`    | About            | Version, credits, translations                    |
| `/settings/online`   | Zaparoo Online   | Login form                                        |

### Bottom Navigation Bar

Three persistent nav links at the bottom of every page:

- **Zap** (`/`) — home page
- **Create** (`/create`) — tag creation
- **Settings** (`/settings`) — settings

These are always accessible unless a modal dialog is open (modals intentionally block background interaction).

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

The app uses modal dialogs for confirmations, scan history, game details, system selection, etc. When a dialog is open:

- Background elements are intentionally blocked from interaction
- Find the dialog's Close or Cancel button ref in the snapshot
- Click that button to dismiss
- The Escape key may not close all dialog types (known issue under investigation)

## State Management Notes

- **Connection state** lives in the Zustand store (`useStatusStore`), not persisted — lost on reload
- **Device address** is persisted in `localStorage` and Capacitor Preferences — survives reload
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

# 3. Connect to device via Settings
playwright-cli click <settings-nav-ref>
playwright-cli snapshot
# Find device address textbox ref
playwright-cli fill <textbox-ref> "10.0.0.107"
playwright-cli click <save-button-ref>

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
- Try mobile viewports (375x667) as well as desktop.
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

- Mobile: `playwright-cli resize 375 667`
- Tablet: `playwright-cli resize 768 1024`
- Narrow: `playwright-cli resize 320 480`
- Desktop: `playwright-cli resize 1280 720`

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
