# Accessibility validation

Zaparoo App targets WCAG 2.2 AA and native VoiceOver/TalkBack behavior. Automated checks reduce regressions, but they do not establish conformance on their own.

## Automated checks

Run the standard project validation:

```sh
npm run format:check
npm run typecheck
npm run lint
npm run test -- --run
npm run build:web
npm run build:core
```

Focused tests cover:

- modal isolation, focus trapping, Escape/Android Back dismissal, and focus restoration;
- route-heading and skip-link focus;
- keyboard radio-group behavior and visible control focus;
- accessible alternatives to virtualized Library, system, tag, and search lists;
- text-zoom row growth and bottom-navigation reflow;
- localized accessible names and document language;
- live announcements without duplicate toast output; and
- axe-core checks for shared modals, bottom navigation, Library lists, remote keyboard controls, and accessibility settings.

`src/test-utils/axe.ts` disables axe's color-contrast rule because jsdom has no rendered pixels. It also disables the region best-practice rule for isolated component tests that intentionally omit the app shell. Root landmark behavior has separate integration coverage. Run axe in a real browser for rendered contrast and full-page landmark checks.

## Accessible list mode

Library and large search/selector lists remain virtualized by default. They switch to normal document flow with explicit pagination when either:

- native screen-reader support reports VoiceOver or TalkBack as enabled; or
- **Settings → Accessibility → Screen reader-friendly lists** is enabled.

Use the manual preference when browser or WebView screen-reader detection is unavailable.

## Required native checks

Complete these checks on release candidates before claiming accessibility conformance.

### iOS VoiceOver

- Navigate every bottom tab and confirm each route announces/focuses its heading once.
- Traverse Library systems, folders, search results, Favorites, details, and explicit pagination.
- Open and close each modal; confirm background content is unavailable and focus returns to its trigger or safe fallback.
- Verify Launch, Favorite, and Write actions expose names, state, and results without closing details unexpectedly.
- Verify connection, indexing, scan, NFC, write, search, and error announcements are complete and not duplicated.

### Android TalkBack

- Repeat Library and modal traversal in Android WebView.
- Verify system Back closes only the top open dialog before navigating away.
- Confirm closed Radix and slide dialogs cannot consume Back or receive accessibility focus.
- Verify remote keyboard keys and custom controls are announced as buttons, radios, checkboxes, or tabs as appropriate.

### Keyboard, zoom, and display

- Traverse all routes using Tab, Shift+Tab, Enter, Space, Escape, and arrow keys without a pointer.
- Test 200% text size and the app's largest text preset in portrait and landscape; confirm no clipped labels, actions, or fixed-height Library rows.
- Confirm focus indicators remain visible at viewport edges and after dynamic content replacement.
- Inspect primary buttons, selected states, warnings, checkboxes, and text over images/gradients using rendered-pixel contrast tooling.
- Test touch targets and spacing on the smallest supported iOS and Android displays.

Record device model, OS/WebView version, screen reader version, orientation, text-size setting, and any unresolved issue for each run.
