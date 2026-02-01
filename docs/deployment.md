# Deployment & Live Updates

This guide covers CI/CD with Capawesome Cloud and over-the-air (OTA) live updates. For quick reference, see [AGENTS.md](../AGENTS.md#live-updates--cicd).

## Live Updates

The app uses Capawesome Cloud for OTA updates, allowing JS/HTML/CSS changes to be pushed directly to users without app store review.

### How It Works

1. User opens app → syncs with Capawesome Cloud in background
2. If update available → downloads new bundle
3. User closes and reopens app → new version is active

### Configuration

Located in `capacitor.config.ts`:

```typescript
LiveUpdate: {
  appId: "your-app-id",
  autoUpdateStrategy: "background",
  defaultChannel: "production",
  readyTimeout: 10000,
  publicKey: "-----BEGIN PUBLIC KEY-----...",
}
```

### The `useLiveUpdate` Hook

Called in `App.tsx` after successful render:

- Calls `ready()` to signal the app loaded successfully
- Enables automatic rollback protection
- Syncs with update server in background

If a bad update crashes the app before `ready()` is called, the plugin automatically rolls back to the previous working version.

### Pushing a Live Update

```bash
pnpm live-update
```

This command:

1. Builds the web assets (`pnpm build:web`)
2. Signs the bundle with `live-update-private.pem`
3. Uploads to Capawesome Cloud

### Listing Deployed Updates

```bash
pnpm live-update:list
```

---

## When to Use Live Updates vs Store Release

### Live Update (instant, no review)

Use for:

- UI bug fixes
- JavaScript logic fixes
- New features using existing native plugins
- Translation updates
- Styling changes
- Route/navigation changes

### Store Release (requires app store review)

Required for:

- Adding/updating Capacitor plugins
- Native code changes (Swift/Kotlin)
- New iOS/Android permissions
- Capacitor version upgrades
- Plugin configuration changes in `capacitor.config.ts`

---

## Code Signing

Live updates are signed with a private key to prevent unauthorized code injection.

| File                      | Location                  | Purpose                    |
| ------------------------- | ------------------------- | -------------------------- |
| `live-update-private.pem` | Project root (gitignored) | Signs update bundles       |
| Public key                | `capacitor.config.ts`     | Verifies updates on device |

The app will reject any update that doesn't match the public key signature.

---

## CI/CD with Capawesome Cloud

The app uses Capawesome Cloud for building iOS and Android binaries.

### Configuration Files

- `capawesome.config.json` - Build commands and app configuration
- `.npmrc` - GitHub Packages auth for `@capawesome-team/capacitor-nfc`

### Build Process

1. Push a git tag (e.g., `v1.9.2`)
2. Capawesome Cloud detects the tag
3. Runs build commands from `capawesome.config.json`
4. Builds iOS (IPA) and Android (AAB)
5. Artifacts available for download or auto-submission to stores

### Triggering a Build

```bash
# Create and push a version tag
git tag v1.9.2
git push origin v1.9.2
```

### Required Secrets in Capawesome Cloud

| Secret                      | Purpose                                     |
| --------------------------- | ------------------------------------------- |
| `NPM_TOKEN`                 | GitHub Packages auth for private NFC plugin |
| `FIREBASE_CREDS`            | Web Firebase config (`src/firebase.json`)   |
| `GOOGLE_SERVICES_JSON`      | Android Firebase config                     |
| `GOOGLE_SERVICE_INFO_PLIST` | iOS Firebase config (base64 encoded)        |
| `VITE_GOOGLE_STORE_API`     | RevenueCat Android API key                  |
| `VITE_APPLE_STORE_API`      | RevenueCat iOS API key                      |
| `VITE_ROLLBAR_ACCESS_TOKEN` | Error tracking                              |
| `LIVE_UPDATE_PRIVATE_KEY`   | Live update bundle signing                  |

### Environment Variables in Builds

Secrets are injected as environment variables during build. Access them in code via:

```typescript
const apiKey = import.meta.env.VITE_APPLE_STORE_API;
```

---

## Build Variants

### Development Builds

```bash
pnpm build:server  # Build with dev server URL enabled
pnpm dev:server    # Start dev server mode
```

Requires `DEV_SERVER_IP` in `.env` file.

### Production Builds

```bash
pnpm build        # Full production build with Capacitor sync
pnpm build:web    # Web assets only (no Capacitor sync)
pnpm build:core   # Build for embedded Core mode
```

### Syncing with Native Projects

```bash
pnpm sync         # Sync web app with mobile platforms
npx cap open ios  # Open iOS project in Xcode
npx cap open android  # Open Android project in Android Studio
```

---

## Rollback Strategy

### Automatic Rollback

The live update plugin automatically rolls back if:

- App crashes before `ready()` is called
- Update fails to download completely
- Signature verification fails

### Manual Rollback

If a bad update gets past automatic protection:

1. Push a new live update with the fix
2. Or push a new live update with the previous version's code

There's no "rollback to previous version" command - you always push forward.

---

## Monitoring Updates

### Update Success Tracking

Monitor in Capawesome Cloud dashboard:

- Download counts
- Success/failure rates
- Active version distribution

### Error Tracking

Rollbar integration captures:

- JavaScript errors post-update
- Update-related failures
- Version information with each error

Configure in `src/lib/logger.ts` with `VITE_ROLLBAR_ACCESS_TOKEN`.
