# AGENTS.md

This file provides guidance to AI agents when working with the Zaparoo App codebase.

## Commands

### Development

- `pnpm dev` - Start development server with Vite
- `pnpm dev:server` - Start with dev server mode (requires `DEV_SERVER_IP` in `.env`)
- `pnpm build` - TypeScript compile + Vite build + Capacitor sync (production)
- `pnpm build:web` - Build web version only (no Capacitor sync)
- `pnpm build:core` - Build for embedded Core mode
- `pnpm build:server` - Build with dev server URL enabled
- `pnpm sync` - Sync web app with mobile platforms
- `pnpm typecheck` - TypeScript type checking without emitting files
- `pnpm lint` - ESLint checking
- `pnpm lint:fix` - ESLint with auto-fix
- `pnpm format` - Prettier formatting
- `pnpm format:check` - Check Prettier formatting
- `npx cap open ios` - Open iOS project in Xcode
- `npx cap open android` - Open Android project in Android Studio

### Testing

- `pnpm test` - Run Vitest tests
- `pnpm test:coverage` - Run tests with coverage report
- `pnpm test:ui` - Run tests with Vitest UI

## Architecture

### Tech Stack

- **Frontend**: React 19 + TypeScript + Vite
- **Mobile**: Capacitor 7 (cross-platform iOS/Android)
- **Routing**: TanStack Router with file-based routing
- **State**: Zustand stores (`src/lib/store.ts`, `src/lib/preferencesStore.ts`)
- **Styling**: TailwindCSS 4 with custom CSS variables
- **Networking**: WebSocket + HTTP JSON-RPC with Zaparoo Core service
- **Testing**: Vitest + React Testing Library + MSW
- **i18n**: i18next with 7 supported languages

### Directory Structure

```
src/
  components/        # React components
    ui/              # shadcn/ui-based components (accordion, button, dialog, etc.)
    wui/             # Custom Zaparoo UI components (Button, Card, TextInput, etc.)
    home/            # Home page components
    nfc/             # NFC-related components
  hooks/             # Custom React hooks
  lib/               # Core utilities, API clients, store, models
    transport/       # WebSocket transport layer
  routes/            # TanStack Router file-based routes
  translations/      # i18n JSON files (en-US, zh-CN, ko-KR, fr-FR, nl-NL, ja-JP, de-DE)
  __tests__/         # Test suites
    unit/            # Unit tests
    integration/     # Integration tests
    smoke/           # Smoke tests
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
- `src/i18n.ts` - i18next configuration

## Testing Requirements

### Test Structure

Tests are organized by type with specific patterns:

- **Unit tests**: `src/__tests__/unit/**/*.test.{ts,tsx}` - Test individual components, hooks, utilities
- **Integration tests**: `src/__tests__/integration/**/*.test.tsx` - Test feature flows and interactions
- **Smoke tests**: `src/__tests__/smoke/**/*.test.ts` - Basic sanity checks

### Test Setup

The test environment is configured in `vitest.config.ts` and `src/test-setup.ts`:

- **Environment**: happy-dom
- **Global mocks**: i18n (returns keys as-is), WebSocket, matchMedia, IntersectionObserver
- **MSW handlers**: `src/test-utils/msw-handlers.ts` for API mocking
- **Custom render**: `src/test-utils/index.tsx` wraps with providers (QueryClient, A11yAnnouncer, SlideModal)

### Writing Tests

#### Import from test-utils

```typescript
import { render, screen } from "../../../test-utils";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
```

#### Use Factory Functions for Mock Data

Use `src/test-utils/factories.ts` to generate realistic test data:

```typescript
import {
  mockTokenResponse,
  mockVersionResponse,
  mockMediaResponse,
} from "../../../test-utils/factories";

const token = mockTokenResponse({ uid: "specific-uid" }); // Override specific fields
const version = mockVersionResponse();
```

Available factories: `mockSystem`, `mockVersionResponse`, `mockLaunchRequest`, `mockWriteRequest`, `mockTokenResponse`, `mockPlayingResponse`, `mockIndexResponse`, `mockMediaResponse`, `mockMappingResponse`

#### MSW for API Mocking

Handlers in `src/test-utils/msw-handlers.ts` mock JSON-RPC responses. Override for specific tests:

```typescript
import { server } from "../../test-setup";
import { http, HttpResponse } from "msw";

