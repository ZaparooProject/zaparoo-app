# Zaparoo App Agent Guide

Zaparoo App is a mobile-first React 19 + TypeScript + Vite application for Zaparoo Core. It runs on web, iOS, and Android through Capacitor 8, and talks to Core over WebSocket JSON-RPC.

## Commands

`package.json` is the source of truth for scripts. Common commands:

### Development

- `npm run dev` — start the Vite dev server. Ask before running because it is long-lived.
- `npm run dev:server` — start dev mode with `NODE_ENV=development`; requires `DEV_SERVER_IP` in `.env`. Ask before running because it is long-lived.
- `npm run preview` — preview a production build locally. Ask before running because it is long-lived.

### Validation

- `npm run typecheck` — TypeScript check with `tsconfig.test.json`.
- `npm run lint` — run ESLint.
- `npm run lint:fix` — run ESLint autofixes.
- `npm run format:check` — check Prettier formatting.
- `npm run format` — apply Prettier formatting.
- `npm run test` — run Vitest.
- `npm run test:coverage` — run Vitest with coverage.

### Build, sync, and native

- `npm run build` — production build, then Capacitor sync.
- `npm run build:web` — web-only production build.
- `npm run build:core` — embedded Core build mode.
- `npm run build:server` — development server build, then Capacitor sync.
- `npm run build:analyze` — analyzer build.
- `npm run sync` — Capacitor sync only.
- `npm run live-update` — signed live update upload; requires `live-update-private.pem`, `LIVE_UPDATE_CHANNEL`, and `VITE_RELEASE_KEY`.
- `npx cap open ios` / `npx cap open android` — open native projects.

## Project layout

```text
src/
  components/        React components
    ui/              shadcn/ui Radix-based primitives
    wui/             custom Zaparoo UI components
    home/            home-page components
    nfc/             NFC components
  hooks/             custom React hooks
  lib/               core utilities, stores, API, transport, crypto
  routes/            TanStack Router file-based routes
  translations/      i18next JSON files
  __tests__/         unit, integration, and validation tests
  test-utils/        render helpers, MSW handlers, factories
  __mocks__/         Capacitor plugin mocks
docs/                focused guides for Capacitor, deployment, and testing
```

## Boundaries

### Always

- Edit existing files when possible; do not create new files speculatively.
- Use the `@/` alias for imports from `src/`.
- Use Capacitor `Preferences` for persisted state; never use `localStorage`.
- Log errors with `logger.error(msg, err, { category, action, severity })`.
- Add new UI strings to `src/translations/en-US.json` only; other locales fall back.
- Keep TypeScript strict. Do not use `any`.

### Ask first

- Adding a Capacitor plugin, because it forces a native rebuild and store release.
- Bumping the app version; see `docs/deployment.md` because package, Android, iOS, What's New, and live update channels must stay in lockstep.
- Refactors that touch many files or shared infrastructure.
- Force-pushes, branch deletes, force-resets, hook bypasses, or anything that overwrites others' work.
- Starting long-running local servers.

### Never

- Skip pre-commit hooks with `--no-verify` or commit secrets.
- Dismiss lint, type, or test failures as pre-existing; fix them or report the blocker.
- Mock the component under test, build fake components inside test files, or use hardcoded delays. Use `findBy*` and `waitFor` for async UI.
- Reconnect the WebSocket manually; the transport owns reconnect behavior.
- Test CSS classes; test accessible behavior instead.

## State

- Primary app state lives in `useStatusStore` at `src/lib/store.ts`.
- Persisted preferences and capability flags live in `usePreferencesStore` at `src/lib/preferencesStore.ts`.
- Wait for `_hasHydrated` before rendering UI that depends on persisted preferences.
- Read `coreVersion` from the store; do not pass it through props.
- `runQueue` is `{ value: string; unsafe: boolean } | null`. `writeQueue` is a plain `string`.
- For tests, reset stores with `useStatusStore.setState({ ... })` in `beforeEach`; there is no `getInitialState()`.

## API and transport

- `CoreAPI` in `src/lib/coreApi.ts` is the JSON-RPC client over WebSocket. Check that file for the current method inventory.
- Call `CoreAPI.reset()` between tests.
- Transport code in `src/lib/transport/` owns auto-reconnect, heartbeat, and offline queueing.
- Queues are processed by `useRunQueueProcessor` and `useWriteQueueProcessor`.

