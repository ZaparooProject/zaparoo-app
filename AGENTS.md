# AGENTS.md

Guidance for AI agents working with the Zaparoo App codebase.

## Commands

### Development

- `pnpm dev` - Start development server with Vite
- `pnpm dev:server` - Start with dev server mode (requires `DEV_SERVER_IP` in `.env`)
- `pnpm build` - TypeScript compile + Vite build + Capacitor sync (production)
- `pnpm build:web` - Build web version only (no Capacitor sync)
- `pnpm build:core` - Build for embedded Core mode
- `pnpm sync` - Sync web app with mobile platforms
- `pnpm typecheck` - TypeScript type checking
- `pnpm lint` / `pnpm lint:fix` - ESLint checking/fixing
- `pnpm format` / `pnpm format:check` - Prettier formatting
- `npx cap open ios` / `npx cap open android` - Open native projects

### Testing

- `pnpm test` - Run Vitest tests
- `pnpm test:coverage` - Run tests with coverage report
- `pnpm test:ui` - Run tests with Vitest UI

### Live Updates

- `pnpm live-update` - Build and push signed live update (requires `live-update-private.pem`)
- `pnpm live-update:list` - List deployed bundles

---

## Architecture

### Tech Stack

- **Frontend**: React 19 + TypeScript + Vite
- **Mobile**: Capacitor 7 (cross-platform iOS/Android)
- **Routing**: TanStack Router with file-based routing
- **State**: Zustand (`src/lib/store.ts`, `src/lib/preferencesStore.ts`)
- **Styling**: TailwindCSS 4 with custom CSS variables
- **Networking**: WebSocket + HTTP JSON-RPC with Zaparoo Core
- **Testing**: Vitest + React Testing Library + MSW
- **i18n**: i18next (7 languages)
- **CI/CD**: Capawesome Cloud

### Directory Structure

```
src/
  components/        # React components
    ui/              # shadcn/ui-based components
    wui/             # Custom Zaparoo UI components
    home/            # Home page components
    nfc/             # NFC-related components
  hooks/             # Custom React hooks
  lib/               # Core utilities, API clients, store, models
    transport/       # WebSocket transport layer (ConnectionManager, WebSocketTransport, types)
  routes/            # TanStack Router file-based routes
  translations/      # i18n JSON files
  __tests__/         # Test suites
    unit/            # Unit tests
    integration/     # Integration tests
    validation/      # Configuration validation tests
  test-utils/        # Test helpers, factories, MSW handlers
  __mocks__/         # Capacitor plugin mocks
```

### Key Files

- `src/lib/store.ts` - Main Zustand store for connection/app state
- `src/lib/preferencesStore.ts` - Persisted preferences with Capacitor storage
- `src/lib/coreApi.ts` - JSON-RPC API client for Zaparoo Core
- `src/lib/logger.ts` - Logging utility with Rollbar integration
- `src/lib/nfc.ts` - NFC operations with session management
- `src/lib/models.ts` - TypeScript interfaces and API method enums
- `src/lib/transport/ConnectionManager.ts` - WebSocket connection management
- `src/i18n.ts` - i18next configuration

---

## Testing

**Full guide:** [docs/testing.md](docs/testing.md)

### Quick Reference

- Follow **Testing Trophy**: prioritize integration tests over unit tests
- Use **AAA pattern**: Arrange-Act-Assert
- Use `should + verb` naming: `it("should show error when email is invalid")`
- Import from `test-utils`: `import { render, screen, waitFor } from "../../../test-utils"`
- Always use `userEvent.setup()` for interactions
- Use `findBy*` for async content, `queryBy*` to assert absence
- Use accessible queries: `getByRole` > `getByLabelText` > `getByText` > `getByTestId`
- Factory: `mockReaderInfo()` from `test-utils/factories.ts`

### Critical Anti-Patterns

1. **Never create fake components** inside test files - import real ones
2. **Don't mock the component being tested** - only mock external deps
3. **Use `it.each`** for repetitive test patterns
4. **Never use hardcoded delays** - use `waitFor` or `findBy*`
5. **Don't test CSS classes** - test accessible behavior

### Test Checklist

- [ ] Imports real component from `src/`
- [ ] Uses accessible queries
- [ ] Tests observable behavior
- [ ] Uses `userEvent.setup()` for interactions
- [ ] Uses `findBy*` or `waitFor` for async

---

## Logging

```typescript
import { logger } from "@/lib/logger";

logger.log("General info"); // Dev only
logger.debug("Debug details"); // Dev only
logger.warn("Warning message"); // Dev only
logger.error("Error", error, {
  // Always + Rollbar in prod
  category: "nfc",
  action: "write",
  severity: "warning",
});
```