server.use(
  http.post("*/api", () => {
    return HttpResponse.json({ jsonrpc: "2.0", id: 1, result: customResult });
  }),
);
```

#### Test Cleanup

The setup automatically handles:

- `CoreAPI.reset()` after each test
- Timer cleanup with `vi.clearAllTimers()` and `vi.useRealTimers()`
- MSW handler reset with `server.resetHandlers()`
- React Testing Library cleanup

#### Platform-Specific Tests

For iOS/Android-specific behavior, create separate test files:

- `ComponentName.test.tsx` - General tests
- `ComponentName.ios.test.tsx` - iOS-specific tests

#### Testing Best Practices

1. Query elements by role/label, not test IDs when possible
2. Use `screen.getByRole("button", { name: "..." })` for buttons
3. Translations are mocked to return keys - test for translation keys
4. Reset Zustand stores in `beforeEach` if testing state changes
5. Use `waitFor` for async operations
6. Avoid testing implementation details - test behavior

## Logging Requirements

### Logger Usage

Use `src/lib/logger.ts` for all logging:

```typescript
import { logger } from "@/lib/logger";

// Development only (stripped in production)
logger.log("General info");
logger.debug("Debug details");
logger.warn("Warning message");

// Always logged + reports to Rollbar in production
logger.error("Error message", error);

// With metadata for better error tracking
logger.error("NFC write failed", error, {
  category: "nfc",
  action: "write",
  severity: "warning",
});
```

### Error Categories

Use appropriate categories for error classification:

- `nfc` - NFC operations
- `storage` - Preferences/storage operations
- `purchase` - RevenueCat/Pro purchases
- `api` - Core API calls
- `camera` - Barcode scanning
- `accelerometer` - Shake detection
- `queue` - Run/write queue processing
- `connection` - WebSocket connection
- `share` - Share functionality
- `lifecycle` - App lifecycle events
- `websocket` - WebSocket transport
- `general` - Default category

### Severity Levels

- `critical` - App-breaking errors
- `error` - Recoverable errors (default)
- `warning` - Unexpected but handled
- `info` - Informational
- `debug` - Debug-level details

## Capacitor & Platform Patterns

### Platform Detection

```typescript
import { Capacitor } from "@capacitor/core";

// Check if running on native platform (iOS/Android)
if (Capacitor.isNativePlatform()) {
  // Native-only code
}

// Get specific platform
const platform = Capacitor.getPlatform(); // 'ios' | 'android' | 'web'
```

### Capacitor Plugins Used

- `@capacitor/core` - Core platform API
- `@capacitor/app` - App lifecycle, deep linking
- `@capacitor/haptics` - Vibration/haptic feedback
- `@capacitor/device` - Device info
- `@capacitor/preferences` - Local storage (use instead of localStorage on native)
- `@capacitor/screen-reader` - Screen reader detection
- `@capacitor/status-bar` - Status bar control
- `@capacitor/text-zoom` - Text size accessibility
- `@capacitor/share` - Native share sheet
- `@capacitor-firebase/authentication` - Firebase auth
- `@capawesome-team/capacitor-nfc` - NFC reading/writing
- `@capacitor-mlkit/barcode-scanning` - Camera barcode scanning
- `@capacitor-community/keep-awake` - Screen wake lock
- `@capgo/capacitor-shake` - Shake detection

### Feature Availability Checks

Always check feature availability before use. Hooks handle this pattern:

- `useNfcAvailabilityCheck()` - Checks NFC support at startup
- `useCameraAvailabilityCheck()` - Checks camera/barcode scanner
- `useAccelerometerAvailabilityCheck()` - Checks shake detection

Results are cached in `preferencesStore`:

```typescript
const nfcAvailable = usePreferencesStore((state) => state.nfcAvailable);
const cameraAvailable = usePreferencesStore((state) => state.cameraAvailable);
```

### NFC Session Management

Use `withNfcSession()` helper for proper cleanup:

```typescript
// From src/lib/nfc.ts - listeners are automatically cleaned up
await withNfcSession<Result>(async (event) => {
  // Handle tag scan
  return result;
});
```

Key patterns:

- Register all listeners before starting scan (prevents race conditions)
- Store listener handles for cleanup
- Distinguish user cancellation from errors (check error message for "cancelled")
- Call `Nfc.stopScanSession()` to cancel - do NOT call `removeAllListeners()`

### Haptic Feedback

Use the `useHaptics` hook:

```typescript
const { impact, notification, vibrate } = useHaptics();

// Button press feedback
impact("light"); // or "medium", "heavy"

// Notification feedback
notification("success"); // or "warning", "error"

// Simple vibration
vibrate(300); // duration in ms
```

The hook respects user's haptics preference and gracefully handles unsupported platforms.

### Storage

Use Capacitor Preferences, not localStorage:

```typescript
import { Preferences } from "@capacitor/preferences";