## Feature gating

- Add feature gates to `FEATURE_GATES` in `src/lib/featureGates.ts` with `since`, `marquee`, and `labelKey`.
- Add the `labelKey` to `src/translations/en-US.json` under `features`.
- Wrap gated UI in `<GatedFeature featureId="...">` or use `useCoreFeature(id)`.
- Dev versions (`-dev`, `-rc`, `-beta`, `-alpha`, or empty) pass all gates.

## Logging

- `logger.log`, `logger.debug`, and `logger.warn` are dev-only. `logger.error` always logs and reports to Rollbar in native production builds.
- Categories: `nfc`, `storage`, `purchase`, `api`, `camera`, `accelerometer`, `queue`, `connection`, `share`, `lifecycle`, `websocket`, `general`.
- Severities: `critical`, `error`, `warning`, `info`, `debug`.

## Platform and Capacitor

- Guard native-only calls with `Capacitor.isNativePlatform()`.
- Capability hooks hydrate cached flags in `usePreferencesStore`; read those cached flags in components.
- NFC operations should use high-level helpers from `src/lib/nfc.ts`: `readTag`, `writeTag`, `formatTag`, `eraseTag`, and `readRaw`. They wrap session lifecycle internally.
- Use `useHaptics()` for haptics. It respects user preferences, and `wui` components trigger haptics through their `intent` prop.
- Use `safeInsets` from `useStatusStore` for notch and cutout padding.
- See `docs/capacitor.md` for the full plugin list and platform patterns.

## Internationalization

- Source of truth: `src/translations/en-US.json`.
- Spanish translations are available in `src/translations/es-ES.json`; continue adding new UI strings to `en-US` only.
- Do not edit generated or fallback locale files unless explicitly requested.
- In tests, `t()` returns the key. Assert against keys, not human strings.

## Components

- shadcn/ui components live under `src/components/ui/`.
- Custom Zaparoo components live under `src/components/wui/`. Prefer them over inline JSX.
- Before adding or changing UI, read `docs/design-language.md`, then inspect the nearest sibling screens/components and copy their layout, typography, spacing, states, and component patterns exactly.
- Do not invent new card styles, label treatments, badges, stat blocks, helper text, descriptions, icons, loading affordances, or other visual flair unless explicitly requested. If the existing design language does not cover the state, stop and ask before introducing a new visual pattern.
- Use `<EmptyState>` for empty placeholders so they stay consistent.
- Use `classnames` for conditional Tailwind classes.
- Use focus rings such as `focus-visible:ring-2 focus-visible:ring-white/50`.

## Accessibility

- Add `<SkipLink />` at the top of new pages.
- Use `usePageHeadingFocus()` for page headings.
- Use `<A11yAnnouncerProvider>` and `useAnnouncer()` for live announcements.
- Use `useScreenReaderEnabled()` for screen-reader-aware behavior.
- Honor `textZoomLevel` from `usePreferencesStore`.

## Testing

- Vitest + React Testing Library + MSW are used for tests.
- Import test helpers from `test-utils`:

  ```ts
  import { render, screen, waitFor } from "@/test-utils";
  ```

- Prefer integration tests over narrow unit tests when behavior crosses component or store boundaries.
- Use the AAA pattern and `should + verb` test names.
- Use accessible queries in this order: `getByRole`, `getByLabelText`, `getByText`, then `getByTestId`.
- Use `userEvent.setup()` for interactions.
- Use `findBy*` and `waitFor` for async behavior.
- Use factories from `src/test-utils/factories.ts`, such as `mockReaderInfo()`.
- See `docs/testing.md` for the full testing guide and `docs/playwright-testing.md` for visual and end-to-end testing.

## Pull requests

- Keep the summary concise.
- Do not include a separate test plan section.
- For a store release, follow the checklist in `docs/deployment.md`, keep Android `versionCode` and iOS `CURRENT_PROJECT_VERSION` matched, and keep `src/__tests__/validation/release-config.test.ts` passing.

## Pointer docs

- `docs/capacitor.md` — Capacitor plugins, NFC, haptics, storage, and safe-area patterns.
- `docs/deployment.md` — live updates, store releases, version bumps, and Capawesome Cloud secrets.
- `docs/testing.md` — Testing Trophy, AAA, anti-patterns, and factories.
- `docs/playwright-testing.md` — visual and end-to-end test flows.