**Categories:** `nfc`, `storage`, `purchase`, `api`, `camera`, `accelerometer`, `queue`, `connection`, `share`, `lifecycle`, `websocket`, `general`

**Severities:** `critical`, `error`, `warning`, `info`, `debug`

---

## Platform & Capacitor

**Full guide:** [docs/capacitor.md](docs/capacitor.md)

### Platform Detection

```typescript
import { Capacitor } from "@capacitor/core";

if (Capacitor.isNativePlatform()) {
  /* native only */
}
const platform = Capacitor.getPlatform(); // 'ios' | 'android' | 'web'
```

### Plugins Used

`@capacitor/core`, `@capacitor/app`, `@capacitor/browser`, `@capacitor/clipboard`, `@capacitor/device`, `@capacitor/filesystem`, `@capacitor/haptics`, `@capacitor/network`, `@capacitor/preferences`, `@capacitor/screen-reader`, `@capacitor/share`, `@capacitor/status-bar`, `@capacitor/text-zoom`, `@capacitor-community/keep-awake`, `@capacitor-firebase/authentication`, `@capacitor-mlkit/barcode-scanning`, `@capawesome-team/capacitor-nfc`, `@capawesome/capacitor-live-update`, `@capgo/capacitor-shake`, `capacitor-plugin-safe-area`, `capacitor-zeroconf`

### Feature Availability

```typescript
// Hooks check availability at startup, cache in preferencesStore
const nfcAvailable = usePreferencesStore((state) => state.nfcAvailable);
const cameraAvailable = usePreferencesStore((state) => state.cameraAvailable);
```

Hooks: `useNfcAvailabilityCheck()`, `useCameraAvailabilityCheck()`, `useAccelerometerAvailabilityCheck()`

### Key Patterns

- **NFC**: Use `withNfcSession()` from `src/lib/nfc.ts` for auto-cleanup
- **Haptics**: Use `useHaptics()` hook - respects user preference
- **Storage**: Use Capacitor `Preferences`, not localStorage
- **Safe Area**: Use `safeInsets` from `useStatusStore`

---

## Internationalization (i18n)

**Languages:** en-US (default), en-GB, fr-FR, zh-CN, ko-KR, ja-JP, nl-NL, de-DE

**Files:** `src/translations/*.json`

```typescript
import { useTranslation } from "react-i18next";
const { t } = useTranslation();

t("nav.back"); // Simple key
t("error", { msg: "Failed" }); // Interpolation
t("duration.hours", { count: 5 }); // Pluralization
```

**Adding translations:** Only update `src/translations/en-US.json`

**In tests:** Translations return keys as-is - test for keys

---

## State Management

### Main Store (`useStatusStore`)

```typescript
import { useStatusStore } from "@/lib/store";

const connected = useStatusStore((state) => state.connected);
const setConnected = useStatusStore((state) => state.setConnected);
```

**Key state:** `connected`, `connectionState`, `connectionError`, `targetDeviceAddress`, `lastToken`, `gamesIndex`, `playing`, `runQueue`, `writeQueue`, `deviceHistory`, `safeInsets`

### Preferences Store (`usePreferencesStore`)

```typescript
import { usePreferencesStore } from "@/lib/preferencesStore";

const launchOnScan = usePreferencesStore((state) => state.launchOnScan);
const setLaunchOnScan = usePreferencesStore((state) => state.setLaunchOnScan);
```

**Key settings:** `restartScan`, `launchOnScan`, `shakeEnabled`, `shakeMode`, `hapticsEnabled`, `textZoomLevel`, `tourCompleted`, `nfcAvailable`, `cameraAvailable`

### Hydration

```typescript
const hasHydrated = usePreferencesStore((state) => state._hasHydrated);
if (!hasHydrated) return <LoadingState />;
```

### Store Testing

```typescript
beforeEach(() => {
  // Reset to known state - stores don't have getInitialState()
  useStatusStore.setState({
    connected: false,
    runQueue: null,
    // ... set all needed state
  });
});
```

---

## API Communication

### JSON-RPC Protocol

```typescript
{ jsonrpc: "2.0", id: requestId, method: "media.search", params: { query: "mario" } }
```

### CoreAPI Client

```typescript
import { CoreAPI } from "@/lib/coreApi";

const result = await CoreAPI.getVersion();
const searchResults = await CoreAPI.searchMedia({ query: "mario" });
CoreAPI.reset(); // Call in test cleanup
```

### WebSocket Transport

