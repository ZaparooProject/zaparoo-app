# Capacitor & Platform Patterns

This guide covers Capacitor platform patterns, plugin usage, and native feature implementation. For quick reference, see [AGENTS.md](../AGENTS.md#platform--capacitor).

## Platform Detection

```typescript
import { Capacitor } from "@capacitor/core";

// Check if running on native platform (iOS/Android)
if (Capacitor.isNativePlatform()) {
  // Native-only code
}

// Get specific platform
const platform = Capacitor.getPlatform(); // 'ios' | 'android' | 'web'
```

---

## Capacitor Plugins

### Core Plugins

| Plugin                     | Purpose                                               |
| -------------------------- | ----------------------------------------------------- |
| `@capacitor/core`          | Core platform API                                     |
| `@capacitor/app`           | App lifecycle, deep linking, back button handling     |
| `@capacitor/browser`       | In-app browser for external links                     |
| `@capacitor/clipboard`     | Clipboard read/write                                  |
| `@capacitor/device`        | Device info (model, OS version, etc.)                 |
| `@capacitor/filesystem`    | File system access                                    |
| `@capacitor/haptics`       | Vibration/haptic feedback                             |
| `@capacitor/network`       | Network status detection                              |
| `@capacitor/preferences`   | Local storage (use instead of localStorage on native) |
| `@capacitor/screen-reader` | Screen reader detection                               |
| `@capacitor/share`         | Native share sheet                                    |
| `@capacitor/status-bar`    | Status bar control                                    |
| `@capacitor/text-zoom`     | Text size accessibility                               |

### Community & Third-Party Plugins

| Plugin                               | Purpose                              |
| ------------------------------------ | ------------------------------------ |
| `@capacitor-community/keep-awake`    | Screen wake lock                     |
| `@capacitor-firebase/authentication` | Firebase auth                        |
| `@capacitor-mlkit/barcode-scanning`  | Camera barcode scanning              |
| `@capawesome-team/capacitor-nfc`     | NFC reading/writing                  |
| `@capawesome/capacitor-live-update`  | OTA live updates                     |
| `@capgo/capacitor-shake`             | Shake gesture detection              |
| `capacitor-plugin-safe-area`         | Safe area insets for notched devices |
| `capacitor-zeroconf`                 | Zeroconf/Bonjour network discovery   |

---

## Feature Availability Checks

Always check feature availability before use. Hooks handle this pattern:

- `useNfcAvailabilityCheck()` - Checks NFC support at startup
- `useCameraAvailabilityCheck()` - Checks camera/barcode scanner
- `useAccelerometerAvailabilityCheck()` - Checks shake detection

Results are cached in `preferencesStore`:

```typescript
const nfcAvailable = usePreferencesStore((state) => state.nfcAvailable);
const cameraAvailable = usePreferencesStore((state) => state.cameraAvailable);
const accelerometerAvailable = usePreferencesStore(
  (state) => state.accelerometerAvailable,
);
```

### Implementing Feature Checks

```typescript
// Example: Check if NFC is available
import { Nfc } from "@capawesome-team/capacitor-nfc";
import { Capacitor } from "@capacitor/core";

async function checkNfcAvailability(): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) {
    return false;
  }

  try {
    const { isSupported } = await Nfc.isSupported();
    if (!isSupported) return false;

    const { isEnabled } = await Nfc.isEnabled();
    return isEnabled;
  } catch {
    return false;
  }
}
```

---

## NFC Session Management

Use the `withNfcSession()` helper from `src/lib/nfc.ts` for proper cleanup:

```typescript
import { withNfcSession } from "@/lib/nfc";

// Listeners are automatically cleaned up
const result = await withNfcSession<ScanResult>(async (event) => {
  // Handle tag scan
  const tag = event.nfcTag;
  return { uid: tag.id, data: tag.message };
});
```

### Key NFC Patterns

1. **Register all listeners before starting scan** - prevents race conditions
2. **Store listener handles for cleanup** - ensures proper resource management
3. **Distinguish user cancellation from errors** - check `error.message.includes("cancelled")`
4. **Stop sessions properly** - call `Nfc.stopScanSession()`, do NOT call `removeAllListeners()`

### NFC Write Pattern

```typescript
import { Nfc, NfcTag } from "@capawesome-team/capacitor-nfc";

async function writeToTag(message: string): Promise<void> {
  // Create NDEF message
  const records = Nfc.createNdefTextRecord({ text: message });

  // Start write session
  await Nfc.startScanSession();

  try {
    // Wait for tag and write
    await new Promise<void>((resolve, reject) => {
      Nfc.addListener("nfcTagScanned", async ({ nfcTag }) => {
        try {
          await Nfc.write({ message: { records } });
          resolve();
        } catch (error) {
          reject(error);
        } finally {
          await Nfc.stopScanSession();
        }
      });

      Nfc.addListener("scanSessionCanceled", () => {
        reject(new Error("User cancelled"));
      });
    });
  } catch (error) {
    await Nfc.stopScanSession();
    throw error;
  }
}
```

---

## Haptic Feedback

Use the `useHaptics` hook for consistent haptic feedback:

```typescript
import { useHaptics } from "@/hooks/useHaptics";

function MyComponent() {
  const { impact, notification, vibrate } = useHaptics();

  const handlePress = () => {
    impact("light"); // "light" | "medium" | "heavy"
  };

  const handleSuccess = () => {
    notification("success"); // "success" | "warning" | "error"
  };

  const handleLongVibration = () => {
    vibrate(300); // duration in ms
  };
}
```

The hook:

- Respects user's haptics preference (`hapticsEnabled` in preferencesStore)
- Gracefully handles unsupported platforms
- No-ops on web

### Haptic Intent Pattern

Components use semantic `intent` props for appropriate haptic intensity:

```tsx
<Button
  intent="primary"    // Medium impact
  onClick={handleSave}
/>

<Button
  intent="destructive" // Heavy impact
  onClick={handleDelete}
/>
```

---

## Storage

### Capacitor Preferences (Recommended)

Use Capacitor Preferences instead of localStorage for native platforms:

```typescript
import { Preferences } from "@capacitor/preferences";

// Set value
await Preferences.set({
  key: "myKey",
  value: JSON.stringify(data),
});

// Get value
const { value } = await Preferences.get({ key: "myKey" });
const data = value ? JSON.parse(value) : defaultValue;

// Remove value
await Preferences.remove({ key: "myKey" });

// Clear all
await Preferences.clear();
```

### Preferences Store

For app settings, use `preferencesStore` which handles persistence automatically:

```typescript
import { usePreferencesStore } from "@/lib/preferencesStore";

// Read preference
const launchOnScan = usePreferencesStore((state) => state.launchOnScan);

// Update preference (automatically persisted)
const setLaunchOnScan = usePreferencesStore((state) => state.setLaunchOnScan);
setLaunchOnScan(true);
```

---

## Safe Area Handling

For notched devices (iPhone, Android with display cutouts):

```typescript
import { useStatusStore } from "@/lib/store";

// Get safe area insets
const safeInsets = useStatusStore((state) => state.safeInsets);

// Use in styles
<div style={{ paddingTop: safeInsets.top, paddingBottom: safeInsets.bottom }}>
  {content}
</div>
```

Safe area insets are automatically populated by `capacitor-plugin-safe-area` on app initialization.

---

## App Lifecycle

### Back Button Handling (Android)

```typescript
import { App } from "@capacitor/app";

// Register back button handler
App.addListener("backButton", ({ canGoBack }) => {
  if (canGoBack) {
    window.history.back();
  } else {
    App.exitApp();
  }
});
```

Use `useBackButtonHandler` hook for consistent handling.

### App State Changes

```typescript
import { App } from "@capacitor/app";

App.addListener("appStateChange", ({ isActive }) => {
  if (isActive) {
    // App came to foreground
    refreshData();
  } else {
    // App went to background
    pauseOperations();
  }
});
```

### Deep Links

```typescript
import { App } from "@capacitor/app";

App.addListener("appUrlOpen", ({ url }) => {
  // Handle deep link
  const path = new URL(url).pathname;
  router.navigate(path);
});
```

---

## Network Status

```typescript
import { Network } from "@capacitor/network";

// Get current status
const status = await Network.getStatus();
console.log(status.connected); // boolean
console.log(status.connectionType); // "wifi" | "cellular" | "none" | "unknown"

// Listen for changes
Network.addListener("networkStatusChange", (status) => {
  if (!status.connected) {
    showOfflineMessage();
  }
});
```

---

## Keep Awake

Prevent screen from sleeping during long operations:

```typescript
import { useKeepAwake } from "@/hooks/useKeepAwake";

function LongOperationScreen() {
  useKeepAwake(); // Screen stays on while component is mounted

  return <div>Processing...</div>;
}
```

Or manually:

```typescript
import { KeepAwake } from "@capacitor-community/keep-awake";

await KeepAwake.keepAwake();
// ... do long operation ...
await KeepAwake.allowSleep();
```

---

## Barcode Scanning

```typescript
import { BarcodeScanner } from "@capacitor-mlkit/barcode-scanning";

async function scanBarcode() {
  // Check permission
  const { camera } = await BarcodeScanner.checkPermissions();
  if (camera !== "granted") {
    await BarcodeScanner.requestPermissions();
  }

  // Scan
  const { barcodes } = await BarcodeScanner.scan();
  return barcodes[0]?.rawValue;
}
```

Use `useCameraAvailabilityCheck()` to check if barcode scanning is available.

---

## Screen Reader Detection

```typescript
import { useScreenReaderEnabled } from "@/hooks/useScreenReaderEnabled";

function AccessibleComponent() {
  const isScreenReaderEnabled = useScreenReaderEnabled();

  if (isScreenReaderEnabled) {
    // Provide alternative UI or additional descriptions
    return <AccessibleVersion />;
  }

  return <StandardVersion />;
}
```

---

## Text Zoom

Support system text size preferences:

```typescript
import { usePreferencesStore } from "@/lib/preferencesStore";

const textZoomLevel = usePreferencesStore((state) => state.textZoomLevel);
// Applied via Capacitor TextZoom plugin on native
```

Use `useTextZoom()` hook to apply text zoom settings.

---

## Testing Capacitor Plugins

Mock Capacitor plugins in tests:

```typescript
// In test file or __mocks__/
vi.mock("@capacitor/preferences", () => ({
  Preferences: {
    get: vi.fn().mockResolvedValue({ value: null }),
    set: vi.fn().mockResolvedValue(undefined),
    remove: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock("@capawesome-team/capacitor-nfc", () => ({
  Nfc: {
    isSupported: vi.fn().mockResolvedValue({ isSupported: true }),
    isEnabled: vi.fn().mockResolvedValue({ isEnabled: true }),
    startScanSession: vi.fn().mockResolvedValue(undefined),
    stopScanSession: vi.fn().mockResolvedValue(undefined),
    addListener: vi.fn().mockReturnValue({ remove: vi.fn() }),
  },
}));
```

Common mocks are provided in `src/__mocks__/`.
