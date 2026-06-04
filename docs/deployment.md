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
VITE_RELEASE_KEY="live:1.11.0-ota.1" npm run live-update
```

This command:

1. Requires `VITE_RELEASE_KEY` so the app can identify the applied web bundle for the “What’s new” dialog
2. Builds the web assets (`npm run build:web`)
3. Signs the bundle with `live-update-private.pem`
4. Uploads to Capawesome Cloud with `releaseKey` as a custom property

### Listing Deployed Updates

```bash
npm run live-update:list
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

### Store Release Checklist

1. Choose the release version and next store build number.
2. Bump version files in lockstep:
   - `package.json` (`version`)
   - `package-lock.json` (top-level and root package `version`)
   - `android/app/build.gradle` (`versionCode`, `versionName`)
   - `ios/App/App.xcodeproj/project.pbxproj` (`MARKETING_VERSION`; `CURRENT_PROJECT_VERSION` if the iOS build number changes)
3. Confirm `src/lib/whatsNew.ts` has announcement `releaseKeys` for the native version/build, e.g. `native:1.11.0+25` and `native:1.11.0+1`.
4. Check About page credits in `src/routes/settings.about.tsx`:
   - translation credits
   - active Patreon CSV export names
   - Patreon tier coloring (`#F1C40D` Supporter/Sponsor, `#E74C3C` Mega Supporter, `#E91E63` Ultra Supporter)
5. Run validation:
   - `npm run typecheck`
   - `npm run format:check`
   - `npm run lint`
   - `npm run test -- --run`
6. Optionally run `npm run build:web` for a web-only production build. Run `npm run build` only when ready for Capacitor sync/native file updates.
7. Commit the release prep changes.
8. Create and push the version tag:

   ```bash
   git tag v1.11.0
   git push origin v1.11.0
   ```

9. Confirm GitHub release artifacts and Capawesome Cloud iOS/Android builds complete.
10. Submit/release from App Store Connect and Google Play Console.

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

- `capawesome.config.json` — Build commands and app configuration. It injects GitHub Packages auth via `NPM_TOKEN`.

### Build Process

1. Push a git tag (e.g., `v1.9.2`)
2. Capawesome Cloud detects the tag
3. Runs build commands from `capawesome.config.json`
4. Builds iOS (IPA) and Android (AAB)
5. Artifacts available for download or auto-submission to stores

### Triggering a Build

```bash
# Create and push a version tag
git tag v1.11.0
git push origin v1.11.0
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
npm run build:server  # Build with dev server URL enabled
npm run dev:server    # Start dev server mode
```

Requires `DEV_SERVER_IP` in `.env` file.

### Production Builds

```bash
npm run build        # Full production build with Capacitor sync
npm run build:web    # Web assets only (no Capacitor sync)
npm run build:core   # Build for embedded Core mode
```

### Syncing with Native Projects

```bash
npm run sync         # Sync web app with mobile platforms
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
