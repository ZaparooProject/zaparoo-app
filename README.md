# Zaparoo App

The Zaparoo App is the primary user interface for using the [Zaparoo Core](https://github.com/ZaparooProject/zaparoo-core) service. It's a React web app built on Capacitor, which is deployed as a phone app on iOS and Android.

<a href="https://apps.apple.com/us/app/zaparoo/id6480331015"><img src="https://github.com/wizzomafizzo/mrext/assets/442478/2fa137a2-7b37-4c70-9495-960032ee8590" alt="Download iOS App" title="Download iOS App" width="140"></a>

<a href="https://play.google.com/store/apps/details?id=dev.wizzo.tapto"><img src="https://github.com/steverichey/google-play-badge-svg/raw/master/img/en_get.svg" alt="Download Android App" title="Download Android App" width="140"></a>

The Zaparoo App is released under the [GPLv3 license](./LICENSE) including its paid features. You're free to do with it what you like under the conditions of the license and trademarks, but we ask in good faith to avoid redistributing the built app with these paid features enabled, as they're used to support development of the project.

## Dependencies

- Node.js (NPM)
- Android Studio (if building for Android)
- Xcode (if building for iOS)

Plus all dependencies pulled in via NPM.

This project also depends on the Capacitor plugin [Capawesome NFC](https://capawesome.io/plugins/nfc/) which is currently released under a donationware license. Please submit an issue for a development copy of this plugin or remove it from the code after checking out.

## Build

After checking out:

- Run `npm install` to install dependencies.
- Run `npm run build && npx cap sync` to build and sync web app with mobile app code.
- Run `npx open ios` or `npx open android` to launch the appropriate mobile app IDE.

See the Capacitor [iOS](https://capacitorjs.com/docs/ios) and [Android](https://capacitorjs.com/docs/android) documentation for information about setting up your app IDE environment correctly if you have issues.

## Contribution Guidelines

The UI and UX of this app are tightly managed. If you make any major additions or changes to the UI of the app, expect them to go through a lot of scrutiny. We want people to contribute, but it's also important that the app is always kept user-friendly and accessible.

When you make additions or changes to any text in the app, be mindful those changes need to also be translated into every other language supported by the app.

### Pro Features

When you contribute to the app, you accept that the app contains some paid features (Pro features) which may include your own contributions if they overlap in functionality. If this is the case, you agree that payments to enable the Pro version will still go to the Zaparoo Project even if they include your own work. You will be notified during the Pull Request process if this may be the case.

If you're not comfortable with this arrangement or would like to avoid overlap, Pro features are strictly defined as:

- Any feature that enables the app to act as a reader. That is, any feature which triggers the `launch` Zaparoo API command namespace, excluding those which are used to preview the result of a command.
- Cosmetic features such as app icons and themes.

All other features of the Zaparoo App are free.

## Contributors

All contributors to the app will be included here and in the About page of the app itself. Contributors may also request a license key for the Pro version.

- [Tim Wilsie](https://github.com/timwilsie)
- [wizzo](https://github.com/wizzomafizzo)

### Translations

- [Anime0t4ku](https://github.com/Anime0t4ku) - Japanese/日本語
- [Phoenix](https://github.com/PhoenixFire61) - Dutch/Nederlands
- Pink Melon - Korean/한국어
- RetroCastle - Chinese (Simplified)/中文
- Seexelas - French/Français

## Trademarks

This repository contains Zaparoo trademark assets which are explicitly licensed to this project in this location by the trademark owner. These trademarks must be removed from the project or replaced if you intend to redistribute the project in any form. See the Zaparoo [Terms of Use](https://zaparoo.org/terms/) for further details.