// Set
await Preferences.set({ key: "myKey", value: JSON.stringify(data) });

// Get
const { value } = await Preferences.get({ key: "myKey" });
const data = value ? JSON.parse(value) : defaultValue;
```

For app settings, use `preferencesStore` which handles persistence automatically.

## Internationalization (i18n)

### Supported Languages

- English: `en-US` (default), `en`, `en-GB`
- French: `fr-FR`, `fr`
- Chinese: `zh-CN`, `zh`
- Korean: `ko-KR`, `ko`
- Japanese: `ja-JP`, `ja`
- Dutch: `nl-NL`, `nl`
- German: `de-DE`

### Translation Files

Located in `src/translations/*.json`. Structure uses nested objects:

```json
{
  "translation": {
    "nav": {
      "back": "Back",
      "cancel": "Cancel"
    },
    "spinner": {
      "scanning": "Scanning"
    }
  }
}
```

### Usage

```typescript
import { useTranslation } from "react-i18next";

const { t } = useTranslation();

// Simple key
t("nav.back");

// With interpolation
t("error", { msg: "Something went wrong" });
// Translation: "Error: {{msg}}"

// Pluralization
t("duration.hours", { count: 5 });
// Uses "hours_one" for count=1, "hours_other" for count>1
```

### Adding New Translations

1. Add key to `src/translations/en-US.json`
2. ONLY update English translations, never other languages unless asked

### In Tests

Translations are mocked to return keys as-is. Test for translation keys:

```typescript
expect(screen.getByText("nav.back")).toBeInTheDocument();
```

## Component Patterns

### Component Library

Two UI component libraries:

- `src/components/ui/` - shadcn/ui components (Radix-based)
- `src/components/wui/` - Custom Zaparoo components

### wui Component Conventions

- Use `memo()` and `forwardRef()` for performance and ref support
- Use `classnames` for conditional Tailwind classes
- Support accessibility props: `aria-label`, `aria-expanded`, `aria-controls`
- Use semantic `intent` prop for haptic feedback: `"default"` | `"primary"` | `"destructive"`

### Button Pattern

```tsx
<Button
  label="Submit"
  variant="fill" // "fill" | "outline" | "text"
  size="default" // "sm" | "default" | "lg"
  intent="primary" // For haptic feedback intensity
  icon={<Icon />}
  disabled={isDisabled}
  aria-label="Submit form"
  onClick={handleClick}
/>
```

### Card Pattern

```tsx
<Card
  onClick={handleClick} // Makes card interactive (button semantics)
  disabled={isDisabled}
>
  {children}
</Card>
```

### Touch Handling

Interactive components track touch movement to distinguish taps from scrolls:

- Store `touchStartPos` on touch start
- Check if moved >10px during touch move
- Only trigger click if `!hasMoved`

### Styling

- Use Tailwind CSS classes
- Custom CSS variables for colors: `bg-button-pattern`, `bg-card-pattern`
- Focus visible styles: `focus-visible:ring-2 focus-visible:ring-white/50`
- Touch manipulation: `touch-manipulation` class

## State Management

### Main Store (`useStatusStore`)

Connection and runtime state:

```typescript
import { useStatusStore } from "@/lib/store";

// Subscribe to specific state
const connected = useStatusStore((state) => state.connected);
const connectionState = useStatusStore((state) => state.connectionState);

// Actions
const setConnected = useStatusStore((state) => state.setConnected);
```

Key state:

- `connected`, `connectionState`, `connectionError` - Connection status
- `targetDeviceAddress` - Current device IP
- `lastToken`, `gamesIndex`, `playing` - Core API data
- `runQueue`, `writeQueue` - Operation queues
- `deviceHistory` - Previous device connections

### Preferences Store (`usePreferencesStore`)

Persisted settings with Capacitor Preferences:

```typescript
import { usePreferencesStore } from "@/lib/preferencesStore";

const launchOnScan = usePreferencesStore((state) => state.launchOnScan);
const setLaunchOnScan = usePreferencesStore((state) => state.setLaunchOnScan);
```

Key settings:

- `restartScan`, `launchOnScan` - Scan behavior
- `shakeEnabled`, `shakeMode`, `shakeZapscript` - Shake to launch
- `hapticsEnabled`, `textZoomLevel` - Accessibility
- `tourCompleted` - Onboarding state
- `nfcAvailable`, `cameraAvailable`, `accelerometerAvailable` - Feature flags

### Hydration

Wait for store hydration before showing UI that depends on persisted state:

```typescript
const hasHydrated = usePreferencesStore((state) => state._hasHydrated);

if (!hasHydrated) {
  return <LoadingState />;
}
```

## API Communication

### JSON-RPC Protocol

All Core API communication uses JSON-RPC 2.0:

```typescript
{
  jsonrpc: "2.0",
  id: requestId,
  method: "media.search",
  params: { query: "mario" }
}
```

### CoreAPI Client

```typescript
import { CoreAPI } from "@/lib/coreApi";

// Make API calls
const result = await CoreAPI.getVersion();
const searchResults = await CoreAPI.searchMedia({ query: "mario" });

// Reset state (call after tests)
CoreAPI.reset();
```

### WebSocket Transport

Located in `src/lib/transport/WebSocketTransport.ts`:

- Automatic reconnection with exponential backoff (1s initial, 1.5x multiplier, 30s max)
- Heartbeat ping/pong every 15s with 10s timeout
- Message queuing (up to 100) while disconnected
- State machine: disconnected -> connecting -> connected -> reconnecting

### Queue System

Two queues for operations:

- `runQueue` - Game launch commands (processed by `useRunQueueProcessor`)
- `writeQueue` - NFC write operations (processed by `useWriteQueueProcessor`)

Queues handle offline scenarios - requests are queued and flushed when connected.

## Error Handling

### Error Boundaries

`src/components/ErrorComponent.tsx` displays errors with:

- Error message and stack trace
- Diagnostic info: app version, platform, device, timestamp
- Copy button for error details
- Reload button

### Error Patterns

```typescript
try {
  await riskyOperation();
} catch (error) {
  logger.error("Operation failed", error, {
    category: "api",
    action: "riskyOperation",
    severity: "error",
  });

  // Show user-friendly message
  showRateLimitedErrorToast(t("error", { msg: error.message }));
}
```

### Toast Rate Limiting

Use `showRateLimitedErrorToast()` to prevent toast spam:

```typescript
import { showRateLimitedErrorToast } from "@/lib/toastUtils";

// 2 second cooldown between error toasts
showRateLimitedErrorToast("Error message");
```

## Accessibility

### Required Patterns

1. **Skip Links**: Use `<SkipLink />` for keyboard navigation
2. **Page Heading Focus**: Use `usePageHeadingFocus()` hook for route changes
3. **Screen Reader Announcements**: Use `A11yAnnouncerProvider` and `useA11yAnnounce()`
4. **Semantic HTML**: Use proper roles and ARIA attributes
5. **Keyboard Navigation**: All interactive elements must be keyboard accessible

### Screen Reader Detection

```typescript
import { useScreenReaderEnabled } from "@/hooks/useScreenReaderEnabled";

const isScreenReaderEnabled = useScreenReaderEnabled();
```

### Text Zoom

Support text zoom for accessibility:

```typescript
const textZoomLevel = usePreferencesStore((state) => state.textZoomLevel);
// Applied via Capacitor TextZoom plugin on native
```

## Code Style

### Imports

Use path alias `@/` for src directory:

```typescript
import { logger } from "@/lib/logger";
import { useHaptics } from "@/hooks/useHaptics";
```

### TypeScript

- Use strict TypeScript - no `any` without justification
- Define interfaces for component props
- Use enums from `src/lib/models.ts` for API methods

### Async/Await

Prefer async/await over raw promises. Handle errors explicitly.

### Hooks

- Prefix with `use`
- Extract complex logic into custom hooks in `src/hooks/`
- Use `useCallback` for functions passed to children
- Use `useMemo` for expensive computations

### File Naming

- Components: PascalCase (`Button.tsx`)
- Hooks: camelCase with use prefix (`useHaptics.ts`)
- Utils/lib: camelCase (`logger.ts`)
- Tests: Match source file + `.test.tsx` suffix

## Pro Features

Pro features are gated behind RevenueCat subscription. The primary Pro feature is "Launch on scan" which allows the phone to act as a wireless reader.

Check Pro access:

```typescript
import { useProAccessCheck } from "@/hooks/useProAccessCheck";

const { hasProAccess, isLoading } = useProAccessCheck();
```

## Common Gotchas

1. **NFC Cancellation**: Detected by checking `error.message.includes("cancelled")` - fragile but necessary
2. **Platform Checks**: Always check `Capacitor.isNativePlatform()` before using native features
3. **Store Hydration**: Wait for `_hasHydrated` before rendering UI that depends on persisted state
4. **Translation Keys**: In tests, translations return keys - test for keys not translated strings
5. **WebSocket Reconnection**: The transport handles reconnection automatically - don't manually reconnect
6. **Safe Area Insets**: Use `safeInsets` from store for notched device padding
7. **Touch vs Click**: wui components handle touch/scroll distinction - don't add extra click handlers