- Auto-reconnection: 1s initial, 1.5x multiplier, 30s max
- Heartbeat: 15s ping/pong, 10s timeout
- Message queuing: up to 100 while disconnected
- States: disconnected → connecting → connected → reconnecting

### Queue System

- `runQueue` - Game launch commands (`useRunQueueProcessor`)
- `writeQueue` - NFC write operations (`useWriteQueueProcessor`)

```typescript
// Set queue item
useStatusStore.getState().setRunQueue({ value: "game.launch", unsafe: false });
// Clear queue
useStatusStore.getState().setRunQueue(null);
```

---

## Component Patterns

### Libraries

- `src/components/ui/` - shadcn/ui components (Radix-based)
- `src/components/wui/` - Custom Zaparoo components

### wui Conventions

- Use `memo()` and `forwardRef()`
- Use `classnames` for conditional Tailwind
- Support `aria-label`, `aria-expanded`, `aria-controls`
- Use `intent` prop for haptic feedback: `"default"` | `"primary"` | `"destructive"`

### Button/Card

```tsx
<Button label="Submit" variant="fill" size="default" intent="primary" onClick={handle} />
<Card onClick={handle} disabled={isDisabled}>{children}</Card>
```

### Styling

- Tailwind CSS classes
- CSS variables: `bg-button-pattern`, `bg-card-pattern`
- Focus: `focus-visible:ring-2 focus-visible:ring-white/50`

---

## Error Handling

```typescript
try {
  await riskyOperation();
} catch (error) {
  logger.error("Operation failed", error, {
    category: "api",
    action: "riskyOperation",
  });
  showRateLimitedErrorToast(t("error", { msg: error.message }));
}
```

- **Error boundary:** `src/components/ErrorComponent.tsx`
- **Toast rate limiting:** `showRateLimitedErrorToast()` - 2s cooldown

---

## Accessibility

### Required Patterns

- **Skip Links:** `<SkipLink />`
- **Page Heading Focus:** `usePageHeadingFocus()`
- **Announcements:** `A11yAnnouncerProvider`, `useA11yAnnounce()`
- **Screen Reader:** `useScreenReaderEnabled()`
- **Text Zoom:** `textZoomLevel` in preferencesStore

---

## Code Style

- **Imports:** Use `@/` alias for src directory
- **TypeScript:** Strict mode, no `any` without justification
- **Async:** Prefer async/await, handle errors explicitly
- **Hooks:** Prefix with `use`, extract to `src/hooks/`
- **Naming:** Components PascalCase, hooks camelCase with `use`, tests `.test.tsx`

---

## Pull Requests

- **No test plans:** Do not include test plan sections in PR descriptions
- **Summary only:** Keep PR descriptions concise with a brief summary of changes

---

## Common Gotchas

1. **NFC Cancellation**: Check `error.message.includes("cancelled")` - fragile but necessary
2. **Platform Checks**: Always check `Capacitor.isNativePlatform()` before native features
3. **Store Hydration**: Wait for `_hasHydrated` before rendering persisted-state UI
4. **Translation Keys**: In tests, translations return keys - test for keys not strings
5. **WebSocket Reconnection**: Transport handles this automatically - don't manually reconnect
6. **Safe Area Insets**: Use `safeInsets` from store for notched device padding
7. **Touch vs Click**: wui components handle touch/scroll distinction internally

---

## Live Updates & CI/CD

**Full guide:** [docs/deployment.md](docs/deployment.md)

### When to Use

| Change Type                                                   | Method                           |
| ------------------------------------------------------------- | -------------------------------- |
| UI/JS fixes, translations, new features with existing plugins | Live Update (`pnpm live-update`) |
| New plugins, native code, new permissions, Capacitor upgrades | Store Release (push git tag)     |

### Process

- **Live Update:** `pnpm live-update` builds, signs, and uploads bundle
- **Store Build:** Push git tag (e.g., `v1.9.2`) triggers Capawesome Cloud build
- **Rollback:** App auto-rolls back if crash before `ready()` called

### Secrets (Capawesome Cloud)

`NPM_TOKEN`, `FIREBASE_CREDS`, `GOOGLE_SERVICES_JSON`, `GOOGLE_SERVICE_INFO_PLIST`, `VITE_GOOGLE_STORE_API`, `VITE_APPLE_STORE_API`, `VITE_ROLLBAR_ACCESS_TOKEN`, `LIVE_UPDATE_PRIVATE_KEY`

---

## Pro Features

Pro features gated by RevenueCat. Primary feature: "Launch on scan" (phone as wireless reader).

```typescript
import { useProAccessCheck } from "@/hooks/useProAccessCheck";
const { hasProAccess, isLoading } = useProAccessCheck();
```
