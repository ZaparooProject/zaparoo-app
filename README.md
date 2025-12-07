# Zaparoo App

[![Tests](https://github.com/ZaparooProject/zaparoo-app/actions/workflows/test.yml/badge.svg)](https://github.com/ZaparooProject/zaparoo-app/actions/workflows/test.yml)
[![codecov](https://codecov.io/gh/ZaparooProject/zaparoo-app/graph/badge.svg)](https://codecov.io/gh/ZaparooProject/zaparoo-app)
[![License: GPL v3](https://img.shields.io/badge/License-GPLv3-blue.svg)](https://www.gnu.org/licenses/gpl-3.0)

Zaparoo App is the primary user interface for the [Zaparoo Core](https://github.com/ZaparooProject/zaparoo-core) service. It's a React web app built on Capacitor, which is deployed as a phone app on iOS/Android and embedded in Zaparoo Core as a web interface.

<a href="https://apps.apple.com/us/app/zaparoo/id6480331015"><img src="assets/app-store-badge.png" alt="Download iOS App" title="Download iOS App" height="40"></a>&nbsp;&nbsp;<a href="https://play.google.com/store/apps/details?id=dev.wizzo.tapto"><img src="assets/google-play-badge.png" alt="Download Android App" title="Download Android App" height="40"></a>

Zaparoo App is released under the [GPLv3 license](./LICENSE) including its paid features. You're free to do with it what you like under the conditions of the license and trademarks, but we ask in good faith to avoid redistributing the built app with these paid features enabled, as they're used to support development of the project.

## Dependencies

- [Node.js](https://nodejs.org/)
- [pnpm](https://pnpm.io/)
- Android Studio (if building for Android)
- Xcode (if building for iOS)

This project also depends on the Capacitor plugin [Capawesome NFC](https://capawesome.io/plugins/nfc/) which requires a license. Please contact [wizzo](https://github.com/wizzomafizzo) for a development copy of this plugin or remove it from the code after checking out.

## Development

After checking out, run `pnpm install` to install dependencies.

Optionally, copy `src/firebase.json.example` to `src/firebase.json` and fill in your Firebase config to enable auth features. The app will build and run without it.

| Command              | Description                                       |
| -------------------- | ------------------------------------------------- |
| `pnpm dev`           | Start development server                          |
| `pnpm build`         | Production build and sync with mobile platforms   |
| `pnpm build:web`     | Production build for web only (no Capacitor sync) |
| `pnpm build:core`    | Build for embedding in Zaparoo Core web interface |
| `pnpm sync`          | Sync web build with mobile platforms              |
| `pnpm test`          | Run tests                                         |
| `pnpm test:coverage` | Run tests with coverage report                    |
| `pnpm lint`          | Run ESLint                                        |
| `pnpm typecheck`     | Run TypeScript type checking                      |

To build and run on a mobile device:

1. Run `pnpm build` to build the web app and sync with mobile app code.
2. Run `pnpm cap open ios` or `pnpm cap open android` to launch the appropriate mobile app IDE.

See the Capacitor [iOS](https://capacitorjs.com/docs/ios) and [Android](https://capacitorjs.com/docs/android) documentation for information about setting up your app IDE environment correctly if you have issues.

## Contribution Guidelines

The UI and UX of this app are tightly managed. If you make any major additions or changes to the UI of the app, expect them to go through a lot of scrutiny. We want people to contribute, but it's also important that the app is always kept user-friendly and accessible.

When you make additions or changes to any text in the app, be mindful those changes need to also be translated into every other language supported by the app.

### Pro Features

When you contribute to the app, you accept that the app contains some paid features (Pro features) which may include your own contributions if they overlap in functionality. If this is the case, you agree that payments to enable the Pro version will still go to the Zaparoo Project even if they include your own work. You will be notified during the Pull Request process if this may be the case.

If you're not comfortable with this arrangement or would like to avoid overlap, Pro features are strictly defined as:

- Any feature that enables the app to act as a reader. That is, any feature which triggers the `run` Zaparoo API command namespace, excluding those which are used to preview the result of a command.
- Cosmetic features such as app icons and themes.

All other features of the Zaparoo App are free.

## Contributors

All contributors to the app will be included here and in the About page of the app itself. Contributors may also request a license key for the Pro version.

- [Tim Wilsie](https://github.com/timwilsie)
- [wizzo](https://github.com/wizzomafizzo)

### Translations

- RetroCastle - Chinese (Simplified)/中文
- [Anime0t4ku](https://github.com/Anime0t4ku) - Dutch/Nederlands, Japanese/日本語
- [Phoenix](https://github.com/PhoenixFire61) - Dutch/Nederlands
- Seexelas - French/Français
- Ze Conehead - German/Deutsch
- Pink Melon - Korean/한국어

Translation files are located in `src/translations/` as JSON files. To add or update a translation, copy `en-US.json` as a starting point and translate the values. The filename should use the BCP 47 locale format (e.g. `de-DE.json` for German, `ja-JP.json` for Japanese).

## Trademarks

This repository contains Zaparoo trademark assets which are explicitly licensed to this project in this location by the trademark owner. These trademarks must be removed from the project or replaced if you intend to redistribute the project in any form. See the Zaparoo [Terms of Use](https://zaparoo.org/terms/) for further details.
